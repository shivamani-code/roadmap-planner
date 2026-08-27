import {
  createEmbeddedDatabase,
  createPostgresClient,
  applyEmbeddedMigrations,
  type DatabaseClient,
} from "@studentos/database";
import { createLogger } from "@studentos/observability";
import { z } from "zod";
import { OutboxProcessor, type OutboxHandler } from "./outbox-processor.js";
import {
  NotificationScheduler,
  type EmailProvider,
} from "./notification-scheduler.js";
import { AiExplanationHandler } from "./ai-explanation-handler.js";
import type { AiProvider } from "@studentos/communication";
import { DataLifecycleService } from "./data-lifecycle.js";

const config = z
  .object({
    DATABASE_MODE: z.enum(["postgres", "pglite"]).default("postgres"),
    DATABASE_URL: z
      .string()
      .min(1)
      .default(
        "postgresql://studentos:studentos@localhost:5432/studentos?schema=public",
      ),
    DATABASE_DIR: z.string().min(1).default("memory://"),
    OUTBOX_POLL_MS: z.coerce.number().int().min(250).max(60_000).default(1000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    NOTIFICATION_SWEEP_MS: z.coerce
      .number()
      .int()
      .min(10_000)
      .max(3_600_000)
      .default(60_000),
    LIFECYCLE_SWEEP_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(86_400_000)
      .default(21_600_000),
    EMAIL_GATEWAY_URL: z.url().optional(),
    EMAIL_GATEWAY_TOKEN: z.string().min(16).optional(),
    AI_GATEWAY_URL: z.url().optional(),
    AI_GATEWAY_TOKEN: z.string().min(16).optional(),
    AI_PROVIDER_NAME: z.string().min(1).max(64).default("configured-gateway"),
    AI_MODEL: z.string().min(1).max(128).default("configured-model"),
  })
  .superRefine((value, context) => {
    for (const [urlKey, tokenKey] of [
      ["AI_GATEWAY_URL", "AI_GATEWAY_TOKEN"],
      ["EMAIL_GATEWAY_URL", "EMAIL_GATEWAY_TOKEN"],
    ] as const)
      if (Boolean(value[urlKey]) !== Boolean(value[tokenKey]))
        context.addIssue({
          code: "custom",
          path: [urlKey],
          message: `${urlKey} and ${tokenKey} must be configured together`,
        });
  })
  .parse(process.env);

const logger = createLogger({
  service: "worker",
  environment: process.env.NODE_ENV ?? "development",
  level: config.LOG_LEVEL,
});

async function bootstrap(): Promise<void> {
  let client: DatabaseClient;
  let close: () => Promise<void>;
  if (config.DATABASE_MODE === "pglite") {
    const embedded = await createEmbeddedDatabase(config.DATABASE_DIR);
    await applyEmbeddedMigrations(embedded.pglite);
    client = embedded.prisma;
    close = () => embedded.close();
  } else {
    client = createPostgresClient(config.DATABASE_URL);
    close = () => client.$disconnect();
  }

  const logOnlyHandler: OutboxHandler = {
    handle(event) {
      logger.info(
        { eventId: event.id, eventType: event.eventType },
        "outbox event handled",
      );
      return Promise.resolve();
    },
  };
  const aiProvider: AiProvider | undefined =
    config.AI_GATEWAY_URL && config.AI_GATEWAY_TOKEN
      ? {
          async generate(request) {
            const response = await fetch(config.AI_GATEWAY_URL!, {
              method: "POST",
              headers: {
                authorization: `Bearer ${config.AI_GATEWAY_TOKEN!}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({ model: config.AI_MODEL, ...request }),
            });
            if (!response.ok)
              throw new Error(`AI gateway returned ${response.status}`);
            const body = (await response.json()) as {
              output?: unknown;
              inputTokens?: number;
              outputTokens?: number;
            };
            if (body.output === undefined)
              throw new Error("AI gateway omitted output");
            return {
              provider: config.AI_PROVIDER_NAME,
              model: config.AI_MODEL,
              output: body.output,
              ...(body.inputTokens === undefined
                ? {}
                : { inputTokens: body.inputTokens }),
              ...(body.outputTokens === undefined
                ? {}
                : { outputTokens: body.outputTokens }),
            };
          },
        }
      : undefined;
  const handlers = new Map<string, OutboxHandler>([
    ["identity.user-created.v1", logOnlyHandler],
  ]);
  if (aiProvider)
    handlers.set(
      "communication.ai-explanation-requested.v1",
      new AiExplanationHandler(client, aiProvider),
    );
  const processor = new OutboxProcessor(client, handlers, {
    defaultHandler: logOnlyHandler,
  });
  const scheduler = new NotificationScheduler(client);
  const lifecycle = new DataLifecycleService(client);
  const emailProvider: EmailProvider | undefined =
    config.EMAIL_GATEWAY_URL && config.EMAIL_GATEWAY_TOKEN
      ? {
          async send(input) {
            const response = await fetch(config.EMAIL_GATEWAY_URL!, {
              method: "POST",
              headers: {
                authorization: `Bearer ${config.EMAIL_GATEWAY_TOKEN!}`,
                "content-type": "application/json",
              },
              body: JSON.stringify(input),
            });
            if (!response.ok)
              throw new Error(`Email gateway returned ${response.status}`);
            const body = (await response.json()) as { messageId?: string };
            if (!body.messageId)
              throw new Error("Email gateway omitted message ID");
            return { messageId: body.messageId };
          },
        }
      : undefined;
  let lastNotificationSweep = 0;
  let lastLifecycleSweep = 0;
  let stopping = false;
  const stop = (): void => {
    stopping = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  while (!stopping) {
    const result = await processor.runBatch();
    if (result.processed + result.failed + result.retried > 0)
      logger.info(result, "outbox batch complete");
    if (Date.now() - lastNotificationSweep >= config.NOTIFICATION_SWEEP_MS) {
      const generated = await scheduler.generateBatch();
      const delivered = await scheduler.deliverEmailBatch(emailProvider);
      if (
        Object.values(generated).some((value) => value > 0) ||
        Object.values(delivered).some((value) => value > 0)
      )
        logger.info({ generated, delivered }, "notification sweep complete");
      lastNotificationSweep = Date.now();
    }
    if (Date.now() - lastLifecycleSweep >= config.LIFECYCLE_SWEEP_MS) {
      const lifecycleResult = await lifecycle.runSweep();
      if (Object.values(lifecycleResult).some((value) => value > 0))
        logger.info(lifecycleResult, "data lifecycle sweep complete");
      lastLifecycleSweep = Date.now();
    }
    await new Promise<void>((resolve) =>
      setTimeout(resolve, config.OUTBOX_POLL_MS),
    );
  }
  await close();
}

void bootstrap().catch((error: unknown) => {
  logger.fatal(
    { error: error instanceof Error ? error.message : "unknown" },
    "worker failed",
  );
  process.exitCode = 1;
});

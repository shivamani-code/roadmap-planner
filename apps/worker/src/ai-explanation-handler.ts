import {
  communicationInputHash,
  runAiGateway,
  validateGroundedExplanation,
  type AiProvider,
  type AiUseCase,
  type GroundedExplanation,
} from "@studentos/communication";
import type { DatabaseClient, OutboxEvent, Prisma } from "@studentos/database";
import { uuidV7 } from "@studentos/domain";
import type { OutboxHandler } from "./outbox-processor.js";

const DAY_MS = 86_400_000;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parsePayload(payload: unknown): {
  userId: string;
  useCase: AiUseCase;
  promptVersion: string;
  facts: Record<string, unknown>;
  allowedIds: string[];
  fallback: GroundedExplanation;
  inputHash: string;
} {
  const value = record(payload);
  const useCase = value?.useCase;
  const allowedIds = value?.allowedIds;
  const fallbackValidation = validateGroundedExplanation(
    value?.fallback,
    Array.isArray(allowedIds)
      ? allowedIds.filter((item): item is string => typeof item === "string")
      : [],
  );
  if (
    !value ||
    typeof value.userId !== "string" ||
    !["ROADMAP_EXPLANATION", "WEEKLY_COACHING"].includes(String(useCase)) ||
    typeof value.promptVersion !== "string" ||
    !record(value.facts) ||
    !Array.isArray(allowedIds) ||
    allowedIds.some((item) => typeof item !== "string") ||
    !fallbackValidation.valid ||
    typeof value.inputHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.inputHash)
  )
    throw new Error("Invalid AI explanation job payload");
  return {
    userId: value.userId,
    useCase: useCase as AiUseCase,
    promptVersion: value.promptVersion,
    facts: record(value.facts)!,
    allowedIds: allowedIds as string[],
    fallback: fallbackValidation.value,
    inputHash: value.inputHash,
  };
}

export class AiExplanationHandler implements OutboxHandler {
  constructor(
    private readonly database: DatabaseClient,
    private readonly provider: AiProvider,
  ) {}

  async handle(event: OutboxEvent): Promise<void> {
    const input = parsePayload(event.payload);
    const user = await this.database.user.findFirst({
      where: { id: input.userId, status: "ACTIVE" },
      include: { communicationPreference: true },
    });
    if (!user?.communicationPreference?.aiProcessingConsent) return;
    const result = await runAiGateway({
      useCase: input.useCase,
      promptVersion: input.promptVersion,
      facts: input.facts,
      allowedIds: input.allowedIds,
      fallback: input.fallback,
      provider: this.provider,
    });
    if (
      result.fallbackReason === "PROVIDER_ERROR" ||
      result.fallbackReason === "PROVIDER_TIMEOUT"
    )
      throw new Error(result.fallbackReason);
    if (result.inputHash !== input.inputHash)
      throw new Error("AI explanation input hash changed in transit");
    await this.database.$transaction([
      this.database.aiExplanationCache.upsert({
        where: {
          userId_useCase_inputHash_promptVersion: {
            userId: input.userId,
            useCase: input.useCase,
            inputHash: input.inputHash,
            promptVersion: input.promptVersion,
          },
        },
        create: {
          id: uuidV7(),
          userId: input.userId,
          useCase: input.useCase,
          inputHash: input.inputHash,
          promptVersion: input.promptVersion,
          source: result.source,
          provider: result.provider,
          model: result.model,
          content: jsonValue(result.explanation),
          expiresAt: new Date(Date.now() + DAY_MS),
        },
        update: {
          source: result.source,
          provider: result.provider,
          model: result.model,
          content: jsonValue(result.explanation),
          expiresAt: new Date(Date.now() + DAY_MS),
        },
      }),
      this.database.aiRequestAudit.create({
        data: {
          id: uuidV7(),
          userId: input.userId,
          useCase: input.useCase,
          inputHash: input.inputHash,
          promptVersion: input.promptVersion,
          source: result.source,
          provider: result.provider,
          model: result.model,
          latencyMs: result.latencyMs,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          allowedIdCount: input.allowedIds.length,
          sentFields: jsonValue(Object.keys(result.minimizedFacts).sort()),
          outputHash: communicationInputHash(result.explanation),
          fallbackReason: result.fallbackReason,
        },
      }),
    ]);
  }
}

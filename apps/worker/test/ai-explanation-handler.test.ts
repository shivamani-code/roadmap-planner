import {
  communicationInputHash,
  minimizeAiFacts,
  type AiProvider,
} from "@studentos/communication";
import {
  applyEmbeddedMigrations,
  createEmbeddedDatabase,
  type EmbeddedDatabase,
  type Prisma,
} from "@studentos/database";
import { uuidV7 } from "@studentos/domain";
import { afterEach, describe, expect, it } from "vitest";
import { AiExplanationHandler } from "../src/ai-explanation-handler.js";
import { OutboxProcessor } from "../src/outbox-processor.js";

let database: EmbeddedDatabase | undefined;

afterEach(async () => {
  await database?.close();
  database = undefined;
});

describe("AI explanation outbox handler", () => {
  it("persists validated wording and retries provider outages", async () => {
    database = await createEmbeddedDatabase();
    await applyEmbeddedMigrations(database.pglite);
    const userId = uuidV7();
    await database.prisma.user.create({
      data: {
        id: userId,
        email: "ai-worker@example.com",
        normalizedEmail: "ai-worker@example.com",
      },
    });
    await database.prisma.communicationPreference.create({
      data: { userId, aiProcessingConsent: true, aiConsentAt: new Date() },
    });
    const promptVersion = "roadmap-explanation-1.0.0";
    const useCase = "ROADMAP_EXPLANATION" as const;
    const facts = minimizeAiFacts({
      userRef: "pseudonymous",
      email: "must-not-survive@example.com",
      milestones: [{ id: "milestone-safe", title: "Reviewed milestone" }],
    });
    const allowedIds = ["milestone-safe"];
    const inputHash = communicationInputHash({
      useCase,
      promptVersion,
      facts,
      allowedIds,
    });
    const fallback = {
      headline: "Keep the reviewed focus",
      summary: "The deterministic roadmap remains available during an outage.",
      focusItems: [
        { id: "milestone-safe", text: "Continue this reviewed milestone." },
      ],
    };
    const createEvent = async (aggregateId: string) =>
      database!.prisma.outboxEvent.create({
        data: {
          id: uuidV7(),
          aggregateType: "AiExplanation",
          aggregateId,
          eventType: "communication.ai-explanation-requested.v1",
          payload: JSON.parse(
            JSON.stringify({
              userId,
              useCase,
              promptVersion,
              facts,
              allowedIds,
              fallback,
              inputHash,
            }),
          ) as Prisma.InputJsonValue,
        },
      });
    await createEvent(inputHash);
    const validProvider: AiProvider = {
      generate: () =>
        Promise.resolve({
          provider: "fixture",
          model: "fixture-model",
          output: {
            headline: "Keep the reviewed focus",
            summary:
              "Your supplied roadmap facts support a focused next action.",
            focusItems: [
              {
                id: "milestone-safe",
                text: "Continue this reviewed milestone.",
              },
            ],
          },
        }),
    };
    const processor = new OutboxProcessor(
      database.prisma,
      new Map([
        [
          "communication.ai-explanation-requested.v1",
          new AiExplanationHandler(database.prisma, validProvider),
        ],
      ]),
    );
    expect(await processor.runBatch()).toEqual({
      processed: 1,
      retried: 0,
      failed: 0,
    });
    expect(
      await database.prisma.aiExplanationCache.findFirstOrThrow({
        where: { userId, inputHash },
      }),
    ).toMatchObject({
      source: "GENERATED",
      provider: "fixture",
      model: "fixture-model",
    });
    const audit = await database.prisma.aiRequestAudit.findFirstOrThrow({
      where: { userId, inputHash, source: "GENERATED" },
    });
    expect(audit.sentFields).toEqual(["milestones", "userRef"]);
    expect(JSON.stringify(audit)).not.toContain("must-not-survive@example.com");

    const failedEvent = await createEvent(`${inputHash}:retry`);
    const unavailableProvider: AiProvider = {
      generate: () => Promise.reject(new Error("provider unavailable")),
    };
    const retryingProcessor = new OutboxProcessor(
      database.prisma,
      new Map([
        [
          "communication.ai-explanation-requested.v1",
          new AiExplanationHandler(database.prisma, unavailableProvider),
        ],
      ]),
    );
    expect(await retryingProcessor.runBatch()).toEqual({
      processed: 0,
      retried: 1,
      failed: 0,
    });
    expect(
      await database.prisma.outboxEvent.findUniqueOrThrow({
        where: { id: failedEvent.id },
      }),
    ).toMatchObject({ status: "PENDING", lastError: "PROVIDER_ERROR" });
  });
});

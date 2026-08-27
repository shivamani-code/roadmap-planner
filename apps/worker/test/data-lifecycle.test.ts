import {
  applyEmbeddedMigrations,
  createEmbeddedDatabase,
  type EmbeddedDatabase,
} from "@studentos/database";
import { uuidV7 } from "@studentos/domain";
import { afterEach, describe, expect, it } from "vitest";
import { DataLifecycleService } from "../src/data-lifecycle.js";

let database: EmbeddedDatabase | undefined;

afterEach(async () => {
  await database?.close();
  database = undefined;
});

describe("data lifecycle", () => {
  it("enforces retention and purges deletion-pending accounts after 30 days", async () => {
    database = await createEmbeddedDatabase();
    await applyEmbeddedMigrations(database.pglite);
    const now = new Date("2026-10-01T00:00:00.000Z");
    const activeUserId = uuidV7();
    const deletedUserId = uuidV7();
    const restoredUserId = uuidV7();
    await database.prisma.user.createMany({
      data: [
        {
          id: activeUserId,
          email: "retention-active@example.com",
          normalizedEmail: "retention-active@example.com",
        },
        {
          id: deletedUserId,
          email: "purge-me@example.com",
          normalizedEmail: "purge-me@example.com",
          status: "DELETION_PENDING",
          deletedAt: new Date("2026-08-01T00:00:00.000Z"),
        },
        {
          id: restoredUserId,
          email: "restored-after-delete@example.com",
          normalizedEmail: "restored-after-delete@example.com",
        },
      ],
    });
    await database.prisma.communicationPreference.create({
      data: { userId: deletedUserId, analyticsConsent: true },
    });
    await database.prisma.accountDeletionTombstone.createMany({
      data: [
        {
          userId: deletedUserId,
          status: "PENDING",
          requestedAt: new Date("2026-08-01T00:00:00.000Z"),
          purgeAfter: new Date("2026-08-31T00:00:00.000Z"),
          requestId: uuidV7(),
        },
        {
          userId: restoredUserId,
          status: "PENDING",
          requestedAt: new Date("2026-09-15T00:00:00.000Z"),
          purgeAfter: new Date("2026-10-15T00:00:00.000Z"),
          requestId: uuidV7(),
        },
      ],
    });
    await database.prisma.pilotFeedback.create({
      data: {
        id: uuidV7(),
        userId: deletedUserId,
        surface: "OVERALL",
        rating: 4,
      },
    });
    await database.prisma.aiExplanationCache.create({
      data: {
        id: uuidV7(),
        userId: activeUserId,
        useCase: "ROADMAP_EXPLANATION",
        inputHash: "1".repeat(64),
        promptVersion: "test-1",
        source: "FALLBACK",
        provider: "deterministic",
        model: "template",
        content: {},
        expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      },
    });
    await database.prisma.aiRequestAudit.create({
      data: {
        id: uuidV7(),
        userId: activeUserId,
        useCase: "ROADMAP_EXPLANATION",
        inputHash: "2".repeat(64),
        promptVersion: "test-1",
        source: "FALLBACK",
        provider: "deterministic",
        model: "template",
        latencyMs: 0,
        allowedIdCount: 0,
        sentFields: [],
        outputHash: "3".repeat(64),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    });
    await database.prisma.notificationIntent.create({
      data: {
        id: uuidV7(),
        userId: activeUserId,
        type: "TODAY_PLAN",
        dedupeKey: "old-notification",
        title: "Old",
        body: "Expired by retention",
        actionUrl: "/today",
        stateHash: "4".repeat(64),
        scheduledFor: new Date("2026-07-01T00:00:00.000Z"),
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    });
    await database.prisma.verificationToken.create({
      data: {
        id: uuidV7(),
        normalizedEmail: "expired@example.com",
        tokenHash: "5".repeat(64),
        purpose: "SIGN_IN",
        expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      },
    });
    await database.prisma.session.create({
      data: {
        id: uuidV7(),
        userId: activeUserId,
        tokenHash: "6".repeat(64),
        expiresAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    });
    await database.prisma.auditLog.createMany({
      data: [
        {
          id: uuidV7(),
          actorType: "SYSTEM",
          action: "expired.audit",
          targetType: "System",
          targetId: "system",
          requestId: uuidV7(),
          createdAt: new Date("2025-09-01T00:00:00.000Z"),
        },
        {
          id: uuidV7(),
          actorType: "USER",
          actorId: deletedUserId,
          action: "privacy.account-deletion.requested",
          targetType: "User",
          targetId: deletedUserId,
          requestId: uuidV7(),
          createdAt: new Date("2026-08-01T00:00:00.000Z"),
        },
      ],
    });
    await database.prisma.outboxEvent.create({
      data: {
        id: uuidV7(),
        aggregateType: "User",
        aggregateId: deletedUserId,
        eventType: "identity.user-created.v1",
        payload: {},
      },
    });

    const result = await new DataLifecycleService(
      database.prisma,
      () => now,
    ).runSweep();
    expect(result).toEqual({
      expiredAiCache: 1,
      expiredAiAudits: 1,
      expiredNotifications: 1,
      expiredVerificationTokens: 1,
      expiredSessions: 1,
      expiredAudits: 1,
      reappliedTombstones: 1,
      purgedAccounts: 1,
    });
    expect(
      await database.prisma.user.findUnique({ where: { id: deletedUserId } }),
    ).toBeNull();
    expect(
      await database.prisma.user.findUnique({ where: { id: activeUserId } }),
    ).not.toBeNull();
    expect(
      await database.prisma.user.findUniqueOrThrow({
        where: { id: restoredUserId },
      }),
    ).toMatchObject({ status: "DELETION_PENDING" });
    expect(
      await database.prisma.outboxEvent.count({
        where: { aggregateId: deletedUserId },
      }),
    ).toBe(0);
    const retainedAudit = await database.prisma.auditLog.findFirstOrThrow({
      where: { action: "privacy.account-deletion.requested" },
    });
    expect(retainedAudit.actorId).toBeNull();
    expect(retainedAudit.targetId).toMatch(/^purged:/);
    expect(retainedAudit.targetId).not.toContain(deletedUserId);
    expect(
      await database.prisma.accountDeletionTombstone.findUniqueOrThrow({
        where: { userId: deletedUserId },
      }),
    ).toMatchObject({ status: "PURGED" });
  });
});

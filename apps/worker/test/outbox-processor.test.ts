import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEmbeddedDatabase,
  type EmbeddedDatabase,
} from "@studentos/database";
import { uuidV7 } from "@studentos/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OutboxProcessor } from "../src/outbox-processor.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.resolve(
    here,
    "../../../packages/database/prisma/migrations/0001_platform_foundation/migration.sql",
  ),
  "utf8",
);
let database: EmbeddedDatabase | undefined;

afterEach(async () => {
  await database?.close();
  database = undefined;
});

describe("outbox processor", () => {
  it("claims and processes an event once", async () => {
    database = await createEmbeddedDatabase();
    await database.migrate(migration);
    const id = uuidV7();
    await database.prisma.outboxEvent.create({
      data: {
        id,
        aggregateType: "User",
        aggregateId: uuidV7(),
        eventType: "identity.user-created.v1",
        payload: {},
      },
    });
    const handle = vi.fn(() => Promise.resolve());
    const processor = new OutboxProcessor(
      database.prisma,
      new Map([["identity.user-created.v1", { handle }]]),
    );
    expect(await processor.runBatch()).toEqual({
      processed: 1,
      retried: 0,
      failed: 0,
    });
    expect(await processor.runBatch()).toEqual({
      processed: 0,
      retried: 0,
      failed: 0,
    });
    expect(handle).toHaveBeenCalledOnce();
    expect(
      (await database.prisma.outboxEvent.findUniqueOrThrow({ where: { id } }))
        .status,
    ).toBe("PROCESSED");
  });

  it("backs off a failed handler without losing the event", async () => {
    database = await createEmbeddedDatabase();
    await database.migrate(migration);
    const id = uuidV7();
    const now = new Date("2026-08-24T12:00:00.000Z");
    await database.prisma.outboxEvent.create({
      data: {
        id,
        aggregateType: "User",
        aggregateId: uuidV7(),
        eventType: "identity.user-created.v1",
        payload: {},
        availableAt: now,
      },
    });
    const processor = new OutboxProcessor(
      database.prisma,
      new Map([
        [
          "identity.user-created.v1",
          {
            handle: async () =>
              Promise.reject(new Error("provider unavailable")),
          },
        ],
      ]),
      { now: () => now },
    );
    expect(await processor.runBatch()).toEqual({
      processed: 0,
      retried: 1,
      failed: 0,
    });
    const event = await database.prisma.outboxEvent.findUniqueOrThrow({
      where: { id },
    });
    expect(event.status).toBe("PENDING");
    expect(event.lastError).toBe("provider unavailable");
    expect(event.availableAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it("acknowledges known domain events through the observable default sink", async () => {
    database = await createEmbeddedDatabase();
    await database.migrate(migration);
    const handle = vi.fn(() => Promise.resolve());
    await database.prisma.outboxEvent.create({
      data: {
        id: uuidV7(),
        aggregateType: "RoadmapRevision",
        aggregateId: uuidV7(),
        eventType: "roadmap.activated.v1",
        payload: {},
      },
    });
    const processor = new OutboxProcessor(database.prisma, new Map(), {
      defaultHandler: { handle },
    });
    expect(await processor.runBatch()).toEqual({
      processed: 1,
      retried: 0,
      failed: 0,
    });
    expect(handle).toHaveBeenCalledOnce();
  });
});

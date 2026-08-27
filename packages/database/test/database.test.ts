import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createDomainEvent, normalizeEmail, uuidV7 } from "@studentos/domain";
import {
  applyEmbeddedMigrations,
  createEmbeddedDatabase,
  enqueueOutboxEvent,
  readMigrations,
  type EmbeddedDatabase,
} from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.resolve(
    here,
    "../prisma/migrations/0001_platform_foundation/migration.sql",
  ),
  "utf8",
);
let database: EmbeddedDatabase | undefined;

afterEach(async () => {
  await database?.close();
  database = undefined;
});

describe("PostgreSQL foundation", () => {
  it("applies the production migration to embedded Postgres and persists identity", async () => {
    database = await createEmbeddedDatabase();
    await database.migrate(migration);
    const email = normalizeEmail("Student@Example.com");
    const user = await database.prisma.user.create({
      data: {
        id: uuidV7(),
        email,
        normalizedEmail: email,
        displayName: "Student",
      },
    });
    expect(
      (await database.prisma.user.findUnique({ where: { id: user.id } }))
        ?.email,
    ).toBe(email);
  });

  it("stores an outbox event through the same database boundary", async () => {
    database = await createEmbeddedDatabase();
    await database.migrate(migration);
    const aggregateId = uuidV7();
    await enqueueOutboxEvent(
      database.prisma,
      createDomainEvent({
        aggregateType: "User",
        aggregateId,
        type: "identity.user-created.v1",
        payload: { source: "test" },
      }),
    );
    const event = await database.prisma.outboxEvent.findFirstOrThrow();
    expect(event.aggregateId).toBe(aggregateId);
    expect(event.status).toBe("PENDING");
  });

  it("enforces unique normalized email at the database layer", async () => {
    database = await createEmbeddedDatabase();
    await database.migrate(migration);
    const normalizedEmail = "student@example.com";
    await database.prisma.user.create({
      data: { id: uuidV7(), email: normalizedEmail, normalizedEmail },
    });
    await expect(
      database.prisma.user.create({
        data: { id: uuidV7(), email: "STUDENT@example.com", normalizedEmail },
      }),
    ).rejects.toThrow();
  });

  it("applies the ordered migration set idempotently", async () => {
    database = await createEmbeddedDatabase();
    await applyEmbeddedMigrations(database.pglite);
    await applyEmbeddedMigrations(database.pglite);
    const result = await database.pglite.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM public._studentos_migrations",
    );
    expect(Number(result.rows[0]?.count)).toBe(readMigrations().length);
  }, 30_000);
});

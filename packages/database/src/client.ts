import { PGlite } from "@electric-sql/pglite";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "./generated/client.js";

export type DatabaseClient = PrismaClient;

export function createPostgresClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString }, { schema: "public" });
  return new PrismaClient({ adapter });
}

export interface EmbeddedDatabase {
  readonly prisma: PrismaClient;
  readonly pglite: PGlite;
  migrate(sql: string): Promise<void>;
  close(): Promise<void>;
}

export async function createEmbeddedDatabase(
  dataDir = "memory://",
): Promise<EmbeddedDatabase> {
  const pglite = new PGlite(dataDir);
  await pglite.waitReady;
  const adapter = new PrismaPGlite(pglite);
  const prisma = new PrismaClient({ adapter });
  return {
    prisma,
    pglite,
    async migrate(sql: string) {
      await pglite.exec(sql);
    },
    async close() {
      await prisma.$disconnect();
      await pglite.close();
    },
  };
}

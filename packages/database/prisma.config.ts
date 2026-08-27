import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join(import.meta.dirname, "prisma", "schema.prisma"),
  migrations: { path: path.join(import.meta.dirname, "prisma", "migrations") },
  datasource: {
    url:
      process.env["DATABASE_URL"] ??
      "postgresql://studentos:studentos@localhost:5432/studentos?schema=public",
  },
});

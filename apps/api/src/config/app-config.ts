import { z } from "zod";

const booleanFromEnvironment = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const configSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    ADMIN_ORIGIN: z.url().default("http://localhost:3001"),
    DATABASE_URL: z
      .string()
      .min(1)
      .default(
        "postgresql://studentos:studentos@localhost:5432/studentos?schema=public",
      ),
    DATABASE_MODE: z.enum(["postgres", "pglite"]).default("postgres"),
    DATABASE_DIR: z.string().min(1).default("memory://"),
    SESSION_SECRET: z
      .string()
      .min(32)
      .default("development-only-session-secret-change-me"),
    AUTH_MODE: z.enum(["development", "email"]).default("development"),
    ALLOW_DEV_AUTH: booleanFromEnvironment,
    DEV_CONTENT_EDITOR_EMAIL: z.email().optional(),
    DEV_CONTENT_REVIEWER_EMAIL: z.email().optional(),
    PUBLIC_WEB_URL: z.url().default("http://localhost:3000"),
    EMAIL_GATEWAY_URL: z.url().optional(),
    EMAIL_GATEWAY_TOKEN: z.string().min(16).optional(),
    CSRF_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    RATE_LIMIT_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(2).default(0),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    AI_GATEWAY_URL: z.url().optional(),
    AI_GATEWAY_TOKEN: z.string().min(16).optional(),
    AI_PROVIDER_NAME: z.string().min(1).max(64).default("configured-gateway"),
    AI_MODEL: z.string().min(1).max(128).default("configured-model"),
  })
  .superRefine((value, context) => {
    if (
      value.NODE_ENV === "production" &&
      value.SESSION_SECRET.startsWith("development-only")
    ) {
      context.addIssue({
        code: "custom",
        path: ["SESSION_SECRET"],
        message: "Production session secret must be replaced",
      });
    }
    if (value.NODE_ENV === "production" && value.ALLOW_DEV_AUTH) {
      context.addIssue({
        code: "custom",
        path: ["ALLOW_DEV_AUTH"],
        message: "Development authentication cannot run in production",
      });
    }
    if (
      value.NODE_ENV === "production" &&
      (value.DEV_CONTENT_EDITOR_EMAIL || value.DEV_CONTENT_REVIEWER_EMAIL)
    ) {
      context.addIssue({
        code: "custom",
        path: ["DEV_CONTENT_EDITOR_EMAIL"],
        message: "Development content roles cannot be configured in production",
      });
    }
    if (value.NODE_ENV === "production" && value.AUTH_MODE !== "email") {
      context.addIssue({
        code: "custom",
        path: ["AUTH_MODE"],
        message: "Production requires email authentication",
      });
    }
    if (
      Boolean(value.EMAIL_GATEWAY_URL) !== Boolean(value.EMAIL_GATEWAY_TOKEN)
    ) {
      context.addIssue({
        code: "custom",
        path: ["EMAIL_GATEWAY_URL"],
        message: "Email gateway URL and token must be configured together",
      });
    }
    if (
      value.NODE_ENV === "production" &&
      (!value.EMAIL_GATEWAY_URL || !value.EMAIL_GATEWAY_TOKEN)
    ) {
      context.addIssue({
        code: "custom",
        path: ["EMAIL_GATEWAY_URL"],
        message: "Production email authentication requires an email gateway",
      });
    }
    if (value.NODE_ENV === "production" && value.DATABASE_MODE !== "postgres") {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_MODE"],
        message: "Production must use PostgreSQL",
      });
    }
    if (value.NODE_ENV === "production" && !value.CSRF_ENABLED) {
      context.addIssue({
        code: "custom",
        path: ["CSRF_ENABLED"],
        message: "Production cookie authentication requires CSRF protection",
      });
    }
    if (value.NODE_ENV === "production" && !value.RATE_LIMIT_ENABLED) {
      context.addIssue({
        code: "custom",
        path: ["RATE_LIMIT_ENABLED"],
        message: "Production requires application rate limiting",
      });
    }
    if (Boolean(value.AI_GATEWAY_URL) !== Boolean(value.AI_GATEWAY_TOKEN)) {
      context.addIssue({
        code: "custom",
        path: ["AI_GATEWAY_URL"],
        message: "AI gateway URL and token must be configured together",
      });
    }
  });

export type AppConfig = z.infer<typeof configSchema>;
export const APP_CONFIG = Symbol("APP_CONFIG");

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  return configSchema.parse(environment);
}

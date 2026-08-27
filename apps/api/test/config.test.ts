import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/app-config.js";

describe("secure configuration", () => {
  it("rejects development authentication in production", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        SESSION_SECRET: "a-production-secret-that-is-long-enough",
        ALLOW_DEV_AUTH: "true",
        DATABASE_MODE: "postgres",
      }),
    ).toThrow();
  });

  it("rejects embedded database mode in production", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        SESSION_SECRET: "a-production-secret-that-is-long-enough",
        ALLOW_DEV_AUTH: "false",
        DATABASE_MODE: "pglite",
      }),
    ).toThrow();
  });

  it("rejects development content-role bootstrap in production", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        SESSION_SECRET: "a-production-secret-that-is-long-enough",
        ALLOW_DEV_AUTH: "false",
        DATABASE_MODE: "postgres",
        AUTH_MODE: "email",
        EMAIL_GATEWAY_URL: "https://email.example.com/send",
        EMAIL_GATEWAY_TOKEN: "production-email-gateway-token",
        DEV_CONTENT_EDITOR_EMAIL: "editor@example.com",
      }),
    ).toThrow(/Development content roles/);
  });

  it("requires CSRF and rate limiting in production", () => {
    const production = {
      NODE_ENV: "production",
      SESSION_SECRET: "a-production-secret-that-is-long-enough",
      ALLOW_DEV_AUTH: "false",
      DATABASE_MODE: "postgres",
      AUTH_MODE: "email",
      EMAIL_GATEWAY_URL: "https://email.example.com/send",
      EMAIL_GATEWAY_TOKEN: "production-email-gateway-token",
    } as const;
    expect(() => loadConfig({ ...production, CSRF_ENABLED: "false" })).toThrow(
      /CSRF protection/,
    );
    expect(() =>
      loadConfig({ ...production, RATE_LIMIT_ENABLED: "false" }),
    ).toThrow(/rate limiting/);
  });

  it("requires a configured authentication provider in production", () => {
    const production = {
      NODE_ENV: "production",
      SESSION_SECRET: "a-production-secret-that-is-long-enough",
      ALLOW_DEV_AUTH: "false",
      DATABASE_MODE: "postgres",
    } as const;
    expect(() => loadConfig(production)).toThrow(/email authentication/);
    expect(() => loadConfig({ ...production, AUTH_MODE: "email" })).toThrow(
      /email gateway/,
    );
  });
});

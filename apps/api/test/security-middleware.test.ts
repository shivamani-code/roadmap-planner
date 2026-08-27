import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  ApplicationRateLimiter,
  createCsrfMiddleware,
} from "../src/common/security-middleware.js";
import { loadConfig } from "../src/config/app-config.js";

const config = loadConfig({
  NODE_ENV: "test",
  SESSION_SECRET: "test-session-secret-with-at-least-thirty-two-characters",
  DATABASE_MODE: "pglite",
  DATABASE_DIR: "memory://",
  WEB_ORIGIN: "https://student.test",
  ADMIN_ORIGIN: "https://admin.student.test",
});

describe("HTTP boundary security", () => {
  it("requires an origin-bound double-submit token for cookie mutations", async () => {
    const app = express();
    app.use(createCsrfMiddleware(config));
    app.post("/api/v1/privacy/preferences", (_request, response) =>
      response.status(204).end(),
    );

    await request(app)
      .post("/api/v1/privacy/preferences")
      .set("Cookie", "studentos_session=session-token")
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe("CSRF_TOKEN_INVALID"));

    const token = "csrf-token-that-is-long-enough-for-validation";
    await request(app)
      .post("/api/v1/privacy/preferences")
      .set("Origin", "https://student.test")
      .set("Cookie", [
        "studentos_session=session-token",
        `studentos_csrf=${token}`,
      ])
      .set("x-studentos-csrf", token)
      .expect(204);

    await request(app)
      .post("/api/v1/privacy/preferences")
      .set("Origin", "https://attacker.test")
      .set("Cookie", [
        "studentos_session=session-token",
        `studentos_csrf=${token}`,
      ])
      .set("x-studentos-csrf", token)
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe("CSRF_ORIGIN_REJECTED"));
  });

  it("applies the strict auth tier and returns a retry hint", async () => {
    const app = express();
    app.use(new ApplicationRateLimiter(() => 1_000).middleware(config));
    app.post("/api/v1/auth/magic-links", (_request, response) =>
      response.status(202).json({ accepted: true }),
    );
    for (let requestIndex = 0; requestIndex < 5; requestIndex += 1)
      await request(app).post("/api/v1/auth/magic-links").expect(202);
    await request(app)
      .post("/api/v1/auth/magic-links")
      .expect(429)
      .expect("Retry-After", "900")
      .expect(({ body }) => expect(body.code).toBe("RATE_LIMITED"));
  });

  it("does not rate-limit the explicitly enabled local demo sign-in", async () => {
    const developmentConfig = loadConfig({
      NODE_ENV: "development",
      ALLOW_DEV_AUTH: "true",
      SESSION_SECRET: "development-session-secret-with-thirty-two-characters",
      DATABASE_MODE: "pglite",
      DATABASE_DIR: "memory://",
    });
    const app = express();
    app.use(
      new ApplicationRateLimiter(() => 1_000).middleware(developmentConfig),
    );
    app.post("/api/v1/auth/magic-links", (_request, response) =>
      response.status(202).json({ accepted: true }),
    );

    for (let requestIndex = 0; requestIndex < 10; requestIndex += 1)
      await request(app).post("/api/v1/auth/magic-links").expect(202);
  });
});

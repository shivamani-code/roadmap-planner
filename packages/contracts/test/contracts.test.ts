import { describe, expect, it } from "vitest";
import { problemDetailSchema, serviceHealthSchema } from "../src/index.js";

describe("shared API contracts", () => {
  it("accepts a valid health response", () => {
    const parsed = serviceHealthSchema.parse({
      status: "ok",
      service: "api",
      version: "0.1.0",
      timestamp: "2026-08-24T12:00:00.000Z",
      checks: { process: "ok" },
    });
    expect(parsed.status).toBe("ok");
  });

  it("rejects an untyped problem code", () => {
    expect(() =>
      problemDetailSchema.parse({
        type: "https://studentos.app/problems/bad-request",
        title: "Bad request",
        status: 400,
        code: "bad-request",
        detail: "Invalid request",
        instance: "/api/v1/example",
        correlationId: "request-1",
      }),
    ).toThrow();
  });
});

import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger, withSpan } from "../src/index.js";

describe("observability foundation", () => {
  it("redacts credentials and personal payloads from structured logs", () => {
    const destination = new PassThrough();
    let output = "";
    destination.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    createLogger({ service: "test", environment: "test", destination }).info(
      {
        email: "student@example.com",
        token: "secret",
        authorization: "Bearer secret",
      },
      "safe event",
    );
    expect(output).not.toContain("student@example.com");
    expect(output).not.toContain("Bearer secret");
    expect(output).toContain("[REDACTED]");
  });

  it("preserves operation results when no telemetry SDK is installed", async () => {
    await expect(
      withSpan("studentos.test", "test.operation", async () =>
        Promise.resolve(42),
      ),
    ).resolves.toBe(42);
  });
});

import { describe, expect, it } from "vitest";
import {
  assertUserTransition,
  DomainInvariantError,
  normalizeEmail,
  uuidV7,
} from "../src/index.js";

describe("domain foundation", () => {
  it("normalizes email without changing identity semantics", () => {
    expect(normalizeEmail(" Student@Example.COM ")).toBe("student@example.com");
  });

  it("creates a valid UUIDv7 using deterministic inputs", () => {
    const id = uuidV7(
      1_725_000_000_000,
      Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    );
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(id).toBe("0191a203-2200-7102-8304-05060708090a");
  });

  it("rejects resurrection of a deleted user", () => {
    expect(() => assertUserTransition("DELETED", "ACTIVE")).toThrow(
      DomainInvariantError,
    );
  });
});

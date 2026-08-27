import { describe, expect, it } from "vitest";
import {
  canEditContent,
  canPublish,
  publicationHasSeparation,
} from "../src/lib/admin-policy";

describe("admin publication policy", () => {
  it("separates editor and reviewer capabilities", () => {
    expect(canEditContent("CONTENT_EDITOR")).toBe(true);
    expect(canPublish("CONTENT_EDITOR")).toBe(false);
    expect(canPublish("CONTENT_REVIEWER")).toBe(true);
  });

  it("requires two distinct people", () => {
    expect(publicationHasSeparation("editor-1", "reviewer-1")).toBe(true);
    expect(publicationHasSeparation("editor-1", "editor-1")).toBe(false);
  });
});

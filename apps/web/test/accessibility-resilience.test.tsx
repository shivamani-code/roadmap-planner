import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import PrivacyPage from "../src/app/privacy/page";
import { OfflineNotice } from "../src/components/offline-notice";
import { mutationHeaders } from "../src/lib/http";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = "studentos_csrf=; Max-Age=0; Path=/";
});

describe("accessibility and resilient browser states", () => {
  it("has no automated critical accessibility violations on privacy controls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ analyticsConsent: false }),
      }),
    );
    render(<PrivacyPage />);
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", {
          name: /share pseudonymous product-usage analytics/i,
        }),
      ).toBeTruthy(),
    );
    const result = await axe.run(document.body, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag22aa"] },
      rules: { "color-contrast": { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });

  it("announces offline mode and preserves read-only guidance", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    render(<OfflineNotice />);
    await act(async () => Promise.resolve());
    expect(screen.getByRole("status").textContent).toMatch(
      /current view remains readable/i,
    );
  });

  it("copies the readable CSRF cookie into mutation headers", () => {
    document.cookie = "studentos_csrf=browser-test-token; Path=/";
    expect(mutationHeaders({ "content-type": "application/json" })).toEqual({
      "content-type": "application/json",
      "x-studentos-csrf": "browser-test-token",
    });
  });
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalSessionGate } from "../src/components/local-session-gate";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("local session recovery", () => {
  it("hides protected content until a failed local session reconnects", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ debugToken: "development-token" }),
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LocalSessionGate>
        <p>Protected dashboard</p>
      </LocalSessionGate>,
    );

    const reconnect = await screen.findByRole("button", {
      name: /reconnect workspace/i,
    });
    expect(screen.queryByText("Protected dashboard")).toBeNull();

    fireEvent.click(reconnect);

    expect(await screen.findByText("Protected dashboard")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});

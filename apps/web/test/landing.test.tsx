import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LandingPage from "../src/app/page";

describe("landing page", () => {
  it("leads with the product outcome and a single roadmap action", () => {
    render(LandingPage());
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /know what to study next/i,
      }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("link", { name: /build my roadmap/i }),
    ).toHaveLength(1);
    expect(screen.getByText(/no generic roadmaps/i)).toBeTruthy();
  });
});

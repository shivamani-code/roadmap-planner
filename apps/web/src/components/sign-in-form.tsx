"use client";

import { useState } from "react";
import type { FormEvent } from "react";

type State =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "sent"; token?: string }
  | { kind: "verifying" }
  | { kind: "done" }
  | { kind: "error"; message: string };

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: "requesting" });
    try {
      const response = await fetch(`${apiUrl}/auth/magic-links`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok)
        throw new Error(
          "We could not request a sign-in link. Check the address and try again.",
        );
      const body = (await response.json()) as { debugToken?: string };
      setState({
        kind: "sent",
        ...(body.debugToken ? { token: body.debugToken } : {}),
      });
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Sign-in request failed.",
      });
    }
  }

  async function verifyDevelopmentLink(token: string) {
    setState({ kind: "verifying" });
    try {
      const response = await fetch(`${apiUrl}/auth/magic-links/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok)
        throw new Error("The development sign-in link could not be verified.");
      setState({ kind: "done" });
      window.location.assign("/onboarding");
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Verification failed.",
      });
    }
  }

  if (state.kind === "done")
    return (
      <p role="status" className="form-status success-status">
        Signed in. Opening onboarding…
      </p>
    );
  return (
    <form
      className="sign-in-form"
      onSubmit={(event) => void requestLink(event)}
      noValidate
    >
      <label htmlFor="email">College or personal email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
      />
      <button
        className="button button-primary full-button"
        type="submit"
        disabled={state.kind === "requesting" || state.kind === "verifying"}
      >
        {state.kind === "requesting"
          ? "Requesting…"
          : "Email me a sign-in link"}
      </button>
      {state.kind === "sent" && (
        <div className="form-status" role="status">
          <strong>Check your email.</strong>
          <span>The link expires in 15 minutes and can be used once.</span>
          {state.token && (
            <button
              className="dev-link"
              type="button"
              onClick={() => void verifyDevelopmentLink(state.token!)}
            >
              Continue with development link
            </button>
          )}
        </div>
      )}
      {state.kind === "error" && (
        <p className="form-error" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}

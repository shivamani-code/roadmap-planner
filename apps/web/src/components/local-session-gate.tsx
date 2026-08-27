"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const localUserEmail = "student@studentos.local";

async function ensureLocalSession(): Promise<void> {
  const currentSession = await fetch(`${apiUrl}/auth/me`, {
    credentials: "include",
  });
  if (currentSession.ok) return;
  const linkResponse = await fetch(`${apiUrl}/auth/magic-links`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: localUserEmail }),
  });
  if (!linkResponse.ok) throw new Error("Local session request failed");
  const link = (await linkResponse.json()) as { debugToken?: string };
  if (!link.debugToken)
    throw new Error("The API did not return a local sign-in token");
  const verifyResponse = await fetch(`${apiUrl}/auth/magic-links/verify`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: link.debugToken }),
  });
  if (!verifyResponse.ok) throw new Error("Local session verification failed");
}

export function LocalSessionGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "ready" | "error">(
    process.env.NODE_ENV === "development" ? "loading" : "ready",
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    void ensureLocalSession()
      .then(() => setState("ready"))
      .catch(() => setState("error"));
  }, [attempt]);
  if (state !== "ready")
    return (
      <main className="auth-page">
        <section className="auth-card" aria-labelledby="local-session-title">
          <p className="eyebrow">Local workspace</p>
          <h1 id="local-session-title">
            {state === "loading"
              ? "Opening StudentOS…"
              : "The local session needs to reconnect"}
          </h1>
          <p
            role={state === "error" ? "alert" : "status"}
            className={state === "error" ? "form-error" : "form-status"}
          >
            {state === "loading"
              ? "Connecting to the local StudentOS API."
              : "Make sure the local API is running, then try again."}
          </p>
          {state === "error" && (
            <button
              className="button button-primary full-button"
              type="button"
              onClick={() => {
                setState("loading");
                setAttempt((current) => current + 1);
              }}
            >
              Reconnect workspace
            </button>
          )}
        </section>
      </main>
    );
  return children;
}

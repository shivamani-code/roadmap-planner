"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export function MagicLinkCallback({ token }: { token?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!token) {
      setError("This sign-in link is incomplete.");
      return;
    }
    void fetch(`${apiUrl}/auth/magic-links/verify`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((response) => {
        if (!response.ok)
          throw new Error("This sign-in link is invalid, expired, or used.");
        router.replace("/onboarding");
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "The sign-in link could not be verified.",
        ),
      );
  }, [router, token]);

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="callback-title">
        <p className="eyebrow">Secure sign-in</p>
        <h1 id="callback-title">
          {error ? "We could not sign you in" : "Opening StudentOS…"}
        </h1>
        <p role="status" className={error ? "form-error" : "form-status"}>
          {error ?? "Verifying your one-use link."}
        </p>
        {error && (
          <a className="button button-primary full-button" href="/sign-in">
            Request a new link
          </a>
        )}
      </section>
    </main>
  );
}

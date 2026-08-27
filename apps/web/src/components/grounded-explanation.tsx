"use client";

import { useEffect, useState } from "react";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

interface ExplanationResponse {
  explanation: {
    headline: string;
    summary: string;
    focusItems: Array<{ id: string; text: string }>;
  };
  source: "GENERATED" | "FALLBACK";
  cached: boolean;
  fallbackReason: string | null;
  promptVersion: string;
  authoritativeItems: Array<{
    id: string;
    title: string;
    minutes?: number;
    dueDate?: string;
    date?: string;
    track: string;
  }>;
}

export function GroundedExplanation({
  useCase,
}: {
  useCase: "roadmap" | "weekly";
}) {
  const [response, setResponse] = useState<ExplanationResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const endpoint =
      useCase === "roadmap"
        ? "communication/roadmap-explanation"
        : "communication/weekly-coaching";
    void fetch(`${apiUrl}/${endpoint}`, { credentials: "include" })
      .then(async (result) => {
        if (result.status === 404) {
          setUnavailable(true);
          return null;
        }
        const body = (await result.json()) as ExplanationResponse & {
          detail?: string;
        };
        if (!result.ok)
          throw new Error(body.detail ?? "Guidance could not be loaded");
        return body;
      })
      .then((body) => {
        if (body) setResponse(body);
      })
      .catch(() => setUnavailable(true));
  }, [useCase]);
  if (unavailable) return null;
  if (!response) return <p role="status">Preparing grounded guidance…</p>;
  const factsById = new Map(
    response.authoritativeItems.map((item) => [item.id, item]),
  );
  return (
    <section
      className="grounded-guidance"
      aria-labelledby={`${useCase}-guidance-title`}
    >
      <div className="section-row">
        <div>
          <p className="eyebrow">Grounded guidance</p>
          <h2 id={`${useCase}-guidance-title`}>
            {response.explanation.headline}
          </h2>
        </div>
        <span className="status-pill">
          {response.source === "GENERATED"
            ? "Personalized wording"
            : "Deterministic template"}
        </span>
      </div>
      <p>{response.explanation.summary}</p>
      {response.explanation.focusItems.length ? (
        <ul className="guidance-list">
          {response.explanation.focusItems.map((item) => {
            const fact = factsById.get(item.id);
            if (!fact) return null;
            return (
              <li key={item.id}>
                <div>
                  <span>{fact.track}</span>
                  <strong>{fact.title}</strong>
                  <small>{item.text}</small>
                </div>
                <small>
                  {fact.minutes === undefined ? "" : `${fact.minutes} min · `}
                  {fact.dueDate ?? fact.date ?? ""}
                </small>
              </li>
            );
          })}
        </ul>
      ) : null}
      <small className="ruleset-note">
        {response.promptVersion} · wording only; plan facts remain deterministic
      </small>
    </section>
  );
}

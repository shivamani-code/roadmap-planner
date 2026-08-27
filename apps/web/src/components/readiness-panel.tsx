"use client";

import { useCallback, useEffect, useState } from "react";
import { mutationHeaders } from "../lib/http";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

interface ReadinessData {
  label: string;
  score: number;
  uncappedScore: number;
  cap: number;
  dimensions: Array<{
    dimension: string;
    weight: number;
    achievement: number;
    evidenceConfidence: number;
    score: number;
    nextAction: string | null;
  }>;
  gates: {
    reviewedProject: boolean;
    profileAndTimedAssessment: boolean;
    interviewEvidence: boolean;
  };
  projection: {
    remainingMinutes: number;
    weeklyMinutes: number;
    weeksRemaining: number | null;
    confidence: string;
    basis: string;
  };
  rulesetVersion: string;
}

interface PlacementProfile {
  resumeComplete: boolean;
  profileComplete: boolean;
}

export function ReadinessPanel() {
  const [data, setData] = useState<ReadinessData | null>(null);
  const [profile, setProfile] = useState<PlacementProfile>({
    resumeComplete: false,
    profileComplete: false,
  });
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const [readinessResponse, profileResponse] = await Promise.all([
      fetch(`${apiUrl}/placement-readiness`, { credentials: "include" }),
      fetch(`${apiUrl}/placement-profile`, { credentials: "include" }),
    ]);
    const readiness = (await readinessResponse.json()) as ReadinessData & {
      detail?: string;
    };
    const currentProfile =
      (await profileResponse.json()) as PlacementProfile & {
        detail?: string;
      };
    if (!readinessResponse.ok)
      throw new Error(readiness.detail ?? "Readiness could not be loaded");
    if (!profileResponse.ok)
      throw new Error(
        currentProfile.detail ?? "Placement profile could not be loaded",
      );
    setData(readiness);
    setProfile(currentProfile);
  }, []);

  useEffect(() => {
    void load().catch((error: unknown) =>
      setMessage(
        error instanceof Error
          ? error.message
          : "Readiness could not be loaded",
      ),
    );
  }, [load]);

  const saveProfile = async () => {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`${apiUrl}/placement-profile`, {
        method: "PUT",
        credentials: "include",
        headers: mutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(profile),
      });
      const body = (await response.json()) as { detail?: string };
      if (!response.ok)
        throw new Error(
          body.detail ?? "Placement profile could not be updated",
        );
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Placement profile could not be updated",
      );
    } finally {
      setPending(false);
    }
  };

  if (!data && !message) return <p role="status">Calculating readiness…</p>;
  if (!data)
    return (
      <p className="form-error" role="alert">
        {message}
      </p>
    );

  const gateRows = [
    ["Reviewed project milestone", data.gates.reviewedProject],
    ["Profile and timed assessment", data.gates.profileAndTimedAssessment],
    ["Interview evidence", data.gates.interviewEvidence],
  ] as const;

  return (
    <div className="readiness-view">
      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
      <section className="readiness-hero">
        <div className="readiness-score">
          <span>Current score</span>
          <strong>{data.score}</strong>
          <small>out of 100 · current cap {data.cap}</small>
        </div>
        <div>
          <p className="card-kicker">{data.label}</p>
          <h2>Your score follows the evidence</h2>
          <p>
            The uncapped evidence score is {data.uncappedScore}. Gates limit
            what the headline may claim until stronger preparation evidence
            exists.
          </p>
          <div
            className="readiness-track"
            role="meter"
            aria-label="Placement readiness"
            aria-valuenow={data.score}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${data.score}%` }} />
            <i
              style={{ left: `${data.cap}%` }}
              title={`Current cap ${data.cap}`}
            />
          </div>
        </div>
      </section>

      <section className="readiness-columns">
        <article className="insight-card">
          <p className="card-kicker">Claim gates</p>
          <h2>What raises the cap</h2>
          <ul className="gate-list">
            {gateRows.map(([label, passed]) => (
              <li key={label} className={passed ? "gate-passed" : "gate-open"}>
                <span aria-hidden="true">{passed ? "✓" : "○"}</span>
                <div>
                  <strong>{label}</strong>
                  <small>
                    {passed ? "Evidence verified" : "Still required"}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </article>
        <article className="insight-card">
          <p className="card-kicker">Low-claim projection</p>
          <h2>
            {data.projection.weeksRemaining === null
              ? "More data needed"
              : `${data.projection.weeksRemaining} weeks`}
          </h2>
          <p className="muted-copy">
            {data.projection.remainingMinutes} minutes remain at{" "}
            {data.projection.weeklyMinutes} minutes per week.
          </p>
          <dl className="detail-list">
            <div>
              <dt>Confidence</dt>
              <dd>{data.projection.confidence}</dd>
            </div>
            <div>
              <dt>Basis</dt>
              <dd>{data.projection.basis.replaceAll("_", " ")}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="insight-card">
        <p className="card-kicker">Role-weighted dimensions</p>
        <h2>Where the score comes from</h2>
        <div className="dimension-list">
          {data.dimensions.map((dimension) => (
            <article key={dimension.dimension}>
              <div className="section-row">
                <div>
                  <strong>{dimension.dimension.replaceAll("_", " ")}</strong>
                  <small>
                    {Math.round(dimension.weight * 100)}% role weight
                  </small>
                </div>
                <b>{Math.round(dimension.score)}</b>
              </div>
              <div
                className="metric-track"
                role="meter"
                aria-label={`${dimension.dimension} readiness`}
                aria-valuenow={dimension.score}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${dimension.score}%` }} />
              </div>
              {dimension.nextAction ? (
                <p>{dimension.nextAction}</p>
              ) : (
                <p>Target evidence depth reached.</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="insight-card placement-profile-card">
        <div>
          <p className="card-kicker">Preparation profile</p>
          <h2>Keep profile evidence current</h2>
          <p className="muted-copy">
            These declarations only pass their gate when timed assessment
            evidence also exists.
          </p>
        </div>
        <div className="profile-controls">
          <label>
            <input
              type="checkbox"
              checked={profile.resumeComplete}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  resumeComplete: event.target.checked,
                }))
              }
            />{" "}
            Resume is complete
          </label>
          <label>
            <input
              type="checkbox"
              checked={profile.profileComplete}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  profileComplete: event.target.checked,
                }))
              }
            />{" "}
            Placement profile is complete
          </label>
          <button
            className="button button-primary"
            disabled={pending}
            onClick={() => void saveProfile()}
          >
            {pending ? "Saving…" : "Save profile status"}
          </button>
        </div>
      </section>
      <small className="ruleset-note">
        Calculated with {data.rulesetVersion}
      </small>
    </div>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { mutationHeaders } from "../lib/http";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

interface ReviewResult {
  weekStart: string;
  metrics: {
    plannedTasks: number;
    completedTasks: number;
    plannedMinutes: number;
    completedMinutes: number;
    actualMinutes: number;
  };
  adjustment: {
    sampleCount: number;
    multiplier: number;
    action: string;
  };
  revision: { version: number; status: string; autoActivated: boolean };
}

export function WeeklyReviewForm() {
  const [weekStart, setWeekStart] = useState("");
  const [difficulty, setDifficulty] = useState("GOOD");
  const [changes, setChanges] = useState("");
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "saving" | "error"
  >("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch(`${apiUrl}/plans/today`, { credentials: "include" })
      .then(async (response) => {
        const body = (await response.json()) as {
          detail?: string;
          week?: { weekStart: string };
        };
        if (!response.ok || !body.week)
          throw new Error(body.detail ?? "Current week could not be loaded");
        setWeekStart(body.week.weekStart);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        setMessage(
          error instanceof Error
            ? error.message
            : "Current week could not be loaded",
        );
        setStatus("error");
      });
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch(`${apiUrl}/weekly-reviews`, {
        method: "POST",
        credentials: "include",
        headers: mutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          weekStart,
          difficulty,
          upcomingChanges: changes
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      });
      const body = (await response.json()) as ReviewResult & {
        detail?: string;
      };
      if (!response.ok)
        throw new Error(body.detail ?? "Weekly review could not be submitted");
      setResult(body);
      setStatus("ready");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Weekly review could not be submitted",
      );
      setStatus("error");
    }
  };

  if (status === "loading") return <p role="status">Loading this week…</p>;
  if (result)
    return (
      <section className="review-result" aria-live="polite">
        <p className="eyebrow">Review recorded</p>
        <h2>Week of {result.weekStart}</h2>
        <div className="adaptation-metrics">
          <div>
            <span>Tasks completed</span>
            <strong>
              {result.metrics.completedTasks}/{result.metrics.plannedTasks}
            </strong>
          </div>
          <div>
            <span>Planned minutes done</span>
            <strong>
              {result.metrics.completedMinutes}/{result.metrics.plannedMinutes}
            </strong>
          </div>
          <div>
            <span>Next load</span>
            <strong>{Math.round(result.adjustment.multiplier * 100)}%</strong>
          </div>
          <div>
            <span>Roadmap revision</span>
            <strong>v{result.revision.version}</strong>
          </div>
        </div>
        <p className="muted-copy">
          {result.adjustment.sampleCount < 2
            ? "StudentOS needs at least two reviewed weeks before changing your load."
            : `The four-week signal selected ${result.adjustment.action.toLowerCase().replaceAll("_", " ")}.`}
        </p>
        <a className="button button-secondary" href="/plan/week">
          Inspect the revised week
        </a>
      </section>
    );

  return (
    <form className="adaptation-form" onSubmit={(event) => void submit(event)}>
      <div className="field-grid">
        <label>
          Week starting
          <input
            type="date"
            value={weekStart}
            onChange={(event) => setWeekStart(event.target.value)}
            required
          />
        </label>
        <label>
          How did the load feel?
          <select
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value)}
          >
            <option value="TOO_EASY">Too easy</option>
            <option value="GOOD">About right</option>
            <option value="TOO_DIFFICULT">Too difficult</option>
          </select>
        </label>
      </div>
      <label>
        Upcoming changes
        <span>
          One event per line—exams, travel, projects, or placement work.
        </span>
        <textarea
          value={changes}
          onChange={(event) => setChanges(event.target.value)}
          maxLength={3200}
          rows={5}
          placeholder="Internal assessment next week"
        />
      </label>
      <p className="muted-copy">
        Small load-only changes may apply automatically. Dates, role, content,
        and material scope always require your approval.
      </p>
      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
      <button className="button button-primary" disabled={status === "saving"}>
        {status === "saving" ? "Reviewing…" : "Submit weekly review"}
      </button>
    </form>
  );
}

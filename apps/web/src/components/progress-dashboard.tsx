"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

interface ProgressData {
  range: { days: number; start: string; end: string };
  snapshot: { id: string; algorithmVersion: string; capturedAt: string };
  metrics: {
    taskCompletion: number;
    minuteCompletion: number;
    roadmapProgress: number;
    consistency: number;
  };
  totals: {
    plannedTasks: number;
    completedTasks: number;
    plannedMinutes: number;
    completedActualMinutes: number;
    eligibleDays: number;
    activeDays: number;
  };
  projects: Array<{
    id: string;
    title: string;
    status: string;
    progressPercent: number;
  }>;
  skills: Array<{
    id: string;
    name: string;
    category: string;
    effectiveProficiency: number | null;
    confidence: number;
  }>;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function ProgressDashboard() {
  const [days, setDays] = useState(28);
  const [data, setData] = useState<ProgressData | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const response = await fetch(`${apiUrl}/progress?days=${days}`, {
      credentials: "include",
    });
    const body = (await response.json()) as ProgressData & { detail?: string };
    if (!response.ok)
      throw new Error(body.detail ?? "Progress could not be loaded");
    setData(body);
    setLoading(false);
  }, [days]);

  useEffect(() => {
    void load().catch((error: unknown) => {
      setMessage(
        error instanceof Error ? error.message : "Progress could not be loaded",
      );
      setLoading(false);
    });
  }, [load]);

  return (
    <div className="insight-view">
      <div className="range-picker">
        <span>View</span>
        {[7, 28, 90].map((range) => (
          <button
            key={range}
            className={range === days ? "range-active" : ""}
            aria-pressed={range === days}
            onClick={() => setDays(range)}
          >
            {range} days
          </button>
        ))}
      </div>
      {loading ? <p role="status">Calculating the selected range…</p> : null}
      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
      {data && !loading ? (
        <>
          <section className="metric-grid" aria-label="Progress metrics">
            {[
              ["Task completion", data.metrics.taskCompletion],
              ["Time completed", data.metrics.minuteCompletion],
              ["Roadmap progress", data.metrics.roadmapProgress],
              ["Consistency", data.metrics.consistency],
            ].map(([label, value]) => (
              <article key={String(label)}>
                <span>{label}</span>
                <strong>{percent(Number(value))}</strong>
                <div
                  className="metric-track"
                  role="meter"
                  aria-label={String(label)}
                  aria-valuenow={Math.round(Number(value) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: percent(Number(value)) }} />
                </div>
              </article>
            ))}
          </section>

          <section className="insight-columns">
            <article className="insight-card">
              <p className="card-kicker">Selected range</p>
              <h2>Work completed</h2>
              <dl className="detail-list">
                <div>
                  <dt>Tasks</dt>
                  <dd>
                    {data.totals.completedTasks} / {data.totals.plannedTasks}
                  </dd>
                </div>
                <div>
                  <dt>Actual time</dt>
                  <dd>{data.totals.completedActualMinutes} min</dd>
                </div>
                <div>
                  <dt>Active days</dt>
                  <dd>
                    {data.totals.activeDays} / {data.totals.eligibleDays}
                  </dd>
                </div>
              </dl>
              <small>
                {data.range.start} to {data.range.end} ·{" "}
                {data.snapshot.algorithmVersion}
              </small>
            </article>

            <article className="insight-card">
              <p className="card-kicker">Portfolio</p>
              <h2>Project milestones</h2>
              {data.projects.length === 0 ? (
                <p className="muted-copy">No project selected yet.</p>
              ) : (
                <ul className="plain-list">
                  {data.projects.map((project) => (
                    <li key={project.id}>
                      <div>
                        <strong>{project.title}</strong>
                        <span>{project.status.replaceAll("_", " ")}</span>
                      </div>
                      <b>{project.progressPercent}%</b>
                    </li>
                  ))}
                </ul>
              )}
              <Link className="text-link" href="/projects">
                Open projects
              </Link>
            </article>
          </section>

          <section className="insight-card">
            <div className="section-row">
              <div>
                <p className="card-kicker">Latest evidence</p>
                <h2>Skill estimates</h2>
              </div>
              <Link className="button button-secondary" href="/skills">
                Inspect evidence
              </Link>
            </div>
            <ul className="skill-preview">
              {data.skills.slice(0, 6).map((skill) => (
                <li key={skill.id}>
                  <div>
                    <strong>{skill.name}</strong>
                    <span>{skill.category.replaceAll("_", " ")}</span>
                  </div>
                  <div>
                    <b>{percent(skill.effectiveProficiency ?? 0)}</b>
                    <small>{percent(skill.confidence)} confidence</small>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}

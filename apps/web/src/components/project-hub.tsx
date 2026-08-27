"use client";

import { useCallback, useEffect, useState } from "react";
import { mutationHeaders } from "../lib/http";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

interface Recommendation {
  id: string;
  key: string;
  title: string;
  goal: string;
  difficulty: string;
  estimatedHours: { p25: number; p50: number; p75: number };
  portfolioValue: number;
  deploymentRequired: boolean;
  eligible: boolean;
  blockers: Array<{
    skillName: string;
    required: number;
    current: number;
  }>;
  score: number;
  why: string;
}

interface ActiveProject {
  id: string;
  status: string;
  title: string;
  goal: string;
  deliverables: string[];
  estimatedHours: { p25: number; p50: number; p75: number };
  deploymentRequired: boolean;
  progressPercent: number;
  milestones: Array<{
    id: string;
    title: string;
    sequence: number;
    estimatedMinutes: number;
    completionCriteria: string[];
    status: string;
    artifactUrl: string | null;
    rubricScore: number | null;
    reviewNote: string | null;
  }>;
}

interface RecommendationResponse {
  active: { id: string } | null;
  recommendations: Recommendation[];
}

export function ProjectHub() {
  const [recommendations, setRecommendations] =
    useState<RecommendationResponse | null>(null);
  const [project, setProject] = useState<ActiveProject | null>(null);
  const [artifactUrl, setArtifactUrl] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    setMessage("");
    const response = await fetch(`${apiUrl}/projects/recommendations`, {
      credentials: "include",
    });
    const body = (await response.json()) as RecommendationResponse & {
      detail?: string;
    };
    if (!response.ok)
      throw new Error(
        body.detail ?? "Project recommendations could not be loaded",
      );
    setRecommendations(body);
    const current = await fetch(`${apiUrl}/student-projects/active`, {
      credentials: "include",
    });
    if (current.status === 404) {
      setProject(null);
      return;
    }
    const currentBody = (await current.json()) as ActiveProject & {
      detail?: string;
    };
    if (!current.ok)
      throw new Error(
        currentBody.detail ?? "Current project could not be loaded",
      );
    setProject(currentBody);
  }, []);

  useEffect(() => {
    void load().catch((error: unknown) =>
      setMessage(
        error instanceof Error
          ? error.message
          : "Project recommendations could not be loaded",
      ),
    );
  }, [load]);

  const start = async (templateId: string) => {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`${apiUrl}/student-projects`, {
        method: "POST",
        credentials: "include",
        headers: mutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ templateId }),
      });
      const body = (await response.json()) as { detail?: string };
      if (!response.ok)
        throw new Error(body.detail ?? "Project could not be started");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Project could not be started",
      );
    } finally {
      setPending(false);
    }
  };

  const submit = async (milestoneId: string) => {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(
        `${apiUrl}/student-projects/milestones/${milestoneId}/submissions`,
        {
          method: "POST",
          credentials: "include",
          headers: mutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ artifactUrl, note }),
        },
      );
      const body = (await response.json()) as { detail?: string };
      if (!response.ok)
        throw new Error(
          body.detail ?? "Milestone evidence could not be submitted",
        );
      setArtifactUrl("");
      setNote("");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Milestone evidence could not be submitted",
      );
    } finally {
      setPending(false);
    }
  };

  if (!recommendations && !message)
    return <p role="status">Finding feasible reviewed projects…</p>;
  const nextMilestone = project?.milestones.find(
    ({ status }) => status !== "COMPLETED",
  );
  const hasActive = recommendations?.active !== null;

  return (
    <div className="project-view">
      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
      {project ? (
        <section className="active-project">
          <div className="section-row">
            <div>
              <p className="card-kicker">
                {project.status === "COMPLETED"
                  ? "Completed project"
                  : "Primary project"}
              </p>
              <h2>{project.title}</h2>
              <p>{project.goal}</p>
            </div>
            <div
              className="project-progress"
              aria-label={`${project.progressPercent}% complete`}
            >
              <strong>{project.progressPercent}%</strong>
              <span>milestone weight complete</span>
            </div>
          </div>
          <ol className="project-milestones">
            {project.milestones.map((milestone) => (
              <li key={milestone.id}>
                <span
                  className={`milestone-state milestone-${milestone.status.toLowerCase()}`}
                >
                  {milestone.status.replaceAll("_", " ")}
                </span>
                <div>
                  <strong>
                    {milestone.sequence}. {milestone.title}
                  </strong>
                  <small>{milestone.estimatedMinutes} min estimated</small>
                  <p>{milestone.completionCriteria.join(" · ")}</p>
                  {milestone.reviewNote ? (
                    <p>Review: {milestone.reviewNote}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <div className="project-deliverables">
            <strong>Required deliverables</strong>
            <ul>
              {project.deliverables.map((deliverable) => (
                <li key={deliverable}>{deliverable}</li>
              ))}
            </ul>
            <span>
              {project.estimatedHours.p25}–{project.estimatedHours.p75} hours ·{" "}
              {project.deploymentRequired
                ? "deployment required"
                : "deployment optional"}
            </span>
          </div>
          {nextMilestone?.status === "PLANNED" ? (
            <form
              className="artifact-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submit(nextMilestone.id);
              }}
            >
              <h3>Submit {nextMilestone.title}</h3>
              <label>
                Approved HTTPS artifact URL
                <input
                  required
                  type="url"
                  placeholder="https://github.com/…"
                  value={artifactUrl}
                  onChange={(event) => setArtifactUrl(event.target.value)}
                />
              </label>
              <label>
                What should the reviewer inspect?
                <textarea
                  required
                  minLength={2}
                  maxLength={1000}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <button className="button button-primary" disabled={pending}>
                {pending ? "Submitting…" : "Submit milestone evidence"}
              </button>
            </form>
          ) : nextMilestone?.status === "SUBMITTED" ? (
            <p className="review-wait" role="status">
              Evidence submitted. A separate reviewer must apply the milestone
              rubric.
            </p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="recommendations-title">
        <div className="section-row">
          <div>
            <p className="card-kicker">Reviewed templates</p>
            <h2 id="recommendations-title">Recommendations</h2>
          </div>
          <span className="status-pill">Deterministic score</span>
        </div>
        <div className="recommendation-grid">
          {recommendations?.recommendations.map((item) => (
            <article
              key={item.id}
              className={
                item.eligible
                  ? "project-card"
                  : "project-card project-card-locked"
              }
            >
              <div className="project-card-top">
                <span>{item.difficulty}</span>
                <strong>{item.score}</strong>
              </div>
              <h3>{item.title}</h3>
              <p>{item.goal}</p>
              <dl className="project-facts">
                <div>
                  <dt>Typical effort</dt>
                  <dd>{item.estimatedHours.p50}h</dd>
                </div>
                <div>
                  <dt>Portfolio value</dt>
                  <dd>{Math.round(item.portfolioValue * 100)}%</dd>
                </div>
                <div>
                  <dt>Deployment</dt>
                  <dd>{item.deploymentRequired ? "Required" : "Optional"}</dd>
                </div>
              </dl>
              <p className="recommendation-why">Why: {item.why}</p>
              {item.blockers.length > 0 ? (
                <ul className="blocker-list">
                  {item.blockers.map((blocker) => (
                    <li key={blocker.skillName}>
                      {blocker.skillName}: {Math.round(blocker.current * 100)}%
                      / {Math.round(blocker.required * 100)}% required
                    </li>
                  ))}
                </ul>
              ) : null}
              <button
                className="button button-secondary full-button"
                disabled={pending || !item.eligible || hasActive}
                onClick={() => void start(item.id)}
              >
                {!item.eligible
                  ? "Prerequisites locked"
                  : hasActive
                    ? "Finish current project first"
                    : "Start this project"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

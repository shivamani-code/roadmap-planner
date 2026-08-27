"use client";

import { useCallback, useEffect, useState } from "react";
import { mutationHeaders } from "../lib/http";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

interface RoadmapSummary {
  id: string;
  status: string;
  revision: {
    id: string;
    version: number;
    status: string;
    rulesetVersion: string;
    summary: {
      requiredMinutes: number;
      plannedMinutes: number;
      capacityMinutes: number;
      bufferPercent: number;
      termCount: number;
      milestoneCount: number;
      skillCount: number;
      projectMilestoneCount: number;
      supportingSubjectCount: number;
      supportingSubjectNames: string[];
      weeklyPaceMinutes: number;
    };
    exclusions: Array<{ skillId: string; reason: string }>;
    risks: Array<{ code: string }>;
  };
  terms: Array<{
    id: string;
    sequence: number;
    semesterNumber: number | null;
    label: string;
    theme: string;
    startDate: string;
    endDate: string;
    capacityMinutes: number;
    plannedMinutes: number;
    tracks: string[];
    milestoneCount: number;
  }>;
}

interface TermDetail {
  id: string;
  label: string;
  theme: string;
  startDate: string;
  endDate: string;
  capacityMinutes: number;
  plannedMinutes: number;
  milestones: Array<{
    id: string;
    title: string;
    track: string;
    status: string;
    skill: { key: string; name: string };
    learningUnit: { key: string; type: string };
    estimatedMinutes: number;
    priority: number;
    requiredBy: string;
    reasonCodes: string[];
    prerequisiteMilestoneIds: string[];
  }>;
}

interface GapFeasibility {
  status: "READY" | "INSUFFICIENT_CAPACITY";
  effortHours: { p50: number };
  feasibility: {
    allocatableMinutes: number;
    requiredMinutes: number;
    deficitMinutes: number;
  };
  planScope: {
    requiredSkills: number;
    remainingSkills: number;
    collegeSupportedSkills: number;
    independentSkills: number;
    supportingSubjects: number;
    nextSkills: string[];
  };
}

function hours(minutes: number): string {
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function RoadmapView({
  gapAnalysisId,
}: {
  gapAnalysisId: string | undefined;
}) {
  const [roadmap, setRoadmap] = useState<RoadmapSummary | null>(null);
  const [term, setTerm] = useState<TermDetail | null>(null);
  const [state, setState] = useState<
    "loading" | "empty" | "generating" | "ready" | "error"
  >("loading");
  const [message, setMessage] = useState("");
  const [serverStage, setServerStage] = useState<string | null>(null);
  const [gapFeasibility, setGapFeasibility] = useState<GapFeasibility | null>(
    null,
  );

  const loadCurrent = useCallback(async (): Promise<void> => {
    const response = await fetch(`${apiUrl}/roadmaps/current`, {
      credentials: "include",
    });
    if (response.status === 404) {
      setState("empty");
      return;
    }
    const body = (await response.json()) as RoadmapSummary & {
      detail?: string;
    };
    if (!response.ok)
      throw new Error(body.detail ?? "Roadmap could not be loaded");
    setRoadmap(body);
    setState("ready");
  }, []);

  useEffect(() => {
    void loadCurrent().catch((error: unknown) => {
      setMessage(
        error instanceof Error ? error.message : "Roadmap could not be loaded",
      );
      setState("error");
    });
  }, [loadCurrent]);

  useEffect(() => {
    if (!gapAnalysisId) return;
    void fetch(`${apiUrl}/gap-analyses/${gapAnalysisId}`, {
      credentials: "include",
    })
      .then(async (response) => {
        const body = (await response.json()) as GapFeasibility & {
          detail?: string;
        };
        if (!response.ok)
          throw new Error(body.detail ?? "Gap analysis could not be loaded");
        setGapFeasibility(body);
      })
      .catch((error: unknown) => {
        setMessage(
          error instanceof Error
            ? error.message
            : "Gap analysis could not be loaded",
        );
        setState("error");
      });
  }, [gapAnalysisId]);

  const generate = async (): Promise<void> => {
    if (!gapAnalysisId) return;
    setState("generating");
    setServerStage("REQUESTED");
    try {
      const response = await fetch(`${apiUrl}/roadmaps`, {
        method: "POST",
        credentials: "include",
        headers: mutationHeaders({
          "content-type": "application/json",
          "idempotency-key": `initial:${gapAnalysisId}`,
        }),
        body: JSON.stringify({ gapAnalysisId }),
      });
      const body = (await response.json()) as {
        stage?: string;
        detail?: string;
        risks?: Array<{ code: string }>;
      };
      setServerStage(body.stage ?? null);
      if (!response.ok)
        throw new Error(body.detail ?? "Roadmap could not be generated");
      await loadCurrent();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Roadmap could not be generated",
      );
      setState("error");
    }
  };

  const openTerm = async (termId: string): Promise<void> => {
    setTerm(null);
    try {
      const response = await fetch(
        `${apiUrl}/roadmaps/current/terms/${termId}`,
        { credentials: "include" },
      );
      const body = (await response.json()) as TermDetail & { detail?: string };
      if (!response.ok)
        throw new Error(body.detail ?? "Term could not be loaded");
      setTerm(body);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Term could not be loaded",
      );
    }
  };

  if (state === "loading")
    return <p role="status">Loading your active roadmap…</p>;
  if (state === "generating")
    return (
      <section className="generation-state" aria-live="polite">
        <span>Server stage</span>
        <strong>{serverStage?.replaceAll("_", " ")}</strong>
        <p>
          StudentOS is validating reviewed inputs, prerequisites, deadlines, and
          capacity. No percentage is shown because the server does not report
          one.
        </p>
      </section>
    );
  if (state === "empty")
    if (gapFeasibility?.status === "INSUFFICIENT_CAPACITY") {
      const deficitHours = hours(gapFeasibility.feasibility.deficitMinutes);
      const availableHours = hours(
        gapFeasibility.feasibility.allocatableMinutes,
      );
      return (
        <section className="generation-state decision-risk">
          <span>Capacity decision required</span>
          <strong>{deficitHours} short before the selected deadline</strong>
          <p>
            This target needs about {gapFeasibility.effortHours.p50}h of
            remaining work, but only {availableHours} fits in the declared
            schedule. StudentOS will not activate an impossible roadmap.
          </p>
          <div className="roadmap-summary" aria-label="Blocked plan scope">
            <div>
              <span>Skills remaining</span>
              <strong>{gapFeasibility.planScope.remainingSkills}</strong>
            </div>
            <div>
              <span>College-supported</span>
              <strong>{gapFeasibility.planScope.collegeSupportedSkills}</strong>
            </div>
            <div>
              <span>Independent</span>
              <strong>{gapFeasibility.planScope.independentSkills}</strong>
            </div>
            <div>
              <span>R25 subjects helping</span>
              <strong>{gapFeasibility.planScope.supportingSubjects}</strong>
            </div>
          </div>
          <p>
            First priorities: {gapFeasibility.planScope.nextSkills.join(" · ")}
          </p>
          <div className="roadmap-next">
            <a className="button button-primary" href="/onboarding/goal">
              Extend target date
            </a>
            <a
              className="button button-secondary"
              href="/onboarding/availability"
            >
              Increase weekly availability
            </a>
          </div>
        </section>
      );
    }
  if (state === "empty")
    return (
      <section className="generation-state">
        <strong>No active roadmap yet</strong>
        <p>
          Generation freezes the accepted gap and creates only reviewed,
          prerequisite-safe milestones.
        </p>
        {gapAnalysisId ? (
          <button
            className="button button-primary"
            onClick={() => void generate()}
          >
            Generate and activate first roadmap
          </button>
        ) : (
          <a className="button button-secondary" href="/gap">
            Return to gap analysis
          </a>
        )}
      </section>
    );
  if (state === "error" || !roadmap)
    return (
      <section className="generation-state">
        <p className="form-error" role="alert">
          {message}
        </p>
        <a className="button button-secondary" href="/gap">
          Review inputs
        </a>
      </section>
    );

  const summary = roadmap.revision.summary;
  return (
    <div className="roadmap-view">
      <section className="roadmap-summary" aria-label="Roadmap summary">
        <div>
          <span>Planned effort</span>
          <strong>{hours(summary.plannedMinutes)}</strong>
        </div>
        <div>
          <span>Protected capacity</span>
          <strong>{hours(summary.capacityMinutes)}</strong>
        </div>
        <div>
          <span>Reserve</span>
          <strong>{summary.bufferPercent}%</strong>
        </div>
        <div>
          <span>Skills to complete</span>
          <strong>{summary.skillCount}</strong>
        </div>
        <div>
          <span>Milestones</span>
          <strong>{summary.milestoneCount}</strong>
        </div>
        <div>
          <span>R25 subjects helping</span>
          <strong>{summary.supportingSubjectCount}</strong>
        </div>
        <div>
          <span>Weekly pace</span>
          <strong>{hours(summary.weeklyPaceMinutes)}</strong>
        </div>
      </section>
      <section className="roadmap-guide" aria-labelledby="roadmap-guide-title">
        <p className="eyebrow">How to complete this roadmap</p>
        <h2 id="roadmap-guide-title">Your plan in three layers</h2>
        <ol>
          <li>
            <strong>Learn and revise</strong>
            <span>
              Finish {summary.skillCount} planned skills in prerequisite order
              across {summary.termCount} term(s).
            </span>
          </li>
          <li>
            <strong>Use your R25 subjects</strong>
            <span>
              {summary.supportingSubjectCount
                ? summary.supportingSubjectNames.join(" · ")
                : "The roadmap keeps career work independent where no reviewed curriculum mapping exists."}
            </span>
          </li>
          <li>
            <strong>Prove the work</strong>
            <span>
              Complete {Math.max(1, summary.projectMilestoneCount)} evidence
              milestone(s), publish artifacts, and use them in your resume and
              interviews.
            </span>
          </li>
        </ol>
      </section>
      <div className="roadmap-next">
        <a className="button button-primary" href="/today">
          Open today’s plan
        </a>
        <a className="button button-secondary" href="/plan/week">
          View this week
        </a>
      </div>
      <div className="roadmap-columns">
        <section className="term-timeline" aria-labelledby="timeline-title">
          <h2 id="timeline-title">Graduation timeline</h2>
          <ol>
            {roadmap.terms.map((item) => (
              <li key={item.id}>
                <button
                  className={
                    term?.id === item.id
                      ? "term-card term-card-active"
                      : "term-card"
                  }
                  onClick={() => void openTerm(item.id)}
                >
                  <span>
                    {shortDate(item.startDate)}–{shortDate(item.endDate)}
                  </span>
                  <strong>{item.label}</strong>
                  <small>{item.theme}</small>
                  <small>
                    {item.milestoneCount} milestone(s) ·{" "}
                    {hours(item.plannedMinutes)}
                  </small>
                </button>
              </li>
            ))}
          </ol>
        </section>
        <section className="term-detail" aria-live="polite">
          {term ? (
            <>
              <p className="eyebrow">Semester and monthly horizon</p>
              <h2>{term.label}</h2>
              <p>
                {term.theme} · {hours(term.plannedMinutes)} of{" "}
                {hours(term.capacityMinutes)}
              </p>
              <div className="month-window">
                <span>Starts {shortDate(term.startDate)}</span>
                <span>Ends {shortDate(term.endDate)}</span>
              </div>
              <div className="milestone-list">
                {term.milestones.length === 0 ? (
                  <p>Capacity is intentionally protected in this term.</p>
                ) : (
                  term.milestones.map((milestone) => (
                    <article key={milestone.id}>
                      <span>{milestone.track}</span>
                      <h3>{milestone.skill.name}</h3>
                      <p>{milestone.title}</p>
                      <dl>
                        <div>
                          <dt>Effort</dt>
                          <dd>{hours(milestone.estimatedMinutes)}</dd>
                        </div>
                        <div>
                          <dt>Priority</dt>
                          <dd>{Math.round(milestone.priority)}</dd>
                        </div>
                        <div>
                          <dt>Template</dt>
                          <dd>{milestone.learningUnit.key}</dd>
                        </div>
                      </dl>
                    </article>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="term-placeholder">
              <strong>Open a term to inspect its reviewed milestones</strong>
              <span>
                Each milestone retains its requirement, skill, template, and
                prerequisite trace.
              </span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

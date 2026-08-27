"use client";

import { useEffect, useState, type FormEvent } from "react";
import { mutationHeaders } from "../lib/http";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const levelLabels: Record<string, string> = {
  UNKNOWN: "Not sure yet",
  NOT_STARTED: "Not started",
  AWARE: "Aware",
  BASIC: "Basic",
  APPLIED: "Applied",
  PROFICIENT: "Proficient",
  READY: "Interview / production ready",
};

interface Assessment {
  id: string;
  resumed: boolean;
  responses: Record<string, string>;
  statements: Array<{
    skillId: string;
    skillName: string;
    category: string;
    statement: string;
    levels: string[];
  }>;
}

export function AssessmentForm() {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<
    "loading" | "ready" | "saving" | "saved" | "error"
  >("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch(`${apiUrl}/skill-assessments`, {
      method: "POST",
      credentials: "include",
      headers: mutationHeaders(),
    })
      .then(async (response) => {
        if (!response.ok) {
          const problem = (await response.json()) as { detail?: string };
          throw new Error(problem.detail ?? "Assessment could not start");
        }
        return (await response.json()) as Assessment;
      })
      .then((data) => {
        setAssessment(data);
        setResponses(data.responses ?? {});
        setStatus("ready");
      })
      .catch((error: unknown) => {
        setMessage(
          error instanceof Error ? error.message : "Assessment could not start",
        );
        setStatus("error");
      });
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (
      !assessment ||
      assessment.statements.some(({ skillId }) => !responses[skillId])
    )
      return;
    setStatus("saving");
    try {
      const saved = await fetch(
        `${apiUrl}/skill-assessments/${assessment.id}/responses`,
        {
          method: "PUT",
          credentials: "include",
          headers: mutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({
            responses: assessment.statements.map(({ skillId }) => ({
              skillId,
              level: responses[skillId],
            })),
          }),
        },
      );
      if (!saved.ok) throw new Error("Responses could not be saved");
      const submitted = await fetch(
        `${apiUrl}/skill-assessments/${assessment.id}/submit`,
        {
          method: "POST",
          credentials: "include",
          headers: mutationHeaders(),
        },
      );
      if (!submitted.ok) {
        const problem = (await submitted.json()) as { detail?: string };
        throw new Error(problem.detail ?? "Assessment could not be submitted");
      }
      setStatus("saved");
      setMessage(
        "Assessment scored. Self-reports are stored with lower confidence than verified evidence.",
      );
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Assessment could not be submitted",
      );
    }
  };

  if (status === "loading")
    return <p role="status">Preparing role-specific statements…</p>;
  if (!assessment)
    return (
      <p className="form-error" role="alert">
        {message}
      </p>
    );
  return (
    <form className="assessment-form" onSubmit={(event) => void submit(event)}>
      {assessment.statements.map((statement, index) => (
        <fieldset key={statement.skillId}>
          <legend>
            <span>
              {index + 1} · {statement.category.replaceAll("_", " ")}
            </span>
            {statement.statement}
          </legend>
          <select
            aria-label={`Level for ${statement.skillName}`}
            value={responses[statement.skillId] ?? ""}
            onChange={(event) =>
              setResponses((current) => ({
                ...current,
                [statement.skillId]: event.target.value,
              }))
            }
            required
          >
            <option value="">Choose the closest level</option>
            {statement.levels.map((level) => (
              <option key={level} value={level}>
                {levelLabels[level] ?? level}
              </option>
            ))}
          </select>
        </fieldset>
      ))}
      {message ? (
        <p
          className={status === "saved" ? "form-success" : "form-error"}
          role="status"
        >
          {message}
        </p>
      ) : null}
      {status === "saved" ? (
        <a
          className="button button-secondary full-button"
          href="/onboarding/availability"
        >
          Continue to availability
        </a>
      ) : null}
      <button
        className="button button-primary full-button"
        disabled={status === "saving" || status === "saved"}
      >
        {status === "saving" ? "Scoring…" : "Save assessment"}
      </button>
    </form>
  );
}

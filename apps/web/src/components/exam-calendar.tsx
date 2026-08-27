"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { mutationHeaders } from "../lib/http";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

interface ExamPeriod {
  id: string;
  type: string;
  title: string;
  startDate: string;
  endDate: string;
  provenance: string;
  confirmed: boolean;
}

interface PlanningMode {
  mode: string;
  reason: string;
  activePeriodIds: string[];
  confirmationRequiredIds: string[];
}

export function ExamCalendar() {
  const [periods, setPeriods] = useState<ExamPeriod[]>([]);
  const [mode, setMode] = useState<PlanningMode | null>(null);
  const [status, setStatus] = useState("Loading calendar…");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [periodResponse, modeResponse] = await Promise.all([
      fetch(`${apiUrl}/exam-periods`, { credentials: "include" }),
      fetch(`${apiUrl}/planning-mode`, { credentials: "include" }),
    ]);
    const periodBody = (await periodResponse.json()) as ExamPeriod[] & {
      detail?: string;
    };
    const modeBody = (await modeResponse.json()) as PlanningMode & {
      detail?: string;
    };
    if (!periodResponse.ok)
      throw new Error(periodBody.detail ?? "Exam calendar could not be loaded");
    if (!modeResponse.ok)
      throw new Error(modeBody.detail ?? "Planning mode could not be loaded");
    setPeriods(periodBody);
    setMode(modeBody);
    setStatus("");
  }, []);

  useEffect(() => {
    void load().catch((loadError: unknown) => {
      setStatus("");
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Exam calendar could not be loaded",
      );
    });
  }, [load]);

  const addPeriod = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStatus("Saving period…");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${apiUrl}/exam-periods`, {
        method: "POST",
        credentials: "include",
        headers: mutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          type: form.get("type"),
          title: form.get("title"),
          startDate: form.get("startDate"),
          endDate: form.get("endDate"),
        }),
      });
      const body = (await response.json()) as { detail?: string };
      if (!response.ok)
        throw new Error(body.detail ?? "Exam period could not be saved");
      event.currentTarget.reset();
      await load();
    } catch (saveError) {
      setStatus("");
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Exam period could not be saved",
      );
    }
  };

  const confirm = async (period: ExamPeriod, confirmed: boolean) => {
    setError("");
    const response = await fetch(
      `${apiUrl}/exam-periods/${period.id}/confirmation`,
      {
        method: "PATCH",
        credentials: "include",
        headers: mutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ confirmed }),
      },
    );
    const body = (await response.json()) as { detail?: string };
    if (!response.ok) {
      setError(body.detail ?? "Confirmation could not be changed");
      return;
    }
    await load();
  };

  return (
    <div className="calendar-layout">
      <section className="calendar-card">
        <p className="eyebrow">Current planning policy</p>
        <h2>{mode?.mode.replaceAll("_", " ") ?? "Unknown"}</h2>
        <p className="muted-copy">
          {mode?.reason ??
            "Planning mode will appear when the calendar has loaded."}
        </p>
        {mode?.confirmationRequiredIds.length ? (
          <p className="form-warning">
            Confirm {mode.confirmationRequiredIds.length} inferred exam period
            before it changes your plan.
          </p>
        ) : null}
        <form
          className="adaptation-form"
          onSubmit={(event) => void addPeriod(event)}
        >
          <label>
            Period type
            <select name="type" defaultValue="INTERNAL_EXAM">
              <option value="INTERNAL_EXAM">Internal exam</option>
              <option value="SEMESTER_EXAM">Semester exam</option>
              <option value="VACATION">Vacation</option>
              <option value="PLACEMENT_WEEK">Placement week</option>
            </select>
          </label>
          <label>
            Title
            <input name="title" minLength={2} maxLength={160} required />
          </label>
          <div className="field-grid">
            <label>
              Starts
              <input name="startDate" type="date" required />
            </label>
            <label>
              Ends
              <input name="endDate" type="date" required />
            </label>
          </div>
          <button className="button button-primary">
            Add confirmed period
          </button>
        </form>
      </section>
      <section className="calendar-card" aria-labelledby="period-list-title">
        <div className="section-row">
          <div>
            <p className="eyebrow">Planning inputs</p>
            <h2 id="period-list-title">Exam periods</h2>
          </div>
          <span>{periods.length} total</span>
        </div>
        {status ? <p role="status">{status}</p> : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {periods.length === 0 && !status ? (
          <p className="empty-state">No exam or special periods recorded.</p>
        ) : (
          <ol className="period-list">
            {periods.map((period) => (
              <li key={period.id}>
                <div>
                  <span>{period.type.replaceAll("_", " ")}</span>
                  <strong>{period.title}</strong>
                  <small>
                    {period.startDate} – {period.endDate} · {period.provenance}
                  </small>
                </div>
                <button
                  className="button button-quiet"
                  type="button"
                  aria-pressed={period.confirmed}
                  onClick={() => void confirm(period, !period.confirmed)}
                >
                  {period.confirmed ? "Confirmed" : "Confirm"}
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

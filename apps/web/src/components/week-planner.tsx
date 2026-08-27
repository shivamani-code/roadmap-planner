"use client";

import { useEffect, useState } from "react";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

interface WeekData {
  weekStart: string;
  timezone: string;
  planningMode: string;
  modePolicy: {
    academicShare?: { min: number; max: number };
    careerShare?: { min: number; max: number };
    maxCareerMinutesPerDay?: number | null;
    maxCareerSessionsPerWeek?: number | null;
  };
  capacity: {
    rawMinutes: number;
    allocatableMinutes: number;
    scheduledMinutes: number;
    catchupMinutes: number;
  };
  trackMinutes: Record<string, number>;
  days: Array<{
    date: string;
    rawMinutes: number;
    scheduledMinutes: number;
    tasks: Array<{
      id: string;
      title: string;
      track: string;
      status: string;
      estimatedMinutes: number;
      skill: { name: string };
    }>;
  }>;
}

export function WeekPlanner() {
  const [week, setWeek] = useState<WeekData | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void fetch(`${apiUrl}/plans/today`, {
      credentials: "include",
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          detail?: string;
          week?: { weekStart: string };
        };
        if (!response.ok)
          throw new Error(body.detail ?? "Week could not be loaded");
        if (!body.week) throw new Error("Current week was not returned");
        return fetch(`${apiUrl}/plans/weeks/${body.week.weekStart}`, {
          credentials: "include",
        });
      })
      .then(async (response) => {
        const body = (await response.json()) as WeekData & { detail?: string };
        if (!response.ok)
          throw new Error(body.detail ?? "Week could not be loaded");
        setWeek(body);
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error ? error.message : "Week could not be loaded",
        ),
      );
  }, []);
  if (!week)
    return message ? (
      <p className="form-error" role="alert">
        {message}
      </p>
    ) : (
      <p role="status">Materializing this week…</p>
    );
  const percent = Math.round(
    (week.capacity.scheduledMinutes /
      Math.max(1, week.capacity.allocatableMinutes)) *
      100,
  );
  return (
    <div className="week-planner">
      <section className="week-capacity">
        {week.planningMode !== "NORMAL" ? (
          <div className="mode-notice" role="status">
            <span>Planning mode</span>
            <strong>{week.planningMode.replaceAll("_", " ")}</strong>
            <small>
              Academic work is protected; deferred career work returns gradually
              after this period.
            </small>
          </div>
        ) : null}
        <div>
          <span>Scheduled / allocatable</span>
          <strong>
            {week.capacity.scheduledMinutes} /{" "}
            {week.capacity.allocatableMinutes} min
          </strong>
        </div>
        <div
          className="capacity-meter"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Weekly allocatable capacity used"
        >
          <span style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
        <p>
          {week.capacity.catchupMinutes} minutes remain protected as reserve.
        </p>
        <ul>
          {Object.entries(week.trackMinutes).map(([track, minutes]) => (
            <li key={track}>
              <span>{track}</span>
              <strong>{minutes} min</strong>
            </li>
          ))}
        </ul>
      </section>
      <section className="week-days" aria-label="Tasks by day">
        {week.days.map((day) => (
          <article key={day.date}>
            <header>
              <div>
                <span>
                  {new Intl.DateTimeFormat("en-IN", {
                    weekday: "long",
                    timeZone: "UTC",
                  }).format(new Date(day.date))}
                </span>
                <strong>{day.date}</strong>
              </div>
              <small>{day.scheduledMinutes} min planned</small>
            </header>
            {day.tasks.length === 0 ? (
              <p>Protected or unscheduled day</p>
            ) : (
              <ol>
                {day.tasks.map((task) => (
                  <li key={task.id}>
                    <span>{task.track}</span>
                    <div>
                      <strong>{task.skill.name}</strong>
                      <small>{task.title}</small>
                    </div>
                    <time>{task.estimatedMinutes} min</time>
                  </li>
                ))}
              </ol>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

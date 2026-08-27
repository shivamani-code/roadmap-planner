"use client";

import { useCallback, useEffect, useState } from "react";
import { mutationHeaders } from "../lib/http";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

interface TodayTask {
  id: string;
  taskId: string;
  title: string;
  track: string;
  status: string;
  lockVersion: number;
  startMinute: number;
  endMinute: number;
  estimatedMinutes: number;
  partialMinutes: number;
  skill: { key: string; name: string };
  why: string[];
  trace: { milestoneId?: string; roadmapRevisionId?: string };
}

interface TodayData {
  date: string;
  timezone: string;
  nextTaskId: string | null;
  week: {
    id: string;
    weekStart: string;
    capacity: {
      rawMinutes: number;
      allocatableMinutes: number;
      scheduledMinutes: number;
      catchupMinutes: number;
    };
  };
  day: {
    date: string;
    rawMinutes: number;
    scheduledMinutes: number;
    tasks: TodayTask[];
  };
}

function clock(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function TodayDashboard() {
  const [data, setData] = useState<TodayData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [skipReasons, setSkipReasons] = useState<Record<string, string>>({});
  const [rescheduleDates, setRescheduleDates] = useState<
    Record<string, string>
  >({});
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});

  const load = useCallback(async (): Promise<void> => {
    const response = await fetch(`${apiUrl}/plans/today`, {
      credentials: "include",
    });
    const body = (await response.json()) as TodayData & { detail?: string };
    if (!response.ok)
      throw new Error(body.detail ?? "Today’s plan could not be loaded");
    setData(body);
    setState("ready");
  }, []);

  useEffect(() => {
    void load().catch((error: unknown) => {
      setMessage(
        error instanceof Error
          ? error.message
          : "Today’s plan could not be loaded",
      );
      setState("error");
    });
  }, [load]);

  const command = async (
    task: TodayTask,
    action: "START" | "SKIP" | "RESCHEDULE" | "PARTIAL",
  ): Promise<void> => {
    setPendingId(task.id);
    setMessage("");
    try {
      const response = await fetch(`${apiUrl}/task-occurrences/${task.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: mutationHeaders({
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        }),
        body: JSON.stringify({
          command: action,
          expectedVersion: task.lockVersion,
          ...(action === "SKIP"
            ? { skipReason: skipReasons[task.id] ?? "NO_TIME" }
            : {}),
          ...(action === "RESCHEDULE"
            ? { rescheduleDate: rescheduleDates[task.id] }
            : {}),
          ...(action === "PARTIAL"
            ? {
                partialMinutes: Math.max(
                  task.partialMinutes + 1,
                  Math.floor(task.estimatedMinutes / 2),
                ),
              }
            : {}),
        }),
      });
      const body = (await response.json()) as { detail?: string };
      if (!response.ok)
        throw new Error(body.detail ?? "Task could not be updated");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Task could not be updated",
      );
    } finally {
      setPendingId(null);
    }
  };

  const complete = async (task: TodayTask): Promise<void> => {
    setPendingId(task.id);
    setMessage("");
    try {
      const response = await fetch(
        `${apiUrl}/task-occurrences/${task.id}/completions`,
        {
          method: "POST",
          credentials: "include",
          headers: mutationHeaders({
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          }),
          body: JSON.stringify({
            expectedVersion: task.lockVersion,
            actualMinutes: task.estimatedMinutes,
            outcome:
              outcomes[task.id]?.trim() ||
              "Completed the planned reviewed learning checkpoint.",
          }),
        },
      );
      const body = (await response.json()) as { detail?: string };
      if (!response.ok)
        throw new Error(body.detail ?? "Task could not be completed");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Task could not be completed",
      );
    } finally {
      setPendingId(null);
    }
  };

  if (state === "loading") return <p role="status">Building today’s view…</p>;
  if (state === "error" || !data)
    return (
      <section className="today-empty">
        <p className="form-error" role="alert">
          {message}
        </p>
        <a className="button button-secondary" href="/roadmap">
          Open roadmap
        </a>
      </section>
    );

  const completed = data.day.tasks.filter(
    ({ status }) => status === "COMPLETED",
  ).length;
  return (
    <div className="today-dashboard">
      <section className="today-overview">
        <div>
          <span>Today</span>
          <strong>
            {completed}/{data.day.tasks.length} tasks complete
          </strong>
        </div>
        <div>
          <span>Planned</span>
          <strong>{data.day.scheduledMinutes} min</strong>
        </div>
        <div>
          <span>Weekly reserve</span>
          <strong>{data.week.capacity.catchupMinutes} min</strong>
        </div>
      </section>
      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
      {data.day.tasks.length === 0 ? (
        <section className="today-empty">
          <strong>No scheduled work today</strong>
          <span>
            Your reserve remains protected. Inspect the week before adding load.
          </span>
          <a className="button button-secondary" href="/plan/week">
            View this week
          </a>
        </section>
      ) : (
        <ol className="today-task-list">
          {data.day.tasks.map((task, index) => {
            const dominant = task.id === data.nextTaskId;
            const pending = pendingId === task.id;
            return (
              <li
                key={task.id}
                className={
                  dominant ? "today-task today-task-next" : "today-task"
                }
              >
                <div className="today-task-time">
                  <span>{clock(task.startMinute)}</span>
                  <small>{task.estimatedMinutes} min</small>
                </div>
                <div className="today-task-main">
                  <span className="task-label">
                    {index + 1} · {task.track}
                  </span>
                  <h2>{task.skill.name}</h2>
                  <p>{task.title}</p>
                  <small>
                    Why: {task.why.join(" · ") || "Required roadmap milestone"}
                  </small>
                  <div className="task-status-row">
                    <span
                      className={`task-state task-state-${task.status.toLowerCase()}`}
                    >
                      {task.status.replaceAll("_", " ")}
                    </span>
                    <span>Trace {task.trace.milestoneId?.slice(0, 8)}…</span>
                  </div>
                  {task.status === "PLANNED" ? (
                    <div className="task-controls">
                      <button
                        className={
                          dominant
                            ? "button button-primary"
                            : "button button-secondary"
                        }
                        disabled={pending}
                        onClick={() => void command(task, "START")}
                      >
                        {pending ? "Updating…" : "Start"}
                      </button>
                      <label>
                        Skip reason
                        <select
                          value={skipReasons[task.id] ?? "NO_TIME"}
                          onChange={(event) =>
                            setSkipReasons((current) => ({
                              ...current,
                              [task.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="NO_TIME">No time</option>
                          <option value="TOO_DIFFICULT">Too difficult</option>
                          <option value="ALREADY_KNEW">Already knew</option>
                          <option value="NOT_RELEVANT">Not relevant</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </label>
                      <button
                        className="button button-quiet"
                        disabled={pending}
                        onClick={() => void command(task, "SKIP")}
                      >
                        Skip
                      </button>
                      <label>
                        Move to
                        <input
                          type="date"
                          value={rescheduleDates[task.id] ?? ""}
                          onChange={(event) =>
                            setRescheduleDates((current) => ({
                              ...current,
                              [task.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <button
                        className="button button-quiet"
                        disabled={pending || !rescheduleDates[task.id]}
                        onClick={() => void command(task, "RESCHEDULE")}
                      >
                        Reschedule
                      </button>
                    </div>
                  ) : null}
                  {task.status === "IN_PROGRESS" ||
                  task.status === "PARTIAL" ? (
                    <div className="task-controls task-completion-controls">
                      <label>
                        Outcome note
                        <input
                          value={outcomes[task.id] ?? ""}
                          placeholder="What did you finish?"
                          onChange={(event) =>
                            setOutcomes((current) => ({
                              ...current,
                              [task.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <button
                        className={
                          dominant
                            ? "button button-primary"
                            : "button button-secondary"
                        }
                        disabled={pending}
                        onClick={() => void complete(task)}
                      >
                        Complete
                      </button>
                      {task.status === "IN_PROGRESS" ? (
                        <button
                          className="button button-quiet"
                          disabled={pending}
                          onClick={() => void command(task, "PARTIAL")}
                        >
                          Save partial
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { CareerRoleOption } from "@studentos/contracts";
import { mutationHeaders } from "../lib/http";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

interface DiffTask {
  id: string;
  skillKey: string;
  minutes: number;
  targetDate: string;
  state: string;
}

interface RevisionDiff {
  id: string;
  version: number;
  status: string;
  kind: string;
  consentRequired: boolean;
  hoursMovedPercent: number;
  milestoneDateChanges: number;
  retained: Array<{ proposed: DiffTask; locked: boolean }>;
  changed: Array<{ proposed: DiffTask; minutesDelta: number }>;
  new: DiffTask[];
  noLongerRequired: DiffTask[];
  summary: {
    previousVersion: number;
    proposedVersion: number;
    previousMinutes: number;
    proposedMinutes: number;
    reason: string;
  };
}

function TaskGroup({
  title,
  items,
}: {
  title: string;
  items: Array<{ task: DiffTask; note?: string }>;
}) {
  return (
    <section className="diff-group">
      <div className="section-row">
        <h3>{title}</h3>
        <span>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="muted-copy">No tasks in this group.</p>
      ) : (
        <ul>
          {items.slice(0, 20).map(({ task, note }) => (
            <li key={task.id}>
              <div>
                <strong>{task.skillKey}</strong>
                <small>
                  {task.state} · due {task.targetDate}
                </small>
              </div>
              <span>
                {task.minutes} min{note ? ` · ${note}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RoadmapRecalculation() {
  const [roles, setRoles] = useState<CareerRoleOption[]>([]);
  const [kind, setKind] = useState("MATERIAL");
  const [roleId, setRoleId] = useState("");
  const [diff, setDiff] = useState<RevisionDiff | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch(`${apiUrl}/catalog/career-roles`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Role catalog is unavailable");
        return (await response.json()) as CareerRoleOption[];
      })
      .then(setRoles)
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Role catalog is unavailable",
        ),
      );
  }, []);

  const preview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${apiUrl}/roadmap-revisions`, {
        method: "POST",
        credentials: "include",
        headers: mutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          kind,
          reason: form.get("reason"),
          ...(["ROLE", "CONTENT"].includes(kind)
            ? { targetRoleVersionId: roleId }
            : {}),
        }),
      });
      const body = (await response.json()) as RevisionDiff & {
        detail?: string;
      };
      if (!response.ok)
        throw new Error(body.detail ?? "Revision preview could not be created");
      setDiff(body);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Revision preview could not be created",
      );
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: "activate" | "reject") => {
    if (!diff) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `${apiUrl}/roadmap-revisions/${diff.id}/${decision}`,
        {
          method: "POST",
          credentials: "include",
          headers: mutationHeaders({
            "content-type": "application/json",
            ...(decision === "activate"
              ? { "if-match": `"${diff.summary.previousVersion}"` }
              : {}),
          }),
          body: "{}",
        },
      );
      const body = (await response.json()) as { detail?: string };
      if (!response.ok)
        throw new Error(body.detail ?? `Revision could not be ${decision}d`);
      setMessage(
        decision === "activate"
          ? `Roadmap v${diff.version} is now active.`
          : "The preview was rejected; your active roadmap is unchanged.",
      );
      setDiff(null);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Revision could not be saved",
      );
    } finally {
      setBusy(false);
    }
  };

  if (diff)
    return (
      <div className="revision-preview">
        <section className="revision-summary">
          <p className="eyebrow">Consent required</p>
          <h2>
            Roadmap v{diff.summary.previousVersion} → v{diff.version}
          </h2>
          <p>{diff.summary.reason}</p>
          <div className="adaptation-metrics">
            <div>
              <span>Previous scope</span>
              <strong>{diff.summary.previousMinutes} min</strong>
            </div>
            <div>
              <span>Proposed scope</span>
              <strong>{diff.summary.proposedMinutes} min</strong>
            </div>
            <div>
              <span>Hours moved</span>
              <strong>{Math.round(diff.hoursMovedPercent)}%</strong>
            </div>
            <div>
              <span>Date changes</span>
              <strong>{diff.milestoneDateChanges}</strong>
            </div>
          </div>
        </section>
        <div className="diff-grid">
          <TaskGroup
            title="Retained"
            items={diff.retained.map(({ proposed, locked }) => ({
              task: proposed,
              note: locked ? "history locked" : "unchanged",
            }))}
          />
          <TaskGroup
            title="Changed"
            items={diff.changed.map(({ proposed, minutesDelta }) => ({
              task: proposed,
              note: `${minutesDelta >= 0 ? "+" : ""}${minutesDelta} min`,
            }))}
          />
          <TaskGroup title="New" items={diff.new.map((task) => ({ task }))} />
          <TaskGroup
            title="No longer required"
            items={diff.noLongerRequired.map((task) => ({ task }))}
          />
        </div>
        <div className="revision-actions">
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() => void decide("activate")}
          >
            Accept and activate
          </button>
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={() => void decide("reject")}
          >
            Reject preview
          </button>
        </div>
        {message ? (
          <p className="form-error" role="alert">
            {message}
          </p>
        ) : null}
      </div>
    );

  return (
    <form
      className="adaptation-form revision-form"
      onSubmit={(event) => void preview(event)}
    >
      <label>
        Why should the roadmap change?
        <select value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="MATERIAL">Availability or material scope</option>
          <option value="EXAM">Exam calendar</option>
          <option value="ROLE">Target role</option>
          <option value="CONTENT">Published role content</option>
        </select>
      </label>
      {["ROLE", "CONTENT"].includes(kind) ? (
        <label>
          Target reviewed role
          <select
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
            required
          >
            <option value="">Select role</option>
            {roles.map((role) => (
              <option key={role.roleVersionId} value={role.roleVersionId}>
                {role.role.name} · v{role.role.version}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        Reason
        <textarea
          name="reason"
          minLength={3}
          maxLength={500}
          rows={4}
          required
          placeholder="Explain what changed so this version remains auditable."
        />
      </label>
      <p className="muted-copy">
        Completed history remains immutable. StudentOS will preview retained,
        changed, new, and removed future work before anything activates.
      </p>
      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
      <button className="button button-primary" disabled={busy}>
        {busy ? "Calculating…" : "Create revision preview"}
      </button>
    </form>
  );
}

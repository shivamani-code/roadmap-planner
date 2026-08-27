"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  CareerRoleOption,
  StudentCareerCatalog,
  TargetLevel,
} from "@studentos/contracts";
import { formatTargetLevel, roleLevel } from "../lib/career-options";
import { mutationHeaders } from "../lib/http";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export function CareerGoalForm() {
  const [roles, setRoles] = useState<CareerRoleOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [level, setLevel] = useState<TargetLevel | "">("");
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("");
  const [branch, setBranch] = useState<StudentCareerCatalog["branch"] | null>(
    null,
  );
  const [scope, setScope] = useState<"recommended" | "all">("recommended");
  const [status, setStatus] = useState<
    "loading" | "ready" | "saving" | "saved" | "error"
  >("loading");
  const [message, setMessage] = useState("");
  const selected = roles.find(
    ({ roleVersionId }) => roleVersionId === selectedId,
  );
  const summary = selected && level ? roleLevel(selected, level) : undefined;
  const scopedRoles = roles.filter(
    (item) => scope === "all" || item.relevance?.recommended,
  );
  const domains = [
    ...new Map(
      scopedRoles.map((item) => [item.domain.key, item.domain]),
    ).values(),
  ];
  const visibleRoles = scopedRoles.filter((item) => {
    const matchesDomain = !domain || item.domain.key === domain;
    const needle = query.trim().toLowerCase();
    const matchesQuery =
      !needle ||
      item.role.name.toLowerCase().includes(needle) ||
      item.domain.name.toLowerCase().includes(needle) ||
      item.targetLevels.some((target) =>
        target.topSkills.some((skill) => skill.toLowerCase().includes(needle)),
      );
    return matchesDomain && matchesQuery;
  });

  useEffect(() => {
    void fetch(`${apiUrl}/catalog/career-roles/for-student`, {
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Role catalog unavailable");
        return (await response.json()) as StudentCareerCatalog;
      })
      .then((data) => {
        setRoles(data.roles);
        setBranch(data.branch);
        setStatus("ready");
      })
      .catch(() => {
        setMessage("We could not load the reviewed career catalog.");
        setStatus("error");
      });
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!selected || !level) return;
    const form = new FormData(event.currentTarget);
    const deadline = form.get("deadline");
    setStatus("saving");
    try {
      const response = await fetch(`${apiUrl}/onboarding/career-goal`, {
        method: "PUT",
        credentials: "include",
        headers: mutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          roleVersionId: selected.roleVersionId,
          targetLevel: level,
          deadline,
          deadlineBasis: "PLACEMENT",
        }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string };
        throw new Error(problem.detail ?? "Goal could not be saved");
      }
      setStatus("saved");
      setMessage("Goal saved against the exact reviewed role version.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Goal could not be saved",
      );
    }
  };

  if (status === "loading") return <p role="status">Loading reviewed roles…</p>;
  if (roles.length === 0)
    return (
      <div className="empty-state">
        <strong>No reviewed roles are published yet</strong>
        <span>
          StudentOS will not invent a role graph. Check again when expert review
          is complete.
        </span>
      </div>
    );

  return (
    <form className="career-form" onSubmit={(event) => void submit(event)}>
      <fieldset className="role-grid">
        <legend>
          Choose a role that connects with {branch?.code ?? "your branch"}
        </legend>
        <div className="role-scope-panel">
          <div>
            <strong>{branch?.name ?? "Selected branch"}</strong>
            <span>
              {branch?.degree} · {branch?.curriculumVersion}. Recommendations
              are ranked from reviewed subject-to-skill mappings, not from the
              role name alone.
            </span>
          </div>
          <div className="role-scope-switch" aria-label="Role catalog scope">
            <button
              type="button"
              className={scope === "recommended" ? "scope-active" : ""}
              aria-pressed={scope === "recommended"}
              onClick={() => {
                setScope("recommended");
                setDomain("");
                if (selected && !selected.relevance?.recommended) {
                  setSelectedId("");
                  setLevel("");
                }
              }}
            >
              Recommended (
              {roles.filter((role) => role.relevance?.recommended).length})
            </button>
            <button
              type="button"
              className={scope === "all" ? "scope-active" : ""}
              aria-pressed={scope === "all"}
              onClick={() => {
                setScope("all");
                setDomain("");
              }}
            >
              Browse all reviewed ({roles.length})
            </button>
          </div>
        </div>
        <div className="role-catalog-controls">
          <label>
            Search role or skill
            <input
              type="search"
              value={query}
              placeholder="Data, VLSI, civil, cloud…"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label>
            Career domain
            <select
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
            >
              <option value="">All {domains.length} visible domains</option>
              {domains.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="role-catalog-count" role="status">
          Showing {visibleRoles.length} role
          {visibleRoles.length === 1 ? "" : "s"}
          {scope === "recommended"
            ? ` connected most strongly to ${branch?.code ?? "your branch"}`
            : " from the complete reviewed catalog"}
        </div>
        <div className="role-card-grid">
          {visibleRoles.map((item) => (
            <label
              className={
                selectedId === item.roleVersionId
                  ? "role-card role-card-selected"
                  : "role-card"
              }
              key={item.roleVersionId}
            >
              <input
                type="radio"
                name="role"
                value={item.roleVersionId}
                checked={selectedId === item.roleVersionId}
                onChange={() => {
                  setSelectedId(item.roleVersionId);
                  setLevel("");
                }}
              />
              <span>{item.domain.name}</span>
              <strong>{item.role.name}</strong>
              <small>
                Version {item.role.version} · {item.targetLevels.length} target
                level(s)
              </small>
              {item.relevance ? (
                <div className="role-relevance">
                  <b>{item.relevance.band.replaceAll("_", " ")}</b>
                  <span>
                    {item.relevance.matchedSkillCount}/
                    {item.relevance.totalSkillCount} entry skills supported
                  </span>
                  {item.relevance.matchedSkills.length ? (
                    <small>{item.relevance.matchedSkills.join(" · ")}</small>
                  ) : (
                    <small>Independent exploration path</small>
                  )}
                </div>
              ) : null}
            </label>
          ))}
        </div>
        {visibleRoles.length === 0 ? (
          <div className="empty-state">
            <strong>No role matches these filters</strong>
            <span>
              Clear the search or browse all reviewed roles. StudentOS keeps
              every published role available even when it is not recommended for
              this branch.
            </span>
          </div>
        ) : null}
      </fieldset>
      <div className="field-grid">
        <label>
          Target level
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value as TargetLevel)}
            disabled={!selected}
            required
          >
            <option value="">Select target</option>
            {(selected?.targetLevels ?? []).map(({ level: itemLevel }) => (
              <option key={itemLevel} value={itemLevel}>
                {formatTargetLevel(itemLevel)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Target date
          <input name="deadline" type="date" required />
        </label>
      </div>
      {summary ? (
        <section className="role-summary" aria-label="Role comparison summary">
          <div>
            <span>Required skills</span>
            <strong>{summary.requiredSkillCount}</strong>
          </div>
          <div>
            <span>Typical effort</span>
            <strong>{summary.estimatedHoursP50}h</strong>
          </div>
          <div>
            <span>Leading skills</span>
            <strong>{summary.topSkills.join(", ")}</strong>
          </div>
          <div>
            <span>Portfolio proof</span>
            <strong>1 role-specific capstone</strong>
          </div>
          <p className="role-horizon-note">
            {selected?.relevance?.explanation}{" "}
            {selected?.relevance?.supportingSubjects.length
              ? `Supporting subjects include ${selected?.relevance?.supportingSubjects.join(
                  ", ",
                )}. `
              : ""}
            At five focused hours per week, the typical{" "}
            {summary.estimatedHoursP50}h effort is roughly{" "}
            {Math.ceil(summary.estimatedHoursP50 / 5)} weeks. Your later
            availability step will calculate the exact fit.
          </p>
        </section>
      ) : null}
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
          href="/onboarding/assessment"
        >
          Continue to assessment
        </a>
      ) : null}
      <button
        className="button button-primary full-button"
        disabled={!summary || status === "saving" || status === "saved"}
      >
        {status === "saving" ? "Saving…" : "Save goal and continue"}
      </button>
    </form>
  );
}

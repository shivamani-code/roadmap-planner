"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { usePlanner } from "./planner-provider";
import {
  getBranch,
  rankedRoles,
  targetLabel,
  words,
  type TargetLevel,
} from "../lib/local-planner";

export function CareerGoalForm() {
  const router = useRouter();
  const { profile, setGoal } = usePlanner();
  const branch = getBranch(profile.academic?.branchCode);
  const roles = useMemo(
    () => rankedRoles(profile.academic?.branchCode ?? ""),
    [profile.academic?.branchCode],
  );
  const [selectedId, setSelectedId] = useState(profile.goal?.roleKey ?? "");
  const [level, setLevel] = useState<TargetLevel | "">(
    profile.goal?.targetLevel ?? "",
  );
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("");
  const selected = roles.find((role) => role.key === selectedId);
  const domains = [...new Set(roles.map((role) => role.domainKey))];
  const visibleRoles = roles.filter((role) => {
    const needle = query.trim().toLowerCase();
    return (
      (!domain || role.domainKey === domain) &&
      (!needle ||
        role.name.toLowerCase().includes(needle) ||
        role.matchedSkills.some((skill) =>
          skill.toLowerCase().includes(needle),
        ))
    );
  });
  const target = selected?.targetLevels.find((item) => item.level === level);
  const today = new Date().toISOString().slice(0, 10);
  const typicalHours = target?.requirements.reduce(
    (total, requirement) => total + requirement.hours.p50,
    0,
  );

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!selected || !level) return;
    const values = new FormData(event.currentTarget);
    const deadline = values.get("deadline");
    if (typeof deadline !== "string") return;
    setGoal({
      roleKey: selected.key,
      targetLevel: level,
      deadline,
    });
    router.push("/onboarding/assessment");
  }

  if (!branch)
    return (
      <div className="empty-state">
        <strong>Choose your branch first</strong>
        <a className="button button-secondary" href="/onboarding">
          Return to step 1
        </a>
      </div>
    );

  return (
    <form className="career-form" onSubmit={submit}>
      <fieldset className="role-grid">
        <legend>Roles connected to {branch.code}</legend>
        <div className="role-scope-panel">
          <div>
            <strong>{branch.name}</strong>
            <span>
              Showing only roles with reviewed skill overlap with your branch.
              Strongest matches appear first.
            </span>
          </div>
        </div>
        <div className="role-catalog-controls">
          <label>
            Search role or skill
            <input
              type="search"
              value={query}
              placeholder="Data, cloud, VLSI, design…"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label>
            Career domain
            <select
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
            >
              <option value="">All relevant domains</option>
              {domains.map((item) => (
                <option key={item} value={item}>
                  {words(item)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="role-catalog-count" role="status">
          Showing {visibleRoles.length} relevant role
          {visibleRoles.length === 1 ? "" : "s"} for {branch.code}
        </div>
        <div className="role-card-grid">
          {visibleRoles.map((role) => (
            <label
              className={
                selectedId === role.key
                  ? "role-card role-card-selected"
                  : "role-card"
              }
              key={role.key}
            >
              <input
                type="radio"
                name="role"
                value={role.key}
                checked={selectedId === role.key}
                onChange={() => {
                  setSelectedId(role.key);
                  setLevel("");
                }}
              />
              <span>{words(role.domainKey)}</span>
              <strong>{role.name}</strong>
              <small>{role.matchedSkills.join(" · ")}</small>
              <div className="role-relevance">
                <b>Branch connected</b>
                <span>
                  {role.supportingSubjects.length} supporting subjects
                </span>
                <small>{role.supportingSubjects.join(" · ")}</small>
              </div>
            </label>
          ))}
        </div>
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
            {(selected?.targetLevels ?? []).map((item) => (
              <option key={item.level} value={item.level}>
                {targetLabel(item.level)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Target date
          <input
            name="deadline"
            type="date"
            min={today}
            required
            defaultValue={profile.goal?.deadline}
          />
        </label>
      </div>
      {target ? (
        <section className="role-summary" aria-label="Role summary">
          <div>
            <span>Required skills</span>
            <strong>
              {target.requirements.filter((item) => item.required).length}
            </strong>
          </div>
          <div>
            <span>Typical full effort</span>
            <strong>{typicalHours}h</strong>
          </div>
          <div>
            <span>Supporting subjects</span>
            <strong>
              {selected?.supportingSubjects.join(", ") || "Independent track"}
            </strong>
          </div>
        </section>
      ) : null}
      <button className="button button-primary full-button" disabled={!target}>
        Continue to skill check
      </button>
    </form>
  );
}

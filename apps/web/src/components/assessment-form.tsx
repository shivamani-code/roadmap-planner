"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { usePlanner } from "./planner-provider";
import { assessmentSkills, words } from "../lib/local-planner";

const levels = [
  { value: 0, label: "Not started" },
  { value: 0.25, label: "I understand the basics" },
  { value: 0.5, label: "I can complete guided work" },
  { value: 0.75, label: "I can build independently" },
  { value: 1, label: "Interview / production ready" },
];

export function AssessmentForm() {
  const router = useRouter();
  const { profile, setSkillLevels } = usePlanner();
  const skills = assessmentSkills(profile);
  const [responses, setResponses] = useState<Record<string, number>>(
    profile.skillLevels,
  );

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (skills.some((skill) => responses[skill.key] === undefined)) return;
    setSkillLevels(responses);
    router.push("/onboarding/availability");
  }

  if (skills.length === 0)
    return (
      <div className="empty-state">
        <strong>Choose a career goal first</strong>
        <a className="button button-secondary" href="/onboarding/goal">
          Return to career roles
        </a>
      </div>
    );

  return (
    <form className="assessment-form" onSubmit={submit}>
      {skills.map((skill, index) => (
        <fieldset key={skill.key}>
          <legend>
            <span>
              {index + 1} · {words(skill.category)}
            </span>
            How confidently can you demonstrate {skill.name}?
          </legend>
          <select
            aria-label={`Level for ${skill.name}`}
            value={responses[skill.key] ?? ""}
            onChange={(event) =>
              setResponses((current) => ({
                ...current,
                [skill.key]: Number(event.target.value),
              }))
            }
            required
          >
            <option value="">Choose the closest level</option>
            {levels.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </select>
        </fieldset>
      ))}
      <p className="form-status" role="note">
        This quick self-check is calculated only in your browser and is not
        uploaded or saved.
      </p>
      <button className="button button-primary full-button">
        Continue to availability
      </button>
    </form>
  );
}

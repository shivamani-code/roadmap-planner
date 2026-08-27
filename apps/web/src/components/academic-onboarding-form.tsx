"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { usePlanner } from "./planner-provider";
import { catalog, getBranch } from "../lib/local-planner";

export function AcademicOnboardingForm() {
  const router = useRouter();
  const { profile, setAcademic } = usePlanner();
  const [branchCode, setBranchCode] = useState(
    profile.academic?.branchCode ?? "",
  );
  const branch = getBranch(branchCode);
  const today = new Date().toISOString().slice(0, 10);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!branch) return;
    const values = new FormData(event.currentTarget);
    const expectedGraduation = values.get("expectedGraduation");
    if (typeof expectedGraduation !== "string") return;
    setAcademic({
      branchCode,
      currentSemester: Number(values.get("currentSemester")),
      expectedGraduation,
    });
    router.push("/onboarding/goal");
  }

  return (
    <form className="academic-form" onSubmit={submit}>
      <div className="field-grid">
        <label>
          University
          <input value={catalog.university.name} readOnly />
        </label>
        <label>
          Regulation
          <input value={catalog.regulation.name} readOnly />
        </label>
        <label>
          Degree
          <input value={catalog.degree.name} readOnly />
        </label>
        <label>
          Branch
          <select
            value={branchCode}
            onChange={(event) => setBranchCode(event.target.value)}
            required
          >
            <option value="">Select branch</option>
            {catalog.branches.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name} ({item.code})
              </option>
            ))}
          </select>
        </label>
        <label>
          Current semester
          <select
            name="currentSemester"
            disabled={!branch}
            required
            defaultValue={profile.academic?.currentSemester ?? ""}
          >
            <option value="">Select semester</option>
            {(branch?.availableSemesters ?? []).map((number) => (
              <option key={number} value={number}>
                Semester {number}
              </option>
            ))}
          </select>
        </label>
        <label>
          Expected graduation
          <input
            name="expectedGraduation"
            type="date"
            min={today}
            required
            defaultValue={profile.academic?.expectedGraduation}
          />
        </label>
      </div>
      <div className="form-warning" role="note">
        <strong>Private, temporary planning</strong>
        <p>
          Your answers stay only in this open page. StudentOS sends nothing to a
          server and saves no student profile.
        </p>
      </div>
      <button className="button button-primary full-button" disabled={!branch}>
        Continue to career goal
      </button>
    </form>
  );
}

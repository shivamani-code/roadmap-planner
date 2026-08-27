"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AcademicOption } from "@studentos/contracts";
import { mutationHeaders } from "../lib/http";
import {
  dependentOptions,
  selectedProgram,
  type AcademicSelection,
} from "../lib/academic-options";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const emptySelection: AcademicSelection = {
  universityId: "",
  regulationId: "",
  degreeId: "",
  branchId: "",
};

export function AcademicOnboardingForm() {
  const [programs, setPrograms] = useState<AcademicOption[]>([]);
  const [selection, setSelection] = useState<AcademicSelection>(emptySelection);
  const [state, setState] = useState<
    "loading" | "ready" | "saving" | "saved" | "error"
  >("loading");
  const [message, setMessage] = useState("");
  const options = useMemo(
    () => dependentOptions(programs, selection),
    [programs, selection],
  );
  const program = selectedProgram(programs, selection);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${apiUrl}/catalog/academic-options`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Catalog unavailable");
        return (await response.json()) as AcademicOption[];
      })
      .then((data) => {
        setPrograms(data);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setMessage(
          "We could not load the verified academic catalog. Try again shortly.",
        );
        setState("error");
      });
    return () => controller.abort();
  }, []);

  const choose = (field: keyof AcademicSelection, value: string): void => {
    setSelection((current) => {
      if (field === "universityId")
        return {
          universityId: value,
          regulationId: "",
          degreeId: "",
          branchId: "",
        };
      if (field === "regulationId")
        return { ...current, regulationId: value, degreeId: "", branchId: "" };
      if (field === "degreeId")
        return { ...current, degreeId: value, branchId: "" };
      return { ...current, branchId: value };
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!program) return;
    const values = new FormData(event.currentTarget);
    setState("saving");
    setMessage("");
    try {
      const response = await fetch(`${apiUrl}/onboarding/academic-profile`, {
        method: "PUT",
        credentials: "include",
        headers: mutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          curriculumProgramId: program.programId,
          currentSemester: Number(values.get("currentSemester")),
          expectedGraduation: values.get("expectedGraduation"),
          ...(values.get("cgpa") ? { cgpa: Number(values.get("cgpa")) } : {}),
          ...(values.get("backlogCount")
            ? { backlogCount: Number(values.get("backlogCount")) }
            : {}),
        }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string };
        throw new Error(problem.detail ?? "Profile could not be saved");
      }
      setState("saved");
      setMessage(
        "Academic profile saved. Your exact curriculum version is now frozen for planning.",
      );
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error ? error.message : "Profile could not be saved",
      );
    }
  };

  if (state === "loading")
    return <p role="status">Loading verified academic options…</p>;
  if (programs.length === 0) {
    return (
      <div className="empty-state" role="status">
        <strong>No published programs yet</strong>
        <span>
          Your curriculum is never guessed. Ask to be notified when your
          verified program is available.
        </span>
      </div>
    );
  }

  return (
    <form className="academic-form" onSubmit={(event) => void submit(event)}>
      <div className="field-grid">
        <label>
          University
          <select
            value={selection.universityId}
            onChange={(event) => choose("universityId", event.target.value)}
            required
          >
            <option value="">Select university</option>
            {options.universities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Regulation
          <select
            value={selection.regulationId}
            onChange={(event) => choose("regulationId", event.target.value)}
            disabled={!selection.universityId}
            required
          >
            <option value="">Select regulation</option>
            {options.regulations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Degree
          <select
            value={selection.degreeId}
            onChange={(event) => choose("degreeId", event.target.value)}
            disabled={!selection.regulationId}
            required
          >
            <option value="">Select degree</option>
            {options.degrees.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Branch
          <select
            value={selection.branchId}
            onChange={(event) => choose("branchId", event.target.value)}
            disabled={!selection.degreeId}
            required
          >
            <option value="">Select branch</option>
            {options.branches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Current semester
          <select
            name="currentSemester"
            disabled={!program}
            required
            defaultValue=""
          >
            <option value="">Select semester</option>
            {(program?.availableSemesters ?? []).map((number) => (
              <option key={number} value={number}>
                Semester {number}
              </option>
            ))}
          </select>
        </label>
        <label>
          Expected graduation
          <input name="expectedGraduation" type="date" required />
        </label>
        <label>
          CGPA <span>Optional</span>
          <input
            name="cgpa"
            type="number"
            min="0"
            max="10"
            step="0.01"
            inputMode="decimal"
          />
        </label>
        <label>
          Active backlogs <span>Optional</span>
          <input
            name="backlogCount"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
          />
        </label>
      </div>
      {program?.coverageStatus === "PARTIAL" ? (
        <div className="form-warning" role="status">
          <strong>I–II year syllabus currently published</strong>
          <p>
            Planning will use the published semesters and will mark skills with
            no reviewed subject mapping as independent work. StudentOS will not
            invent later-semester subjects.
          </p>
        </div>
      ) : null}
      <label className="confirmation-row">
        <input name="affiliationConfirmed" type="checkbox" required />
        <span>
          My college is non-autonomous, affiliated to JNTUH, and my admission
          batch follows R25.
        </span>
      </label>
      {message ? (
        <p
          className={state === "saved" ? "form-success" : "form-error"}
          role="status"
        >
          {message}
        </p>
      ) : null}
      {state === "saved" ? (
        <a
          className="button button-secondary full-button"
          href="/onboarding/goal"
        >
          Continue to career goal
        </a>
      ) : null}
      <button
        className="button button-primary full-button"
        disabled={!program || state === "saving"}
      >
        {state === "saving"
          ? "Saving…"
          : state === "saved"
            ? "Saved"
            : "Save and continue"}
      </button>
    </form>
  );
}

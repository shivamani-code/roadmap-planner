"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { usePlanner } from "./planner-provider";

const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function AvailabilityForm() {
  const router = useRouter();
  const { profile, setAvailability } = usePlanner();
  const [weeklyMinutes, setWeeklyMinutes] = useState(
    profile.availability?.dailyMinutes.reduce(
      (total, item) => total + item,
      0,
    ) ?? 300,
  );

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (weeklyMinutes < 30) return;
    const form = new FormData(event.currentTarget);
    setAvailability({
      maxSessionMinutes: Number(form.get("maxSessionMinutes")),
      dailyMinutes: days.map((_, index) => Number(form.get(`day-${index}`))),
    });
    router.push("/gap");
  }

  function updateTotal(form: HTMLFormElement): void {
    const values = new FormData(form);
    setWeeklyMinutes(
      days.reduce(
        (total, _, index) => total + Number(values.get(`day-${index}`)),
        0,
      ),
    );
  }

  return (
    <form
      className="availability-form"
      onSubmit={submit}
      onChange={(event) => updateTotal(event.currentTarget)}
    >
      <label>
        Maximum focused session (minutes)
        <input
          name="maxSessionMinutes"
          type="number"
          min="15"
          max="240"
          step="15"
          defaultValue={profile.availability?.maxSessionMinutes ?? 90}
          required
        />
      </label>
      <fieldset className="day-list">
        <legend>Minutes you can study each day</legend>
        {days.map((day, index) => (
          <label key={day}>
            <span>{day}</span>
            <input
              name={`day-${index}`}
              aria-label={`${day} available minutes`}
              type="number"
              min="0"
              max="240"
              step="15"
              defaultValue={
                profile.availability?.dailyMinutes[index] ??
                (index >= 1 && index <= 5 ? 60 : 0)
              }
            />
          </label>
        ))}
      </fieldset>
      <p
        className={weeklyMinutes < 30 ? "form-error" : "form-success"}
        role="status"
      >
        {weeklyMinutes < 30
          ? "Add at least 30 minutes on one day to create a usable roadmap."
          : `${weeklyMinutes} minutes declared · ${Math.floor(weeklyMinutes * 0.85)} minutes planned after a 15% buffer`}
      </p>
      <button
        className="button button-primary full-button"
        disabled={weeklyMinutes < 30}
      >
        Build my gap report
      </button>
    </form>
  );
}

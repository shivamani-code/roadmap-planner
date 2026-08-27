"use client";

import { useState, type FormEvent } from "react";
import { mutationHeaders } from "../lib/http";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
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
  const [status, setStatus] = useState<"ready" | "saving" | "saved" | "error">(
    "ready",
  );
  const [message, setMessage] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const windows = days.flatMap((_, day) => {
      const minutes = Number(form.get(`day-${day}`));
      return minutes > 0
        ? [{ day, startMinute: 1080, endMinute: 1080 + minutes }]
        : [];
    });
    setStatus("saving");
    try {
      const response = await fetch(`${apiUrl}/study-availability`, {
        method: "PUT",
        credentials: "include",
        headers: mutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          timezone: form.get("timezone"),
          maxSessionMinutes: Number(form.get("maxSessionMinutes")),
          windows,
        }),
      });
      const body = (await response.json()) as {
        detail?: string;
        weeklyMinutes?: number;
        allocatableMinutes?: number;
      };
      if (!response.ok)
        throw new Error(body.detail ?? "Availability could not be saved");
      setMessage(
        `${body.weeklyMinutes} minutes declared; ${body.allocatableMinutes} minutes are initially allocatable after the 15% reserve.`,
      );
      setStatus("saved");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Availability could not be saved",
      );
      setStatus("error");
    }
  };
  return (
    <form
      className="availability-form"
      onSubmit={(event) => void submit(event)}
    >
      <label>
        Timezone
        <input name="timezone" defaultValue="Asia/Kolkata" required />
      </label>
      <label>
        Maximum session (minutes)
        <input
          name="maxSessionMinutes"
          type="number"
          min="10"
          max="240"
          defaultValue="90"
          required
        />
      </label>
      <fieldset className="day-list">
        <legend>Minutes available from 6:00 PM each day</legend>
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
              defaultValue={index >= 1 && index <= 5 ? "60" : "0"}
            />
          </label>
        ))}
      </fieldset>
      {message ? (
        <p
          className={status === "saved" ? "form-success" : "form-error"}
          role="status"
        >
          {message}
        </p>
      ) : null}
      {status === "saved" ? (
        <a className="button button-secondary full-button" href="/gap">
          Review my gap
        </a>
      ) : null}
      <button
        className="button button-primary full-button"
        disabled={status === "saving"}
      >
        {status === "saving" ? "Saving…" : "Save availability"}
      </button>
    </form>
  );
}

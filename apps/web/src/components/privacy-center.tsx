"use client";

import { useEffect, useState, type FormEvent } from "react";
import { mutationHeaders } from "../lib/http";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export function PrivacyCenter() {
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch(`${apiUrl}/privacy/preferences`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Sign in to manage privacy controls.");
        return (await response.json()) as { analyticsConsent: boolean };
      })
      .then((body) => setAnalyticsConsent(body.analyticsConsent))
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Privacy controls could not be loaded.",
        ),
      );
  }, []);

  async function saveConsent(): Promise<void> {
    setBusy(true);
    setError("");
    const response = await fetch(`${apiUrl}/privacy/preferences`, {
      method: "PUT",
      credentials: "include",
      headers: mutationHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ analyticsConsent }),
    });
    setBusy(false);
    if (!response.ok) {
      setError("Analytics preference could not be saved.");
      return;
    }
    setMessage("Analytics preference saved independently.");
  }

  async function downloadExport(): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/privacy/export`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Your export could not be prepared.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "studentos-data-export.json";
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Your machine-readable export was downloaded.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Export download failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const comment = form.get("comment");
    const response = await fetch(`${apiUrl}/pilot/feedback`, {
      method: "POST",
      credentials: "include",
      headers: mutationHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        surface: form.get("surface"),
        rating: Number(form.get("rating")),
        comment:
          (typeof comment === "string" ? comment.trim() : "") || undefined,
      }),
    });
    setBusy(false);
    if (!response.ok) {
      setError("Feedback could not be saved.");
      return;
    }
    event.currentTarget.reset();
    setMessage("Feedback saved for the pilot review team.");
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch(`${apiUrl}/privacy/account-deletion`, {
      method: "POST",
      credentials: "include",
      headers: mutationHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ confirmation }),
    });
    setBusy(false);
    if (!response.ok) {
      setError("Account deletion could not be requested.");
      return;
    }
    window.location.assign("/sign-in?account=deletion-pending");
  }

  return (
    <div className="privacy-center">
      {message && (
        <p className="form-status" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <section className="privacy-card" aria-labelledby="analytics-heading">
        <p className="eyebrow">Independent consent</p>
        <h2 id="analytics-heading">Product analytics</h2>
        <p>
          Optional analytics uses pseudonymous meaningful actions to measure
          onboarding, activation, and retention. It never includes answers,
          CGPA, backlog count, notes, artifact links, email, or AI prompts.
        </p>
        <label className="privacy-checkbox">
          <input
            type="checkbox"
            checked={analyticsConsent}
            onChange={(event) => setAnalyticsConsent(event.target.checked)}
          />
          Share pseudonymous product-usage analytics
        </label>
        <button
          className="button button-secondary"
          type="button"
          disabled={busy}
          onClick={() => void saveConsent()}
        >
          Save analytics preference
        </button>
      </section>

      <section className="privacy-card" aria-labelledby="export-heading">
        <p className="eyebrow">Your data</p>
        <h2 id="export-heading">Machine-readable export</h2>
        <p>
          Download identity, academic, career, plan, progress, communication,
          consent, and audit records. Session and verification secrets are
          excluded.
        </p>
        <button
          className="button button-secondary"
          type="button"
          disabled={busy}
          onClick={() => void downloadExport()}
        >
          Download JSON export
        </button>
      </section>

      <section className="privacy-card" aria-labelledby="feedback-heading">
        <p className="eyebrow">Closed pilot</p>
        <h2 id="feedback-heading">Rate usefulness</h2>
        <form
          className="privacy-form"
          onSubmit={(event) => void submitFeedback(event)}
        >
          <label htmlFor="feedback-surface">Area reviewed</label>
          <select id="feedback-surface" name="surface" required>
            <option value="CURRICULUM_MAPPING">Curriculum mapping</option>
            <option value="WEEKLY_PLAN">Weekly plan</option>
            <option value="ROADMAP">Roadmap</option>
            <option value="TODAY">Today</option>
            <option value="OVERALL">Overall product</option>
          </select>
          <label htmlFor="feedback-rating">Usefulness rating</label>
          <select id="feedback-rating" name="rating" required defaultValue="4">
            <option value="1">1 — Not useful</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5 — Very useful</option>
          </select>
          <label htmlFor="feedback-comment">Optional comment</label>
          <textarea
            id="feedback-comment"
            name="comment"
            maxLength={1000}
            rows={4}
            placeholder="Do not include private or sensitive information."
          />
          <button
            className="button button-primary"
            type="submit"
            disabled={busy}
          >
            Submit pilot feedback
          </button>
        </form>
      </section>

      <section
        className="privacy-card danger-zone"
        aria-labelledby="delete-heading"
      >
        <p className="eyebrow">Danger zone</p>
        <h2 id="delete-heading">Delete account</h2>
        <p>
          Access and queued work stop immediately. Data remains recoverable by
          support for 30 days, then the lifecycle worker purges student records
          and anonymizes retained audit references.
        </p>
        <form
          className="privacy-form"
          onSubmit={(event) => void deleteAccount(event)}
        >
          <label htmlFor="delete-confirmation">
            Type <strong>DELETE MY ACCOUNT</strong> to confirm
          </label>
          <input
            id="delete-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
          />
          <button
            className="button button-danger"
            type="submit"
            disabled={busy || confirmation !== "DELETE MY ACCOUNT"}
          >
            Disable and schedule deletion
          </button>
        </form>
      </section>
    </div>
  );
}

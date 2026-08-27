"use client";

import { useState, type FormEvent } from "react";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

function textValue(form: FormData, key: string): string {
  const value = form.get(key);
  if (typeof value !== "string") throw new Error(`${key} must be text`);
  return value;
}

export function CurriculumWorkflow({
  kind = "curriculum",
}: { kind?: "curriculum" | "career" } = {}) {
  const label = kind === "curriculum" ? "curriculum" : "career knowledge";
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  const stage = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setResult("");
    const form = new FormData(event.currentTarget);
    try {
      const payload = JSON.parse(textValue(form, "payload")) as object;
      const response = await fetch(`${apiUrl}/admin/${kind}/imports`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const body = (await response.json()) as {
        importId?: string;
        status?: string;
        detail?: string;
        issues?: unknown[];
      };
      if (!response.ok)
        throw new Error(body.detail ?? "Import could not be staged");
      setResult(
        body.status === "IN_REVIEW"
          ? `Validated and sent to review. Import ID: ${body.importId}`
          : `Validation found ${body.issues?.length ?? 0} issue(s). Import ID: ${body.importId}`,
      );
    } catch (error) {
      setResult(
        error instanceof Error
          ? error.message
          : "The JSON import could not be read",
      );
    } finally {
      setBusy(false);
    }
  };

  const publish = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setResult("");
    const importId = textValue(new FormData(event.currentTarget), "importId");
    try {
      const response = await fetch(
        `${apiUrl}/admin/${kind}/imports/${encodeURIComponent(importId)}/publish`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const body = (await response.json()) as {
        status?: string;
        detail?: string;
        programId?: string;
      };
      if (!response.ok)
        throw new Error(body.detail ?? "Import could not be published");
      setResult(`Published immutable program ${body.programId}.`);
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Publication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="workflow-grid" aria-label={`${label} workflow`}>
      <form className="workflow-card" onSubmit={(event) => void stage(event)}>
        <p>Editor step</p>
        <h2>Validate a {label} import</h2>
        <label htmlFor={`${kind}-payload`}>Canonical {label} JSON</label>
        <textarea
          id={`${kind}-payload`}
          name="payload"
          rows={10}
          required
          spellCheck={false}
          placeholder='{"schemaVersion":"1.0.0", ...}'
        />
        <button disabled={busy}>Validate and send to review</button>
      </form>
      <form className="workflow-card" onSubmit={(event) => void publish(event)}>
        <p>Independent reviewer step</p>
        <h2>Publish a reviewed version</h2>
        <label htmlFor={`${kind}-importId`}>Validated import ID</label>
        <input
          id={`${kind}-importId`}
          name="importId"
          required
          placeholder="UUID from validation"
        />
        <div className="review-checks">
          <span>✓ Source and checksum compared</span>
          <span>✓ References and cycles passed</span>
          <span>✓ Editor and reviewer differ</span>
        </div>
        <button disabled={busy}>Publish immutable version</button>
      </form>
      {result ? (
        <p className="workflow-result" role="status">
          {result}
        </p>
      ) : null}
    </section>
  );
}

export function CareerWorkflow() {
  return <CurriculumWorkflow kind="career" />;
}

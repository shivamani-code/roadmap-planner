"use client";

import { useCallback, useEffect, useState } from "react";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

interface SkillSummary {
  id: string;
  key: string;
  name: string;
  category: string;
  proficiency: number | null;
  confidence: number;
  effectiveProficiency: number | null;
  lastEvidencedAt: string | null;
}

interface SkillDetail extends SkillSummary {
  mappedCurriculum: Array<{
    topicId: string;
    topic: string;
    subjectCode: string;
    subject: string;
    semester: number;
    depth: number;
    confidence: number;
    rationale: string;
  }>;
  evidence: Array<{
    id: string;
    sourceType: string;
    proficiency: number;
    confidence: number;
    occurredAt: string;
    expiresAt: string | null;
  }>;
}

function percent(value: number | null): string {
  return `${Math.round((value ?? 0) * 100)}%`;
}

export function SkillMap() {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch(`${apiUrl}/skills`, { credentials: "include" })
      .then(async (response) => {
        const body = (await response.json()) as SkillSummary[] & {
          detail?: string;
        };
        if (!response.ok)
          throw new Error(body.detail ?? "Skills could not be loaded");
        setSkills(body);
        setSelectedId(body[0]?.id ?? null);
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error ? error.message : "Skills could not be loaded",
        ),
      );
  }, []);

  const loadDetail = useCallback(async (skillId: string) => {
    setDetail(null);
    const response = await fetch(`${apiUrl}/skills/${skillId}`, {
      credentials: "include",
    });
    const body = (await response.json()) as SkillDetail & { detail?: string };
    if (!response.ok)
      throw new Error(body.detail ?? "Skill evidence could not be loaded");
    setDetail(body);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void loadDetail(selectedId).catch((error: unknown) =>
      setMessage(
        error instanceof Error
          ? error.message
          : "Skill evidence could not be loaded",
      ),
    );
  }, [loadDetail, selectedId]);

  if (message)
    return (
      <p className="form-error" role="alert">
        {message}
      </p>
    );
  if (skills.length === 0) return <p role="status">Loading skill evidence…</p>;

  return (
    <div className="skill-layout">
      <section className="skill-index" aria-label="Evidenced skills">
        {skills.map((skill) => (
          <button
            key={skill.id}
            className={
              skill.id === selectedId
                ? "skill-row skill-row-active"
                : "skill-row"
            }
            aria-pressed={skill.id === selectedId}
            onClick={() => setSelectedId(skill.id)}
          >
            <span>
              <strong>{skill.name}</strong>
              <small>{skill.category.replaceAll("_", " ")}</small>
            </span>
            <span>
              <b>{percent(skill.effectiveProficiency)}</b>
              <small>{percent(skill.confidence)} confidence</small>
            </span>
          </button>
        ))}
      </section>
      <section className="skill-detail" aria-live="polite">
        {!detail ? (
          <p role="status">Loading the evidence ledger…</p>
        ) : (
          <>
            <p className="card-kicker">{detail.key}</p>
            <h2>{detail.name}</h2>
            <div className="skill-score-row">
              <div>
                <span>Effective proficiency</span>
                <strong>{percent(detail.effectiveProficiency)}</strong>
              </div>
              <div>
                <span>Evidence confidence</span>
                <strong>{percent(detail.confidence)}</strong>
              </div>
            </div>
            <p className="muted-copy">
              The effective estimate combines proficiency and confidence. A
              completed task alone is capped and cannot create mastery.
            </p>
            <h3>Mapped curriculum</h3>
            {detail.mappedCurriculum.length === 0 ? (
              <p className="muted-copy">
                No reviewed curriculum mapping is published for this skill.
              </p>
            ) : (
              <ul className="curriculum-links">
                {detail.mappedCurriculum.map((mapping) => (
                  <li key={mapping.topicId}>
                    <div>
                      <strong>{mapping.topic}</strong>
                      <span>
                        Semester {mapping.semester} · {mapping.subjectCode} ·{" "}
                        {mapping.subject}
                      </span>
                    </div>
                    <div>
                      <b>{percent(mapping.depth)} depth</b>
                      <small>
                        {percent(mapping.confidence)} mapping confidence
                      </small>
                    </div>
                    <p>{mapping.rationale}</p>
                  </li>
                ))}
              </ul>
            )}
            <h3>Evidence ledger</h3>
            <ol className="evidence-list">
              {detail.evidence.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.sourceType.replaceAll("_", " ")}</strong>
                    <time dateTime={item.occurredAt}>
                      {new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "medium",
                      }).format(new Date(item.occurredAt))}
                    </time>
                  </div>
                  <div>
                    <span>{percent(item.proficiency)} proficiency</span>
                    <span>{percent(item.confidence)} confidence</span>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
    </div>
  );
}

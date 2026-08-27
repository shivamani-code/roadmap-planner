"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mutationHeaders } from "../lib/http";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

interface GapItem {
  id: string;
  skillName: string;
  category: string;
  classification: string;
  currentProficiency: number | null;
  evidenceConfidence: number;
  curriculumDepth: number;
  mappingConfidence: number;
  remainingHoursP50: number;
  requiredDepth: number;
  importance: number;
  required: boolean;
  roleRationale: string;
  explanation: string;
  nextAction: string;
  trace: {
    subjectCode?: string;
    subjectTitle?: string;
    semester?: number;
    topicTitle?: string;
    mappingRationale?: string;
  };
}

interface GapReportData {
  id: string;
  status: "READY" | "INSUFFICIENT_CAPACITY";
  context: {
    branch: { code: string; name: string };
    curriculumVersion: string;
    role: { name: string; domain: string; targetLevel: string };
    deadline: string;
  };
  contribution: { current: number; college: number; independent: number };
  effortHours: { p25: number; p50: number; p75: number };
  feasibility: {
    allocatableMinutes: number;
    requiredMinutes: number;
    deficitMinutes: number;
  };
  warnings: string[];
  planScope: {
    requiredSkills: number;
    masteredSkills: number;
    collegeSupportedSkills: number;
    independentSkills: number;
    remainingSkills: number;
    supportingSubjects: number;
    subjectNames: string[];
    nextSkills: string[];
  };
  roadmapPreview: {
    headline: string;
    totalHoursP50: number;
    steps: Array<{
      order: number;
      skillName: string;
      classification: string;
      estimatedHours: number;
      action: string;
    }>;
    subjectTracks: Array<{
      code: string | null;
      title: string;
      semester: number | null;
      skills: Array<{
        name: string;
        classification: string;
        requiredDepth: number;
        remainingHours: number;
        action: string;
      }>;
    }>;
    schedule: {
      weeklyCapacityMinutes: number;
      reservePercent: number;
      maxSessionMinutes: number;
      estimatedMonthCount: number;
      continuesAfterPreview: boolean;
      dailySessions: Array<{
        day: number;
        dayName: string;
        startMinute: number;
        endMinute: number;
        plannedMinutes: number;
        focusSkill: string;
        action: string;
      }>;
      weeks: Array<{
        week: number;
        theme: string;
        outcome: string;
        focusSkills: string[];
        plannedMinutes: number;
      }>;
      months: Array<{
        month: number;
        label: string;
        theme: string;
        focusSkills: string[];
        milestone: string;
      }>;
    };
  };
  items: GapItem[];
}

function words(value: string): string {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function classificationNote(value: string): string {
  if (value === "MASTERED") return "Evidence already meets the target depth";
  if (value === "COLLEGE_COVERED")
    return "A mapped subject can cover the required depth";
  if (value === "EXTENSION")
    return "College gives a base; role depth needs extra practice";
  if (["CAREER_ONLY", "INDEPENDENT"].includes(value))
    return "Build outside the curriculum and prove it with work";
  return "Validate current ability before planning the full gap";
}

function clock(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

export function GapReport() {
  const [report, setReport] = useState<GapReportData | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [planView, setPlanView] = useState<"day" | "week" | "month">("day");
  const requested = useRef(false);

  const generate = useCallback(async (): Promise<void> => {
    setStatus("loading");
    try {
      const response = await fetch(`${apiUrl}/gap-analyses`, {
        method: "POST",
        credentials: "include",
        headers: mutationHeaders(),
      });
      const body = (await response.json()) as GapReportData & {
        detail?: string;
      };
      if (!response.ok)
        throw new Error(body.detail ?? "Gap analysis could not be generated");
      setReport(body);
      setStatus("idle");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Gap analysis could not be generated",
      );
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    void generate();
  }, [generate]);

  if (!report) {
    return (
      <div className="gap-start">
        <strong>Build the bridge from your branch to your selected job</strong>
        <p>
          StudentOS will connect each reviewed role requirement to your current
          evidence and mapped curriculum subjects, then order the remaining work
          into a capacity-checked plan.
        </p>
        {message ? (
          <p className="form-error" role="alert">
            {message}
          </p>
        ) : null}
        <button
          className="button button-primary"
          onClick={() => void generate()}
          disabled={status === "loading"}
        >
          {status === "loading" ? "Connecting the evidence…" : "Explain my gap"}
        </button>
      </div>
    );
  }

  const { current, college, independent } = report.contribution;
  const deadline = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${report.context.deadline}T00:00:00.000Z`));

  return (
    <div className="gap-report">
      <section className="gap-journey" aria-labelledby="gap-journey-title">
        <div>
          <p className="eyebrow">Your exact transition</p>
          <h2 id="gap-journey-title">
            {report.context.branch.code} → {report.context.role.name}
          </h2>
          <p>
            {report.context.branch.name} subjects are being compared with the
            reviewed {words(report.context.role.targetLevel)} requirements for
            this job—not with a generic skill list.
          </p>
        </div>
        <dl>
          <div>
            <dt>Career domain</dt>
            <dd>{report.context.role.domain}</dd>
          </div>
          <div>
            <dt>Target date</dt>
            <dd>{deadline}</dd>
          </div>
          <div>
            <dt>Curriculum source</dt>
            <dd>{report.context.curriculumVersion}</dd>
          </div>
        </dl>
      </section>

      <nav className="gap-section-nav" aria-label="Gap report sections">
        <a href="#skills-needed">Skills needed</a>
        <a href="#subject-roadmaps">Subjects + skills</a>
        <a href="#roadmap-order">Roadmap order</a>
        <a href="#time-plan">Day · week · month</a>
        <a href="#skill-evidence">Full explanation</a>
      </nav>

      <section className="connection-guide" aria-labelledby="connection-title">
        <p className="eyebrow">How to read this report</p>
        <h2 id="connection-title">One evidence chain, four clear layers</h2>
        <ol>
          <li>
            <b>1</b>
            <strong>Subject</strong>
            <span>A reviewed semester subject and topic.</span>
          </li>
          <li>
            <b>2</b>
            <strong>Skill</strong>
            <span>
              The ability that subject can develop, with depth and confidence.
            </span>
          </li>
          <li>
            <b>3</b>
            <strong>Role requirement</strong>
            <span>Why the selected job needs the skill and how deeply.</span>
          </li>
          <li>
            <b>4</b>
            <strong>Roadmap action</strong>
            <span>What to learn, practise, or prove next—and the effort.</span>
          </li>
        </ol>
      </section>

      <section
        id="skills-needed"
        className="skills-needed"
        aria-labelledby="skills-needed-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Skills the role needs</p>
            <h2 id="skills-needed-title">
              {report.planScope.requiredSkills} requirements, with your current
              position
            </h2>
          </div>
          <span>{report.planScope.remainingSkills} still need work</span>
        </div>
        <p className="section-intro">
          Required depth comes from the reviewed role profile. “Known now” only
          uses your assessment and evidence; college coverage is shown
          separately.
        </p>
        <div className="skills-needed-grid">
          {[...report.items]
            .sort(
              (left, right) =>
                right.importance - left.importance ||
                right.remainingHoursP50 - left.remainingHoursP50,
            )
            .map((item) => (
              <article key={`needed-${item.id}`}>
                <div>
                  <strong>{item.skillName}</strong>
                  <span>{words(item.category)}</span>
                </div>
                <dl>
                  <div>
                    <dt>Role depth</dt>
                    <dd>{percent(item.requiredDepth)}</dd>
                  </div>
                  <div>
                    <dt>Known now</dt>
                    <dd>
                      {item.currentProficiency === null
                        ? "Unknown"
                        : percent(item.currentProficiency)}
                    </dd>
                  </div>
                  <div>
                    <dt>Work left</dt>
                    <dd>{item.remainingHoursP50}h</dd>
                  </div>
                </dl>
                <p>{classificationNote(item.classification)}</p>
              </article>
            ))}
        </div>
      </section>

      <section
        id="subject-roadmaps"
        className="subject-roadmaps"
        aria-labelledby="subjects-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Subjects + roadmap</p>
            <h2 id="subjects-title">Use college subjects as learning tracks</h2>
          </div>
          <span>
            {report.planScope.supportingSubjects} mapped subject
            {report.planScope.supportingSubjects === 1 ? "" : "s"}
          </span>
        </div>
        <p className="section-intro">
          Each track shows which job skills a subject supports. The independent
          track contains required skills for which the reviewed curriculum has
          no direct mapping.
        </p>
        <div className="subject-roadmap-grid">
          {report.roadmapPreview.subjectTracks.map((track) => (
            <article
              key={track.code ?? "independent"}
              className={track.code ? "" : "subject-independent"}
            >
              <div className="subject-track-heading">
                <div>
                  <span>
                    {track.code ?? "Outside curriculum"}
                    {track.semester ? ` · Semester ${track.semester}` : ""}
                  </span>
                  <strong>{track.title}</strong>
                </div>
                <b>
                  {track.skills.length} skill
                  {track.skills.length === 1 ? "" : "s"}
                </b>
              </div>
              <ol>
                {track.skills.map((skill) => (
                  <li key={`${track.code ?? "independent"}-${skill.name}`}>
                    <div>
                      <strong>{skill.name}</strong>
                      <span>
                        {words(skill.classification)} · role depth{" "}
                        {percent(skill.requiredDepth)}
                      </span>
                    </div>
                    <b>{skill.remainingHours}h</b>
                    <p>{skill.action}</p>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>

      <section
        className="contribution-card"
        aria-labelledby="contribution-title"
      >
        <h2 id="contribution-title">What will close the role gap</h2>
        <p className="section-intro">
          “College” is future curriculum support, not a claim that you already
          know it. “Independent” is work the mapped subjects do not fully cover.
        </p>
        <div
          className="contribution"
          role="img"
          aria-label={`Known now ${current} percent; future college support ${college} percent; independent learning ${independent} percent`}
        >
          <span
            className="segment segment-current"
            style={{ width: `${current}%` }}
          >
            {current >= 9 ? `${current}%` : ""}
          </span>
          <span
            className="segment segment-college"
            style={{ width: `${college}%` }}
          >
            {college >= 9 ? `${college}%` : ""}
          </span>
          <span
            className="segment segment-external"
            style={{ width: `${independent}%` }}
          >
            {independent >= 9 ? `${independent}%` : ""}
          </span>
        </div>
        <ul className="legend">
          <li>
            <span className="dot dot-current" />
            <span>Proven now</span>
            <strong>{current}%</strong>
          </li>
          <li>
            <span className="dot dot-college" />
            <span>Future subject support</span>
            <strong>{college}%</strong>
          </li>
          <li>
            <span className="dot dot-external" />
            <span>Independent learning</span>
            <strong>{independent}%</strong>
          </li>
        </ul>
      </section>

      <section className="plan-scope" aria-labelledby="plan-scope-title">
        <p className="eyebrow">Complete plan scope</p>
        <h2 id="plan-scope-title">Nothing hidden behind one percentage</h2>
        <div className="roadmap-summary">
          <div>
            <span>Role skills</span>
            <strong>{report.planScope.requiredSkills}</strong>
          </div>
          <div>
            <span>Already mastered</span>
            <strong>{report.planScope.masteredSkills}</strong>
          </div>
          <div>
            <span>College-supported</span>
            <strong>{report.planScope.collegeSupportedSkills}</strong>
          </div>
          <div>
            <span>Independent</span>
            <strong>{report.planScope.independentSkills}</strong>
          </div>
          <div>
            <span>Subjects helping</span>
            <strong>{report.planScope.supportingSubjects}</strong>
          </div>
        </div>
        {report.planScope.subjectNames.length ? (
          <div className="subject-support">
            <strong>Subjects StudentOS can reuse</strong>
            <p>{report.planScope.subjectNames.join(" · ")}</p>
          </div>
        ) : null}
      </section>

      <section
        className={
          report.status === "READY"
            ? "decision-card decision-ready"
            : "decision-card decision-risk"
        }
      >
        <span>
          {report.status === "READY"
            ? "Capacity check passed"
            : "Capacity decision required"}
        </span>
        <strong>{report.effortHours.p50}h typical remaining effort</strong>
        <p>
          {report.status === "READY"
            ? "This work fits before the target date with the 15% disruption reserve preserved."
            : `${Math.ceil(report.feasibility.deficitMinutes / 60)} more hours are needed before the deadline. Change the date or weekly availability before activation.`}
        </p>
      </section>

      <section
        id="roadmap-order"
        className="roadmap-preview"
        aria-labelledby="preview-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Roadmap preview</p>
            <h2 id="preview-title">The first priorities, in order</h2>
          </div>
          <span>
            {report.roadmapPreview.totalHoursP50}h total typical effort
          </span>
        </div>
        <p className="section-intro">
          This is the learning order. The full roadmap next converts it into
          terms and weekly milestones using your declared availability.
        </p>
        <ol className="preview-steps">
          {report.roadmapPreview.steps.map((step) => (
            <li key={`${step.order}-${step.skillName}`}>
              <b>{step.order}</b>
              <div>
                <strong>{step.skillName}</strong>
                <span>
                  {words(step.classification)} · {step.estimatedHours}h
                </span>
                <p>{step.action}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        id="time-plan"
        className="multi-horizon-plan"
        aria-labelledby="horizon-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Day · week · month plan</p>
            <h2 id="horizon-title">See how the roadmap fits your time</h2>
          </div>
          <span>
            {duration(report.roadmapPreview.schedule.weeklyCapacityMinutes)}{" "}
            usable each week
          </span>
        </div>
        <div className="capacity-note">
          <div>
            <span>Declared study capacity</span>
            <strong>
              {duration(
                Math.round(
                  report.roadmapPreview.schedule.weeklyCapacityMinutes / 0.85,
                ),
              )}
              /week
            </strong>
          </div>
          <div>
            <span>Planning reserve</span>
            <strong>{report.roadmapPreview.schedule.reservePercent}%</strong>
          </div>
          <div>
            <span>Maximum session</span>
            <strong>
              {duration(report.roadmapPreview.schedule.maxSessionMinutes)}
            </strong>
          </div>
          <div>
            <span>Estimated horizon</span>
            <strong>
              {report.roadmapPreview.schedule.estimatedMonthCount} month
              {report.roadmapPreview.schedule.estimatedMonthCount === 1
                ? ""
                : "s"}
            </strong>
          </div>
        </div>
        <div
          className="plan-view-tabs"
          role="tablist"
          aria-label="Planning horizon"
        >
          {(["day", "week", "month"] as const).map((view) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={planView === view}
              className={planView === view ? "plan-tab-active" : ""}
              onClick={() => setPlanView(view)}
            >
              {view === "day"
                ? "Study days"
                : view === "week"
                  ? "4-week plan"
                  : "Month plan"}
            </button>
          ))}
        </div>

        {planView === "day" ? (
          <div className="horizon-panel" role="tabpanel">
            <div className="horizon-intro">
              <strong>Your next study-session pattern</strong>
              <span>
                Uses the days and time windows you declared during onboarding.
              </span>
            </div>
            <ol className="day-plan-list">
              {report.roadmapPreview.schedule.dailySessions.map(
                (session, index) => (
                  <li key={`${session.day}-${session.startMinute}-${index}`}>
                    <div className="day-time">
                      <strong>{session.dayName}</strong>
                      <span>
                        {clock(session.startMinute)}–{clock(session.endMinute)}
                      </span>
                    </div>
                    <div>
                      <span>Focus skill</span>
                      <strong>{session.focusSkill}</strong>
                      <p>{session.action}</p>
                    </div>
                    <b>{duration(session.plannedMinutes)}</b>
                  </li>
                ),
              )}
            </ol>
          </div>
        ) : null}

        {planView === "week" ? (
          <div className="horizon-panel" role="tabpanel">
            <div className="horizon-intro">
              <strong>Your first four weeks</strong>
              <span>
                Moves from baseline to practice, application, and evidence.
              </span>
            </div>
            <ol className="week-plan-grid">
              {report.roadmapPreview.schedule.weeks.map((week) => (
                <li key={week.week}>
                  <span>Week {week.week}</span>
                  <strong>{week.theme}</strong>
                  <p>{week.outcome}</p>
                  <div>
                    {week.focusSkills.join(" · ") ||
                      "Review completed evidence"}
                  </div>
                  <b>{duration(week.plannedMinutes)} planned</b>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {planView === "month" ? (
          <div className="horizon-panel" role="tabpanel">
            <div className="horizon-intro">
              <strong>Month-by-month milestones</strong>
              <span>
                {report.roadmapPreview.schedule.continuesAfterPreview
                  ? "The first six months are shown; the full roadmap continues to the target date."
                  : "This preview covers the estimated learning horizon."}
              </span>
            </div>
            <ol className="month-plan-list">
              {report.roadmapPreview.schedule.months.map((month) => (
                <li key={month.month}>
                  <div>
                    <span>{month.label}</span>
                    <strong>{month.theme}</strong>
                  </div>
                  <p>
                    {month.focusSkills.join(" · ") ||
                      "Consolidate completed skills"}
                  </p>
                  <b>{month.milestone}</b>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        <p className="preview-disclaimer">
          Preview only: the next step generates dated milestones, prerequisites,
          projects, and weekly tasks, then validates them against your deadline.
        </p>
      </section>

      <section
        id="skill-evidence"
        className="skill-paths"
        aria-labelledby="skill-paths-title"
      >
        <p className="eyebrow">Auditable role requirements</p>
        <h2 id="skill-paths-title">Subject → skill → job need → action</h2>
        <p className="section-intro">
          Open any skill to see why it belongs in this role, which subject can
          help, how strong the mapping is, and exactly what the plan does next.
        </p>
        <div className="skill-path-list">
          {report.items.map((item) => (
            <details key={item.id} className="skill-path-card">
              <summary>
                <div>
                  <strong>{item.skillName}</strong>
                  <span>
                    {words(item.category)} ·{" "}
                    {item.required ? "Required" : "Optional"}
                  </span>
                </div>
                <div>
                  <b>{words(item.classification)}</b>
                  <span>{item.remainingHoursP50}h remaining</span>
                </div>
              </summary>
              <div className="skill-path-body">
                <div className="skill-path-chain">
                  <article>
                    <span>1 · Subject source</span>
                    <strong>
                      {item.trace.subjectTitle ?? "No direct subject mapping"}
                    </strong>
                    <p>
                      {item.trace.subjectCode
                        ? `${item.trace.subjectCode} · `
                        : ""}
                      {item.trace.semester
                        ? `Semester ${item.trace.semester} · `
                        : ""}
                      {item.trace.topicTitle ?? "Independent career learning"}
                    </p>
                    <small>
                      Mapping confidence {percent(item.mappingConfidence)}
                    </small>
                  </article>
                  <article>
                    <span>2 · Skill evidence</span>
                    <strong>{item.skillName}</strong>
                    <p>
                      Known{" "}
                      {item.currentProficiency === null
                        ? "unknown"
                        : percent(item.currentProficiency)}{" "}
                      with {percent(item.evidenceConfidence)} evidence
                      confidence.
                    </p>
                    <small>
                      Curriculum depth {percent(item.curriculumDepth)}
                    </small>
                  </article>
                  <article>
                    <span>3 · Why the job needs it</span>
                    <strong>
                      Required depth {percent(item.requiredDepth)}
                    </strong>
                    <p>{item.roleRationale}</p>
                    <small>Role importance {percent(item.importance)}</small>
                  </article>
                  <article>
                    <span>4 · Roadmap action</span>
                    <strong>{classificationNote(item.classification)}</strong>
                    <p>{item.nextAction}</p>
                    <small>
                      {item.remainingHoursP50}h typical remaining effort
                    </small>
                  </article>
                </div>
                <p className="skill-explanation">{item.explanation}</p>
              </div>
            </details>
          ))}
        </div>
      </section>

      {report.status === "READY" ? (
        <div className="gap-final-action">
          <div>
            <strong>Ready for the dated plan</strong>
            <span>
              Generate terms, milestones, weekly pace, and portfolio proof from
              this exact analysis.
            </span>
          </div>
          <a
            className="button button-primary"
            href={`/roadmap?gap=${report.id}`}
          >
            Build my full roadmap
          </a>
        </div>
      ) : (
        <div className="roadmap-next" aria-label="Resolve capacity shortfall">
          <a className="button button-primary" href="/onboarding/goal">
            Extend target date
          </a>
          <a
            className="button button-secondary"
            href="/onboarding/availability"
          >
            Increase weekly availability
          </a>
        </div>
      )}
    </div>
  );
}

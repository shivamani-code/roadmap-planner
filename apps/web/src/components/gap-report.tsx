"use client";

import Link from "next/link";
import { useState } from "react";
import { usePlanner } from "./planner-provider";
import { RoadmapDownload } from "./roadmap-download";
import { buildLocalPlan, targetLabel, words } from "../lib/local-planner";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function GapReport() {
  const { profile } = usePlanner();
  const plan = buildLocalPlan(profile);
  const [planView, setPlanView] = useState<"day" | "week" | "month">("day");

  if (!plan)
    return (
      <div className="gap-start">
        <strong>Complete the four quick inputs first</strong>
        <p>
          Select your branch, role, current skill level and available time. The
          report is created privately in this browser without a backend.
        </p>
        <Link className="button button-primary" href="/onboarding">
          Start my roadmap
        </Link>
      </div>
    );

  const mastered = plan.skills.filter(
    (skill) => skill.classification === "MASTERED",
  ).length;
  const college = plan.skills.filter((skill) =>
    ["COLLEGE_COVERED", "EXTENSION"].includes(skill.classification),
  ).length;
  const independent = plan.skills.filter(
    (skill) => skill.classification === "INDEPENDENT",
  ).length;

  return (
    <div className="gap-report">
      <section className="gap-journey" aria-labelledby="gap-journey-title">
        <div>
          <p className="eyebrow">Your exact transition</p>
          <h2 id="gap-journey-title">
            {plan.branch.code} → {plan.role.name}
          </h2>
          <p>
            Your {plan.branch.name} subjects are connected only to the reviewed
            skills required for {targetLabel(plan.targetLevel)}.
          </p>
        </div>
        <dl>
          <div>
            <dt>Career domain</dt>
            <dd>{words(plan.role.domainKey)}</dd>
          </div>
          <div>
            <dt>Target date</dt>
            <dd>{plan.deadline}</dd>
          </div>
          <div>
            <dt>Curriculum</dt>
            <dd>{plan.branch.curriculumVersion}</dd>
          </div>
        </dl>
      </section>

      <RoadmapDownload plan={plan} />

      <nav className="gap-section-nav" aria-label="Gap report sections">
        <a href="#skills-needed">Skills needed</a>
        <a href="#subject-roadmaps">Subjects + skills</a>
        <a href="#roadmap-order">Roadmap order</a>
        <a href="#time-plan">Day · week · month</a>
        <a href="#skill-evidence">Full explanation</a>
      </nav>

      <section className="connection-guide" aria-labelledby="connection-title">
        <p className="eyebrow">How the plan is built</p>
        <h2 id="connection-title">Subject → skill → role → action</h2>
        <ol>
          <li>
            <b>1</b>
            <strong>Subject</strong>
            <span>Your branch curriculum.</span>
          </li>
          <li>
            <b>2</b>
            <strong>Skill</strong>
            <span>The ability developed by that subject.</span>
          </li>
          <li>
            <b>3</b>
            <strong>Role need</strong>
            <span>The depth required by the selected job.</span>
          </li>
          <li>
            <b>4</b>
            <strong>Action</strong>
            <span>What to learn, practise and prove.</span>
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
              {plan.skills.length} role requirements
            </h2>
          </div>
          <span>{plan.skills.length - mastered} still need work</span>
        </div>
        <div className="roadmap-summary" aria-label="Gap summary">
          <div>
            <span>Already ready</span>
            <strong>{mastered}</strong>
          </div>
          <div>
            <span>College-supported</span>
            <strong>{college}</strong>
          </div>
          <div>
            <span>Independent</span>
            <strong>{independent}</strong>
          </div>
          <div>
            <span>Remaining effort</span>
            <strong>{plan.totalHours}h</strong>
          </div>
          <div>
            <span>Weekly pace</span>
            <strong>{plan.weeklyHours}h</strong>
          </div>
          <div>
            <span>Estimated horizon</span>
            <strong>{plan.estimatedMonths} mo</strong>
          </div>
        </div>
        <div className="skills-needed-grid">
          {plan.skills.map((skill) => (
            <article key={skill.key}>
              <div>
                <strong>{skill.name}</strong>
                <span>{words(skill.category)}</span>
              </div>
              <dl>
                <div>
                  <dt>Role depth</dt>
                  <dd>{percent(skill.requiredDepth)}</dd>
                </div>
                <div>
                  <dt>Your level</dt>
                  <dd>{percent(skill.currentDepth)}</dd>
                </div>
                <div>
                  <dt>Work left</dt>
                  <dd>{skill.remainingHours}h</dd>
                </div>
              </dl>
              <p>{words(skill.classification)}</p>
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
            <p className="eyebrow">Subjects + skill tracks</p>
            <h2 id="subjects-title">Use college as the foundation</h2>
          </div>
          <span>
            {plan.subjects.filter((item) => item.code).length} mapped subjects
          </span>
        </div>
        <div className="subject-roadmap-grid">
          {plan.subjects.map((subject) => (
            <article
              key={subject.code ?? "independent"}
              className={subject.code ? undefined : "subject-independent"}
            >
              <div>
                <span>{subject.code ?? "Career track"}</span>
                <strong>{subject.title}</strong>
                <small>
                  {subject.semester
                    ? `Semester ${subject.semester}`
                    : "Outside the curriculum"}
                </small>
              </div>
              <ol>
                {subject.skills.map((skill) => (
                  <li key={skill.key}>
                    <div>
                      <strong>{skill.name}</strong>
                      <span>
                        {words(skill.classification)} · {skill.remainingHours}h
                      </span>
                    </div>
                    <p>{skill.action}</p>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>

      <section
        id="roadmap-order"
        className="roadmap-preview"
        aria-labelledby="roadmap-order-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Learning order</p>
            <h2 id="roadmap-order-title">
              Finish the highest-value gaps first
            </h2>
          </div>
          <span>{plan.totalHours}h typical effort</span>
        </div>
        <ol className="roadmap-step-list">
          {plan.skills
            .filter((skill) => skill.remainingHours > 0)
            .map((skill, index) => (
              <li key={skill.key}>
                <b>{index + 1}</b>
                <div>
                  <strong>{skill.name}</strong>
                  <span>
                    {skill.subjectTitle ?? "Independent career learning"}
                  </span>
                  <p>{skill.action}</p>
                </div>
                <small>{skill.remainingHours}h</small>
              </li>
            ))}
        </ol>
      </section>

      <section
        id="time-plan"
        className="roadmap-preview"
        aria-labelledby="time-plan-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your practical schedule</p>
            <h2 id="time-plan-title">Day, week and month views</h2>
          </div>
          <span>{plan.reservePercent}% flexibility buffer</span>
        </div>
        <div
          className="plan-view-switch"
          role="group"
          aria-label="Planning horizon"
        >
          {(["day", "week", "month"] as const).map((view) => (
            <button
              key={view}
              type="button"
              aria-pressed={planView === view}
              className={planView === view ? "scope-active" : ""}
              onClick={() => setPlanView(view)}
            >
              {words(view)}
            </button>
          ))}
        </div>
        {planView === "day" ? (
          <ol className="day-plan-list">
            {plan.dailyPlan.map((day) => (
              <li key={day.day}>
                <div>
                  <span>{day.day}</span>
                  <strong>{day.focus}</strong>
                </div>
                <p>{day.action}</p>
                <b>{day.minutes} min</b>
              </li>
            ))}
          </ol>
        ) : null}
        {planView === "week" ? (
          <ol className="week-plan-list">
            {plan.weeklyPlan.map((week) => (
              <li key={week.week}>
                <div>
                  <span>Week {week.week}</span>
                  <strong>{week.theme}</strong>
                </div>
                <p>{week.skills.join(" · ")}</p>
                <b>{week.outcome}</b>
              </li>
            ))}
          </ol>
        ) : null}
        {planView === "month" ? (
          <ol className="month-plan-list">
            {plan.monthlyPlan.map((month) => (
              <li key={month.month}>
                <div>
                  <span>Month {month.month}</span>
                  <strong>{month.theme}</strong>
                </div>
                <p>{month.skills.join(" · ")}</p>
                <b>{month.milestone}</b>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <section
        id="skill-evidence"
        className="skill-paths"
        aria-labelledby="skill-paths-title"
      >
        <p className="eyebrow">Clear explanation</p>
        <h2 id="skill-paths-title">Why every skill is in the plan</h2>
        <div className="skill-path-list">
          {plan.skills.map((skill) => (
            <details key={skill.key} className="skill-path-card">
              <summary>
                <div>
                  <strong>{skill.name}</strong>
                  <span>{skill.subjectTitle ?? "Independent"}</span>
                </div>
                <div>
                  <b>{words(skill.classification)}</b>
                  <span>{skill.remainingHours}h remaining</span>
                </div>
              </summary>
              <div className="skill-path-body">
                <div className="skill-path-chain">
                  <article>
                    <span>1 · Subject</span>
                    <strong>{skill.subjectTitle ?? "No direct subject"}</strong>
                    <p>
                      {skill.subjectCode ?? "Independent learning"}
                      {skill.semester ? ` · Semester ${skill.semester}` : ""}
                    </p>
                  </article>
                  <article>
                    <span>2 · Current skill</span>
                    <strong>{percent(skill.currentDepth)}</strong>
                    <p>Your quick self-assessment level.</p>
                  </article>
                  <article>
                    <span>3 · Role requirement</span>
                    <strong>{percent(skill.requiredDepth)}</strong>
                    <p>{skill.rationale}</p>
                  </article>
                  <article>
                    <span>4 · Next action</span>
                    <strong>{skill.remainingHours}h</strong>
                    <p>{skill.action}</p>
                  </article>
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      <div className="gap-final-action">
        <div>
          <strong>Your browser-only roadmap is ready</strong>
          <span>
            Nothing was uploaded or saved. Download it before leaving if you
            want to keep it.
          </span>
        </div>
        <Link className="button button-primary" href="/roadmap">
          Open full roadmap
        </Link>
      </div>
    </div>
  );
}

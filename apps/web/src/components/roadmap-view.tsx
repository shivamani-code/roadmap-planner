"use client";

import Link from "next/link";
import { usePlanner } from "./planner-provider";
import { RoadmapDownload } from "./roadmap-download";
import { buildLocalPlan, targetLabel, words } from "../lib/local-planner";

export function RoadmapView() {
  const { profile, reset } = usePlanner();
  const plan = buildLocalPlan(profile);

  if (!plan)
    return (
      <section className="generation-state">
        <strong>No temporary roadmap in this browser</strong>
        <p>
          StudentOS does not save visitor data. Complete the four inputs to
          build a new plan.
        </p>
        <Link className="button button-primary" href="/onboarding">
          Build my roadmap
        </Link>
      </section>
    );

  return (
    <div className="roadmap-view">
      <section className="roadmap-summary" aria-label="Roadmap summary">
        <div>
          <span>Target</span>
          <strong>{targetLabel(plan.targetLevel)}</strong>
        </div>
        <div>
          <span>Planned effort</span>
          <strong>{plan.totalHours}h</strong>
        </div>
        <div>
          <span>Weekly pace</span>
          <strong>{plan.weeklyHours}h</strong>
        </div>
        <div>
          <span>Timeline</span>
          <strong>{plan.estimatedWeeks} weeks</strong>
        </div>
        <div>
          <span>Skills</span>
          <strong>{plan.skills.length}</strong>
        </div>
        <div>
          <span>Supporting subjects</span>
          <strong>
            {plan.subjects.filter((subject) => subject.code).length}
          </strong>
        </div>
      </section>

      <RoadmapDownload plan={plan} />

      {!plan.fitsDeadline ? (
        <div className="form-warning" role="alert">
          <strong>Adjust the target date or weekly study time</strong>
          <p>
            This plan needs about {plan.estimatedWeeks} weeks, but the target
            date is only {plan.weeksUntilDeadline} weeks away.
          </p>
        </div>
      ) : null}

      <section className="roadmap-guide" aria-labelledby="roadmap-guide-title">
        <p className="eyebrow">How to complete this roadmap</p>
        <h2 id="roadmap-guide-title">Learn, build and prove</h2>
        <ol>
          <li>
            <strong>Learn in order</strong>
            <span>Start with the highest-importance remaining skills.</span>
          </li>
          <li>
            <strong>Use your subjects</strong>
            <span>
              Revise mapped {plan.branch.code} subjects before paying for
              another course.
            </span>
          </li>
          <li>
            <strong>Prove every phase</strong>
            <span>
              Finish with a visible artifact, capstone and interview story.
            </span>
          </li>
        </ol>
      </section>

      <div className="roadmap-columns">
        <section className="term-timeline" aria-labelledby="timeline-title">
          <h2 id="timeline-title">Monthly roadmap</h2>
          <ol>
            {plan.monthlyPlan.map((month) => (
              <li key={month.month}>
                <article className="term-card">
                  <span>Month {month.month}</span>
                  <strong>{month.theme}</strong>
                  <small>{month.skills.join(" · ")}</small>
                  <small>{month.milestone}</small>
                </article>
              </li>
            ))}
          </ol>
        </section>
        <section className="term-detail">
          <p className="eyebrow">First 12 weeks</p>
          <h2>Weekly checkpoints</h2>
          <div className="milestone-list">
            {plan.weeklyPlan.map((week) => (
              <article key={week.week}>
                <span>
                  Week {week.week} · {week.theme}
                </span>
                <h3>{week.skills.join(" + ")}</h3>
                <p>{week.outcome}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section
        className="roadmap-guide"
        aria-labelledby="repeatable-week-title"
      >
        <p className="eyebrow">Repeatable week</p>
        <h2 id="repeatable-week-title">Your daily study rhythm</h2>
        <ol>
          {plan.dailyPlan.map((day) => (
            <li key={day.day}>
              <strong>
                {day.day} · {day.minutes} minutes
              </strong>
              <span>
                {day.focus}: {day.action}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="skill-paths" aria-labelledby="completion-title">
        <p className="eyebrow">Completion checklist</p>
        <h2 id="completion-title">What “done” means for {plan.role.name}</h2>
        <div className="skill-path-list">
          {plan.skills.map((skill) => (
            <details key={skill.key} className="skill-path-card">
              <summary>
                <div>
                  <strong>{skill.name}</strong>
                  <span>
                    {skill.subjectTitle ?? "Independent career track"}
                  </span>
                </div>
                <div>
                  <b>{words(skill.classification)}</b>
                  <span>{skill.remainingHours}h</span>
                </div>
              </summary>
              <div className="skill-path-body">
                <p>{skill.action}</p>
                <p>{skill.rationale}</p>
              </div>
            </details>
          ))}
        </div>
      </section>

      <div className="gap-final-action">
        <div>
          <strong>Download before you leave</strong>
          <span>This plan is intentionally not saved by StudentOS.</span>
        </div>
        <Link
          className="button button-secondary"
          href="/onboarding"
          onClick={reset}
        >
          Start another plan
        </Link>
      </div>
    </div>
  );
}

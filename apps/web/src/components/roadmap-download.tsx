"use client";

import type { LocalPlan } from "../lib/local-planner";
import { targetLabel } from "../lib/local-planner";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function list(items: string[]): string {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function reportHtml(plan: LocalPlan): string {
  const skills = plan.skills
    .map(
      (skill) =>
        `<tr><td>${escapeHtml(skill.name)}</td><td>${escapeHtml(skill.subjectTitle ?? "Independent")}</td><td>${escapeHtml(skill.classification.replaceAll("_", " "))}</td><td>${skill.remainingHours}h</td><td>${escapeHtml(skill.action)}</td></tr>`,
    )
    .join("");
  const months = plan.monthlyPlan
    .map(
      (month) =>
        `<section><h3>Month ${month.month}: ${escapeHtml(month.theme)}</h3><p><b>Focus:</b> ${escapeHtml(month.skills.join(", "))}</p><p>${escapeHtml(month.milestone)}</p></section>`,
    )
    .join("");
  const weeks = plan.weeklyPlan
    .map(
      (week) =>
        `<li><b>Week ${week.week} — ${escapeHtml(week.theme)}</b><br>${escapeHtml(week.skills.join(", "))}<br>${escapeHtml(week.outcome)}</li>`,
    )
    .join("");
  const days = plan.dailyPlan
    .map(
      (day) =>
        `<li><b>${escapeHtml(day.day)} (${day.minutes} min)</b> — ${escapeHtml(day.focus)}<br>${escapeHtml(day.action)}</li>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(plan.role.name)} roadmap</title><style>body{font:16px/1.55 system-ui,sans-serif;color:#14213d;max-width:1000px;margin:0 auto;padding:40px}h1{font-size:38px;line-height:1.1}h2{margin-top:36px;border-bottom:2px solid #4355db;padding-bottom:8px}section{break-inside:avoid}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #d7ddeb;padding:9px;text-align:left;vertical-align:top}th{background:#eef1ff}li{margin:8px 0}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.summary div{border:1px solid #d7ddeb;border-radius:10px;padding:12px}.muted{color:#5d6880}@media print{body{padding:0}.no-print{display:none}}</style></head><body><p class="muted">StudentOS · Browser-generated plan · No account or saved profile</p><h1>${escapeHtml(plan.branch.code)} → ${escapeHtml(plan.role.name)}</h1><p>${escapeHtml(targetLabel(plan.targetLevel))} · Target ${escapeHtml(plan.deadline)}</p><div class="summary"><div><b>${plan.totalHours}h</b><br>remaining effort</div><div><b>${plan.weeklyHours}h</b><br>weekly pace</div><div><b>${plan.estimatedWeeks}</b><br>estimated weeks</div><div><b>${plan.estimatedMonths}</b><br>estimated months</div></div><h2>Skills and subjects</h2><table><thead><tr><th>Skill</th><th>Subject</th><th>Plan type</th><th>Effort</th><th>Next action</th></tr></thead><tbody>${skills}</tbody></table><h2>Monthly roadmap</h2>${months}<h2>First weeks</h2><ol>${weeks}</ol><h2>Repeatable weekly schedule</h2><ul>${days}</ul><h2>Completion checklist</h2><ul>${list(["Complete the learning checkpoints in order.", "Create one visible artifact for every major skill.", "Publish a role-specific capstone.", "Prepare resume bullets and interview stories from the finished work."])}</ul><p class="muted">This roadmap is an estimate based on the selections entered in the browser. It does not promise employment.</p><button class="no-print" onclick="window.print()">Print or save as PDF</button></body></html>`;
}

export function RoadmapDownload({ plan }: { plan: LocalPlan }) {
  function download(): void {
    const blob = new Blob([reportHtml(plan)], {
      type: "text/html;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `studentos-${plan.role.key}-roadmap.html`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="download-actions" aria-label="Roadmap download options">
      <button
        className="button button-primary"
        type="button"
        onClick={download}
      >
        Download roadmap
      </button>
      <button
        className="button button-secondary"
        type="button"
        onClick={() => window.print()}
      >
        Print / save PDF
      </button>
    </div>
  );
}

import { AppHeader } from "../../components/app-header";
import { ProgressDashboard } from "../../components/progress-dashboard";

export default function ProgressPage() {
  return (
    <main className="planner-page shell">
      <AppHeader active="progress" />
      <section className="planner-heading" aria-labelledby="progress-title">
        <p className="eyebrow">Effort and outcomes</p>
        <h1 id="progress-title">Progress</h1>
        <p>
          Completion, consistency, roadmap movement, project milestones, and
          evidenced skills—kept separate so activity never masquerades as
          mastery.
        </p>
      </section>
      <ProgressDashboard />
    </main>
  );
}

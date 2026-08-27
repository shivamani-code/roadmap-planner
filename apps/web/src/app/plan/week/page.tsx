import { AppHeader } from "../../../components/app-header";
import { WeekPlanner } from "../../../components/week-planner";

export default function WeekPage() {
  return (
    <main className="planner-page shell">
      <AppHeader active="week" />
      <section className="planner-heading" aria-labelledby="week-title">
        <p className="eyebrow">Capacity before ambition</p>
        <h1 id="week-title">This week</h1>
        <p>
          Inspect track balance, protected reserve, and each scheduled task.
        </p>
      </section>
      <WeekPlanner />
    </main>
  );
}

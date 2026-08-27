import { AppHeader } from "../../components/app-header";
import { TodayDashboard } from "../../components/today-dashboard";

export default function TodayPage() {
  return (
    <main className="planner-page shell">
      <AppHeader active="today" />
      <section className="planner-heading" aria-labelledby="today-title">
        <p className="eyebrow">One feasible action at a time</p>
        <h1 id="today-title">Today</h1>
      </section>
      <TodayDashboard />
    </main>
  );
}

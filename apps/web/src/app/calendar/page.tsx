import { AppHeader } from "../../components/app-header";
import { ExamCalendar } from "../../components/exam-calendar";

export default function CalendarPage() {
  return (
    <main className="planner-page shell">
      <AppHeader active="calendar" />
      <section className="planner-heading" aria-labelledby="calendar-title">
        <p className="eyebrow">Protect academic peaks</p>
        <h1 id="calendar-title">Exam calendar</h1>
        <p>
          Confirm real exam periods and inspect the active planning mode. No
          inferred date changes your roadmap without confirmation.
        </p>
      </section>
      <ExamCalendar />
    </main>
  );
}

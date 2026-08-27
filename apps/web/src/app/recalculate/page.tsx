import { AppHeader } from "../../components/app-header";
import { RoadmapRecalculation } from "../../components/roadmap-recalculation";

export default function RecalculatePage() {
  return (
    <main className="planner-page shell">
      <AppHeader active="recalculate" />
      <section className="planner-heading" aria-labelledby="recalculate-title">
        <p className="eyebrow">Versioned, explainable change</p>
        <h1 id="recalculate-title">Recalculate roadmap</h1>
        <p>
          Preview material, exam, role, or reviewed-content changes. Your
          current roadmap stays active until you accept the grouped diff.
        </p>
      </section>
      <RoadmapRecalculation />
    </main>
  );
}

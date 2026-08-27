import { AppHeader } from "../../components/app-header";
import { ReadinessPanel } from "../../components/readiness-panel";

export default function PlacementPage() {
  return (
    <main className="planner-page shell">
      <AppHeader active="placement" />
      <section className="planner-heading" aria-labelledby="placement-title">
        <p className="eyebrow">Transparent preparation signal</p>
        <h1 id="placement-title">Placement readiness</h1>
        <p>
          This is preparation readiness—not a hiring probability. Every cap,
          dimension, evidence gate, and projection is visible.
        </p>
      </section>
      <ReadinessPanel />
    </main>
  );
}

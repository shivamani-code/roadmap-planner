import { AppHeader } from "../../components/app-header";
import { RoadmapView } from "../../components/roadmap-view";

export default function RoadmapPage() {
  return (
    <main className="roadmap-page shell">
      <AppHeader active="roadmap" />
      <section className="roadmap-heading" aria-labelledby="roadmap-title">
        <p className="eyebrow">Browser-generated strategy</p>
        <h1 id="roadmap-title">Your path to the target</h1>
        <p>
          Inspect the full learning horizon, weekly checkpoints and daily study
          rhythm, then download it before leaving.
        </p>
      </section>
      <RoadmapView />
    </main>
  );
}

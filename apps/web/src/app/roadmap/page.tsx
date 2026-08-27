import { AppHeader } from "../../components/app-header";
import { RoadmapView } from "../../components/roadmap-view";
import { GroundedExplanation } from "../../components/grounded-explanation";

export default async function RoadmapPage({
  searchParams,
}: {
  searchParams: Promise<{ gap?: string }>;
}) {
  const { gap } = await searchParams;
  return (
    <main className="roadmap-page shell">
      <AppHeader active="roadmap" />
      <section className="roadmap-heading" aria-labelledby="roadmap-title">
        <p className="eyebrow">Prerequisite-safe strategy</p>
        <h1 id="roadmap-title">Your path to the target</h1>
        <p>
          The full horizon is here for inspection. Daily execution will still
          begin with the smallest feasible next action.
        </p>
      </section>
      <RoadmapView gapAnalysisId={gap} />
      <div className="communication-section">
        <GroundedExplanation useCase="roadmap" />
      </div>
    </main>
  );
}

import { AppHeader } from "../../components/app-header";
import { WeeklyReviewForm } from "../../components/weekly-review-form";
import { GroundedExplanation } from "../../components/grounded-explanation";

export default function ReviewPage() {
  return (
    <main className="planner-page shell">
      <AppHeader active="review" />
      <section className="planner-heading" aria-labelledby="review-title">
        <p className="eyebrow">Four-week adaptive signal</p>
        <h1 id="review-title">Weekly review</h1>
        <p>
          Compare planned and completed work, record how the load felt, and let
          the next version respond within your declared time.
        </p>
      </section>
      <WeeklyReviewForm />
      <div className="communication-section">
        <GroundedExplanation useCase="weekly" />
      </div>
    </main>
  );
}

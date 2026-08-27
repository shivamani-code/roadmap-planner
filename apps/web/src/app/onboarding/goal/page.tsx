import Link from "next/link";
import { CareerGoalForm } from "../../../components/career-goal-form";

export default function CareerGoalPage() {
  return (
    <main className="onboarding-page shell">
      <header className="onboarding-header">
        <Link className="brand" href="/" aria-label="StudentOS home">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          StudentOS
        </Link>
        <span>Step 2 of 5 · Career goal</span>
      </header>
      <section
        className="onboarding-layout wide-form"
        aria-labelledby="goal-title"
      >
        <div className="onboarding-intro">
          <p className="eyebrow">Pick a reviewed target</p>
          <h1 id="goal-title">What are you preparing for?</h1>
          <p>
            Compare the required skills and typical effort behind each target.
            This is preparation readiness, never a promise of employment.
          </p>
        </div>
        <div className="onboarding-card">
          <CareerGoalForm />
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";
import { AssessmentForm } from "../../../components/assessment-form";

export default function AssessmentPage() {
  return (
    <main className="onboarding-page shell">
      <header className="onboarding-header">
        <Link className="brand" href="/" aria-label="StudentOS home">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          StudentOS
        </Link>
        <span>Step 3 of 5 · Skills assessment</span>
      </header>
      <section
        className="onboarding-layout wide-form"
        aria-labelledby="assessment-title"
      >
        <div className="onboarding-intro">
          <p className="eyebrow">Start from honest evidence</p>
          <h1 id="assessment-title">What can you do today?</h1>
          <p>
            Choose the closest observable level. “Not sure” stays unknown—it is
            never silently scored as zero.
          </p>
        </div>
        <div className="onboarding-card">
          <AssessmentForm />
        </div>
      </section>
    </main>
  );
}

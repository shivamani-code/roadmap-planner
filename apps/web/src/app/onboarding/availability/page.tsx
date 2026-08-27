import Link from "next/link";
import { AvailabilityForm } from "../../../components/availability-form";

export default function AvailabilityPage() {
  return (
    <main className="onboarding-page shell">
      <header className="onboarding-header">
        <Link className="brand" href="/" aria-label="StudentOS home">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          StudentOS
        </Link>
        <span>Step 4 of 5 · Availability</span>
      </header>
      <section
        className="onboarding-layout wide-form"
        aria-labelledby="availability-title"
      >
        <div className="onboarding-intro">
          <p className="eyebrow">Plan within real constraints</p>
          <h1 id="availability-title">When can you reliably study?</h1>
          <p>
            StudentOS reserves 15% of declared time for disruption. Your roadmap
            is activated only when the remaining capacity can support the
            target.
          </p>
        </div>
        <div className="onboarding-card">
          <AvailabilityForm />
        </div>
      </section>
    </main>
  );
}

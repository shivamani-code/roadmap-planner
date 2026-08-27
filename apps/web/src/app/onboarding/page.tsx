import Link from "next/link";
import { AcademicOnboardingForm } from "../../components/academic-onboarding-form";

export default function AcademicOnboardingPage() {
  return (
    <main className="onboarding-page shell">
      <header className="onboarding-header">
        <Link className="brand" href="/" aria-label="StudentOS home">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          StudentOS
        </Link>
        <span>Step 1 of 5 · Academic profile</span>
      </header>
      <section className="onboarding-layout" aria-labelledby="onboarding-title">
        <div className="onboarding-intro">
          <p className="eyebrow">JNTUH R25 · Telangana</p>
          <h1 id="onboarding-title">Confirm your B.Tech curriculum</h1>
          <p>
            R25 applies here to JNTUH non-autonomous affiliated colleges from
            the 2025-26 batch. Autonomous-college syllabi are separate and are
            never silently treated as JNTUH R25.
          </p>
        </div>
        <div className="onboarding-card">
          <AcademicOnboardingForm />
        </div>
      </section>
    </main>
  );
}

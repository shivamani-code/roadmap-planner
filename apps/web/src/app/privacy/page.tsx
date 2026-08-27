import Link from "next/link";
import { PrivacyCenter } from "../../components/privacy-center";

export default function PrivacyPage() {
  return (
    <main className="legal-page shell">
      <Link className="brand" href="/">
        <span className="brand-mark" aria-hidden="true">
          S
        </span>
        StudentOS
      </Link>
      <h1>Privacy and pilot controls</h1>
      <p>
        StudentOS collects only the academic, goal, availability, and progress
        data needed to create the plan. CGPA and backlog count are optional. The
        MVP does not collect government IDs, exact address, caste, religion,
        family income, health data, or biometric data.
      </p>
      <p>
        Essential planning continues when optional analytics and AI processing
        are off. Notification, analytics, and AI choices are separate and
        revocable.
      </p>
      <PrivacyCenter />
    </main>
  );
}

import Link from "next/link";
import { GapReport } from "../../components/gap-report";

export default function GapPage() {
  return (
    <main className="gap-page shell">
      <header className="onboarding-header">
        <Link className="brand" href="/" aria-label="StudentOS home">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          StudentOS
        </Link>
        <span>Step 5 of 5 · Career bridge</span>
      </header>
      <section className="gap-heading" aria-labelledby="gap-title">
        <p className="eyebrow">From your branch to your selected role</p>
        <h1 id="gap-title">See the reason. Then see the plan.</h1>
        <p>
          Follow every role requirement back to a subject, skill mapping, and
          evidence level. Then turn only the remaining work into a realistic
          roadmap.
        </p>
      </section>
      <GapReport />
    </main>
  );
}

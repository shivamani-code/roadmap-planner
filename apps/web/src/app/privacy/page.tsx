import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="legal-page shell">
      <Link className="brand" href="/">
        <span className="brand-mark" aria-hidden="true">
          S
        </span>
        StudentOS
      </Link>
      <p className="eyebrow">Browser-only privacy</p>
      <h1>No account. No student database.</h1>
      <p>
        StudentOS uses the answers you enter only in the memory of the current
        open page to calculate your gap report and roadmap. The student website
        does not send those answers to an API and does not save a profile.
      </p>
      <p>
        Refreshing or closing the page removes the temporary plan. Use the
        download button if you want to keep a copy on your own device.
      </p>
      <Link className="button button-primary" href="/onboarding">
        Build a private roadmap
      </Link>
    </main>
  );
}

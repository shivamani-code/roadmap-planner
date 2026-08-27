import { redirect } from "next/navigation";
import Link from "next/link";
import { SignInForm } from "../../components/sign-in-form";

export default function SignInPage() {
  if (process.env.NODE_ENV === "development") redirect("/onboarding");

  return (
    <main className="auth-page">
      <Link className="brand auth-brand" href="/">
        <span className="brand-mark" aria-hidden="true">
          S
        </span>
        StudentOS
      </Link>
      <section className="auth-card" aria-labelledby="sign-in-title">
        <p className="eyebrow">Your plan stays with you</p>
        <h1 id="sign-in-title">Sign in to build your roadmap</h1>
        <p>
          Use a verified email link. No password to remember, and no roadmap is
          generated before you confirm your profile.
        </p>
        <SignInForm />
        <small>
          By continuing, you agree to the Terms and acknowledge the Privacy
          Notice.
        </small>
      </section>
    </main>
  );
}

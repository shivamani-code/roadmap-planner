import Link from "next/link";

const links = [
  ["Start", "/onboarding", "onboarding"],
  ["Gap report", "/gap", "gap"],
  ["Roadmap", "/roadmap", "roadmap"],
] as const;

export function AppHeader({ active }: { active: string }) {
  return (
    <header className="app-header">
      <Link className="brand" href="/" aria-label="StudentOS home">
        <span className="brand-mark" aria-hidden="true">
          S
        </span>
        StudentOS
      </Link>
      <nav className="app-nav" aria-label="Student workspace">
        {links.map(([label, href, key]) => (
          <Link
            key={key}
            aria-current={key === active ? "page" : undefined}
            href={href}
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

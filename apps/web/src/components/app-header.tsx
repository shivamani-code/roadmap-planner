import Link from "next/link";
import { ActivityPulse } from "./activity-pulse";

const links = [
  ["Today", "/today", "today"],
  ["Week", "/plan/week", "week"],
  ["Roadmap", "/roadmap", "roadmap"],
  ["Progress", "/progress", "progress"],
  ["Skills", "/skills", "skills"],
  ["Projects", "/projects", "projects"],
  ["Placement", "/placement", "placement"],
  ["Review", "/review", "review"],
  ["Calendar", "/calendar", "calendar"],
  ["Recalculate", "/recalculate", "recalculate"],
  ["Inbox", "/notifications", "notifications"],
  ["Privacy", "/privacy", "privacy"],
] as const;

export function AppHeader({ active }: { active: string }) {
  return (
    <header className="app-header">
      <ActivityPulse />
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

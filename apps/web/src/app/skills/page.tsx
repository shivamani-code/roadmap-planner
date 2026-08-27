import { AppHeader } from "../../components/app-header";
import { SkillMap } from "../../components/skill-map";

export default function SkillsPage() {
  return (
    <main className="planner-page shell">
      <AppHeader active="skills" />
      <section className="planner-heading" aria-labelledby="skills-title">
        <p className="eyebrow">Evidence, not checkmarks</p>
        <h1 id="skills-title">Skill evidence</h1>
        <p>
          Inspect the estimate, its confidence, and every source that supports
          it. Lower-confidence evidence remains visibly lower-confidence.
        </p>
      </section>
      <SkillMap />
    </main>
  );
}

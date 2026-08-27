import { AppHeader } from "../../components/app-header";
import { ProjectHub } from "../../components/project-hub";

export default function ProjectsPage() {
  return (
    <main className="planner-page shell">
      <AppHeader active="projects" />
      <section className="planner-heading" aria-labelledby="projects-title">
        <p className="eyebrow">Portfolio evidence</p>
        <h1 id="projects-title">Projects</h1>
        <p>
          Choose from reviewed templates, clear hard prerequisites, and finish
          one primary project through rubric-reviewed milestones.
        </p>
      </section>
      <ProjectHub />
    </main>
  );
}

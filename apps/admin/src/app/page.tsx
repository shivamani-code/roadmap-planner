import { canPublish, type AdminRole } from "../lib/admin-policy";
import {
  CareerWorkflow,
  CurriculumWorkflow,
} from "../components/curriculum-workflow";

export default function AdminFoundationPage() {
  const role: AdminRole = "CONTENT_EDITOR";
  return (
    <main className="admin-shell">
      <header>
        <div>
          <span className="admin-mark">S</span>
          <strong>StudentOS</strong>
          <small>Content operations</small>
        </div>
        <span className="environment">Foundation environment</span>
      </header>
      <section className="admin-hero">
        <p>Phase 2 · Academic system</p>
        <h1>Validate first. Review independently. Publish immutably.</h1>
        <span>
          Imports use the canonical schema, reference and cycle checks, source
          provenance, and editor/reviewer separation before becoming selectable.
        </span>
      </section>
      <CurriculumWorkflow />
      <section className="admin-section-heading">
        <p>Career knowledge</p>
        <h2>Publish an acyclic, fully covered role graph.</h2>
      </section>
      <CareerWorkflow />
      <section className="policy-card">
        <div>
          <p>Current role</p>
          <strong>{role}</strong>
        </div>
        <div>
          <p>Publish permission</p>
          <strong>
            {canPublish(role) ? "Allowed" : "Independent reviewer required"}
          </strong>
        </div>
      </section>
    </main>
  );
}

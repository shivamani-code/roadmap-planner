# Phase 0 Brief — Product Architecture

**Status:** Complete; human cross-functional review pending  
**Source of truth:** [`PRODUCT_DEVELOPMENT_SPEC.md`](../../PRODUCT_DEVELOPMENT_SPEC.md)  
**Phase objective:** Remove foundational ambiguity before application scaffolding or production content entry.

## Outcomes

Phase 0 must leave the team with a stable vocabulary, accepted architecture decisions, machine-readable content contracts, a deterministic algorithm proof, representative persona fixtures, and documented privacy/security/UX constraints.

## In scope

- Architecture decision records for deployment shape, data/graph storage, AI boundaries, versioning/evidence, API/jobs, and authentication.
- Domain glossary, invariants, identifiers, normalized scales, state names, and reason codes.
- Logical entity-relationship view and module/data ownership.
- Versioned JSON Schemas for curriculum, career-role requirements, project templates, and persona/algorithm fixtures.
- A dependency-free prototype for gap contribution, priority, feasibility, prerequisite ordering, and weekly capacity checks.
- At least eight synthetic personas covering beginner, intermediate, role switch, final-year, limited time, advanced, data role, exam mode, infeasible deadline, and unsupported curriculum.
- Information architecture, critical low-fidelity flows, initial design tokens, and WCAG 2.2 AA baseline.
- Data classification/retention model and initial STRIDE threat model.
- Validation report mapping artifacts to the Phase 0 definition of done.

## Explicit non-goals

- No Next.js, NestJS, PostgreSQL, Redis, CI/CD, auth provider, or cloud environment setup; those begin in Phase 1.
- No production JNTUH syllabus facts or claims. Fixtures are synthetic and clearly marked.
- No final role graph, project catalog, visual design, component library, or application page implementation.
- No AI integration. The prototype demonstrates that core planning is deterministic.
- No microservices, native apps, social features, jobs, mentors, community, or broad university/role coverage.

## Decisions that must be closed

| Decision                                     | Artifact | Status   |
| -------------------------------------------- | -------- | -------- |
| Initial system shape and extraction boundary | ADR-0001 | Accepted |
| Knowledge graph storage                      | ADR-0002 | Accepted |
| Deterministic versus AI responsibilities     | ADR-0003 | Accepted |
| Content, evidence, and roadmap history       | ADR-0004 | Accepted |
| REST, jobs, idempotency, and conflicts       | ADR-0005 | Accepted |
| Passwordless authentication approach         | ADR-0006 | Accepted |

## Deliverables and checks

| Deliverable          | Verification                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------- |
| ADR set              | Every ADR contains context, decision, alternatives, consequences, and revisit trigger.    |
| Domain vocabulary    | All fixture/schema terms use the canonical names and scales.                              |
| Import schemas       | Valid JSON Schema 2020-12; valid and invalid fixtures are exercised.                      |
| Prototype            | Same input produces byte-equivalent normalized result; no dependency/capacity breach.     |
| Persona suite        | At least eight scenarios and explicit expected assertions.                                |
| Privacy/threat model | Data classes, retention, trust boundaries, mitigations, and owners documented.            |
| IA/design baseline   | Today-first hierarchy, critical flows, tokens, and accessibility requirements documented. |
| Phase report         | Evidence, open risks, owners, and Phase 1 entry decision recorded.                        |

## Definition of done

- The product specification and all Phase 0 artifacts agree on terminology and invariants.
- All JSON and JSON Schema files parse and fixture validation passes.
- The prototype tests pass on a clean checkout using only Node's standard library.
- At least eight personas prove prerequisite, capacity, overlap, unknown-skill, exam, and infeasible-deadline behavior.
- Foundational decisions blocking database/API scaffolding are accepted or explicitly assigned with a Phase 1 deadline.
- Risks have a named role owner even where a person has not yet been assigned.

Completion evidence is recorded in [`PHASE_0_VERIFICATION.md`](./PHASE_0_VERIFICATION.md).

## Required review roles

- Product Architect: coherence and scope.
- Curriculum Content Lead: source/provenance and mapping contract.
- Career Knowledge Lead: role depth, prerequisites, and evidence contract.
- Engineering Lead: schemas, algorithms, module/API decisions.
- Product Designer/Accessibility Lead: IA and interaction baseline.
- Privacy/Security Lead: classification, retention, and threats.
- QA Lead: persona assertions and regression approach.

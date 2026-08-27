# ADR-0001: Start as a Modular Monolith

- **Status:** Accepted
- **Date:** 2026-08-24
- **Owners:** Engineering Lead, Product Architect

## Context

StudentOS has strong domain boundaries but an MVP-sized team and workflow. Gap analysis, roadmap activation, evidence, and task completion require consistent transactions. Premature microservices would add distributed failure modes and slow content/product iteration; an unstructured single service would erase extraction boundaries.

## Decision

Build one NestJS API deployment and one background-worker deployment over one PostgreSQL system of record. Enforce modules for identity/profile, curriculum, career knowledge, assessment, gap, roadmap, scheduling, progress, projects, readiness, notifications, AI, analytics, and admin. Modules communicate through application ports/services and domain events; they do not import another module's repository. Use a transactional outbox for work that crosses the commit boundary.

## Consequences

- Cross-domain invariants can use local transactions.
- Deployment and local development remain manageable.
- Module ownership and API contracts require active review to prevent erosion.
- API and worker can scale independently, but one hot module still shares the database until extracted.

## Alternatives rejected

- **Microservices now:** operational/distributed-transaction cost is not justified by measured load or team ownership.
- **Single Next.js full-stack application:** couples domain/worker concerns to UI deployment and weakens service boundaries.
- **Unstructured Express/Nest application:** fastest initially but makes later extraction and algorithm testing harder.

## Revisit when

A module has independently measured scaling, availability, data-sovereignty, or team-release requirements that the modular monolith cannot meet without harming other modules.

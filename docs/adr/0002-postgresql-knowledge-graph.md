# ADR-0002: Store the Knowledge Graph in PostgreSQL

- **Status:** Accepted
- **Date:** 2026-08-24
- **Owners:** Data/Backend Lead, Career Knowledge Lead

## Context

Curriculum topics, canonical skills, prerequisites, mappings, requirements, and evidence form graphs, but they are bounded, highly relational, versioned, and participate in transactional publication and roadmap generation.

## Decision

Use normalized PostgreSQL tables and adjacency edges. Enforce referential/range/uniqueness constraints in the database and reject graph cycles during publication. Use recursive CTEs or load immutable versions into memory for traversal. Cache published graph versions by immutable key.

## Consequences

- Version activation, provenance, mappings, and roadmap snapshots remain transactionally consistent.
- Standard SQL and operational tooling cover both relational and bounded graph needs.
- Cycle/topological validators must be explicit application code.
- Very large graph analytics may later need a projection/search system, not a source-of-truth migration.

## Alternatives rejected

- **Graph database:** adds another source of truth and distributed consistency before graph scale requires it.
- **JSON documents only:** weak referential integrity and difficult impact queries.
- **Hard-coded TypeScript objects:** educational content could not be reviewed/versioned without deployments.

## Revisit when

Production traces show graph queries or authoring workflows cannot meet targets after indexes, recursive SQL, caching, and in-memory traversal are optimized.

# ADR-0005: REST Commands with Asynchronous Heavy Jobs

- **Status:** Accepted
- **Date:** 2026-08-24
- **Owners:** Backend Lead, Frontend Lead

## Context

Most reads/commands are conventional resource operations, while roadmap generation, recalculation, content imports, snapshots, and AI explanations may outlive an HTTP request. Mobile/offline retries make duplicate commands likely.

## Decision

Expose versioned REST JSON with generated OpenAPI clients. Heavy operations return `202` and a job resource with real stages. Mutations use idempotency keys; conflicting mutable resources use optimistic concurrency. Errors use typed problem details. Initial loading may poll; server-sent events are optional after reliable job state exists.

## Consequences

- Contracts are explicit and tooling/testing are straightforward.
- Clients can recover after navigation or connectivity loss using a job ID.
- Idempotency storage, expiry, and request hashing are mandatory.
- Polling must use backoff and visibility awareness.

## Alternatives rejected

- **GraphQL:** flexible reads do not outweigh added authorization/caching/schema complexity for the MVP.
- **Synchronous generation:** timeout/retry behavior could duplicate plans and loses real progress stages.
- **WebSockets as default:** unnecessary persistent-connection complexity for infrequent jobs.

## Revisit when

Measured product flows require client-defined graph reads or high-frequency collaborative updates that REST/read models cannot serve cleanly.

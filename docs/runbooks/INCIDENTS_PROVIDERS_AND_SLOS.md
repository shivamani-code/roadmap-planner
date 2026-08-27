# Incidents, provider degradation, and SLOs

## Dashboards and alerts

Production dashboards must cover API p50/p95/error rate, database readiness/saturation, generation latency/failure/invariant rate, outbox pending age/failed count, worker sweep failures, notification failure/suppression, AI fallback rate, and export/deletion completion. Alerts carry an owner, severity, correlation ID, and this runbook link; dashboards contain no student content.

Targets: dashboard p95 <500 ms, today/week p95 <350 ms, task completion p95 <300 ms, initial generation p95 <15 s, recalculation p95 <20 s, availability 99.9% after beta.

## Incident flow

1. Acknowledge, assign severity/commander, freeze risky deploys, and preserve redacted evidence.
2. Contain with feature/content flags, provider disablement, credential rotation, or rollback that preserves student history.
3. Diagnose via correlation ID and aggregate metrics; never paste tokens, email, notes, answers, URLs, AI facts, or exports into tickets.
4. Recover, verify health and invariants, notify privacy/security owners when relevant, and document timeline/root cause/actions.

## Degradation drills

- AI unavailable/invalid/timeout: deterministic explanations remain; outbox retries; planning and completion stay available.
- Email unavailable: in-app state remains; delivery backs off or records provider-disabled without duplicate intent.
- Analytics unavailable: domain writes continue through transactional outbox/default observable sink.
- Worker stopped: API remains usable; queue age alert fires; restart proves claim-once/idempotent handling.
- Database unavailable: readiness fails, liveness stays up, and no false success is returned.

Run provider and worker drills in staging before each pilot expansion and attach timestamps, injected fault, observed behavior, recovery time, and owner approval.

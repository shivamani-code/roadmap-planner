# ADR-0003: Structured Data and Rules Are the Source of Truth

- **Status:** Accepted
- **Date:** 2026-08-24
- **Owners:** Product Architect, AI Lead, Content Leads

## Context

Unconstrained LLM roadmaps are variable, difficult to test, may invent syllabus facts, and cannot guarantee prerequisites/capacity. AI is still valuable for understandable wording and constrained coaching.

## Decision

Published curriculum, career requirements, prerequisites, effort, mappings, learning units, and projects are structured and reviewed. Deterministic code owns gap math, priority, feasibility, scheduling, scores, state transitions, and activation. AI may explain, summarize, rank allowlisted resources, or parse a special constraint into a proposal. All AI output passes schema/ID validation and has a deterministic fallback. AI cannot write roadmap truth or evidence.

## Consequences

- The core product functions through an AI outage and is regression-testable.
- Content operations and ruleset governance are first-class product capabilities.
- AI prompts receive less private data and lower hallucination opportunity.
- New roles require reviewed data instead of a prompt change.

## Alternatives rejected

- **Free-form LLM generation:** fails reproducibility, provenance, and safety requirements.
- **No AI at all:** loses useful explanation/coaching improvements, though it remains a valid degradation mode.

## Revisit when

Only the set of allowed AI use cases and model/provider implementation may change. Core truth ownership requires a new product/security ADR and equivalent deterministic validation.

# Content Contracts and Synthetic Fixtures

`schemas/` contains versioned JSON Schema 2020-12 import contracts. `fixtures/` contains synthetic data used only for Phase 0 validation and algorithm regression.

None of the fixture subject codes, curriculum coverage, career requirements, effort estimates, or project definitions is authoritative JNTUH or industry content. Production data must enter through source provenance, quarantine, semantic validation, two-person review, impact regression, and immutable publication described in the product specification.

Contracts deliberately separate:

- curriculum facts (`curriculum-import`);
- reviewed curriculum-to-skill claims (`curriculum-skill-mapping`);
- canonical career skills/requirements/learning units (`career-knowledge`);
- project prerequisites/evidence (`project-template`);
- synthetic roadmap scenarios (`persona-fixture`).

Phase 1/2 must use a standards-compliant JSON Schema validator plus the semantic graph/cross-reference validators. Schema changes require a new semantic version and migration/compatibility policy; never edit a published schema contract in place.

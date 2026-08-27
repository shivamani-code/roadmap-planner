# Data Classification, Minimization, and Retention

**Owner:** Privacy/Security Lead  
**Applies to:** Production, staging, logs, analytics, support tools, exports, backups, and AI calls.

## Classification levels

| Class        | Meaning                                        | Examples                                                                                                                | Controls                                                                                                 |
| ------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Public       | Intentionally public product/content metadata. | Published role name, generic skill definition, public landing copy.                                                     | Integrity/version controls; CDN/cache allowed.                                                           |
| Internal     | Operational data with low individual impact.   | Content import status, aggregate service metrics, non-sensitive feature flags.                                          | Authenticated staff access; no public bucket/log dump.                                                   |
| Confidential | Student-linked or business-sensitive data.     | Email, academic selection, goal, availability, task history, skill evidence, project link.                              | Least privilege, TLS/at-rest encryption, redacted logs, audited support access.                          |
| Restricted   | High-risk secret/security/private text.        | Session/verification tokens, admin recovery codes, provider secrets, future private notes or uploaded source documents. | Hash or strong encryption, secret manager/private object store, no analytics/AI, tightly audited access. |

## Data inventory and purpose

| Data                                         | Class                              |                                                       Required? | Purpose                             | Default retention                                                      |
| -------------------------------------------- | ---------------------------------- | --------------------------------------------------------------: | ----------------------------------- | ---------------------------------------------------------------------- |
| Email/provider subject                       | Confidential                       |                                                             Yes | Account/authentication              | Account life + 30-day recovery, then purge.                            |
| Display name/avatar                          | Confidential                       |                                                              No | Personalization                     | Account life; user editable/removable.                                 |
| University/regulation/degree/branch/semester | Confidential when user-linked      |                                                             Yes | Curriculum selection and plan       | Account life; history versioned until deletion.                        |
| College                                      | Confidential                       |               Required only for college calendar/affiliation UX | Calendar and support context        | Account life; omit from AI when university/program suffices.           |
| Graduation/deadline                          | Confidential                       |                                                             Yes | Feasibility and scheduling          | Account life.                                                          |
| CGPA/backlog count                           | Confidential                       |                                                              No | Optional academic allocation        | Account life; user may clear; never analytics/AI.                      |
| Availability/exam dates                      | Confidential                       |                         Yes for schedule; manual exams optional | Capacity/exam mode                  | Active + historical plan reproducibility; purge on deletion.           |
| Assessment response/evidence                 | Confidential                       | Yes for personalized gap, though assessment can be conservative | Skill estimate/readiness            | Account life; purge on deletion.                                       |
| Task/project progress and artifact URL       | Confidential                       |                                Core; artifacts optional by task | Execution and evidence              | Account life; artifacts purge on deletion.                             |
| Free-form notes                              | Not collected in MVP               |                                                              No | None                                | Do not add without privacy review.                                     |
| Auth/session tokens                          | Restricted                         |                                                             Yes | Session security                    | Session expiry/revoke; hashed token immediately unusable after revoke. |
| Security logs                                | Confidential, secrets redacted     |                                                             Yes | Abuse/incident response             | 90 days.                                                               |
| Generation debug payload                     | Confidential, minimized/redacted   |                                                     Operational | Failure diagnosis                   | 30 days.                                                               |
| Notification delivery record                 | Confidential                       |                                                     Operational | Delivery/dedupe/support             | 90 days.                                                               |
| Admin audit                                  | Confidential                       |                                                        Required | Publication/security accountability | 1 year; anonymize user references after deletion where possible.       |
| Product analytics event                      | Pseudonymous Internal/Confidential |                            Consent except essential reliability | Product improvement                 | 13 months maximum; no sensitive properties.                            |
| AI request/response                          | Confidential after minimization    |                          Only for optional explanation use case | Explanations/coaching               | 30 days or provider minimum lower; no model training.                  |
| AI audit/cache                               | Pseudonymous Confidential          |                                                     Operational | Grounding/fallback/evaluation       | Cache one day; redacted audit 30 days; purge on deletion.              |
| Notification preferences/intent context      | Confidential                       |                                            Optional/operational | Consent, dedupe, state re-check     | Preferences account life; delivery and expired intent 90 days.         |
| Pilot feedback                               | Confidential                       |                                                              No | Usefulness/UAT                      | Account life; aggregate only with analytics consent.                   |
| Account deletion tombstone                   | Pseudonymous Restricted            |                                                     Operational | Prevent restore resurrection        | Narrow external ledger per approved security/legal retention.          |

## Prohibited MVP collection

Government IDs, biometric/health data, exact home address, caste, religion, family income, college roll number, personal contacts, private messages, salary prediction inputs, and continuous device/location data.

## Data subject controls

- View/edit optional profile fields and revoke notification/analytics/AI consents independently.
- Export account, profile versions, goals, availability, assessments/evidence, roadmaps, completions, projects, readiness, and preferences as JSON.
- Delete: disable immediately, revoke sessions/jobs, retain recoverable encrypted data up to 30 days, then purge student-scoped rows and object artifacts and record a non-identifying completion audit.
- Recover: authorized support may reactivate only within the 30-day window; all sessions stay revoked and cancelled work stays cancelled.
- Rectify append-only evidence with a compensating invalidation event; do not silently rewrite history.

## Environment and support rules

- Production student data never enters local development or preview environments.
- Staging uses synthetic fixtures. If production diagnosis is unavoidable, use time-bound, approved, audited read-only access and redact before export.
- Support sees the minimum plan metadata. Read-only impersonation requires explicit student consent and a visible audit entry.
- Backups inherit source classification. Deletion propagates when backups expire; restore runbooks must reapply tombstones.

## AI minimization matrix

| Use case           | Allowed inputs                                                        | Never send                                                           |
| ------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Gap explanation    | Role label, classification, normalized depths, approved rationale IDs | Email, CGPA/backlogs, raw answers, exact college, private artifacts. |
| Weekly summary     | Aggregate completed/planned counts/minutes, approved reason labels    | Task notes, URLs, identity, notification/contact data.               |
| Resource ranking   | Skill IDs/depth, approved resource IDs/metadata                       | Student identity or raw assessment data.                             |
| Constraint parsing | User-entered constraint text only after warning/consent               | Unrelated profile/history.                                           |

## Review gates

Any new data field must identify purpose, class, necessity, retention, access roles, export/delete behavior, analytics use, AI use, and legal basis/consent before schema implementation.

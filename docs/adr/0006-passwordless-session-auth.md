# ADR-0006: Passwordless OAuth and Email Magic Links with Server Sessions

- **Status:** Accepted
- **Date:** 2026-08-24
- **Owners:** Security Lead, Backend Lead

## Context

The MVP needs low-friction Google/email authentication for students without taking on password storage/recovery. It must revoke access, protect browser sessions, and avoid binding domain data to one identity vendor.

## Decision

Use a standards-based OAuth/OIDC adapter for Google plus verified email magic links. Link provider subjects to an internal user ID. Keep sessions server-side with hashed random tokens and Secure, HttpOnly, SameSite cookies. Require CSRF protection for mutations. Mobile number/password authentication is not in the MVP.

## Consequences

- No password database or recovery workflow.
- Provider/email delivery outages affect sign-in but not active validated sessions.
- Session persistence and cleanup become platform responsibilities.
- Admin step-up/MFA must be added before production content publication.

## Alternatives rejected

- **Passwords:** unnecessary breach/recovery burden for the MVP.
- **JWT-only browser auth:** harder revocation and increased token exposure risk.
- **Provider user ID as domain key:** creates lock-in and breaks account linking.

## Revisit when

Native clients, institutional SSO, phone-first cohorts, or passkey adoption justify an additional authenticator. Internal user identity remains stable.

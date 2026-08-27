const apiUrl = process.env.SECURITY_API_URL;
const webUrl = process.env.SECURITY_WEB_URL;
const allowedOrigin = process.env.SECURITY_ALLOWED_ORIGIN;
if (!apiUrl || !webUrl || !allowedOrigin)
  throw new Error(
    "SECURITY_API_URL, SECURITY_WEB_URL, and SECURITY_ALLOWED_ORIGIN are required",
  );

const failures = [];
function requireHeader(response, name, expected) {
  const value = response.headers.get(name);
  if (!value || (expected && !expected.test(value)))
    failures.push(`${name} missing or invalid: ${value ?? "missing"}`);
  return value;
}

const apiBase = apiUrl.replace(/\/$/, "");
const webBase = webUrl.replace(/\/$/, "");
const readiness = await fetch(`${apiBase}/health/ready`);
if (!readiness.ok) failures.push(`API readiness returned ${readiness.status}`);
requireHeader(readiness, "x-content-type-options", /^nosniff$/i);
requireHeader(readiness, "content-security-policy", /default-src 'none'/);

const web = await fetch(webBase, { redirect: "manual" });
if (!web.ok) failures.push(`Web root returned ${web.status}`);
requireHeader(web, "content-security-policy", /script-src[^;]*'nonce-[^']+'/);
requireHeader(web, "x-frame-options", /^DENY$/i);
requireHeader(web, "referrer-policy", /strict-origin-when-cross-origin/i);
if (webBase.startsWith("https://"))
  requireHeader(web, "strict-transport-security", /max-age=31536000/i);

const rejectedOrigin = await fetch(`${apiBase}/health/live`, {
  headers: { origin: "https://attacker.invalid" },
});
if (rejectedOrigin.headers.has("access-control-allow-origin"))
  failures.push("Untrusted origin received CORS access");
const acceptedOrigin = await fetch(`${apiBase}/health/live`, {
  headers: { origin: allowedOrigin },
});
if (acceptedOrigin.headers.get("access-control-allow-origin") !== allowedOrigin)
  failures.push("Configured web origin did not receive CORS access");

const csrf = await fetch(`${apiBase}/privacy/preferences`, {
  method: "PUT",
  headers: {
    cookie: "studentos_session=security-smoke-invalid-session",
    "content-type": "application/json",
    origin: allowedOrigin,
  },
  body: JSON.stringify({ analyticsConsent: false }),
});
const csrfBody = await csrf.json().catch(() => ({}));
if (csrf.status !== 403 || csrfBody.code !== "CSRF_TOKEN_INVALID")
  failures.push(`CSRF negative control failed with ${csrf.status}`);

if (process.env.SECURITY_TEST_RATE_LIMIT === "true") {
  const statuses = [];
  for (let requestIndex = 0; requestIndex < 6; requestIndex += 1) {
    const response = await fetch(`${apiBase}/auth/magic-links`, {
      method: "OPTIONS",
      headers: {
        origin: allowedOrigin,
        "access-control-request-method": "POST",
      },
    });
    statuses.push(response.status);
    if (requestIndex === 5 && !response.headers.has("retry-after"))
      failures.push("Rate-limit response omitted Retry-After");
  }
  if (statuses.at(-1) !== 429)
    failures.push(`Rate-limit negative control returned ${statuses.join(",")}`);
}

process.stdout.write(
  `${JSON.stringify({ checkedAt: new Date().toISOString(), passed: failures.length === 0, failures }, null, 2)}\n`,
);
if (failures.length > 0) process.exitCode = 1;

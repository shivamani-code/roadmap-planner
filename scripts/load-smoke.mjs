const baseUrl = process.env.LOAD_BASE_URL;
if (!baseUrl) throw new Error("LOAD_BASE_URL is required");
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 20);
const rounds = Number(process.env.LOAD_ROUNDS ?? 10);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 500)
  throw new Error("LOAD_CONCURRENCY must be an integer from 1 to 500");
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 1_000)
  throw new Error("LOAD_ROUNDS must be an integer from 1 to 1000");

const cookie = process.env.LOAD_COOKIE;
const configuredPaths = process.env.LOAD_PATHS_JSON
  ? JSON.parse(process.env.LOAD_PATHS_JSON)
  : [{ name: "readiness", path: "/health/ready", p95Ms: 500 }];
if (!Array.isArray(configuredPaths) || configuredPaths.length === 0)
  throw new Error("LOAD_PATHS_JSON must be a non-empty JSON array");

function percentile(values, percent) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * percent) - 1)
  ];
}

const results = [];
for (const target of configuredPaths) {
  if (
    !target ||
    typeof target.name !== "string" ||
    typeof target.path !== "string" ||
    typeof target.p95Ms !== "number" ||
    !target.path.startsWith("/")
  )
    throw new Error("Each load path needs name, absolute path, and p95Ms");
  const durations = [];
  let errors = 0;
  for (let round = 0; round < rounds; round += 1) {
    const batch = await Promise.all(
      Array.from({ length: concurrency }, async () => {
        const started = performance.now();
        try {
          const response = await fetch(
            `${baseUrl.replace(/\/$/, "")}${target.path}`,
            {
              headers: cookie ? { cookie } : {},
              signal: AbortSignal.timeout(30_000),
            },
          );
          if (!response.ok) errors += 1;
          await response.arrayBuffer();
        } catch {
          errors += 1;
        } finally {
          durations.push(performance.now() - started);
        }
      }),
    );
    void batch;
  }
  const p95Ms = Math.round(percentile(durations, 0.95));
  const errorRate = errors / durations.length;
  results.push({
    name: target.name,
    requests: durations.length,
    concurrency,
    p50Ms: Math.round(percentile(durations, 0.5)),
    p95Ms,
    targetP95Ms: target.p95Ms,
    errors,
    errorRate,
    passed: p95Ms <= target.p95Ms && errorRate <= 0.001,
  });
}

process.stdout.write(
  `${JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2)}\n`,
);
if (results.some(({ passed }) => !passed)) process.exitCode = 1;

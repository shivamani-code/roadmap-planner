const baseUrl = process.env.STUDENTOS_API_URL ?? "http://localhost:4000/api/v1";

async function request(
  path,
  expected,
  { method = "GET", body, auth, idempotencyKey } = {},
) {
  const headers = new Headers({ accept: "application/json" });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (auth) {
    headers.set("cookie", auth.cookie);
    headers.set("x-studentos-csrf", auth.csrf);
    headers.set("origin", "http://localhost:3000");
  }
  if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const result = response.status === 204 ? null : await response.json();
  if (response.status !== expected)
    throw new Error(
      `${method} ${path} returned ${response.status}: ${JSON.stringify(result)}`,
    );
  return result;
}

async function signIn(email) {
  const link = await request("/auth/magic-links", 202, {
    method: "POST",
    body: { email },
  });
  const response = await fetch(`${baseUrl}/auth/magic-links/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: link.debugToken }),
  });
  if (!response.ok)
    throw new Error("Could not authenticate release-flow verifier");
  const cookies = response.headers.getSetCookie();
  const csrfCookie = cookies.find((value) =>
    value.startsWith("studentos_csrf="),
  );
  return {
    cookie: cookies.map((value) => value.split(";", 1)[0]).join("; "),
    csrf: decodeURIComponent(csrfCookie.split(";", 1)[0].split("=", 2)[1]),
  };
}

const [academic, roles] = await Promise.all([
  request("/catalog/academic-options", 200),
  request("/catalog/career-roles", 200),
]);
if (
  academic.length !== 17 ||
  academic.some((program) => program.synthetic) ||
  !academic.some((program) => program.branch.code === "CSE")
)
  throw new Error(
    "Release curriculum catalog is not the expected non-synthetic version",
  );
if (
  roles.length !== 33 ||
  roles.some((role) => role.synthetic || role.datasetVersion !== "2026.08.2")
)
  throw new Error("Release career catalog is incomplete or synthetic");

const cse = academic.find((program) => program.branch.code === "CSE");

const auth = await signIn(
  process.env.SMOKE_USER_EMAIL ?? `release-flow-${Date.now()}@studentos.local`,
);
const backend = roles.find((role) => role.role.key === "backend-engineer");
await request("/onboarding/academic-profile", 200, {
  method: "PUT",
  auth,
  body: {
    curriculumProgramId: cse.programId,
    currentSemester: 3,
    expectedGraduation: "2029-06-30",
    cgpa: 8.1,
    backlogCount: 0,
  },
});
await request("/onboarding/career-goal", 200, {
  method: "PUT",
  auth,
  body: {
    roleVersionId: backend.roleVersionId,
    targetLevel: "INTERNSHIP_READY",
    deadline: "2028-12-31",
    deadlineBasis: "PLACEMENT",
  },
});
const assessment = await request("/skill-assessments", 201, {
  method: "POST",
  auth,
});
if (assessment.statements.length < 10)
  throw new Error("Production role assessment is unexpectedly shallow");
await request(`/skill-assessments/${assessment.id}/responses`, 200, {
  method: "PUT",
  auth,
  body: {
    responses: assessment.statements.map(({ skillId }) => ({
      skillId,
      level: "BASIC",
    })),
  },
});
await request(`/skill-assessments/${assessment.id}/submit`, 201, {
  method: "POST",
  auth,
});
await request("/study-availability", 200, {
  method: "PUT",
  auth,
  body: {
    timezone: "Asia/Kolkata",
    maxSessionMinutes: 90,
    windows: [1, 2, 3, 4, 5, 6].map((day) => ({
      day,
      startMinute: 1080,
      endMinute: 1200,
    })),
  },
});
const gap = await request("/gap-analyses", 201, { method: "POST", auth });
if (!gap.items.length || gap.items.every((item) => item.curriculumDepth === 0))
  throw new Error("Curriculum mappings did not contribute to the gap analysis");
if (!gap.planScope?.requiredSkills || gap.planScope.remainingSkills < 1)
  throw new Error("Gap analysis did not return a completion scope");
const generation = await request("/roadmaps", 201, {
  method: "POST",
  auth,
  idempotencyKey: "release-flow-v1",
  body: { gapAnalysisId: gap.id },
});
if (generation.status !== "COMPLETED")
  throw new Error(`Roadmap generation ended in ${generation.status}`);
const [roadmap, progress, projects, readiness] = await Promise.all([
  request("/roadmaps/current", 200, { auth }),
  request("/progress?window=28", 200, { auth }),
  request("/projects/recommendations", 200, { auth }),
  request("/placement-readiness", 200, { auth }),
]);
if (
  !roadmap.terms?.length ||
  !roadmap.revision?.summary?.skillCount ||
  !projects.recommendations?.length
)
  throw new Error("Roadmap or project recommendations were not generated");

console.log(
  JSON.stringify(
    {
      curricula: academic.length,
      curriculum: cse.datasetVersion,
      roles: roles.length,
      assessedSkills: assessment.statements.length,
      mappedGapItems: gap.items.filter((item) => item.curriculumDepth > 0)
        .length,
      requiredSkills: gap.planScope.requiredSkills,
      roadmapTerms: roadmap.terms.length,
      recommendedProjects: projects.recommendations.length,
      progressWindow: progress.window,
      readinessStatus: readiness.status ?? "available",
    },
    null,
    2,
  ),
);

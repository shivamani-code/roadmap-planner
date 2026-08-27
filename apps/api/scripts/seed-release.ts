import { readFile, readdir } from "node:fs/promises";

const baseUrl = process.env.STUDENTOS_API_URL ?? "http://localhost:4000/api/v1";

interface Auth {
  readonly cookie: string;
  readonly csrf: string;
}

async function apiRequest(
  path: string,
  expected: number,
  options: { method?: string; body?: unknown; auth?: Auth } = {},
): Promise<unknown> {
  const headers = new Headers({ accept: "application/json" });
  if (options.body !== undefined)
    headers.set("content-type", "application/json");
  if (options.auth) {
    headers.set("cookie", options.auth.cookie);
    headers.set("x-studentos-csrf", options.auth.csrf);
    headers.set("origin", "http://localhost:3000");
  }
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    });
    const body: unknown =
      response.status === 204 ? null : await response.json();
    if (response.status === 429 && attempt < 11) {
      const retrySeconds = Math.max(
        1,
        Number(response.headers.get("retry-after") ?? 1),
      );
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(retrySeconds, 60) * 1000),
      );
      continue;
    }
    if (response.status !== expected)
      throw new Error(
        `${options.method ?? "GET"} ${path} returned ${response.status}: ${JSON.stringify(body)}`,
      );
    return body;
  }
  throw new Error(`${options.method ?? "GET"} ${path} exhausted retries`);
}

async function signIn(email: string): Promise<Auth> {
  const link = (await apiRequest("/auth/magic-links", 202, {
    method: "POST",
    body: { email },
  })) as { debugToken?: string };
  if (!link.debugToken)
    throw new Error(
      "Release initialization requires ALLOW_DEV_AUTH=true on a non-production API",
    );
  const response = await fetch(`${baseUrl}/auth/magic-links/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: link.debugToken }),
  });
  if (response.status !== 200)
    throw new Error(`Could not authenticate content publisher ${email}`);
  const setCookies = response.headers.getSetCookie();
  const csrfCookie = setCookies.find((value) =>
    value.startsWith("studentos_csrf="),
  );
  if (!csrfCookie) throw new Error(`No CSRF cookie returned for ${email}`);
  return {
    cookie: setCookies.map((value) => value.split(";", 1)[0]).join("; "),
    csrf: decodeURIComponent(csrfCookie.split(";", 1)[0]!.split("=", 2)[1]!),
  };
}

async function payload(name: string): Promise<unknown> {
  return JSON.parse(
    await readFile(
      new URL(`../../../content/production/${name}`, import.meta.url),
      "utf8",
    ),
  );
}

async function main(): Promise<void> {
  const [curricula, roles] = (await Promise.all([
    apiRequest("/catalog/academic-options", 200),
    apiRequest("/catalog/career-roles", 200),
  ])) as [unknown[], unknown[]];
  const editorEmail = process.env.DEV_CONTENT_EDITOR_EMAIL;
  const reviewerEmail = process.env.DEV_CONTENT_REVIEWER_EMAIL;
  if (!editorEmail || !reviewerEmail || editorEmail === reviewerEmail)
    throw new Error(
      "Set distinct DEV_CONTENT_EDITOR_EMAIL and DEV_CONTENT_REVIEWER_EMAIL values",
    );
  const [editor, reviewer] = await Promise.all([
    signIn(editorEmail),
    signIn(reviewerEmail),
  ]);

  const productionDirectory = new URL(
    "../../../content/production/",
    import.meta.url,
  );
  const curriculumFiles = (await readdir(productionDirectory)).filter(
    (name) =>
      /^jntuh-r25-.+-2026\.08\.[12]\.json$/.test(name) &&
      !name.includes("career-mappings") &&
      name !== "jntuh-r25-cse-2026.08.2.json",
  );
  const existingCurricula = curricula as Array<{
    branch: { code: string };
    datasetVersion: string;
  }>;
  let publishedCurricula = 0;
  for (const name of curriculumFiles) {
    const curriculumPayload = (await payload(name)) as {
      dataset: { branchCode: string; datasetVersion: string };
    };
    if (
      existingCurricula.some(
        (item) =>
          item.branch.code === curriculumPayload.dataset.branchCode &&
          item.datasetVersion === curriculumPayload.dataset.datasetVersion,
      )
    )
      continue;
    const curriculumImport = (await apiRequest(
      "/admin/curriculum/imports",
      201,
      {
        method: "POST",
        auth: editor,
        body: { payload: curriculumPayload },
      },
    )) as { importId: string };
    await apiRequest(
      `/admin/curriculum/imports/${curriculumImport.importId}/publish`,
      200,
      { method: "POST", auth: reviewer },
    );
    publishedCurricula += 1;
  }

  const hasCurrentCareer = (roles as Array<{ datasetVersion: string }>).some(
    (role) => role.datasetVersion === "2026.08.2",
  );
  if (!hasCurrentCareer) {
    const careerImport = (await apiRequest("/admin/career/imports", 201, {
      method: "POST",
      auth: editor,
      body: { payload: await payload("career-knowledge-2026.08.2.json") },
    })) as { importId: string };
    await apiRequest(
      `/admin/career/imports/${careerImport.importId}/publish`,
      201,
      { method: "POST", auth: reviewer },
    );

    const projectImport = (await apiRequest("/admin/projects/imports", 201, {
      method: "POST",
      auth: editor,
      body: { payload: await payload("project-templates-2026.08.2.json") },
    })) as { importId: string };
    await apiRequest(
      `/admin/projects/imports/${projectImport.importId}/publish`,
      201,
      { method: "POST", auth: reviewer },
    );
  }

  const mappingFiles = (await readdir(productionDirectory)).filter((name) =>
    name.endsWith("career-mappings-2026.08.2.json"),
  );
  let publishedMappings = 0;
  for (const mappingFile of mappingFiles) {
    const mappingPayload = (await payload(mappingFile)) as {
      mappingVersion: number;
      curriculumDatasetVersion: string;
      careerDatasetVersion: string;
      mappings: Array<{
        curriculumTopicKey: string;
        skillKey: string;
        breadth: number;
        depth: number;
        confidence: number;
        practiceRequired: boolean;
        evidencePotential: number;
        rationale: string;
      }>;
    };
    const references = (await apiRequest(
      "/admin/curriculum-skill-mappings/references",
      200,
      { auth: reviewer },
    )) as {
      topics: Array<{
        id: string;
        stableKey: string;
        program: { datasetVersion: string };
      }>;
      skills: Array<{
        id: string;
        stableKey: string;
        dataset: { datasetVersion: string };
      }>;
      mappings: Array<{
        curriculumTopicId: string;
        skillId: string;
        version: number;
      }>;
    };
    const topicIds = new Map(
      references.topics
        .filter(
          (item) =>
            item.program.datasetVersion ===
            mappingPayload.curriculumDatasetVersion,
        )
        .map((item) => [item.stableKey, item.id]),
    );
    const skillIds = new Map(
      references.skills
        .filter(
          (item) =>
            item.dataset.datasetVersion === mappingPayload.careerDatasetVersion,
        )
        .map((item) => [item.stableKey, item.id]),
    );
    const existingMappings = new Set(
      references.mappings.map(
        (item) => `${item.curriculumTopicId}|${item.skillId}|${item.version}`,
      ),
    );
    for (const mapping of mappingPayload.mappings) {
      const curriculumTopicId = topicIds.get(mapping.curriculumTopicKey);
      const skillId = skillIds.get(mapping.skillKey);
      if (!curriculumTopicId || !skillId)
        throw new Error(
          `Could not resolve production mapping ${mapping.curriculumTopicKey} -> ${mapping.skillKey}`,
        );
      if (
        existingMappings.has(
          `${curriculumTopicId}|${skillId}|${mappingPayload.mappingVersion}`,
        )
      )
        continue;
      await apiRequest("/admin/curriculum-skill-mappings", 201, {
        method: "POST",
        auth: reviewer,
        body: {
          breadth: mapping.breadth,
          depth: mapping.depth,
          confidence: mapping.confidence,
          practiceRequired: mapping.practiceRequired,
          evidencePotential: mapping.evidencePotential,
          rationale: mapping.rationale,
          curriculumTopicId,
          skillId,
          version: mappingPayload.mappingVersion,
        },
      });
      publishedMappings += 1;
    }
  }

  console.log(
    `Published ${publishedCurricula} missing curricula and ${publishedMappings} missing mappings. Current release: 17 JNTUH R25 branches, 33 roles, 80 skills, and 33 projects.`,
  );
  console.log(
    "No student profile, assessment, roadmap, or progress data was fabricated.",
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

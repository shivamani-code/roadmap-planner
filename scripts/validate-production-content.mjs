import fs from "node:fs/promises";
import path from "node:path";
import {
  productionPublicationIssues,
  validateCurriculumImport,
} from "../packages/academic/dist/index.js";
import {
  productionCareerIssues,
  validateCareerKnowledge,
  validateProjectTemplates,
} from "../packages/career/dist/index.js";

const directory = path.resolve("content/production");
const files = (await fs.readdir(directory))
  .filter((name) => name.endsWith(".json"))
  .sort();
const payloads = new Map();
let failed = false;

for (const name of files) {
  const payload = JSON.parse(
    await fs.readFile(path.join(directory, name), "utf8"),
  );
  payloads.set(name, payload);
  let report;
  if ("dataset" in payload && "semesters" in payload) {
    const validation = validateCurriculumImport(payload);
    const issues = validation.data
      ? productionPublicationIssues(validation.data)
      : [];
    report = {
      valid: validation.valid && issues.length === 0,
      type: "curriculum",
      statistics: validation.statistics,
      issues: [...validation.issues, ...issues],
    };
  } else if ("skills" in payload && "roles" in payload) {
    const validation = validateCareerKnowledge(payload);
    const issues = productionCareerIssues(validation);
    report = {
      valid: validation.valid && validation.publishable && issues.length === 0,
      type: "career",
      statistics: validation.statistics,
      issues: [...validation.issues, ...issues],
    };
  } else if ("projects" in payload) {
    const validation = validateProjectTemplates(payload);
    const issues = payload.synthetic
      ? ["Synthetic project datasets are not production content"]
      : [];
    report = {
      valid: validation.valid && issues.length === 0,
      type: "projects",
      statistics: validation.statistics,
      issues: [...validation.issues, ...issues],
    };
  } else if ("mappings" in payload) {
    const mappingKeys = payload.mappings.map(
      (item) => `${item.curriculumTopicKey}|${item.skillKey}`,
    );
    const issues = [
      ...(payload.schemaVersion === "1.0.0"
        ? []
        : ["Unsupported mapping schema version"]),
      ...(payload.review?.editorId &&
      payload.review?.reviewerId &&
      payload.review.editorId !== payload.review.reviewerId
        ? []
        : ["Mapping review separation is required"]),
      ...(new Set(mappingKeys).size === mappingKeys.length
        ? []
        : ["Duplicate curriculum-to-skill mapping"]),
      ...payload.mappings.flatMap((item, index) =>
        typeof item.rationale === "string" &&
        item.rationale.length >= 20 &&
        [
          item.breadth,
          item.depth,
          item.confidence,
          item.evidencePotential,
        ].every(
          (value) => typeof value === "number" && value >= 0 && value <= 1,
        )
          ? []
          : [`Invalid mapping at index ${index}`],
      ),
    ];
    report = {
      valid: issues.length === 0,
      type: "mappings",
      statistics: { mappings: payload.mappings.length },
      issues,
    };
  } else {
    report = {
      valid: false,
      type: "unknown",
      issues: ["Unrecognized production content type"],
    };
  }
  if (!report.valid) failed = true;
  console.log(JSON.stringify({ file: name, ...report }, null, 2));
}

const careers = [...payloads.values()].filter((payload) => "skills" in payload);
const curricula = [...payloads.values()].filter(
  (payload) => "semesters" in payload,
);
const projectDatasets = [...payloads.values()].filter(
  (payload) => "projects" in payload,
);
const mappingDatasets = [...payloads.values()].filter(
  (payload) => "mappings" in payload,
);
if (
  !careers.length ||
  !curricula.length ||
  !projectDatasets.length ||
  !mappingDatasets.length
) {
  failed = true;
  console.error(
    "Production content must include curriculum, career, project, and mapping datasets.",
  );
} else {
  const skillKeys = new Set(
    careers.flatMap((career) => career.skills.map(({ key }) => key)),
  );
  const roleKeys = new Set(
    careers.flatMap((career) => career.roles.map(({ key }) => key)),
  );
  const topicKeys = new Set(
    curricula.flatMap((curriculum) =>
      curriculum.semesters.flatMap(({ subjects }) =>
        subjects.flatMap(({ units }) =>
          units.flatMap(({ topics }) => topics.map(({ key }) => key)),
        ),
      ),
    ),
  );
  const referenceIssues = [
    ...projectDatasets
      .flatMap(({ projects }) => projects)
      .flatMap((project) => [
        ...project.roleKeys
          .filter((key) => !roleKeys.has(key))
          .map((key) => `Unknown project role: ${key}`),
        ...project.prerequisites
          .filter(({ skillKey }) => !skillKeys.has(skillKey))
          .map(({ skillKey }) => `Unknown project skill: ${skillKey}`),
        ...project.milestones.flatMap(({ skillOutcomes }) =>
          skillOutcomes
            .filter((key) => !skillKeys.has(key))
            .map((key) => `Unknown milestone skill: ${key}`),
        ),
      ]),
    ...mappingDatasets
      .flatMap(({ mappings }) => mappings)
      .flatMap((mapping) => [
        ...(!topicKeys.has(mapping.curriculumTopicKey)
          ? [`Unknown curriculum topic: ${mapping.curriculumTopicKey}`]
          : []),
        ...(!skillKeys.has(mapping.skillKey)
          ? [`Unknown mapped skill: ${mapping.skillKey}`]
          : []),
      ]),
  ];
  if (referenceIssues.length) {
    failed = true;
    console.error(
      JSON.stringify({ crossDatasetIssues: referenceIssues }, null, 2),
    );
  }
}

if (failed) process.exitCode = 1;

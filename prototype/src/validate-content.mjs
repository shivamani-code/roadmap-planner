import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readJson,
  validateCareer,
  validateCurriculum,
  validateMappings,
  validatePersonas,
  validateProjects,
} from "./content-validation.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const fixtures = path.join(root, "content", "fixtures");
const schemas = path.join(root, "content", "schemas");

const schemaFiles = [
  "curriculum-import.schema.json",
  "curriculum-skill-mapping.schema.json",
  "career-knowledge.schema.json",
  "project-template.schema.json",
  "persona-fixture.schema.json",
];
for (const file of schemaFiles) readJson(path.join(schemas, file));

const curriculum = validateCurriculum(
  readJson(path.join(fixtures, "curriculum.synthetic.valid.json")),
);
const career = validateCareer(
  readJson(path.join(fixtures, "career-knowledge.synthetic.valid.json")),
);
const mappings = validateMappings(
  readJson(
    path.join(fixtures, "curriculum-skill-mapping.synthetic.valid.json"),
  ),
  curriculum,
  career,
);
const projects = validateProjects(
  readJson(path.join(fixtures, "projects.synthetic.valid.json")),
  career,
);
const personas = validatePersonas(
  readJson(path.join(fixtures, "personas.synthetic.json")),
);

console.log(
  JSON.stringify(
    {
      schemas: schemaFiles.length,
      subjects: curriculum.subjects,
      topics: curriculum.topics,
      skills: career.skills,
      roles: career.roles,
      mappings: mappings.mappings,
      projects: projects.projects,
      personas: personas.personas,
    },
    null,
    2,
  ),
);

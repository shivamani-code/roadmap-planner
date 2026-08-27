import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  readJson,
  validateCareer,
  validateCurriculum,
  validateMappings,
  validatePersonas,
  validateProjects,
} from "../src/content-validation.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const fixturePath = (name) => path.join(root, "content", "fixtures", name);
const schemaPath = (name) => path.join(root, "content", "schemas", name);

test("all JSON Schemas parse and declare Draft 2020-12", () => {
  for (const name of [
    "curriculum-import.schema.json",
    "curriculum-skill-mapping.schema.json",
    "career-knowledge.schema.json",
    "project-template.schema.json",
    "persona-fixture.schema.json",
  ]) {
    const schema = readJson(schemaPath(name));
    assert.equal(
      schema.$schema,
      "https://json-schema.org/draft/2020-12/schema",
    );
    assert.match(schema.$id, /^https:\/\/studentos\.app\/schemas\//);
  }
});

test("valid synthetic content passes semantic cross-reference checks", () => {
  const curriculum = validateCurriculum(
    readJson(fixturePath("curriculum.synthetic.valid.json")),
  );
  const career = validateCareer(
    readJson(fixturePath("career-knowledge.synthetic.valid.json")),
  );
  assert.equal(curriculum.topics, 3);
  assert.equal(career.skills, 10);
  assert.equal(
    validateMappings(
      readJson(fixturePath("curriculum-skill-mapping.synthetic.valid.json")),
      curriculum,
      career,
    ).mappings,
    3,
  );
  assert.equal(
    validateProjects(
      readJson(fixturePath("projects.synthetic.valid.json")),
      career,
    ).projects,
    1,
  );
  assert.equal(
    validatePersonas(readJson(fixturePath("personas.synthetic.json"))).personas,
    10,
  );
});

test("career publication rejects a prerequisite cycle", () => {
  const career = structuredClone(
    readJson(fixturePath("career-knowledge.synthetic.valid.json")),
  );
  career.skills
    .find((skill) => skill.key === "programming.basics")
    .prerequisites.push({
      skillKey: "programming.oop",
      type: "HARD",
      threshold: 0.4,
    });
  assert.throws(() => validateCareer(career), /cycle/i);
});

test("project publication rejects milestone weights that do not sum to one", () => {
  const career = validateCareer(
    readJson(fixturePath("career-knowledge.synthetic.valid.json")),
  );
  const projects = structuredClone(
    readJson(fixturePath("projects.synthetic.valid.json")),
  );
  projects.projects[0].milestones[0].weight = 0.1;
  assert.throws(() => validateProjects(projects, career), /sum to 1/i);
});

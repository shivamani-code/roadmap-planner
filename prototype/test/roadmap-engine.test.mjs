import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readJson, validatePersonas } from "../src/content-validation.mjs";
import {
  analyzePersona,
  calculateContribution,
} from "../src/roadmap-engine.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = readJson(
  path.resolve(here, "../../content/fixtures/personas.synthetic.json"),
);
validatePersonas(fixture);

for (const persona of fixture.personas) {
  test(`${persona.id}: matches the expected architecture assertions`, () => {
    const result = analyzePersona(persona);
    assert.equal(result.status, persona.expected.status);
    assert.equal(result.maxWeeklyMinutes, persona.expected.maxWeeklyMinutes);

    for (const [skillKey, classification] of Object.entries(
      persona.expected.classifications,
    )) {
      assert.equal(
        result.classifications[skillKey],
        classification,
        `${skillKey} classification`,
      );
    }

    let priorIndex = -1;
    for (const skillKey of persona.expected.prerequisiteOrder) {
      const index = result.order.indexOf(skillKey);
      assert.ok(
        index > priorIndex,
        `${skillKey} should appear after the prior prerequisite`,
      );
      priorIndex = index;
    }

    for (const week of result.schedule) {
      assert.ok(
        week.minutes <= result.maxWeeklyMinutes,
        `week ${week.week} exceeds capacity`,
      );
    }

    if (result.contribution) {
      const sum =
        result.contribution.current +
        result.contribution.college +
        result.contribution.independent;
      assert.equal(Number(sum.toFixed(1)), 100);
    }

    assert.deepEqual(
      analyzePersona(persona),
      result,
      "same input should be deterministic",
    );
  });
}

test("P04 excludes the optional framework instead of overbooking", () => {
  const persona = fixture.personas.find((item) => item.id === "P04");
  assert.deepEqual(analyzePersona(persona).excludedOptional, [
    "backend.framework",
  ]);
});

test("P09 quantifies infeasibility and emits no fake schedule", () => {
  const persona = fixture.personas.find((item) => item.id === "P09");
  const result = analyzePersona(persona);
  assert.ok(result.deficitMinutes > 0);
  assert.deepEqual(result.schedule, []);
});

test("P10 does not fall back to an invented curriculum plan", () => {
  const persona = fixture.personas.find((item) => item.id === "P10");
  const result = analyzePersona(persona);
  assert.equal(result.status, "UNSUPPORTED");
  assert.deepEqual(result.classifications, {});
  assert.deepEqual(result.order, []);
});

test("a low-confidence curriculum mapping cannot remove an independent gap", () => {
  const contribution = calculateContribution(
    {
      requiredDepth: 0.8,
      academicDepth: 0.8,
      mappingConfidence: 0.64,
      academicTiming: "CURRENT",
    },
    { proficiency: 0, confidence: 0.45 },
  );
  assert.equal(contribution.college, 0);
  assert.equal(contribution.independent, 1);
});

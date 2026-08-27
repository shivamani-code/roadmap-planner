import fs from "node:fs";

export function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values, label) {
  assert(new Set(values).size === values.length, `Duplicate ${label}`);
}

function assertRatio(value, label) {
  assert(
    typeof value === "number" && value >= 0 && value <= 1,
    `${label} must be in [0,1]`,
  );
}

function assertAcyclic(keys, edges, label) {
  const keySet = new Set(keys);
  const adjacency = new Map(keys.map((key) => [key, []]));
  for (const [from, to] of edges) {
    assert(keySet.has(from), `${label} edge references missing source ${from}`);
    assert(keySet.has(to), `${label} edge references missing target ${to}`);
    adjacency.get(from).push(to);
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(key) {
    if (visiting.has(key)) throw new Error(`${label} cycle at ${key}`);
    if (visited.has(key)) return;
    visiting.add(key);
    for (const next of adjacency.get(key)) visit(next);
    visiting.delete(key);
    visited.add(key);
  }
  for (const key of keys) visit(key);
}

export function validateCurriculum(data) {
  assert(
    data.schemaVersion === "1.0.0",
    "Unexpected curriculum schema version",
  );
  assert(
    data.dataset && Array.isArray(data.semesters) && data.semesters.length > 0,
    "Curriculum shape invalid",
  );
  assert(
    typeof data.dataset.synthetic === "boolean",
    "Curriculum synthetic marker required",
  );
  assert(
    /^[a-fA-F0-9]{64}$/.test(data.dataset.source.sha256),
    "Curriculum source checksum invalid",
  );
  unique(
    data.semesters.map((semester) => semester.number),
    "semester number",
  );

  const subjectCodes = [];
  const topics = [];
  const edges = [];
  for (const semester of data.semesters) {
    assert(
      semester.number >= 1 && semester.number <= 12,
      "Semester number out of range",
    );
    for (const subject of semester.subjects) {
      subjectCodes.push(subject.code);
      assert(subject.credits >= 0, `Negative credits for ${subject.code}`);
      for (const unit of subject.units) {
        for (const topic of unit.topics) {
          topics.push(topic.key);
          assertRatio(topic.academicDepth, `${topic.key}.academicDepth`);
          assert(
            topic.estimatedAcademicHours > 0,
            `${topic.key} must have positive effort`,
          );
          for (const prerequisite of topic.prerequisiteTopicKeys ?? [])
            edges.push([prerequisite, topic.key]);
        }
      }
    }
  }
  unique(subjectCodes, "subject code");
  unique(topics, "curriculum topic key");
  assertAcyclic(topics, edges, "Curriculum prerequisite");
  return {
    subjects: subjectCodes.length,
    topics: topics.length,
    topicKeys: new Set(topics),
  };
}

export function validateCareer(data) {
  assert(data.schemaVersion === "1.0.0", "Unexpected career schema version");
  assert(
    data.review.editorId !== data.review.reviewerId,
    "Career editor and reviewer must differ",
  );
  const skillKeys = data.skills.map((skill) => skill.key);
  unique(skillKeys, "skill key");
  const skillEdges = [];
  for (const skill of data.skills) {
    for (const prerequisite of skill.prerequisites) {
      assertRatio(
        prerequisite.threshold,
        `${skill.key} prerequisite threshold`,
      );
      skillEdges.push([prerequisite.skillKey, skill.key]);
    }
  }
  assertAcyclic(skillKeys, skillEdges, "Skill prerequisite");

  const roles = [];
  for (const role of data.roles) {
    roles.push(role.key);
    unique(
      role.targetLevels.map((level) => level.level),
      `${role.key} target level`,
    );
    for (const level of role.targetLevels) {
      unique(
        level.requirements.map((requirement) => requirement.skillKey),
        `${role.key}/${level.level} requirement`,
      );
      for (const requirement of level.requirements) {
        assert(
          skillKeys.includes(requirement.skillKey),
          `Requirement references missing skill ${requirement.skillKey}`,
        );
        assertRatio(
          requirement.requiredDepth,
          `${requirement.skillKey}.requiredDepth`,
        );
        assertRatio(
          requirement.importance,
          `${requirement.skillKey}.importance`,
        );
        assertRatio(
          requirement.placementRelevance,
          `${requirement.skillKey}.placementRelevance`,
        );
        assert(
          requirement.hours.p25 <= requirement.hours.p50 &&
            requirement.hours.p50 <= requirement.hours.p75,
          `Effort percentiles unordered for ${requirement.skillKey}`,
        );
      }
    }
  }
  unique(roles, "role key");
  unique(
    data.learningUnits.map((unit) => unit.key),
    "learning unit key",
  );
  for (const unit of data.learningUnits) {
    assert(unit.fromDepth <= unit.toDepth, `${unit.key} depth range invalid`);
    for (const skillKey of unit.skillKeys)
      assert(
        skillKeys.includes(skillKey),
        `${unit.key} references missing skill ${skillKey}`,
      );
  }
  return {
    skills: skillKeys.length,
    roles: roles.length,
    skillKeys: new Set(skillKeys),
    roleKeys: new Set(roles),
  };
}

export function validateMappings(data, curriculumSummary, careerSummary) {
  assert(data.schemaVersion === "1.0.0", "Unexpected mapping schema version");
  assert(
    data.review.editorId !== data.review.reviewerId,
    "Mapping editor and reviewer must differ",
  );
  const pairs = [];
  for (const mapping of data.mappings) {
    assert(
      curriculumSummary.topicKeys.has(mapping.curriculumTopicKey),
      `Mapping topic missing: ${mapping.curriculumTopicKey}`,
    );
    assert(
      careerSummary.skillKeys.has(mapping.skillKey),
      `Mapping skill missing: ${mapping.skillKey}`,
    );
    for (const field of ["breadth", "depth", "confidence", "evidencePotential"])
      assertRatio(mapping[field], `${mapping.skillKey}.${field}`);
    assert(
      mapping.rationale.length >= 20,
      `Mapping rationale too short: ${mapping.skillKey}`,
    );
    pairs.push(`${mapping.curriculumTopicKey}|${mapping.skillKey}`);
  }
  unique(pairs, "curriculum-skill pair");
  return { mappings: pairs.length };
}

export function validateProjects(data, careerSummary) {
  assert(data.schemaVersion === "1.0.0", "Unexpected project schema version");
  unique(
    data.projects.map((project) => `${project.key}@${project.version}`),
    "project version",
  );
  for (const project of data.projects) {
    for (const roleKey of project.roleKeys)
      assert(
        careerSummary.roleKeys.has(roleKey),
        `${project.key} references missing role ${roleKey}`,
      );
    for (const prerequisite of project.prerequisites) {
      assert(
        careerSummary.skillKeys.has(prerequisite.skillKey),
        `${project.key} references missing skill ${prerequisite.skillKey}`,
      );
      assertRatio(
        prerequisite.threshold,
        `${project.key} prerequisite threshold`,
      );
    }
    assert(
      project.estimatedHours.p25 <= project.estimatedHours.p50 &&
        project.estimatedHours.p50 <= project.estimatedHours.p75,
      `${project.key} effort percentiles unordered`,
    );
    unique(
      project.milestones.map((milestone) => milestone.key),
      `${project.key} milestone key`,
    );
    unique(
      project.milestones.map((milestone) => milestone.sequence),
      `${project.key} milestone sequence`,
    );
    const weight = project.milestones.reduce(
      (sum, milestone) => sum + milestone.weight,
      0,
    );
    assert(
      Math.abs(weight - 1) < 1e-9,
      `${project.key} milestone weights must sum to 1, got ${weight}`,
    );
    for (const milestone of project.milestones) {
      for (const skillKey of milestone.skillOutcomes)
        assert(
          careerSummary.skillKeys.has(skillKey),
          `${milestone.key} references missing skill ${skillKey}`,
        );
    }
  }
  return { projects: data.projects.length };
}

export function validatePersonas(data) {
  assert(data.schemaVersion === "1.0.0", "Unexpected persona schema version");
  assert(
    data.rulesetVersion === "prototype-1.0.0",
    "Unexpected ruleset version",
  );
  assert(data.personas.length >= 8, "At least eight personas required");
  unique(
    data.personas.map((persona) => persona.id),
    "persona ID",
  );
  for (const persona of data.personas) {
    assert(/^P\d{2}$/.test(persona.id), `Invalid persona ID ${persona.id}`);
    assert(
      persona.deadlineWeeks > 0 && persona.normalWeeklyMinutes >= 0,
      `${persona.id} capacity shape invalid`,
    );
    const keys = persona.requirements.map(
      (requirement) => requirement.skillKey,
    );
    unique(keys, `${persona.id} requirement key`);
    const edges = [];
    for (const requirement of persona.requirements) {
      for (const ratio of [
        "requiredDepth",
        "importance",
        "placementRelevance",
        "academicDepth",
        "mappingConfidence",
      ])
        assertRatio(
          requirement[ratio],
          `${persona.id}/${requirement.skillKey}/${ratio}`,
        );
      assert(
        requirement.estimatedMinutes >= 0,
        `${persona.id}/${requirement.skillKey} effort invalid`,
      );
      for (const prerequisite of requirement.prerequisites)
        edges.push([prerequisite, requirement.skillKey]);
    }
    assertAcyclic(keys, edges, `${persona.id} prerequisite`);
  }
  return { personas: data.personas.length };
}

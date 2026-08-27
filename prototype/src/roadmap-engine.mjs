const MODE_CAREER_SHARE = Object.freeze({
  NORMAL: 1,
  INTERNAL_EXAM: 0.35,
  SEMESTER_EXAM: 0.2,
  VACATION: 1,
  PLACEMENT: 0.8,
});

const USEFUL_ACADEMIC_TIMINGS = new Set([
  "COMPLETED",
  "CURRENT",
  "FUTURE_BEFORE_REQUIRED",
]);

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function effectiveProficiency(studentSkill) {
  if (!studentSkill || studentSkill.proficiency === null) return 0;
  const confidence = clamp(studentSkill.confidence ?? 0);
  return clamp(studentSkill.proficiency) * (0.7 + 0.3 * confidence);
}

export function allocatableWeeklyMinutes(rawMinutes, mode) {
  const careerShare = MODE_CAREER_SHARE[mode];
  if (careerShare === undefined)
    throw new Error(`Unknown planning mode: ${mode}`);
  return Math.floor(rawMinutes * 0.85 * careerShare);
}

function hasUsableAcademicContribution(requirement) {
  return (
    USEFUL_ACADEMIC_TIMINGS.has(requirement.academicTiming) &&
    requirement.mappingConfidence >= 0.65 &&
    requirement.academicDepth > 0
  );
}

export function classifyRequirement(requirement, studentSkill) {
  const unknown = !studentSkill || studentSkill.proficiency === null;
  const effective = effectiveProficiency(studentSkill);

  if (!requirement.required && requirement.importance === 0)
    return "NOT_REQUIRED";
  if (effective >= requirement.requiredDepth) return "MASTERED";
  if (unknown) return "UNKNOWN";

  const academicUsable = hasUsableAcademicContribution(requirement);
  const academicAddsDepth =
    academicUsable && requirement.academicDepth > effective;

  if (
    academicAddsDepth &&
    requirement.academicDepth >= requirement.requiredDepth
  ) {
    if (requirement.academicTiming === "CURRENT") return "COLLEGE_CURRENT";
    if (requirement.academicTiming === "FUTURE_BEFORE_REQUIRED")
      return "COLLEGE_FUTURE";
    return "PARTIAL";
  }

  if (
    academicAddsDepth &&
    requirement.academicDepth < requirement.requiredDepth
  ) {
    return "COLLEGE_EXTENSION";
  }

  return effective > 0 ? "PARTIAL" : "INDEPENDENT";
}

export function calculateContribution(requirement, studentSkill) {
  const effective = effectiveProficiency(studentSkill);
  const requiredDepth = Math.max(requirement.requiredDepth, Number.EPSILON);
  const current = clamp(effective / requiredDepth);
  let college = 0;

  if (hasUsableAcademicContribution(requirement)) {
    const potential = clamp(
      (Math.max(requirement.academicDepth - effective, 0) / requiredDepth) *
        requirement.mappingConfidence,
    );
    college = Math.min(potential, 1 - current);
  }

  const independent = clamp(1 - current - college);
  return { current, college, independent, effective };
}

function downstreamCounts(requirements) {
  const dependents = new Map(
    requirements.map((requirement) => [requirement.skillKey, []]),
  );
  for (const requirement of requirements) {
    for (const prerequisite of requirement.prerequisites) {
      if (!dependents.has(prerequisite)) {
        throw new Error(
          `${requirement.skillKey} references missing prerequisite ${prerequisite}`,
        );
      }
      dependents.get(prerequisite).push(requirement.skillKey);
    }
  }

  const memo = new Map();
  const visiting = new Set();
  function descendants(key) {
    if (memo.has(key)) return memo.get(key);
    if (visiting.has(key))
      throw new Error(`Prerequisite cycle detected at ${key}`);
    visiting.add(key);
    const result = new Set();
    for (const dependent of dependents.get(key) ?? []) {
      result.add(dependent);
      for (const nested of descendants(dependent)) result.add(nested);
    }
    visiting.delete(key);
    memo.set(key, result);
    return result;
  }

  return new Map(
    [...dependents.keys()].map((key) => [key, descendants(key).size]),
  );
}

function academicSync(requirement) {
  return {
    CURRENT: 0.9,
    FUTURE_BEFORE_REQUIRED: 0.6,
    COMPLETED: 0.2,
    AFTER_REQUIRED: 0,
    NONE: 0,
  }[requirement.academicTiming];
}

export function scoreRequirements(persona, analyzedRequirements) {
  const counts = downstreamCounts(persona.requirements);
  const denominator = Math.max(persona.requirements.length - 1, 1);
  const maxTime = Math.max(
    ...persona.requirements.map((item) => item.estimatedMinutes),
    1,
  );
  const deadlineUrgency = clamp(12 / persona.deadlineWeeks);

  return analyzedRequirements.map((item) => {
    const gap = item.contribution.independent;
    const prerequisiteCentrality = counts.get(item.skillKey) / denominator;
    const timeCost = item.estimatedMinutes / maxTime;
    const base =
      100 *
      (0.24 * item.importance +
        0.14 * item.placementRelevance +
        0.13 * prerequisiteCentrality +
        0.15 * deadlineUrgency +
        0.17 * gap +
        0.1 * academicSync(item) +
        0.07 * gap);
    return {
      ...item,
      priority: Number(clamp(base - 12 * timeCost, 0, 100).toFixed(4)),
    };
  });
}

export function topologicalPriorityOrder(requirements) {
  const byKey = new Map(requirements.map((item) => [item.skillKey, item]));
  if (byKey.size !== requirements.length)
    throw new Error("Duplicate requirement skill key");

  const indegree = new Map(requirements.map((item) => [item.skillKey, 0]));
  const dependents = new Map(requirements.map((item) => [item.skillKey, []]));
  for (const item of requirements) {
    for (const prerequisite of item.prerequisites) {
      if (!byKey.has(prerequisite))
        throw new Error(
          `${item.skillKey} references missing prerequisite ${prerequisite}`,
        );
      indegree.set(item.skillKey, indegree.get(item.skillKey) + 1);
      dependents.get(prerequisite).push(item.skillKey);
    }
  }

  const ready = requirements.filter(
    (item) => indegree.get(item.skillKey) === 0,
  );
  const result = [];
  const stableSort = () =>
    ready.sort(
      (left, right) =>
        right.priority - left.priority ||
        left.skillKey.localeCompare(right.skillKey),
    );

  stableSort();
  while (ready.length > 0) {
    const item = ready.shift();
    result.push(item);
    for (const dependentKey of [...dependents.get(item.skillKey)].sort()) {
      indegree.set(dependentKey, indegree.get(dependentKey) - 1);
      if (indegree.get(dependentKey) === 0) ready.push(byKey.get(dependentKey));
    }
    stableSort();
  }

  if (result.length !== requirements.length)
    throw new Error("Prerequisite cycle detected");
  return result;
}

function roundedContributionSummary(analyzed) {
  const weightTotal =
    analyzed.reduce((sum, item) => sum + item.importance, 0) || 1;
  const currentRaw =
    analyzed.reduce(
      (sum, item) => sum + item.importance * item.contribution.current,
      0,
    ) / weightTotal;
  const collegeRaw =
    analyzed.reduce(
      (sum, item) => sum + item.importance * item.contribution.college,
      0,
    ) / weightTotal;
  const current = Number((currentRaw * 100).toFixed(1));
  const college = Number((collegeRaw * 100).toFixed(1));
  const independent = Number((100 - current - college).toFixed(1));
  return { current, college, independent };
}

function remainingMinutes(item) {
  if (
    item.classification === "MASTERED" ||
    item.classification === "NOT_REQUIRED"
  )
    return 0;
  const computed = Math.ceil(
    item.estimatedMinutes * item.contribution.independent,
  );
  const diagnosticFloor = item.classification === "UNKNOWN" ? 45 : 30;
  return Math.max(computed, diagnosticFloor);
}

function scheduleSequentially(items, weeklyLimit, deadlineWeeks) {
  if (weeklyLimit <= 0) return [];
  const weeks = [];
  let week = 1;
  let used = 0;

  for (const item of items) {
    let remaining = item.remainingMinutes;
    while (remaining > 0) {
      if (week > deadlineWeeks)
        throw new Error("Attempted to schedule past deadline");
      const available = weeklyLimit - used;
      if (available === 0) {
        week += 1;
        used = 0;
        continue;
      }
      const minutes = Math.min(remaining, available);
      let bucket = weeks.find((entry) => entry.week === week);
      if (!bucket) {
        bucket = { week, minutes: 0, items: [] };
        weeks.push(bucket);
      }
      bucket.items.push({ skillKey: item.skillKey, minutes });
      bucket.minutes += minutes;
      used += minutes;
      remaining -= minutes;
      if (used === weeklyLimit && remaining > 0) {
        week += 1;
        used = 0;
      }
    }
  }
  return weeks;
}

export function analyzePersona(persona) {
  const maxWeeklyMinutes = allocatableWeeklyMinutes(
    persona.normalWeeklyMinutes,
    persona.mode,
  );
  if (!persona.supportedCurriculum) {
    return {
      personaId: persona.id,
      status: "UNSUPPORTED",
      maxWeeklyMinutes,
      contribution: null,
      requiredRemainingMinutes: 0,
      totalCapacityMinutes: maxWeeklyMinutes * persona.deadlineWeeks,
      deficitMinutes: 0,
      classifications: {},
      order: [],
      excludedOptional: [],
      schedule: [],
      rulesetVersion: "prototype-1.0.0",
    };
  }

  const initial = persona.requirements.map((requirement) => {
    const studentSkill = persona.skills[requirement.skillKey];
    const contribution = calculateContribution(requirement, studentSkill);
    const classification = classifyRequirement(requirement, studentSkill);
    return { ...requirement, contribution, classification };
  });
  const scored = scoreRequirements(persona, initial).map((item) => ({
    ...item,
    remainingMinutes: remainingMinutes(item),
  }));
  const ordered = topologicalPriorityOrder(scored);
  const requiredItems = ordered.filter(
    (item) => item.required && item.remainingMinutes > 0,
  );
  const optionalItems = ordered.filter(
    (item) => !item.required && item.remainingMinutes > 0,
  );
  const requiredRemainingMinutes = requiredItems.reduce(
    (sum, item) => sum + item.remainingMinutes,
    0,
  );
  const totalCapacityMinutes = maxWeeklyMinutes * persona.deadlineWeeks;
  const status =
    requiredRemainingMinutes > totalCapacityMinutes ? "INFEASIBLE" : "READY";

  const includedOptional = [];
  const excludedOptional = [];
  let used = requiredRemainingMinutes;
  if (status === "READY") {
    for (const item of optionalItems) {
      if (used + item.remainingMinutes <= totalCapacityMinutes) {
        includedOptional.push(item);
        used += item.remainingMinutes;
      } else {
        excludedOptional.push(item.skillKey);
      }
    }
  } else {
    excludedOptional.push(...optionalItems.map((item) => item.skillKey));
  }

  const scheduledItems =
    status === "READY"
      ? ordered.filter(
          (item) =>
            requiredItems.includes(item) || includedOptional.includes(item),
        )
      : [];
  const schedule = scheduleSequentially(
    scheduledItems,
    maxWeeklyMinutes,
    persona.deadlineWeeks,
  );
  return {
    personaId: persona.id,
    status,
    maxWeeklyMinutes,
    contribution: roundedContributionSummary(scored),
    requiredRemainingMinutes,
    totalCapacityMinutes,
    deficitMinutes: Math.max(
      requiredRemainingMinutes - totalCapacityMinutes,
      0,
    ),
    classifications: Object.fromEntries(
      scored.map((item) => [item.skillKey, item.classification]),
    ),
    order: ordered.map((item) => item.skillKey),
    priorities: Object.fromEntries(
      scored.map((item) => [item.skillKey, item.priority]),
    ),
    excludedOptional,
    schedule,
    rulesetVersion: "prototype-1.0.0",
  };
}

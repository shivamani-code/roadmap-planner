export interface EvidenceInput {
  proficiency: number;
  confidence: number;
  occurredAt: Date;
  decayDays: number | null;
}

export interface SkillEstimate {
  proficiency: number | null;
  confidence: number;
  effectiveProficiency: number | null;
}

export function effectiveProficiency(
  proficiency: number | null,
  confidence: number,
): number | null {
  if (proficiency === null) return null;
  return clamp01(proficiency) * (0.7 + 0.3 * clamp01(confidence));
}

export function aggregateEvidence(
  evidence: readonly EvidenceInput[],
  now = new Date(),
): SkillEstimate {
  if (evidence.length === 0)
    return { proficiency: null, confidence: 0, effectiveProficiency: null };
  const weighted = evidence.map((item) => {
    const ageDays = Math.max(
      0,
      (now.getTime() - item.occurredAt.getTime()) / 86_400_000,
    );
    const recency =
      item.decayDays === null ? 1 : 0.5 ** (ageDays / item.decayDays);
    return { ...item, weight: clamp01(item.confidence) * recency };
  });
  const denominator = weighted.reduce((sum, item) => sum + item.weight, 0);
  const proficiency =
    denominator === 0
      ? 0
      : weighted.reduce(
          (sum, item) => sum + clamp01(item.proficiency) * item.weight,
          0,
        ) / denominator;
  const confidence =
    1 -
    weighted.reduce(
      (product, item) => product * (1 - clamp01(item.confidence) * item.weight),
      1,
    );
  return {
    proficiency,
    confidence: clamp01(confidence),
    effectiveProficiency: effectiveProficiency(proficiency, confidence),
  };
}

export type GapClassification =
  | "MASTERED"
  | "COLLEGE_COVERED"
  | "EXTENSION"
  | "INDEPENDENT"
  | "CAREER_ONLY"
  | "DEFERRED"
  | "UNKNOWN";

export interface GapRequirementInput {
  id: string;
  skillId: string;
  requiredDepth: number;
  importance: number;
  required: boolean;
  hours: { p25: number; p50: number; p75: number };
  estimate: SkillEstimate;
  curriculum?: {
    depth: number;
    confidence: number;
    availableBeforeRequiredBy: boolean;
    current: boolean;
    trace: string;
  };
}

export interface GapItemResult {
  requirementId: string;
  skillId: string;
  classification: GapClassification;
  currentRatio: number;
  collegeRatio: number;
  externalRatio: number;
  remainingHours: { p25: number; p50: number; p75: number };
  warnings: string[];
}

export interface GapAnalysisResult {
  items: GapItemResult[];
  contribution: { current: number; college: number; independent: number };
  effort: { p25: number; p50: number; p75: number };
  feasibility: {
    status: "READY" | "INSUFFICIENT_CAPACITY";
    allocatableMinutes: number;
    requiredMinutes: number;
    deficitMinutes: number;
    optionalExcluded: string[];
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampRange(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function classifyRequirement(input: GapRequirementInput): GapItemResult {
  const current = input.estimate.effectiveProficiency;
  const currentRatio =
    current === null ? 0 : clamp01(current / input.requiredDepth);
  const mapping = input.curriculum;
  const reliable = Boolean(
    mapping && mapping.confidence >= 0.65 && mapping.availableBeforeRequiredBy,
  );
  const collegeRatio = reliable
    ? Math.min(
        clamp01(
          (Math.max((mapping?.depth ?? 0) - (current ?? 0), 0) /
            input.requiredDepth) *
            (mapping?.confidence ?? 0),
        ),
        1 - currentRatio,
      )
    : 0;
  const externalRatio = Math.max(0, 1 - currentRatio - collegeRatio);
  let classification: GapClassification;
  if (!input.required && externalRatio > 0.8 && input.importance < 0.35)
    classification = "DEFERRED";
  else if (current !== null && current >= input.requiredDepth)
    classification = "MASTERED";
  else if (current === null && !reliable) classification = "UNKNOWN";
  else if (reliable && (mapping?.depth ?? 0) >= input.requiredDepth)
    classification = "COLLEGE_COVERED";
  else if (reliable && (mapping?.depth ?? 0) > (current ?? 0))
    classification = "EXTENSION";
  else if (mapping && !mapping.availableBeforeRequiredBy)
    classification = "INDEPENDENT";
  else classification = "CAREER_ONLY";
  const warnings = [
    ...(current === null ? ["UNKNOWN_CURRENT_SKILL"] : []),
    ...(mapping && mapping.confidence < 0.65
      ? ["LOW_CONFIDENCE_MAPPING_IGNORED"]
      : []),
    ...(mapping && !mapping.availableBeforeRequiredBy
      ? ["CURRICULUM_ARRIVES_TOO_LATE"]
      : []),
  ];
  const effortRatio = classification === "DEFERRED" ? 0 : externalRatio;
  return {
    requirementId: input.id,
    skillId: input.skillId,
    classification,
    currentRatio,
    collegeRatio,
    externalRatio,
    remainingHours: {
      p25: round(input.hours.p25 * effortRatio, 2),
      p50: round(input.hours.p50 * effortRatio, 2),
      p75: round(input.hours.p75 * effortRatio, 2),
    },
    warnings,
  };
}

export function analyzeGap(
  requirements: readonly GapRequirementInput[],
  capacity: { weeklyMinutes: number; weeksUntilDeadline: number },
): GapAnalysisResult {
  if (requirements.length === 0)
    throw new Error("At least one role requirement is required");
  const items = requirements.map(classifyRequirement);
  const weightTotal = requirements.reduce(
    (sum, item) => sum + Math.max(item.importance, 0.001),
    0,
  );
  const weightedCurrent =
    items.reduce(
      (sum, item, index) =>
        sum + item.currentRatio * requirements[index]!.importance,
      0,
    ) / weightTotal;
  const weightedCollege =
    items.reduce(
      (sum, item, index) =>
        sum + item.collegeRatio * requirements[index]!.importance,
      0,
    ) / weightTotal;
  const current = round(weightedCurrent * 100);
  const college = round(weightedCollege * 100);
  const independent = round(100 - current - college);
  const requiredItems = items.filter(
    (item, index) =>
      requirements[index]!.required && item.classification !== "DEFERRED",
  );
  const effort = requiredItems.reduce(
    (total, item) => ({
      p25: total.p25 + item.remainingHours.p25,
      p50: total.p50 + item.remainingHours.p50,
      p75: total.p75 + item.remainingHours.p75,
    }),
    { p25: 0, p50: 0, p75: 0 },
  );
  const allocatableMinutes = Math.max(
    0,
    Math.floor(capacity.weeklyMinutes * 0.85 * capacity.weeksUntilDeadline),
  );
  const requiredMinutes = Math.ceil(effort.p50 * 60);
  return {
    items,
    contribution: { current, college, independent },
    effort: {
      p25: round(effort.p25, 2),
      p50: round(effort.p50, 2),
      p75: round(effort.p75, 2),
    },
    feasibility: {
      status:
        requiredMinutes <= allocatableMinutes
          ? "READY"
          : "INSUFFICIENT_CAPACITY",
      allocatableMinutes,
      requiredMinutes,
      deficitMinutes: Math.max(0, requiredMinutes - allocatableMinutes),
      optionalExcluded: items
        .filter(({ classification }) => classification === "DEFERRED")
        .map(({ skillId }) => skillId),
    },
  };
}

export type RoadmapTrack = "ACADEMIC" | "CAREER" | "PROJECT" | "PLACEMENT";

export interface RoadmapLearningUnitInput {
  id: string;
  stableKey: string;
  title: string;
  type: "TEACH" | "PRACTICE" | "ASSESS" | "REVISE";
  estimatedMinutes: number;
  fromDepth: number;
  toDepth: number;
  reasonCodes: string[];
}

export interface RoadmapSkillInput {
  skillId: string;
  stableKey: string;
  name: string;
  required: boolean;
  importance: number;
  placementRelevance: number;
  requiredDepth: number;
  effectiveProficiency: number | null;
  evidenceConfidence: number;
  remainingMinutes: number;
  requiredBy: string;
  deadlineUrgency: number;
  academicSync: number;
  studentWeakness: number;
  academicTermSequence?: number;
  roleRequirementId?: string;
  prerequisites: Array<{ skillId: string; type: "HARD" | "SOFT" }>;
  learningUnits: RoadmapLearningUnitInput[];
}

export interface RoadmapTermInput {
  id: string;
  label: string;
  sequence: number;
  semesterNumber: number | null;
  startDate: string;
  endDate: string;
  capacityMinutes: number;
}

export interface RoadmapMilestoneResult {
  id: string;
  skillId: string;
  skillKey: string;
  title: string;
  track: RoadmapTrack;
  learningUnitId: string;
  sourceRequirementId: string | null;
  estimatedMinutes: number;
  priority: number;
  requiredBy: string;
  termId: string;
  termSequence: number;
  prerequisiteSkillIds: string[];
  reasonCodes: string[];
}

export interface RoadmapResult {
  status: "READY" | "INSUFFICIENT_CAPACITY" | "INVALID_CONTENT";
  rulesetVersion: string;
  orderedSkillIds: string[];
  milestones: RoadmapMilestoneResult[];
  terms: Array<
    RoadmapTermInput & { plannedMinutes: number; milestoneIds: string[] }
  >;
  exclusions: Array<{ skillId: string; reason: string }>;
  risks: Array<{
    skillId: string | null;
    code: string;
    requiredMinutes: number;
    availableMinutes: number;
  }>;
  violations: string[];
  summary: {
    requiredMinutes: number;
    plannedMinutes: number;
    capacityMinutes: number;
    bufferPercent: number;
  };
}

function descendants(
  skillId: string,
  dependents: ReadonlyMap<string, readonly string[]>,
): Set<string> {
  const found = new Set<string>();
  const pending = [...(dependents.get(skillId) ?? [])];
  while (pending.length > 0) {
    const next = pending.pop()!;
    if (found.has(next)) continue;
    found.add(next);
    pending.push(...(dependents.get(next) ?? []));
  }
  return found;
}

export function requiredSubgraph(
  skills: readonly RoadmapSkillInput[],
): RoadmapSkillInput[] {
  const byId = new Map(skills.map((skill) => [skill.skillId, skill]));
  const included = new Set(
    skills.filter(({ required }) => required).map(({ skillId }) => skillId),
  );
  const pending = [...included];
  while (pending.length > 0) {
    const skill = byId.get(pending.pop()!);
    if (!skill) throw new Error("Required roadmap skill is missing");
    for (const prerequisite of skill.prerequisites.filter(
      ({ type }) => type === "HARD",
    )) {
      if (!byId.has(prerequisite.skillId))
        throw new Error(`Missing hard prerequisite ${prerequisite.skillId}`);
      if (!included.has(prerequisite.skillId)) {
        included.add(prerequisite.skillId);
        pending.push(prerequisite.skillId);
      }
    }
  }
  return skills.filter(({ skillId }) => included.has(skillId));
}

export function scoreRoadmapPriority(input: {
  roleImportance: number;
  placementRelevance: number;
  prerequisiteCentrality: number;
  deadlineUrgency: number;
  skillGap: number;
  academicSync: number;
  studentWeakness: number;
  normalizedTimeCost: number;
}): number {
  const base =
    100 *
    (0.24 * clamp01(input.roleImportance) +
      0.14 * clamp01(input.placementRelevance) +
      0.13 * clamp01(input.prerequisiteCentrality) +
      0.15 * clamp01(input.deadlineUrgency) +
      0.17 * clamp01(input.skillGap) +
      0.1 * clamp01(input.academicSync) +
      0.07 * clamp01(input.studentWeakness));
  return round(
    Math.min(100, Math.max(0, base - 12 * clamp01(input.normalizedTimeCost))),
    3,
  );
}

function percentile90(values: readonly number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((left, right) => left - right);
  return Math.max(1, sorted[Math.ceil(sorted.length * 0.9) - 1] ?? 1);
}

function chooseLearningUnit(
  skill: RoadmapSkillInput,
): RoadmapLearningUnitInput | undefined {
  const current = skill.effectiveProficiency ?? 0;
  const mastered = current >= skill.requiredDepth;
  return [...skill.learningUnits]
    .filter((unit) =>
      mastered ? unit.type === "REVISE" : unit.type !== "REVISE",
    )
    .sort((left, right) => {
      const leftCoverage = Math.max(
        0,
        Math.min(left.toDepth, skill.requiredDepth) -
          Math.max(left.fromDepth, current),
      );
      const rightCoverage = Math.max(
        0,
        Math.min(right.toDepth, skill.requiredDepth) -
          Math.max(right.fromDepth, current),
      );
      return (
        rightCoverage - leftCoverage ||
        left.estimatedMinutes - right.estimatedMinutes ||
        left.stableKey.localeCompare(right.stableKey)
      );
    })[0];
}

function milestoneTrack(
  skill: RoadmapSkillInput,
  unit: RoadmapLearningUnitInput,
): RoadmapTrack {
  if (skill.academicSync >= 0.65) return "ACADEMIC";
  if (skill.placementRelevance >= 0.85 || unit.type === "ASSESS")
    return "PLACEMENT";
  return "CAREER";
}

export function validateRoadmap(
  result: Pick<RoadmapResult, "milestones" | "terms">,
): string[] {
  const violations: string[] = [];
  const milestoneIds = new Set<string>();
  const milestoneBySkill = new Map(
    result.milestones.map((item) => [item.skillId, item]),
  );
  for (const milestone of result.milestones) {
    if (milestoneIds.has(milestone.id))
      violations.push(`DUPLICATE_MILESTONE:${milestone.id}`);
    milestoneIds.add(milestone.id);
    if (!milestone.skillId || !milestone.learningUnitId)
      violations.push(`ORPHAN_MILESTONE:${milestone.id}`);
    for (const prerequisite of milestone.prerequisiteSkillIds) {
      const prior = milestoneBySkill.get(prerequisite);
      if (prior && prior.termSequence > milestone.termSequence)
        violations.push(
          `PREREQUISITE_INVERSION:${prerequisite}:${milestone.skillId}`,
        );
    }
  }
  for (const term of result.terms) {
    if (term.plannedMinutes > term.capacityMinutes)
      violations.push(`TERM_CAPACITY_BREACH:${term.id}`);
    if (new Set(term.milestoneIds).size !== term.milestoneIds.length)
      violations.push(`DUPLICATE_TERM_ITEM:${term.id}`);
  }
  return violations;
}

export function generateRoadmap(input: {
  rulesetVersion: string;
  skills: readonly RoadmapSkillInput[];
  terms: readonly RoadmapTermInput[];
}): RoadmapResult {
  if (
    input.terms.length === 0 ||
    input.terms.some(({ capacityMinutes }) => capacityMinutes < 0)
  )
    throw new Error("At least one valid roadmap term is required");
  const included = requiredSubgraph(input.skills);
  const includedIds = new Set(included.map(({ skillId }) => skillId));
  const dependents = new Map<string, string[]>();
  const indegree = new Map(included.map(({ skillId }) => [skillId, 0]));
  for (const skill of included) {
    for (const prerequisite of skill.prerequisites.filter(
      ({ type, skillId }) => type === "HARD" && includedIds.has(skillId),
    )) {
      dependents.set(prerequisite.skillId, [
        ...(dependents.get(prerequisite.skillId) ?? []),
        skill.skillId,
      ]);
      indegree.set(skill.skillId, (indegree.get(skill.skillId) ?? 0) + 1);
    }
  }
  const p90Minutes = percentile90(
    included.map(({ remainingMinutes }) => remainingMinutes),
  );
  const centrality = new Map(
    included.map(({ skillId }) => [
      skillId,
      included.length <= 1
        ? 0
        : descendants(skillId, dependents).size / (included.length - 1),
    ]),
  );
  const priority = new Map(
    included.map((skill) => [
      skill.skillId,
      scoreRoadmapPriority({
        roleImportance: skill.importance,
        placementRelevance: skill.placementRelevance,
        prerequisiteCentrality: centrality.get(skill.skillId) ?? 0,
        deadlineUrgency: skill.deadlineUrgency,
        skillGap:
          Math.max(skill.requiredDepth - (skill.effectiveProficiency ?? 0), 0) /
          Math.max(skill.requiredDepth, 0.001),
        academicSync: skill.academicSync,
        studentWeakness: skill.studentWeakness,
        normalizedTimeCost: skill.remainingMinutes / p90Minutes,
      }),
    ]),
  );
  const byId = new Map(included.map((skill) => [skill.skillId, skill]));
  const ready = included.filter(({ skillId }) => indegree.get(skillId) === 0);
  const compare = (left: RoadmapSkillInput, right: RoadmapSkillInput): number =>
    (priority.get(right.skillId) ?? 0) - (priority.get(left.skillId) ?? 0) ||
    left.requiredBy.localeCompare(right.requiredBy) ||
    (centrality.get(right.skillId) ?? 0) -
      (centrality.get(left.skillId) ?? 0) ||
    left.stableKey.localeCompare(right.stableKey);
  const ordered: RoadmapSkillInput[] = [];
  while (ready.length > 0) {
    ready.sort(compare);
    const skill = ready.shift()!;
    ordered.push(skill);
    for (const dependentId of dependents.get(skill.skillId) ?? []) {
      const next = (indegree.get(dependentId) ?? 1) - 1;
      indegree.set(dependentId, next);
      if (next === 0) ready.push(byId.get(dependentId)!);
    }
  }
  if (ordered.length !== included.length)
    throw new Error("Hard prerequisite cycle detected");

  const exclusions = input.skills
    .filter(({ skillId }) => !includedIds.has(skillId))
    .map(({ skillId }) => ({
      skillId,
      reason: "OPTIONAL_OUTSIDE_REQUIRED_SUBGRAPH",
    }));
  const risks: RoadmapResult["risks"] = [];
  const terms = [...input.terms]
    .sort(
      (left, right) =>
        left.sequence - right.sequence || left.id.localeCompare(right.id),
    )
    .map((term) => ({
      ...term,
      plannedMinutes: 0,
      milestoneIds: [] as string[],
    }));
  const milestones: RoadmapMilestoneResult[] = [];
  const allocatedSequence = new Map<string, number>();
  for (const skill of ordered) {
    const unit = chooseLearningUnit(skill);
    const mastered = (skill.effectiveProficiency ?? -1) >= skill.requiredDepth;
    const plannedMinutes = mastered
      ? (unit?.estimatedMinutes ?? 0)
      : skill.remainingMinutes;
    if (plannedMinutes <= 0) continue;
    if (!unit) {
      risks.push({
        skillId: skill.skillId,
        code: "MISSING_REVIEWED_LEARNING_UNIT",
        requiredMinutes: plannedMinutes,
        availableMinutes: 0,
      });
      continue;
    }
    const prerequisiteSequence = Math.max(
      -1,
      ...skill.prerequisites
        .filter(
          ({ type, skillId }) => type === "HARD" && includedIds.has(skillId),
        )
        .map(({ skillId }) => allocatedSequence.get(skillId) ?? -1),
    );
    const preferredSequence = Math.max(
      prerequisiteSequence,
      skill.academicTermSequence ?? -1,
    );
    const term =
      terms.find(
        (candidate) =>
          candidate.sequence >= preferredSequence &&
          candidate.endDate <= skill.requiredBy &&
          candidate.capacityMinutes - candidate.plannedMinutes >=
            plannedMinutes,
      ) ??
      terms.find(
        (candidate) =>
          candidate.sequence >= prerequisiteSequence &&
          candidate.endDate <= skill.requiredBy &&
          candidate.capacityMinutes - candidate.plannedMinutes >=
            plannedMinutes,
      );
    if (!term) {
      const availableMinutes = terms
        .filter(
          ({ sequence, endDate }) =>
            sequence >= prerequisiteSequence && endDate <= skill.requiredBy,
        )
        .reduce(
          (sum, candidate) =>
            sum +
            Math.max(0, candidate.capacityMinutes - candidate.plannedMinutes),
          0,
        );
      risks.push({
        skillId: skill.skillId,
        code: "REQUIRED_WORK_DOES_NOT_FIT",
        requiredMinutes: plannedMinutes,
        availableMinutes,
      });
      continue;
    }
    const milestoneId = `milestone:${skill.stableKey}:${unit.stableKey}`;
    const hardPrerequisites = skill.prerequisites
      .filter(
        ({ type, skillId }) => type === "HARD" && includedIds.has(skillId),
      )
      .map(({ skillId }) => skillId)
      .sort();
    const milestone: RoadmapMilestoneResult = {
      id: milestoneId,
      skillId: skill.skillId,
      skillKey: skill.stableKey,
      title: `${unit.title}: ${skill.name}`,
      track: milestoneTrack(skill, unit),
      learningUnitId: unit.id,
      sourceRequirementId: skill.roleRequirementId ?? null,
      estimatedMinutes: plannedMinutes,
      priority: priority.get(skill.skillId) ?? 0,
      requiredBy: skill.requiredBy,
      termId: term.id,
      termSequence: term.sequence,
      prerequisiteSkillIds: hardPrerequisites,
      reasonCodes: [
        ...new Set([
          skill.roleRequirementId ? "ROLE_REQUIRED" : "PREREQUISITE_OF",
          ...unit.reasonCodes,
        ]),
      ].sort(),
    };
    milestones.push(milestone);
    term.milestoneIds.push(milestone.id);
    term.plannedMinutes += plannedMinutes;
    allocatedSequence.set(skill.skillId, term.sequence);
  }
  const requiredMinutes = included.reduce(
    (sum, skill) => sum + skill.remainingMinutes,
    0,
  );
  const capacityMinutes = terms.reduce(
    (sum, term) => sum + term.capacityMinutes,
    0,
  );
  const plannedMinutes = milestones.reduce(
    (sum, milestone) => sum + milestone.estimatedMinutes,
    0,
  );
  const violations = validateRoadmap({ milestones, terms });
  const invalidContent = risks.some(
    ({ code }) => code === "MISSING_REVIEWED_LEARNING_UNIT",
  );
  return {
    status: invalidContent
      ? "INVALID_CONTENT"
      : risks.length > 0 || violations.length > 0
        ? "INSUFFICIENT_CAPACITY"
        : "READY",
    rulesetVersion: input.rulesetVersion,
    orderedSkillIds: ordered.map(({ skillId }) => skillId),
    milestones,
    terms,
    exclusions,
    risks,
    violations,
    summary: {
      requiredMinutes,
      plannedMinutes,
      capacityMinutes,
      bufferPercent: 15,
    },
  };
}

export type TaskOccurrenceState =
  | "PLANNED"
  | "IN_PROGRESS"
  | "PARTIAL"
  | "COMPLETED"
  | "SKIPPED"
  | "RESCHEDULED";

export type TaskCommand = "START" | "PARTIAL" | "SKIP" | "RESCHEDULE";

export function transitionTaskState(
  current: TaskOccurrenceState,
  command: TaskCommand,
): TaskOccurrenceState {
  const key = `${current}:${command}`;
  const transitions: Record<string, TaskOccurrenceState | undefined> = {
    "PLANNED:START": "IN_PROGRESS",
    "PLANNED:SKIP": "SKIPPED",
    "PLANNED:RESCHEDULE": "RESCHEDULED",
    "IN_PROGRESS:PARTIAL": "PARTIAL",
    "PARTIAL:START": "IN_PROGRESS",
  };
  const next = transitions[key];
  if (!next) throw new Error(`Invalid task transition: ${key}`);
  return next;
}

export function completeTaskState(current: TaskOccurrenceState): "COMPLETED" {
  if (current !== "IN_PROGRESS" && current !== "PARTIAL")
    throw new Error(`Invalid task completion: ${current}`);
  return "COMPLETED";
}

export interface AvailabilityWindowInput {
  day: number;
  startMinute: number;
  endMinute: number;
}

export interface SchedulableTaskInput {
  id: string;
  milestoneId: string;
  title: string;
  track: RoadmapTrack;
  sequence: number;
  estimatedMinutes: number;
  priority: number;
  prerequisiteTaskIds: string[];
}

export interface ScheduledTaskResult extends SchedulableTaskInput {
  localDate: string;
  startMinute: number;
  endMinute: number;
}

function parseLocalDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Local date must use YYYY-MM-DD");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || dateOnlyUtc(date) !== value)
    throw new Error("Local date is invalid");
  return date;
}

function dateOnlyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addLocalDays(value: string, days: number): string {
  return dateOnlyUtc(
    new Date(parseLocalDate(value).getTime() + days * 86_400_000),
  );
}

export function materializeWeek(input: {
  weekStart: string;
  timezone: string;
  windows: readonly AvailabilityWindowInput[];
  maxSessionMinutes: number;
  tasks: readonly SchedulableTaskInput[];
  capacityLimitMinutes?: number;
  academicLimitMinutes?: number;
  careerLimitMinutes?: number;
  maxCareerMinutesPerDay?: number;
  maxCareerSessionsPerWeek?: number;
}): {
  timezone: string;
  weekStart: string;
  rawMinutes: number;
  allocatableMinutes: number;
  catchupMinutes: number;
  scheduledMinutes: number;
  tasks: ScheduledTaskResult[];
  unscheduledTaskIds: string[];
} {
  const start = parseLocalDate(input.weekStart);
  if (start.getUTCDay() !== 1) throw new Error("Week must start on Monday");
  if (input.maxSessionMinutes < 10 || input.maxSessionMinutes > 240)
    throw new Error("Maximum session is invalid");
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timezone }).format();
  } catch {
    throw new Error("Timezone is invalid");
  }
  const windows = [...input.windows].sort(
    (left, right) =>
      left.day - right.day || left.startMinute - right.startMinute,
  );
  for (const [index, window] of windows.entries()) {
    if (
      window.day < 0 ||
      window.day > 6 ||
      window.startMinute < 0 ||
      window.endMinute > 1440 ||
      window.startMinute >= window.endMinute
    )
      throw new Error("Availability window is invalid");
    const prior = windows[index - 1];
    if (
      prior &&
      prior.day === window.day &&
      prior.endMinute > window.startMinute
    )
      throw new Error("Availability windows overlap");
  }
  const rawMinutes = windows.reduce(
    (sum, window) => sum + window.endMinute - window.startMinute,
    0,
  );
  const baseAllocatableMinutes = Math.floor(rawMinutes * 0.85);
  const allocatableMinutes = Math.min(
    baseAllocatableMinutes,
    Math.max(0, input.capacityLimitMinutes ?? baseAllocatableMinutes),
  );
  const slots = windows
    .flatMap((window) => {
      const offset = (window.day + 6) % 7;
      const localDate = addLocalDays(input.weekStart, offset);
      const result: Array<{
        localDate: string;
        startMinute: number;
        remainingMinutes: number;
      }> = [];
      let cursor = window.startMinute;
      while (cursor < window.endMinute && result.length < 3) {
        const remainingMinutes = Math.min(
          input.maxSessionMinutes,
          window.endMinute - cursor,
        );
        result.push({ localDate, startMinute: cursor, remainingMinutes });
        cursor += remainingMinutes;
      }
      return result;
    })
    .sort(
      (left, right) =>
        left.localDate.localeCompare(right.localDate) ||
        left.startMinute - right.startMinute,
    );
  const compareTasks = (
    left: SchedulableTaskInput,
    right: SchedulableTaskInput,
  ): number =>
    right.priority - left.priority ||
    left.sequence - right.sequence ||
    left.track.localeCompare(right.track) ||
    left.id.localeCompare(right.id);
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  const dependentsByTask = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const task of input.tasks) {
    const localPrerequisites = task.prerequisiteTaskIds.filter((id) =>
      taskById.has(id),
    );
    indegree.set(task.id, localPrerequisites.length);
    for (const prerequisiteId of localPrerequisites)
      dependentsByTask.set(prerequisiteId, [
        ...(dependentsByTask.get(prerequisiteId) ?? []),
        task.id,
      ]);
  }
  const ready = input.tasks.filter(({ id }) => indegree.get(id) === 0);
  const scheduled: ScheduledTaskResult[] = [];
  const scheduledIds = new Set<string>();
  let scheduledMinutes = 0;
  let academicMinutes = 0;
  let careerMinutes = 0;
  let careerSessions = 0;
  const careerMinutesByDay = new Map<string, number>();
  while (ready.length > 0) {
    ready.sort(compareTasks);
    const task = ready.shift()!;
    if (
      task.estimatedMinutes <= 0 ||
      task.estimatedMinutes > input.maxSessionMinutes
    )
      continue;
    const academic = task.track === "ACADEMIC";
    const withinTrackLimit = academic
      ? academicMinutes + task.estimatedMinutes <=
        (input.academicLimitMinutes ?? allocatableMinutes)
      : careerMinutes + task.estimatedMinutes <=
          (input.careerLimitMinutes ?? allocatableMinutes) &&
        careerSessions + 1 <=
          (input.maxCareerSessionsPerWeek ?? Number.POSITIVE_INFINITY);
    const slot = withinTrackLimit
      ? slots.find(
          (candidate) =>
            candidate.remainingMinutes >= task.estimatedMinutes &&
            scheduledMinutes + task.estimatedMinutes <= allocatableMinutes &&
            (academic ||
              (careerMinutesByDay.get(candidate.localDate) ?? 0) +
                task.estimatedMinutes <=
                (input.maxCareerMinutesPerDay ?? Number.POSITIVE_INFINITY)),
        )
      : undefined;
    if (!slot) continue;
    scheduled.push({
      ...task,
      localDate: slot.localDate,
      startMinute: slot.startMinute,
      endMinute: slot.startMinute + task.estimatedMinutes,
    });
    scheduledIds.add(task.id);
    slot.startMinute += task.estimatedMinutes;
    slot.remainingMinutes -= task.estimatedMinutes;
    scheduledMinutes += task.estimatedMinutes;
    if (academic) academicMinutes += task.estimatedMinutes;
    else {
      careerMinutes += task.estimatedMinutes;
      careerSessions += 1;
      careerMinutesByDay.set(
        slot.localDate,
        (careerMinutesByDay.get(slot.localDate) ?? 0) + task.estimatedMinutes,
      );
    }
    for (const dependentId of dependentsByTask.get(task.id) ?? []) {
      const next = (indegree.get(dependentId) ?? 1) - 1;
      indegree.set(dependentId, next);
      if (next === 0) ready.push(taskById.get(dependentId)!);
    }
  }
  return {
    timezone: input.timezone,
    weekStart: input.weekStart,
    rawMinutes,
    allocatableMinutes,
    catchupMinutes: rawMinutes - allocatableMinutes,
    scheduledMinutes,
    tasks: scheduled.sort(
      (left, right) =>
        left.localDate.localeCompare(right.localDate) ||
        left.startMinute - right.startMinute ||
        left.id.localeCompare(right.id),
    ),
    unscheduledTaskIds: [...input.tasks]
      .sort(compareTasks)
      .filter(({ id }) => !scheduledIds.has(id))
      .map(({ id }) => id),
  };
}

export function taskEvidenceEstimate(input: {
  currentProficiency: number | null;
  hasArtifact: boolean;
}): { proficiency: number; confidence: number } {
  const current = clamp01(input.currentProficiency ?? 0);
  return input.hasArtifact
    ? { proficiency: Math.min(0.8, current + 0.08), confidence: 0.82 }
    : { proficiency: Math.min(0.65, current + 0.03), confidence: 0.55 };
}

export interface ReadinessSkillInput {
  id: string;
  dimension: string;
  requiredDepth: number;
  importance: number;
  proficiency: number | null;
  confidence: number;
}

export interface ReadinessResult {
  score: number;
  uncappedScore: number;
  cap: 69 | 79 | 89 | 100;
  gates: {
    reviewedProject: boolean;
    profileAndTimedAssessment: boolean;
    interviewEvidence: boolean;
  };
  dimensions: Array<{
    dimension: string;
    weight: number;
    achievement: number;
    evidenceConfidence: number;
    score: number;
    nextAction: string | null;
  }>;
}

export function calculateReadiness(
  skills: readonly ReadinessSkillInput[],
  gates: {
    reviewedProject: boolean;
    profileComplete: boolean;
    timedAssessment: boolean;
    interviewEvidence: boolean;
  },
): ReadinessResult {
  if (skills.length === 0) throw new Error("Readiness requires role skills");
  const totalImportance = skills.reduce(
    (sum, skill) => sum + Math.max(0.001, skill.importance),
    0,
  );
  const groups = new Map<string, ReadinessSkillInput[]>();
  for (const skill of skills)
    groups.set(skill.dimension, [
      ...(groups.get(skill.dimension) ?? []),
      skill,
    ]);
  const dimensions = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dimension, items]) => {
      const dimensionImportance = items.reduce(
        (sum, item) => sum + Math.max(0.001, item.importance),
        0,
      );
      const achievement =
        items.reduce(
          (sum, item) =>
            sum +
            clamp01(
              (item.proficiency ?? 0) / Math.max(0.001, item.requiredDepth),
            ) *
              Math.max(0.001, item.importance),
          0,
        ) / dimensionImportance;
      const evidenceConfidence =
        items.reduce(
          (sum, item) =>
            sum + clamp01(item.confidence) * Math.max(0.001, item.importance),
          0,
        ) / dimensionImportance;
      const score = 100 * achievement * (0.7 + 0.3 * evidenceConfidence);
      const weakest = [...items].sort(
        (left, right) =>
          (left.proficiency ?? 0) / left.requiredDepth -
            (right.proficiency ?? 0) / right.requiredDepth ||
          left.id.localeCompare(right.id),
      )[0];
      return {
        dimension,
        weight: dimensionImportance / totalImportance,
        achievement,
        evidenceConfidence,
        score,
        nextAction:
          achievement >= 1 || !weakest
            ? null
            : `Add stronger evidence for ${weakest.id}`,
      };
    });
  const uncappedScore = dimensions.reduce(
    (sum, dimension) => sum + dimension.weight * dimension.score,
    0,
  );
  const profileAndTimedAssessment =
    gates.profileComplete && gates.timedAssessment;
  const cap: 69 | 79 | 89 | 100 = !gates.reviewedProject
    ? 69
    : !profileAndTimedAssessment
      ? 79
      : !gates.interviewEvidence
        ? 89
        : 100;
  return {
    score: round(Math.min(uncappedScore, cap), 1),
    uncappedScore: round(uncappedScore, 1),
    cap,
    gates: {
      reviewedProject: gates.reviewedProject,
      profileAndTimedAssessment,
      interviewEvidence: gates.interviewEvidence,
    },
    dimensions: dimensions.map((dimension) => ({
      ...dimension,
      weight: round(dimension.weight, 4),
      achievement: round(dimension.achievement, 4),
      evidenceConfidence: round(dimension.evidenceConfidence, 4),
      score: round(dimension.score, 1),
    })),
  };
}

export function scoreProject(input: {
  roleFit: number;
  missingEvidenceCoverage: number;
  currentlyLearningAlignment: number;
  portfolioValue: number;
  feasibility: number;
  studentInterest: number;
}): number {
  return round(
    100 *
      (0.3 * clamp01(input.roleFit) +
        0.25 * clamp01(input.missingEvidenceCoverage) +
        0.15 * clamp01(input.currentlyLearningAlignment) +
        0.15 * clamp01(input.portfolioValue) +
        0.1 * clamp01(input.feasibility) +
        0.05 * clamp01(input.studentInterest)),
    1,
  );
}

export function calculateProgress(input: {
  plannedTasks: number;
  completedTasks: number;
  plannedMinutes: number;
  completedMinutes: number;
  totalRoadmapMinutes: number;
  completedRoadmapMinutes: number;
  eligibleDays: number;
  activeDays: number;
}) {
  const ratio = (numerator: number, denominator: number) =>
    denominator <= 0 ? 0 : round(clamp01(numerator / denominator), 4);
  return {
    taskCompletion: ratio(input.completedTasks, input.plannedTasks),
    minuteCompletion: ratio(input.completedMinutes, input.plannedMinutes),
    roadmapProgress: ratio(
      input.completedRoadmapMinutes,
      input.totalRoadmapMinutes,
    ),
    consistency: ratio(input.activeDays, input.eligibleDays),
  };
}

export type WeeklyDifficulty = "TOO_EASY" | "GOOD" | "TOO_DIFFICULT";

export interface WeeklyAdaptationSignal {
  completionRate: number;
  difficulty: WeeklyDifficulty;
  earlyFinish: boolean;
}

export function calculateAdaptiveLoad(
  signals: readonly WeeklyAdaptationSignal[],
  alpha = 0.4,
): {
  sampleCount: number;
  ewma: number | null;
  multiplier: 0.8 | 0.9 | 1 | 1.1;
  action:
    | "INSUFFICIENT_DATA"
    | "DEFER_AND_SPLIT"
    | "REDUCE_CONTEXT"
    | "MAINTAIN"
    | "BRING_FORWARD";
} {
  if (alpha <= 0 || alpha > 1) throw new Error("EWMA alpha must be in (0,1]");
  const recent = signals.slice(-4);
  if (recent.length < 2)
    return {
      sampleCount: recent.length,
      ewma: null,
      multiplier: 1,
      action: "INSUFFICIENT_DATA",
    };
  let ewma = clampRange(recent[0]!.completionRate, 0, 1.5);
  for (const signal of recent.slice(1))
    ewma =
      alpha * clampRange(signal.completionRate, 0, 1.5) + (1 - alpha) * ewma;
  const lastTwo = recent.slice(-2);
  const difficultTwice = lastTwo.every(
    ({ difficulty }) => difficulty === "TOO_DIFFICULT",
  );
  const easyTwice = lastTwo.every(
    ({ difficulty }) => difficulty === "TOO_EASY",
  );
  const earlyFinish = lastTwo.some((signal) => signal.earlyFinish);
  if (ewma < 0.6 || difficultTwice)
    return {
      sampleCount: recent.length,
      ewma: round(ewma, 4),
      multiplier: 0.8,
      action: "DEFER_AND_SPLIT",
    };
  if (ewma < 0.8)
    return {
      sampleCount: recent.length,
      ewma: round(ewma, 4),
      multiplier: 0.9,
      action: "REDUCE_CONTEXT",
    };
  if (ewma > 1.05 && (earlyFinish || easyTwice))
    return {
      sampleCount: recent.length,
      ewma: round(ewma, 4),
      multiplier: 1.1,
      action: "BRING_FORWARD",
    };
  return {
    sampleCount: recent.length,
    ewma: round(ewma, 4),
    multiplier: 1,
    action: "MAINTAIN",
  };
}

export function adaptedUtilizationMinutes(input: {
  declaredMinutes: number;
  baseAllocatableMinutes: number;
  multiplier: number;
}): number {
  if (input.declaredMinutes < 0 || input.baseAllocatableMinutes < 0)
    throw new Error("Capacity cannot be negative");
  return Math.min(
    input.declaredMinutes,
    Math.floor(
      input.baseAllocatableMinutes * clampRange(input.multiplier, 0, 1.15),
    ),
  );
}

export type ExamMode =
  "NORMAL" | "INTERNAL_EXAM" | "SEMESTER_EXAM" | "VACATION" | "PLACEMENT_WEEK";

export interface ExamPeriodInput {
  id: string;
  type: Exclude<ExamMode, "NORMAL">;
  startDate: string;
  endDate: string;
  confirmed: boolean;
}

const EXAM_LEAD_DAYS: Record<Exclude<ExamMode, "NORMAL">, number> = {
  INTERNAL_EXAM: 7,
  SEMESTER_EXAM: 14,
  VACATION: 0,
  PLACEMENT_WEEK: 0,
};

const EXAM_PRIORITY: Record<ExamMode, number> = {
  NORMAL: 0,
  VACATION: 1,
  PLACEMENT_WEEK: 2,
  INTERNAL_EXAM: 3,
  SEMESTER_EXAM: 4,
};

export function resolvePlanningMode(input: {
  date: string;
  periods: readonly ExamPeriodInput[];
}): {
  mode: ExamMode;
  periodId: string | null;
  confirmationRequiredIds: string[];
} {
  const date = parseLocalDate(input.date);
  const confirmationRequiredIds: string[] = [];
  const active: ExamPeriodInput[] = [];
  for (const period of input.periods) {
    const start = parseLocalDate(period.startDate);
    const end = parseLocalDate(period.endDate);
    if (end < start) throw new Error("Exam period end precedes start");
    const leadStart = new Date(
      start.getTime() - EXAM_LEAD_DAYS[period.type] * 86_400_000,
    );
    if (date >= leadStart && date <= end) {
      if (period.confirmed) active.push(period);
      else if (date >= new Date(start.getTime() - 7 * 86_400_000))
        confirmationRequiredIds.push(period.id);
    }
  }
  active.sort(
    (left, right) =>
      EXAM_PRIORITY[right.type] - EXAM_PRIORITY[left.type] ||
      left.startDate.localeCompare(right.startDate) ||
      left.id.localeCompare(right.id),
  );
  return {
    mode: active[0]?.type ?? "NORMAL",
    periodId: active[0]?.id ?? null,
    confirmationRequiredIds: confirmationRequiredIds.sort(),
  };
}

export function planningModePolicy(mode: ExamMode): {
  academicShare: { min: number; max: number };
  careerShare: { min: number; max: number };
  maxCareerMinutesPerDay: number | null;
  maxCareerSessionsPerWeek: number | null;
  deferredTracks: RoadmapTrack[];
} {
  if (mode === "INTERNAL_EXAM")
    return {
      academicShare: { min: 0.6, max: 0.75 },
      careerShare: { min: 0.25, max: 0.4 },
      maxCareerMinutesPerDay: 45,
      maxCareerSessionsPerWeek: null,
      deferredTracks: ["PROJECT"],
    };
  if (mode === "SEMESTER_EXAM")
    return {
      academicShare: { min: 0.8, max: 0.9 },
      careerShare: { min: 0.1, max: 0.2 },
      maxCareerMinutesPerDay: 45,
      maxCareerSessionsPerWeek: 2,
      deferredTracks: ["PROJECT"],
    };
  if (mode === "PLACEMENT_WEEK")
    return {
      academicShare: { min: 0.15, max: 0.25 },
      careerShare: { min: 0.75, max: 0.85 },
      maxCareerMinutesPerDay: null,
      maxCareerSessionsPerWeek: null,
      deferredTracks: ["PROJECT"],
    };
  if (mode === "VACATION")
    return {
      academicShare: { min: 0, max: 1 },
      careerShare: { min: 0, max: 1 },
      maxCareerMinutesPerDay: null,
      maxCareerSessionsPerWeek: null,
      deferredTracks: [],
    };
  return {
    academicShare: { min: 0.25, max: 0.35 },
    careerShare: { min: 0.65, max: 0.75 },
    maxCareerMinutesPerDay: null,
    maxCareerSessionsPerWeek: null,
    deferredTracks: [],
  };
}

export interface DeferredTaskInput {
  id: string;
  estimatedMinutes: number;
  priority: number;
  required: boolean;
  dueDate: string;
}

export function placeDeferredWork(
  tasks: readonly DeferredTaskInput[],
  weeks: readonly {
    weekStart: string;
    allocatableMinutes: number;
    alreadyScheduledMinutes: number;
  }[],
): {
  assignments: Array<{ taskId: string; weekStart: string }>;
  unplacedTaskIds: string[];
  deadlineImpact: boolean;
} {
  const remaining = new Map(
    weeks
      .map((week) => ({
        ...week,
        remaining: Math.max(
          0,
          week.allocatableMinutes - week.alreadyScheduledMinutes,
        ),
      }))
      .sort((left, right) => left.weekStart.localeCompare(right.weekStart))
      .map((week) => [week.weekStart, week]),
  );
  const assignments: Array<{ taskId: string; weekStart: string }> = [];
  const unplacedTaskIds: string[] = [];
  const ordered = [...tasks].sort(
    (left, right) =>
      Number(right.required) - Number(left.required) ||
      right.priority - left.priority ||
      left.dueDate.localeCompare(right.dueDate) ||
      left.id.localeCompare(right.id),
  );
  for (const task of ordered) {
    const week = [...remaining.values()].find(
      (candidate) =>
        candidate.weekStart <= task.dueDate &&
        candidate.remaining >= task.estimatedMinutes,
    );
    if (!week) {
      unplacedTaskIds.push(task.id);
      continue;
    }
    week.remaining -= task.estimatedMinutes;
    assignments.push({ taskId: task.id, weekStart: week.weekStart });
  }
  return {
    assignments,
    unplacedTaskIds,
    deadlineImpact: ordered.some(
      (task) => task.required && unplacedTaskIds.includes(task.id),
    ),
  };
}

export interface RevisionTaskInput {
  id: string;
  stableKey: string;
  canonicalSkillId: string;
  depth: number;
  estimatedMinutes: number;
  targetDate: string;
  state: "PLANNED" | "IN_PROGRESS" | "PARTIAL" | "COMPLETED";
}

export function diffRoadmapTasks(
  previous: readonly RevisionTaskInput[],
  proposed: readonly RevisionTaskInput[],
) {
  const key = (task: RevisionTaskInput) =>
    `${task.canonicalSkillId}:${task.stableKey}`;
  const previousByKey = new Map(previous.map((task) => [key(task), task]));
  const proposedByKey = new Map(proposed.map((task) => [key(task), task]));
  const retained: Array<{
    previousId: string;
    proposedId: string;
    locked: boolean;
  }> = [];
  const changed: Array<{
    previousId: string;
    proposedId: string;
    depthDelta: number;
    minutesDelta: number;
    targetDateChanged: boolean;
  }> = [];
  const added: RevisionTaskInput[] = [];
  const removed: RevisionTaskInput[] = [];
  for (const task of previous) {
    const next = proposedByKey.get(key(task));
    const locked = task.state !== "PLANNED";
    if (!next) {
      if (locked)
        retained.push({
          previousId: task.id,
          proposedId: task.id,
          locked: true,
        });
      else removed.push(task);
      continue;
    }
    if (
      locked ||
      (task.depth === next.depth &&
        task.estimatedMinutes === next.estimatedMinutes &&
        task.targetDate === next.targetDate)
    )
      retained.push({ previousId: task.id, proposedId: next.id, locked });
    else
      changed.push({
        previousId: task.id,
        proposedId: next.id,
        depthDelta: round(next.depth - task.depth, 4),
        minutesDelta: next.estimatedMinutes - task.estimatedMinutes,
        targetDateChanged: next.targetDate !== task.targetDate,
      });
  }
  for (const task of proposed)
    if (!previousByKey.has(key(task))) added.push(task);
  const priorMinutes = previous.reduce(
    (total, task) => total + task.estimatedMinutes,
    0,
  );
  const movedMinutes =
    changed.reduce((total, task) => total + Math.abs(task.minutesDelta), 0) +
    added.reduce((total, task) => total + task.estimatedMinutes, 0) +
    removed.reduce((total, task) => total + task.estimatedMinutes, 0);
  return {
    retained,
    changed,
    new: added,
    noLongerRequired: removed,
    hoursMovedPercent:
      priorMinutes === 0 ? 0 : round((movedMinutes / priorMinutes) * 100, 2),
    milestoneDateChanges: changed.filter((task) => task.targetDateChanged)
      .length,
  };
}

export function revisionConsent(input: {
  trigger: "WEEKLY" | "MATERIAL" | "ROLE" | "CONTENT";
  hoursMovedPercent: number;
  milestoneDateChanges: number;
}): { required: boolean; autoEligible: boolean } {
  const autoEligible =
    input.trigger === "WEEKLY" &&
    input.hoursMovedPercent <= 10 &&
    input.milestoneDateChanges === 0;
  return { required: !autoEligible, autoEligible };
}

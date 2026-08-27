import rawCatalog from "../data/local-planner-catalog.json";

export type TargetLevel =
  "INTERNSHIP_READY" | "SERVICE_PLACEMENT" | "PRODUCT_PLACEMENT";

export interface AcademicInput {
  branchCode: string;
  currentSemester: number;
  expectedGraduation: string;
}

export interface GoalInput {
  roleKey: string;
  targetLevel: TargetLevel;
  deadline: string;
}

export interface AvailabilityInput {
  maxSessionMinutes: number;
  dailyMinutes: number[];
}

export interface PlannerProfile {
  academic?: AcademicInput;
  goal?: GoalInput;
  skillLevels: Record<string, number>;
  availability?: AvailabilityInput;
}

interface Skill {
  key: string;
  name: string;
  category: string;
}

interface Requirement {
  skillKey: string;
  requiredDepth: number;
  importance: number;
  required: boolean;
  rationale: string;
  hours: { p25: number; p50: number; p75: number };
}

interface Role {
  key: string;
  name: string;
  domainKey: string;
  targetLevels: Array<{ level: TargetLevel; requirements: Requirement[] }>;
}

interface BranchMapping {
  skillKey: string;
  depth: number;
  confidence: number;
  subjectCode: string | null;
  subjectTitle: string | null;
  semester: number | null;
}

interface Branch {
  code: string;
  name: string;
  curriculumVersion: string;
  availableSemesters: number[];
  subjects: Array<{ code: string; title: string; semester: number }>;
  mappings: BranchMapping[];
}

interface Catalog {
  version: string;
  university: { code: string; name: string };
  regulation: { code: string; name: string };
  degree: { code: string; name: string };
  skills: Skill[];
  roles: Role[];
  branches: Branch[];
}

export interface RankedRole extends Role {
  matchScore: number;
  specificMatchCount: number;
  matchedSkills: string[];
  supportingSubjects: string[];
}

export interface PlannedSkill {
  key: string;
  name: string;
  category: string;
  requiredDepth: number;
  currentDepth: number;
  importance: number;
  remainingHours: number;
  classification: "MASTERED" | "COLLEGE_COVERED" | "EXTENSION" | "INDEPENDENT";
  subjectCode: string | null;
  subjectTitle: string | null;
  semester: number | null;
  rationale: string;
  action: string;
}

export interface LocalPlan {
  branch: Branch;
  role: Role;
  targetLevel: TargetLevel;
  deadline: string;
  skills: PlannedSkill[];
  totalHours: number;
  weeklyMinutes: number;
  weeklyHours: number;
  estimatedWeeks: number;
  estimatedMonths: number;
  weeksUntilDeadline: number;
  fitsDeadline: boolean;
  reservePercent: number;
  subjects: Array<{
    code: string | null;
    title: string;
    semester: number | null;
    skills: PlannedSkill[];
  }>;
  dailyPlan: Array<{
    day: string;
    minutes: number;
    focus: string;
    action: string;
  }>;
  weeklyPlan: Array<{
    week: number;
    theme: string;
    skills: string[];
    outcome: string;
  }>;
  monthlyPlan: Array<{
    month: number;
    theme: string;
    skills: string[];
    milestone: string;
  }>;
}

export const catalog = rawCatalog as Catalog;

const skillByKey = new Map(catalog.skills.map((skill) => [skill.key, skill]));
const genericCareerSkills = new Set([
  "aptitude.quantitative",
  "aptitude.reasoning",
  "communication.technical",
  "interview.coding",
  "projects.delivery",
  "resume.portfolio",
  "tools.git",
]);
const dayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function words(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function targetLabel(value: TargetLevel): string {
  return words(value);
}

export function getBranch(code: string | undefined): Branch | undefined {
  return catalog.branches.find((branch) => branch.code === code);
}

export function getRole(key: string | undefined): Role | undefined {
  return catalog.roles.find((role) => role.key === key);
}

export function getTarget(
  role: Role | undefined,
  level: TargetLevel | undefined,
) {
  return role?.targetLevels.find((target) => target.level === level);
}

export function rankedRoles(branchCode: string): RankedRole[] {
  const branch = getBranch(branchCode);
  if (!branch) return [];
  const bestMapping = new Map<string, BranchMapping>();
  for (const mapping of branch.mappings) {
    const current = bestMapping.get(mapping.skillKey);
    if (
      !current ||
      mapping.depth * mapping.confidence > current.depth * current.confidence
    )
      bestMapping.set(mapping.skillKey, mapping);
  }

  return catalog.roles
    .map((role) => {
      const requirements = role.targetLevels[0]?.requirements ?? [];
      const matches = requirements.filter((requirement) =>
        bestMapping.has(requirement.skillKey),
      );
      const specificMatches = matches.filter(
        (requirement) => !genericCareerSkills.has(requirement.skillKey),
      );
      const matchScore = matches.reduce((score, requirement) => {
        const mapping = bestMapping.get(requirement.skillKey)!;
        return (
          score + requirement.importance * mapping.depth * mapping.confidence
        );
      }, 0);
      return {
        ...role,
        matchScore,
        specificMatchCount: specificMatches.length,
        matchedSkills: specificMatches
          .slice(0, 4)
          .map((requirement) => skillByKey.get(requirement.skillKey)?.name)
          .filter((name): name is string => Boolean(name)),
        supportingSubjects: [
          ...new Set(
            matches
              .map(
                (requirement) =>
                  bestMapping.get(requirement.skillKey)?.subjectTitle,
              )
              .filter((name): name is string => Boolean(name)),
          ),
        ].slice(0, 3),
      };
    })
    .filter((role) => role.specificMatchCount >= 2)
    .sort((left, right) => right.matchScore - left.matchScore)
    .slice(0, 12);
}

export function assessmentSkills(profile: PlannerProfile): Skill[] {
  const role = getRole(profile.goal?.roleKey);
  const target = getTarget(role, profile.goal?.targetLevel);
  return (target?.requirements ?? [])
    .filter((requirement) => requirement.required)
    .sort((left, right) => right.importance - left.importance)
    .slice(0, 10)
    .map((requirement) => skillByKey.get(requirement.skillKey))
    .filter((skill): skill is Skill => Boolean(skill));
}

export function buildLocalPlan(profile: PlannerProfile): LocalPlan | null {
  const branch = getBranch(profile.academic?.branchCode);
  const role = getRole(profile.goal?.roleKey);
  const target = getTarget(role, profile.goal?.targetLevel);
  const availability = profile.availability;
  if (!branch || !role || !target || !availability || !profile.goal)
    return null;

  const bestMapping = new Map<string, BranchMapping>();
  for (const mapping of branch.mappings) {
    const current = bestMapping.get(mapping.skillKey);
    if (
      !current ||
      mapping.depth * mapping.confidence > current.depth * current.confidence
    )
      bestMapping.set(mapping.skillKey, mapping);
  }

  const skills: PlannedSkill[] = target.requirements
    .filter((requirement) => requirement.required)
    .map((requirement) => {
      const skill = skillByKey.get(requirement.skillKey) ?? {
        key: requirement.skillKey,
        name: words(requirement.skillKey),
        category: "CAREER",
      };
      const currentDepth = profile.skillLevels[requirement.skillKey] ?? 0;
      const remainingRatio = Math.max(
        0,
        (requirement.requiredDepth - currentDepth) / requirement.requiredDepth,
      );
      const remainingHours = Math.ceil(requirement.hours.p50 * remainingRatio);
      const mapping = bestMapping.get(requirement.skillKey);
      const classification: PlannedSkill["classification"] =
        remainingHours === 0
          ? "MASTERED"
          : !mapping
            ? "INDEPENDENT"
            : mapping.depth >= requirement.requiredDepth
              ? "COLLEGE_COVERED"
              : "EXTENSION";
      const action =
        classification === "MASTERED"
          ? `Validate ${skill.name} with one interview-ready example.`
          : classification === "COLLEGE_COVERED"
            ? `Revise ${mapping?.subjectTitle}, practise ${skill.name}, and create evidence.`
            : classification === "EXTENSION"
              ? `Use ${mapping?.subjectTitle} as the base, then build a role-level project.`
              : `Learn ${skill.name} independently and prove it with a portfolio artifact.`;
      return {
        key: skill.key,
        name: skill.name,
        category: skill.category,
        requiredDepth: requirement.requiredDepth,
        currentDepth,
        importance: requirement.importance,
        remainingHours,
        classification,
        subjectCode: mapping?.subjectCode ?? null,
        subjectTitle: mapping?.subjectTitle ?? null,
        semester: mapping?.semester ?? null,
        rationale: requirement.rationale,
        action,
      };
    })
    .sort(
      (left, right) =>
        right.importance - left.importance ||
        right.remainingHours - left.remainingHours,
    );

  const remainingSkills = skills.filter((skill) => skill.remainingHours > 0);
  const totalHours = remainingSkills.reduce(
    (total, skill) => total + skill.remainingHours,
    0,
  );
  const declaredWeeklyMinutes = availability.dailyMinutes.reduce(
    (total, minutes) => total + minutes,
    0,
  );
  if (declaredWeeklyMinutes < 30) return null;
  const weeklyMinutes = Math.floor(declaredWeeklyMinutes * 0.85);
  const weeklyHours = Math.round((weeklyMinutes / 60) * 10) / 10;
  const estimatedWeeks = Math.max(
    1,
    Math.ceil((totalHours * 60) / weeklyMinutes),
  );
  const estimatedMonths = Math.max(1, Math.ceil(estimatedWeeks / 4.3));
  const deadlineTime = new Date(`${profile.goal.deadline}T23:59:59`).getTime();
  const weeksUntilDeadline = Math.max(
    0,
    Math.floor((deadlineTime - Date.now()) / (7 * 24 * 60 * 60 * 1_000)),
  );
  const fitsDeadline = estimatedWeeks <= weeksUntilDeadline;

  const subjectGroups = new Map<string, LocalPlan["subjects"][number]>();
  for (const skill of skills) {
    const key = skill.subjectCode ?? "independent";
    const existing = subjectGroups.get(key);
    if (existing) existing.skills.push(skill);
    else
      subjectGroups.set(key, {
        code: skill.subjectCode,
        title: skill.subjectTitle ?? "Independent career track",
        semester: skill.semester,
        skills: [skill],
      });
  }

  const focusSkills = remainingSkills.length ? remainingSkills : skills;
  const dailyPlan = availability.dailyMinutes.flatMap((minutes, day) => {
    if (minutes <= 0) return [];
    const skill = focusSkills[day % Math.max(1, focusSkills.length)];
    if (!skill) return [];
    return [
      {
        day: dayNames[day] ?? `Day ${day + 1}`,
        minutes: Math.min(minutes, availability.maxSessionMinutes),
        focus: skill.name,
        action: skill.action,
      },
    ];
  });

  const weeklyPlan = Array.from(
    { length: Math.min(estimatedWeeks, 12) },
    (_, index) => {
      const first = focusSkills[index % Math.max(1, focusSkills.length)];
      const second = focusSkills[(index + 1) % Math.max(1, focusSkills.length)];
      const names = [
        ...new Set([first?.name, second?.name].filter(Boolean)),
      ] as string[];
      return {
        week: index + 1,
        theme:
          index < 2
            ? "Build the foundation"
            : index < 6
              ? "Practise and apply"
              : "Prove and prepare",
        skills: names,
        outcome: `Complete focused practice and one visible checkpoint for ${names.join(" and ")}.`,
      };
    },
  );

  const monthlyPlan = Array.from(
    { length: Math.min(estimatedMonths, 36) },
    (_, index) => {
      const start = index * 2;
      const names = focusSkills
        .slice(start, start + 3)
        .map((skill) => skill.name);
      const fallback =
        focusSkills[index % Math.max(1, focusSkills.length)]?.name;
      const monthSkills = names.length ? names : fallback ? [fallback] : [];
      return {
        month: index + 1,
        theme:
          index === 0
            ? "Foundation"
            : index + 1 === estimatedMonths
              ? "Placement proof"
              : "Role depth",
        skills: monthSkills,
        milestone:
          index + 1 === estimatedMonths
            ? `Publish a ${role.name} capstone and prepare interview stories.`
            : `Finish a demonstrable checkpoint using ${monthSkills.join(", ")}.`,
      };
    },
  );

  return {
    branch,
    role,
    targetLevel: profile.goal.targetLevel,
    deadline: profile.goal.deadline,
    skills,
    totalHours,
    weeklyMinutes,
    weeklyHours,
    estimatedWeeks,
    estimatedMonths,
    weeksUntilDeadline,
    fitsDeadline,
    reservePercent: 15,
    subjects: [...subjectGroups.values()].sort(
      (left, right) => (left.semester ?? 99) - (right.semester ?? 99),
    ),
    dailyPlan,
    weeklyPlan,
    monthlyPlan,
  };
}

export function emptyProfile(): PlannerProfile {
  return { skillLevels: {} };
}

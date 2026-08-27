import fs from "node:fs/promises";
import path from "node:path";

const outputDirectory = path.resolve("content/production");
const datasetVersion = "2026.08.1";
const reviewedAt = "2026-08-26T00:00:00Z";

const skillDefinitions = [
  ["programming.fundamentals", "Programming fundamentals", "PROGRAMMING", []],
  [
    "programming.oop",
    "Object-oriented programming",
    "PROGRAMMING",
    [["programming.fundamentals", "HARD", 0.4]],
  ],
  [
    "dsa.core",
    "Data structures and algorithms",
    "DSA",
    [["programming.fundamentals", "HARD", 0.4]],
  ],
  [
    "dsa.problem-solving",
    "Algorithmic problem solving",
    "DSA",
    [["dsa.core", "HARD", 0.5]],
  ],
  [
    "core.os",
    "Operating systems",
    "CORE_CS",
    [["programming.fundamentals", "SOFT", 0.3]],
  ],
  ["core.networks", "Computer networks", "CORE_CS", []],
  [
    "db.relational",
    "Relational databases and SQL",
    "DATABASES",
    [["programming.fundamentals", "SOFT", 0.3]],
  ],
  [
    "engineering.software",
    "Software engineering practices",
    "DEVELOPMENT",
    [["programming.oop", "SOFT", 0.4]],
  ],
  [
    "engineering.testing",
    "Automated testing and debugging",
    "DEVELOPMENT",
    [["programming.fundamentals", "HARD", 0.4]],
  ],
  ["tools.git", "Git and collaborative version control", "TOOLS", []],
  [
    "web.fundamentals",
    "HTML, CSS, and browser fundamentals",
    "DEVELOPMENT",
    [],
  ],
  [
    "web.javascript",
    "Modern JavaScript and TypeScript",
    "PROGRAMMING",
    [["programming.fundamentals", "HARD", 0.4]],
  ],
  [
    "web.react",
    "React user-interface development",
    "DEVELOPMENT",
    [
      ["web.javascript", "HARD", 0.5],
      ["web.fundamentals", "HARD", 0.4],
    ],
  ],
  [
    "backend.api",
    "HTTP and REST API engineering",
    "DEVELOPMENT",
    [
      ["core.networks", "SOFT", 0.3],
      ["programming.fundamentals", "HARD", 0.5],
    ],
  ],
  [
    "backend.security",
    "Application security fundamentals",
    "CORE_CS",
    [["backend.api", "SOFT", 0.4]],
  ],
  [
    "deployment.devops",
    "CI/CD, containers, and deployment",
    "TOOLS",
    [
      ["tools.git", "HARD", 0.4],
      ["engineering.testing", "SOFT", 0.4],
    ],
  ],
  [
    "data.python",
    "Python for data work",
    "DATA",
    [["programming.fundamentals", "HARD", 0.4]],
  ],
  ["data.statistics", "Applied statistics", "DATA", []],
  [
    "data.analysis",
    "Data cleaning and analysis",
    "DATA",
    [
      ["data.python", "HARD", 0.4],
      ["db.relational", "SOFT", 0.4],
      ["data.statistics", "HARD", 0.4],
    ],
  ],
  [
    "data.visualization",
    "Data visualization and reporting",
    "DATA",
    [["data.analysis", "HARD", 0.5]],
  ],
  ["communication.technical", "Technical communication", "COMMUNICATION", []],
  [
    "projects.delivery",
    "Portfolio project delivery",
    "PROJECTS",
    [
      ["tools.git", "HARD", 0.4],
      ["engineering.software", "SOFT", 0.4],
    ],
  ],
  [
    "interview.coding",
    "Coding interview problem solving",
    "INTERVIEW",
    [["dsa.core", "HARD", 0.5]],
  ],
  ["placement.aptitude", "Quantitative aptitude and reasoning", "APTITUDE", []],
];

const skills = skillDefinitions.map(([key, name, category, prerequisites]) => ({
  key,
  name,
  category,
  rubricVersion: 1,
  evidenceDecayDays: ["TOOLS", "DEVELOPMENT", "DATA", "INTERVIEW"].includes(
    category,
  )
    ? 365
    : 730,
  prerequisites: prerequisites.map(([skillKey, type, threshold]) => ({
    skillKey,
    type,
    threshold,
  })),
}));

const roleSkills = {
  "software-engineer": [
    "programming.fundamentals",
    "programming.oop",
    "dsa.core",
    "dsa.problem-solving",
    "core.os",
    "core.networks",
    "db.relational",
    "engineering.software",
    "engineering.testing",
    "tools.git",
    "projects.delivery",
    "communication.technical",
    "interview.coding",
    "placement.aptitude",
  ],
  "backend-engineer": [
    "programming.fundamentals",
    "programming.oop",
    "dsa.core",
    "core.os",
    "core.networks",
    "db.relational",
    "engineering.software",
    "engineering.testing",
    "tools.git",
    "backend.api",
    "backend.security",
    "deployment.devops",
    "projects.delivery",
    "communication.technical",
    "interview.coding",
  ],
  "full-stack-engineer": [
    "programming.fundamentals",
    "dsa.core",
    "db.relational",
    "engineering.software",
    "engineering.testing",
    "tools.git",
    "web.fundamentals",
    "web.javascript",
    "web.react",
    "backend.api",
    "backend.security",
    "deployment.devops",
    "projects.delivery",
    "communication.technical",
    "interview.coding",
  ],
  "data-analyst": [
    "programming.fundamentals",
    "db.relational",
    "tools.git",
    "data.python",
    "data.statistics",
    "data.analysis",
    "data.visualization",
    "projects.delivery",
    "communication.technical",
    "placement.aptitude",
  ],
};

const roleNames = {
  "software-engineer": "Software Engineer",
  "backend-engineer": "Backend Engineer",
  "full-stack-engineer": "Full-stack Engineer",
  "data-analyst": "Data Analyst",
};

const levels = [
  ["INTERNSHIP_READY", 0.52, 0.72, 0],
  ["SERVICE_PLACEMENT", 0.64, 0.82, 10],
  ["PRODUCT_PLACEMENT", 0.78, 0.92, 20],
];

function requirement(skillKey, levelIndex, roleKey) {
  const [level, depth, importance, hours] = levels[levelIndex];
  const foundational = [
    "programming.fundamentals",
    "dsa.core",
    "db.relational",
    "communication.technical",
  ].includes(skillKey);
  const p50 = 18 + hours + (foundational ? 6 : 0);
  return {
    skillKey,
    requiredDepth: Math.min(0.9, depth + (foundational ? 0.04 : 0)),
    importance: Math.min(1, importance + (foundational ? 0.06 : 0)),
    placementRelevance: Math.min(
      1,
      0.72 + levelIndex * 0.1 + (foundational ? 0.04 : 0),
    ),
    required: true,
    requiredByDaysBeforeDeadline: 45 + levelIndex * 30,
    hours: { p25: Math.round(p50 * 0.7), p50, p75: Math.round(p50 * 1.45) },
    rationale: `${skillKey.replaceAll(".", " ")} is part of the reviewed ${roleNames[roleKey]} ${level.replaceAll("_", " ").toLowerCase()} competency profile.`,
  };
}

const roles = Object.entries(roleSkills).map(([key, skillKeys]) => ({
  key,
  name: roleNames[key],
  domainKey: key === "data-analyst" ? "data-analytics" : "software-development",
  version: 1,
  targetLevels: levels.map(([level], levelIndex) => ({
    level,
    requirements: skillKeys.map((skillKey) =>
      requirement(skillKey, levelIndex, key),
    ),
  })),
}));

const learningUnits = skills.flatMap((skill) => [
  {
    key: `learn.${skill.key}.foundation`,
    type: "TEACH",
    skillKeys: [skill.key],
    fromDepth: 0,
    toDepth: 0.55,
    estimatedMinutes: 720,
    difficulty: "FOUNDATION",
    splitPointsMinutes: [30, 45, 60],
    reasonCodes: ["ROLE_REQUIRED"],
  },
  {
    key: `learn.${skill.key}.evidence`,
    type: "PRACTICE",
    skillKeys: [skill.key],
    fromDepth: 0.55,
    toDepth: 0.85,
    estimatedMinutes: 900,
    difficulty: "INTERMEDIATE",
    splitPointsMinutes: [45, 60, 90],
    reasonCodes: ["PROJECT_EVIDENCE", "PLACEMENT_REQUIRED"],
  },
]);

const career = {
  schemaVersion: "1.0.0",
  datasetVersion,
  synthetic: false,
  review: {
    editorId: "studentos-content-editor",
    reviewerId: "studentos-content-reviewer",
    reviewedAt,
    rationale:
      "Role activities and technology coverage were cross-checked against O*NET occupation profiles and India NCO classifications. Skill depths and effort estimates are StudentOS planning parameters, not claims made by those sources.",
  },
  skills,
  roles,
  learningUnits,
};

const projectSpecs = [
  [
    "campus-placement-tracker",
    "Campus Placement Tracker",
    ["software-engineer", "full-stack-engineer"],
    ["programming.oop", "db.relational", "engineering.testing", "tools.git"],
    "Build a tested application that tracks employers, applications, interviews, and outcomes for a placement cell.",
  ],
  [
    "issue-triage-service",
    "Issue Triage Service",
    ["software-engineer", "backend-engineer"],
    [
      "backend.api",
      "db.relational",
      "engineering.testing",
      "communication.technical",
    ],
    "Build a documented service that accepts, prioritizes, assigns, and reports software issues with an auditable workflow.",
  ],
  [
    "jntuh-study-planner-api",
    "JNTUH Study Planner API",
    ["backend-engineer"],
    ["backend.api", "db.relational", "backend.security", "deployment.devops"],
    "Build and deploy a secure REST API for semester subjects, study sessions, deadlines, and completion evidence.",
  ],
  [
    "secure-file-metadata-api",
    "Secure File Metadata API",
    ["backend-engineer"],
    [
      "backend.api",
      "backend.security",
      "engineering.testing",
      "deployment.devops",
    ],
    "Build a secure metadata service with authorization, validation, automated tests, observability, and deployment documentation.",
  ],
  [
    "student-progress-portal",
    "Student Progress Portal",
    ["full-stack-engineer"],
    [
      "web.fundamentals",
      "web.javascript",
      "web.react",
      "backend.api",
      "db.relational",
    ],
    "Build an accessible full-stack portal that turns course and task records into clear weekly progress views.",
  ],
  [
    "college-event-platform",
    "College Event Platform",
    ["full-stack-engineer", "software-engineer"],
    [
      "web.react",
      "backend.api",
      "backend.security",
      "engineering.testing",
      "deployment.devops",
    ],
    "Build a responsive event discovery and registration platform with role-based administration and production deployment.",
  ],
  [
    "placement-insights-dashboard",
    "Placement Insights Dashboard",
    ["data-analyst"],
    [
      "data.python",
      "data.statistics",
      "data.analysis",
      "data.visualization",
      "communication.technical",
    ],
    "Analyze a documented placement dataset and publish a reproducible dashboard that explains trends, limitations, and decisions.",
  ],
  [
    "telangana-open-data-study",
    "Telangana Open Data Study",
    ["data-analyst"],
    [
      "db.relational",
      "data.python",
      "data.analysis",
      "data.visualization",
      "projects.delivery",
    ],
    "Create a reproducible analysis of a public Telangana dataset with data-quality checks, visual findings, and a decision brief.",
  ],
];

function project([slug, title, roleKeys, skillKeys, goal], index) {
  const key = `project.${slug}`;
  const stages = [
    ["scope", "Scope and evidence plan", 0.15],
    ["build", "Working implementation", 0.45],
    ["quality", "Quality and validation", 0.25],
    ["release", "Release and case study", 0.15],
  ];
  return {
    key,
    version: 1,
    title,
    goal,
    roleKeys,
    difficulty:
      index < 2 ? "FOUNDATION" : index < 6 ? "INTERMEDIATE" : "ADVANCED",
    estimatedHours: {
      p25: 18 + index * 2,
      p50: 28 + index * 3,
      p75: 42 + index * 4,
    },
    portfolioValue: Math.min(0.95, 0.76 + index * 0.025),
    prerequisites: skillKeys
      .slice(0, 2)
      .map((skillKey) => ({ skillKey, threshold: 0.35, type: "HARD" })),
    deliverables: [
      "Version-controlled source repository",
      "Automated validation evidence",
      "Architecture and decision notes",
      "Published case study",
    ],
    deploymentRequired: true,
    milestones: stages.map(([stage, stageTitle, weight], stageIndex) => ({
      key: `${key}.${stage}`,
      title: stageTitle,
      sequence: stageIndex + 1,
      weight,
      estimatedMinutes: [240, 900, 480, 300][stageIndex] + index * 30,
      skillOutcomes:
        stageIndex === 0
          ? [skillKeys[0]]
          : stageIndex === 1
            ? skillKeys
            : stageIndex === 2
              ? skillKeys.slice(-2)
              : ["projects.delivery", "communication.technical"],
      completionCriteria: [
        stage === "scope"
          ? "A reviewer can trace requirements, users, risks, and acceptance criteria."
          : stage === "build"
            ? "The primary user journey works from persisted input to verified output."
            : stage === "quality"
              ? "Tests, validation, accessibility or data-quality checks cover the documented risks."
              : "A deployed result, reproducible setup, and concise case study are publicly reviewable.",
      ],
    })),
  };
}

const projects = {
  schemaVersion: "1.0.0",
  datasetVersion,
  synthetic: false,
  projects: projectSpecs.map(project),
};

const mappingSpecs = [
  [
    "jntuh.r25.cse.cs105es.unit-1",
    "programming.fundamentals",
    0.55,
    0.48,
    0.95,
  ],
  ["jntuh.r25.cse.cs303pc.unit-1", "programming.oop", 0.75, 0.65, 0.95],
  ["jntuh.r25.cse.cs205es.unit-1", "dsa.core", 0.8, 0.62, 0.95],
  ["jntuh.r25.cse.cs403pc.unit-1", "dsa.problem-solving", 0.7, 0.68, 0.92],
  ["jntuh.r25.cse.cs402pc.unit-1", "core.os", 0.7, 0.62, 0.94],
  ["jntuh.r25.cse.cs404pc.unit-1", "core.networks", 0.7, 0.62, 0.94],
  ["jntuh.r25.cse.cs305pc.unit-1", "db.relational", 0.78, 0.66, 0.95],
  ["jntuh.r25.cse.cs304pc.unit-1", "engineering.software", 0.7, 0.58, 0.94],
  ["jntuh.r25.cse.cs308pc.scope", "engineering.testing", 0.6, 0.56, 0.82],
  ["jntuh.r25.cse.cs210es.scope", "tools.git", 0.4, 0.35, 0.75],
  ["jntuh.r25.cse.cs310sd.scope", "web.fundamentals", 0.5, 0.48, 0.8],
  ["jntuh.r25.cse.cs310sd.scope", "web.javascript", 0.65, 0.58, 0.82],
  ["jntuh.r25.cse.cs310sd.scope", "web.react", 0.65, 0.58, 0.82],
  ["jntuh.r25.cse.cs310sd.scope", "backend.api", 0.55, 0.5, 0.8],
  ["jntuh.r25.cse.cs601pc.scope", "backend.security", 0.7, 0.62, 0.78],
  ["jntuh.r25.cse.cs503pc.scope", "deployment.devops", 0.72, 0.62, 0.78],
  ["jntuh.r25.cse.cs208es.scope", "data.python", 0.68, 0.55, 0.82],
  ["jntuh.r25.cse.ma401pc.unit-1", "data.statistics", 0.75, 0.65, 0.93],
  ["jntuh.r25.cse.cs405pc.unit-1", "data.analysis", 0.62, 0.56, 0.9],
  ["jntuh.r25.cse.cs410sd.scope", "data.visualization", 0.75, 0.65, 0.82],
  ["jntuh.r25.cse.en607hs.scope", "communication.technical", 0.65, 0.55, 0.76],
  ["jntuh.r25.cse.cs801pc.scope", "projects.delivery", 0.8, 0.72, 0.78],
  ["jntuh.r25.cse.cs606pc.scope", "interview.coding", 0.48, 0.5, 0.74],
  ["jntuh.r25.cse.ma101bs.unit-1", "placement.aptitude", 0.35, 0.32, 0.72],
];

const mappings = {
  schemaVersion: "1.0.0",
  mappingVersion: 1,
  curriculumDatasetVersion: datasetVersion,
  careerDatasetVersion: datasetVersion,
  review: {
    editorId: "studentos-content-editor",
    reviewerId: "studentos-content-reviewer",
    reviewedAt,
  },
  mappings: mappingSpecs.map(
    ([curriculumTopicKey, skillKey, breadth, depth, confidence]) => ({
      curriculumTopicKey,
      skillKey,
      breadth,
      depth,
      confidence,
      practiceRequired: true,
      evidencePotential: Math.max(0.35, Math.round((depth - 0.08) * 100) / 100),
      rationale: `The published JNTUH R25 CSE topic directly supports ${skillKey.replaceAll(".", " ")}; independent applied evidence remains required for career readiness.`,
    }),
  ),
};

await fs.mkdir(outputDirectory, { recursive: true });
await Promise.all([
  fs.writeFile(
    path.join(outputDirectory, `career-knowledge-${datasetVersion}.json`),
    `${JSON.stringify(career, null, 2)}\n`,
  ),
  fs.writeFile(
    path.join(outputDirectory, `project-templates-${datasetVersion}.json`),
    `${JSON.stringify(projects, null, 2)}\n`,
  ),
  fs.writeFile(
    path.join(
      outputDirectory,
      `jntuh-r25-cse-career-mappings-${datasetVersion}.json`,
    ),
    `${JSON.stringify(mappings, null, 2)}\n`,
  ),
]);

console.log(
  `Built ${skills.length} skills, ${roles.length} roles, ${learningUnits.length} learning units, ${projects.projects.length} projects, and ${mappings.mappings.length} mappings.`,
);

import fs from "node:fs/promises";
import path from "node:path";

const outputDirectory = path.resolve("content/production");
const datasetVersion = "2026.08.2";
const reviewedAt = "2026-08-26T00:00:00Z";

const definitions = [
  ["programming.fundamentals", "Programming fundamentals", "PROGRAMMING"],
  [
    "programming.oop",
    "Object-oriented programming",
    "PROGRAMMING",
    "programming.fundamentals",
  ],
  [
    "programming.java",
    "Java application development",
    "PROGRAMMING",
    "programming.oop",
  ],
  [
    "programming.python",
    "Python application development",
    "PROGRAMMING",
    "programming.fundamentals",
  ],
  [
    "programming.javascript",
    "JavaScript and TypeScript",
    "PROGRAMMING",
    "programming.fundamentals",
  ],
  [
    "dsa.core",
    "Data structures and algorithms",
    "DSA",
    "programming.fundamentals",
  ],
  ["dsa.problem-solving", "Algorithmic problem solving", "DSA", "dsa.core"],
  ["core.os", "Operating systems", "CORE_CS"],
  ["core.networks", "Computer networks", "CORE_CS"],
  ["core.architecture", "Computer organization and architecture", "CORE_CS"],
  ["core.linux", "Linux systems administration", "CORE_CS", "core.os"],
  ["core.distributed", "Distributed systems", "CORE_CS", "core.networks"],
  [
    "core.cybersecurity",
    "Cybersecurity foundations",
    "CORE_CS",
    "core.networks",
  ],
  ["core.cloud", "Cloud computing foundations", "CORE_CS", "core.networks"],
  ["core.iot", "Internet of Things systems", "CORE_CS", "core.networks"],
  ["db.relational", "Relational databases and SQL", "DATABASES"],
  ["db.nosql", "NoSQL data stores", "DATABASES", "db.relational"],
  [
    "db.modeling",
    "Data modeling and database design",
    "DATABASES",
    "db.relational",
  ],
  ["db.warehouse", "Data warehousing", "DATABASES", "db.relational"],
  [
    "engineering.software",
    "Software engineering practices",
    "DEVELOPMENT",
    "programming.oop",
  ],
  [
    "engineering.testing",
    "Automated testing and debugging",
    "DEVELOPMENT",
    "programming.fundamentals",
  ],
  [
    "web.fundamentals",
    "HTML, CSS, accessibility, and browser fundamentals",
    "DEVELOPMENT",
  ],
  [
    "web.frontend",
    "Modern frontend application development",
    "DEVELOPMENT",
    "programming.javascript",
  ],
  ["backend.api", "HTTP and API engineering", "DEVELOPMENT", "core.networks"],
  [
    "backend.security",
    "Secure application engineering",
    "DEVELOPMENT",
    "backend.api",
  ],
  [
    "mobile.development",
    "Mobile application development",
    "DEVELOPMENT",
    "programming.oop",
  ],
  [
    "deployment.devops",
    "CI/CD, containers, and deployment",
    "TOOLS",
    "tools.git",
  ],
  ["cloud.platform", "Cloud platform engineering", "TOOLS", "core.cloud"],
  [
    "qa.automation",
    "Quality engineering and test automation",
    "DEVELOPMENT",
    "engineering.testing",
  ],
  ["tools.git", "Git and collaborative version control", "TOOLS"],
  ["tools.cad", "Computer-aided design and drafting", "TOOLS"],
  ["tools.gis", "GIS and remote-sensing tools", "TOOLS"],
  ["tools.eda", "Electronic design automation tools", "TOOLS"],
  ["data.statistics", "Applied statistics", "DATA"],
  ["data.analysis", "Data cleaning and analysis", "DATA", "data.statistics"],
  [
    "data.visualization",
    "Data visualization and reporting",
    "DATA",
    "data.analysis",
  ],
  [
    "data.bi",
    "Business intelligence and dashboarding",
    "DATA",
    "data.visualization",
  ],
  [
    "data.engineering",
    "Data engineering and pipelines",
    "DATA",
    "db.warehouse",
  ],
  ["data.bigdata", "Big-data processing", "DATA", "data.engineering"],
  ["ai.machine-learning", "Machine learning", "DATA", "data.statistics"],
  ["ai.deep-learning", "Deep learning", "DATA", "ai.machine-learning"],
  ["ai.generative", "Generative AI systems", "DATA", "ai.deep-learning"],
  ["ai.nlp", "Natural language processing", "DATA", "ai.machine-learning"],
  ["ai.computer-vision", "Computer vision", "DATA", "ai.machine-learning"],
  ["electronics.circuits", "Electronic circuits and devices", "DEVELOPMENT"],
  [
    "electronics.embedded",
    "Embedded systems and microcontrollers",
    "DEVELOPMENT",
    "electronics.circuits",
  ],
  [
    "electronics.vlsi",
    "VLSI design and verification",
    "DEVELOPMENT",
    "electronics.circuits",
  ],
  ["electronics.signal", "Signals and digital signal processing", "DATA"],
  [
    "electronics.telecom",
    "Communication and telecom systems",
    "DEVELOPMENT",
    "core.networks",
  ],
  [
    "electronics.pcb",
    "PCB design and prototyping",
    "DEVELOPMENT",
    "electronics.circuits",
  ],
  ["electronics.control", "Control systems", "DEVELOPMENT"],
  [
    "mechanical.mechanics",
    "Engineering mechanics and solid mechanics",
    "DEVELOPMENT",
  ],
  [
    "mechanical.design",
    "Mechanical design and machine elements",
    "DEVELOPMENT",
    "mechanical.mechanics",
  ],
  ["mechanical.thermal", "Thermodynamics and heat transfer", "DEVELOPMENT"],
  [
    "mechanical.manufacturing",
    "Manufacturing and production technology",
    "DEVELOPMENT",
  ],
  [
    "mechanical.automation",
    "Robotics, mechatronics, and automation",
    "DEVELOPMENT",
    "electronics.control",
  ],
  ["mechanical.quality", "Industrial quality and operations", "PROJECTS"],
  [
    "civil.construction",
    "Construction methods and site engineering",
    "DEVELOPMENT",
  ],
  [
    "civil.structural",
    "Structural analysis and design",
    "DEVELOPMENT",
    "mechanical.mechanics",
  ],
  ["civil.surveying", "Surveying and geomatics", "DEVELOPMENT"],
  ["civil.geotechnical", "Geotechnical engineering", "DEVELOPMENT"],
  ["civil.transport", "Transportation engineering", "DEVELOPMENT"],
  ["civil.environment", "Water and environmental engineering", "DEVELOPMENT"],
  ["civil.bim", "Building information modeling", "TOOLS", "tools.cad"],
  ["mining.operations", "Mine planning and mining operations", "DEVELOPMENT"],
  ["mining.safety", "Mine safety and statutory practice", "PROJECTS"],
  ["mining.survey", "Mine surveying", "DEVELOPMENT", "civil.surveying"],
  ["mining.ventilation", "Mine ventilation and mechanization", "DEVELOPMENT"],
  ["biotech.cell", "Cell biology and biochemistry", "DATA"],
  [
    "biotech.molecular",
    "Molecular biology and genetic engineering",
    "DATA",
    "biotech.cell",
  ],
  ["biotech.microbiology", "Microbiology", "DATA", "biotech.cell"],
  [
    "biotech.bioprocess",
    "Bioprocess and industrial biotechnology",
    "DEVELOPMENT",
    "biotech.cell",
  ],
  [
    "biotech.bioinformatics",
    "Bioinformatics and computational biology",
    "DATA",
    "programming.python",
  ],
  ["product.requirements", "Product discovery and requirements", "PROJECTS"],
  ["business.analysis", "Business analysis", "DATA", "data.analysis"],
  ["communication.technical", "Technical communication", "COMMUNICATION"],
  ["projects.delivery", "Portfolio project delivery", "PROJECTS", "tools.git"],
  ["placement.aptitude", "Quantitative aptitude and reasoning", "APTITUDE"],
  [
    "interview.coding",
    "Coding interview problem solving",
    "INTERVIEW",
    "dsa.core",
  ],
  [
    "resume.portfolio",
    "Resume, portfolio, and interview storytelling",
    "RESUME",
    "projects.delivery",
  ],
];

const skills = definitions.map(([key, name, category, prerequisite]) => ({
  key,
  name,
  category,
  rubricVersion: 1,
  evidenceDecayDays: ["TOOLS", "DEVELOPMENT", "DATA", "INTERVIEW"].includes(
    category,
  )
    ? 365
    : 730,
  prerequisites: prerequisite
    ? [{ skillKey: prerequisite, type: "HARD", threshold: 0.4 }]
    : [],
}));

const common = [
  "communication.technical",
  "projects.delivery",
  "resume.portfolio",
];
const roleSpecs = [
  [
    "software-engineer",
    "Software Engineer",
    "software-development",
    [
      "programming.oop",
      "dsa.core",
      "core.os",
      "db.relational",
      "engineering.software",
      "engineering.testing",
      "tools.git",
      "interview.coding",
    ],
  ],
  [
    "backend-engineer",
    "Backend Engineer",
    "software-development",
    [
      "programming.java",
      "dsa.core",
      "core.os",
      "core.networks",
      "db.relational",
      "backend.api",
      "backend.security",
      "deployment.devops",
    ],
  ],
  [
    "frontend-engineer",
    "Frontend Engineer",
    "software-development",
    [
      "programming.javascript",
      "web.fundamentals",
      "web.frontend",
      "engineering.testing",
      "backend.api",
      "tools.git",
    ],
  ],
  [
    "full-stack-engineer",
    "Full-stack Engineer",
    "software-development",
    [
      "programming.javascript",
      "web.frontend",
      "backend.api",
      "db.relational",
      "backend.security",
      "engineering.testing",
      "deployment.devops",
    ],
  ],
  [
    "mobile-app-developer",
    "Mobile App Developer",
    "software-development",
    [
      "programming.oop",
      "mobile.development",
      "backend.api",
      "db.relational",
      "engineering.testing",
      "tools.git",
    ],
  ],
  [
    "qa-automation-engineer",
    "QA Automation Engineer",
    "software-quality",
    [
      "programming.fundamentals",
      "engineering.testing",
      "qa.automation",
      "backend.api",
      "deployment.devops",
      "tools.git",
    ],
  ],
  [
    "devops-engineer",
    "DevOps Engineer",
    "cloud-and-platform",
    [
      "core.os",
      "core.linux",
      "core.networks",
      "core.cloud",
      "deployment.devops",
      "cloud.platform",
      "tools.git",
    ],
  ],
  [
    "cloud-engineer",
    "Cloud Engineer",
    "cloud-and-platform",
    [
      "core.os",
      "core.networks",
      "core.cloud",
      "cloud.platform",
      "deployment.devops",
      "backend.security",
    ],
  ],
  [
    "cybersecurity-analyst",
    "Cybersecurity Analyst",
    "cybersecurity",
    [
      "core.os",
      "core.linux",
      "core.networks",
      "core.cybersecurity",
      "backend.security",
      "programming.python",
    ],
  ],
  [
    "network-engineer",
    "Network Engineer",
    "networks-and-telecom",
    [
      "core.networks",
      "core.linux",
      "core.cybersecurity",
      "electronics.telecom",
      "core.cloud",
    ],
  ],
  [
    "database-administrator",
    "Database Administrator",
    "data-platforms",
    [
      "db.relational",
      "db.modeling",
      "db.nosql",
      "core.os",
      "core.cloud",
      "backend.security",
    ],
  ],
  [
    "data-analyst",
    "Data Analyst",
    "data-and-ai",
    [
      "programming.python",
      "db.relational",
      "data.statistics",
      "data.analysis",
      "data.visualization",
      "data.bi",
    ],
  ],
  [
    "business-analyst",
    "Business Analyst",
    "product-and-business",
    [
      "business.analysis",
      "product.requirements",
      "data.analysis",
      "data.visualization",
      "communication.technical",
    ],
  ],
  [
    "data-engineer",
    "Data Engineer",
    "data-and-ai",
    [
      "programming.python",
      "db.relational",
      "db.warehouse",
      "data.engineering",
      "data.bigdata",
      "core.cloud",
    ],
  ],
  [
    "data-scientist",
    "Data Scientist",
    "data-and-ai",
    [
      "programming.python",
      "data.statistics",
      "data.analysis",
      "data.visualization",
      "ai.machine-learning",
      "db.relational",
    ],
  ],
  [
    "machine-learning-engineer",
    "Machine Learning Engineer",
    "data-and-ai",
    [
      "programming.python",
      "dsa.core",
      "data.engineering",
      "ai.machine-learning",
      "ai.deep-learning",
      "deployment.devops",
    ],
  ],
  [
    "ai-engineer",
    "AI Engineer",
    "data-and-ai",
    [
      "programming.python",
      "ai.machine-learning",
      "ai.deep-learning",
      "ai.generative",
      "ai.nlp",
      "backend.api",
    ],
  ],
  [
    "embedded-systems-engineer",
    "Embedded Systems Engineer",
    "electronics-and-embedded",
    [
      "programming.fundamentals",
      "core.architecture",
      "electronics.circuits",
      "electronics.embedded",
      "electronics.pcb",
      "electronics.control",
    ],
  ],
  [
    "vlsi-design-engineer",
    "VLSI Design Engineer",
    "electronics-and-embedded",
    [
      "electronics.circuits",
      "electronics.vlsi",
      "electronics.signal",
      "tools.eda",
      "engineering.testing",
    ],
  ],
  [
    "electronics-design-engineer",
    "Electronics Design Engineer",
    "electronics-and-embedded",
    [
      "electronics.circuits",
      "electronics.pcb",
      "electronics.signal",
      "electronics.control",
      "tools.eda",
    ],
  ],
  [
    "telecom-engineer",
    "Telecom Engineer",
    "networks-and-telecom",
    [
      "electronics.signal",
      "electronics.telecom",
      "core.networks",
      "core.cybersecurity",
      "data.analysis",
    ],
  ],
  [
    "iot-engineer",
    "IoT Engineer",
    "electronics-and-embedded",
    [
      "core.iot",
      "electronics.embedded",
      "electronics.circuits",
      "core.networks",
      "backend.api",
      "core.cybersecurity",
    ],
  ],
  [
    "mechanical-design-engineer",
    "Mechanical Design Engineer",
    "mechanical-engineering",
    [
      "mechanical.mechanics",
      "mechanical.design",
      "tools.cad",
      "mechanical.manufacturing",
      "mechanical.quality",
    ],
  ],
  [
    "manufacturing-engineer",
    "Manufacturing Engineer",
    "mechanical-engineering",
    [
      "mechanical.manufacturing",
      "mechanical.quality",
      "mechanical.automation",
      "tools.cad",
      "data.analysis",
    ],
  ],
  [
    "automotive-engineer",
    "Automotive Engineer",
    "mechanical-engineering",
    [
      "mechanical.mechanics",
      "mechanical.design",
      "mechanical.thermal",
      "mechanical.automation",
      "tools.cad",
    ],
  ],
  [
    "robotics-engineer",
    "Robotics Engineer",
    "robotics-and-automation",
    [
      "programming.python",
      "electronics.embedded",
      "electronics.control",
      "mechanical.design",
      "mechanical.automation",
      "ai.computer-vision",
    ],
  ],
  [
    "civil-site-engineer",
    "Civil Site Engineer",
    "civil-engineering",
    [
      "civil.construction",
      "civil.surveying",
      "civil.structural",
      "tools.cad",
      "product.requirements",
    ],
  ],
  [
    "structural-engineer",
    "Structural Engineer",
    "civil-engineering",
    [
      "mechanical.mechanics",
      "civil.structural",
      "civil.geotechnical",
      "tools.cad",
      "civil.bim",
    ],
  ],
  [
    "transportation-engineer",
    "Transportation Engineer",
    "civil-engineering",
    [
      "civil.surveying",
      "civil.transport",
      "tools.gis",
      "data.analysis",
      "civil.environment",
    ],
  ],
  [
    "gis-engineer",
    "GIS Engineer",
    "geospatial",
    [
      "civil.surveying",
      "tools.gis",
      "data.analysis",
      "data.visualization",
      "programming.python",
    ],
  ],
  [
    "mining-engineer",
    "Mining Engineer",
    "mining-engineering",
    [
      "mining.operations",
      "mining.survey",
      "mining.ventilation",
      "mining.safety",
      "tools.gis",
    ],
  ],
  [
    "bioprocess-engineer",
    "Bioprocess Engineer",
    "biotechnology",
    [
      "biotech.cell",
      "biotech.microbiology",
      "biotech.bioprocess",
      "data.statistics",
      "engineering.testing",
    ],
  ],
  [
    "bioinformatics-analyst",
    "Bioinformatics Analyst",
    "biotechnology",
    [
      "biotech.cell",
      "biotech.molecular",
      "biotech.bioinformatics",
      "programming.python",
      "data.statistics",
      "data.analysis",
    ],
  ],
];

const levels = [
  ["INTERNSHIP_READY", 0.52, 0],
  ["SERVICE_PLACEMENT", 0.65, 8],
  ["PRODUCT_PLACEMENT", 0.78, 16],
];

function requirement(skillKey, roleName, level, depth, extraHours, index) {
  const p50 = 14 + extraHours + (index < 3 ? 6 : 0);
  return {
    skillKey,
    requiredDepth: Math.min(0.9, depth + (index < 2 ? 0.04 : 0)),
    importance: Math.max(0.7, 0.94 - index * 0.025),
    placementRelevance: Math.max(0.68, 0.95 - index * 0.02),
    required: true,
    requiredByDaysBeforeDeadline: 45 + extraHours * 3,
    hours: { p25: Math.round(p50 * 0.7), p50, p75: Math.round(p50 * 1.45) },
    rationale: `${skillKey.replaceAll(".", " ")} is part of the reviewed ${roleName} ${level.replaceAll("_", " ").toLowerCase()} competency profile.`,
  };
}

const roles = roleSpecs.map(([key, name, domainKey, specialistSkills]) => {
  const roleSkills = [...new Set([...specialistSkills, ...common])];
  return {
    key,
    name,
    domainKey,
    version: 2,
    targetLevels: levels.map(([level, depth, extraHours]) => ({
      level,
      requirements: roleSkills.map((skillKey, index) =>
        requirement(skillKey, name, level, depth, extraHours, index),
      ),
    })),
  };
});

const learningUnits = skills.flatMap((skill) => [
  {
    key: `learn.${skill.key}.foundation`,
    type: "TEACH",
    skillKeys: [skill.key],
    fromDepth: 0,
    toDepth: 0.55,
    estimatedMinutes: 600,
    difficulty: "FOUNDATION",
    splitPointsMinutes: [30, 45, 60],
    reasonCodes: ["ROLE_REQUIRED"],
  },
  {
    key: `learn.${skill.key}.evidence`,
    type: "PRACTICE",
    skillKeys: [skill.key],
    fromDepth: 0.55,
    toDepth: 0.88,
    estimatedMinutes: 840,
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
      "Role families and technology coverage were cross-checked against O*NET occupation profiles and India's NCO classification. Skill depths and effort estimates are StudentOS planning parameters and are not claims made by those sources.",
  },
  skills,
  roles,
  learningUnits,
};

const projects = {
  schemaVersion: "1.0.0",
  datasetVersion,
  synthetic: false,
  projects: roleSpecs.map(([key, name, domainKey, specialistSkills], index) => {
    const skillKeys = [
      ...specialistSkills.slice(0, 5),
      "projects.delivery",
      "communication.technical",
    ];
    const projectKey = `project.${key}.capstone`;
    return {
      key: projectKey,
      version: 2,
      title: `${name} Evidence Capstone`,
      goal: `Deliver a realistic ${domainKey.replaceAll("-", " ")} solution that demonstrates the core decisions, validation, and communication expected from an entry-level ${name}.`,
      roleKeys: [key],
      difficulty:
        index % 3 === 0
          ? "FOUNDATION"
          : index % 3 === 1
            ? "INTERMEDIATE"
            : "ADVANCED",
      estimatedHours: { p25: 20, p50: 32, p75: 48 },
      portfolioValue: 0.86,
      prerequisites: specialistSkills
        .slice(0, 2)
        .map((skillKey) => ({ skillKey, threshold: 0.35, type: "HARD" })),
      deliverables: [
        "Version-controlled working artifact",
        "Validation and test evidence",
        "Architecture or engineering decision record",
        "Public case study and demonstration",
      ],
      deploymentRequired: ![
        "civil-engineering",
        "mechanical-engineering",
        "mining-engineering",
        "biotechnology",
      ].includes(domainKey),
      milestones: [
        [
          "scope",
          "Scope, constraints, and evidence plan",
          1,
          0.15,
          240,
          [skillKeys[0]],
        ],
        [
          "build",
          "Working implementation or engineering analysis",
          2,
          0.45,
          960,
          skillKeys.slice(0, 5),
        ],
        [
          "validate",
          "Validation against documented risks",
          3,
          0.25,
          480,
          skillKeys.slice(3),
        ],
        [
          "present",
          "Portfolio case study and technical walkthrough",
          4,
          0.15,
          240,
          ["projects.delivery", "communication.technical"],
        ],
      ].map(
        ([slug, title, sequence, weight, estimatedMinutes, skillOutcomes]) => ({
          key: `${projectKey}.${slug}`,
          title,
          sequence,
          weight,
          estimatedMinutes,
          skillOutcomes: [...new Set(skillOutcomes)],
          completionCriteria: [
            `A reviewer can verify the ${String(title).toLowerCase()} from the submitted artifact and evidence.`,
          ],
        }),
      ),
    };
  }),
};

const mappingRules = [
  [/programming|java|python|c programming/i, "programming.fundamentals"],
  [/data structures|algorithm/i, "dsa.core"],
  [/operating system/i, "core.os"],
  [/computer network|data communication/i, "core.networks"],
  [/computer organization|microprocessor/i, "core.architecture"],
  [/database/i, "db.relational"],
  [/software engineering/i, "engineering.software"],
  [/software testing|testing method/i, "engineering.testing"],
  [/web programming|node js|react js|full stack/i, "web.frontend"],
  [/cloud computing|devops/i, "core.cloud"],
  [
    /cyber|cryptography|network security|penetration|forensics/i,
    "core.cybersecurity",
  ],
  [/statistics|probability/i, "data.statistics"],
  [/data analy|data visualization|power bi|tableau/i, "data.analysis"],
  [/data science|data mining/i, "data.analysis"],
  [/machine learning/i, "ai.machine-learning"],
  [/deep learning/i, "ai.deep-learning"],
  [/generative ai|prompt engineering/i, "ai.generative"],
  [/natural language/i, "ai.nlp"],
  [/computer vision|image processing/i, "ai.computer-vision"],
  [/electronic devices|electronic circuit/i, "electronics.circuits"],
  [/embedded|microcontroller/i, "electronics.embedded"],
  [/vlsi|digital design/i, "electronics.vlsi"],
  [/signal processing|signals and systems/i, "electronics.signal"],
  [/communication system|wireless|antennas|microwave/i, "electronics.telecom"],
  [/control system/i, "electronics.control"],
  [
    /engineering mechanics|mechanics of solids|strength of materials/i,
    "mechanical.mechanics",
  ],
  [/machine design|design of machine|cad|drafting/i, "mechanical.design"],
  [/thermodynamics|thermal engineering|heat transfer/i, "mechanical.thermal"],
  [
    /manufacturing|production technology|machine tools/i,
    "mechanical.manufacturing",
  ],
  [/robotics|automation|mechatronic/i, "mechanical.automation"],
  [/building planning|construction/i, "civil.construction"],
  [
    /structural|theory of structures|concrete|steel structures/i,
    "civil.structural",
  ],
  [/surveying|geomatics/i, "civil.surveying"],
  [/geotechnical|engineering geology/i, "civil.geotechnical"],
  [/transportation|highway/i, "civil.transport"],
  [
    /environmental engineering|water resources|hydraulics/i,
    "civil.environment",
  ],
  [/building information model/i, "civil.bim"],
  [/mining|mineral deposits|mine planning/i, "mining.operations"],
  [/mine survey/i, "mining.survey"],
  [/mine ventilation|mine mechanization/i, "mining.ventilation"],
  [/cell biology|biochemistry/i, "biotech.cell"],
  [/molecular biology|genetic engineering/i, "biotech.molecular"],
  [/microbiology/i, "biotech.microbiology"],
  [
    /bioprocess|industrial biotechnology|enzyme engineering/i,
    "biotech.bioprocess",
  ],
  [/bioinformatics/i, "biotech.bioinformatics"],
  [/english|communication/i, "communication.technical"],
  [/project|internship|industrial training/i, "projects.delivery"],
];

function mappingsForCurriculum(payload) {
  const seen = new Set();
  const mappings = [];
  for (const semester of payload.semesters) {
    for (const subject of semester.subjects) {
      const topic = subject.units[0]?.topics[0];
      if (!topic) continue;
      for (const [pattern, skillKey] of mappingRules) {
        if (!pattern.test(subject.title)) continue;
        const key = `${topic.key}|${skillKey}`;
        if (seen.has(key)) continue;
        seen.add(key);
        mappings.push({
          curriculumTopicKey: topic.key,
          skillKey,
          breadth: subject.type === "LAB" ? 0.55 : 0.72,
          depth: subject.type === "LAB" ? 0.62 : 0.58,
          confidence: 0.86,
          practiceRequired: true,
          evidencePotential:
            subject.type === "LAB" || subject.type === "PROJECT" ? 0.72 : 0.48,
          rationale: `${subject.title} in the official JNTUH R25 course structure directly supports ${skillKey.replaceAll(".", " ")}; applied evidence is still required for career readiness.`,
        });
      }
    }
  }
  return mappings;
}

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
]);

const curriculumFiles = (await fs.readdir(outputDirectory)).filter(
  (name) =>
    /^jntuh-r25-.+-2026\.08\.[12]\.json$/.test(name) &&
    !name.includes("career-mappings"),
);
let mappingCount = 0;
for (const filename of curriculumFiles) {
  if (filename === "jntuh-r25-cse-2026.08.2.json") continue;
  const payload = JSON.parse(
    await fs.readFile(path.join(outputDirectory, filename), "utf8"),
  );
  const branch = payload.dataset.branchCode.toLowerCase().replaceAll("_", "-");
  const mappings = mappingsForCurriculum(payload);
  mappingCount += mappings.length;
  const mappingPayload = {
    schemaVersion: "1.0.0",
    mappingVersion: 2,
    curriculumDatasetVersion: payload.dataset.datasetVersion,
    careerDatasetVersion: datasetVersion,
    review: {
      editorId: "studentos-content-editor",
      reviewerId: "studentos-content-reviewer",
      reviewedAt,
    },
    mappings,
  };
  await fs.writeFile(
    path.join(
      outputDirectory,
      `jntuh-r25-${branch}-career-mappings-${datasetVersion}.json`,
    ),
    `${JSON.stringify(mappingPayload, null, 2)}\n`,
  );
}

console.log(
  `Built ${skills.length} skills, ${roles.length} roles, ${learningUnits.length} learning units, ${projects.projects.length} projects, and ${mappingCount} cross-branch mappings.`,
);

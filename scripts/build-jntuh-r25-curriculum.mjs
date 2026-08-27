import fs from "node:fs";
import path from "node:path";

const sourceTextPath = path.resolve("tmp/pdfs/jntuh-r25-cse.txt");
const outputPath = path.resolve(
  "content/production/jntuh-r25-cse-2026.08.1.json",
);

if (!fs.existsSync(sourceTextPath)) {
  throw new Error(
    "Extract the official JNTUH CSE PDF to tmp/pdfs/jntuh-r25-cse.txt first.",
  );
}

const sourceText = fs.readFileSync(sourceTextPath, "utf8");

const course = (code, title, l, t, p, credits) => ({
  code,
  title,
  l,
  t,
  p,
  credits,
});

const semesters = [
  [
    course("MA101BS", "Matrices and Calculus", 3, 1, 0, 4),
    course("CH102BS", "Engineering Chemistry", 3, 0, 0, 3),
    course("EN103HS", "English for Skill Enhancement", 3, 0, 0, 3),
    course("EC104ES", "Electronic Devices and Circuits", 3, 0, 0, 3),
    course("CS105ES", "Programming for Problem Solving", 3, 0, 0, 3),
    course("CH106BS", "Engineering Chemistry Lab", 0, 0, 2, 1),
    course("CS107ES", "Programming for Problem Solving Lab", 0, 0, 2, 1),
    course(
      "EN108HS",
      "English Language and Communication Skills Lab",
      0,
      0,
      2,
      1,
    ),
    course("ME109ES", "Engineering Workshop", 0, 0, 2, 1),
  ],
  [
    course(
      "MA201BS",
      "Ordinary Differential Equations and Vector Calculus",
      3,
      0,
      0,
      3,
    ),
    course("PH202BS", "Advanced Engineering Physics", 3, 0, 0, 3),
    course(
      "ME203ES",
      "Engineering Drawing and Computer Aided Drafting",
      2,
      0,
      2,
      3,
    ),
    course("EE204ES", "Basic Electrical Engineering", 3, 0, 0, 3),
    course("CS205ES", "Data Structures", 3, 0, 0, 3),
    course("PH206BS", "Advanced Engineering Physics Lab", 0, 0, 2, 1),
    course("CS207ES", "Data Structures Lab", 0, 0, 2, 1),
    course("CS208ES", "Python Programming Lab", 0, 0, 2, 1),
    course("EE209ES", "Basic Electrical Engineering Lab", 0, 0, 2, 1),
    course("CS210ES", "IT Workshop", 0, 0, 2, 1),
  ],
  [
    course("CS301PC", "Discrete Mathematics", 3, 0, 0, 3),
    course("CS302PC", "Computer Organization and Architecture", 3, 0, 0, 3),
    course("CS303PC", "Object Oriented Programming through Java", 3, 0, 0, 3),
    course("CS304PC", "Software Engineering", 3, 0, 0, 3),
    course("CS305PC", "Database Management Systems", 3, 0, 0, 3),
    course("MS306HS", "Innovation and Entrepreneurship", 2, 0, 0, 2),
    course(
      "CS307PC",
      "Object Oriented Programming through Java Lab",
      0,
      0,
      2,
      1,
    ),
    course("CS308PC", "Software Engineering Lab", 0, 0, 2, 1),
    course("CS309PC", "Database Management Systems Lab", 0, 0, 2, 1),
    course("CS310SD", "Node.js, React.js, or Django", 0, 0, 2, 1),
    course("VA300ES", "Environmental Science", 1, 0, 0, 1),
  ],
  [
    course("MA401PC", "Computer Oriented Statistical Methods", 3, 0, 0, 3),
    course("CS402PC", "Operating Systems", 3, 0, 0, 3),
    course("CS403PC", "Algorithm Design and Analysis", 3, 0, 0, 3),
    course("CS404PC", "Computer Networks", 3, 0, 0, 3),
    course("CS405PC", "Machine Learning", 3, 0, 0, 3),
    course("MA406PC", "Computational Mathematics Lab", 0, 0, 2, 1),
    course("CS407PC", "Operating Systems Lab", 0, 0, 2, 1),
    course("CS408PC", "Computer Networks Lab", 0, 0, 2, 1),
    course("CS409PC", "Machine Learning Lab", 0, 0, 2, 1),
    course(
      "CS410SD",
      "Data Visualization with R, Python, or Power BI",
      0,
      0,
      2,
      1,
    ),
  ],
  [
    course("CS501PC", "Automata Theory and Compiler Design", 3, 0, 0, 3),
    course("CS502PC", "Artificial Intelligence", 3, 0, 0, 3),
    course("CS503PC", "DevOps", 3, 0, 0, 3),
    course("CSE-PE1", "Professional Elective I", 3, 0, 0, 3),
    course("CSE-OE1", "Open Elective I", 2, 0, 0, 2),
    course("CS504PC", "Compiler Design Lab", 0, 0, 2, 1),
    course("CS505PC", "Artificial Intelligence with Python Lab", 0, 0, 2, 1),
    course("CS506PC", "DevOps Lab", 0, 0, 2, 1),
    course("CS507PC", "Field-Based Research Project", 0, 0, 4, 2),
    course("CS508SD", "UI Design with Flutter or Android Studio", 0, 0, 2, 1),
    course("VA500HS", "Indian Knowledge System", 1, 0, 0, 1),
  ],
  [
    course("CS601PC", "Cryptography and Network Security", 3, 0, 0, 3),
    course("CS602PC", "Deep Learning", 3, 0, 0, 3),
    course("MS603HS", "Business Economics and Financial Analysis", 3, 0, 0, 3),
    course("CSE-PE2", "Professional Elective II", 3, 0, 0, 3),
    course("CSE-OE2", "Open Elective II", 2, 0, 0, 2),
    course("CS604PC", "Cryptography and Network Security Lab", 0, 0, 2, 1),
    course("CS605PC", "Deep Learning Lab", 0, 0, 2, 1),
    course("CS606PC", "Advanced Data Structures using Python Lab", 0, 0, 2, 1),
    course("EN607HS", "English for Employability Skills Lab", 0, 0, 2, 1),
    course("CS608SD", "Prompt Engineering", 0, 0, 2, 1),
    course(
      "VA600HS",
      "Gender Sensitization and Human Values and Professional Ethics",
      1,
      0,
      0,
      1,
    ),
  ],
  [
    course("CS701PC", "Natural Language Processing", 3, 0, 0, 3),
    course("CS702PC", "Cyber Security", 3, 0, 0, 3),
    course("MS703HS", "Fundamentals of Management", 3, 0, 0, 3),
    course("CSE-PE3", "Professional Elective III", 3, 0, 0, 3),
    course("CSE-PE4", "Professional Elective IV", 3, 0, 0, 3),
    course("CSE-OE3", "Open Elective III", 2, 0, 0, 2),
    course("CS704PC", "Natural Language Processing Lab", 0, 0, 2, 1),
    course("CS705PC", "Cyber Security Lab", 0, 0, 2, 1),
    course(
      "CS706PC",
      "Industry Oriented Mini Project or Internship",
      0,
      0,
      4,
      2,
    ),
  ],
  [
    course("CSE-PE5", "Professional Elective V", 3, 0, 0, 3),
    course("CSE-PE6", "Professional Elective VI", 3, 0, 0, 3),
    course("CS801PC", "Project Work", 0, 0, 42, 14),
  ],
];

function pageAt(index) {
  const markerIndex = sourceText.lastIndexOf("=== PAGE ", index);
  const marker = sourceText.slice(markerIndex, markerIndex + 24);
  return Number(marker.match(/PAGE (\d+)/)?.[1] ?? 1);
}

function detailedSection(code) {
  const heading = new RegExp(`^${code.replaceAll("-", "\\-")}:`, "m");
  const match = heading.exec(sourceText);
  if (!match) return undefined;
  const rest = sourceText.slice(match.index + match[0].length);
  const nextHeading = /^([A-Z]{2,4}\d{3}[A-Z]{2}):/m.exec(rest);
  const end = nextHeading
    ? match.index + match[0].length + nextHeading.index
    : sourceText.length;
  return { start: match.index, text: sourceText.slice(match.index, end) };
}

function cleanUnitTitle(value, fallback) {
  const title = value
    .replace(/\[[0-9]+\]/g, "")
    .replace(/\b[0-9]+\s*(?:L|Hours?)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s:–—-]+|[\s:–—-]+$/g, "")
    .trim();
  return (title || fallback).slice(0, 200);
}

function unitsFor(item, semesterNumber, subjectIndex) {
  const section = detailedSection(item.code);
  const lab = item.p > 0 && item.l === 0;
  const depth = semesterNumber <= 2 ? 0.4 : semesterNumber <= 4 ? 0.55 : 0.7;
  const typeMultiplier = /project|internship/i.test(item.title)
    ? 45
    : lab
      ? 30
      : 15;
  const totalHours = Math.min(Math.max(item.credits * typeMultiplier, 1), 200);
  const matches = section
    ? [
        ...section.text.matchAll(
          /^UNIT\s*[-–—]?\s*(III|IV|II|V|I)\s*[:–—-]?\s*([^\r\n]*)/gim,
        ),
      ]
    : [];
  const unitMatches = matches.slice(0, 5);
  if (!unitMatches.length) {
    const structurePage = semesterNumber <= 2 ? 1 : semesterNumber <= 6 ? 2 : 3;
    const page = section ? pageAt(section.start) : structurePage;
    return [
      {
        number: 1,
        title: lab ? "Practical syllabus" : "Official course scope",
        topics: [
          {
            key: `jntuh.r25.cse.${item.code.toLowerCase().replaceAll("-", ".")}.scope`,
            title: item.title,
            sourcePage: page,
            academicDepth: depth,
            estimatedAcademicHours: totalHours,
            prerequisiteTopicKeys: [],
            lab,
          },
        ],
      },
    ];
  }
  return unitMatches.map((match, unitIndex) => {
    const roman = match[1];
    const absoluteIndex = section.start + (match.index ?? 0);
    const unitTitle = cleanUnitTitle(match[2], `Unit ${roman}`);
    return {
      number: unitIndex + 1,
      title: unitTitle,
      topics: [
        {
          key: `jntuh.r25.cse.${item.code.toLowerCase()}.unit-${unitIndex + 1}`,
          title: unitTitle,
          sourcePage: pageAt(absoluteIndex),
          academicDepth: depth,
          estimatedAcademicHours: Number(
            (totalHours / unitMatches.length).toFixed(2),
          ),
          prerequisiteTopicKeys: [],
          lab,
        },
      ],
    };
  });
}

function subjectType(item) {
  if (item.code.startsWith("CSE-PE") || item.code.startsWith("CSE-OE"))
    return "ELECTIVE";
  if (/project|internship/i.test(item.title)) return "PROJECT";
  if (item.p > 0 && item.l > 0) return "INTEGRATED";
  if (item.p > 0) return "LAB";
  return "THEORY";
}

const payload = {
  schemaVersion: "1.0.0",
  dataset: {
    universityCode: "JNTUH",
    regulationCode: "R25",
    degreeCode: "BTECH",
    branchCode: "CSE",
    datasetVersion: "2026.08.1",
    effectiveFrom: "2025-07-01",
    effectiveTo: null,
    source: {
      documentId: "jntuh-r25-btech-cse-course-structure-v2",
      title:
        "JNTUH B.Tech. Computer Science and Engineering Course Structure and Syllabus (R25)",
      sourceUrl:
        "https://jntuh.ac.in/uploads/academics/R25B.Tech.CSEIIIYearSyllabusV2.pdf",
      sha256:
        "de1e7290f04f8fefdf3f022d4bb73ef62d68b542cfea93e4ab0f3331b35202c8",
      retrievedAt: "2026-08-25T00:00:00Z",
      usagePermission: "PUBLIC_OFFICIAL",
    },
    synthetic: false,
  },
  semesters: semesters.map((items, semesterIndex) => ({
    number: semesterIndex + 1,
    academicYear: Math.ceil((semesterIndex + 1) / 2),
    subjects: items.map((item, subjectIndex) => ({
      code: item.code,
      title: item.title,
      credits: item.credits,
      type: subjectType(item),
      ...(item.l + item.t + item.p <= 40
        ? { contactHoursPerWeek: item.l + item.t + item.p }
        : {}),
      units: unitsFor(item, semesterIndex + 1, subjectIndex),
    })),
  })),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);

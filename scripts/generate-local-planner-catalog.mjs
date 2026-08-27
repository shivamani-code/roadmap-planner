import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const contentDirectory = path.join(repositoryRoot, "content", "production");
const outputFile = path.join(
  repositoryRoot,
  "apps",
  "web",
  "src",
  "data",
  "local-planner-catalog.json",
);

const branchNames = {
  AIDS: "Artificial Intelligence and Data Science",
  AIML: "Artificial Intelligence and Machine Learning",
  BT: "Biotechnology",
  CE: "Civil Engineering",
  CSBS: "Computer Science and Business Systems",
  CSD: "Computer Science and Design",
  CSE: "Computer Science and Engineering",
  CSE_AIML: "CSE (AI and Machine Learning)",
  CSE_CYBER: "CSE (Cyber Security)",
  CSE_DS: "CSE (Data Science)",
  CSE_IOT_CYBER: "CSE (IoT and Cyber Security)",
  CSE_NETWORKS: "CSE (Networks)",
  CSIT: "Computer Science and Information Technology",
  ECE: "Electronics and Communication Engineering",
  IT: "Information Technology",
  ME: "Mechanical Engineering",
  MINING: "Mining Engineering",
};

const readJson = async (file) =>
  JSON.parse(await readFile(path.join(contentDirectory, file), "utf8"));

const files = await readdir(contentDirectory);
const careerFile = files
  .filter((file) => /^career-knowledge-.*\.json$/.test(file))
  .sort()
  .at(-1);
if (!careerFile) throw new Error("Career catalog not found");
const career = await readJson(careerFile);

const curriculumFiles = files.filter(
  (file) =>
    /^jntuh-r25-.*\.json$/.test(file) && !file.includes("career-mappings"),
);
const latestCurriculumByBranch = new Map();
for (const file of curriculumFiles.sort()) {
  const data = await readJson(file);
  latestCurriculumByBranch.set(data.dataset.branchCode, { file, data });
}

const branches = [];
for (const [branchCode, { data }] of latestCurriculumByBranch) {
  const branchSlug = branchCode.toLowerCase().replaceAll("_", "-");
  const mappingFile = files
    .filter((file) =>
      file.startsWith(`jntuh-r25-${branchSlug}-career-mappings-`),
    )
    .sort()
    .at(-1);
  const mappingData = mappingFile
    ? await readJson(mappingFile)
    : { mappings: [] };
  const subjects = data.semesters.flatMap((semester) =>
    semester.subjects.map((subject) => ({
      code: subject.code,
      title: subject.title,
      semester: semester.number,
      topicKeys: subject.units.flatMap((unit) =>
        unit.topics.map((topic) => topic.key),
      ),
    })),
  );
  const subjectByTopic = new Map(
    subjects.flatMap((subject) =>
      subject.topicKeys.map((topicKey) => [topicKey, subject]),
    ),
  );

  branches.push({
    code: branchCode,
    name: branchNames[branchCode] ?? branchCode,
    curriculumVersion: `${data.dataset.universityCode} ${data.dataset.regulationCode} · ${data.dataset.datasetVersion}`,
    availableSemesters: data.semesters.map((semester) => semester.number),
    subjects: subjects.map(({ topicKeys: _topicKeys, ...subject }) => subject),
    mappings: mappingData.mappings.map((mapping) => {
      const subject = subjectByTopic.get(mapping.curriculumTopicKey);
      return {
        skillKey: mapping.skillKey,
        depth: mapping.depth,
        confidence: mapping.confidence,
        subjectCode: subject?.code ?? null,
        subjectTitle: subject?.title ?? null,
        semester: subject?.semester ?? null,
      };
    }),
  });
}

const catalog = {
  version: career.datasetVersion,
  university: {
    code: "JNTUH",
    name: "Jawaharlal Nehru Technological University Hyderabad",
  },
  regulation: { code: "R25", name: "R25" },
  degree: { code: "BTECH", name: "B.Tech" },
  skills: career.skills.map((skill) => ({
    key: skill.key,
    name: skill.name,
    category: skill.category,
  })),
  roles: career.roles.map((role) => ({
    key: role.key,
    name: role.name,
    domainKey: role.domainKey,
    targetLevels: role.targetLevels,
  })),
  branches: branches.sort((left, right) => left.name.localeCompare(right.name)),
};

await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(catalog)}\n`, "utf8");
console.log(`Wrote ${outputFile}`);

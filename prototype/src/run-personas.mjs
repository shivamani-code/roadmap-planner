import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, validatePersonas } from "./content-validation.mjs";
import { analyzePersona } from "./roadmap-engine.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(
  here,
  "../../content/fixtures/personas.synthetic.json",
);
const fixture = readJson(fixturePath);
validatePersonas(fixture);

const results = fixture.personas.map(analyzePersona);
console.table(
  results.map((result) => ({
    persona: result.personaId,
    status: result.status,
    weeklyMinutes: result.maxWeeklyMinutes,
    remainingMinutes: result.requiredRemainingMinutes,
    deficitMinutes: result.deficitMinutes,
    scheduledWeeks: result.schedule.length,
  })),
);

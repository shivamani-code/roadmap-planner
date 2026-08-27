import { createHash } from "node:crypto";

export type AiUseCase = "ROADMAP_EXPLANATION" | "WEEKLY_COACHING";

export interface GroundedExplanation {
  headline: string;
  summary: string;
  focusItems: Array<{
    id: string;
    text: string;
  }>;
}

export interface AiProviderRequest {
  useCase: AiUseCase;
  promptVersion: string;
  instructions: string;
  facts: Record<string, unknown>;
  allowedIds: string[];
  outputSchema: Record<string, unknown>;
}

export interface AiProviderResponse {
  provider: string;
  model: string;
  output: unknown;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AiProvider {
  generate(request: AiProviderRequest): Promise<AiProviderResponse>;
}

export interface AiGatewayResult {
  explanation: GroundedExplanation;
  source: "GENERATED" | "FALLBACK";
  provider: string;
  model: string;
  promptVersion: string;
  inputHash: string;
  latencyMs: number;
  fallbackReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  minimizedFacts: Record<string, unknown>;
}

const prohibitedKey =
  /(^|_)(email|normalized_?email|roll_?(number)?|college_?(name)?|task_?note|private_?note|free_?text|artifact_?(url)?|token|secret|password|avatar_?(url)?|display_?name)($|_)/i;
const emailPattern = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
const unsafeTextPattern =
  /https?:\/\/|ignore (all |the )?(previous|above)|system prompt|developer message|<script|javascript:/i;

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string")
    return value.replace(emailPattern, "[REDACTED_EMAIL]").slice(0, 1000);
  if (typeof value === "number" || typeof value === "boolean" || value === null)
    return value;
  if (Array.isArray(value)) return value.slice(0, 100).map(sanitizeValue);
  if (typeof value !== "object") return undefined;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(
        ([key]) =>
          !prohibitedKey.test(key.replaceAll(/([a-z])([A-Z])/g, "$1_$2")),
      )
      .map(([key, item]) => [key, sanitizeValue(item)])
      .filter((entry): entry is [string, unknown] => entry[1] !== undefined),
  );
}

export function minimizeAiFacts(
  facts: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeValue(facts) as Record<string, unknown>;
}

export function communicationInputHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function validateGroundedExplanation(
  value: unknown,
  allowedIds: readonly string[],
):
  | { valid: true; value: GroundedExplanation }
  | { valid: false; reason: string } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { valid: false, reason: "OUTPUT_NOT_OBJECT" };
  const output = value as Record<string, unknown>;
  if (
    typeof output.headline !== "string" ||
    output.headline.length < 3 ||
    output.headline.length > 100 ||
    typeof output.summary !== "string" ||
    output.summary.length < 10 ||
    output.summary.length > 500 ||
    !Array.isArray(output.focusItems) ||
    output.focusItems.length > 5
  )
    return { valid: false, reason: "OUTPUT_SCHEMA_INVALID" };
  const allowed = new Set(allowedIds);
  const seen = new Set<string>();
  const focusItems: GroundedExplanation["focusItems"] = [];
  for (const item of output.focusItems) {
    if (!item || typeof item !== "object" || Array.isArray(item))
      return { valid: false, reason: "OUTPUT_SCHEMA_INVALID" };
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.id !== "string" ||
      !allowed.has(candidate.id) ||
      seen.has(candidate.id)
    )
      return { valid: false, reason: "UNSUPPORTED_ID" };
    if (
      typeof candidate.text !== "string" ||
      candidate.text.length < 3 ||
      candidate.text.length > 240
    )
      return { valid: false, reason: "OUTPUT_SCHEMA_INVALID" };
    focusItems.push({ id: candidate.id, text: candidate.text });
    seen.add(candidate.id);
  }
  const allText = [
    output.headline,
    output.summary,
    ...focusItems.map(({ text }) => text),
  ].join(" ");
  if (/\d/.test(allText))
    return { valid: false, reason: "UNSUPPORTED_NUMERIC_CLAIM" };
  if (unsafeTextPattern.test(allText))
    return { valid: false, reason: "UNSAFE_OUTPUT" };
  return {
    valid: true,
    value: {
      headline: output.headline,
      summary: output.summary,
      focusItems,
    },
  };
}

export const explanationOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "focusItems"],
  properties: {
    headline: { type: "string", minLength: 3, maxLength: 100 },
    summary: { type: "string", minLength: 10, maxLength: 500 },
    focusItems: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text"],
        properties: {
          id: { type: "string" },
          text: { type: "string", minLength: 3, maxLength: 240 },
        },
      },
    },
  },
} as const;

const approvedInstructions: Record<AiUseCase, string> = {
  ROADMAP_EXPLANATION:
    "Rewrite only the supplied roadmap facts in supportive plain English. Select only allowed milestone IDs. Do not add numbers, dates, URLs, requirements, resources, or predictions.",
  WEEKLY_COACHING:
    "Rewrite only the supplied progress facts in supportive plain English. Select only allowed task IDs. Do not add numbers, dates, URLs, requirements, resources, blame, or predictions.",
};

export async function runAiGateway(input: {
  useCase: AiUseCase;
  promptVersion: string;
  facts: Record<string, unknown>;
  allowedIds: string[];
  fallback: GroundedExplanation;
  provider?: AiProvider;
  timeoutMs?: number;
  now?: () => number;
}): Promise<AiGatewayResult> {
  const now = input.now ?? (() => Date.now());
  const startedAt = now();
  const minimizedFacts = minimizeAiFacts(input.facts);
  const inputHash = communicationInputHash({
    useCase: input.useCase,
    promptVersion: input.promptVersion,
    facts: minimizedFacts,
    allowedIds: [...input.allowedIds].sort(),
  });
  const fallback = (reason: string, provider = "disabled", model = "none") => ({
    explanation: input.fallback,
    source: "FALLBACK" as const,
    provider,
    model,
    promptVersion: input.promptVersion,
    inputHash,
    latencyMs: Math.max(0, now() - startedAt),
    fallbackReason: reason,
    inputTokens: null,
    outputTokens: null,
    minimizedFacts,
  });
  if (!input.provider) return fallback("PROVIDER_DISABLED");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      input.provider.generate({
        useCase: input.useCase,
        promptVersion: input.promptVersion,
        instructions: approvedInstructions[input.useCase],
        facts: minimizedFacts,
        allowedIds: [...input.allowedIds],
        outputSchema: explanationOutputSchema,
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("AI_PROVIDER_TIMEOUT")),
          input.timeoutMs ?? 5000,
        );
      }),
    ]);
    const validation = validateGroundedExplanation(
      response.output,
      input.allowedIds,
    );
    if (!validation.valid)
      return fallback(validation.reason, response.provider, response.model);
    return {
      explanation: validation.value,
      source: "GENERATED",
      provider: response.provider,
      model: response.model,
      promptVersion: input.promptVersion,
      inputHash,
      latencyMs: Math.max(0, now() - startedAt),
      fallbackReason: null,
      inputTokens: response.inputTokens ?? null,
      outputTokens: response.outputTokens ?? null,
      minimizedFacts,
    };
  } catch (error) {
    return fallback(
      error instanceof Error && error.message === "AI_PROVIDER_TIMEOUT"
        ? "PROVIDER_TIMEOUT"
        : "PROVIDER_ERROR",
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export type NotificationType =
  | "TODAY_PLAN"
  | "MISSED_PLAN"
  | "WEEKLY_REVIEW"
  | "UPCOMING_EXAM"
  | "MILESTONE"
  | "PLACEMENT_CHECKPOINT";

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function localDateTime(
  instant: Date,
  timeZone: string,
): { date: string; minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    part("weekday"),
  );
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    minute: Number(part("hour")) * 60 + Number(part("minute")),
    weekday,
  };
}

export function isInQuietHours(input: {
  instant: Date;
  timeZone: string;
  enabled: boolean;
  startMinute: number;
  endMinute: number;
}): boolean {
  if (!input.enabled || input.startMinute === input.endMinute) return false;
  const minute = localDateTime(input.instant, input.timeZone).minute;
  return input.startMinute < input.endMinute
    ? minute >= input.startMinute && minute < input.endMinute
    : minute >= input.startMinute || minute < input.endMinute;
}

export function notificationDedupeKey(
  userId: string,
  type: NotificationType,
  parts: readonly (string | number)[],
): string {
  const scope = parts.map(String).join(":");
  return `${type}:${communicationInputHash({ userId, scope }).slice(0, 32)}`;
}

export function notificationDeliveryDecision(input: {
  now: Date;
  timeZone: string;
  quietHoursEnabled: boolean;
  quietStartMinute: number;
  quietEndMinute: number;
  lastActiveAt: Date | null;
  suppressWhenRecentlyActive: boolean;
}): { deliver: true } | { deliver: false; reason: string } {
  if (
    isInQuietHours({
      instant: input.now,
      timeZone: input.timeZone,
      enabled: input.quietHoursEnabled,
      startMinute: input.quietStartMinute,
      endMinute: input.quietEndMinute,
    })
  )
    return { deliver: false, reason: "QUIET_HOURS" };
  if (
    input.suppressWhenRecentlyActive &&
    input.lastActiveAt &&
    input.now.getTime() - input.lastActiveAt.getTime() < 30 * 60_000
  )
    return { deliver: false, reason: "RECENTLY_ACTIVE" };
  return { deliver: true };
}

export function daysUntil(startDate: string, targetDate: string): number {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const target = new Date(`${targetDate}T00:00:00.000Z`);
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

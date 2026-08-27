import { randomBytes } from "node:crypto";

export class DomainInvariantError extends Error {
  override readonly name = "DomainInvariantError";
}

export function assertInvariant(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) throw new DomainInvariantError(message);
}

export function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  assertInvariant(
    normalized.length >= 3 && normalized.length <= 320,
    "Email length is invalid",
  );
  assertInvariant(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized),
    "Email is invalid",
  );
  return normalized;
}

export function uuidV7(
  now = Date.now(),
  random: Uint8Array = randomBytes(10),
): string {
  assertInvariant(
    Number.isSafeInteger(now) && now >= 0 && now <= 0xffffffffffff,
    "UUID timestamp is invalid",
  );
  assertInvariant(
    random.length >= 10,
    "UUID randomness requires at least 10 bytes",
  );
  const bytes = new Uint8Array(16);
  let timestamp = BigInt(now);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }
  bytes[6] = 0x70 | (random[0]! & 0x0f);
  bytes[7] = random[1]!;
  bytes[8] = 0x80 | (random[2]! & 0x3f);
  bytes.set(random.subarray(3, 10), 9);
  const hex = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function sha256Input(value: string): string {
  // The database/auth infrastructure owns cryptographic hashing. This helper intentionally
  // exists only as a branded input boundary so domain code never stores raw tokens.
  assertInvariant(value.length > 0, "Hash input must not be empty");
  return value;
}

export type UserStatus =
  "ACTIVE" | "SUSPENDED" | "DELETION_PENDING" | "DELETED";

const USER_TRANSITIONS: Readonly<Record<UserStatus, readonly UserStatus[]>> = {
  ACTIVE: ["SUSPENDED", "DELETION_PENDING"],
  SUSPENDED: ["ACTIVE", "DELETION_PENDING"],
  DELETION_PENDING: ["ACTIVE", "DELETED"],
  DELETED: [],
};

export function assertUserTransition(from: UserStatus, to: UserStatus): void {
  assertInvariant(
    USER_TRANSITIONS[from].includes(to),
    `Invalid user transition: ${from} -> ${to}`,
  );
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface DomainEvent<TPayload extends JsonObject = JsonObject> {
  readonly id: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly type: string;
  readonly occurredAt: Date;
  readonly payload: TPayload;
}

export function createDomainEvent<TPayload extends JsonObject>(
  input: Omit<DomainEvent<TPayload>, "id" | "occurredAt"> & {
    id?: string;
    occurredAt?: Date;
  },
): DomainEvent<TPayload> {
  return {
    id: input.id ?? uuidV7(),
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    type: input.type,
    occurredAt: input.occurredAt ?? new Date(),
    payload: input.payload,
  };
}

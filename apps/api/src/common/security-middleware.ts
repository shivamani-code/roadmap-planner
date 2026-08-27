import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AppConfig } from "../config/app-config.js";
import type { RequestWithContext } from "./request-context.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_EXEMPT_PATHS = new Set([
  "/api/v1/auth/magic-links",
  "/api/v1/auth/magic-links/verify",
]);

interface LimitTier {
  readonly name: string;
  readonly limit: number;
  readonly windowMs: number;
}

interface Counter {
  count: number;
  resetAt: number;
}

function cookie(request: Request, name: string): string | undefined {
  const prefix = `${name}=`;
  const item = request
    .header("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!item) return undefined;
  try {
    return decodeURIComponent(item.slice(prefix.length));
  } catch {
    return undefined;
  }
}

function problem(
  request: Request,
  response: Response,
  status: number,
  code: string,
  detail: string,
): void {
  const correlationId =
    (request as Partial<RequestWithContext>).correlationId ?? randomUUID();
  response.setHeader("x-request-id", correlationId);
  response
    .status(status)
    .type("application/problem+json")
    .json({
      type: `https://studentos.app/problems/${code.toLowerCase().replaceAll("_", "-")}`,
      title: status === 403 ? "Forbidden" : "Too Many Requests",
      status,
      code,
      detail,
      instance: request.originalUrl,
      correlationId,
    });
}

function sameValue(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function createCsrfMiddleware(config: AppConfig): RequestHandler {
  const trustedOrigins = new Set([config.WEB_ORIGIN, config.ADMIN_ORIGIN]);
  return (request: Request, response: Response, next: NextFunction): void => {
    if (
      !config.CSRF_ENABLED ||
      SAFE_METHODS.has(request.method) ||
      CSRF_EXEMPT_PATHS.has(request.path) ||
      request.header("authorization")?.startsWith("Bearer ") ||
      !cookie(request, "studentos_session")
    ) {
      next();
      return;
    }
    const origin = request.header("origin");
    if (origin && !trustedOrigins.has(origin)) {
      problem(
        request,
        response,
        403,
        "CSRF_ORIGIN_REJECTED",
        "The request origin is not allowed",
      );
      return;
    }
    const csrfCookie = cookie(request, "studentos_csrf");
    const csrfHeader = request.header("x-studentos-csrf");
    if (
      !csrfCookie ||
      !csrfHeader ||
      csrfCookie.length < 32 ||
      !sameValue(csrfCookie, csrfHeader)
    ) {
      problem(
        request,
        response,
        403,
        "CSRF_TOKEN_INVALID",
        "A valid CSRF token is required",
      );
      return;
    }
    next();
  };
}

function tierFor(request: Request): LimitTier {
  const path = request.path;
  if (path === "/api/v1/auth/magic-links")
    return { name: "auth-request", limit: 5, windowMs: 15 * 60_000 };
  if (path === "/api/v1/auth/magic-links/verify")
    return { name: "auth-verify", limit: 10, windowMs: 15 * 60_000 };
  if (path.includes("/roadmaps/generate"))
    return { name: "generation", limit: 5, windowMs: 60_000 };
  if (path.includes("/privacy/"))
    return { name: "privacy", limit: 3, windowMs: 60 * 60_000 };
  if (
    path.startsWith("/api/v1/communication/") ||
    path.startsWith("/api/v1/notifications")
  )
    return { name: "communication", limit: 60, windowMs: 60_000 };
  return { name: "default", limit: 300, windowMs: 60_000 };
}

export class ApplicationRateLimiter {
  readonly #counters = new Map<string, Counter>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  middleware(config: AppConfig): RequestHandler {
    return (request: Request, response: Response, next: NextFunction): void => {
      if (!config.RATE_LIMIT_ENABLED) {
        next();
        return;
      }
      if (
        config.NODE_ENV !== "production" &&
        config.ALLOW_DEV_AUTH &&
        CSRF_EXEMPT_PATHS.has(request.path)
      ) {
        next();
        return;
      }
      const now = this.#now();
      const tier = tierFor(request);
      const session = cookie(request, "studentos_session");
      const sessionKey = session
        ? createHash("sha256").update(session).digest("hex").slice(0, 24)
        : undefined;
      const keys = [
        `${tier.name}:ip:${request.ip ?? request.socket.remoteAddress ?? "unknown"}`,
        ...(sessionKey ? [`${tier.name}:session:${sessionKey}`] : []),
      ];
      let retryAfterSeconds = 0;
      for (const key of keys) {
        const current = this.#counters.get(key);
        if (!current || current.resetAt <= now) {
          this.#counters.set(key, { count: 1, resetAt: now + tier.windowMs });
          continue;
        }
        current.count += 1;
        if (current.count > tier.limit)
          retryAfterSeconds = Math.max(
            retryAfterSeconds,
            Math.ceil((current.resetAt - now) / 1000),
          );
      }
      if (this.#counters.size > 10_000)
        for (const [key, value] of this.#counters)
          if (value.resetAt <= now) this.#counters.delete(key);
      if (retryAfterSeconds > 0) {
        response.setHeader("Retry-After", String(retryAfterSeconds));
        problem(
          request,
          response,
          429,
          "RATE_LIMITED",
          "Too many requests; retry after the indicated delay",
        );
        return;
      }
      next();
    };
  }
}

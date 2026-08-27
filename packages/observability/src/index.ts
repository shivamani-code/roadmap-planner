import { context, SpanStatusCode, trace, type Span } from "@opentelemetry/api";
import pino, {
  type DestinationStream,
  type Logger,
  type LevelWithSilent,
} from "pino";

export const REDACTED_LOG_PATHS = [
  "authorization",
  "cookie",
  "email",
  "password",
  "payload",
  "token",
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
] as const;

export interface LoggerOptions {
  service: string;
  environment: string;
  level?: LevelWithSilent;
  destination?: DestinationStream;
}

export function createLogger(options: LoggerOptions): Logger {
  const configuration = {
    base: { service: options.service, environment: options.environment },
    level: options.level ?? "info",
    redact: { paths: [...REDACTED_LOG_PATHS], censor: "[REDACTED]" },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  return options.destination
    ? pino(configuration, options.destination)
    : pino(configuration);
}

export async function withSpan<T>(
  tracerName: string,
  spanName: string,
  operation: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer(tracerName);
  return tracer.startActiveSpan(spanName, async (span) => {
    try {
      return await context.with(trace.setSpan(context.active(), span), () =>
        operation(span),
      );
    } catch (error) {
      span.recordException(
        error instanceof Error ? error : new Error("Unknown operation failure"),
      );
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}

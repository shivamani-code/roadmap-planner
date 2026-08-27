import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { ProblemDetail } from "@studentos/contracts";
import type { RequestWithContext } from "./request-context.js";

interface ExceptionBody {
  readonly code?: string;
  readonly message?: string | readonly string[];
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>() as RequestWithContext;
    const response = context.getResponse<Response>();
    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const rawBody = isHttp ? exception.getResponse() : undefined;
    const body =
      typeof rawBody === "object" && rawBody !== null
        ? (rawBody as ExceptionBody)
        : undefined;
    const rawMessage =
      body?.message ??
      (isHttp ? exception.message : "An unexpected error occurred");
    const message =
      typeof rawMessage === "string" ? rawMessage : rawMessage.join("; ");
    const code =
      body?.code ?? (status === 500 ? "INTERNAL_ERROR" : `HTTP_${status}`);
    const title = HttpStatus[status] ?? "Request failed";
    const problem: ProblemDetail = {
      type: `https://studentos.app/problems/${code.toLowerCase().replaceAll("_", "-")}`,
      title,
      status,
      code,
      detail: status === 500 ? "The request could not be completed." : message,
      instance: request.originalUrl,
      correlationId: request.correlationId,
    };
    response.status(status).type("application/problem+json").json(problem);
  }
}

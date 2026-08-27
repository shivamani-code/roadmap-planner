import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export interface RequestWithContext extends Request {
  correlationId: string;
}

export function requestContext(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const supplied = request.header("x-request-id");
  const correlationId =
    supplied && /^[A-Za-z0-9._-]{1,128}$/.test(supplied)
      ? supplied
      : randomUUID();
  (request as RequestWithContext).correlationId = correlationId;
  response.setHeader("x-request-id", correlationId);
  next();
}

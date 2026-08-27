import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import type { PublicUser } from "@studentos/contracts";
import { IdentityService } from "./identity.service.js";

export interface AuthenticatedRequest extends Request {
  user: PublicUser;
  sessionToken: string;
}

function sessionFromRequest(request: Request): string | null {
  const authorization = request.header("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
  const cookie = request
    .header("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("studentos_session="));
  return cookie
    ? decodeURIComponent(cookie.slice("studentos_session=".length))
    : null;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly identity: IdentityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = sessionFromRequest(request);
    if (!token)
      throw new UnauthorizedException({
        code: "SESSION_REQUIRED",
        message: "Sign in is required",
      });
    const user = await this.identity.authenticate(token);
    Object.assign(request, { user, sessionToken: token });
    return true;
  }
}

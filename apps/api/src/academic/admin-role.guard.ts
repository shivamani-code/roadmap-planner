import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  type CustomDecorator,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AdminRole } from "@studentos/database";
import { DatabaseService } from "../config/database.service.js";
import type { AuthenticatedRequest } from "../identity/session-auth.guard.js";

const ADMIN_ROLES = "studentos.adminRoles";

export function RequireAdminRoles(
  ...roles: AdminRole[]
): CustomDecorator<string> {
  return SetMetadata(ADMIN_ROLES, roles);
}

@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<AdminRole[]>(ADMIN_ROLES, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const membership = await this.database.client.adminMembership.findUnique({
      where: { userId: request.user.id },
    });
    if (
      !membership?.active ||
      (!required.includes(membership.role) && membership.role !== "SUPER_ADMIN")
    ) {
      throw new ForbiddenException({
        code: "ADMIN_ROLE_REQUIRED",
        message: "This content operation requires an authorized admin role",
      });
    }
    return true;
  }
}

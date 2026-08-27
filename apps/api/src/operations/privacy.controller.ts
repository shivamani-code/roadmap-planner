import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  ParseUUIDPipe,
  Put,
  Req,
  Res,
  UseGuards,
  Param,
} from "@nestjs/common";
import { Equals, IsBoolean } from "class-validator";
import type { Response } from "express";
import type { RequestWithContext } from "../common/request-context.js";
import {
  SessionAuthGuard,
  type AuthenticatedRequest,
} from "../identity/session-auth.guard.js";
import { PrivacyService } from "./privacy.service.js";
import {
  AdminRoleGuard,
  RequireAdminRoles,
} from "../academic/admin-role.guard.js";

class PrivacyPreferenceDto {
  @IsBoolean()
  analyticsConsent!: boolean;
}

class AccountDeletionDto {
  @Equals("DELETE MY ACCOUNT")
  confirmation!: string;
}

@Controller("privacy")
@UseGuards(SessionAuthGuard)
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get("preferences")
  preferences(@Req() request: AuthenticatedRequest) {
    return this.privacy.preferences(request.user.id);
  }

  @Put("preferences")
  updatePreferences(
    @Body() body: PrivacyPreferenceDto,
    @Req() request: AuthenticatedRequest & RequestWithContext,
  ) {
    return this.privacy.updatePreferences(
      request.user.id,
      body.analyticsConsent,
      request.correlationId,
    );
  }

  @Get("export")
  async exportAccount(
    @Req() request: AuthenticatedRequest & RequestWithContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader(
      "content-disposition",
      'attachment; filename="studentos-data-export.json"',
    );
    response.setHeader("cache-control", "no-store");
    return this.privacy.exportAccount(request.user.id, request.correlationId);
  }

  @Post("account-deletion")
  @HttpCode(202)
  async requestDeletion(
    @Body() _body: AccountDeletionDto,
    @Req() request: AuthenticatedRequest & RequestWithContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.privacy.requestDeletion(
      request.user.id,
      request.correlationId,
    );
    response.clearCookie("studentos_session", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
    response.clearCookie("studentos_csrf", {
      path: "/",
      sameSite: "strict",
    });
    return result;
  }
}

@Controller("admin/privacy")
@UseGuards(SessionAuthGuard, AdminRoleGuard)
export class AdminPrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Post("accounts/:id/recover")
  @RequireAdminRoles("SUPPORT")
  recover(
    @Param("id", new ParseUUIDPipe()) userId: string,
    @Req() request: AuthenticatedRequest & RequestWithContext,
  ) {
    return this.privacy.recoverAccount(
      request.user.id,
      userId,
      request.correlationId,
    );
  }
}

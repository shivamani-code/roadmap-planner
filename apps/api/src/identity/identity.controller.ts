import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { IsEmail, IsString, MinLength } from "class-validator";
import type { Response } from "express";
import type { PublicUser } from "@studentos/contracts";
import {
  IdentityService,
  type MagicLinkRequestResult,
} from "./identity.service.js";
import {
  SessionAuthGuard,
  type AuthenticatedRequest,
} from "./session-auth.guard.js";

class RequestMagicLinkDto {
  @IsEmail()
  email!: string;
}

class VerifyMagicLinkDto {
  @IsString()
  @MinLength(20)
  token!: string;
}

@Controller("auth")
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Post("magic-links")
  @HttpCode(202)
  requestMagicLink(
    @Body() body: RequestMagicLinkDto,
  ): Promise<MagicLinkRequestResult> {
    return this.identity.requestMagicLink(body.email);
  }

  @Post("magic-links/verify")
  @HttpCode(200)
  async verifyMagicLink(
    @Body() body: VerifyMagicLinkDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: PublicUser; expiresAt: string }> {
    const session = await this.identity.verifyMagicLink(body.token);
    response.cookie("studentos_session", session.token, {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
    });
    response.cookie("studentos_csrf", session.csrfToken, {
      httpOnly: false,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "strict",
      path: "/",
      expires: session.expiresAt,
    });
    return { user: session.user, expiresAt: session.expiresAt.toISOString() };
  }

  @Get("me")
  @UseGuards(SessionAuthGuard)
  me(@Req() request: AuthenticatedRequest): PublicUser {
    return request.user;
  }

  @Post("logout")
  @HttpCode(204)
  @UseGuards(SessionAuthGuard)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.identity.revoke(request.sessionToken);
    response.clearCookie("studentos_session", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
    response.clearCookie("studentos_csrf", {
      path: "/",
      sameSite: "strict",
    });
  }
}

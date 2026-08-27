import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  SessionAuthGuard,
  type AuthenticatedRequest,
} from "../identity/session-auth.guard.js";
import type { RequestWithContext } from "../common/request-context.js";
import { CommunicationService } from "./communication.service.js";

const notificationTypes = [
  "TODAY_PLAN",
  "MISSED_PLAN",
  "WEEKLY_REVIEW",
  "UPCOMING_EXAM",
  "MILESTONE",
  "PLACEMENT_CHECKPOINT",
] as const;

class TypePreferenceDto {
  @IsIn(notificationTypes)
  type!: (typeof notificationTypes)[number];

  @IsBoolean()
  inAppEnabled!: boolean;

  @IsBoolean()
  emailEnabled!: boolean;
}

class CommunicationPreferenceDto {
  @IsString()
  @MaxLength(64)
  timezone!: string;

  @IsInt()
  @Min(0)
  @Max(1439)
  dailyReminderMinute!: number;

  @IsBoolean()
  quietHoursEnabled!: boolean;

  @IsInt()
  @Min(0)
  @Max(1439)
  quietStartMinute!: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  quietEndMinute!: number;

  @IsBoolean()
  aiProcessingConsent!: boolean;

  @IsArray()
  @ArrayMinSize(6)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => TypePreferenceDto)
  types!: TypePreferenceDto[];
}

@Controller()
@UseGuards(SessionAuthGuard)
export class CommunicationController {
  constructor(private readonly communication: CommunicationService) {}

  @Get("communication/roadmap-explanation")
  roadmapExplanation(@Req() request: AuthenticatedRequest) {
    return this.communication.roadmapExplanation(request.user.id);
  }

  @Get("communication/weekly-coaching")
  weeklyCoaching(
    @Query("weekStart") weekStart: string | undefined,
    @Req() request: AuthenticatedRequest & RequestWithContext,
  ) {
    return this.communication.weeklyCoaching(request.user.id, weekStart);
  }

  @Get("communication/preferences")
  preferences(@Req() request: AuthenticatedRequest) {
    return this.communication.preferences(request.user.id);
  }

  @Put("communication/preferences")
  updatePreferences(
    @Body() body: CommunicationPreferenceDto,
    @Req() request: AuthenticatedRequest & RequestWithContext,
  ) {
    return this.communication.updatePreferences(
      request.user.id,
      body,
      request.correlationId,
    );
  }

  @Post("notifications/activity")
  recordActivity(@Req() request: AuthenticatedRequest) {
    return this.communication.recordActivity(request.user.id);
  }

  @Get("notifications")
  listNotifications(
    @Query("unread") unread: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.communication.listNotifications(
      request.user.id,
      unread === "true",
    );
  }

  @Patch("notifications/:id/read")
  markRead(
    @Param("id") notificationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.communication.markRead(request.user.id, notificationId);
  }
}

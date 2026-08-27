import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  AdminRoleGuard,
  RequireAdminRoles,
} from "../academic/admin-role.guard.js";
import {
  SessionAuthGuard,
  type AuthenticatedRequest,
} from "../identity/session-auth.guard.js";
import { PilotService } from "./pilot.service.js";

const feedbackSurfaces = [
  "CURRICULUM_MAPPING",
  "WEEKLY_PLAN",
  "ROADMAP",
  "TODAY",
  "OVERALL",
] as const;

class PilotFeedbackDto {
  @IsIn(feedbackSurfaces)
  surface!: (typeof feedbackSurfaces)[number];

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

@Controller("pilot/feedback")
@UseGuards(SessionAuthGuard)
export class PilotFeedbackController {
  constructor(private readonly pilot: PilotService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.pilot.listFeedback(request.user.id);
  }

  @Post()
  add(@Body() body: PilotFeedbackDto, @Req() request: AuthenticatedRequest) {
    return this.pilot.addFeedback(request.user.id, body);
  }
}

@Controller("admin/pilot")
@UseGuards(SessionAuthGuard, AdminRoleGuard)
export class PilotAdminController {
  constructor(private readonly pilot: PilotService) {}

  @Get("metrics")
  @RequireAdminRoles("ANALYST", "SUPPORT")
  metrics(@Query("since") since: string | undefined) {
    return this.pilot.metrics(since);
  }
}

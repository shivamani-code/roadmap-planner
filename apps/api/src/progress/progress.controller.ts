import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import {
  AdminRoleGuard,
  RequireAdminRoles,
} from "../academic/admin-role.guard.js";
import type { RequestWithContext } from "../common/request-context.js";
import {
  SessionAuthGuard,
  type AuthenticatedRequest,
} from "../identity/session-auth.guard.js";
import { ProgressReadinessService } from "./progress-readiness.service.js";
import { ProjectService } from "./project.service.js";

class ProjectImportDto {
  @IsObject()
  payload!: object;
}

class StartProjectDto {
  @IsUUID()
  templateId!: string;
}

class SubmitMilestoneDto {
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(2048)
  artifactUrl!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  note!: string;
}

class ReviewMilestoneDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  rubricScore!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  note!: string;
}

class PlacementProfileDto {
  @IsBoolean()
  resumeComplete!: boolean;

  @IsBoolean()
  profileComplete!: boolean;
}

@Controller("admin/projects")
@UseGuards(SessionAuthGuard, AdminRoleGuard)
export class ProjectAdminController {
  constructor(private readonly projects: ProjectService) {}

  @Post("imports")
  @HttpCode(201)
  @RequireAdminRoles("CONTENT_EDITOR")
  stage(@Body() body: ProjectImportDto, @Req() request: AuthenticatedRequest) {
    return this.projects.stage(request.user.id, body.payload);
  }

  @Post("imports/:id/publish")
  @RequireAdminRoles("CONTENT_REVIEWER")
  publish(
    @Param("id") importId: string,
    @Req() request: AuthenticatedRequest & RequestWithContext,
  ) {
    return this.projects.publish(
      importId,
      request.user.id,
      request.correlationId,
    );
  }

  @Post("milestones/:id/review")
  @RequireAdminRoles("CONTENT_REVIEWER")
  review(
    @Param("id") progressId: string,
    @Body() body: ReviewMilestoneDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.projects.reviewMilestone(
      request.user.id,
      progressId,
      body.rubricScore,
      body.note,
    );
  }
}

@Controller("projects")
@UseGuards(SessionAuthGuard)
export class ProjectController {
  constructor(private readonly projects: ProjectService) {}

  @Get("recommendations")
  recommendations(@Req() request: AuthenticatedRequest) {
    return this.projects.recommendations(request.user.id);
  }
}

@Controller("student-projects")
@UseGuards(SessionAuthGuard)
export class StudentProjectController {
  constructor(private readonly projects: ProjectService) {}

  @Post()
  start(@Body() body: StartProjectDto, @Req() request: AuthenticatedRequest) {
    return this.projects.start(request.user.id, body.templateId);
  }

  @Get("active")
  active(@Req() request: AuthenticatedRequest) {
    return this.projects.active(request.user.id);
  }

  @Post("milestones/:id/submissions")
  submit(
    @Param("id") progressId: string,
    @Body() body: SubmitMilestoneDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.projects.submitMilestone(
      request.user.id,
      progressId,
      body.artifactUrl,
      body.note,
    );
  }
}

@Controller()
@UseGuards(SessionAuthGuard)
export class ProgressController {
  constructor(private readonly progressService: ProgressReadinessService) {}

  @Get("progress")
  progress(
    @Query("days") days: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.progressService.progress(
      request.user.id,
      days === undefined ? 28 : Number(days),
    );
  }

  @Get("skills")
  skills(@Req() request: AuthenticatedRequest) {
    return this.progressService.skills(request.user.id);
  }

  @Get("skills/:id")
  skill(@Param("id") skillId: string, @Req() request: AuthenticatedRequest) {
    return this.progressService.skill(request.user.id, skillId);
  }

  @Get("placement-readiness")
  readiness(@Req() request: AuthenticatedRequest) {
    return this.progressService.readiness(request.user.id);
  }

  @Put("placement-profile")
  placementProfile(
    @Body() body: PlacementProfileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.progressService.updatePlacementProfile(request.user.id, body);
  }

  @Get("placement-profile")
  currentPlacementProfile(@Req() request: AuthenticatedRequest) {
    return this.progressService.placementProfile(request.user.id);
  }
}

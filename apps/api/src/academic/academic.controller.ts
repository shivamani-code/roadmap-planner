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
  IsDateString,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from "class-validator";
import type {
  AcademicOption,
  AcademicProfileResponse,
} from "@studentos/contracts";
import { AcademicService, type ImportResult } from "./academic.service.js";
import { AdminRoleGuard, RequireAdminRoles } from "./admin-role.guard.js";
import {
  SessionAuthGuard,
  type AuthenticatedRequest,
} from "../identity/session-auth.guard.js";
import type { RequestWithContext } from "../common/request-context.js";

class AcademicOptionsQuery {
  @IsOptional()
  @IsUUID()
  universityId?: string;

  @IsOptional()
  @IsUUID()
  regulationId?: string;

  @IsOptional()
  @IsUUID()
  degreeId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

class AcademicProfileDto {
  @IsUUID()
  curriculumProgramId!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  currentSemester!: number;

  @IsDateString({ strict: true })
  expectedGraduation!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10)
  cgpa?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  backlogCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  lockVersion?: number;
}

class CurriculumImportDto {
  @IsObject()
  payload!: object;
}

@Controller("catalog")
export class AcademicCatalogController {
  constructor(private readonly academic: AcademicService) {}

  @Get("academic-options")
  list(@Query() query: AcademicOptionsQuery): Promise<AcademicOption[]> {
    return this.academic.listOptions(query);
  }
}

@Controller("onboarding")
export class AcademicOnboardingController {
  constructor(private readonly academic: AcademicService) {}

  @Put("academic-profile")
  @UseGuards(SessionAuthGuard)
  saveProfile(
    @Body() body: AcademicProfileDto,
    @Req() request: AuthenticatedRequest & RequestWithContext,
  ): Promise<AcademicProfileResponse> {
    return this.academic.upsertProfile(
      request.user.id,
      body,
      request.correlationId,
    );
  }
}

@Controller("admin/curriculum")
@UseGuards(SessionAuthGuard, AdminRoleGuard)
export class CurriculumAdminController {
  constructor(private readonly academic: AcademicService) {}

  @Post("imports")
  @HttpCode(201)
  @RequireAdminRoles("CONTENT_EDITOR")
  stage(
    @Body() body: CurriculumImportDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ImportResult> {
    return this.academic.stageImport(body.payload, request.user.id);
  }

  @Post("imports/:id/publish")
  @HttpCode(200)
  @RequireAdminRoles("CONTENT_REVIEWER")
  publish(
    @Param("id") importId: string,
    @Req() request: AuthenticatedRequest & RequestWithContext,
  ): Promise<{ programId: string; status: "PUBLISHED" }> {
    return this.academic.publishImport(
      importId,
      request.user.id,
      request.correlationId,
    );
  }
}

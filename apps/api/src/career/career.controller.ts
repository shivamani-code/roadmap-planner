import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from "class-validator";
import type {
  CareerGoalResponse,
  CareerRoleOption,
  StudentCareerCatalog,
  TargetLevel,
} from "@studentos/contracts";
import { CareerService, type CareerImportResult } from "./career.service.js";
import {
  AdminRoleGuard,
  RequireAdminRoles,
} from "../academic/admin-role.guard.js";
import type { RequestWithContext } from "../common/request-context.js";
import {
  SessionAuthGuard,
  type AuthenticatedRequest,
} from "../identity/session-auth.guard.js";

class CareerImportDto {
  @IsObject()
  payload!: object;
}

class CareerGoalDto {
  @IsUUID()
  roleVersionId!: string;

  @IsIn(["INTERNSHIP_READY", "SERVICE_PLACEMENT", "PRODUCT_PLACEMENT"])
  targetLevel!: TargetLevel;

  @IsDateString({ strict: true })
  deadline!: string;

  @IsString()
  @MaxLength(64)
  deadlineBasis!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  lockVersion?: number;
}

@Controller("catalog/career-roles")
export class CareerCatalogController {
  constructor(private readonly career: CareerService) {}

  @Get()
  list(): Promise<CareerRoleOption[]> {
    return this.career.listRoles();
  }

  @Get("for-student")
  @UseGuards(SessionAuthGuard)
  listForStudent(
    @Req() request: AuthenticatedRequest,
  ): Promise<StudentCareerCatalog> {
    return this.career.listRolesForStudent(request.user.id);
  }
}

@Controller("onboarding")
export class CareerOnboardingController {
  constructor(private readonly career: CareerService) {}

  @Put("career-goal")
  @UseGuards(SessionAuthGuard)
  save(
    @Body() body: CareerGoalDto,
    @Req() request: AuthenticatedRequest & RequestWithContext,
  ): Promise<CareerGoalResponse> {
    return this.career.upsertGoal(request.user.id, body, request.correlationId);
  }
}

@Controller("admin/career")
@UseGuards(SessionAuthGuard, AdminRoleGuard)
export class CareerAdminController {
  constructor(private readonly career: CareerService) {}

  @Post("imports")
  @HttpCode(201)
  @RequireAdminRoles("CONTENT_EDITOR")
  stage(
    @Body() body: CareerImportDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CareerImportResult> {
    return this.career.stageImport(body.payload, request.user.id);
  }

  @Post("imports/:id/publish")
  @RequireAdminRoles("CONTENT_REVIEWER")
  publish(
    @Param("id") importId: string,
    @Req() request: AuthenticatedRequest & RequestWithContext,
  ): Promise<{ datasetId: string; status: "PUBLISHED" }> {
    return this.career.publishImport(
      importId,
      request.user.id,
      request.correlationId,
    );
  }
}

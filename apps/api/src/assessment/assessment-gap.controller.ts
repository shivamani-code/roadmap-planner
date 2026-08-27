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
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import {
  AssessmentGapService,
  type AssessmentLevel,
} from "./assessment-gap.service.js";
import {
  AdminRoleGuard,
  RequireAdminRoles,
} from "../academic/admin-role.guard.js";
import {
  SessionAuthGuard,
  type AuthenticatedRequest,
} from "../identity/session-auth.guard.js";

class AssessmentResponseDto {
  @IsUUID()
  skillId!: string;

  @IsIn([
    "UNKNOWN",
    "NOT_STARTED",
    "AWARE",
    "BASIC",
    "APPLIED",
    "PROFICIENT",
    "READY",
  ])
  level!: AssessmentLevel;
}

class SaveAssessmentResponsesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AssessmentResponseDto)
  responses!: AssessmentResponseDto[];
}

class DayWindowDto {
  @IsInt()
  @Min(0)
  @Max(6)
  day!: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute!: number;
}

class AvailabilityDto {
  @IsString()
  @MaxLength(64)
  timezone!: string;

  @IsInt()
  @Min(10)
  @Max(240)
  maxSessionMinutes!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => DayWindowDto)
  windows!: DayWindowDto[];
}

class MappingDto {
  @IsUUID()
  curriculumTopicId!: string;

  @IsUUID()
  skillId!: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  breadth!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  depth!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence!: number;

  @IsBoolean()
  practiceRequired!: boolean;

  @IsNumber()
  @Min(0)
  @Max(1)
  evidencePotential!: number;

  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  rationale!: string;

  @IsInt()
  @Min(1)
  version!: number;
}

@Controller("skill-assessments")
@UseGuards(SessionAuthGuard)
export class AssessmentController {
  constructor(private readonly service: AssessmentGapService) {}

  @Post()
  start(@Req() request: AuthenticatedRequest) {
    return this.service.startAssessment(request.user.id);
  }

  @Put(":id/responses")
  save(
    @Param("id") id: string,
    @Body() body: SaveAssessmentResponsesDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.saveResponses(request.user.id, id, body.responses);
  }

  @Post(":id/submit")
  submit(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.service.submitAssessment(request.user.id, id);
  }
}

@Controller("study-availability")
@UseGuards(SessionAuthGuard)
export class AvailabilityController {
  constructor(private readonly service: AssessmentGapService) {}

  @Put()
  save(@Body() body: AvailabilityDto, @Req() request: AuthenticatedRequest) {
    return this.service.saveAvailability(request.user.id, body);
  }
}

@Controller("gap-analyses")
@UseGuards(SessionAuthGuard)
export class GapAnalysisController {
  constructor(private readonly service: AssessmentGapService) {}

  @Post()
  @HttpCode(201)
  create(@Req() request: AuthenticatedRequest) {
    return this.service.createGapAnalysis(request.user.id);
  }

  @Get(":id")
  get(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.service.getGapAnalysis(request.user.id, id);
  }
}

@Controller("admin/curriculum-skill-mappings")
@UseGuards(SessionAuthGuard, AdminRoleGuard)
@RequireAdminRoles("CONTENT_REVIEWER")
export class MappingAdminController {
  constructor(private readonly service: AssessmentGapService) {}

  @Get("references")
  references() {
    return this.service.mappingReferences();
  }

  @Post()
  create(@Body() body: MappingDto, @Req() request: AuthenticatedRequest) {
    return this.service.createMapping(request.user.id, body);
  }
}

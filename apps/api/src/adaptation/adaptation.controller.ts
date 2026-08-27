import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Min,
} from "class-validator";
import {
  SessionAuthGuard,
  type AuthenticatedRequest,
} from "../identity/session-auth.guard.js";
import { AdaptationService } from "./adaptation.service.js";

class WeeklyReviewDto {
  @IsDateString({ strict: true })
  weekStart!: string;

  @IsIn(["TOO_EASY", "GOOD", "TOO_DIFFICULT"])
  difficulty!: "TOO_EASY" | "GOOD" | "TOO_DIFFICULT";

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  upcomingChanges!: string[];
}

class ExamPeriodDto {
  @IsIn(["INTERNAL_EXAM", "SEMESTER_EXAM", "VACATION", "PLACEMENT_WEEK"])
  type!: "INTERNAL_EXAM" | "SEMESTER_EXAM" | "VACATION" | "PLACEMENT_WEEK";

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsDateString({ strict: true })
  startDate!: string;

  @IsDateString({ strict: true })
  endDate!: string;
}

class ExamConfirmationDto {
  @IsBoolean()
  @Type(() => Boolean)
  confirmed!: boolean;
}

class RequestRevisionDto {
  @IsIn(["MATERIAL", "ROLE", "CONTENT", "EXAM"])
  kind!: "MATERIAL" | "ROLE" | "CONTENT" | "EXAM";

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsUUID()
  targetRoleVersionId?: string;
}

class ActivateRevisionDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedActiveVersion?: number;
}

@Controller()
@UseGuards(SessionAuthGuard)
export class AdaptationController {
  constructor(private readonly adaptation: AdaptationService) {}

  @Post("weekly-reviews")
  weeklyReview(
    @Body() body: WeeklyReviewDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adaptation.submitWeeklyReview(request.user.id, body);
  }

  @Get("exam-periods")
  examPeriods(@Req() request: AuthenticatedRequest) {
    return this.adaptation.listExamPeriods(request.user.id);
  }

  @Post("exam-periods")
  createExamPeriod(
    @Body() body: ExamPeriodDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adaptation.createExamPeriod(request.user.id, body);
  }

  @Patch("exam-periods/:id/confirmation")
  confirmExamPeriod(
    @Param("id") periodId: string,
    @Body() body: ExamConfirmationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adaptation.confirmExamPeriod(
      request.user.id,
      periodId,
      body.confirmed,
    );
  }

  @Get("planning-mode")
  planningMode(
    @Query("date") date: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adaptation.planningMode(request.user.id, date);
  }

  @Post("roadmap-revisions")
  requestRevision(
    @Body() body: RequestRevisionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adaptation.requestRevision(request.user.id, body);
  }

  @Get("roadmap-revisions/:id/diff")
  revisionDiff(
    @Param("id") revisionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adaptation.revisionDiff(request.user.id, revisionId);
  }

  @Post("roadmap-revisions/:id/activate")
  activateRevision(
    @Param("id") revisionId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: ActivateRevisionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const headerVersion = ifMatch
      ? Number(ifMatch.replaceAll('"', ""))
      : undefined;
    const expectedVersion = body.expectedActiveVersion ?? headerVersion;
    if (!Number.isInteger(expectedVersion) || !expectedVersion)
      throw new BadRequestException({
        code: "IF_MATCH_REQUIRED",
        message: "Expected active roadmap version is required",
      });
    return this.adaptation.activateRevision(
      request.user.id,
      revisionId,
      expectedVersion,
      true,
    );
  }

  @Post("roadmap-revisions/:id/reject")
  rejectRevision(
    @Param("id") revisionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adaptation.rejectRevision(request.user.id, revisionId);
  }
}

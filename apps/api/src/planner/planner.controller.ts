import {
  Body,
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
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { PlannerService } from "./planner.service.js";
import {
  SessionAuthGuard,
  type AuthenticatedRequest,
} from "../identity/session-auth.guard.js";

class TaskCommandDto {
  @IsIn(["START", "PARTIAL", "SKIP", "RESCHEDULE"])
  command!: "START" | "PARTIAL" | "SKIP" | "RESCHEDULE";

  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(239)
  partialMinutes?: number;

  @IsOptional()
  @IsIn(["NO_TIME", "TOO_DIFFICULT", "ALREADY_KNEW", "NOT_RELEVANT", "OTHER"])
  skipReason?:
    "NO_TIME" | "TOO_DIFFICULT" | "ALREADY_KNEW" | "NOT_RELEVANT" | "OTHER";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  skipNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  rescheduleDate?: string;
}

class CompleteTaskDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  actualMinutes!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  outcome!: string;

  @IsOptional()
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(2048)
  artifactUrl?: string;
}

@Controller("plans")
@UseGuards(SessionAuthGuard)
export class PlanController {
  constructor(private readonly service: PlannerService) {}

  @Get("today")
  today(
    @Query("date") date: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.today(request.user.id, date);
  }

  @Get("weeks/:weekStart")
  week(
    @Param("weekStart") weekStart: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.week(request.user.id, weekStart);
  }
}

@Controller("task-occurrences")
@UseGuards(SessionAuthGuard)
export class TaskOccurrenceController {
  constructor(private readonly service: PlannerService) {}

  @Patch(":id")
  command(
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: TaskCommandDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.command(
      request.user.id,
      id,
      idempotencyKey?.trim() || `${id}:${body.command}:${body.expectedVersion}`,
      body,
    );
  }

  @Post(":id/completions")
  complete(
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CompleteTaskDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.complete(
      request.user.id,
      id,
      idempotencyKey?.trim() || `${id}:complete:${body.expectedVersion}`,
      body,
    );
  }
}

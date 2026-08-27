import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsUUID } from "class-validator";
import { RoadmapService } from "./roadmap.service.js";
import {
  SessionAuthGuard,
  type AuthenticatedRequest,
} from "../identity/session-auth.guard.js";

class GenerateRoadmapDto {
  @IsUUID()
  gapAnalysisId!: string;
}

@Controller("roadmaps")
@UseGuards(SessionAuthGuard)
export class RoadmapController {
  constructor(private readonly service: RoadmapService) {}

  @Post()
  generate(
    @Body() body: GenerateRoadmapDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.generate(
      request.user.id,
      body.gapAnalysisId,
      idempotencyKey?.trim() || `gap:${body.gapAnalysisId}`,
    );
  }

  @Get("current")
  current(@Req() request: AuthenticatedRequest) {
    return this.service.current(request.user.id);
  }

  @Get("current/terms/:termId")
  term(@Param("termId") termId: string, @Req() request: AuthenticatedRequest) {
    return this.service.term(request.user.id, termId);
  }
}

@Controller("roadmap-jobs")
@UseGuards(SessionAuthGuard)
export class RoadmapJobController {
  constructor(private readonly service: RoadmapService) {}

  @Get(":id")
  get(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.service.jobResponse(request.user.id, id);
  }
}

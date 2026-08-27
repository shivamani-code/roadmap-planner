import { Module } from "@nestjs/common";
import {
  AssessmentController,
  AvailabilityController,
  GapAnalysisController,
  MappingAdminController,
} from "./assessment-gap.controller.js";
import { AssessmentGapService } from "./assessment-gap.service.js";
import { AdminRoleGuard } from "../academic/admin-role.guard.js";
import { IdentityModule } from "../identity/identity.module.js";

@Module({
  imports: [IdentityModule],
  controllers: [
    AssessmentController,
    AvailabilityController,
    GapAnalysisController,
    MappingAdminController,
  ],
  providers: [AssessmentGapService, AdminRoleGuard],
  exports: [AssessmentGapService],
})
export class AssessmentGapModule {}

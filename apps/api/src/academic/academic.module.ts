import { Module } from "@nestjs/common";
import {
  AcademicCatalogController,
  AcademicOnboardingController,
  CurriculumAdminController,
} from "./academic.controller.js";
import { AcademicService } from "./academic.service.js";
import { AdminRoleGuard } from "./admin-role.guard.js";
import { IdentityModule } from "../identity/identity.module.js";

@Module({
  imports: [IdentityModule],
  controllers: [
    AcademicCatalogController,
    AcademicOnboardingController,
    CurriculumAdminController,
  ],
  providers: [AcademicService, AdminRoleGuard],
  exports: [AcademicService],
})
export class AcademicModule {}

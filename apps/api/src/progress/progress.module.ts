import { Module } from "@nestjs/common";
import { AdminRoleGuard } from "../academic/admin-role.guard.js";
import { IdentityModule } from "../identity/identity.module.js";
import {
  ProgressController,
  ProjectAdminController,
  ProjectController,
  StudentProjectController,
} from "./progress.controller.js";
import { ProgressReadinessService } from "./progress-readiness.service.js";
import { ProjectService } from "./project.service.js";

@Module({
  imports: [IdentityModule],
  controllers: [
    ProjectAdminController,
    ProjectController,
    StudentProjectController,
    ProgressController,
  ],
  providers: [ProjectService, ProgressReadinessService, AdminRoleGuard],
  exports: [ProjectService, ProgressReadinessService],
})
export class ProgressModule {}

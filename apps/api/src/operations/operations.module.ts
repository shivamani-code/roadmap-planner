import { Module } from "@nestjs/common";
import { AdminRoleGuard } from "../academic/admin-role.guard.js";
import { IdentityModule } from "../identity/identity.module.js";
import {
  PilotAdminController,
  PilotFeedbackController,
} from "./pilot.controller.js";
import { PilotService } from "./pilot.service.js";
import { PrivacyController } from "./privacy.controller.js";
import { AdminPrivacyController } from "./privacy.controller.js";
import { PrivacyService } from "./privacy.service.js";

@Module({
  imports: [IdentityModule],
  controllers: [
    PrivacyController,
    AdminPrivacyController,
    PilotFeedbackController,
    PilotAdminController,
  ],
  providers: [PrivacyService, PilotService, AdminRoleGuard],
})
export class OperationsModule {}

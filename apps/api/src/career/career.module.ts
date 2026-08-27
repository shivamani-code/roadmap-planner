import { Module } from "@nestjs/common";
import {
  CareerAdminController,
  CareerCatalogController,
  CareerOnboardingController,
} from "./career.controller.js";
import { CareerService } from "./career.service.js";
import { AdminRoleGuard } from "../academic/admin-role.guard.js";
import { IdentityModule } from "../identity/identity.module.js";

@Module({
  imports: [IdentityModule],
  controllers: [
    CareerAdminController,
    CareerCatalogController,
    CareerOnboardingController,
  ],
  providers: [CareerService, AdminRoleGuard],
  exports: [CareerService],
})
export class CareerModule {}

import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { PlannerModule } from "../planner/planner.module.js";
import { AdaptationController } from "./adaptation.controller.js";
import { AdaptationService } from "./adaptation.service.js";

@Module({
  imports: [IdentityModule, PlannerModule],
  controllers: [AdaptationController],
  providers: [AdaptationService],
  exports: [AdaptationService],
})
export class AdaptationModule {}

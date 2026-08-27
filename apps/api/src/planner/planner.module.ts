import { Module } from "@nestjs/common";
import {
  PlanController,
  TaskOccurrenceController,
} from "./planner.controller.js";
import { PlannerService } from "./planner.service.js";
import { IdentityModule } from "../identity/identity.module.js";

@Module({
  imports: [IdentityModule],
  controllers: [PlanController, TaskOccurrenceController],
  providers: [PlannerService],
  exports: [PlannerService],
})
export class PlannerModule {}

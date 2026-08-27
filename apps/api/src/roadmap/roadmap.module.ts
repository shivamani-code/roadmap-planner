import { Module } from "@nestjs/common";
import {
  RoadmapController,
  RoadmapJobController,
} from "./roadmap.controller.js";
import { RoadmapService } from "./roadmap.service.js";
import { IdentityModule } from "../identity/identity.module.js";

@Module({
  imports: [IdentityModule],
  controllers: [RoadmapController, RoadmapJobController],
  providers: [RoadmapService],
  exports: [RoadmapService],
})
export class RoadmapModule {}

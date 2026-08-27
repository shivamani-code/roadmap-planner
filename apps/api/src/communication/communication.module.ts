import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { CommunicationController } from "./communication.controller.js";
import { CommunicationService } from "./communication.service.js";

@Module({
  imports: [IdentityModule],
  controllers: [CommunicationController],
  providers: [CommunicationService],
})
export class CommunicationModule {}

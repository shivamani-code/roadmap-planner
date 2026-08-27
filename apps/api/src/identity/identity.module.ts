import { Module } from "@nestjs/common";
import { IdentityController } from "./identity.controller.js";
import { IdentityService } from "./identity.service.js";
import { SessionAuthGuard } from "./session-auth.guard.js";

@Module({
  controllers: [IdentityController],
  providers: [IdentityService, SessionAuthGuard],
  exports: [IdentityService, SessionAuthGuard],
})
export class IdentityModule {}

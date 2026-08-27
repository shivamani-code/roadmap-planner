import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import type { ServiceHealth } from "@studentos/contracts";
import { HealthService } from "./health.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("live")
  liveness(): ServiceHealth {
    return {
      status: "ok",
      service: "studentos-api",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      checks: { process: "ok" },
    };
  }

  @Get("ready")
  async readiness(): Promise<ServiceHealth> {
    const health = await this.health.status();
    if (health.status !== "ok") {
      throw new ServiceUnavailableException({
        code: "SERVICE_NOT_READY",
        message: "Database is unavailable",
      });
    }
    return health;
  }
}

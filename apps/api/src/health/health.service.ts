import { Inject, Injectable } from "@nestjs/common";
import type { ServiceHealth } from "@studentos/contracts";
import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { DatabaseService } from "../config/database.service.js";

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async status(): Promise<ServiceHealth> {
    const database = (await this.database.ping()) ? "ok" : "unavailable";
    return {
      status: database === "ok" ? "ok" : "degraded",
      service: "studentos-api",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      checks: { process: "ok", database },
    };
  }

  readinessEnabled(): boolean {
    return (
      this.config.NODE_ENV !== "test" || this.config.DATABASE_MODE === "pglite"
    );
  }
}

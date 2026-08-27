import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { ConfigModule } from "./config/config.module.js";
import { DatabaseModule } from "./config/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { IdentityModule } from "./identity/identity.module.js";
import { requestContext } from "./common/request-context.js";
import { AcademicModule } from "./academic/academic.module.js";
import { CareerModule } from "./career/career.module.js";
import { AssessmentGapModule } from "./assessment/assessment-gap.module.js";
import { RoadmapModule } from "./roadmap/roadmap.module.js";
import { PlannerModule } from "./planner/planner.module.js";
import { ProgressModule } from "./progress/progress.module.js";
import { AdaptationModule } from "./adaptation/adaptation.module.js";
import { CommunicationModule } from "./communication/communication.module.js";
import { OperationsModule } from "./operations/operations.module.js";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    IdentityModule,
    AcademicModule,
    CareerModule,
    AssessmentGapModule,
    RoadmapModule,
    PlannerModule,
    ProgressModule,
    AdaptationModule,
    CommunicationModule,
    OperationsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestContext).forRoutes("{*path}");
  }
}

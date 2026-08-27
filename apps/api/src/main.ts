import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { createLogger } from "@studentos/observability";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { APP_CONFIG, type AppConfig } from "./config/app-config.js";
import { ProblemDetailsFilter } from "./common/problem-details.filter.js";
import {
  ApplicationRateLimiter,
  createCsrfMiddleware,
} from "./common/security-middleware.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useBodyParser("json", { limit: "2mb" });
  app.useBodyParser("urlencoded", { limit: "2mb", extended: true });
  const config = app.get<AppConfig>(APP_CONFIG);
  if (config.TRUST_PROXY_HOPS > 0)
    app
      .getHttpAdapter()
      .getInstance()
      .set("trust proxy", config.TRUST_PROXY_HOPS);
  app.setGlobalPrefix("api/v1");
  app.use(new ApplicationRateLimiter().middleware(config));
  app.use(createCsrfMiddleware(config));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: config.NODE_ENV === "production",
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  app.enableCors({
    origin: [config.WEB_ORIGIN, config.ADMIN_ORIGIN],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: [
      "content-type",
      "authorization",
      "idempotency-key",
      "x-request-id",
      "x-studentos-csrf",
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();

  const openApi = new DocumentBuilder()
    .setTitle("StudentOS API")
    .setVersion("1.0")
    .addCookieAuth("studentos_session")
    .build();
  SwaggerModule.setup(
    "api/docs",
    app,
    SwaggerModule.createDocument(app, openApi),
  );
  await app.listen(config.API_PORT, "0.0.0.0");
  createLogger({
    service: "api",
    environment: config.NODE_ENV,
    level: config.LOG_LEVEL,
  }).info({ port: config.API_PORT }, "api listening");
}

void bootstrap().catch((error: unknown) => {
  createLogger({
    service: "api",
    environment: process.env.NODE_ENV ?? "development",
  }).fatal(
    { error: error instanceof Error ? error.message : "unknown" },
    "api failed to start",
  );
  process.exitCode = 1;
});

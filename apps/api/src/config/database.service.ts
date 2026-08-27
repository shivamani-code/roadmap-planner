import {
  Inject,
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common";
import {
  applyEmbeddedMigrations,
  createEmbeddedDatabase,
  createPostgresClient,
  type DatabaseClient,
  type EmbeddedDatabase,
} from "@studentos/database";
import { APP_CONFIG, type AppConfig } from "./app-config.js";

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  #client: DatabaseClient | undefined;
  #embedded: EmbeddedDatabase | undefined;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get client(): DatabaseClient {
    if (!this.#client) throw new Error("Database has not been initialized");
    return this.#client;
  }

  async onModuleInit(): Promise<void> {
    if (this.config.DATABASE_MODE === "pglite") {
      this.#embedded = await createEmbeddedDatabase(this.config.DATABASE_DIR);
      await applyEmbeddedMigrations(this.#embedded.pglite);
      this.#client = this.#embedded.prisma;
      return;
    }
    this.#client = createPostgresClient(this.config.DATABASE_URL);
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.#embedded) await this.#embedded.close();
    else await this.#client?.$disconnect();
  }
}

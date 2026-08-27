import type { DatabaseClient, OutboxEvent } from "@studentos/database";

export interface OutboxHandler {
  handle(event: OutboxEvent): Promise<void>;
}

export interface OutboxProcessorOptions {
  readonly batchSize?: number;
  readonly maxAttempts?: number;
  readonly now?: () => Date;
  readonly defaultHandler?: OutboxHandler;
}

export class OutboxProcessor {
  readonly #batchSize: number;
  readonly #maxAttempts: number;
  readonly #now: () => Date;
  readonly #defaultHandler: OutboxHandler | undefined;

  constructor(
    private readonly database: DatabaseClient,
    private readonly handlers: ReadonlyMap<string, OutboxHandler>,
    options: OutboxProcessorOptions = {},
  ) {
    this.#batchSize = options.batchSize ?? 25;
    this.#maxAttempts = options.maxAttempts ?? 5;
    this.#now = options.now ?? (() => new Date());
    this.#defaultHandler = options.defaultHandler;
  }

  async runBatch(): Promise<{
    processed: number;
    retried: number;
    failed: number;
  }> {
    const candidates = await this.database.outboxEvent.findMany({
      where: { status: "PENDING", availableAt: { lte: this.#now() } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: this.#batchSize,
    });
    let processed = 0;
    let retried = 0;
    let failed = 0;

    for (const candidate of candidates) {
      const claim = await this.database.outboxEvent.updateMany({
        where: { id: candidate.id, status: "PENDING" },
        data: { status: "PROCESSING", attemptCount: { increment: 1 } },
      });
      if (claim.count !== 1) continue;
      const current = await this.database.outboxEvent.findUniqueOrThrow({
        where: { id: candidate.id },
      });
      const handler =
        this.handlers.get(current.eventType) ?? this.#defaultHandler;
      try {
        if (!handler)
          throw new Error(`No outbox handler for ${current.eventType}`);
        await handler.handle(current);
        await this.database.outboxEvent.update({
          where: { id: current.id },
          data: {
            status: "PROCESSED",
            processedAt: this.#now(),
            lastError: null,
          },
        });
        processed += 1;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message.slice(0, 2000)
            : "Unknown outbox failure";
        if (current.attemptCount >= this.#maxAttempts) {
          await this.database.outboxEvent.update({
            where: { id: current.id },
            data: { status: "FAILED", lastError: message },
          });
          failed += 1;
        } else {
          const backoffMinutes = Math.min(2 ** current.attemptCount, 60);
          await this.database.outboxEvent.update({
            where: { id: current.id },
            data: {
              status: "PENDING",
              lastError: message,
              availableAt: new Date(
                this.#now().getTime() + backoffMinutes * 60_000,
              ),
            },
          });
          retried += 1;
        }
      }
    }
    return { processed, retried, failed };
  }
}

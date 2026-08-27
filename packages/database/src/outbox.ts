import type { DomainEvent } from "@studentos/domain";
import type { DatabaseClient } from "./client.js";

export async function enqueueOutboxEvent(
  client: DatabaseClient,
  event: DomainEvent,
): Promise<void> {
  await client.outboxEvent.create({
    data: {
      id: event.id,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.type,
      payload: event.payload,
      availableAt: event.occurredAt,
    },
  });
}

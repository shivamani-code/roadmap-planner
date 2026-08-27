import {
  applyEmbeddedMigrations,
  createEmbeddedDatabase,
  type EmbeddedDatabase,
} from "@studentos/database";
import { uuidV7 } from "@studentos/domain";
import { afterEach, describe, expect, it } from "vitest";
import { NotificationScheduler } from "../src/notification-scheduler.js";

let database: EmbeddedDatabase | undefined;

afterEach(async () => {
  await database?.close();
  database = undefined;
});

describe("notification scheduler", () => {
  it("creates channel deliveries once and suppresses disabled email delivery", async () => {
    database = await createEmbeddedDatabase();
    await applyEmbeddedMigrations(database.pglite);
    const userId = uuidV7();
    await database.prisma.user.create({
      data: {
        id: userId,
        email: "notification-test@example.com",
        normalizedEmail: "notification-test@example.com",
      },
    });
    await database.prisma.communicationPreference.create({
      data: {
        userId,
        timezone: "Asia/Kolkata",
        dailyReminderMinute: 0,
        quietHoursEnabled: false,
      },
    });
    await database.prisma.notificationTypePreference.create({
      data: {
        id: uuidV7(),
        userId,
        type: "UPCOMING_EXAM",
        inAppEnabled: true,
        emailEnabled: true,
      },
    });
    const exam = await database.prisma.examPeriod.create({
      data: {
        id: uuidV7(),
        userId,
        type: "SEMESTER_EXAM",
        title: "Synthetic semester exam",
        startDate: new Date("2026-09-01T00:00:00.000Z"),
        endDate: new Date("2026-09-10T00:00:00.000Z"),
        provenance: "STUDENT",
        confirmed: true,
      },
    });
    const now = new Date("2026-08-25T06:00:00.000Z");
    const scheduler = new NotificationScheduler(database.prisma, () => now);
    expect(await scheduler.generateBatch()).toEqual({
      created: 1,
      deduped: 0,
      suppressed: 0,
    });
    expect(await scheduler.generateBatch()).toEqual({
      created: 0,
      deduped: 1,
      suppressed: 0,
    });
    const notification =
      await database.prisma.notificationIntent.findFirstOrThrow({
        where: { userId },
        include: { deliveries: { orderBy: { channel: "asc" } } },
      });
    expect(notification.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "EMAIL", status: "PENDING" }),
        expect.objectContaining({ channel: "IN_APP", status: "DELIVERED" }),
      ]),
    );
    expect(await scheduler.deliverEmailBatch()).toEqual({
      delivered: 0,
      deferred: 0,
      suppressed: 1,
      failed: 0,
    });
    expect(
      await database.prisma.notificationDelivery.findFirstOrThrow({
        where: { notificationId: notification.id, channel: "EMAIL" },
      }),
    ).toMatchObject({
      status: "SUPPRESSED",
      suppressionReason: "PROVIDER_DISABLED",
    });
    await database.prisma.notificationDelivery.updateMany({
      where: { notificationId: notification.id, channel: "EMAIL" },
      data: {
        status: "PENDING",
        suppressionReason: null,
        availableAt: now,
      },
    });
    await database.prisma.examPeriod.delete({
      where: { id: exam.id },
    });
    expect(await scheduler.deliverEmailBatch()).toEqual({
      delivered: 0,
      deferred: 0,
      suppressed: 1,
      failed: 0,
    });
    expect(
      await database.prisma.notificationDelivery.findFirstOrThrow({
        where: { notificationId: notification.id, channel: "EMAIL" },
      }),
    ).toMatchObject({
      status: "SUPPRESSED",
      suppressionReason: "STALE_STATE",
    });
  });
});

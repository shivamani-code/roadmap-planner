import {
  communicationInputHash,
  daysUntil,
  localDateTime,
  notificationDedupeKey,
  notificationDeliveryDecision,
  type NotificationType,
} from "@studentos/communication";
import {
  Prisma,
  type DatabaseClient,
  type NotificationIntent,
} from "@studentos/database";
import { uuidV7 } from "@studentos/domain";

const DAY_MS = 86_400_000;

export interface EmailProvider {
  send(input: {
    notificationId: string;
    userId: string;
    title: string;
    body: string;
    actionUrl: string;
  }): Promise<{ messageId: string }>;
}

interface Candidate {
  type: NotificationType;
  dedupeParts: Array<string | number>;
  title: string;
  body: string;
  actionUrl: string;
  state: unknown;
  expiresAt?: Date;
  suppressWhenRecentlyActive?: boolean;
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  return dateString(new Date(dateOnly(value).getTime() + days * DAY_MS));
}

function mondayFor(value: string): string {
  const date = dateOnly(value);
  const offset = (date.getUTCDay() + 6) % 7;
  return addDays(value, -offset);
}

export class NotificationScheduler {
  constructor(
    private readonly database: DatabaseClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async candidates(
    userId: string,
    localDate: string,
    weekday: number,
  ): Promise<Candidate[]> {
    const candidates: Candidate[] = [];
    const day = await this.database.planningDay.findFirst({
      where: {
        localDate: dateOnly(localDate),
        week: { userId, status: "ACTIVE" },
      },
      include: {
        occurrences: {
          where: { status: { notIn: ["COMPLETED", "SKIPPED", "RESCHEDULED"] } },
          orderBy: { startMinute: "asc" },
        },
      },
    });
    if (day?.occurrences.length) {
      candidates.push({
        type: "TODAY_PLAN",
        dedupeParts: [localDate],
        title: "Your study plan is ready",
        body: `You have ${day.occurrences.length} planned ${day.occurrences.length === 1 ? "session" : "sessions"}. Open Today when you are ready to begin.`,
        actionUrl: "/today",
        state: day.occurrences.map(({ id, status, lockVersion }) => ({
          id,
          status,
          lockVersion,
        })),
        expiresAt: new Date(dateOnly(addDays(localDate, 1)).getTime()),
        suppressWhenRecentlyActive: true,
      });
    }

    const exams = await this.database.examPeriod.findMany({
      where: {
        userId,
        confirmed: true,
        startDate: { gte: dateOnly(localDate) },
      },
      orderBy: { startDate: "asc" },
      take: 20,
    });
    for (const exam of exams) {
      const remaining = daysUntil(localDate, dateString(exam.startDate));
      if (![1, 7].includes(remaining)) continue;
      candidates.push({
        type: "UPCOMING_EXAM",
        dedupeParts: [exam.id, remaining],
        title: `${exam.title} is approaching`,
        body:
          remaining === 1
            ? "Your confirmed exam begins tomorrow. The academic-heavy plan is already protecting capacity."
            : "Your confirmed exam begins next week. Review the protected academic plan before conditions change.",
        actionUrl: "/calendar",
        state: { examId: exam.id, confirmed: exam.confirmed, remaining },
        expiresAt: exam.startDate,
      });
    }

    if (weekday === 0 || weekday === 2) {
      const priorWeekStart = addDays(mondayFor(localDate), -7);
      const reviewWeek = await this.database.planningWeek.findFirst({
        where: {
          userId,
          weekStart: dateOnly(priorWeekStart),
          occurrences: { some: {} },
        },
        include: { weeklyReview: true },
        orderBy: { createdAt: "desc" },
      });
      if (reviewWeek && !reviewWeek.weeklyReview)
        candidates.push({
          type: "WEEKLY_REVIEW",
          dedupeParts: [priorWeekStart, weekday === 0 ? "initial" : "reminder"],
          title:
            weekday === 0
              ? "Your week is ready to review"
              : "Weekly review is still available",
          body: "Compare planned and completed work so the next plan can adapt within your declared time.",
          actionUrl: "/review",
          state: { planningWeekId: reviewWeek.id, reviewed: false },
          expiresAt: new Date(dateOnly(addDays(localDate, 2)).getTime()),
        });
    }

    const overdue = await this.database.taskOccurrence.findFirst({
      where: {
        userId,
        scheduledDate: { lte: dateOnly(addDays(localDate, -1)) },
        status: { in: ["PLANNED", "PARTIAL"] },
        task: {
          revision: { activeForRoadmap: { is: { userId } } },
          milestone: { sourceRequirement: { is: { required: true } } },
        },
      },
      include: { task: true },
      orderBy: [{ scheduledDate: "asc" }, { startMinute: "asc" }],
    });
    if (overdue)
      candidates.push({
        type: "MISSED_PLAN",
        dedupeParts: [mondayFor(localDate)],
        title: "Replan an overdue required task",
        body: "A required task is still open. Review the week and move it into real spare capacity without blame or catch-up overload.",
        actionUrl: "/plan/week",
        state: { id: overdue.id, status: overdue.status },
        expiresAt: new Date(dateOnly(addDays(localDate, 7)).getTime()),
      });

    const milestoneLimit = dateOnly(addDays(localDate, 7));
    const milestones = await this.database.roadmapMilestone.findMany({
      where: {
        requiredBy: { gte: dateOnly(localDate), lte: milestoneLimit },
        status: { in: ["PLANNED", "LOCKED"] },
        term: { revision: { activeForRoadmap: { is: { userId } } } },
      },
      include: {
        tasks: {
          include: {
            occurrences: {
              where: {
                status: { notIn: ["COMPLETED", "SKIPPED", "RESCHEDULED"] },
              },
              select: { id: true },
            },
          },
        },
      },
      orderBy: [{ requiredBy: "asc" }, { priority: "desc" }],
      take: 3,
    });
    for (const milestone of milestones) {
      const openTasks = milestone.tasks.reduce(
        (total, task) => total + task.occurrences.length,
        0,
      );
      if (openTasks === 0) continue;
      candidates.push({
        type: "MILESTONE",
        dedupeParts: [milestone.id, milestone.status, openTasks],
        title: "A roadmap milestone is approaching",
        body: "This reviewed milestone is due soon and still has open work. Inspect its place in the active roadmap.",
        actionUrl: "/roadmap",
        state: { id: milestone.id, status: milestone.status, openTasks },
        expiresAt: new Date(milestone.requiredBy.getTime() + DAY_MS),
      });
    }

    const goal = await this.database.careerGoal.findFirst({
      where: { userId, status: "ACTIVE" },
    });
    const placementProfile = goal
      ? await this.database.placementProfile.findUnique({ where: { userId } })
      : null;
    if (
      goal &&
      daysUntil(localDate, dateString(goal.deadline)) <= 90 &&
      (!placementProfile?.resumeComplete || !placementProfile.profileComplete)
    )
      candidates.push({
        type: "PLACEMENT_CHECKPOINT",
        dedupeParts: [mondayFor(localDate)],
        title: "A placement checkpoint needs evidence",
        body: "Your preparation profile still has an open checkpoint. Review the readiness gate and its evidence requirements.",
        actionUrl: "/placement",
        state: {
          resumeComplete: placementProfile?.resumeComplete ?? false,
          profileComplete: placementProfile?.profileComplete ?? false,
        },
        expiresAt: new Date(dateOnly(addDays(localDate, 7)).getTime()),
      });
    return candidates;
  }

  private async createIntent(input: {
    userId: string;
    settings: {
      timezone: string;
      quietHoursEnabled: boolean;
      quietStartMinute: number;
      quietEndMinute: number;
      lastActiveAt: Date | null;
    };
    preference: { inAppEnabled: boolean; emailEnabled: boolean };
    candidate: Candidate;
  }): Promise<"created" | "deduped" | "suppressed"> {
    const now = this.now();
    const decision = notificationDeliveryDecision({
      now,
      timeZone: input.settings.timezone,
      quietHoursEnabled: input.settings.quietHoursEnabled,
      quietStartMinute: input.settings.quietStartMinute,
      quietEndMinute: input.settings.quietEndMinute,
      lastActiveAt: input.settings.lastActiveAt,
      suppressWhenRecentlyActive:
        input.candidate.suppressWhenRecentlyActive ?? false,
    });
    if (!decision.deliver) return "suppressed";
    if (!input.preference.inAppEnabled && !input.preference.emailEnabled)
      return "suppressed";
    const notificationId = uuidV7();
    const dedupeKey = notificationDedupeKey(
      input.userId,
      input.candidate.type,
      input.candidate.dedupeParts,
    );
    try {
      await this.database.$transaction(async (transaction) => {
        await transaction.notificationIntent.create({
          data: {
            id: notificationId,
            userId: input.userId,
            type: input.candidate.type,
            dedupeKey,
            title: input.candidate.title,
            body: input.candidate.body,
            actionUrl: input.candidate.actionUrl,
            context: JSON.parse(
              JSON.stringify(input.candidate.state),
            ) as Prisma.InputJsonValue,
            stateHash: communicationInputHash(input.candidate.state),
            scheduledFor: now,
            expiresAt: input.candidate.expiresAt ?? null,
          },
        });
        if (input.preference.inAppEnabled)
          await transaction.notificationDelivery.create({
            data: {
              id: uuidV7(),
              notificationId,
              channel: "IN_APP",
              status: "DELIVERED",
              deliveredAt: now,
            },
          });
        if (input.preference.emailEnabled)
          await transaction.notificationDelivery.create({
            data: {
              id: uuidV7(),
              notificationId,
              channel: "EMAIL",
              status: "PENDING",
              availableAt: now,
            },
          });
      });
      return "created";
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return "deduped";
      throw error;
    }
  }

  async generateBatch(): Promise<{
    created: number;
    deduped: number;
    suppressed: number;
  }> {
    const settings = await this.database.communicationPreference.findMany({
      include: {
        typePreferences: {
          where: { OR: [{ inAppEnabled: true }, { emailEnabled: true }] },
        },
      },
    });
    const totals = { created: 0, deduped: 0, suppressed: 0 };
    for (const userSettings of settings) {
      const local = localDateTime(this.now(), userSettings.timezone);
      if (local.minute < userSettings.dailyReminderMinute) continue;
      const candidates = await this.candidates(
        userSettings.userId,
        local.date,
        local.weekday,
      );
      const preferenceByType = new Map(
        userSettings.typePreferences.map((preference) => [
          preference.type,
          preference,
        ]),
      );
      for (const candidate of candidates) {
        const preference = preferenceByType.get(candidate.type);
        if (!preference) continue;
        const outcome = await this.createIntent({
          userId: userSettings.userId,
          settings: userSettings,
          preference,
          candidate,
        });
        totals[outcome] += 1;
      }
    }
    return totals;
  }

  private async stillValid(
    notification: NotificationIntent,
    timeZone: string,
  ): Promise<boolean> {
    if (notification.expiresAt && notification.expiresAt <= this.now())
      return false;
    if (notification.type === "TODAY_PLAN") {
      const local = localDateTime(this.now(), timeZone).date;
      return (
        (await this.database.taskOccurrence.count({
          where: {
            userId: notification.userId,
            scheduledDate: dateOnly(local),
            status: { notIn: ["COMPLETED", "SKIPPED", "RESCHEDULED"] },
            task: {
              revision: {
                activeForRoadmap: { is: { userId: notification.userId } },
              },
            },
          },
        })) > 0
      );
    }
    const context = notification.context as Record<string, unknown>;
    if (notification.type === "WEEKLY_REVIEW") {
      return typeof context.planningWeekId === "string"
        ? (await this.database.weeklyReview.count({
            where: {
              userId: notification.userId,
              planningWeekId: context.planningWeekId,
            },
          })) === 0
        : false;
    }
    if (notification.type === "UPCOMING_EXAM")
      return typeof context.examId === "string"
        ? (await this.database.examPeriod.count({
            where: {
              id: context.examId,
              userId: notification.userId,
              confirmed: true,
              startDate: { gte: this.now() },
            },
          })) === 1
        : false;
    if (notification.type === "MISSED_PLAN")
      return typeof context.id === "string"
        ? (await this.database.taskOccurrence.count({
            where: {
              id: context.id,
              userId: notification.userId,
              status: { in: ["PLANNED", "PARTIAL"] },
              task: {
                revision: {
                  activeForRoadmap: { is: { userId: notification.userId } },
                },
                milestone: {
                  sourceRequirement: { is: { required: true } },
                },
              },
            },
          })) === 1
        : false;
    if (notification.type === "MILESTONE")
      return typeof context.id === "string"
        ? (await this.database.roadmapMilestone.count({
            where: {
              id: context.id,
              status: { in: ["PLANNED", "LOCKED"] },
              term: {
                revision: {
                  activeForRoadmap: { is: { userId: notification.userId } },
                },
              },
            },
          })) === 1
        : false;
    if (notification.type === "PLACEMENT_CHECKPOINT") {
      const profile = await this.database.placementProfile.findUnique({
        where: { userId: notification.userId },
      });
      return !profile?.resumeComplete || !profile.profileComplete;
    }
    return true;
  }

  async deliverEmailBatch(provider?: EmailProvider): Promise<{
    delivered: number;
    deferred: number;
    suppressed: number;
    failed: number;
  }> {
    const deliveries = await this.database.notificationDelivery.findMany({
      where: {
        channel: "EMAIL",
        status: "PENDING",
        availableAt: { lte: this.now() },
      },
      include: { notification: true },
      orderBy: [{ availableAt: "asc" }, { id: "asc" }],
      take: 25,
    });
    const totals = { delivered: 0, deferred: 0, suppressed: 0, failed: 0 };
    for (const delivery of deliveries) {
      const settings =
        await this.database.communicationPreference.findUniqueOrThrow({
          where: { userId: delivery.notification.userId },
        });
      const preference =
        await this.database.notificationTypePreference.findUnique({
          where: {
            userId_type: {
              userId: delivery.notification.userId,
              type: delivery.notification.type,
            },
          },
        });
      if (
        !preference?.emailEnabled ||
        !(await this.stillValid(delivery.notification, settings.timezone))
      ) {
        await this.database.notificationDelivery.update({
          where: { id: delivery.id },
          data: { status: "SUPPRESSED", suppressionReason: "STALE_STATE" },
        });
        totals.suppressed += 1;
        continue;
      }
      const decision = notificationDeliveryDecision({
        now: this.now(),
        timeZone: settings.timezone,
        quietHoursEnabled: settings.quietHoursEnabled,
        quietStartMinute: settings.quietStartMinute,
        quietEndMinute: settings.quietEndMinute,
        lastActiveAt: settings.lastActiveAt,
        suppressWhenRecentlyActive: delivery.notification.type === "TODAY_PLAN",
      });
      if (!decision.deliver) {
        await this.database.notificationDelivery.update({
          where: { id: delivery.id },
          data: { availableAt: new Date(this.now().getTime() + 15 * 60_000) },
        });
        totals.deferred += 1;
        continue;
      }
      if (!provider) {
        await this.database.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "SUPPRESSED",
            suppressionReason: "PROVIDER_DISABLED",
          },
        });
        totals.suppressed += 1;
        continue;
      }
      try {
        const sent = await provider.send({
          notificationId: delivery.notification.id,
          userId: delivery.notification.userId,
          title: delivery.notification.title,
          body: delivery.notification.body,
          actionUrl: delivery.notification.actionUrl,
        });
        await this.database.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "DELIVERED",
            attemptCount: { increment: 1 },
            deliveredAt: this.now(),
            providerMessageId: sent.messageId,
          },
        });
        totals.delivered += 1;
      } catch (error) {
        const attemptCount = delivery.attemptCount + 1;
        await this.database.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            attemptCount,
            status: attemptCount >= 5 ? "FAILED" : "PENDING",
            availableAt: new Date(
              this.now().getTime() + Math.min(2 ** attemptCount, 60) * 60_000,
            ),
            lastError:
              error instanceof Error
                ? error.message.slice(0, 2000)
                : "Unknown email delivery error",
          },
        });
        totals.failed += 1;
      }
    }
    return totals;
  }
}

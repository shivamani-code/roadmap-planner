import { createHash } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  communicationInputHash,
  isValidTimeZone,
  minimizeAiFacts,
  runAiGateway,
  type GroundedExplanation,
  type NotificationType,
} from "@studentos/communication";
import { Prisma } from "@studentos/database";
import { uuidV7 } from "@studentos/domain";
import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { DatabaseService } from "../config/database.service.js";

const DAY_MS = 86_400_000;
const NOTIFICATION_TYPES: NotificationType[] = [
  "TODAY_PLAN",
  "MISSED_PLAN",
  "WEEKLY_REVIEW",
  "UPCOMING_EXAM",
  "MILESTONE",
  "PLACEMENT_CHECKPOINT",
];

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function dateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

@Injectable()
export class CommunicationService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async explain(input: {
    userId: string;
    useCase: "ROADMAP_EXPLANATION" | "WEEKLY_COACHING";
    promptVersion: string;
    facts: Record<string, unknown>;
    allowedIds: string[];
    fallback: GroundedExplanation;
    authoritativeItems: unknown[];
  }) {
    const preference =
      await this.database.client.communicationPreference.findUnique({
        where: { userId: input.userId },
      });
    const minimizedFacts = minimizeAiFacts(input.facts);
    const inputHash = communicationInputHash({
      useCase: input.useCase,
      promptVersion: input.promptVersion,
      facts: minimizedFacts,
      allowedIds: [...input.allowedIds].sort(),
    });
    const cached = await this.database.client.aiExplanationCache.findUnique({
      where: {
        userId_useCase_inputHash_promptVersion: {
          userId: input.userId,
          useCase: input.useCase,
          inputHash,
          promptVersion: input.promptVersion,
        },
      },
    });
    if (cached && cached.expiresAt > new Date())
      return {
        explanation: cached.content,
        source: cached.source,
        cached: true,
        fallbackReason: cached.source === "FALLBACK" ? "CACHED_FALLBACK" : null,
        promptVersion: cached.promptVersion,
        authoritativeItems: input.authoritativeItems,
      };

    const result = await runAiGateway({
      useCase: input.useCase,
      promptVersion: input.promptVersion,
      facts: input.facts,
      allowedIds: input.allowedIds,
      fallback: input.fallback,
    });
    const outputHash = communicationInputHash(result.explanation);
    const expiresAt = new Date(
      Date.now() + (result.source === "GENERATED" ? DAY_MS : 5 * 60_000),
    );
    const enhancementQueued = Boolean(
      preference?.aiProcessingConsent &&
      this.config.AI_GATEWAY_URL &&
      this.config.AI_GATEWAY_TOKEN,
    );
    await this.database.client.$transaction(async (transaction) => {
      await transaction.aiExplanationCache.upsert({
        where: {
          userId_useCase_inputHash_promptVersion: {
            userId: input.userId,
            useCase: input.useCase,
            inputHash: result.inputHash,
            promptVersion: input.promptVersion,
          },
        },
        create: {
          id: uuidV7(),
          userId: input.userId,
          useCase: input.useCase,
          inputHash: result.inputHash,
          promptVersion: input.promptVersion,
          source: result.source,
          provider: result.provider,
          model: result.model,
          content: jsonValue(result.explanation),
          expiresAt,
        },
        update: {
          source: result.source,
          provider: result.provider,
          model: result.model,
          content: jsonValue(result.explanation),
          expiresAt,
        },
      });
      await transaction.aiRequestAudit.create({
        data: {
          id: uuidV7(),
          userId: input.userId,
          useCase: input.useCase,
          inputHash: result.inputHash,
          promptVersion: input.promptVersion,
          source: result.source,
          provider: result.provider,
          model: result.model,
          latencyMs: result.latencyMs,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          allowedIdCount: input.allowedIds.length,
          sentFields: jsonValue(Object.keys(result.minimizedFacts).sort()),
          outputHash,
          fallbackReason: result.fallbackReason,
        },
      });
      if (enhancementQueued) {
        await transaction.outboxEvent.createMany({
          data: [
            {
              id: uuidV7(),
              aggregateType: "AiExplanation",
              aggregateId: result.inputHash,
              eventType: "communication.ai-explanation-requested.v1",
              payload: jsonValue({
                userId: input.userId,
                useCase: input.useCase,
                promptVersion: input.promptVersion,
                facts: result.minimizedFacts,
                allowedIds: input.allowedIds,
                fallback: input.fallback,
                inputHash: result.inputHash,
              }),
            },
          ],
          skipDuplicates: true,
        });
      }
    });
    return {
      explanation: result.explanation,
      source: result.source,
      cached: false,
      fallbackReason: result.fallbackReason,
      enhancementQueued,
      promptVersion: input.promptVersion,
      authoritativeItems: input.authoritativeItems,
    };
  }

  async roadmapExplanation(userId: string) {
    const roadmap = await this.database.client.roadmap.findFirst({
      where: { userId, status: "ACTIVE", activeRevisionId: { not: null } },
      include: {
        goal: { include: { roleVersion: true } },
        activeRevision: {
          include: {
            terms: {
              include: {
                milestones: {
                  where: { status: { in: ["PLANNED", "LOCKED"] } },
                  orderBy: [{ priority: "desc" }, { requiredBy: "asc" }],
                  take: 5,
                },
              },
              orderBy: { sequence: "asc" },
            },
          },
        },
      },
    });
    if (!roadmap?.activeRevision)
      throw new NotFoundException({
        code: "NO_ACTIVE_ROADMAP",
        message: "An active roadmap is required",
      });
    const milestones = roadmap.activeRevision.terms
      .flatMap(({ milestones: items }) => items)
      .sort(
        (left, right) =>
          Number(right.priority) - Number(left.priority) ||
          left.requiredBy.getTime() - right.requiredBy.getTime(),
      )
      .slice(0, 5)
      .map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        track: milestone.track,
        minutes: milestone.estimatedMinutes,
        dueDate: dateString(milestone.requiredBy),
        reasonCodes: milestone.reasonCodes,
      }));
    const fallback: GroundedExplanation = {
      headline: "Your reviewed roadmap has a clear next focus",
      summary:
        "Continue with the highest-priority reviewed milestones while keeping the protected capacity in your active plan.",
      focusItems: milestones.slice(0, 3).map((milestone) => ({
        id: milestone.id,
        text: "This reviewed milestone supports your current target role.",
      })),
    };
    return this.explain({
      userId,
      useCase: "ROADMAP_EXPLANATION",
      promptVersion: "roadmap-explanation-1.0.0",
      facts: {
        userRef: createHash("sha256").update(userId).digest("hex").slice(0, 20),
        roadmapVersion: roadmap.activeRevision.version,
        role: {
          id: roadmap.goal.roleVersionId,
          name: roadmap.goal.roleVersion.name,
          targetLevel: roadmap.goal.targetLevel,
        },
        summary: roadmap.activeRevision.summary,
        milestones,
        risks: roadmap.activeRevision.risks,
      },
      allowedIds: milestones.map(({ id }) => id),
      fallback,
      authoritativeItems: milestones,
    });
  }

  async weeklyCoaching(userId: string, weekStart?: string) {
    if (weekStart) {
      const parsed = new Date(`${weekStart}T00:00:00.000Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(weekStart) ||
        Number.isNaN(parsed.getTime()) ||
        dateString(parsed) !== weekStart
      )
        throw new UnprocessableEntityException({
          code: "INVALID_WEEK_START",
          message: "Week start must use a valid YYYY-MM-DD date",
        });
    }
    const review = await this.database.client.weeklyReview.findFirst({
      where: {
        userId,
        ...(weekStart
          ? { weekStart: new Date(`${weekStart}T00:00:00.000Z`) }
          : {}),
      },
      orderBy: { submittedAt: "desc" },
      include: {
        planningWeek: {
          include: {
            occurrences: {
              where: { status: { in: ["PLANNED", "PARTIAL", "IN_PROGRESS"] } },
              include: { task: true },
              orderBy: [{ scheduledDate: "asc" }, { startMinute: "asc" }],
              take: 5,
            },
          },
        },
      },
    });
    if (!review)
      throw new NotFoundException({
        code: "WEEKLY_REVIEW_NOT_FOUND",
        message: "Submit a weekly review before requesting coaching",
      });
    const tasks = review.planningWeek.occurrences.map((occurrence) => ({
      id: occurrence.id,
      title: occurrence.task.title,
      track: occurrence.task.track,
      minutes: occurrence.estimatedMinutes,
      date: dateString(occurrence.scheduledDate),
      status: occurrence.status,
    }));
    const fallback: GroundedExplanation = {
      headline: "Use the review to keep the next week sustainable",
      summary:
        "Your recorded completion and difficulty signals have already been applied within your declared availability.",
      focusItems: tasks.slice(0, 3).map((task) => ({
        id: task.id,
        text: "Keep this scheduled task focused and use the recorded plan controls if conditions change.",
      })),
    };
    return this.explain({
      userId,
      useCase: "WEEKLY_COACHING",
      promptVersion: "weekly-coaching-1.0.0",
      facts: {
        userRef: createHash("sha256").update(userId).digest("hex").slice(0, 20),
        weekStart: dateString(review.weekStart),
        difficulty: review.difficulty,
        metrics: {
          plannedTasks: review.plannedTaskCount,
          completedTasks: review.completedTaskCount,
          plannedMinutes: review.plannedMinutes,
          completedMinutes: review.completedMinutes,
          actualMinutes: review.actualMinutes,
        },
        adjustment: {
          action: review.action,
          multiplier: Number(review.multiplier),
        },
        tasks,
      },
      allowedIds: tasks.map(({ id }) => id),
      fallback,
      authoritativeItems: tasks,
    });
  }

  private async ensurePreferences(userId: string) {
    await this.database.client.communicationPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    await this.database.client.notificationTypePreference.createMany({
      data: NOTIFICATION_TYPES.map((type) => ({ id: uuidV7(), userId, type })),
      skipDuplicates: true,
    });
  }

  async preferences(userId: string) {
    await this.ensurePreferences(userId);
    const settings =
      await this.database.client.communicationPreference.findUniqueOrThrow({
        where: { userId },
        include: { typePreferences: { orderBy: { type: "asc" } } },
      });
    return {
      timezone: settings.timezone,
      dailyReminderMinute: settings.dailyReminderMinute,
      quietHoursEnabled: settings.quietHoursEnabled,
      quietStartMinute: settings.quietStartMinute,
      quietEndMinute: settings.quietEndMinute,
      aiProcessingConsent: settings.aiProcessingConsent,
      types: settings.typePreferences.map((preference) => ({
        type: preference.type,
        inAppEnabled: preference.inAppEnabled,
        emailEnabled: preference.emailEnabled,
      })),
    };
  }

  async updatePreferences(
    userId: string,
    input: {
      timezone: string;
      dailyReminderMinute: number;
      quietHoursEnabled: boolean;
      quietStartMinute: number;
      quietEndMinute: number;
      aiProcessingConsent: boolean;
      types: Array<{
        type: NotificationType;
        inAppEnabled: boolean;
        emailEnabled: boolean;
      }>;
    },
    requestId: string,
  ) {
    if (!isValidTimeZone(input.timezone))
      throw new UnprocessableEntityException({
        code: "INVALID_TIMEZONE",
        message: "Use a valid IANA timezone",
      });
    const suppliedTypes = new Set(input.types.map(({ type }) => type));
    if (
      input.types.length !== NOTIFICATION_TYPES.length ||
      suppliedTypes.size !== NOTIFICATION_TYPES.length ||
      NOTIFICATION_TYPES.some((type) => !suppliedTypes.has(type))
    )
      throw new UnprocessableEntityException({
        code: "INCOMPLETE_NOTIFICATION_PREFERENCES",
        message: "Provide each supported notification type exactly once",
      });
    await this.ensurePreferences(userId);
    const current =
      await this.database.client.communicationPreference.findUniqueOrThrow({
        where: { userId },
      });
    await this.database.client.$transaction(async (transaction) => {
      await transaction.communicationPreference.update({
        where: { userId },
        data: {
          timezone: input.timezone,
          dailyReminderMinute: input.dailyReminderMinute,
          quietHoursEnabled: input.quietHoursEnabled,
          quietStartMinute: input.quietStartMinute,
          quietEndMinute: input.quietEndMinute,
          aiProcessingConsent: input.aiProcessingConsent,
          aiConsentAt: input.aiProcessingConsent
            ? (current.aiConsentAt ?? new Date())
            : null,
        },
      });
      for (const preference of input.types)
        await transaction.notificationTypePreference.update({
          where: { userId_type: { userId, type: preference.type } },
          data: {
            inAppEnabled: preference.inAppEnabled,
            emailEnabled: preference.emailEnabled,
          },
        });
      if (current.aiProcessingConsent !== input.aiProcessingConsent)
        if (!input.aiProcessingConsent) {
          const cacheKeys = await transaction.aiExplanationCache.findMany({
            where: { userId },
            select: { inputHash: true },
          });
          await transaction.outboxEvent.updateMany({
            where: {
              aggregateType: "AiExplanation",
              aggregateId: { in: cacheKeys.map(({ inputHash }) => inputHash) },
              eventType: "communication.ai-explanation-requested.v1",
              status: "PENDING",
            },
            data: { status: "FAILED", lastError: "CONSENT_REVOKED" },
          });
        }
      if (current.aiProcessingConsent !== input.aiProcessingConsent)
        await transaction.aiExplanationCache.deleteMany({ where: { userId } });
      await transaction.auditLog.create({
        data: {
          id: uuidV7(),
          actorType: "USER",
          actorId: userId,
          action: "communication-preferences.update",
          targetType: "CommunicationPreference",
          targetId: userId,
          requestId,
        },
      });
    });
    return this.preferences(userId);
  }

  async recordActivity(userId: string) {
    await this.ensurePreferences(userId);
    await this.database.client.communicationPreference.update({
      where: { userId },
      data: { lastActiveAt: new Date() },
    });
    return { recorded: true as const };
  }

  async listNotifications(userId: string, unreadOnly = false) {
    const notifications =
      await this.database.client.notificationIntent.findMany({
        where: {
          userId,
          status: "READY",
          ...(unreadOnly ? { readAt: null } : {}),
          deliveries: {
            some: { channel: "IN_APP", status: "DELIVERED" },
          },
        },
        include: { deliveries: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
      });
    return notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      actionUrl: notification.actionUrl,
      createdAt: notification.createdAt,
      readAt: notification.readAt,
      channels: notification.deliveries.map((delivery) => ({
        channel: delivery.channel,
        status: delivery.status,
      })),
    }));
  }

  async markRead(userId: string, notificationId: string) {
    const notification =
      await this.database.client.notificationIntent.findFirst({
        where: { id: notificationId, userId },
      });
    if (!notification)
      throw new NotFoundException({
        code: "NOTIFICATION_NOT_FOUND",
        message: "Notification was not found",
      });
    if (notification.status !== "READY")
      throw new ConflictException({
        code: "NOTIFICATION_UNAVAILABLE",
        message: "Notification is no longer available",
      });
    const readAt = notification.readAt ?? new Date();
    await this.database.client.notificationIntent.update({
      where: { id: notification.id },
      data: { readAt },
    });
    return { id: notification.id, readAt };
  }
}

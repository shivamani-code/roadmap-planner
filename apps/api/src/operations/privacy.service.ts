import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { uuidV7 } from "@studentos/domain";
import { DatabaseService } from "../config/database.service.js";

@Injectable()
export class PrivacyService {
  constructor(private readonly database: DatabaseService) {}

  async preferences(userId: string) {
    const preference =
      await this.database.client.communicationPreference.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
    return {
      analyticsConsent: preference.analyticsConsent,
      analyticsConsentAt: preference.analyticsConsentAt,
    };
  }

  async updatePreferences(
    userId: string,
    analyticsConsent: boolean,
    requestId: string,
  ) {
    const current = await this.database.client.communicationPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    await this.database.client.$transaction(async (transaction) => {
      await transaction.communicationPreference.update({
        where: { userId },
        data: {
          analyticsConsent,
          analyticsConsentAt: analyticsConsent
            ? (current.analyticsConsentAt ?? new Date())
            : null,
        },
      });
      if (current.analyticsConsent !== analyticsConsent)
        await transaction.auditLog.create({
          data: {
            id: uuidV7(),
            actorType: "USER",
            actorId: userId,
            action: analyticsConsent
              ? "privacy.analytics-consent.granted"
              : "privacy.analytics-consent.revoked",
            targetType: "CommunicationPreference",
            targetId: userId,
            requestId,
          },
        });
    });
    return this.preferences(userId);
  }

  async exportAccount(userId: string, requestId: string) {
    const client = this.database.client;
    const identity = await client.user.findFirst({
      where: { id: userId, status: "ACTIVE" },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        locale: true,
        timezone: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!identity)
      throw new NotFoundException({
        code: "ACCOUNT_NOT_FOUND",
        message: "The account is unavailable",
      });

    const [
      academicProfile,
      careerGoals,
      assessments,
      evidence,
      skills,
      availability,
      gapAnalyses,
      roadmaps,
      generationJobs,
      planningWeeks,
      roadmapTasks,
      taskOccurrences,
      taskCommands,
      taskCompletions,
      projects,
      placementProfile,
      placementMetrics,
      progressSnapshots,
      weeklyReviews,
      examPeriods,
      revisionDiffs,
      communicationPreferences,
      notifications,
      aiExplanations,
      aiAudits,
      feedback,
      auditTrail,
    ] = await Promise.all([
      client.studentProfile.findUnique({
        where: { userId },
        include: { versions: { orderBy: { version: "asc" } } },
      }),
      client.careerGoal.findMany({
        where: { userId },
        include: { versions: { orderBy: { version: "asc" } } },
        orderBy: { createdAt: "asc" },
      }),
      client.skillAssessment.findMany({
        where: { userId },
        include: { responses: true },
        orderBy: { createdAt: "asc" },
      }),
      client.skillEvidence.findMany({
        where: { userId },
        orderBy: { occurredAt: "asc" },
      }),
      client.studentSkill.findMany({ where: { userId } }),
      client.studyAvailability.findMany({
        where: { userId },
        orderBy: { effectiveFrom: "asc" },
      }),
      client.gapAnalysis.findMany({
        where: { userId },
        include: { items: true },
        orderBy: { createdAt: "asc" },
      }),
      client.roadmap.findMany({
        where: { userId },
        include: {
          revisions: {
            include: {
              terms: {
                include: {
                  milestones: { include: { prerequisites: true } },
                },
                orderBy: { sequence: "asc" },
              },
            },
            orderBy: { version: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      client.generationJob.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      }),
      client.planningWeek.findMany({
        where: { userId },
        include: { days: { orderBy: { localDate: "asc" } } },
        orderBy: { weekStart: "asc" },
      }),
      client.roadmapTask.findMany({
        where: { userId },
        orderBy: [{ revisionId: "asc" }, { sequence: "asc" }],
      }),
      client.taskOccurrence.findMany({
        where: { userId },
        orderBy: [{ scheduledDate: "asc" }, { startMinute: "asc" }],
      }),
      client.taskCommandRecord.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      }),
      client.taskCompletion.findMany({
        where: { userId },
        orderBy: { completedAt: "asc" },
      }),
      client.studentProject.findMany({
        where: { userId },
        include: { milestones: true },
        orderBy: { createdAt: "asc" },
      }),
      client.placementProfile.findUnique({ where: { userId } }),
      client.placementMetric.findMany({
        where: { userId },
        orderBy: { calculatedAt: "asc" },
      }),
      client.progressSnapshot.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      }),
      client.weeklyReview.findMany({
        where: { userId },
        orderBy: { submittedAt: "asc" },
      }),
      client.examPeriod.findMany({
        where: { userId },
        orderBy: { startDate: "asc" },
      }),
      client.roadmapRevisionDiff.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      }),
      client.communicationPreference.findUnique({
        where: { userId },
        include: { typePreferences: true },
      }),
      client.notificationIntent.findMany({
        where: { userId },
        include: { deliveries: true },
        orderBy: { createdAt: "asc" },
      }),
      client.aiExplanationCache.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      }),
      client.aiRequestAudit.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      }),
      client.pilotFeedback.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      }),
      client.auditLog.findMany({
        where: {
          OR: [
            { actorType: "USER", actorId: userId },
            { targetType: "User", targetId: userId },
          ],
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    await client.auditLog.create({
      data: {
        id: uuidV7(),
        actorType: "USER",
        actorId: userId,
        action: "privacy.export.completed",
        targetType: "User",
        targetId: userId,
        requestId,
      },
    });
    return {
      schemaVersion: "studentos-export-1.0.0",
      generatedAt: new Date().toISOString(),
      identity,
      academics: { profile: academicProfile },
      career: { goals: careerGoals },
      learning: { assessments, evidence, skills, availability, gapAnalyses },
      roadmap: { roadmaps, generationJobs, revisionDiffs },
      execution: {
        planningWeeks,
        roadmapTasks,
        taskOccurrences,
        taskCommands,
        taskCompletions,
      },
      projects,
      progress: {
        placementProfile,
        placementMetrics,
        progressSnapshots,
        weeklyReviews,
      },
      calendar: { examPeriods },
      communication: {
        preferences: communicationPreferences,
        notifications,
        aiExplanations,
        aiAudits,
      },
      pilot: { feedback },
      auditTrail,
    };
  }

  async requestDeletion(userId: string, requestId: string) {
    const now = new Date();
    const purgeAfter = new Date(now.getTime() + 30 * 86_400_000);
    await this.database.client.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({ where: { id: userId } });
      if (!user || user.status !== "ACTIVE")
        throw new ConflictException({
          code: "ACCOUNT_NOT_ACTIVE",
          message: "The account is not active",
        });
      const [jobs, aiCache] = await Promise.all([
        transaction.generationJob.findMany({
          where: { userId, status: { in: ["QUEUED", "RUNNING"] } },
          select: { id: true },
        }),
        transaction.aiExplanationCache.findMany({
          where: { userId },
          select: { inputHash: true },
        }),
      ]);
      await transaction.user.update({
        where: { id: userId },
        data: {
          status: "DELETION_PENDING",
          deletedAt: now,
          lockVersion: { increment: 1 },
        },
      });
      await transaction.accountDeletionTombstone.upsert({
        where: { userId },
        create: {
          userId,
          status: "PENDING",
          requestedAt: now,
          purgeAfter,
          requestId,
        },
        update: {
          status: "PENDING",
          requestedAt: now,
          purgeAfter,
          recoveredAt: null,
          purgedAt: null,
          requestId,
        },
      });
      await transaction.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await transaction.generationJob.updateMany({
        where: { userId, status: { in: ["QUEUED", "RUNNING"] } },
        data: {
          status: "FAILED",
          stage: "CANCELLED",
          errorCode: "ACCOUNT_DELETION",
          errorDetail: "Cancelled because account deletion was requested",
          completedAt: now,
        },
      });
      await transaction.notificationDelivery.updateMany({
        where: {
          notification: { userId },
          status: "PENDING",
        },
        data: {
          status: "SUPPRESSED",
          suppressionReason: "ACCOUNT_DELETION",
        },
      });
      await transaction.notificationIntent.updateMany({
        where: { userId, status: "READY" },
        data: {
          status: "SUPPRESSED",
          suppressionReason: "ACCOUNT_DELETION",
        },
      });
      await transaction.outboxEvent.updateMany({
        where: {
          status: { in: ["PENDING", "PROCESSING"] },
          OR: [
            { aggregateType: "User", aggregateId: userId },
            {
              aggregateType: "GenerationJob",
              aggregateId: { in: jobs.map(({ id }) => id) },
            },
            {
              aggregateType: "AiExplanation",
              aggregateId: {
                in: aiCache.map(({ inputHash }) => inputHash),
              },
            },
          ],
        },
        data: { status: "FAILED", lastError: "ACCOUNT_DELETION" },
      });
      await transaction.auditLog.create({
        data: {
          id: uuidV7(),
          actorType: "USER",
          actorId: userId,
          action: "privacy.account-deletion.requested",
          targetType: "User",
          targetId: userId,
          requestId,
        },
      });
    });
    return {
      status: "DELETION_PENDING" as const,
      disabledAt: now,
      purgeEligibleAt: purgeAfter,
      recovery: "Contact support before the purge-eligible date.",
    };
  }

  async recoverAccount(actorId: string, userId: string, requestId: string) {
    const cutoff = new Date(Date.now() - 30 * 86_400_000);
    await this.database.client.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({ where: { id: userId } });
      if (
        !user ||
        user.status !== "DELETION_PENDING" ||
        !user.deletedAt ||
        user.deletedAt < cutoff
      )
        throw new ConflictException({
          code: "ACCOUNT_NOT_RECOVERABLE",
          message: "The account is not within the recovery window",
        });
      await transaction.user.update({
        where: { id: userId },
        data: {
          status: "ACTIVE",
          deletedAt: null,
          lockVersion: { increment: 1 },
        },
      });
      await transaction.accountDeletionTombstone.update({
        where: { userId },
        data: { status: "RECOVERED", recoveredAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          id: uuidV7(),
          actorType: "ADMIN",
          actorId,
          action: "privacy.account-deletion.recovered",
          targetType: "User",
          targetId: userId,
          requestId,
        },
      });
    });
    return {
      status: "ACTIVE" as const,
      recoveredAt: new Date(),
      note: "The student must sign in again; cancelled work stays cancelled.",
    };
  }
}

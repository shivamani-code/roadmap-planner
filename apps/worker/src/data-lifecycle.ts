import { createHash } from "node:crypto";
import type { DatabaseClient } from "@studentos/database";

const DAY_MS = 86_400_000;

function anonymizedReference(userId: string): string {
  return `purged:${createHash("sha256").update(userId).digest("hex").slice(0, 32)}`;
}

export class DataLifecycleService {
  readonly #now: () => Date;

  constructor(
    private readonly database: DatabaseClient,
    now: () => Date = () => new Date(),
  ) {
    this.#now = now;
  }

  async runSweep(): Promise<{
    expiredAiCache: number;
    expiredAiAudits: number;
    expiredNotifications: number;
    expiredVerificationTokens: number;
    expiredSessions: number;
    expiredAudits: number;
    reappliedTombstones: number;
    purgedAccounts: number;
  }> {
    const now = this.#now();
    const aiAuditCutoff = new Date(now.getTime() - 30 * DAY_MS);
    const notificationCutoff = new Date(now.getTime() - 90 * DAY_MS);
    const auditCutoff = new Date(now.getTime() - 365 * DAY_MS);
    const accountCutoff = new Date(now.getTime() - 30 * DAY_MS);
    const pendingTombstones =
      await this.database.accountDeletionTombstone.findMany({
        where: { status: "PENDING" },
        select: { userId: true, requestedAt: true },
        take: 1_000,
      });
    let reappliedTombstones = 0;
    for (const tombstone of pendingTombstones) {
      const reapplied = await this.database.user.updateMany({
        where: { id: tombstone.userId, status: "ACTIVE" },
        data: {
          status: "DELETION_PENDING",
          deletedAt: tombstone.requestedAt,
          lockVersion: { increment: 1 },
        },
      });
      reappliedTombstones += reapplied.count;
    }
    const [
      expiredAiCache,
      expiredAiAudits,
      expiredNotifications,
      expiredVerificationTokens,
      expiredSessions,
      expiredAudits,
    ] = await this.database.$transaction([
      this.database.aiExplanationCache.deleteMany({
        where: { expiresAt: { lte: now } },
      }),
      this.database.aiRequestAudit.deleteMany({
        where: { createdAt: { lt: aiAuditCutoff } },
      }),
      this.database.notificationIntent.deleteMany({
        where: { createdAt: { lt: notificationCutoff } },
      }),
      this.database.verificationToken.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      this.database.session.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: notificationCutoff } },
            { revokedAt: { lt: notificationCutoff } },
          ],
        },
      }),
      this.database.auditLog.deleteMany({
        where: { createdAt: { lt: auditCutoff } },
      }),
    ]);
    const candidates = await this.database.user.findMany({
      where: {
        status: "DELETION_PENDING",
        deletedAt: { lte: accountCutoff },
      },
      select: { id: true, normalizedEmail: true },
      orderBy: { deletedAt: "asc" },
      take: 25,
    });
    let purgedAccounts = 0;
    for (const candidate of candidates) {
      await this.purgeAccount(candidate.id, candidate.normalizedEmail);
      purgedAccounts += 1;
    }
    return {
      expiredAiCache: expiredAiCache.count,
      expiredAiAudits: expiredAiAudits.count,
      expiredNotifications: expiredNotifications.count,
      expiredVerificationTokens: expiredVerificationTokens.count,
      expiredSessions: expiredSessions.count,
      expiredAudits: expiredAudits.count,
      reappliedTombstones,
      purgedAccounts,
    };
  }

  private async purgeAccount(
    userId: string,
    normalizedEmail: string,
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const [profile, revisions, occurrences, projectProgress, exams, aiCache] =
        await Promise.all([
          transaction.studentProfile.findUnique({
            where: { userId },
            select: { id: true },
          }),
          transaction.roadmapRevision.findMany({
            where: { roadmap: { userId } },
            select: { id: true },
          }),
          transaction.taskOccurrence.findMany({
            where: { userId },
            select: { id: true },
          }),
          transaction.projectMilestoneProgress.findMany({
            where: { studentProject: { userId } },
            select: { id: true },
          }),
          transaction.examPeriod.findMany({
            where: { userId },
            select: { id: true },
          }),
          transaction.aiExplanationCache.findMany({
            where: { userId },
            select: { inputHash: true },
          }),
        ]);
      await transaction.projectMilestoneProgress.updateMany({
        where: { reviewerId: userId },
        data: { reviewerId: null },
      });
      await transaction.auditLog.updateMany({
        where: { actorType: "USER", actorId: userId },
        data: { actorId: null },
      });
      await transaction.auditLog.updateMany({
        where: { targetType: "User", targetId: userId },
        data: { targetId: anonymizedReference(userId) },
      });
      await transaction.outboxEvent.deleteMany({
        where: {
          OR: [
            { aggregateType: "User", aggregateId: userId },
            ...(profile
              ? [
                  {
                    aggregateType: "StudentProfile" as const,
                    aggregateId: profile.id,
                  },
                ]
              : []),
            {
              aggregateType: "RoadmapRevision",
              aggregateId: { in: revisions.map(({ id }) => id) },
            },
            {
              aggregateType: "TaskOccurrence",
              aggregateId: { in: occurrences.map(({ id }) => id) },
            },
            {
              aggregateType: "ProjectMilestoneProgress",
              aggregateId: { in: projectProgress.map(({ id }) => id) },
            },
            {
              aggregateType: "ExamPeriod",
              aggregateId: { in: exams.map(({ id }) => id) },
            },
            {
              aggregateType: "AiExplanation",
              aggregateId: { in: aiCache.map(({ inputHash }) => inputHash) },
            },
          ],
        },
      });
      await transaction.verificationToken.deleteMany({
        where: { normalizedEmail },
      });

      await transaction.roadmap.updateMany({
        where: { userId },
        data: { activeRevisionId: null },
      });
      await transaction.roadmapRevision.updateMany({
        where: { roadmap: { userId } },
        data: { supersedesId: null },
      });
      await transaction.roadmapTask.updateMany({
        where: { userId },
        data: {
          retainedFromTaskId: null,
          satisfiedByCompletionId: null,
        },
      });
      await transaction.taskOccurrence.updateMany({
        where: { userId },
        data: { originalOccurrenceId: null },
      });
      await transaction.roadmapMilestoneDependency.deleteMany({
        where: { milestone: { term: { revision: { roadmap: { userId } } } } },
      });

      await transaction.weeklyReview.deleteMany({ where: { userId } });
      await transaction.progressSnapshot.deleteMany({ where: { userId } });
      await transaction.placementMetric.deleteMany({ where: { userId } });
      await transaction.studentProject.deleteMany({ where: { userId } });
      await transaction.taskCommandRecord.deleteMany({ where: { userId } });
      await transaction.taskCompletion.deleteMany({ where: { userId } });
      await transaction.taskOccurrence.deleteMany({ where: { userId } });
      await transaction.planningWeek.deleteMany({ where: { userId } });
      await transaction.roadmapTask.deleteMany({ where: { userId } });
      await transaction.generationJob.deleteMany({ where: { userId } });
      await transaction.roadmap.deleteMany({ where: { userId } });
      await transaction.gapAnalysis.deleteMany({ where: { userId } });
      await transaction.skillAssessment.deleteMany({ where: { userId } });
      await transaction.skillEvidence.deleteMany({ where: { userId } });
      await transaction.studentSkill.deleteMany({ where: { userId } });
      await transaction.studyAvailability.deleteMany({ where: { userId } });
      await transaction.careerGoal.deleteMany({ where: { userId } });
      await transaction.studentProfile.deleteMany({ where: { userId } });
      await transaction.examPeriod.deleteMany({ where: { userId } });
      await transaction.placementProfile.deleteMany({ where: { userId } });
      await transaction.notificationIntent.deleteMany({ where: { userId } });
      await transaction.aiExplanationCache.deleteMany({ where: { userId } });
      await transaction.aiRequestAudit.deleteMany({ where: { userId } });
      await transaction.pilotFeedback.deleteMany({ where: { userId } });
      await transaction.notificationTypePreference.deleteMany({
        where: { userId },
      });
      await transaction.communicationPreference.deleteMany({
        where: { userId },
      });
      await transaction.session.deleteMany({ where: { userId } });
      await transaction.authAccount.deleteMany({ where: { userId } });
      await transaction.adminMembership.deleteMany({ where: { userId } });
      await transaction.user.delete({ where: { id: userId } });
      await transaction.accountDeletionTombstone.update({
        where: { userId },
        data: { status: "PURGED", purgedAt: this.#now() },
      });
    });
  }
}

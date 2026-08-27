import { Injectable, UnprocessableEntityException } from "@nestjs/common";
import { uuidV7 } from "@studentos/domain";
import { DatabaseService } from "../config/database.service.js";

const DAY_MS = 86_400_000;

function percentage(numerator: number, denominator: number): number | null {
  return denominator === 0
    ? null
    : Math.round((numerator / denominator) * 10_000) / 100;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

@Injectable()
export class PilotService {
  constructor(private readonly database: DatabaseService) {}

  async addFeedback(
    userId: string,
    input: { surface: string; rating: number; comment?: string },
  ) {
    return this.database.client.pilotFeedback.create({
      data: { id: uuidV7(), userId, ...input },
      select: {
        id: true,
        surface: true,
        rating: true,
        comment: true,
        createdAt: true,
      },
    });
  }

  listFeedback(userId: string) {
    return this.database.client.pilotFeedback.findMany({
      where: { userId },
      select: {
        id: true,
        surface: true,
        rating: true,
        comment: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  async metrics(sinceText: string | undefined) {
    const since = sinceText
      ? new Date(`${sinceText}T00:00:00.000Z`)
      : new Date(Date.now() - 28 * DAY_MS);
    if (
      Number.isNaN(since.getTime()) ||
      (sinceText !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(sinceText))
    )
      throw new UnprocessableEntityException({
        code: "INVALID_SINCE_DATE",
        message: "Since must use YYYY-MM-DD",
      });
    const consented = await this.database.client.user.findMany({
      where: {
        createdAt: { gte: since },
        communicationPreference: { is: { analyticsConsent: true } },
      },
      select: { id: true, createdAt: true },
    });
    const userIds = consented.map(({ id }) => id);
    const [profiles, roadmaps, completions, jobs, feedback] = await Promise.all(
      [
        this.database.client.studentProfile.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, onboardingStatus: true },
        }),
        this.database.client.roadmap.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, activeRevisionId: true },
        }),
        this.database.client.taskCompletion.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, completedAt: true },
        }),
        this.database.client.generationJob.findMany({
          where: { userId: { in: userIds } },
          select: {
            status: true,
            errorCode: true,
            createdAt: true,
            completedAt: true,
          },
        }),
        this.database.client.pilotFeedback.findMany({
          where: { userId: { in: userIds }, createdAt: { gte: since } },
          select: { rating: true },
        }),
      ],
    );
    const startedIds = new Set(profiles.map(({ userId }) => userId));
    const activatedIds = new Set(
      roadmaps
        .filter(({ activeRevisionId }) => activeRevisionId !== null)
        .map(({ userId }) => userId),
    );
    const completionDays = new Map<string, Set<string>>();
    for (const completion of completions) {
      const dates = completionDays.get(completion.userId) ?? new Set<string>();
      dates.add(completion.completedAt.toISOString().slice(0, 10));
      completionDays.set(completion.userId, dates);
    }
    const activatedWithinSevenDays = consented.filter((user) => {
      const distinctDays = [...(completionDays.get(user.id) ?? [])].filter(
        (date) =>
          new Date(`${date}T00:00:00.000Z`).getTime() <=
          user.createdAt.getTime() + 7 * DAY_MS,
      );
      return distinctDays.length >= 2;
    }).length;
    const weekFour = consented.filter((user) =>
      completions.some(
        (completion) =>
          completion.userId === user.id &&
          completion.completedAt.getTime() >=
            user.createdAt.getTime() + 21 * DAY_MS &&
          completion.completedAt.getTime() <
            user.createdAt.getTime() + 28 * DAY_MS,
      ),
    ).length;
    const completedDurations = jobs
      .filter((job) => job.status === "COMPLETED" && job.completedAt !== null)
      .map((job) => job.completedAt!.getTime() - job.createdAt.getTime());
    const hardFailures = jobs.filter(
      (job) => job.status === "FAILED" && job.errorCode?.includes("INVARIANT"),
    ).length;
    return {
      cohortSince: since.toISOString().slice(0, 10),
      consentedStudents: consented.length,
      onboardingStarted: startedIds.size,
      roadmapActivated: activatedIds.size,
      roadmapActivationRate: percentage(activatedIds.size, startedIds.size),
      sevenDayActivationRate: percentage(
        activatedWithinSevenDays,
        activatedIds.size,
      ),
      weekFourRetentionRate: percentage(weekFour, activatedIds.size),
      generation: {
        attempts: jobs.length,
        medianMilliseconds: median(completedDurations),
        hardInvariantFailureRate: percentage(hardFailures, jobs.length),
      },
      usefulness: {
        responses: feedback.length,
        medianRating: median(feedback.map(({ rating }) => rating)),
      },
      traceAccuracy: {
        sampledTasks: 0,
        passingPercent: null,
        status: "HUMAN_REVIEW_REQUIRED",
      },
    };
  }
}

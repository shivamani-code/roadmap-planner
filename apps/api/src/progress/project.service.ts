import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { aggregateEvidence, scoreProject } from "@studentos/planning";
import {
  validateProjectTemplates,
  type ProjectTemplateImport,
} from "@studentos/career";
import { uuidV7 } from "@studentos/domain";
import { Prisma } from "@studentos/database";
import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { DatabaseService } from "../config/database.service.js";

function jsonValue(input: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
}

function validatePayload(payload: unknown): ProjectTemplateImport {
  const result = validateProjectTemplates(payload);
  if (!result.valid || !result.data)
    throw new UnprocessableEntityException({
      code: "INVALID_PROJECT_DATASET",
      message: result.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; "),
    });
  return result.data;
}

function validateArtifactUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UnprocessableEntityException({
      code: "INVALID_ARTIFACT_URL",
      message: "Artifact URL is invalid",
    });
  }
  if (
    url.protocol !== "https:" ||
    ![
      "github.com",
      "gitlab.com",
      "docs.google.com",
      "vercel.app",
      "netlify.app",
    ].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  )
    throw new UnprocessableEntityException({
      code: "ARTIFACT_HOST_NOT_ALLOWED",
      message: "Artifact must use an approved HTTPS host",
    });
}

@Injectable()
export class ProjectService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async stage(editorId: string, payloadValue: unknown) {
    const payload = validatePayload(payloadValue);
    const existing = await this.database.client.contentImport.findFirst({
      where: { datasetType: "PROJECT", datasetVersion: payload.datasetVersion },
    });
    if (existing)
      throw new ConflictException({
        code: "PROJECT_VERSION_EXISTS",
        message: "That project dataset version already exists",
      });
    const career = await this.database.client.careerDataset.findFirst({
      where: { status: "PUBLISHED" },
      include: { roles: true, skills: true },
    });
    if (!career)
      throw new UnprocessableEntityException({
        code: "CAREER_DATASET_REQUIRED",
        message: "Publish career knowledge before projects",
      });
    const roleKeys = new Set(career.roles.map(({ stableKey }) => stableKey));
    const skillKeys = new Set(career.skills.map(({ stableKey }) => stableKey));
    const missing = payload.projects.flatMap((project) => [
      ...project.roleKeys
        .filter((key) => !roleKeys.has(key))
        .map((key) => `role:${key}`),
      ...project.prerequisites
        .filter(({ skillKey }) => !skillKeys.has(skillKey))
        .map(({ skillKey }) => `skill:${skillKey}`),
      ...project.milestones.flatMap((milestone) =>
        milestone.skillOutcomes
          .filter((key) => !skillKeys.has(key))
          .map((key) => `outcome:${key}`),
      ),
    ]);
    if (missing.length > 0)
      throw new UnprocessableEntityException({
        code: "PROJECT_REFERENCE_MISSING",
        message: [...new Set(missing)].join(", "),
      });
    const contentImport = await this.database.client.contentImport.create({
      data: {
        id: uuidV7(),
        datasetType: "PROJECT",
        datasetVersion: payload.datasetVersion,
        status: "IN_REVIEW",
        editorId,
        payload: jsonValue(payload),
      },
    });
    return {
      importId: contentImport.id,
      status: contentImport.status,
      projectCount: payload.projects.length,
    };
  }

  async publish(importId: string, reviewerId: string, requestId: string) {
    const contentImport = await this.database.client.contentImport.findFirst({
      where: { id: importId, datasetType: "PROJECT" },
    });
    if (!contentImport)
      throw new NotFoundException({
        code: "IMPORT_NOT_FOUND",
        message: "Project import was not found",
      });
    if (contentImport.status !== "IN_REVIEW")
      throw new ConflictException({
        code: "IMPORT_NOT_REVIEWABLE",
        message: "Project import is not in review",
      });
    if (contentImport.editorId === reviewerId)
      throw new UnprocessableEntityException({
        code: "REVIEW_SEPARATION_REQUIRED",
        message: "Reviewer must be different from editor",
      });
    const payload = validatePayload(contentImport.payload);
    if (this.config.NODE_ENV === "production" && payload.synthetic)
      throw new UnprocessableEntityException({
        code: "SYNTHETIC_PROJECTS_FORBIDDEN",
        message: "Synthetic projects cannot be published in production",
      });
    const career = await this.database.client.careerDataset.findFirstOrThrow({
      where: { status: "PUBLISHED" },
      include: { roles: true, skills: true },
    });
    const roleByKey = new Map(
      career.roles.map((role) => [role.stableKey, role]),
    );
    const skillByKey = new Map(
      career.skills.map((skill) => [skill.stableKey, skill]),
    );
    return this.database.client.$transaction(async (transaction) => {
      await transaction.projectDataset.updateMany({
        where: { status: "PUBLISHED" },
        data: { status: "SUPERSEDED" },
      });
      const datasetId = uuidV7();
      await transaction.projectDataset.create({
        data: {
          id: datasetId,
          careerDatasetId: career.id,
          sourceImportId: contentImport.id,
          datasetVersion: payload.datasetVersion,
          status: "PUBLISHED",
          synthetic: payload.synthetic,
          editorId: contentImport.editorId,
          reviewerId,
          reviewRationale:
            "Validated project schema, role fit, prerequisites, milestone weights, and outcomes.",
          publishedAt: new Date(),
        },
      });
      for (const project of payload.projects) {
        const projectId = uuidV7();
        await transaction.projectTemplate.create({
          data: {
            id: projectId,
            datasetId,
            stableKey: project.key,
            version: project.version,
            title: project.title,
            goal: project.goal,
            difficulty: project.difficulty,
            hoursP25: project.estimatedHours.p25,
            hoursP50: project.estimatedHours.p50,
            hoursP75: project.estimatedHours.p75,
            portfolioValue: project.portfolioValue,
            deliverables: project.deliverables,
            deploymentRequired: project.deploymentRequired,
          },
        });
        for (const roleKey of project.roleKeys)
          await transaction.projectRoleFit.create({
            data: {
              projectId,
              roleVersionId: roleByKey.get(roleKey)!.id,
              fit: 1,
            },
          });
        for (const prerequisite of project.prerequisites)
          await transaction.projectPrerequisite.create({
            data: {
              projectId,
              skillId: skillByKey.get(prerequisite.skillKey)!.id,
              threshold: prerequisite.threshold,
              type: prerequisite.type,
            },
          });
        for (const milestone of project.milestones) {
          const milestoneId = uuidV7();
          await transaction.projectMilestoneTemplate.create({
            data: {
              id: milestoneId,
              projectId,
              stableKey: milestone.key,
              title: milestone.title,
              sequence: milestone.sequence,
              weight: milestone.weight,
              estimatedMinutes: milestone.estimatedMinutes,
              completionCriteria: milestone.completionCriteria,
            },
          });
          for (const skillKey of milestone.skillOutcomes)
            await transaction.projectMilestoneSkill.create({
              data: { milestoneId, skillId: skillByKey.get(skillKey)!.id },
            });
        }
      }
      await transaction.contentImport.update({
        where: { id: contentImport.id },
        data: { status: "PUBLISHED", reviewerId },
      });
      await transaction.auditLog.create({
        data: {
          id: uuidV7(),
          actorType: "ADMIN",
          actorId: reviewerId,
          action: "project-dataset.publish",
          targetType: "ProjectDataset",
          targetId: datasetId,
          requestId,
        },
      });
      return { datasetId, status: "PUBLISHED" as const };
    });
  }

  async recommendations(userId: string) {
    const [goal, roadmap, availability, active] = await Promise.all([
      this.database.client.careerGoal.findFirst({
        where: { userId, status: "ACTIVE" },
      }),
      this.database.client.roadmap.findFirst({
        where: { userId, status: "ACTIVE", activeRevisionId: { not: null } },
      }),
      this.database.client.studyAvailability.findFirst({
        where: { userId, effectiveTo: null },
        orderBy: { effectiveFrom: "desc" },
      }),
      this.database.client.studentProject.findFirst({
        where: { userId, status: "ACTIVE" },
        include: { template: true, milestones: true },
      }),
    ]);
    if (!goal)
      throw new NotFoundException({
        code: "NO_GOAL",
        message: "An active career goal is required",
      });
    if (!roadmap)
      throw new NotFoundException({
        code: "NO_ACTIVE_ROADMAP",
        message: "An active roadmap is required before selecting a project",
      });
    const projects = await this.database.client.projectTemplate.findMany({
      where: {
        dataset: { status: "PUBLISHED", careerDatasetId: goal.datasetId },
        roleFits: { some: { roleVersionId: goal.roleVersionId } },
      },
      include: {
        roleFits: { where: { roleVersionId: goal.roleVersionId } },
        prerequisites: { include: { skill: true } },
        milestones: {
          include: { skillOutcomes: true },
          orderBy: { sequence: "asc" },
        },
      },
    });
    const skillIds = [
      ...new Set(
        projects.flatMap((project) => [
          ...project.prerequisites.map(({ skillId }) => skillId),
          ...project.milestones.flatMap(({ skillOutcomes }) =>
            skillOutcomes.map(({ skillId }) => skillId),
          ),
        ]),
      ),
    ];
    const estimates = await this.database.client.studentSkill.findMany({
      where: { userId, skillId: { in: skillIds } },
    });
    const estimateBySkill = new Map(
      estimates.map((estimate) => [estimate.skillId, estimate]),
    );
    const recommendations = projects.map((project) => {
      const blockers = project.prerequisites
        .filter(
          ({ skillId, threshold, type }) =>
            type === "HARD" &&
            Number(estimateBySkill.get(skillId)?.effectiveProficiency ?? 0) <
              Number(threshold),
        )
        .map(({ skill, threshold }) => ({
          skillId: skill.id,
          skillKey: skill.stableKey,
          skillName: skill.name,
          required: Number(threshold),
          current: Number(
            estimateBySkill.get(skill.id)?.effectiveProficiency ?? 0,
          ),
        }));
      const outcomeIds = [
        ...new Set(
          project.milestones.flatMap(({ skillOutcomes }) =>
            skillOutcomes.map(({ skillId }) => skillId),
          ),
        ),
      ];
      const missingEvidenceCoverage =
        outcomeIds.length === 0
          ? 0
          : outcomeIds.filter(
              (id) => Number(estimateBySkill.get(id)?.confidence ?? 0) < 0.7,
            ).length / outcomeIds.length;
      const alignment =
        outcomeIds.length === 0
          ? 0
          : outcomeIds.reduce((sum, id) => {
              const current = Number(
                estimateBySkill.get(id)?.effectiveProficiency ?? 0,
              );
              return sum + (current > 0 && current < 0.8 ? 1 : 0.5);
            }, 0) / outcomeIds.length;
      const requiredMinutes = Number(project.hoursP50) * 60;
      const feasibleMinutes = (availability?.weeklyMinutes ?? 0) * 0.85 * 12;
      const score = scoreProject({
        roleFit: Number(project.roleFits[0]?.fit ?? 0),
        missingEvidenceCoverage,
        currentlyLearningAlignment: alignment,
        portfolioValue: Number(project.portfolioValue),
        feasibility: Math.min(
          1,
          feasibleMinutes / Math.max(1, requiredMinutes),
        ),
        studentInterest: 0.5,
      });
      return {
        id: project.id,
        key: project.stableKey,
        title: project.title,
        goal: project.goal,
        difficulty: project.difficulty,
        estimatedHours: {
          p25: Number(project.hoursP25),
          p50: Number(project.hoursP50),
          p75: Number(project.hoursP75),
        },
        portfolioValue: Number(project.portfolioValue),
        deploymentRequired: project.deploymentRequired,
        eligible: blockers.length === 0,
        blockers,
        score,
        why:
          blockers.length === 0
            ? "Role-fit, evidence coverage, current learning, portfolio value, and capacity all passed."
            : "Hard prerequisites need stronger evidence first.",
      };
    });
    recommendations.sort(
      (left, right) =>
        Number(right.eligible) - Number(left.eligible) ||
        right.score - left.score ||
        left.key.localeCompare(right.key),
    );
    return {
      active: active
        ? {
            id: active.id,
            templateId: active.templateId,
            title: active.template.title,
            status: active.status,
            completedMilestones: active.milestones.filter(
              ({ status }) => status === "COMPLETED",
            ).length,
            totalMilestones: active.milestones.length,
          }
        : null,
      recommendations,
    };
  }

  async start(userId: string, templateId: string) {
    const result = await this.recommendations(userId);
    if (result.active)
      throw new ConflictException({
        code: "ACTIVE_PROJECT_EXISTS",
        message: "Only one primary project can be active",
      });
    const recommendation = result.recommendations.find(
      ({ id }) => id === templateId,
    );
    if (!recommendation)
      throw new NotFoundException({
        code: "PROJECT_NOT_FOUND",
        message: "Project was not found",
      });
    if (!recommendation.eligible)
      throw new UnprocessableEntityException({
        code: "PREREQUISITES_NOT_MET",
        message: "Project hard prerequisites are not yet evidenced",
        blockers: recommendation.blockers,
      });
    const template =
      await this.database.client.projectTemplate.findUniqueOrThrow({
        where: { id: templateId },
        include: { milestones: true },
      });
    const project = await this.database.client.studentProject.create({
      data: {
        id: uuidV7(),
        userId,
        templateId,
        milestones: {
          create: template.milestones.map((milestone) => ({
            id: uuidV7(),
            milestoneId: milestone.id,
          })),
        },
      },
      include: { template: true, milestones: true },
    });
    return {
      id: project.id,
      title: project.template.title,
      status: project.status,
      milestoneCount: project.milestones.length,
    };
  }

  async active(userId: string) {
    const project = await this.database.client.studentProject.findFirst({
      where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
      include: {
        template: { include: { milestones: { orderBy: { sequence: "asc" } } } },
        milestones: { include: { milestone: true } },
      },
      orderBy: { startedAt: "desc" },
    });
    if (!project)
      throw new NotFoundException({
        code: "NO_ACTIVE_PROJECT",
        message: "No student project exists",
      });
    const progressByMilestone = new Map(
      project.milestones.map((item) => [item.milestoneId, item]),
    );
    return {
      id: project.id,
      status: project.status,
      title: project.template.title,
      goal: project.template.goal,
      deliverables: project.template.deliverables,
      estimatedHours: {
        p25: Number(project.template.hoursP25),
        p50: Number(project.template.hoursP50),
        p75: Number(project.template.hoursP75),
      },
      deploymentRequired: project.template.deploymentRequired,
      progressPercent: Math.round(
        project.template.milestones.reduce(
          (sum, milestone) =>
            sum +
            (progressByMilestone.get(milestone.id)?.status === "COMPLETED"
              ? Number(milestone.weight)
              : 0),
          0,
        ) * 100,
      ),
      milestones: project.template.milestones.map((milestone) => {
        const progress = progressByMilestone.get(milestone.id)!;
        return {
          id: progress.id,
          templateId: milestone.id,
          key: milestone.stableKey,
          title: milestone.title,
          sequence: milestone.sequence,
          weight: Number(milestone.weight),
          estimatedMinutes: milestone.estimatedMinutes,
          completionCriteria: milestone.completionCriteria,
          status: progress.status,
          artifactUrl: progress.artifactUrl,
          rubricScore:
            progress.rubricScore === null ? null : Number(progress.rubricScore),
          reviewNote: progress.reviewNote,
        };
      }),
    };
  }

  async submitMilestone(
    userId: string,
    progressId: string,
    artifactUrl: string,
    note: string,
  ) {
    validateArtifactUrl(artifactUrl);
    const progress =
      await this.database.client.projectMilestoneProgress.findFirst({
        where: { id: progressId, studentProject: { userId, status: "ACTIVE" } },
        include: {
          milestone: true,
          studentProject: {
            include: { milestones: { include: { milestone: true } } },
          },
        },
      });
    if (!progress)
      throw new NotFoundException({
        code: "PROJECT_MILESTONE_NOT_FOUND",
        message: "Project milestone was not found",
      });
    if (progress.status !== "PLANNED")
      throw new ConflictException({
        code: "MILESTONE_ALREADY_SUBMITTED",
        message: "Milestone is already submitted",
      });
    const priorIncomplete = progress.studentProject.milestones.some(
      (item) =>
        item.milestone.sequence < progress.milestone.sequence &&
        item.status !== "COMPLETED",
    );
    if (priorIncomplete)
      throw new ConflictException({
        code: "PROJECT_SEQUENCE_BLOCKED",
        message: "Complete prior project milestones first",
      });
    const updated = await this.database.client.projectMilestoneProgress.update({
      where: { id: progress.id },
      data: {
        status: "SUBMITTED",
        artifactUrl,
        submissionNote: note,
        submittedAt: new Date(),
      },
    });
    return {
      id: updated.id,
      status: updated.status,
      submittedAt: updated.submittedAt,
    };
  }

  async reviewMilestone(
    reviewerId: string,
    progressId: string,
    rubricScore: number,
    reviewNote: string,
  ) {
    const progress =
      await this.database.client.projectMilestoneProgress.findUnique({
        where: { id: progressId },
        include: {
          milestone: {
            include: { skillOutcomes: { include: { skill: true } } },
          },
          studentProject: {
            include: {
              template: { include: { dataset: true } },
              milestones: true,
            },
          },
        },
      });
    if (!progress)
      throw new NotFoundException({
        code: "PROJECT_MILESTONE_NOT_FOUND",
        message: "Project milestone was not found",
      });
    if (progress.status !== "SUBMITTED" || !progress.artifactUrl)
      throw new ConflictException({
        code: "MILESTONE_NOT_REVIEWABLE",
        message: "A submitted artifact is required",
      });
    if (progress.studentProject.template.dataset.editorId === reviewerId)
      throw new UnprocessableEntityException({
        code: "REVIEW_SEPARATION_REQUIRED",
        message: "Dataset editor cannot review its project evidence",
      });
    const occurredAt = new Date();
    await this.database.client.$transaction(async (transaction) => {
      await transaction.projectMilestoneProgress.update({
        where: { id: progress.id },
        data: {
          status: "COMPLETED",
          reviewerId,
          rubricScore,
          reviewNote,
          reviewedAt: occurredAt,
          completedAt: occurredAt,
        },
      });
      for (const outcome of progress.milestone.skillOutcomes) {
        const current = await transaction.studentSkill.findUnique({
          where: {
            userId_skillId: {
              userId: progress.studentProject.userId,
              skillId: outcome.skillId,
            },
          },
        });
        const proficiency = Math.min(
          0.9,
          Number(current?.proficiency ?? 0) + 0.12 * rubricScore,
        );
        await transaction.skillEvidence.create({
          data: {
            id: uuidV7(),
            userId: progress.studentProject.userId,
            skillId: outcome.skillId,
            sourceType: "PROJECT_MILESTONE",
            sourceId: progress.id,
            proficiency,
            confidence: 0.9,
            occurredAt,
            metadata: {
              studentProjectId: progress.studentProjectId,
              milestoneId: progress.milestoneId,
              reviewerId,
              rubricScore,
              artifactUrl: progress.artifactUrl,
            },
          },
        });
        const evidence = await transaction.skillEvidence.findMany({
          where: {
            userId: progress.studentProject.userId,
            skillId: outcome.skillId,
          },
        });
        const aggregate = aggregateEvidence(
          evidence.map((item) => ({
            proficiency: Number(item.proficiency),
            confidence: Number(item.confidence),
            occurredAt: item.occurredAt,
            decayDays: outcome.skill.evidenceDecayDays,
          })),
          occurredAt,
        );
        await transaction.studentSkill.upsert({
          where: {
            userId_skillId: {
              userId: progress.studentProject.userId,
              skillId: outcome.skillId,
            },
          },
          create: {
            id: uuidV7(),
            userId: progress.studentProject.userId,
            skillId: outcome.skillId,
            proficiency: aggregate.proficiency,
            confidence: aggregate.confidence,
            effectiveProficiency: aggregate.effectiveProficiency,
            algorithmVersion: "evidence-1.0.0",
            lastEvidencedAt: occurredAt,
          },
          update: {
            proficiency: aggregate.proficiency,
            confidence: aggregate.confidence,
            effectiveProficiency: aggregate.effectiveProficiency,
            algorithmVersion: "evidence-1.0.0",
            lastEvidencedAt: occurredAt,
          },
        });
      }
      const remaining = await transaction.projectMilestoneProgress.count({
        where: {
          studentProjectId: progress.studentProjectId,
          id: { not: progress.id },
          status: { not: "COMPLETED" },
        },
      });
      if (remaining === 0)
        await transaction.studentProject.update({
          where: { id: progress.studentProjectId },
          data: { status: "COMPLETED", completedAt: occurredAt },
        });
      await transaction.outboxEvent.create({
        data: {
          id: uuidV7(),
          aggregateType: "ProjectMilestoneProgress",
          aggregateId: progress.id,
          eventType: "project.milestone-reviewed.v1",
          payload: { studentProjectId: progress.studentProjectId, rubricScore },
        },
      });
    });
    return { id: progress.id, status: "COMPLETED" as const, rubricScore };
  }
}

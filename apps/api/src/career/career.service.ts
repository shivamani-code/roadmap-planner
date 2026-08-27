import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  productionCareerIssues,
  validateCareerKnowledge,
  type CareerValidationIssue,
} from "@studentos/career";
import type {
  CareerGoalResponse,
  CareerRoleOption,
  StudentCareerCatalog,
  TargetLevel,
} from "@studentos/contracts";
import { uuidV7 } from "@studentos/domain";
import { Prisma } from "@studentos/database";
import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { DatabaseService } from "../config/database.service.js";

export interface CareerImportResult {
  importId: string;
  datasetId: string | null;
  status: "DRAFT" | "IN_REVIEW";
  issues: CareerValidationIssue[];
  coverageGaps: string[];
  statistics: {
    skills: number;
    roles: number;
    requirements: number;
    learningUnits: number;
  };
}

export interface CareerGoalInput {
  roleVersionId: string;
  targetLevel: TargetLevel;
  deadline: string;
  deadlineBasis: string;
  lockVersion?: number;
}

function jsonValue(input: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
}

function domainName(key: string): string {
  return key
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const BRANCH_CAREER_DOMAINS: Readonly<Record<string, readonly string[]>> = {
  AIDS: [
    "data-and-ai",
    "software-development",
    "data-platforms",
    "cloud-and-platform",
    "product-and-business",
  ],
  AIML: [
    "data-and-ai",
    "software-development",
    "data-platforms",
    "cloud-and-platform",
  ],
  BT: ["biotechnology", "data-and-ai"],
  CE: ["civil-engineering", "geospatial", "product-and-business"],
  CSBS: [
    "software-development",
    "product-and-business",
    "data-and-ai",
    "data-platforms",
    "cloud-and-platform",
    "software-quality",
  ],
  CSD: [
    "software-development",
    "product-and-business",
    "data-and-ai",
    "software-quality",
  ],
  CSE: [
    "software-development",
    "data-and-ai",
    "data-platforms",
    "cloud-and-platform",
    "cybersecurity",
    "networks-and-telecom",
    "software-quality",
    "product-and-business",
  ],
  CSE_AIML: [
    "data-and-ai",
    "software-development",
    "data-platforms",
    "cloud-and-platform",
  ],
  CSE_CYBER: [
    "cybersecurity",
    "networks-and-telecom",
    "cloud-and-platform",
    "software-development",
  ],
  CSE_DS: [
    "data-and-ai",
    "data-platforms",
    "software-development",
    "product-and-business",
  ],
  CSE_IOT_CYBER: [
    "electronics-and-embedded",
    "cybersecurity",
    "networks-and-telecom",
    "robotics-and-automation",
    "cloud-and-platform",
  ],
  CSE_NETWORKS: [
    "networks-and-telecom",
    "cloud-and-platform",
    "cybersecurity",
    "software-development",
  ],
  CSIT: [
    "software-development",
    "cloud-and-platform",
    "data-and-ai",
    "data-platforms",
    "cybersecurity",
    "networks-and-telecom",
    "software-quality",
  ],
  ECE: [
    "electronics-and-embedded",
    "networks-and-telecom",
    "robotics-and-automation",
    "software-development",
  ],
  IT: [
    "software-development",
    "cloud-and-platform",
    "data-and-ai",
    "data-platforms",
    "cybersecurity",
    "networks-and-telecom",
    "software-quality",
  ],
  ME: [
    "mechanical-engineering",
    "robotics-and-automation",
    "product-and-business",
  ],
  MINING: ["mining-engineering", "geospatial", "civil-engineering"],
};

@Injectable()
export class CareerService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async listRoles(): Promise<CareerRoleOption[]> {
    const latestDataset = await this.database.client.careerDataset.findFirst({
      where: {
        status: "PUBLISHED",
        ...(this.config.NODE_ENV === "production" ? { synthetic: false } : {}),
      },
      orderBy: [{ publishedAt: "desc" }, { datasetVersion: "desc" }],
      select: { id: true },
    });
    if (!latestDataset) return [];
    const roles = await this.database.client.careerRoleVersion.findMany({
      where: {
        datasetId: latestDataset.id,
        dataset: {
          status: "PUBLISHED",
          ...(this.config.NODE_ENV === "production"
            ? { synthetic: false }
            : {}),
        },
      },
      include: {
        dataset: true,
        domain: true,
        requirements: {
          include: { skill: true },
          orderBy: [{ targetLevel: "asc" }, { importance: "desc" }],
        },
      },
      orderBy: [{ domain: { name: "asc" } }, { name: "asc" }],
    });
    return roles.map((role) => {
      const levels = [
        ...new Set(role.requirements.map(({ targetLevel }) => targetLevel)),
      ];
      return {
        roleVersionId: role.id,
        datasetVersion: role.dataset.datasetVersion,
        domain: {
          id: role.domain.id,
          key: role.domain.stableKey,
          name: role.domain.name,
        },
        role: { key: role.stableKey, name: role.name, version: role.version },
        targetLevels: levels.map((level) => {
          const requirements = role.requirements.filter(
            ({ targetLevel }) => targetLevel === level,
          );
          return {
            level,
            requiredSkillCount: requirements.filter(({ required }) => required)
              .length,
            optionalSkillCount: requirements.filter(({ required }) => !required)
              .length,
            estimatedHoursP50: requirements.reduce(
              (sum, { hoursP50 }) => sum + Number(hoursP50),
              0,
            ),
            topSkills: requirements.slice(0, 4).map(({ skill }) => skill.name),
          };
        }),
        synthetic: role.dataset.synthetic,
      };
    });
  }

  async listRolesForStudent(userId: string): Promise<StudentCareerCatalog> {
    const [roles, profile] = await Promise.all([
      this.listRoles(),
      this.database.client.studentProfile.findUnique({
        where: { userId },
        include: {
          curriculumProgram: {
            include: { branch: true, degree: true },
          },
        },
      }),
    ]);
    const program = profile?.curriculumProgram;
    if (!program) {
      throw new UnprocessableEntityException({
        code: "ACADEMIC_PROFILE_REQUIRED",
        message: "Complete the academic step before selecting a career goal",
      });
    }

    const roleIds = roles.map(({ roleVersionId }) => roleVersionId);
    const [requirements, mappings] = await Promise.all([
      this.database.client.roleSkillRequirement.findMany({
        where: {
          roleVersionId: { in: roleIds },
          targetLevel: "INTERNSHIP_READY",
          required: true,
        },
        include: { skill: true },
      }),
      this.database.client.curriculumSkillMapping.findMany({
        where: { curriculumTopic: { programId: program.id } },
        include: {
          skill: true,
          curriculumTopic: {
            include: { unit: { include: { subject: true } } },
          },
        },
        orderBy: [{ confidence: "desc" }, { depth: "desc" }],
      }),
    ]);

    const curriculumBySkill = new Map<
      string,
      { weight: number; skillName: string; subjects: Set<string> }
    >();
    for (const mapping of mappings) {
      const weight = Number(mapping.depth) * Number(mapping.confidence);
      const current = curriculumBySkill.get(mapping.skillId);
      if (!current) {
        curriculumBySkill.set(mapping.skillId, {
          weight,
          skillName: mapping.skill.name,
          subjects: new Set([mapping.curriculumTopic.unit.subject.title]),
        });
      } else {
        current.weight = Math.max(current.weight, weight);
        current.subjects.add(mapping.curriculumTopic.unit.subject.title);
      }
    }

    const requirementByRole = new Map<string, typeof requirements>();
    for (const requirement of requirements) {
      const current = requirementByRole.get(requirement.roleVersionId) ?? [];
      current.push(requirement);
      requirementByRole.set(requirement.roleVersionId, current);
    }

    const scored = roles.map((role) => {
      const roleRequirements = requirementByRole.get(role.roleVersionId) ?? [];
      let possible = 0;
      let covered = 0;
      const matchedSkills: string[] = [];
      const subjects = new Set<string>();
      for (const requirement of roleRequirements) {
        const importance = Number(requirement.importance);
        const placement = Number(requirement.placementRelevance);
        const requirementWeight = importance * placement;
        possible += requirementWeight;
        const mapping = curriculumBySkill.get(requirement.skillId);
        if (!mapping) continue;
        covered += requirementWeight * mapping.weight;
        matchedSkills.push(mapping.skillName);
        for (const subject of mapping.subjects) subjects.add(subject);
      }
      const score = possible === 0 ? 0 : Math.round((covered / possible) * 100);
      return {
        role,
        score,
        matchedSkills: [...new Set(matchedSkills)],
        subjects: [...subjects],
        totalSkillCount: roleRequirements.length,
      };
    });

    const ranked = [...scored].sort(
      (left, right) =>
        right.score - left.score ||
        right.matchedSkills.length - left.matchedSkills.length ||
        left.role.role.name.localeCompare(right.role.role.name),
    );
    const alignedDomains = new Set(BRANCH_CAREER_DOMAINS[program.branch.code]);
    const branchAligned = ranked.filter((item) =>
      alignedDomains.has(item.role.domain.key),
    );
    const recommendedIds = new Set(
      (branchAligned.length > 0
        ? branchAligned
        : ranked
            .filter((item) => item.matchedSkills.length > 0)
            .slice(0, Math.min(12, Math.max(8, ranked.length)))
      ).map(({ role }) => role.roleVersionId),
    );
    const enriched = scored
      .map(({ role, score, matchedSkills, subjects, totalSkillCount }) => {
        const recommended = recommendedIds.has(role.roleVersionId);
        const band: NonNullable<CareerRoleOption["relevance"]>["band"] =
          score >= 35 ? "STRONG" : score > 0 ? "RELATED" : "EXPLORE";
        return {
          ...role,
          relevance: {
            score,
            matchedSkillCount: matchedSkills.length,
            totalSkillCount,
            matchedSkills: matchedSkills.slice(0, 5),
            supportingSubjects: subjects.slice(0, 4),
            band,
            recommended,
            explanation:
              recommended && matchedSkills.length > 0
                ? `${program.branch.code} coursework supports ${matchedSkills.length} required skill${matchedSkills.length === 1 ? "" : "s"} for this role.`
                : recommended
                  ? `This career domain is aligned with ${program.branch.code}, but the reviewed curriculum mapping does not yet show direct subject coverage; plan for independent preparation.`
                  : matchedSkills.length > 0
                    ? "This role has some curriculum overlap, but needs more independent preparation than the recommended set."
                    : "No reviewed direct curriculum-to-role skill match was found; choose this only as an intentional exploration path.",
          },
        };
      })
      .sort(
        (left, right) =>
          Number(right.relevance.recommended) -
            Number(left.relevance.recommended) ||
          right.relevance.score - left.relevance.score ||
          left.role.name.localeCompare(right.role.name),
      );

    return {
      branch: {
        code: program.branch.code,
        name: program.branch.name,
        degree: program.degree.name,
        curriculumVersion: program.datasetVersion,
      },
      recommendedCount: recommendedIds.size,
      totalCount: enriched.length,
      roles: enriched,
    };
  }

  async stageImport(
    payload: unknown,
    editorId: string,
  ): Promise<CareerImportResult> {
    const validation = validateCareerKnowledge(payload);
    const importId = uuidV7();
    if (!validation.valid || !validation.publishable || !validation.data) {
      const results = [
        ...validation.issues,
        ...validation.coverageGaps.map((key) => ({
          code: "MISSING_REFERENCE" as const,
          path: "/learningUnits",
          message: `Required skill has no learning unit: ${key}`,
        })),
      ];
      await this.database.client.contentImport.create({
        data: {
          id: importId,
          datasetType: "CAREER",
          ...(validation.data
            ? { datasetVersion: validation.data.datasetVersion }
            : {}),
          status: "DRAFT",
          editorId,
          payload: jsonValue(payload),
          validationResults: {
            create: results.map((result) => ({
              id: uuidV7(),
              code: result.code,
              path: result.path,
              message: result.message,
            })),
          },
        },
      });
      return {
        importId,
        datasetId: null,
        status: "DRAFT",
        issues: validation.issues,
        coverageGaps: validation.coverageGaps,
        statistics: validation.statistics,
      };
    }
    const data = validation.data;
    try {
      return await this.database.client.$transaction(async (transaction) => {
        const dataset = await transaction.careerDataset.create({
          data: {
            id: uuidV7(),
            datasetVersion: data.datasetVersion,
            status: "DRAFT",
            synthetic: data.synthetic,
            editorId,
            reviewRationale: data.review.rationale,
            reviewedAt: new Date(data.review.reviewedAt),
          },
        });
        const skillIds = new Map<string, string>();
        for (const skillInput of data.skills) {
          const id = uuidV7();
          skillIds.set(skillInput.key, id);
          await transaction.skill.create({
            data: {
              id,
              datasetId: dataset.id,
              stableKey: skillInput.key,
              name: skillInput.name,
              category: skillInput.category,
              rubricVersion: skillInput.rubricVersion,
              ...(skillInput.evidenceDecayDays === undefined
                ? {}
                : { evidenceDecayDays: skillInput.evidenceDecayDays }),
            },
          });
        }
        for (const skillInput of data.skills) {
          for (const prerequisite of skillInput.prerequisites) {
            await transaction.skillPrerequisite.create({
              data: {
                skillId: skillIds.get(skillInput.key)!,
                prerequisiteId: skillIds.get(prerequisite.skillKey)!,
                type: prerequisite.type,
                threshold: prerequisite.threshold,
              },
            });
          }
        }
        const domains = new Map<string, string>();
        for (const roleInput of data.roles) {
          let domainId = domains.get(roleInput.domainKey);
          if (!domainId) {
            domainId = uuidV7();
            domains.set(roleInput.domainKey, domainId);
            await transaction.careerDomain.create({
              data: {
                id: domainId,
                datasetId: dataset.id,
                stableKey: roleInput.domainKey,
                name: domainName(roleInput.domainKey),
              },
            });
          }
          const role = await transaction.careerRoleVersion.create({
            data: {
              id: uuidV7(),
              datasetId: dataset.id,
              domainId,
              stableKey: roleInput.key,
              name: roleInput.name,
              version: roleInput.version,
            },
          });
          for (const level of roleInput.targetLevels) {
            for (const requirement of level.requirements) {
              await transaction.roleSkillRequirement.create({
                data: {
                  id: uuidV7(),
                  roleVersionId: role.id,
                  targetLevel: level.level,
                  skillId: skillIds.get(requirement.skillKey)!,
                  requiredDepth: requirement.requiredDepth,
                  importance: requirement.importance,
                  placementRelevance: requirement.placementRelevance,
                  required: requirement.required,
                  requiredByDaysBeforeDeadline:
                    requirement.requiredByDaysBeforeDeadline,
                  hoursP25: requirement.hours.p25,
                  hoursP50: requirement.hours.p50,
                  hoursP75: requirement.hours.p75,
                  rationale: requirement.rationale,
                },
              });
            }
          }
        }
        for (const unitInput of data.learningUnits) {
          const unit = await transaction.learningUnitTemplate.create({
            data: {
              id: uuidV7(),
              datasetId: dataset.id,
              stableKey: unitInput.key,
              type: unitInput.type,
              fromDepth: unitInput.fromDepth,
              toDepth: unitInput.toDepth,
              estimatedMinutes: unitInput.estimatedMinutes,
              difficulty: unitInput.difficulty,
              splitPoints: unitInput.splitPointsMinutes,
              reasonCodes: unitInput.reasonCodes,
            },
          });
          await transaction.learningUnitSkill.createMany({
            data: unitInput.skillKeys.map((key) => ({
              learningUnitId: unit.id,
              skillId: skillIds.get(key)!,
            })),
          });
        }
        await transaction.contentImport.create({
          data: {
            id: importId,
            datasetType: "CAREER",
            datasetVersion: data.datasetVersion,
            status: "IN_REVIEW",
            editorId,
            payload: jsonValue(data),
            careerDatasetId: dataset.id,
          },
        });
        return {
          importId,
          datasetId: dataset.id,
          status: "IN_REVIEW" as const,
          issues: [],
          coverageGaps: [],
          statistics: validation.statistics,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException({
          code: "CAREER_VERSION_EXISTS",
          message: "This career dataset version already exists",
        });
      }
      throw error;
    }
  }

  async publishImport(
    importId: string,
    reviewerId: string,
    requestId: string,
  ): Promise<{ datasetId: string; status: "PUBLISHED" }> {
    const contentImport = await this.database.client.contentImport.findUnique({
      where: { id: importId },
    });
    if (!contentImport?.careerDatasetId)
      throw new NotFoundException({
        code: "IMPORT_NOT_FOUND",
        message: "Career import was not found",
      });
    if (contentImport.status !== "IN_REVIEW") {
      throw new ConflictException({
        code: "IMPORT_NOT_REVIEWABLE",
        message: "Only an import in review can be published",
      });
    }
    if (contentImport.editorId === reviewerId) {
      throw new UnprocessableEntityException({
        code: "REVIEW_SEPARATION_REQUIRED",
        message: "The reviewer must be different from the editor",
      });
    }
    const result = validateCareerKnowledge(contentImport.payload);
    if (this.config.NODE_ENV === "production") {
      const issues = productionCareerIssues(result);
      if (issues.length > 0)
        throw new UnprocessableEntityException({
          code: "CAREER_DATA_NOT_PUBLISHABLE",
          message: issues.join("; "),
        });
    }
    return this.database.client.$transaction(async (transaction) => {
      await transaction.careerDataset.updateMany({
        where: { status: "PUBLISHED" },
        data: { status: "SUPERSEDED" },
      });
      const dataset = await transaction.careerDataset.update({
        where: { id: contentImport.careerDatasetId! },
        data: { status: "PUBLISHED", reviewerId, publishedAt: new Date() },
      });
      await transaction.contentImport.update({
        where: { id: contentImport.id },
        data: { status: "PUBLISHED", reviewerId },
      });
      await transaction.auditLog.create({
        data: {
          id: uuidV7(),
          actorType: "ADMIN",
          actorId: reviewerId,
          action: "career-dataset.publish",
          targetType: "CareerDataset",
          targetId: dataset.id,
          requestId,
        },
      });
      return { datasetId: dataset.id, status: "PUBLISHED" as const };
    });
  }

  async upsertGoal(
    userId: string,
    input: CareerGoalInput,
    requestId: string,
  ): Promise<CareerGoalResponse> {
    const profile = await this.database.client.studentProfile.findUnique({
      where: { userId },
    });
    if (!profile?.curriculumProgramId || !profile.expectedGraduation) {
      throw new UnprocessableEntityException({
        code: "ACADEMIC_PROFILE_REQUIRED",
        message: "Complete the academic step before selecting a career goal",
      });
    }
    const role = await this.database.client.careerRoleVersion.findUnique({
      where: { id: input.roleVersionId },
      include: {
        dataset: true,
        requirements: {
          where: { targetLevel: input.targetLevel },
          select: { id: true },
        },
      },
    });
    if (
      !role ||
      role.dataset.status !== "PUBLISHED" ||
      role.requirements.length === 0 ||
      (this.config.NODE_ENV === "production" && role.dataset.synthetic)
    ) {
      throw new UnprocessableEntityException({
        code: "ROLE_UNAVAILABLE",
        message: "Select a published role and target-level combination",
      });
    }
    const deadline = new Date(`${input.deadline}T00:00:00.000Z`);
    if (Number.isNaN(deadline.getTime()) || deadline <= new Date()) {
      throw new UnprocessableEntityException({
        code: "INFEASIBLE_DATE_SHAPE",
        message: "The target deadline must be in the future",
      });
    }
    if (
      deadline > profile.expectedGraduation &&
      input.deadlineBasis !== "HIGHER_STUDIES"
    ) {
      throw new UnprocessableEntityException({
        code: "INFEASIBLE_DATE_SHAPE",
        message: "The deadline cannot be after graduation for this goal basis",
      });
    }
    const current = await this.database.client.careerGoal.findFirst({
      where: { userId, status: "ACTIVE" },
    });
    if (
      current &&
      input.lockVersion !== undefined &&
      current.lockVersion !== input.lockVersion
    ) {
      throw new ConflictException({
        code: "GOAL_CONFLICT",
        message: "The career goal changed in another request",
      });
    }
    if (
      current &&
      (current.roleVersionId !== role.id ||
        current.targetLevel !== input.targetLevel ||
        current.deadline.getTime() !== deadline.getTime() ||
        current.deadlineBasis !== input.deadlineBasis)
    ) {
      const activeRoadmap = await this.database.client.roadmap.findFirst({
        where: {
          goalId: current.id,
          status: "ACTIVE",
          activeRevisionId: { not: null },
        },
        select: { id: true },
      });
      if (activeRoadmap)
        throw new ConflictException({
          code: "ROADMAP_REVISION_REQUIRED",
          message:
            "Preview and accept a roadmap revision before changing an active goal",
        });
    }
    const goalId = current?.id ?? uuidV7();
    const nextVersion = (current?.lockVersion ?? 0) + 1;
    await this.database.client.$transaction(async (transaction) => {
      await transaction.careerGoal.upsert({
        where: { id: goalId },
        create: {
          id: goalId,
          userId,
          datasetId: role.datasetId,
          roleVersionId: role.id,
          targetLevel: input.targetLevel,
          deadline,
          deadlineBasis: input.deadlineBasis,
          lockVersion: nextVersion,
        },
        update: {
          datasetId: role.datasetId,
          roleVersionId: role.id,
          targetLevel: input.targetLevel,
          deadline,
          deadlineBasis: input.deadlineBasis,
          lockVersion: nextVersion,
        },
      });
      await transaction.careerGoalVersion.create({
        data: {
          id: uuidV7(),
          goalId,
          version: nextVersion,
          roleVersionId: role.id,
          targetLevel: input.targetLevel,
          deadline,
          deadlineBasis: input.deadlineBasis,
        },
      });
      await transaction.studentProfile.update({
        where: { id: profile.id },
        data: { onboardingStatus: "ASSESSMENT" },
      });
      await transaction.auditLog.create({
        data: {
          id: uuidV7(),
          actorType: "USER",
          actorId: userId,
          action: current ? "career-goal.update" : "career-goal.create",
          targetType: "CareerGoal",
          targetId: goalId,
          requestId,
        },
      });
    });
    return {
      goalId,
      lockVersion: nextVersion,
      roleVersionId: role.id,
      targetLevel: input.targetLevel,
      nextStep: "ASSESSMENT",
    };
  }
}

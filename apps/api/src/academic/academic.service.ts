import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  productionPublicationIssues,
  validateCurriculumImport,
  type CurriculumImport,
  type CurriculumValidationIssue,
} from "@studentos/academic";
import type {
  AcademicOption,
  AcademicProfileResponse,
} from "@studentos/contracts";
import { uuidV7 } from "@studentos/domain";
import { Prisma } from "@studentos/database";
import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { DatabaseService } from "../config/database.service.js";

export interface AcademicProfileInput {
  curriculumProgramId: string;
  currentSemester: number;
  expectedGraduation: string;
  cgpa?: number;
  backlogCount?: number;
  lockVersion?: number;
}

export interface ImportResult {
  importId: string;
  programId: string | null;
  status: "DRAFT" | "IN_REVIEW";
  coverageStatus: "SUPPORTED" | "PARTIAL";
  issues: CurriculumValidationIssue[];
  statistics: {
    semesters: number;
    subjects: number;
    units: number;
    topics: number;
  };
}

function jsonValue(input: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
}

const BRANCH_NAMES: Readonly<Record<string, string>> = {
  AIDS: "Artificial Intelligence and Data Science",
  AIML: "Artificial Intelligence and Machine Learning",
  BT: "Biotechnology",
  CE: "Civil Engineering",
  CSBS: "Computer Science and Business Systems",
  CSD: "Computer Science and Design",
  CSE: "Computer Science and Engineering",
  CSE_AIML: "CSE (Artificial Intelligence and Machine Learning)",
  CSE_CYBER: "CSE (Cyber Security)",
  CSE_DS: "CSE (Data Science)",
  CSE_IOT_CYBER: "CSE (IoT and Cyber Security including Blockchain)",
  CSE_NETWORKS: "CSE (Networks)",
  CSIT: "Computer Science and Information Technology",
  ECE: "Electronics and Communication Engineering",
  IT: "Information Technology",
  ME: "Mechanical Engineering",
  MINING: "Mining Engineering",
};

@Injectable()
export class AcademicService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async listOptions(filters: {
    universityId?: string;
    regulationId?: string;
    degreeId?: string;
    branchId?: string;
  }): Promise<AcademicOption[]> {
    const programs = await this.database.client.curriculumProgram.findMany({
      where: {
        status: "PUBLISHED",
        ...(this.config.NODE_ENV === "production" ? { synthetic: false } : {}),
        ...(filters.universityId ? { universityId: filters.universityId } : {}),
        ...(filters.regulationId ? { regulationId: filters.regulationId } : {}),
        ...(filters.degreeId ? { degreeId: filters.degreeId } : {}),
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
      },
      include: {
        university: true,
        regulation: true,
        degree: true,
        branch: true,
        semesters: { orderBy: { number: "asc" } },
      },
      orderBy: [
        { university: { name: "asc" } },
        { regulation: { code: "asc" } },
        { degree: { name: "asc" } },
        { branch: { name: "asc" } },
      ],
    });
    return programs.map((program) => ({
      programId: program.id,
      university: {
        id: program.university.id,
        code: program.university.code,
        name:
          program.university.code === "JNTUH"
            ? "Jawaharlal Nehru Technological University Hyderabad"
            : program.university.name,
      },
      regulation: {
        id: program.regulation.id,
        code: program.regulation.code,
        title:
          program.regulation.code === "R25"
            ? "R25 Regulations"
            : program.regulation.title,
      },
      degree: {
        id: program.degree.id,
        code: program.degree.code,
        name:
          program.degree.code === "BTECH"
            ? "Bachelor of Technology"
            : program.degree.name,
      },
      branch: {
        id: program.branch.id,
        code: program.branch.code,
        name: BRANCH_NAMES[program.branch.code] ?? program.branch.name,
      },
      datasetVersion: program.datasetVersion,
      coverageStatus: program.coverageStatus,
      availableSemesters: program.semesters.map(({ number }) => number),
      synthetic: program.synthetic,
    }));
  }

  async stageImport(payload: unknown, editorId: string): Promise<ImportResult> {
    const validation = validateCurriculumImport(payload);
    const importId = uuidV7();
    if (!validation.valid || !validation.data) {
      await this.database.client.contentImport.create({
        data: {
          id: importId,
          datasetType: "CURRICULUM",
          status: "DRAFT",
          editorId,
          payload: jsonValue(payload),
          validationResults: {
            create: validation.issues.map((issue) => ({
              id: uuidV7(),
              code: issue.code,
              path: issue.path,
              message: issue.message,
            })),
          },
        },
      });
      return { ...validation, importId, programId: null, status: "DRAFT" };
    }

    const data = validation.data;
    try {
      return await this.database.client.$transaction(async (transaction) => {
        const university = await transaction.university.upsert({
          where: { code: data.dataset.universityCode },
          create: {
            id: uuidV7(),
            code: data.dataset.universityCode,
            name:
              data.dataset.universityCode === "JNTUH"
                ? "Jawaharlal Nehru Technological University Hyderabad"
                : data.dataset.universityCode,
          },
          update: {},
        });
        const regulation = await transaction.regulation.upsert({
          where: {
            universityId_code: {
              universityId: university.id,
              code: data.dataset.regulationCode,
            },
          },
          create: {
            id: uuidV7(),
            universityId: university.id,
            code: data.dataset.regulationCode,
            title:
              data.dataset.regulationCode === "R25"
                ? "R25 Regulations"
                : data.dataset.regulationCode,
          },
          update: {},
        });
        const degree = await transaction.degree.upsert({
          where: { code: data.dataset.degreeCode },
          create: {
            id: uuidV7(),
            code: data.dataset.degreeCode,
            name:
              data.dataset.degreeCode === "BTECH"
                ? "Bachelor of Technology"
                : data.dataset.degreeCode,
          },
          update: {},
        });
        const branch = await transaction.branch.upsert({
          where: { code: data.dataset.branchCode },
          create: {
            id: uuidV7(),
            code: data.dataset.branchCode,
            name:
              BRANCH_NAMES[data.dataset.branchCode] ?? data.dataset.branchCode,
          },
          update: {},
        });
        const program = await transaction.curriculumProgram.create({
          data: {
            id: uuidV7(),
            universityId: university.id,
            regulationId: regulation.id,
            degreeId: degree.id,
            branchId: branch.id,
            datasetVersion: data.dataset.datasetVersion,
            status: "DRAFT",
            coverageStatus: validation.coverageStatus,
            sourceDocumentId: data.dataset.source.documentId,
            sourceTitle: data.dataset.source.title,
            ...(data.dataset.source.sourceUrl
              ? { sourceUrl: data.dataset.source.sourceUrl }
              : {}),
            sourceChecksum: data.dataset.source.sha256.toLowerCase(),
            ...(data.dataset.source.usagePermission
              ? { usagePermission: data.dataset.source.usagePermission }
              : {}),
            synthetic: data.dataset.synthetic,
            effectiveFrom: new Date(
              `${data.dataset.effectiveFrom}T00:00:00.000Z`,
            ),
            ...(data.dataset.effectiveTo
              ? {
                  effectiveTo: new Date(
                    `${data.dataset.effectiveTo}T00:00:00.000Z`,
                  ),
                }
              : {}),
            editorId,
          },
        });
        const topicIds = new Map<string, string>();
        for (const semesterInput of data.semesters) {
          const semester = await transaction.curriculumSemester.create({
            data: {
              id: uuidV7(),
              programId: program.id,
              number: semesterInput.number,
              academicYear: semesterInput.academicYear,
            },
          });
          for (const subjectInput of semesterInput.subjects) {
            const subject = await transaction.academicSubject.create({
              data: {
                id: uuidV7(),
                semesterId: semester.id,
                code: subjectInput.code,
                title: subjectInput.title,
                credits: subjectInput.credits,
                type: subjectInput.type,
                ...(subjectInput.contactHoursPerWeek === undefined
                  ? {}
                  : { contactHoursPerWeek: subjectInput.contactHoursPerWeek }),
              },
            });
            for (const unitInput of subjectInput.units) {
              const unit = await transaction.subjectUnit.create({
                data: {
                  id: uuidV7(),
                  subjectId: subject.id,
                  number: unitInput.number,
                  title: unitInput.title,
                },
              });
              for (const topicInput of unitInput.topics) {
                const topicId = uuidV7();
                topicIds.set(topicInput.key, topicId);
                await transaction.curriculumTopic.create({
                  data: {
                    id: topicId,
                    programId: program.id,
                    unitId: unit.id,
                    stableKey: topicInput.key,
                    title: topicInput.title,
                    sourcePage: topicInput.sourcePage,
                    academicDepth: topicInput.academicDepth,
                    estimatedAcademicHours: topicInput.estimatedAcademicHours,
                    lab: topicInput.lab ?? false,
                  },
                });
              }
            }
          }
        }
        for (const semesterInput of data.semesters) {
          for (const subjectInput of semesterInput.subjects) {
            for (const unitInput of subjectInput.units) {
              for (const topicInput of unitInput.topics) {
                for (const prerequisiteKey of topicInput.prerequisiteTopicKeys ??
                  []) {
                  await transaction.curriculumTopicPrerequisite.create({
                    data: {
                      topicId: topicIds.get(topicInput.key)!,
                      prerequisiteId: topicIds.get(prerequisiteKey)!,
                    },
                  });
                }
              }
            }
          }
        }
        await transaction.contentImport.create({
          data: {
            id: importId,
            datasetType: "CURRICULUM",
            datasetVersion: data.dataset.datasetVersion,
            sourceChecksum: data.dataset.source.sha256.toLowerCase(),
            status: "IN_REVIEW",
            editorId,
            payload: jsonValue(data),
            programId: program.id,
          },
        });
        return {
          importId,
          programId: program.id,
          status: "IN_REVIEW" as const,
          coverageStatus: validation.coverageStatus,
          issues: [],
          statistics: validation.statistics,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException({
          code: "IMPORT_VERSION_EXISTS",
          message: "This curriculum dataset version already exists",
        });
      }
      throw error;
    }
  }

  async publishImport(
    importId: string,
    reviewerId: string,
    requestId: string,
  ): Promise<{ programId: string; status: "PUBLISHED" }> {
    const contentImport = await this.database.client.contentImport.findUnique({
      where: { id: importId },
    });
    if (!contentImport?.programId)
      throw new NotFoundException({
        code: "IMPORT_NOT_FOUND",
        message: "Curriculum import was not found",
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
    const payload = contentImport.payload as unknown as CurriculumImport;
    if (this.config.NODE_ENV === "production") {
      const issues = productionPublicationIssues(payload);
      if (issues.length > 0) {
        throw new UnprocessableEntityException({
          code: "SOURCE_NOT_PUBLISHABLE",
          message: issues.map(({ message }) => message).join("; "),
        });
      }
    }
    return this.database.client.$transaction(async (transaction) => {
      const program = await transaction.curriculumProgram.findUniqueOrThrow({
        where: { id: contentImport.programId! },
      });
      await transaction.curriculumProgram.updateMany({
        where: {
          universityId: program.universityId,
          regulationId: program.regulationId,
          degreeId: program.degreeId,
          branchId: program.branchId,
          status: "PUBLISHED",
          id: { not: program.id },
        },
        data: { status: "SUPERSEDED" },
      });
      await transaction.curriculumProgram.update({
        where: { id: program.id },
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
          action: "curriculum.publish",
          targetType: "CurriculumProgram",
          targetId: program.id,
          requestId,
        },
      });
      await transaction.outboxEvent.create({
        data: {
          id: uuidV7(),
          aggregateType: "CurriculumProgram",
          aggregateId: program.id,
          eventType: "academic.curriculum-published.v1",
          payload: { datasetVersion: program.datasetVersion },
        },
      });
      return { programId: program.id, status: "PUBLISHED" as const };
    });
  }

  async upsertProfile(
    userId: string,
    input: AcademicProfileInput,
    requestId: string,
  ): Promise<AcademicProfileResponse> {
    const program = await this.database.client.curriculumProgram.findUnique({
      where: { id: input.curriculumProgramId },
      include: { semesters: { select: { number: true } } },
    });
    if (
      !program ||
      program.status !== "PUBLISHED" ||
      (this.config.NODE_ENV === "production" && program.synthetic)
    ) {
      throw new UnprocessableEntityException({
        code: "UNSUPPORTED_CURRICULUM",
        message: "Select a published curriculum combination",
      });
    }
    if (
      !program.semesters.some(({ number }) => number === input.currentSemester)
    ) {
      throw new UnprocessableEntityException({
        code: "UNSUPPORTED_CURRICULUM",
        message: "This curriculum does not cover the selected semester",
      });
    }
    const graduation = new Date(`${input.expectedGraduation}T00:00:00.000Z`);
    if (Number.isNaN(graduation.getTime()) || graduation <= new Date()) {
      throw new UnprocessableEntityException({
        code: "INVALID_GRADUATION_DATE",
        message: "Expected graduation must be a future date",
      });
    }
    const current = await this.database.client.studentProfile.findUnique({
      where: { userId },
    });
    if (
      current &&
      input.lockVersion !== undefined &&
      current.lockVersion !== input.lockVersion
    ) {
      throw new ConflictException({
        code: "PROFILE_CONFLICT",
        message: "The academic profile changed in another request",
      });
    }
    const profileId = current?.id ?? uuidV7();
    const nextVersion = (current?.lockVersion ?? 0) + 1;
    await this.database.client.$transaction(async (transaction) => {
      await transaction.studentProfile.upsert({
        where: { userId },
        create: {
          id: profileId,
          userId,
          curriculumProgramId: program.id,
          currentSemester: input.currentSemester,
          expectedGraduation: graduation,
          ...(input.cgpa === undefined ? {} : { cgpa: input.cgpa }),
          ...(input.backlogCount === undefined
            ? {}
            : { backlogCount: input.backlogCount }),
          onboardingStatus: "GOAL",
          lockVersion: nextVersion,
        },
        update: {
          curriculumProgramId: program.id,
          currentSemester: input.currentSemester,
          expectedGraduation: graduation,
          ...(input.cgpa === undefined ? {} : { cgpa: input.cgpa }),
          ...(input.backlogCount === undefined
            ? {}
            : { backlogCount: input.backlogCount }),
          onboardingStatus: "GOAL",
          lockVersion: nextVersion,
        },
      });
      await transaction.academicProfileVersion.create({
        data: {
          id: uuidV7(),
          profileId,
          version: nextVersion,
          curriculumProgramId: program.id,
          currentSemester: input.currentSemester,
          expectedGraduation: graduation,
          ...(input.cgpa === undefined ? {} : { cgpa: input.cgpa }),
          ...(input.backlogCount === undefined
            ? {}
            : { backlogCount: input.backlogCount }),
        },
      });
      await transaction.auditLog.create({
        data: {
          id: uuidV7(),
          actorType: "USER",
          actorId: userId,
          action: current
            ? "academic-profile.update"
            : "academic-profile.create",
          targetType: "StudentProfile",
          targetId: profileId,
          requestId,
        },
      });
      await transaction.outboxEvent.create({
        data: {
          id: uuidV7(),
          aggregateType: "StudentProfile",
          aggregateId: profileId,
          eventType: "academic.profile-saved.v1",
          payload: { version: nextVersion, curriculumProgramId: program.id },
        },
      });
    });
    return {
      profileId,
      lockVersion: nextVersion,
      curriculumProgramId: program.id,
      coverageStatus: program.coverageStatus,
      nextStep: "CAREER_GOAL",
    };
  }
}

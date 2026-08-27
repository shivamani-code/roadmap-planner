import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { uuidV7 } from "@studentos/domain";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { ProblemDetailsFilter } from "../src/common/problem-details.filter.js";
import { DatabaseService } from "../src/config/database.service.js";

describe("platform foundation", () => {
  let app: INestApplication;

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: "test",
      DATABASE_MODE: "pglite",
      DATABASE_DIR: "memory://",
      SESSION_SECRET: "test-session-secret-with-at-least-thirty-two-characters",
      ALLOW_DEV_AUTH: "true",
      AI_GATEWAY_URL: "https://ai-gateway.test.invalid/generate",
      AI_GATEWAY_TOKEN: "test-ai-gateway-token-with-minimum-length",
    });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("reports live and database-ready status", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/health/live")
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("ok");
        expect(body.checks.process).toBe("ok");
      });
    await request(app.getHttpServer())
      .get("/api/v1/health/ready")
      .expect(200)
      .expect(({ body }) => {
        expect(body.checks.database).toBe("ok");
      });
  });

  it("completes a one-use development magic-link session flow", async () => {
    const requested = await request(app.getHttpServer())
      .post("/api/v1/auth/magic-links")
      .send({ email: "Student@Example.com" })
      .expect(202);
    expect(requested.body.debugToken).toBeTypeOf("string");

    const verified = await request(app.getHttpServer())
      .post("/api/v1/auth/magic-links/verify")
      .send({ token: requested.body.debugToken })
      .expect(200);
    expect(verified.body.user.email).toBe("student@example.com");
    const cookie = verified.headers["set-cookie"]?.[0] as string;
    expect(cookie).toContain("studentos_session=");

    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", cookie)
      .expect(200);
    await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", cookie)
      .expect(204);
    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", cookie)
      .expect(401);
    await request(app.getHttpServer())
      .post("/api/v1/auth/magic-links/verify")
      .send({ token: requested.body.debugToken })
      .expect(401);
  });

  it("returns typed problem details for invalid input", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/magic-links")
      .send({ email: "not-email" })
      .expect(400);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.body.code).toBe("HTTP_400");
    expect(response.body.correlationId).toBeTypeOf("string");
  });

  it("stages, independently publishes, lists, and selects a complete curriculum", async () => {
    const signIn = async (email: string): Promise<string> => {
      const link = await request(app.getHttpServer())
        .post("/api/v1/auth/magic-links")
        .send({ email })
        .expect(202);
      const verified = await request(app.getHttpServer())
        .post("/api/v1/auth/magic-links/verify")
        .send({ token: link.body.debugToken })
        .expect(200);
      return verified.headers["set-cookie"]?.[0] as string;
    };
    const editorCookie = await signIn("editor@example.com");
    const reviewerCookie = await signIn("reviewer@example.com");
    const studentCookie = await signIn("academic-student@example.com");
    const database = app.get(DatabaseService).client;
    const editor = await database.user.findUniqueOrThrow({
      where: { normalizedEmail: "editor@example.com" },
    });
    const reviewer = await database.user.findUniqueOrThrow({
      where: { normalizedEmail: "reviewer@example.com" },
    });
    const student = await database.user.findUniqueOrThrow({
      where: { normalizedEmail: "academic-student@example.com" },
    });
    await database.adminMembership.createMany({
      data: [
        { id: uuidV7(), userId: editor.id, role: "CONTENT_EDITOR" },
        { id: uuidV7(), userId: reviewer.id, role: "CONTENT_REVIEWER" },
      ],
    });
    const payload = {
      schemaVersion: "1.0.0",
      dataset: {
        universityCode: "SYNTHETIC_U",
        regulationCode: "TEST25",
        degreeCode: "BTECH",
        branchCode: "CSE",
        datasetVersion: "2026.08.2",
        effectiveFrom: "2026-07-01",
        effectiveTo: null,
        source: {
          documentId: "synthetic-full-test",
          title: "Synthetic full curriculum — not authoritative",
          sourceUrl: "https://example.invalid/studentos/full",
          sha256:
            "0000000000000000000000000000000000000000000000000000000000000000",
          retrievedAt: "2026-08-24T00:00:00Z",
          usagePermission: "PERMISSION_RECORDED",
        },
        synthetic: true,
      },
      semesters: Array.from({ length: 8 }, (_, index) => ({
        number: index + 1,
        academicYear: Math.ceil((index + 1) / 2),
        subjects: [
          {
            code: `SYN-CS${index + 1}01`,
            title: `Synthetic subject ${index + 1}`,
            credits: 3,
            type: "THEORY",
            units: [
              {
                number: 1,
                title: "Foundations",
                topics: [
                  {
                    key: `synthetic.full.semester-${index + 1}`,
                    title: `Synthetic topic ${index + 1}`,
                    sourcePage: index + 1,
                    academicDepth: 0.5,
                    estimatedAcademicHours: 5,
                    prerequisiteTopicKeys:
                      index === 0 ? [] : [`synthetic.full.semester-${index}`],
                    lab: false,
                  },
                ],
              },
            ],
          },
        ],
      })),
    };
    const staged = await request(app.getHttpServer())
      .post("/api/v1/admin/curriculum/imports")
      .set("Cookie", editorCookie)
      .send({ payload })
      .expect(201);
    expect(staged.body).toMatchObject({
      status: "IN_REVIEW",
      coverageStatus: "SUPPORTED",
      issues: [],
    });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/curriculum/imports/${staged.body.importId}/publish`)
      .set("Cookie", editorCookie)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/curriculum/imports/${staged.body.importId}/publish`)
      .set("Cookie", reviewerCookie)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe("PUBLISHED"));

    const catalog = await request(app.getHttpServer())
      .get("/api/v1/catalog/academic-options")
      .expect(200);
    expect(catalog.body).toHaveLength(1);
    expect(catalog.body[0].availableSemesters).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);

    const profile = await request(app.getHttpServer())
      .put("/api/v1/onboarding/academic-profile")
      .set("Cookie", studentCookie)
      .send({
        curriculumProgramId: staged.body.programId,
        currentSemester: 3,
        expectedGraduation: "2029-06-30",
        cgpa: 8.2,
        backlogCount: 0,
      })
      .expect(200);
    expect(profile.body).toMatchObject({
      coverageStatus: "SUPPORTED",
      nextStep: "CAREER_GOAL",
      lockVersion: 1,
    });
    expect(
      await database.academicProfileVersion.count({
        where: { profileId: profile.body.profileId },
      }),
    ).toBe(1);

    await request(app.getHttpServer())
      .put("/api/v1/onboarding/academic-profile")
      .set("Cookie", studentCookie)
      .send({
        curriculumProgramId: staged.body.programId,
        currentSemester: 4,
        expectedGraduation: "2029-06-30",
        lockVersion: 99,
      })
      .expect(409);

    const careerPayload = {
      schemaVersion: "1.0.0",
      datasetVersion: "2026.08.2",
      synthetic: true,
      review: {
        editorId: "synthetic-editor",
        reviewerId: "synthetic-reviewer",
        reviewedAt: "2026-08-24T00:00:00Z",
        rationale:
          "Synthetic career data exercises the reviewed publication workflow only.",
      },
      skills: [
        {
          key: "programming.basics",
          name: "Programming foundations",
          category: "PROGRAMMING",
          rubricVersion: 1,
          evidenceDecayDays: null,
          prerequisites: [],
        },
      ],
      roles: [
        "software-engineer",
        "backend-engineer",
        "full-stack-engineer",
        "data-analyst",
      ].map((key) => ({
        key,
        name: key
          .split("-")
          .map((word) => word[0]!.toUpperCase() + word.slice(1))
          .join(" "),
        domainKey: key === "data-analyst" ? "data" : "software-development",
        version: 1,
        targetLevels: [
          {
            level: "INTERNSHIP_READY",
            requirements: [
              {
                skillKey: "programming.basics",
                requiredDepth: 0.5,
                importance: 0.8,
                placementRelevance: 0.7,
                required: true,
                requiredByDaysBeforeDeadline: 30,
                hours: { p25: 10, p50: 15, p75: 24 },
                rationale:
                  "Programming foundations are required by this synthetic role fixture.",
              },
            ],
          },
          {
            level: "PRODUCT_PLACEMENT",
            requirements: [
              {
                skillKey: "programming.basics",
                requiredDepth: 0.8,
                importance: 0.95,
                placementRelevance: 0.9,
                required: true,
                requiredByDaysBeforeDeadline: 90,
                hours: { p25: 20, p50: 30, p75: 45 },
                rationale:
                  "The higher target verifies that assessment questions stay scoped to the selected level.",
              },
            ],
          },
        ],
      })),
      learningUnits: [
        {
          key: "learn.programming-basics",
          type: "TEACH",
          skillKeys: ["programming.basics"],
          fromDepth: 0,
          toDepth: 0.5,
          estimatedMinutes: 900,
          difficulty: "FOUNDATION",
          splitPointsMinutes: [45, 60],
          reasonCodes: ["ROLE_REQUIRED"],
        },
      ],
    };
    const careerImport = await request(app.getHttpServer())
      .post("/api/v1/admin/career/imports")
      .set("Cookie", editorCookie)
      .send({ payload: careerPayload })
      .expect(201);
    expect(careerImport.body).toMatchObject({
      status: "IN_REVIEW",
      coverageGaps: [],
    });
    await request(app.getHttpServer())
      .post(
        `/api/v1/admin/career/imports/${careerImport.body.importId}/publish`,
      )
      .set("Cookie", reviewerCookie)
      .expect(201);
    const roles = await request(app.getHttpServer())
      .get("/api/v1/catalog/career-roles")
      .expect(200);
    expect(roles.body).toHaveLength(4);
    const studentRoles = await request(app.getHttpServer())
      .get("/api/v1/catalog/career-roles/for-student")
      .set("Cookie", studentCookie)
      .expect(200);
    expect(studentRoles.body).toMatchObject({
      branch: { code: "CSE" },
      totalCount: 4,
    });
    expect(studentRoles.body.roles).toHaveLength(4);
    expect(studentRoles.body.roles[0].relevance).toMatchObject({
      recommended: true,
    });
    const projectPayload = {
      schemaVersion: "1.0.0",
      datasetVersion: "2026.08.1",
      synthetic: true,
      projects: [
        {
          key: "project.task-api",
          version: 1,
          title: "Task Management API",
          goal: "Build and explain a deployed task API with reviewed evidence.",
          roleKeys: [roles.body[0].role.key],
          difficulty: "FOUNDATION",
          estimatedHours: { p25: 8, p50: 12, p75: 18 },
          portfolioValue: 0.8,
          prerequisites: [
            {
              skillKey: "programming.basics",
              threshold: 0.2,
              type: "HARD",
            },
          ],
          deliverables: ["Source repository", "Reviewed implementation"],
          deploymentRequired: true,
          milestones: [
            {
              key: "project.task-api.implementation",
              title: "Reviewed API implementation",
              sequence: 1,
              weight: 1,
              estimatedMinutes: 360,
              skillOutcomes: ["programming.basics"],
              completionCriteria: [
                "Repository contains a working implementation and test evidence.",
              ],
            },
          ],
        },
      ],
    };
    await request(app.getHttpServer())
      .post("/api/v1/admin/projects/imports")
      .set("Cookie", editorCookie)
      .send({ payload: { projects: [{ goal: null }] } })
      .expect(422)
      .expect(({ body }) => expect(body.code).toBe("INVALID_PROJECT_DATASET"));
    const projectImport = await request(app.getHttpServer())
      .post("/api/v1/admin/projects/imports")
      .set("Cookie", editorCookie)
      .send({ payload: projectPayload })
      .expect(201);
    expect(projectImport.body).toMatchObject({
      status: "IN_REVIEW",
      projectCount: 1,
    });
    await request(app.getHttpServer())
      .post(
        `/api/v1/admin/projects/imports/${projectImport.body.importId}/publish`,
      )
      .set("Cookie", editorCookie)
      .expect(403);
    await request(app.getHttpServer())
      .post(
        `/api/v1/admin/projects/imports/${projectImport.body.importId}/publish`,
      )
      .set("Cookie", reviewerCookie)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe("PUBLISHED"));
    const goal = await request(app.getHttpServer())
      .put("/api/v1/onboarding/career-goal")
      .set("Cookie", studentCookie)
      .send({
        roleVersionId: roles.body[0].roleVersionId,
        targetLevel: "INTERNSHIP_READY",
        deadline: "2028-06-30",
        deadlineBasis: "PLACEMENT",
      })
      .expect(200);
    expect(goal.body).toMatchObject({ lockVersion: 1, nextStep: "ASSESSMENT" });
    expect(
      await database.careerGoalVersion.count({
        where: { goalId: goal.body.goalId },
      }),
    ).toBe(1);

    const assessment = await request(app.getHttpServer())
      .post("/api/v1/skill-assessments")
      .set("Cookie", studentCookie)
      .expect(201);
    expect(assessment.body.statements).toHaveLength(1);
    const resumedAssessment = await request(app.getHttpServer())
      .post("/api/v1/skill-assessments")
      .set("Cookie", studentCookie)
      .expect(201);
    expect(resumedAssessment.body).toMatchObject({
      id: assessment.body.id,
      resumed: true,
      responses: {},
    });
    expect(resumedAssessment.body.statements).toHaveLength(1);
    const topic = await database.curriculumTopic.findFirstOrThrow({
      where: { programId: staged.body.programId },
      orderBy: { stableKey: "asc" },
    });
    await request(app.getHttpServer())
      .post("/api/v1/admin/curriculum-skill-mappings")
      .set("Cookie", reviewerCookie)
      .send({
        curriculumTopicId: topic.id,
        skillId: assessment.body.statements[0].skillId,
        breadth: 1,
        depth: 1,
        confidence: 0.64,
        practiceRequired: true,
        evidencePotential: 0.4,
        rationale:
          "A deliberately low-confidence synthetic mapping verifies conservative gap behavior.",
        version: 1,
      })
      .expect(201);
    await request(app.getHttpServer())
      .put(`/api/v1/skill-assessments/${assessment.body.id}/responses`)
      .set("Cookie", studentCookie)
      .send({
        responses: [
          { skillId: assessment.body.statements[0].skillId, level: "BASIC" },
        ],
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/skill-assessments/${assessment.body.id}/submit`)
      .set("Cookie", studentCookie)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe("SCORED"));
    await request(app.getHttpServer())
      .put("/api/v1/study-availability")
      .set("Cookie", studentCookie)
      .send({
        timezone: "Asia/Kolkata",
        maxSessionMinutes: 90,
        windows: [
          { day: 1, startMinute: 1080, endMinute: 1200 },
          { day: 2, startMinute: 1080, endMinute: 1200 },
          { day: 3, startMinute: 1080, endMinute: 1200 },
          { day: 4, startMinute: 1080, endMinute: 1200 },
          { day: 5, startMinute: 1080, endMinute: 1200 },
        ],
      })
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          weeklyMinutes: 600,
          allocatableMinutes: 510,
        }),
      );
    const gap = await request(app.getHttpServer())
      .post("/api/v1/gap-analyses")
      .set("Cookie", studentCookie)
      .expect(201);
    expect(
      gap.body.contribution.current +
        gap.body.contribution.college +
        gap.body.contribution.independent,
    ).toBeCloseTo(100);
    expect(gap.body.contribution.college).toBe(0);
    expect(gap.body.warnings).toContain("LOW_CONFIDENCE_MAPPING_IGNORED");
    expect(gap.body.status).toBe("READY");
    expect(gap.body.context).toMatchObject({
      branch: { code: "CSE" },
      role: { targetLevel: "INTERNSHIP_READY" },
    });
    expect(gap.body.roadmapPreview.steps).toHaveLength(1);
    expect(gap.body.roadmapPreview.subjectTracks).toHaveLength(1);
    expect(gap.body.roadmapPreview.schedule).toMatchObject({
      reservePercent: 15,
      weeklyCapacityMinutes: 510,
      estimatedMonthCount: expect.any(Number),
    });
    expect(gap.body.roadmapPreview.schedule.dailySessions).toHaveLength(5);
    expect(gap.body.roadmapPreview.schedule.weeks).toHaveLength(4);
    expect(gap.body.items[0]).toMatchObject({
      requiredDepth: expect.any(Number),
      roleRationale: expect.any(String),
      explanation: expect.any(String),
      nextAction: expect.any(String),
    });
    await request(app.getHttpServer())
      .get(`/api/v1/gap-analyses/${gap.body.id}`)
      .set("Cookie", editorCookie)
      .expect(404);

    const generation = await request(app.getHttpServer())
      .post("/api/v1/roadmaps")
      .set("Cookie", studentCookie)
      .set("Idempotency-Key", "first-roadmap")
      .send({ gapAnalysisId: gap.body.id })
      .expect(201);
    expect(generation.body).toMatchObject({
      status: "COMPLETED",
      stage: "ACTIVATED",
      attemptCount: 1,
    });
    expect(generation.body.roadmapId).toBeTruthy();
    const duplicate = await request(app.getHttpServer())
      .post("/api/v1/roadmaps")
      .set("Cookie", studentCookie)
      .set("Idempotency-Key", "first-roadmap")
      .send({ gapAnalysisId: gap.body.id })
      .expect(201);
    expect(duplicate.body.id).toBe(generation.body.id);
    const roadmap = await request(app.getHttpServer())
      .get("/api/v1/roadmaps/current")
      .set("Cookie", studentCookie)
      .expect(200);
    expect(roadmap.body).toMatchObject({
      id: generation.body.roadmapId,
      status: "ACTIVE",
      revision: {
        version: 1,
        status: "ACTIVE",
        rulesetVersion: "roadmap-1.0.0",
      },
    });
    const roadmapTerms = roadmap.body.terms as Array<{
      id: string;
      milestoneCount: number;
    }>;
    expect(roadmapTerms.length).toBeGreaterThan(0);
    expect(
      roadmapTerms.reduce(
        (total, roadmapTerm) => total + roadmapTerm.milestoneCount,
        0,
      ),
    ).toBeGreaterThan(0);
    const termWithMilestone = roadmapTerms.find(
      ({ milestoneCount }) => milestoneCount > 0,
    );
    expect(termWithMilestone).toBeDefined();
    const term = await request(app.getHttpServer())
      .get(`/api/v1/roadmaps/current/terms/${termWithMilestone!.id}`)
      .set("Cookie", studentCookie)
      .expect(200);
    expect(term.body.plannedMinutes).toBeLessThanOrEqual(
      term.body.capacityMinutes,
    );
    expect(term.body.milestones[0]).toMatchObject({
      skill: { key: "programming.basics" },
      learningUnit: { key: "learn.programming-basics" },
    });
    expect(term.body.milestones[0].sourceTrace).toMatchObject({
      gapAnalysisId: gap.body.id,
      rulesetVersion: "roadmap-1.0.0",
    });
    await request(app.getHttpServer())
      .get(`/api/v1/roadmap-jobs/${generation.body.id}`)
      .set("Cookie", editorCookie)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/roadmaps/current/terms/${termWithMilestone!.id}`)
      .set("Cookie", editorCookie)
      .expect(404);
    await request(app.getHttpServer())
      .put("/api/v1/onboarding/career-goal")
      .set("Cookie", studentCookie)
      .send({
        roleVersionId: roles.body[1].roleVersionId,
        targetLevel: "INTERNSHIP_READY",
        deadline: "2028-06-30",
        deadlineBasis: "PLACEMENT",
        lockVersion: 1,
      })
      .expect(409)
      .expect(({ body }) =>
        expect(body.code).toBe("ROADMAP_REVISION_REQUIRED"),
      );

    const week = await request(app.getHttpServer())
      .get("/api/v1/plans/weeks/2026-08-24")
      .set("Cookie", studentCookie)
      .expect(200);
    expect(week.body.capacity).toMatchObject({
      rawMinutes: 600,
      allocatableMinutes: 510,
      catchupMinutes: 90,
    });
    expect(week.body.capacity.scheduledMinutes).toBeLessThanOrEqual(510);
    const weekTasks = (
      week.body.days as Array<{
        tasks: Array<{
          id: string;
          status: string;
          lockVersion: number;
          trace: { roadmapRevisionId: string; milestoneId: string };
        }>;
      }>
    ).flatMap(({ tasks }) => tasks);
    expect(weekTasks.length).toBeGreaterThan(1);
    expect(weekTasks[0]?.trace).toMatchObject({
      roadmapRevisionId: generation.body.revisionId,
      milestoneId: term.body.milestones[0].id,
    });
    const today = await request(app.getHttpServer())
      .get("/api/v1/plans/today?date=2026-08-24")
      .set("Cookie", studentCookie)
      .expect(200);
    expect(today.body.nextTaskId).toBe(weekTasks[0]!.id);
    const started = await request(app.getHttpServer())
      .patch(`/api/v1/task-occurrences/${weekTasks[0]!.id}`)
      .set("Cookie", studentCookie)
      .set("Idempotency-Key", "start-first-task")
      .send({ command: "START", expectedVersion: 1 })
      .expect(200);
    expect(started.body).toMatchObject({
      id: weekTasks[0]!.id,
      status: "IN_PROGRESS",
      lockVersion: 2,
    });
    const retriedStart = await request(app.getHttpServer())
      .patch(`/api/v1/task-occurrences/${weekTasks[0]!.id}`)
      .set("Cookie", studentCookie)
      .set("Idempotency-Key", "start-first-task")
      .send({ command: "START", expectedVersion: 1 })
      .expect(200);
    expect(retriedStart.body).toEqual(started.body);
    await request(app.getHttpServer())
      .patch(`/api/v1/task-occurrences/${weekTasks[0]!.id}`)
      .set("Cookie", studentCookie)
      .set("Idempotency-Key", "stale-start")
      .send({ command: "START", expectedVersion: 1 })
      .expect(409);
    const completion = await request(app.getHttpServer())
      .post(`/api/v1/task-occurrences/${weekTasks[0]!.id}/completions`)
      .set("Cookie", studentCookie)
      .set("Idempotency-Key", "complete-first-task")
      .send({
        expectedVersion: 2,
        actualMinutes: 70,
        outcome: "Completed the reviewed programming foundation checkpoint.",
        artifactUrl: "https://github.com/studentos/example",
      })
      .expect(201);
    expect(completion.body).toMatchObject({
      occurrence: { status: "COMPLETED", lockVersion: 3 },
      actualMinutes: 70,
    });
    const retriedCompletion = await request(app.getHttpServer())
      .post(`/api/v1/task-occurrences/${weekTasks[0]!.id}/completions`)
      .set("Cookie", studentCookie)
      .set("Idempotency-Key", "complete-first-task")
      .send({
        expectedVersion: 2,
        actualMinutes: 70,
        outcome: "Completed the reviewed programming foundation checkpoint.",
        artifactUrl: "https://github.com/studentos/example",
      })
      .expect(201);
    expect(retriedCompletion.body.id).toBe(completion.body.id);
    const secondTask = weekTasks[1]!;
    const rescheduled = await request(app.getHttpServer())
      .patch(`/api/v1/task-occurrences/${secondTask.id}`)
      .set("Cookie", studentCookie)
      .set("Idempotency-Key", "move-second-task")
      .send({
        command: "RESCHEDULE",
        expectedVersion: secondTask.lockVersion,
        rescheduleDate: "2026-08-31",
      })
      .expect(200);
    expect(rescheduled.body).toMatchObject({
      originalId: secondTask.id,
      replacement: {
        status: "PLANNED",
        scheduledDate: "2026-08-31",
        originalOccurrenceId: secondTask.id,
      },
    });

    const taskOnlySkill = await request(app.getHttpServer())
      .get(`/api/v1/skills/${assessment.body.statements[0].skillId}`)
      .set("Cookie", studentCookie)
      .expect(200);
    expect(taskOnlySkill.body.proficiency).toBeLessThanOrEqual(0.8);
    expect(taskOnlySkill.body.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceType: "SELF_REPORT" }),
        expect.objectContaining({
          sourceType: "TASK_COMPLETION",
          confidence: 0.82,
        }),
      ]),
    );
    expect(
      Math.max(
        ...(
          taskOnlySkill.body.evidence as Array<{
            sourceType: string;
            proficiency: number;
          }>
        )
          .filter(({ sourceType }) => sourceType === "TASK_COMPLETION")
          .map(({ proficiency }) => proficiency),
      ),
    ).toBeLessThanOrEqual(0.8);

    const recommendations = await request(app.getHttpServer())
      .get("/api/v1/projects/recommendations")
      .set("Cookie", studentCookie)
      .expect(200);
    expect(recommendations.body.active).toBeNull();
    expect(recommendations.body.recommendations[0]).toMatchObject({
      key: "project.task-api",
      eligible: true,
      blockers: [],
    });
    expect(recommendations.body.recommendations[0].score).toBeGreaterThan(0);
    const studentProject = await request(app.getHttpServer())
      .post("/api/v1/student-projects")
      .set("Cookie", studentCookie)
      .send({ templateId: recommendations.body.recommendations[0].id })
      .expect(201);
    expect(studentProject.body).toMatchObject({
      status: "ACTIVE",
      milestoneCount: 1,
    });
    await request(app.getHttpServer())
      .post("/api/v1/student-projects")
      .set("Cookie", studentCookie)
      .send({ templateId: recommendations.body.recommendations[0].id })
      .expect(409);
    const activeProject = await request(app.getHttpServer())
      .get("/api/v1/student-projects/active")
      .set("Cookie", studentCookie)
      .expect(200);
    expect(activeProject.body).toMatchObject({
      id: studentProject.body.id,
      progressPercent: 0,
    });
    const projectMilestoneId = activeProject.body.milestones[0].id as string;
    await request(app.getHttpServer())
      .post(
        `/api/v1/student-projects/milestones/${projectMilestoneId}/submissions`,
      )
      .set("Cookie", studentCookie)
      .send({
        artifactUrl: "https://untrusted.example.com/project",
        note: "Attempt with an untrusted artifact host.",
      })
      .expect(422);
    await request(app.getHttpServer())
      .post(
        `/api/v1/student-projects/milestones/${projectMilestoneId}/submissions`,
      )
      .set("Cookie", studentCookie)
      .send({
        artifactUrl: "https://github.com/studentos/task-api",
        note: "Implementation, tests, and deployment evidence are ready.",
      })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe("SUBMITTED"));

    await request(app.getHttpServer())
      .get("/api/v1/placement-readiness")
      .set("Cookie", studentCookie)
      .expect(200)
      .expect(({ body }) => {
        expect(body.label).toContain("not hiring probability");
        expect(body.cap).toBe(69);
        expect(body.gates.reviewedProject).toBe(false);
      });
    await database.adminMembership.update({
      where: { userId: editor.id },
      data: { role: "SUPER_ADMIN" },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/projects/milestones/${projectMilestoneId}/review`)
      .set("Cookie", editorCookie)
      .send({ rubricScore: 0.9, note: "Editor may not review own content." })
      .expect(422);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/projects/milestones/${projectMilestoneId}/review`)
      .set("Cookie", reviewerCookie)
      .send({
        rubricScore: 0.9,
        note: "Repository and implementation meet the milestone rubric.",
      })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe("COMPLETED"));

    const completedProject = await request(app.getHttpServer())
      .get("/api/v1/student-projects/active")
      .set("Cookie", studentCookie)
      .expect(200);
    expect(completedProject.body).toMatchObject({
      status: "COMPLETED",
      progressPercent: 100,
    });
    await request(app.getHttpServer())
      .put("/api/v1/placement-profile")
      .set("Cookie", studentCookie)
      .send({ resumeComplete: true, profileComplete: true })
      .expect(200);
    await request(app.getHttpServer())
      .get("/api/v1/placement-profile")
      .set("Cookie", studentCookie)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          resumeComplete: true,
          profileComplete: true,
        }),
      );
    const readiness = await request(app.getHttpServer())
      .get("/api/v1/placement-readiness")
      .set("Cookie", studentCookie)
      .expect(200);
    expect(readiness.body).toMatchObject({
      cap: 79,
      gates: {
        reviewedProject: true,
        profileAndTimedAssessment: false,
        interviewEvidence: false,
      },
      rulesetVersion: "readiness-1.0.0",
    });
    expect(readiness.body.projection.confidence).toBe("LOW");

    const progress = await request(app.getHttpServer())
      .get("/api/v1/progress")
      .set("Cookie", studentCookie)
      .expect(200);
    expect(progress.body.metrics.taskCompletion).toBeGreaterThan(0);
    expect(progress.body.totals.completedActualMinutes).toBe(70);
    expect(progress.body.projects[0]).toMatchObject({
      id: studentProject.body.id,
      status: "COMPLETED",
      progressPercent: 100,
    });
    await request(app.getHttpServer())
      .get("/api/v1/progress?days=8")
      .set("Cookie", studentCookie)
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe("INVALID_RANGE"));
    await request(app.getHttpServer())
      .get("/api/v1/progress?days=7")
      .set("Cookie", studentCookie)
      .expect(200)
      .expect(({ body }) => expect(body.range.days).toBe(7));
    expect(
      await database.progressSnapshot.count({
        where: { userId: student.id },
      }),
    ).toBe(2);
    const skills = await request(app.getHttpServer())
      .get("/api/v1/skills")
      .set("Cookie", studentCookie)
      .expect(200);
    expect(skills.body[0]).toMatchObject({ key: "programming.basics" });
    const evidencedSkill = await request(app.getHttpServer())
      .get(`/api/v1/skills/${assessment.body.statements[0].skillId}`)
      .set("Cookie", studentCookie)
      .expect(200);
    expect(evidencedSkill.body.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceType: "PROJECT_MILESTONE" }),
      ]),
    );
    expect(evidencedSkill.body.mappedCurriculum[0]).toMatchObject({
      topicId: topic.id,
      semester: 1,
      confidence: 0.64,
    });
    await request(app.getHttpServer())
      .get(`/api/v1/skills/${assessment.body.statements[0].skillId}`)
      .set("Cookie", editorCookie)
      .expect(404);

    const immutableCompletionCount = await database.taskCompletion.count({
      where: { userId: student.id },
    });
    const examPeriod = await request(app.getHttpServer())
      .post("/api/v1/exam-periods")
      .set("Cookie", studentCookie)
      .send({
        type: "SEMESTER_EXAM",
        title: "Synthetic semester examinations",
        startDate: "2026-09-15",
        endDate: "2026-09-30",
      })
      .expect(201);
    expect(examPeriod.body).toMatchObject({
      type: "SEMESTER_EXAM",
      provenance: "STUDENT",
      confirmed: true,
    });
    await request(app.getHttpServer())
      .get("/api/v1/planning-mode?date=2026-09-08")
      .set("Cookie", studentCookie)
      .expect(200)
      .expect(({ body }) => expect(body.mode).toBe("SEMESTER_EXAM"));

    const weeklyReview = await request(app.getHttpServer())
      .post("/api/v1/weekly-reviews")
      .set("Cookie", studentCookie)
      .send({
        weekStart: "2026-08-24",
        difficulty: "GOOD",
        upcomingChanges: ["Semester examinations are approaching"],
      })
      .expect(201);
    expect(weeklyReview.body).toMatchObject({
      weekStart: "2026-08-24",
      adjustment: {
        sampleCount: 1,
        multiplier: 1,
        action: "INSUFFICIENT_DATA",
      },
      revision: { version: 2, status: "ACTIVE", autoActivated: true },
      rulesetVersion: "adaptation-1.0.0",
    });
    await request(app.getHttpServer())
      .post("/api/v1/weekly-reviews")
      .set("Cookie", studentCookie)
      .send({
        weekStart: "2026-08-24",
        difficulty: "GOOD",
        upcomingChanges: [],
      })
      .expect(409);

    const examWeek = await request(app.getHttpServer())
      .get("/api/v1/plans/weeks/2026-09-07")
      .set("Cookie", studentCookie)
      .expect(200);
    expect(examWeek.body.planningMode).toBe("SEMESTER_EXAM");
    const examTasks = (
      examWeek.body.days as Array<{ tasks: Array<{ track: string }> }>
    ).flatMap(({ tasks }) => tasks);
    expect(
      examTasks.filter(({ track }) => track !== "ACADEMIC").length,
    ).toBeLessThanOrEqual(2);
    expect(examWeek.body.capacity.scheduledMinutes).toBeLessThanOrEqual(
      Math.floor(examWeek.body.capacity.allocatableMinutes * 0.2),
    );

    const materialPreview = await request(app.getHttpServer())
      .post("/api/v1/roadmap-revisions")
      .set("Cookie", studentCookie)
      .send({
        kind: "EXAM",
        reason: "Rebuild the future plan around confirmed semester exams.",
      })
      .expect(201);
    expect(materialPreview.body).toMatchObject({
      version: 3,
      status: "READY",
      kind: "EXAM",
      consentRequired: true,
      autoEligible: false,
    });
    await request(app.getHttpServer())
      .get(`/api/v1/roadmap-revisions/${materialPreview.body.id}/diff`)
      .set("Cookie", editorCookie)
      .expect(404);
    await request(app.getHttpServer())
      .get("/api/v1/roadmaps/current")
      .set("Cookie", studentCookie)
      .expect(200)
      .expect(({ body }) => expect(body.revision.version).toBe(2));
    await request(app.getHttpServer())
      .post(`/api/v1/roadmap-revisions/${materialPreview.body.id}/activate`)
      .set("Cookie", studentCookie)
      .set("If-Match", '"1"')
      .send({})
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/v1/roadmap-revisions/${materialPreview.body.id}/activate`)
      .set("Cookie", studentCookie)
      .set("If-Match", '"2"')
      .send({})
      .expect(201)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          version: 3,
          status: "ACTIVE",
          autoActivated: false,
        }),
      );

    const rolePreview = await request(app.getHttpServer())
      .post("/api/v1/roadmap-revisions")
      .set("Cookie", studentCookie)
      .send({
        kind: "ROLE",
        reason:
          "Switch primary role while retaining shared canonical evidence.",
        targetRoleVersionId: roles.body[1].roleVersionId,
      })
      .expect(201);
    expect(rolePreview.body).toMatchObject({
      version: 4,
      status: "READY",
      kind: "ROLE",
      consentRequired: true,
    });
    expect(rolePreview.body.retained.length).toBeGreaterThan(0);
    await request(app.getHttpServer())
      .post(`/api/v1/roadmap-revisions/${rolePreview.body.id}/activate`)
      .set("Cookie", studentCookie)
      .set("If-Match", '"3"')
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .get("/api/v1/roadmaps/current")
      .set("Cookie", studentCookie)
      .expect(200)
      .expect(({ body }) => expect(body.revision.version).toBe(4));
    expect(
      await database.careerGoalVersion.count({
        where: { goalId: goal.body.goalId },
      }),
    ).toBe(2);
    expect(
      await database.taskCompletion.count({ where: { userId: student.id } }),
    ).toBe(immutableCompletionCount);
    const switchedReadiness = await request(app.getHttpServer())
      .get("/api/v1/placement-readiness")
      .set("Cookie", studentCookie)
      .expect(200);
    expect(switchedReadiness.body.cap).toBe(69);
    expect(switchedReadiness.body.gates.reviewedProject).toBe(false);
    const rejectedPreview = await request(app.getHttpServer())
      .post("/api/v1/roadmap-revisions")
      .set("Cookie", studentCookie)
      .send({
        kind: "MATERIAL",
        reason: "Preview a changed constraint and keep the current version.",
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/roadmap-revisions/${rejectedPreview.body.id}/reject`)
      .set("Cookie", studentCookie)
      .send({})
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe("REJECTED"));
    await request(app.getHttpServer())
      .get("/api/v1/roadmaps/current")
      .set("Cookie", studentCookie)
      .expect(200)
      .expect(({ body }) => expect(body.revision.version).toBe(4));
    const postRejectionPreview = await request(app.getHttpServer())
      .post("/api/v1/roadmap-revisions")
      .set("Cookie", studentCookie)
      .send({
        kind: "EXAM",
        reason: "Verify a rejected version does not block future previews.",
      })
      .expect(201);
    expect(postRejectionPreview.body.version).toBe(6);
    await request(app.getHttpServer())
      .post(`/api/v1/roadmap-revisions/${postRejectionPreview.body.id}/reject`)
      .set("Cookie", studentCookie)
      .send({})
      .expect(201);

    const roadmapExplanation = await request(app.getHttpServer())
      .get("/api/v1/communication/roadmap-explanation")
      .set("Cookie", studentCookie)
      .expect(200);
    expect(roadmapExplanation.body).toMatchObject({
      source: "FALLBACK",
      cached: false,
      fallbackReason: "PROVIDER_DISABLED",
      promptVersion: "roadmap-explanation-1.0.0",
      explanation: {
        headline: expect.any(String),
        summary: expect.any(String),
      },
    });
    const typedRoadmapExplanation = roadmapExplanation.body as {
      explanation: { focusItems: Array<{ id: string }> };
      authoritativeItems: Array<{ id: string }>;
    };
    expect(
      typedRoadmapExplanation.explanation.focusItems.every(
        ({ id }: { id: string }) =>
          typedRoadmapExplanation.authoritativeItems.some(
            ({ id: allowedId }: { id: string }) => allowedId === id,
          ),
      ),
    ).toBe(true);
    await request(app.getHttpServer())
      .get("/api/v1/communication/roadmap-explanation")
      .set("Cookie", studentCookie)
      .expect(200)
      .expect(({ body }) => expect(body.cached).toBe(true));
    await request(app.getHttpServer())
      .get("/api/v1/communication/roadmap-explanation")
      .set("Cookie", editorCookie)
      .expect(404);
    const coaching = await request(app.getHttpServer())
      .get("/api/v1/communication/weekly-coaching?weekStart=2026-08-24")
      .set("Cookie", studentCookie)
      .expect(200);
    expect(coaching.body).toMatchObject({
      source: "FALLBACK",
      fallbackReason: "PROVIDER_DISABLED",
      promptVersion: "weekly-coaching-1.0.0",
    });
    const aiAudit = await database.aiRequestAudit.findMany({
      where: { userId: student.id },
    });
    expect(aiAudit).toHaveLength(2);
    expect(
      JSON.stringify(aiAudit.map(({ sentFields }) => sentFields)),
    ).not.toMatch(/email|artifact|note|college/i);

    const defaultPreferences = await request(app.getHttpServer())
      .get("/api/v1/communication/preferences")
      .set("Cookie", studentCookie)
      .expect(200);
    const typedDefaultPreferences = defaultPreferences.body as {
      aiProcessingConsent: boolean;
      types: Array<{
        type: string;
        inAppEnabled: boolean;
        emailEnabled: boolean;
      }>;
    };
    expect(typedDefaultPreferences.aiProcessingConsent).toBe(false);
    expect(
      typedDefaultPreferences.types.every(
        (preference: { inAppEnabled: boolean; emailEnabled: boolean }) =>
          !preference.inAppEnabled && !preference.emailEnabled,
      ),
    ).toBe(true);
    await request(app.getHttpServer())
      .put("/api/v1/communication/preferences")
      .set("Cookie", studentCookie)
      .send({
        ...typedDefaultPreferences,
        timezone: "Not/A_Timezone",
      })
      .expect(422)
      .expect(({ body }) => expect(body.code).toBe("INVALID_TIMEZONE"));
    const enabledTypes = typedDefaultPreferences.types.map(
      (preference: { type: string }) => ({
        ...preference,
        inAppEnabled: ["TODAY_PLAN", "WEEKLY_REVIEW", "UPCOMING_EXAM"].includes(
          preference.type,
        ),
        emailEnabled: preference.type === "UPCOMING_EXAM",
      }),
    );
    await request(app.getHttpServer())
      .put("/api/v1/communication/preferences")
      .set("Cookie", studentCookie)
      .send({
        timezone: "Asia/Kolkata",
        dailyReminderMinute: 1080,
        quietHoursEnabled: true,
        quietStartMinute: 1320,
        quietEndMinute: 420,
        aiProcessingConsent: true,
        types: enabledTypes,
      })
      .expect(200)
      .expect(({ body }) => {
        const preferences = body as {
          types: Array<{
            type: string;
            inAppEnabled: boolean;
            emailEnabled: boolean;
          }>;
        };
        expect(
          preferences.types.find(
            ({ type }: { type: string }) => type === "UPCOMING_EXAM",
          ),
        ).toMatchObject({ inAppEnabled: true, emailEnabled: true });
      });
    const queuedEnhancement = await request(app.getHttpServer())
      .get("/api/v1/communication/roadmap-explanation")
      .set("Cookie", studentCookie)
      .expect(200);
    expect(queuedEnhancement.body).toMatchObject({
      source: "FALLBACK",
      enhancementQueued: true,
    });
    const enhancementJob = await database.outboxEvent.findFirstOrThrow({
      where: {
        aggregateType: "AiExplanation",
        eventType: "communication.ai-explanation-requested.v1",
      },
    });
    expect(JSON.stringify(enhancementJob.payload)).not.toMatch(
      /academic-student@|artifact|privateNote/i,
    );
    await request(app.getHttpServer())
      .put("/api/v1/communication/preferences")
      .set("Cookie", studentCookie)
      .send({
        timezone: "Asia/Kolkata",
        dailyReminderMinute: 1080,
        quietHoursEnabled: true,
        quietStartMinute: 1320,
        quietEndMinute: 420,
        aiProcessingConsent: false,
        types: enabledTypes,
      })
      .expect(200)
      .expect(({ body }) => expect(body.aiProcessingConsent).toBe(false));
    expect(
      await database.outboxEvent.findUniqueOrThrow({
        where: { id: enhancementJob.id },
      }),
    ).toMatchObject({ status: "FAILED", lastError: "CONSENT_REVOKED" });
    await request(app.getHttpServer())
      .post("/api/v1/notifications/activity")
      .set("Cookie", studentCookie)
      .send({})
      .expect(201);

    const notificationId = uuidV7();
    await database.notificationIntent.create({
      data: {
        id: notificationId,
        userId: student.id,
        type: "UPCOMING_EXAM",
        dedupeKey: `test:${notificationId}`,
        title: "Synthetic exam reminder",
        body: "The confirmed exam is approaching.",
        actionUrl: "/calendar",
        stateHash:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        scheduledFor: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        deliveries: {
          create: {
            id: uuidV7(),
            channel: "IN_APP",
            status: "DELIVERED",
            deliveredAt: new Date(),
          },
        },
      },
    });
    await request(app.getHttpServer())
      .get("/api/v1/notifications?unread=true")
      .set("Cookie", studentCookie)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: notificationId,
              type: "UPCOMING_EXAM",
              readAt: null,
            }),
          ]),
        ),
      );
    await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set("Cookie", editorCookie)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set("Cookie", studentCookie)
      .send({})
      .expect(200)
      .expect(({ body }) => expect(body.readAt).toBeTruthy());
    await request(app.getHttpServer())
      .get("/api/v1/plans/today?date=2026-08-24")
      .set("Cookie", editorCookie)
      .expect(404);

    await request(app.getHttpServer())
      .get("/api/v1/privacy/preferences")
      .set("Cookie", studentCookie)
      .expect(200)
      .expect(({ body }) => expect(body.analyticsConsent).toBe(false));
    await request(app.getHttpServer())
      .put("/api/v1/privacy/preferences")
      .set("Cookie", studentCookie)
      .send({ analyticsConsent: true })
      .expect(200)
      .expect(({ body }) => {
        expect(body.analyticsConsent).toBe(true);
        expect(body.analyticsConsentAt).toBeTruthy();
      });
    await request(app.getHttpServer())
      .post("/api/v1/pilot/feedback")
      .set("Cookie", studentCookie)
      .send({ surface: "OVERALL", rating: 6 })
      .expect(400);
    await request(app.getHttpServer())
      .post("/api/v1/pilot/feedback")
      .set("Cookie", studentCookie)
      .send({
        surface: "WEEKLY_PLAN",
        rating: 4,
        comment: "The synthetic plan language was clear.",
      })
      .expect(201)
      .expect(({ body }) => expect(body.rating).toBe(4));
    await request(app.getHttpServer())
      .get("/api/v1/admin/pilot/metrics?since=2026-01-01")
      .set("Cookie", reviewerCookie)
      .expect(403);
    await database.adminMembership.update({
      where: { userId: reviewer.id },
      data: { role: "ANALYST" },
    });
    await request(app.getHttpServer())
      .get("/api/v1/admin/pilot/metrics?since=2026-01-01")
      .set("Cookie", reviewerCookie)
      .expect(200)
      .expect(({ body }) => {
        expect(body.consentedStudents).toBeGreaterThanOrEqual(1);
        expect(body.usefulness).toMatchObject({
          responses: 1,
          medianRating: 4,
        });
        expect(body.traceAccuracy.status).toBe("HUMAN_REVIEW_REQUIRED");
        expect(body).not.toHaveProperty("students");
      });

    const exported = await request(app.getHttpServer())
      .get("/api/v1/privacy/export")
      .set("Cookie", studentCookie)
      .expect(200)
      .expect("cache-control", "no-store");
    expect(exported.headers["content-disposition"]).toContain(
      "studentos-data-export.json",
    );
    expect(exported.body).toMatchObject({
      schemaVersion: "studentos-export-1.0.0",
      identity: { id: student.id, email: "academic-student@example.com" },
    });
    expect(JSON.stringify(exported.body)).not.toMatch(
      /studentos_session|tokenHash|verificationToken/i,
    );
    const editorExport = await request(app.getHttpServer())
      .get("/api/v1/privacy/export")
      .set("Cookie", editorCookie)
      .expect(200);
    expect(JSON.stringify(editorExport.body)).not.toContain(
      "academic-student@example.com",
    );

    await request(app.getHttpServer())
      .post("/api/v1/privacy/account-deletion")
      .set("Cookie", studentCookie)
      .send({ confirmation: "delete" })
      .expect(400);
    const cancellableJob = await database.generationJob.findFirstOrThrow({
      where: { userId: student.id },
      orderBy: { createdAt: "desc" },
    });
    await database.generationJob.update({
      where: { id: cancellableJob.id },
      data: {
        status: "QUEUED",
        stage: "VALIDATING",
        completedAt: null,
      },
    });
    await request(app.getHttpServer())
      .post("/api/v1/privacy/account-deletion")
      .set("Cookie", studentCookie)
      .send({ confirmation: "DELETE MY ACCOUNT" })
      .expect(202)
      .expect(({ body }) => {
        expect(body.status).toBe("DELETION_PENDING");
        expect(body.purgeEligibleAt).toBeTruthy();
      });
    expect(
      await database.user.findUniqueOrThrow({ where: { id: student.id } }),
    ).toMatchObject({ status: "DELETION_PENDING" });
    expect(
      await database.generationJob.findUniqueOrThrow({
        where: { id: cancellableJob.id },
      }),
    ).toMatchObject({
      status: "FAILED",
      stage: "CANCELLED",
      errorCode: "ACCOUNT_DELETION",
    });
    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", studentCookie)
      .expect(401);
    const deletedAccountLink = await request(app.getHttpServer())
      .post("/api/v1/auth/magic-links")
      .send({ email: "academic-student@example.com" })
      .expect(202);
    await request(app.getHttpServer())
      .post("/api/v1/auth/magic-links/verify")
      .send({ token: deletedAccountLink.body.debugToken })
      .expect(401)
      .expect(({ body }) => expect(body.code).toBe("ACCOUNT_UNAVAILABLE"));
    await database.adminMembership.update({
      where: { userId: reviewer.id },
      data: { role: "SUPPORT" },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/privacy/accounts/${student.id}/recover`)
      .set("Cookie", reviewerCookie)
      .send({})
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe("ACTIVE"));
    const recoveredAccountLink = await request(app.getHttpServer())
      .post("/api/v1/auth/magic-links")
      .send({ email: "academic-student@example.com" })
      .expect(202);
    await request(app.getHttpServer())
      .post("/api/v1/auth/magic-links/verify")
      .send({ token: recoveredAccountLink.body.debugToken })
      .expect(200);
  });
});

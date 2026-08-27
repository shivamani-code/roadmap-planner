import { describe, expect, it } from "vitest";
import {
  calculateProgress,
  calculateReadiness,
  scoreProject,
  taskEvidenceEstimate,
} from "../src/index.js";

describe("evidence, progress, projects, and preparation readiness", () => {
  it("caps checkmark evidence below mastery and allows stronger artifact evidence", () => {
    expect(
      taskEvidenceEstimate({ currentProficiency: 0.64, hasArtifact: false }),
    ).toEqual({ proficiency: 0.65, confidence: 0.55 });
    expect(
      taskEvidenceEstimate({ currentProficiency: 0.76, hasArtifact: true }),
    ).toEqual({ proficiency: 0.8, confidence: 0.82 });
  });

  it("applies readiness evidence confidence once and enforces every gate", () => {
    const skills = [
      {
        id: "SQL",
        dimension: "DATABASES",
        requiredDepth: 0.8,
        importance: 1,
        proficiency: 0.8,
        confidence: 1,
      },
    ];
    expect(
      calculateReadiness(skills, {
        reviewedProject: false,
        profileComplete: true,
        timedAssessment: true,
        interviewEvidence: true,
      }),
    ).toMatchObject({ score: 69, uncappedScore: 100, cap: 69 });
    expect(
      calculateReadiness(skills, {
        reviewedProject: true,
        profileComplete: false,
        timedAssessment: true,
        interviewEvidence: true,
      }).cap,
    ).toBe(79);
    expect(
      calculateReadiness(skills, {
        reviewedProject: true,
        profileComplete: true,
        timedAssessment: true,
        interviewEvidence: false,
      }).cap,
    ).toBe(89);
  });

  it("keeps dimensions transparent and confidence-sensitive", () => {
    const result = calculateReadiness(
      [
        {
          id: "REST",
          dimension: "DEVELOPMENT",
          requiredDepth: 0.8,
          importance: 0.75,
          proficiency: 0.6,
          confidence: 0.45,
        },
        {
          id: "SQL",
          dimension: "DATABASES",
          requiredDepth: 0.8,
          importance: 0.25,
          proficiency: 0.4,
          confidence: 0.8,
        },
      ],
      {
        reviewedProject: false,
        profileComplete: false,
        timedAssessment: false,
        interviewEvidence: false,
      },
    );
    expect(result.dimensions).toHaveLength(2);
    expect(
      result.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0),
    ).toBeCloseTo(1);
    expect(result.score).toBeLessThanOrEqual(69);
  });

  it("implements project selection weights and immutable-event progress ratios", () => {
    expect(
      scoreProject({
        roleFit: 1,
        missingEvidenceCoverage: 1,
        currentlyLearningAlignment: 1,
        portfolioValue: 1,
        feasibility: 1,
        studentInterest: 1,
      }),
    ).toBe(100);
    expect(
      calculateProgress({
        plannedTasks: 10,
        completedTasks: 4,
        plannedMinutes: 600,
        completedMinutes: 300,
        totalRoadmapMinutes: 1000,
        completedRoadmapMinutes: 250,
        eligibleDays: 8,
        activeDays: 6,
      }),
    ).toEqual({
      taskCompletion: 0.4,
      minuteCompletion: 0.5,
      roadmapProgress: 0.25,
      consistency: 0.75,
    });
  });
});

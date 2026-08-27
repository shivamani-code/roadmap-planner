import type { CareerRoleOption, TargetLevel } from "@studentos/contracts";

export function roleLevel(role: CareerRoleOption, level: TargetLevel) {
  return role.targetLevels.find((candidate) => candidate.level === level);
}

export function formatTargetLevel(level: TargetLevel): string {
  return level
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

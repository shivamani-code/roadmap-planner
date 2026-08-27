export type AdminRole =
  "CONTENT_EDITOR" | "CONTENT_REVIEWER" | "SUPPORT" | "ANALYST" | "SUPER_ADMIN";

export function canPublish(role: AdminRole): boolean {
  return role === "CONTENT_REVIEWER" || role === "SUPER_ADMIN";
}

export function canEditContent(role: AdminRole): boolean {
  return role === "CONTENT_EDITOR" || role === "SUPER_ADMIN";
}

export function publicationHasSeparation(
  editorId: string,
  reviewerId: string,
): boolean {
  return (
    editorId.length > 0 && reviewerId.length > 0 && editorId !== reviewerId
  );
}

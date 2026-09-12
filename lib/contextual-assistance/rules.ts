import type { LearnContextState } from "./types";

type LearnContext = {
  progressPercentage: number;
  completedPreviewLessons: number;
  previewLessons: number;
  premiumLessons: number;
  currentLessonLocked: boolean;
  latestActivityAt?: string | null;
  currentLessonStarted?: boolean;
  now?: Date;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function getLearnContextState({
  progressPercentage,
  completedPreviewLessons,
  previewLessons,
  premiumLessons,
  currentLessonLocked,
  latestActivityAt,
  currentLessonStarted = false,
  now = new Date(),
}: LearnContext): LearnContextState {
  if (currentLessonLocked) {
    return "premiumLocked";
  }

  if (progressPercentage >= 100) {
    return "completed";
  }

  if (
    previewLessons > 0 &&
    completedPreviewLessons === previewLessons &&
    premiumLessons > 0
  ) {
    return "previewCompleted";
  }

  const lastActivityTime = latestActivityAt
    ? Date.parse(latestActivityAt)
    : Number.NaN;
  const daysSinceLastActivity = Number.isNaN(lastActivityTime)
    ? 0
    : (now.getTime() - lastActivityTime) / DAY_IN_MS;

  if (daysSinceLastActivity >= 30) {
    return "inactive";
  }

  if (currentLessonStarted && daysSinceLastActivity >= 1) {
    return "returned";
  }

  if (progressPercentage <= 0) {
    return "noProgress";
  }

  if (progressPercentage < 50) {
    return "started";
  }

  if (progressPercentage < 80) {
    return "halfway";
  }

  return "almostCompleted";
}

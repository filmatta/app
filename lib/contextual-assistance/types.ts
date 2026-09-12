export type ContextualVertical =
  | "learn"
  | "profile"
  | "project"
  | "location"
  | "opportunity"
  | "rental"
  | "business";

export type MattiPose =
  | "neutral"
  | "focused"
  | "thinking"
  | "happy"
  | "curious"
  | "agree";

export type LearnContextState =
  | "default"
  | "noProgress"
  | "started"
  | "halfway"
  | "almostCompleted"
  | "previewCompleted"
  | "premiumLocked"
  | "completed"
  | "returned"
  | "inactive";

export type ProfileContextState =
  | "default"
  | "emptyProfile"
  | "missingPhoto"
  | "missingBio"
  | "missingDiscipline"
  | "missingReel"
  | "missingAvailability"
  | "profile50"
  | "profile70"
  | "profileComplete";

export type ProjectContextState =
  | "default"
  | "newProject"
  | "missingCrew"
  | "missingDates"
  | "missingBudget"
  | "missingLocation"
  | "missingCallSheet"
  | "activeProject"
  | "finishedProject";

export type LocationContextState =
  | "default"
  | "browsing"
  | "missingNoiseInfo"
  | "missingPowerInfo"
  | "missingParking"
  | "missingPermissions"
  | "savedLocations"
  | "projectHasNoLocation";

export type ContextualState =
  | LearnContextState
  | ProfileContextState
  | ProjectContextState
  | LocationContextState;

export type ContextualTip = {
  id: string;
  vertical: ContextualVertical;
  states: readonly ContextualState[];
  text: string;
  mattiPose?: MattiPose;
  priority?: number;
};

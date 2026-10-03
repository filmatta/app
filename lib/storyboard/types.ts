export const STORYBOARD_SCHEMA_VERSION = 1 as const;
export const STORYBOARD_MAX_BYTES = 2_000_000;
export const STORYBOARD_MAX_OBJECTS = 2_000;
export const STORYBOARD_MAX_POINTS = 100_000;
export const STORYBOARD_MAX_TEXT = 1_000;
export const STORYBOARD_DEFAULT_FRAME = { width: 1600, height: 900 } as const;

export type StoryboardPoint = { x: number; y: number; pressure?: number };
export type StoryboardTransform = {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
};

type StoryboardObjectBase = StoryboardTransform & {
  id: string;
  color: string;
  opacity: number;
};

export type StoryboardStroke = StoryboardObjectBase & {
  type: "stroke";
  points: StoryboardPoint[];
  width: number;
};

export type StoryboardLine = StoryboardObjectBase & {
  type: "line" | "arrow";
  points: [number, number, number, number];
  width: number;
};

export type StoryboardShape = StoryboardObjectBase & {
  type: "rectangle" | "ellipse";
  width: number;
  height: number;
  strokeWidth: number;
  fill: string | null;
};

export type StoryboardText = StoryboardObjectBase & {
  type: "text";
  text: string;
  width: number;
  fontSize: number;
  fontFamily: "Arial" | "Georgia" | "Courier New";
  align: "left" | "center" | "right";
};

export type StoryboardObject = StoryboardStroke | StoryboardLine | StoryboardShape | StoryboardText;

export type StoryboardReference = {
  assetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
};

export type StoryboardDocument = {
  schemaVersion: typeof STORYBOARD_SCHEMA_VERSION;
  frame: { width: number; height: number };
  reference: StoryboardReference | null;
  objects: StoryboardObject[];
};

export type StoryboardContentKind = "empty" | "drawing" | "reference" | "mixed";

export type StoryboardRevision = {
  id: string;
  panelId: string;
  revisionNumber: number;
  schemaVersion: number;
  document?: StoryboardDocument;
  baseAssetId: string | null;
  visualNote: string | null;
  logicalWidth: number;
  logicalHeight: number;
  contentKind: StoryboardContentKind;
  contentHash: string;
  sourceShotRevision: number;
  sourceContextHash: string;
  createdAt: string;
};

export type StoryboardPanel = {
  id: string;
  shotlistId: string;
  shotId: string;
  position: number;
  currentRevisionId: string;
  currentRevision: StoryboardRevision;
  approvedRevisionId: string | null;
  acknowledgedContextHash: string | null;
  previewAssetId: string | null;
  previewRevisionId: string | null;
  renderStatus: "missing" | "pending" | "ready" | "failed";
};

export type StoryboardShot = {
  id: string;
  groupId: string;
  position: number;
  revision: number;
  shotType: string;
  composition: string | null;
  subject: string;
  angle: string;
  movement: string;
  lens: string | null;
  description: string | null;
  intention: string | null;
  notes: string | null;
  assetId: string | null;
  contextHash: string;
  panels: StoryboardPanel[];
};

export type StoryboardGroup = {
  id: string;
  title: string;
  position: number;
  sourceStatus: "linked" | "missing" | "manual";
  sourceSceneId: string | null;
  shots: StoryboardShot[];
};

export type StoryboardBoard = {
  shotlist: { id: string; title: string; scriptId: string | null; revision: number };
  groups: StoryboardGroup[];
};

export function emptyStoryboardDocument(
  frame: { width: number; height: number } = STORYBOARD_DEFAULT_FRAME,
): StoryboardDocument {
  return {
    schemaVersion: STORYBOARD_SCHEMA_VERSION,
    frame: { width: frame.width, height: frame.height },
    reference: null,
    objects: [],
  };
}

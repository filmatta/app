export const CREAR_ITEM_TYPES = ["premise", "character", "world", "theme", "pending"] as const;
export const CREAR_ITEM_STATES = ["active", "canon", "maybe", "discarded"] as const;
export const CREAR_REACTION_EMOJIS = ["🔥", "❤️", "💡", "🤔", "😂", "🧠", "❌"] as const;

export type CrearItemType = (typeof CREAR_ITEM_TYPES)[number];
export type CrearItemState = (typeof CREAR_ITEM_STATES)[number];
export type CrearReactionEmoji = (typeof CREAR_REACTION_EMOJIS)[number];
export type CrearMessageRole = "user" | "assistant";

export type CrearSuggestion = {
  type: CrearItemType;
  title: string | null;
  content: string;
};

export type CrearSession = {
  id: string;
  title: string;
  premise: string | null;
  projectId: string | null;
  writerId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CrearMessageMetadata = {
  turnId?: string;
  blockIndex?: number;
  blockCount?: number;
  suggestions?: CrearSuggestion[];
  demo?: boolean;
  [key: string]: unknown;
};

export type CrearMessage = {
  id: string;
  sessionId: string;
  role: CrearMessageRole;
  content: string;
  parentMessageId: string | null;
  metadata: CrearMessageMetadata;
  createdAt: string;
};

export type CrearItem = {
  id: string;
  sessionId: string;
  type: CrearItemType;
  suggestedType: CrearItemType | null;
  title: string | null;
  content: string;
  state: CrearItemState;
  sourceMessageId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CrearReaction = {
  messageId: string;
  emoji: CrearReactionEmoji;
  active: boolean;
};

export type CrearSessionDetail = {
  session: CrearSession;
  messages: CrearMessage[];
  items: CrearItem[];
  reactions: CrearReaction[];
};

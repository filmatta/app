"use client";

import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Fragment, Slice } from "@tiptap/pm/model";
import { TextSelection, type EditorState } from "@tiptap/pm/state";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  WRITER_SCHEMA_VERSION,
  blockText,
  canonicalWriterDocument,
  countDocumentWords,
  deriveCharacters,
  deriveScenes,
  validateWriterDocument,
  type ScreenplayKind,
  type WriterDocument,
  type WriterSnapshot,
} from "@/lib/writer/document";
import {
  parseAssistedImportAnalysisStatus,
  writerImportCompletionMessage,
} from "@/lib/writer/assisted-import-status";
import { createBasicFdx, createWriterBackup, writerFileStem } from "@/lib/writer/export";
import {
  WriterPersistenceController,
  type RemoteSaveRequest,
  type RemoteSaveResult,
  type WriterPersistenceState,
} from "@/lib/writer/persistence";
import { loadLocalWriterDrafts } from "@/lib/writer/storage";
import { startWriterTabLease, type WriterTabLease } from "@/lib/writer/tab-lease";
import {
  ScreenplayBlockExtension,
  setWriterAssistantMarkers,
  setWriterImportReviewDecorations,
  setWriterObservationMarkers,
  setWriterSceneHighlight,
} from "@/lib/writer/tiptap";
import { deriveWriterTimeline } from "@/lib/writer/timeline";
import {
  WRITER_TIMELINE_DESKTOP_QUERY,
  writerTimelineRestoresAfterFocus,
  writerTimelineStartsOpen,
} from "@/lib/writer/workspace-ui";
import {
  WRITER_PANEL_LAYOUT_DEFAULTS,
  fitWriterPanelLayout,
  parseWriterPanelLayout,
  writerPanelStorageKey,
  type WriterPanelLayout,
  type WriterPanelSide,
} from "@/lib/writer/panel-layout";
import {
  WRITER_WORKSPACE_LAYOUT_DEFAULTS,
  legacyWriterWorkspaceLayoutStorageKey,
  migrateWriterWorkspaceLayout,
  parseWriterWorkspaceLayout,
  writerWorkspaceLayoutStorageKey,
  type WriterWorkspaceLayout,
} from "@/lib/writer/workspace-layout";
import {
  WRITER_APPEARANCE_DEFAULTS,
  parseWriterAppearance,
  writerAppearanceStorageKey,
  type WriterAppearance,
  type WriterSkin,
} from "@/lib/writer/appearance";
import { WRITER_KIND_SHORTCUTS, writerKindShortcut, writerShortcutLabel } from "@/lib/writer/shortcuts";
import WriterImportFlow from "./WriterImportFlow";
import WriterBreakdownPanel from "./WriterBreakdownPanel";
import WriterAssistantNarrative from "./WriterAssistantNarrative";
import WriterGuidedWriting from "./WriterGuidedWriting";
import WriterSelectionAnalysisDialog from "./WriterSelectionAnalysisDialog";
import WriterObservationsPanel, { type WriterObservationsSection } from "./WriterObservationsPanel";
import WriterPanelResizeHandle from "./WriterPanelResizeHandle";
import WriterHorizontalResizeHandle from "./WriterHorizontalResizeHandle";
import WriterSetupPayoff from "./WriterSetupPayoff";
import WriterPdfExportDialog from "./WriterPdfExportDialog";
import WriterTimelineView from "./WriterTimeline";
import WriterIcon from "./WriterIcon";
import { useWriterPopoverDismissal } from "./useWriterPopoverDismissal";
import { WriterIdeasPanel, WriterSearchPanel, WriterVersionsPanel } from "./WriterErgonomicTools";
import {
  SmartFeatureIndicator,
  WriterAutoFormatFlow,
  WriterPasteFormatPrompt,
  WriterReadinessNotice,
} from "./WriterSmartFormatting";
import {
  WriterContextMenu,
  WriterInsertPanel,
  WRITER_KIND_LABELS,
  type WriterContextMenuState,
  type WriterInsertState,
} from "@/components/writer/WriterWritingTools";
import {
  currentWriterBlock,
  captureWriterSelectionTarget,
  applyWriterImportedDocument,
  applyWriterAutoFormat,
  changeWriterBlockKind,
  findWriterBlockById,
  insertWriterEmptyBlock,
  writerSelectionTargetIsCurrent,
  writerSceneForSelection,
  duplicateWriterScene,
  moveWriterScene,
  renameWriterCharacter,
  renameWriterSceneNickname,
  replaceWriterTextMatches,
  writerSceneIds,
  type WriterCharacterReference,
  type WriterSceneMovePosition,
  type WriterSelectionTarget,
} from "@/lib/writer/editor-actions";
import {
  parseWriterInternalHistory,
  recordWriterInternalRoute,
  stepWriterInternalHistory,
  writerInternalHistoryStorageKey,
  type WriterInternalHistory,
} from "@/lib/writer/internal-navigation";
import {
  acceptWriterAutocomplete,
  writerAutocompleteContext,
  writerAutocompleteKeyAction,
  writerAutocompleteSuggestions,
  type WriterAutocompleteSuggestion,
} from "@/lib/writer/autocomplete";
import {
  assessWriterPaste,
  canUseStructuredFeature,
  createWriterAutoFormatPlan,
  mergeWriterAutoFormatClassifications,
  resolveWriterAutoFormatChanges,
  writerAutoFormatCandidates,
  type WriterAutoFormatPlan,
  type WriterStructuredFeature,
} from "@/lib/writer/smart-format";
import {
  createWriterFormatBaseline,
  invalidateWriterFormatBaseline,
  loadWriterFormatBaseline,
  resolveWriterFormatBaseline,
  saveWriterFormatBaseline,
  writerReadinessWithFormatBaseline,
  type WriterFormatBaseline,
} from "@/lib/writer/format-baseline";
import { createWriterCheckpoint, writerCheckpointLabel } from "@/lib/writer/checkpoints";
import type { WriterSearchResult, WriterSearchScope } from "@/lib/writer/search";
import type { WriterIdea, WriterIdeaContext } from "@/lib/writer/ideas";
import {
  isWriterTextInputKey,
  loadWriterTypewriterSoundPreference,
  playWriterTypewriterClick,
  primeWriterTypewriterSound,
  saveWriterTypewriterSoundPreference,
} from "@/lib/writer/typewriter-sound";
import { classifyWriterAutoFormat } from "@/lib/writer/auto-format-client";
import {
  analyzeWriterCharacterObservations,
  deriveWriterKnownCharacterIdentities,
  writerCharacterIdentityKey,
  writerObservationTextHash,
  type WriterCharacterAnalysisCache,
  type WriterCharacterObservation,
} from "@/lib/writer/character-observations";
import { isClearlyNonCharacterLine, parseWriterCharacterCue } from "@/lib/writer/character-cues";
import {
  emptyWriterCharacterDecisionState,
  loadWriterCharacterDecisionState,
  saveWriterCharacterDecisionState,
  type WriterCharacterDecision,
  type WriterCharacterDecisionState,
} from "@/lib/writer/character-observation-storage";
import {
  parsePersistedWriterImportAnalysis,
  writerFormatObservationState,
  type PersistedWriterImportAnalysis,
  type WriterFormatObservation,
} from "@/lib/writer/import-analysis";
import {
  emptyWriterImportReviewState,
  loadWriterImportReviewState,
  saveWriterImportReviewState,
} from "@/lib/writer/import-review-storage";
import { deriveAcceptedCharacterActivity } from "@/lib/writer/writing-ux";
import {
  emptyWriterStructuralMetadata,
  loadWriterStructuralMetadata,
  normalizeWriterSceneNickname,
  normalizeWriterStructuralName,
  saveWriterStructuralMetadata,
  type WriterStructuralMetadata,
} from "@/lib/writer/structural-metadata-storage";
import { setWriterDragPreview } from "@/lib/writer/drag-preview";
import { useWriterScriptAssistant } from "@/lib/writer/script-assistant-client";
import type { WriterNarrativeObservation } from "@/lib/writer/script-assistant";
import { useWriterSetupPayoff } from "@/lib/writer/setup-payoff-client";
import type { WriterNarrativeElement } from "@/lib/writer/setup-payoff";
import { useWriterGuidedWriting } from "@/lib/writer/guided-writing-client";
import type { WriterGuidedReference, WriterGuidedSelection } from "@/lib/writer/guided-writing";
import WriterApplicationMenu from "./WriterApplicationMenu";

type ScriptInput = {
  id: string;
  title: string;
  document: WriterDocument;
  schemaVersion: number;
  revision: number;
  updatedAt: string;
};

type WriterAutocompleteState = {
  suggestions: WriterAutocompleteSuggestion[];
  selectedIndex: number;
  explicitlySelected: boolean;
  x: number;
  y: number;
};

type WriterNavigationEntry = {
  sceneId: string;
  blockId: string;
  fromOffset: number;
  toOffset: number;
};

type WriterStructuralToast = {
  message: string;
  token: number;
};

type WriterPasteAssistState = {
  step: "offer" | "consequence";
  blockIds: string[];
};

const initialSaveState: WriterPersistenceState = {
  status: "cloud",
  revision: 1,
  localAvailable: true,
};

export default function WriterWorkspace({
  script,
  userId,
  previewNoCredits,
}: {
  script: ScriptInput;
  userId: string;
  previewNoCredits: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(script.title);
  const titleRef = useRef(script.title);
  const [document, setDocument] = useState(script.document);
  const [saveState, setSaveState] = useState<WriterPersistenceState>({
    ...initialSaveState,
    revision: script.revision,
  });
  const [ready, setReady] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [focusScale, setFocusScale] = useState(1);
  const [mobileSidebar, setMobileSidebar] = useState<"scenes" | "characters" | null>(null);
  const [mobileNavigateOpen, setMobileNavigateOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [mobileNoticeOpen, setMobileNoticeOpen] = useState(false);
  const [activeScene, setActiveScene] = useState<string | null>(null);
  const [structuralMetadata, setStructuralMetadata] = useState<WriterStructuralMetadata>(() => emptyWriterStructuralMetadata());
  const [structuralMetadataPersistent, setStructuralMetadataPersistent] = useState(true);
  const [editingSceneNickname, setEditingSceneNickname] = useState<string | null>(null);
  const [sceneNicknameDraft, setSceneNicknameDraft] = useState("");
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [characterNameDraft, setCharacterNameDraft] = useState("");
  const [sceneActionsOpen, setSceneActionsOpen] = useState<string | null>(null);
  const [draggedSceneId, setDraggedSceneId] = useState<string | null>(null);
  const [sceneDropTarget, setSceneDropTarget] = useState<{ sceneId: string; position: WriterSceneMovePosition } | null>(null);
  const [navigationDepth, setNavigationDepth] = useState(0);
  const [shotlistReturnPath] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const value = new URLSearchParams(window.location.search).get("return");
    return value?.startsWith("/shotlists/") ? value : null;
  });
  const [structuralToast, setStructuralToast] = useState<WriterStructuralToast | null>(null);
  const [exportMenu, setExportMenu] = useState(false);
  const [pdfExportOpen, setPdfExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pasteAssist, setPasteAssist] = useState<WriterPasteAssistState | null>(null);
  const [autoFormatPlan, setAutoFormatPlan] = useState<WriterAutoFormatPlan | null>(null);
  const [autoFormatResolving, setAutoFormatResolving] = useState(false);
  const [autoFormatFallback, setAutoFormatFallback] = useState<string | null>(null);
  const [dismissedReadiness, setDismissedReadiness] = useState<Set<WriterStructuredFeature>>(() => new Set());
  const [observationsOpen, setObservationsOpen] = useState(true);
  const [panelLayout, setPanelLayout] = useState<WriterPanelLayout>(WRITER_PANEL_LAYOUT_DEFAULTS);
  const [workspaceLayout, setWorkspaceLayout] = useState<WriterWorkspaceLayout>(WRITER_WORKSPACE_LAYOUT_DEFAULTS);
  const [appearance, setAppearance] = useState<WriterAppearance>(WRITER_APPEARANCE_DEFAULTS);
  const [appearanceStorageError, setAppearanceStorageError] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [observationsSection, setObservationsSection] = useState<WriterObservationsSection>("review");
  const [selectedObservationBlockId, setSelectedObservationBlockId] = useState<string | null>(null);
  const [selectedAssistantObservationId, setSelectedAssistantObservationId] = useState<string | null>(null);
  const [characterObservations, setCharacterObservations] = useState<WriterCharacterObservation[]>([]);
  const [persistedImportAnalysis, setPersistedImportAnalysis] = useState<PersistedWriterImportAnalysis | null>(null);
  const [characterDecisions, setCharacterDecisions] = useState<WriterCharacterDecisionState>(() => emptyWriterCharacterDecisionState());
  const [characterStoragePersistent, setCharacterStoragePersistent] = useState(true);
  const [reviewedFormatIds, setReviewedFormatIds] = useState<Set<string>>(() => new Set());
  const [formatReviewStoragePersistent, setFormatReviewStoragePersistent] = useState(true);
  const [showImportReviewHighlights, setShowImportReviewHighlights] = useState(true);
  const [activeFormatObservationId, setActiveFormatObservationId] = useState<string | null>(null);
  const [analysisEpoch, setAnalysisEpoch] = useState(0);
  const [contextMenu, setContextMenu] = useState<WriterContextMenuState | null>(null);
  const [insertState, setInsertState] = useState<WriterInsertState | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineMounted, setTimelineMounted] = useState(false);
  const [timelineRefreshToken, setTimelineRefreshToken] = useState(0);
  const [timelineRequestedScene, setTimelineRequestedScene] = useState<string | null>(null);
  const [timelineRequestedView, setTimelineRequestedView] = useState<"timeline" | "pulse" | "ideas" | null>(null);
  const [timelineRequestedViewToken, setTimelineRequestedViewToken] = useState(0);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [charactersCollapsed, setCharactersCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchReplaceMode, setSearchReplaceMode] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [guidedIdeaContext, setGuidedIdeaContext] = useState<WriterIdeaContext | null>(null);
  const [guidedSelection, setGuidedSelection] = useState<WriterGuidedSelection | null>(null);
  const [formatBaseline, setFormatBaseline] = useState<WriterFormatBaseline | null>(null);
  const [typewriterSoundEnabled, setTypewriterSoundEnabled] = useState(false);
  const [autocomplete, setAutocomplete] = useState<WriterAutocompleteState | null>(null);
  const [conflictBusy, setConflictBusy] = useState(false);
  const [shotlistBusy, setShotlistBusy] = useState(false);
  const [shotlistModalOpen, setShotlistModalOpen] = useState(false);
  const [shotlists, setShotlists] = useState<Array<{ id: string; title?: string }>>([]);
  const [shotlistQueryState, setShotlistQueryState] = useState<"loading" | "ready" | "error">("loading");
  const [creatingScript, setCreatingScript] = useState(false);
  const [internalHistory, setInternalHistory] = useState<WriterInternalHistory>({ entries: [], index: -1 });
  const [applicationMenuSelection, setApplicationMenuSelection] = useState<WriterSelectionTarget | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const controllerRef = useRef<WriterPersistenceController | null>(null);
  const documentRef = useRef(script.document);
  const structuralMetadataRef = useRef(structuralMetadata);
  const navigationHistoryRef = useRef<WriterNavigationEntry[]>([]);
  const toastTimeoutRef = useRef<number | null>(null);
  const leaseRef = useRef<WriterTabLease | null>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const shotlistTriggerRef = useRef<HTMLButtonElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const appearanceRootRef = useRef<HTMLDivElement>(null);
  const appearanceButtonRef = useRef<HTMLButtonElement>(null);
  const appearanceRef = useRef<WriterAppearance>(WRITER_APPEARANCE_DEFAULTS);
  const appearanceEditedKeyRef = useRef<string | null>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const activeSceneRef = useRef<string | null>(null);
  const navigationFrameRef = useRef<number | null>(null);
  const nativeFullscreenRef = useRef(false);
  const pointerRef = useRef<{ type: string; at: number }>({ type: "mouse", at: 0 });
  const activeWriterSelectionRef = useRef<WriterSelectionTarget | null>(null);
  const rightClickSelectionRef = useRef<WriterSelectionTarget | null>(null);
  const deepLinkHandledRef = useRef(false);
  const importNoticeHandledRef = useRef(false);
  const highlightTimeoutRef = useRef<number | null>(null);
  const autocompleteRef = useRef<WriterAutocompleteState | null>(null);
  const autoFormatRequestRef = useRef(0);
  const acceptAutocompleteRef = useRef<((suggestion: WriterAutocompleteSuggestion) => boolean) | null>(null);
  const confirmedTimelineRevisionRef = useRef(script.revision);
  const timelineRequestedRevisionRef = useRef(script.revision);
  const timelineOpenRef = useRef(false);
  const timelineInitialOpenHandledRef = useRef<string | null>(null);
  const timelineBeforeFocusRef = useRef(false);
  const observationsBeforeFocusRef = useRef(false);
  const observationsExplicitRef = useRef(false);
  const observationsInitialOpenHandledRef = useRef<string | null>(null);
  const saveStateRef = useRef(saveState);
  const characterDecisionsRef = useRef(characterDecisions);
  const characterAnalysisCacheRef = useRef<WriterCharacterAnalysisCache>(new Map());
  const localAutocompleteCharactersRef = useRef<string[]>([]);
  const composingRef = useRef(false);
  const formatBaselineRef = useRef<WriterFormatBaseline | null>(null);
  const typewriterSoundEnabledRef = useRef(false);
  const observationsButtonRef = useRef<HTMLButtonElement>(null);
  const mobileObservationsButtonRef = useRef<HTMLButtonElement>(null);
  const formatObservationsRef = useRef<WriterFormatObservation[]>([]);
  const reviewedFormatIdsRef = useRef<ReadonlySet<string>>(new Set());
  const importReviewDecorationItemsRef = useRef<Array<{
    id: string;
    blockId: string;
    category: ScreenplayKind;
    state: "classification" | "question";
    active: boolean;
  }>>([]);
  const sessionIdRef = useRef(crypto.randomUUID());
  const internalHistoryKey = useMemo(() => writerInternalHistoryStorageKey(userId), [userId]);
  const openContextMenu = useCallback((next: WriterContextMenuState) => {
    autocompleteRef.current = null;
    setAutocomplete(null);
    setExportMenu(false);
    setInsertState(null);
    setContextMenu(next);
  }, []);
  const openContextMenuAtPointer = useCallback((
    state: EditorState,
    snapshot: WriterSelectionTarget | null,
    x: number,
    y: number,
  ) => {
    const target = snapshot && writerSelectionTargetIsCurrent(state, snapshot) ? snapshot : null;
    const scene = target ? writerSceneForSelection(state) : {
      sceneId: null,
      reason: "Coloca el cursor en el guion para abrir una escena en Timeline.",
    };
    openContextMenu({ target, x, y, sceneId: scene.sceneId, timelineReason: scene.reason });
  }, [openContextMenu]);
  const updateAutocomplete = useCallback((next: WriterAutocompleteState | null) => {
    autocompleteRef.current = next;
    setAutocomplete(next);
  }, []);
  const syncAutocomplete = useCallback((current: Editor) => {
    if (current.view.composing) {
      updateAutocomplete(null);
      return;
    }
    const context = writerAutocompleteContext(current, localAutocompleteCharactersRef.current);
    if (!context) {
      updateAutocomplete(null);
      return;
    }
    const suggestions = writerAutocompleteSuggestions(context);
    if (!suggestions.length) {
      updateAutocomplete(null);
      return;
    }
    const previous = autocompleteRef.current;
    const coordinates = current.view.coordsAtPos(current.state.selection.from);
    const selectedIndex = previous
      ? Math.min(previous.selectedIndex, suggestions.length - 1)
      : 0;
    updateAutocomplete({
      suggestions,
      selectedIndex,
      explicitlySelected: previous?.explicitlySelected ?? false,
      x: coordinates.left,
      y: coordinates.bottom + 6,
    });
  }, [updateAutocomplete]);
  const initialTimeline = useMemo(() => deriveWriterTimeline({
    scriptId: script.id,
    title: script.title,
    document: script.document,
    schemaVersion: script.schemaVersion,
    revision: script.revision,
    updatedAt: script.updatedAt,
  }), [script]);
  const assistant = useWriterScriptAssistant({
    scriptId: script.id,
    document,
    activeSceneId: activeScene,
    saveStatus: saveState.status,
    focusMode,
  });
  const setupPayoff = useWriterSetupPayoff({ scriptId: script.id, document, focusMode });
  const guidedWriting = useWriterGuidedWriting({
    scriptId: script.id,
    document,
    activeSceneId: activeScene,
    enabled: observationsOpen && observationsSection === "guided" && !focusMode,
  });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const restored = loadWriterFormatBaseline(window.location.origin, userId, script.id);
      formatBaselineRef.current = restored;
      setFormatBaseline(restored);
      const sound = loadWriterTypewriterSoundPreference(userId);
      typewriterSoundEnabledRef.current = sound;
      setTypewriterSoundEnabled(sound);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [script.id, userId]);

  const panelLayoutStorageKey = useMemo(() => writerPanelStorageKey(userId), [userId]);
  const workspaceLayoutStorageKey = useMemo(() => writerWorkspaceLayoutStorageKey(userId), [userId]);
  const appearanceStorageKey = useMemo(() => writerAppearanceStorageKey(userId), [userId]);
  const closeAppearance = useCallback(() => setAppearanceOpen(false), []);
  useWriterPopoverDismissal({
    open: appearanceOpen,
    rootRef: appearanceRootRef,
    triggerRef: appearanceButtonRef,
    onDismiss: closeAppearance,
  });
  const commitPanelWidth = useCallback((side: WriterPanelSide, value: number) => {
    setPanelLayout((current) => {
      const next = { ...current, [side]: value };
      try {
        window.localStorage.setItem(panelLayoutStorageKey, JSON.stringify(next));
      } catch {
        // Layout preferences are best-effort and never block Writer.
      }
      return next;
    });
  }, [panelLayoutStorageKey]);

  const commitWorkspaceLayout = useCallback((patch: Partial<WriterWorkspaceLayout>) => {
    setWorkspaceLayout((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(workspaceLayoutStorageKey, JSON.stringify(next));
      } catch {
        // Workspace preferences are best-effort and never block Writer.
      }
      return next;
    });
  }, [workspaceLayoutStorageKey]);

  const setLeftSidebarVisible = useCallback((visible: boolean) => {
    commitWorkspaceLayout({ leftSidebarVisible: visible });
  }, [commitWorkspaceLayout]);

  const setRightSidebarVisible = useCallback((visible: boolean) => {
    observationsExplicitRef.current = true;
    setObservationsOpen(visible);
    commitWorkspaceLayout({ rightSidebarVisible: visible });
  }, [commitWorkspaceLayout]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      let restored = { ...WRITER_WORKSPACE_LAYOUT_DEFAULTS };
      try {
        const current = window.localStorage.getItem(workspaceLayoutStorageKey);
        if (current) {
          restored = migrateWriterWorkspaceLayout(current);
          if (JSON.stringify(restored) !== JSON.stringify(parseWriterWorkspaceLayout(current))) {
            window.localStorage.setItem(workspaceLayoutStorageKey, JSON.stringify(restored));
          }
        }
        else {
          const legacy = window.localStorage.getItem(legacyWriterWorkspaceLayoutStorageKey(userId));
          restored = migrateWriterWorkspaceLayout(legacy);
          if (legacy) window.localStorage.setItem(workspaceLayoutStorageKey, JSON.stringify(restored));
        }
      } catch {
        // Private browsing or disabled storage keeps the product defaults.
      }
      setWorkspaceLayout(restored);
      if (window.matchMedia("(min-width: 901px)").matches) setObservationsOpen(restored.rightSidebarVisible);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [userId, workspaceLayoutStorageKey]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (appearanceEditedKeyRef.current === appearanceStorageKey) return;
      try {
        const restored = parseWriterAppearance(window.localStorage.getItem(appearanceStorageKey));
        appearanceRef.current = restored;
        setAppearance(restored);
        setAppearanceStorageError(false);
      } catch (error) {
        appearanceRef.current = { ...WRITER_APPEARANCE_DEFAULTS };
        setAppearance(appearanceRef.current);
        setAppearanceStorageError(true);
        console.error("Could not restore Writer appearance preference", error);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [appearanceStorageKey]);

  const commitAppearance = useCallback((patch: Partial<WriterAppearance>) => {
    const next = { ...appearanceRef.current, ...patch };
    appearanceEditedKeyRef.current = appearanceStorageKey;
    appearanceRef.current = next;
    setAppearance(next);
    try {
      window.localStorage.setItem(appearanceStorageKey, JSON.stringify(next));
      setAppearanceStorageError(false);
    } catch (error) {
      setAppearanceStorageError(true);
      console.error("Could not save Writer appearance preference", error);
    }
  }, [appearanceStorageKey]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      let restored = { ...WRITER_PANEL_LAYOUT_DEFAULTS };
      try {
        restored = parseWriterPanelLayout(window.localStorage.getItem(panelLayoutStorageKey));
      } catch {
        // Private browsing or disabled storage keeps the exact product defaults.
      }
      setPanelLayout(fitWriterPanelLayout(restored, window.innerWidth, observationsOpen));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [observationsOpen, panelLayoutStorageKey]);

  useEffect(() => {
    const fit = () => setPanelLayout((current) => fitWriterPanelLayout(
      current,
      workspaceRef.current?.clientWidth ?? window.innerWidth,
      observationsOpen && !focusMode,
    ));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [focusMode, observationsOpen]);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        link: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        paragraph: false,
        strike: false,
        trailingNode: false,
      }),
      ScreenplayBlockExtension,
    ],
    content: script.document,
    editorProps: {
      attributes: {
        class: "writer-editor-content",
        "aria-label": "Editor de guion",
        spellcheck: "true",
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData("text/plain");
        if (!text) return true;
        event.preventDefault();
        if (!/[\r\n]/.test(text)) {
          view.dispatch(view.state.tr.insertText(text));
          return true;
        }
        const assessment = assessWriterPaste(text);
        const blockIds: string[] = [];
        const blocks = text.split(/\r?\n/).map((line) => {
          const id = crypto.randomUUID();
          blockIds.push(id);
          return (
          view.state.schema.nodes.screenplayBlock.create(
            { id, kind: "action" },
            line ? view.state.schema.text(line) : undefined,
          ));
        });
        view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.fromArray(blocks), 0, 0)).scrollIntoView());
        if (assessment.qualifies) {
          window.queueMicrotask(() => {
            const nextBaseline = invalidateWriterFormatBaseline(formatBaselineRef.current, {
              kind: "structural",
              reason: "significantPaste",
              affectedBlockIds: blockIds,
            });
            formatBaselineRef.current = nextBaseline;
            setFormatBaseline(nextBaseline);
            if (nextBaseline) {
              try { saveWriterFormatBaseline(window.location.origin, userId, script.id, nextBaseline); } catch { /* best-effort local baseline */ }
            }
            setPasteAssist({ step: "offer", blockIds });
          });
        }
        return true;
      },
      handleDOMEvents: {
        compositionstart: () => {
          composingRef.current = true;
          updateAutocomplete(null);
          return false;
        },
        compositionend: () => {
          composingRef.current = false;
          setAnalysisEpoch((value) => value + 1);
          return false;
        },
        pointerdown: (_view, event) => {
          const pointerEvent = event as PointerEvent;
          pointerRef.current = { type: pointerEvent.pointerType || "mouse", at: Date.now() };
          if (typewriterSoundEnabledRef.current) void primeWriterTypewriterSound();
          if (pointerEvent.button === 2 && pointerRef.current.type === "mouse") {
            rightClickSelectionRef.current = activeWriterSelectionRef.current
              ? captureWriterSelectionTarget(_view.state)
              : null;
          }
          return false;
        },
        contextmenu: (view, event) => {
          const contextEvent = event as MouseEvent;
          const recentPointer = Date.now() - pointerRef.current.at < 2_000 ? pointerRef.current.type : "mouse";
          if (contextEvent.shiftKey || recentPointer !== "mouse") return false;
          contextEvent.preventDefault();
          openContextMenuAtPointer(
            view.state,
            rightClickSelectionRef.current ?? activeWriterSelectionRef.current,
            contextEvent.clientX,
            contextEvent.clientY,
          );
          rightClickSelectionRef.current = null;
          return true;
        },
      },
      handleKeyDown: (view, event) => {
        if (typewriterSoundEnabledRef.current && isWriterTextInputKey(event)) playWriterTypewriterClick();
        const autocompleteMenu = autocompleteRef.current;
        if (!view.composing && !event.isComposing && autocompleteMenu) {
          const action = writerAutocompleteKeyAction(event.key, view.composing || event.isComposing, autocompleteMenu.explicitlySelected);
          if (action === "close") {
            event.preventDefault();
            event.stopPropagation();
            updateAutocomplete(null);
            return true;
          }
          if (action === "next" || action === "previous") {
            event.preventDefault();
            const delta = action === "next" ? 1 : -1;
            const selectedIndex = autocompleteMenu.explicitlySelected
              ? (autocompleteMenu.selectedIndex + delta + autocompleteMenu.suggestions.length) % autocompleteMenu.suggestions.length
              : action === "next" ? 0 : autocompleteMenu.suggestions.length - 1;
            updateAutocomplete({ ...autocompleteMenu, selectedIndex, explicitlySelected: true });
            return true;
          }
          if (action === "accept") {
            event.preventDefault();
            const suggestion = autocompleteMenu.suggestions[autocompleteMenu.selectedIndex];
            if (suggestion && acceptAutocompleteRef.current?.(suggestion)) updateAutocomplete(null);
            return true;
          }
        }
        if (view.composing || event.isComposing || !((event.shiftKey && event.key === "F10") || event.key === "ContextMenu")) {
          return false;
        }
        const target = captureWriterSelectionTarget(view.state);
        if (!target) return false;
        activeWriterSelectionRef.current = target;
        event.preventDefault();
        const coordinates = view.coordsAtPos(view.state.selection.from);
        openContextMenuAtPointer(view.state, target, coordinates.left, coordinates.bottom);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      const rawDocument = current.getJSON() as unknown as WriterDocument;
      const editorNicknames = extractWriterSceneNicknames(rawDocument);
      if (!sameStringRecord(editorNicknames, structuralMetadataRef.current.sceneNicknames)) {
        const nextMetadata = { ...structuralMetadataRef.current, sceneNicknames: editorNicknames };
        structuralMetadataRef.current = nextMetadata;
        setStructuralMetadata(nextMetadata);
        try {
          saveWriterStructuralMetadata(location.origin, userId, script.id, nextMetadata);
          setStructuralMetadataPersistent(true);
        } catch {
          setStructuralMetadataPersistent(false);
        }
      }
      const validated = validateWriterDocument(rawDocument);
      if (!validated.ok) {
        setFeedback(validated.reason);
        return;
      }
      const canonical = canonicalWriterDocument(validated.document);
      if (JSON.stringify(canonical) === JSON.stringify(documentRef.current)) {
        syncAutocomplete(current);
        return;
      }
      documentRef.current = canonical;
      setDocument(canonical);
      controllerRef.current?.markChanged({
        title: titleRef.current,
        document: canonical,
        schemaVersion: WRITER_SCHEMA_VERSION,
      });
      syncAutocomplete(current);
    },
    onSelectionUpdate: ({ editor: current }) => {
      if (current.isFocused) activeWriterSelectionRef.current = captureWriterSelectionTarget(current.state);
      const parent = current.state.selection.$head.parent;
      const nextScene = findSceneForPosition(documentRef.current, parent.attrs.id);
      if (nextScene !== activeSceneRef.current) {
        activeSceneRef.current = nextScene;
        setActiveScene(nextScene);
      }
      syncAutocomplete(current);
    },
    onFocus: ({ editor: current }) => {
      activeWriterSelectionRef.current = captureWriterSelectionTarget(current.state);
    },
  });
  const applicationMenuEditorState = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      canUndo: current?.can().chain().undo().run() ?? false,
      canRedo: current?.can().chain().redo().run() ?? false,
    }),
  });

  useEffect(() => { activeSceneRef.current = activeScene; }, [activeScene]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const restored = parseWriterInternalHistory(window.sessionStorage.getItem(internalHistoryKey));
      const next = recordWriterInternalRoute(restored, `/writer/${script.id}`);
      window.sessionStorage.setItem(internalHistoryKey, JSON.stringify(next));
      setInternalHistory(next);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [internalHistoryKey, script.id]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("import") !== "1") return;
    url.searchParams.delete("import");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    const frame = window.requestAnimationFrame(() => setImportOpen(true));
    return () => window.cancelAnimationFrame(frame);
  }, [script.id]);

  useEffect(() => {
    if (!editor) return;
    const applyKindShortcut = (event: KeyboardEvent) => {
      const kind = writerKindShortcut(event, navigator.platform);
      if (!kind || composingRef.current || !editor.isFocused) return;
      const target = event.target;
      if (!(target instanceof Node) || !editor.view.dom.contains(target)) return;
      if (window.document.querySelector('[role="dialog"]')) return;
      const block = currentWriterBlock(editor);
      if (!block) return;
      event.preventDefault();
      event.stopPropagation();
      if (changeWriterBlockKind(editor, block.id, kind)) setFeedback(`Tipo cambiado a ${WRITER_KIND_LABELS[kind]}.`);
    };
    window.addEventListener("keydown", applyKindShortcut, true);
    return () => window.removeEventListener("keydown", applyKindShortcut, true);
  }, [editor]);

  const loadShotlists = useCallback(async () => {
    setShotlistQueryState("loading");
    try {
      const response = await fetch(`/api/writer/scripts/${script.id}/shotlists`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data?.shotlists)) throw new Error("No pudimos comprobar las Shotlists vinculadas.");
      setShotlists(data.shotlists);
      setShotlistQueryState("ready");
    } catch {
      setShotlistQueryState("error");
    }
  }, [script.id]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void loadShotlists());
    return () => window.cancelAnimationFrame(frame);
  }, [loadShotlists]);

  useEffect(() => {
    if (timelineInitialOpenHandledRef.current === script.id) return;
    timelineInitialOpenHandledRef.current = script.id;
    const shouldOpen = initialTimeline.ok
      && writerTimelineStartsOpen(window.matchMedia(WRITER_TIMELINE_DESKTOP_QUERY).matches);
    timelineOpenRef.current = shouldOpen;
    setTimelineMounted(shouldOpen);
    setTimelineOpen(shouldOpen);
  }, [initialTimeline, script.id]);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 900px)");
    const keepMobileDrawerClosed = () => {
      if (mobile.matches && !observationsExplicitRef.current) setObservationsOpen(false);
    };
    keepMobileDrawerClosed();
    mobile.addEventListener("change", keepMobileDrawerClosed);
    return () => mobile.removeEventListener("change", keepMobileDrawerClosed);
  }, [script.id]);

  useEffect(() => {
    const phone = window.matchMedia("(max-width: 600px)");
    const noticeKey = `filmatta.writer.mobile-notice.v1:${userId}`;
    const updateNotice = () => {
      if (phone.matches && window.localStorage.getItem(noticeKey) !== "dismissed") setMobileNoticeOpen(true);
    };
    updateNotice();
    phone.addEventListener("change", updateNotice);
    return () => phone.removeEventListener("change", updateNotice);
  }, [userId]);

  useEffect(() => {
    const desktop = window.matchMedia(WRITER_TIMELINE_DESKTOP_QUERY);
    const keepNarrowViewportClear = (event: MediaQueryListEvent) => {
      if (event.matches || !timelineOpenRef.current) return;
      timelineOpenRef.current = false;
      setTimelineOpen(false);
    };
    desktop.addEventListener("change", keepNarrowViewportClear);
    return () => desktop.removeEventListener("change", keepNarrowViewportClear);
  }, []);

  const restoreTimelineAfterFocus = useCallback(() => {
    const shouldRestore = writerTimelineRestoresAfterFocus(
      timelineBeforeFocusRef.current,
      window.matchMedia(WRITER_TIMELINE_DESKTOP_QUERY).matches,
    );
    timelineBeforeFocusRef.current = false;
    timelineOpenRef.current = shouldRestore;
    if (shouldRestore) {
      setTimelineMounted(true);
      if (confirmedTimelineRevisionRef.current > timelineRequestedRevisionRef.current) {
        timelineRequestedRevisionRef.current = confirmedTimelineRevisionRef.current;
        setTimelineRefreshToken((value) => value + 1);
      }
    }
    setTimelineOpen(shouldRestore);
    setObservationsOpen(observationsBeforeFocusRef.current);
    observationsBeforeFocusRef.current = false;
  }, []);

  useEffect(() => {
    acceptAutocompleteRef.current = editor
      ? (suggestion) => acceptWriterAutocomplete(editor, suggestion, localAutocompleteCharactersRef.current)
      : null;
    return () => {
      acceptAutocompleteRef.current = null;
    };
  }, [editor]);

  const scenes = useMemo(() => deriveScenes(document), [document]);
  const readiness = useMemo(
    () => writerReadinessWithFormatBaseline(document, formatBaseline),
    [document, formatBaseline],
  );
  const sceneMetadata = useMemo(() => deriveWriterSceneMetadata(document), [document]);
  const knownCharacterIdentities = useMemo(() => {
    const retiredKeys = new Set(Object.entries(structuralMetadata.characterAliases)
      .filter(([key, alias]) => !writerAliasUsesPreviousName(document, key, alias.previousName, alias.blockIds))
      .map(([key]) => key));
    return deriveWriterKnownCharacterIdentities(
      document,
      [
        ...characterDecisions.identities.map((identity) => ({
          name: identity.name,
          source: identity.source,
        })),
        ...(persistedImportAnalysis?.identities
          .filter((identity) => !retiredKeys.has(identity.key))
          .map((identity) => ({
            name: identity.name,
            source: identity.source,
            variants: identity.variants,
          })) ?? []),
      ],
    );
  }, [characterDecisions.identities, document, persistedImportAnalysis?.identities, structuralMetadata.characterAliases]);
  const words = useMemo(() => countDocumentWords(document), [document]);
  const activeDecisionFingerprints = useMemo(
    () => new Set(characterDecisions.decisions.map((decision) => decision.fingerprint)),
    [characterDecisions.decisions],
  );
  const currentBlocksById = useMemo(() => new Map(document.content.map((block) => [block.attrs.id, block])), [document]);
  const combinedCharacterObservations = useMemo(() => {
    const byEvidence = new Map<string, WriterCharacterObservation>();
    const decisionByFingerprint = new Map(characterDecisions.decisions.map((decision) => [decision.fingerprint, decision]));
    for (const observation of [...characterObservations, ...(persistedImportAnalysis?.observations ?? [])]) {
      if (isClearlyNonCharacterLine(observation.identity)) continue;
      const currentBlock = currentBlocksById.get(observation.blockId);
      if (!currentBlock || writerObservationTextHash(blockText(currentBlock)) !== observation.blockHash) continue;
      const key = [observation.identityKey, observation.blockId, observation.start, observation.end, observation.evidence].join("|");
      const current = byEvidence.get(key);
      if (current && observation.source !== "ai" && observation.source !== "explicit") continue;
      const decision = decisionByFingerprint.get(observation.fingerprint);
      const decidedIdentity = decision?.identityId
        ? characterDecisions.identities.find((identity) => identity.id === decision.identityId)
        : null;
      const decidedKey = decision?.identityKey ?? (decidedIdentity ? writerCharacterIdentityKey(decidedIdentity.name) : null);
      const knownIdentity = decidedKey
        ? knownCharacterIdentities.find((identity) => identity.key === decidedKey)
        : null;
      byEvidence.set(key, decision && decision.state !== "ignored" && decidedKey ? {
        ...observation,
        identityKey: decidedKey,
        identity: decidedIdentity?.name ?? knownIdentity?.name ?? observation.identity,
        known: true,
      } : observation);
    }
    return [...byEvidence.values()];
  }, [characterDecisions.decisions, characterDecisions.identities, characterObservations, currentBlocksById, knownCharacterIdentities, persistedImportAnalysis?.observations]);
  const characterActivity = useMemo(
    () => deriveAcceptedCharacterActivity(document, knownCharacterIdentities, combinedCharacterObservations),
    [combinedCharacterObservations, document, knownCharacterIdentities],
  );
  const characterRows = useMemo(() => characterActivity.map((activity) => {
    const local = characterDecisions.identities.find((identity) => writerCharacterIdentityKey(identity.name) === activity.key);
    const explicit = document.content.find((block) => block.attrs.kind === "character"
      && writerCharacterIdentityKey(blockText(block)) === activity.key);
    return {
      ...activity,
      identityId: local?.id ?? explicit?.attrs.id ?? activity.firstBlockId ?? `identity:${activity.key}`,
    };
  }), [characterActivity, characterDecisions.identities, document]);
  localAutocompleteCharactersRef.current = [...new Set([
    ...characterRows.map((identity) => identity.name),
    ...knownCharacterIdentities
      .filter((identity) => identity.source !== "characterBlock")
      .map((identity) => identity.name),
  ])];
  const formatObservations = useMemo(() => (persistedImportAnalysis?.formatObservations ?? []).filter((observation) => {
    const block = currentBlocksById.get(observation.blockId);
    return Boolean(block && block.attrs.kind === observation.kind && writerObservationTextHash(blockText(block)) === observation.blockHash);
  }), [currentBlocksById, persistedImportAnalysis?.formatObservations]);
  const pendingCharacterObservations = useMemo(
    () => combinedCharacterObservations.filter((observation) => !observation.known && !activeDecisionFingerprints.has(observation.fingerprint)),
    [activeDecisionFingerprints, combinedCharacterObservations],
  );
  const pendingFormatObservations = useMemo(
    () => formatObservations.filter((observation) => !reviewedFormatIds.has(observation.id)),
    [formatObservations, reviewedFormatIds],
  );
  const importReviewDecorationItems = useMemo(() => {
    const byBlockId = new Map<string, (typeof importReviewDecorationItemsRef.current)[number]>();
    for (const observation of pendingFormatObservations) {
      const item = {
        id: observation.id,
        blockId: observation.blockId,
        category: observation.kind,
        state: writerFormatObservationState(observation) === "question" ? "question" as const : "classification" as const,
        active: observation.id === activeFormatObservationId,
      };
      const current = byBlockId.get(observation.blockId);
      if (!current || item.active) byBlockId.set(observation.blockId, item);
    }
    return [...byBlockId.values()];
  }, [activeFormatObservationId, pendingFormatObservations]);
  const importReviewDecorationSignature = importReviewDecorationItems
    .map((item) => `${item.id}:${item.blockId}:${item.category}:${item.state}:${item.active ? 1 : 0}`)
    .join("|");
  formatObservationsRef.current = formatObservations;
  reviewedFormatIdsRef.current = reviewedFormatIds;
  importReviewDecorationItemsRef.current = importReviewDecorationItems;
  const pendingObservationCount = pendingCharacterObservations.length + pendingFormatObservations.length;

  useEffect(() => {
    characterAnalysisCacheRef.current = new Map();
    const timer = window.setTimeout(() => {
      try {
        const loaded = loadWriterCharacterDecisionState(location.origin, userId, script.id);
        characterDecisionsRef.current = loaded;
        setCharacterDecisions(loaded);
        setCharacterStoragePersistent(true);
      } catch {
        const empty = emptyWriterCharacterDecisionState();
        characterDecisionsRef.current = empty;
        setCharacterDecisions(empty);
        setCharacterStoragePersistent(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [script.id, userId]);

  useEffect(() => {
    if (!editor || !ready) return;
    const timer = window.setTimeout(() => {
      let loaded = emptyWriterStructuralMetadata();
      try {
        loaded = loadWriterStructuralMetadata(location.origin, userId, script.id);
        setStructuralMetadataPersistent(true);
      } catch {
        setStructuralMetadataPersistent(false);
      }
      structuralMetadataRef.current = loaded;
      setStructuralMetadata(loaded);
      const transaction = editor.state.tr.setMeta("addToHistory", false);
      let changed = false;
      editor.state.doc.descendants((node, position) => {
        if (node.type.name !== "screenplayBlock" || node.attrs.kind !== "sceneHeading") return;
        const nickname = loaded.sceneNicknames[String(node.attrs.id)] ?? null;
        if ((node.attrs.sceneNickname ?? null) === nickname) return;
        transaction.setNodeMarkup(position, undefined, { ...node.attrs, sceneNickname: nickname });
        changed = true;
        return false;
      });
      if (changed) editor.view.dispatch(transaction);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editor, ready, script.id, userId]);

  const updateStructuralMetadata = useCallback((
    updater: (current: WriterStructuralMetadata) => WriterStructuralMetadata,
  ) => {
    const next = updater(structuralMetadataRef.current);
    structuralMetadataRef.current = next;
    setStructuralMetadata(next);
    try {
      saveWriterStructuralMetadata(location.origin, userId, script.id, next);
      setStructuralMetadataPersistent(true);
    } catch {
      setStructuralMetadataPersistent(false);
    }
  }, [script.id, userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const loaded = loadWriterImportReviewState(location.origin, userId, script.id);
        setReviewedFormatIds(new Set(loaded.reviewedFormatIds));
        setFormatReviewStoragePersistent(true);
      } catch {
        setReviewedFormatIds(new Set(emptyWriterImportReviewState().reviewedFormatIds));
        setFormatReviewStoragePersistent(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [script.id, userId]);

  const updateCharacterDecisions = useCallback((
    updater: (current: WriterCharacterDecisionState) => WriterCharacterDecisionState,
  ) => {
    const next = updater(characterDecisionsRef.current);
    characterDecisionsRef.current = next;
    setCharacterDecisions(next);
    try {
      saveWriterCharacterDecisionState(location.origin, userId, script.id, next);
      setCharacterStoragePersistent(true);
    } catch {
      setCharacterStoragePersistent(false);
    }
  }, [script.id, userId]);

  useEffect(() => {
    for (const [previousKey, alias] of Object.entries(structuralMetadata.characterAliases)) {
      const previousActive = writerAliasUsesPreviousName(document, previousKey, alias.previousName, alias.blockIds);
      const desiredName = previousActive ? (alias.previousName ?? previousKey) : alias.name;
      const identity = characterDecisionsRef.current.identities.find((candidate) => candidate.id === alias.identityId);
      if (!identity || identity.name === desiredName) continue;
      updateCharacterDecisions((current) => ({
        ...current,
        identities: current.identities.map((candidate) => candidate.id === alias.identityId
          ? { ...candidate, name: desiredName }
          : candidate),
      }));
    }
  }, [document, structuralMetadata.characterAliases, updateCharacterDecisions]);

  useEffect(() => {
    let active = true;
    fetch(`/api/writer/scripts/${script.id}/analysis`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!active || !payload) return;
        const parsed = parsePersistedWriterImportAnalysis(payload, script.document);
        if (!parsed) return;
        setPersistedImportAnalysis(parsed);
        if (observationsInitialOpenHandledRef.current !== script.id) {
          observationsInitialOpenHandledRef.current = script.id;
          if (window.matchMedia(WRITER_TIMELINE_DESKTOP_QUERY).matches
            && (parsed.formatObservations.length > 0 || parsed.observations.length > 0)) {
            setObservationsOpen(true);
          }
        }
        updateCharacterDecisions((current) => {
          const byFingerprint = new Map(current.decisions.map((decision) => [decision.fingerprint, decision]));
          for (const decision of parsed.decisions) byFingerprint.set(decision.fingerprint, decision);
          return { ...current, decisions: [...byFingerprint.values()] };
        });
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [script.document, script.id, updateCharacterDecisions]);

  const persistCharacterDecision = useCallback(async (
    decision: WriterCharacterDecision,
    identityName?: string,
  ) => {
    if (!persistedImportAnalysis) return;
    const response = await fetch(`/api/writer/scripts/${script.id}/analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...decision, identityName }),
    });
    if (!response.ok) setFeedback("La decisión quedó guardada en este dispositivo, pero no pudo sincronizarse.");
  }, [persistedImportAnalysis, script.id]);

  const removePersistedCharacterDecision = useCallback(async (fingerprint: string) => {
    if (!persistedImportAnalysis) return;
    const response = await fetch(`/api/writer/scripts/${script.id}/analysis`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fingerprint }),
    });
    if (!response.ok) setFeedback("La decisión se restauró aquí, pero no pudo sincronizarse.");
  }, [persistedImportAnalysis, script.id]);

  useEffect(() => {
    if (!editor || !ready || focusMode) {
      if (editor && !editor.isDestroyed) setWriterObservationMarkers(editor, new Map(), () => undefined);
      return;
    }
    const timer = window.setTimeout(() => {
      if (composingRef.current || editor.isDestroyed) return;
      const result = analyzeWriterCharacterObservations(
        document,
        knownCharacterIdentities,
        characterAnalysisCacheRef.current,
      );
      characterAnalysisCacheRef.current = result.cache;
      setCharacterObservations(result.observations);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [analysisEpoch, document, editor, focusMode, knownCharacterIdentities, ready]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || focusMode) return;
    const counts = new Map<string, number>();
    for (const observation of pendingCharacterObservations) {
      counts.set(observation.blockId, (counts.get(observation.blockId) ?? 0) + 1);
    }
    setWriterObservationMarkers(editor, counts, (blockId) => {
      observationsExplicitRef.current = true;
      setSelectedObservationBlockId(blockId);
      setObservationsOpen(true);
    });
    return () => {
      if (!editor.isDestroyed) setWriterObservationMarkers(editor, new Map(), () => undefined);
    };
  }, [editor, focusMode, pendingCharacterObservations]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || focusMode || !assistant.enabled) {
      if (editor && !editor.isDestroyed) setWriterAssistantMarkers(editor, [], () => undefined);
      return;
    }
    setWriterAssistantMarkers(editor, assistant.markers, (item) => {
      observationsExplicitRef.current = true;
      setActiveScene(item.sceneId);
      setSelectedAssistantObservationId(item.observationId);
      setObservationsSection("assistant");
      setObservationsOpen(true);
      const target = findWriterBlockById(editor, item.blockId);
      if (target) {
        editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(target.position + 1))).scrollIntoView());
        setWriterSceneHighlight(editor, item.blockId);
      }
    });
    return () => {
      if (!editor.isDestroyed) setWriterAssistantMarkers(editor, [], () => undefined);
    };
  }, [assistant.enabled, assistant.markers, editor, focusMode]);

  const clearSceneHighlight = useCallback(() => {
    if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = null;
    if (editor && !editor.isDestroyed) setWriterSceneHighlight(editor, null);
  }, [editor]);
  const recordCurrentNavigation = useCallback(() => {
    if (!editor) return;
    const block = currentWriterBlock(editor);
    if (!block) return;
    const sceneId = findSceneForPosition(editor.getJSON() as unknown as WriterDocument, block.id);
    if (!sceneId) return;
    const entry: WriterNavigationEntry = {
      sceneId,
      blockId: block.id,
      fromOffset: Math.max(0, editor.state.selection.from - block.position - 1),
      toOffset: Math.max(0, editor.state.selection.to - block.position - 1),
    };
    const previous = navigationHistoryRef.current.at(-1);
    if (previous && previous.blockId === entry.blockId
      && previous.fromOffset === entry.fromOffset && previous.toOffset === entry.toOffset) return;
    navigationHistoryRef.current = [...navigationHistoryRef.current.slice(-19), entry];
    setNavigationDepth(navigationHistoryRef.current.length);
  }, [editor]);
  const showStructuralUndo = useCallback((message: string) => {
    if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
    const token = Date.now();
    setStructuralToast({ message, token });
    toastTimeoutRef.current = window.setTimeout(() => setStructuralToast((current) => current?.token === token ? null : current), 5_500);
  }, []);
  const openFormatObservation = useCallback((observation: WriterFormatObservation) => {
    if (!editor) return;
    const target = findWriterBlockById(editor, observation.blockId);
    if (!target || writerObservationTextHash(target.text) !== observation.blockHash) {
      setFeedback("Este fragmento cambió y la observación de importación quedó desactualizada.");
      return;
    }
    observationsExplicitRef.current = true;
    setActiveFormatObservationId(observation.id);
    setSelectedObservationBlockId(observation.blockId);
    setObservationsOpen(true);
    recordCurrentNavigation();
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, target.position + 1)).scrollIntoView());
    editor.view.focus();
    setActiveScene(findSceneForPosition(editor.getJSON() as unknown as WriterDocument, observation.blockId));
    clearSceneHighlight();
    setWriterSceneHighlight(editor, observation.blockId);
    highlightTimeoutRef.current = window.setTimeout(clearSceneHighlight, 1_800);
  }, [clearSceneHighlight, editor, recordCurrentNavigation]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || !ready || focusMode || !showImportReviewHighlights) {
      if (editor && !editor.isDestroyed) setWriterImportReviewDecorations(editor, [], () => undefined);
      return;
    }
    setWriterImportReviewDecorations(editor, importReviewDecorationItemsRef.current, (id) => {
      const observation = formatObservationsRef.current.find((candidate) => candidate.id === id);
      if (!observation || reviewedFormatIdsRef.current.has(id)) return;
      openFormatObservation(observation);
    });
    return () => {
      if (!editor.isDestroyed) setWriterImportReviewDecorations(editor, [], () => undefined);
    };
  }, [editor, focusMode, importReviewDecorationSignature, openFormatObservation, ready, showImportReviewHighlights]);
  const revealWriterBlock = useCallback((position: number) => {
    if (!editor || editor.isDestroyed) return;
    if (navigationFrameRef.current !== null) cancelAnimationFrame(navigationFrameRef.current);
    navigationFrameRef.current = requestAnimationFrame(() => {
      navigationFrameRef.current = null;
      const paper = paperRef.current;
      const dom = editor.view.nodeDOM(position);
      const element = dom instanceof HTMLElement ? dom : dom?.parentElement;
      if (!paper || !element || !paper.contains(element)) return;
      const paperRect = paper.getBoundingClientRect();
      const targetRect = element.getBoundingClientRect();
      const margin = Math.min(56, Math.max(20, paper.clientHeight * .12));
      const usefulHeight = Math.max(1, paper.clientHeight - margin * 2);
      const targetTop = paper.scrollTop + targetRect.top - paperRect.top;
      const nextTop = targetRect.height > usefulHeight
        ? targetTop - margin
        : targetTop - Math.max(0, (paper.clientHeight - targetRect.height) / 2);
      paper.scrollTo({
        top: Math.max(0, nextTop),
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });
  }, [editor]);
  const navigateToScene = useCallback((id: string, requireSceneHeading = false, highlight = false, record = true) => {
    if (!editor) return false;
    const target = findWriterBlockById(editor, id);
    if (target && (!requireSceneHeading || target.kind === "sceneHeading")) {
      const current = currentWriterBlock(editor);
      const currentScene = current
        ? findSceneForPosition(editor.getJSON() as unknown as WriterDocument, current.id)
        : null;
      if (record && currentScene && currentScene !== id) recordCurrentNavigation();
      editor.view.dispatch(
        editor.state.tr
          .setSelection(TextSelection.create(editor.state.doc, target.position + 1)),
      );
      setActiveScene(id);
      activeSceneRef.current = id;
      setMobileSidebar(null);
      setTimelineExpanded(false);
      revealWriterBlock(target.position);
      if (highlight) {
        clearSceneHighlight();
        setWriterSceneHighlight(editor, id);
        highlightTimeoutRef.current = window.setTimeout(clearSceneHighlight, 1_800);
      }
      return true;
    }
    return false;
  }, [clearSceneHighlight, editor, recordCurrentNavigation, revealWriterBlock]);

  const navigateToWriterReference = useCallback((reference: {
    sceneId: string;
    blockId?: string | null;
    fromOffset?: number;
    toOffset?: number;
  }, options: { preservePanel?: boolean } = {}) => {
    if (!editor) return "missing" as const;
    const requested = reference.blockId ? findWriterBlockById(editor, reference.blockId) : null;
    const scene = findWriterBlockById(editor, reference.sceneId);
    const target = requested ?? scene;
    if (!target || !scene || scene.kind !== "sceneHeading") return "missing" as const;
    const resolvedScene = findSceneForPosition(documentRef.current, target.id);
    if (target.id !== reference.sceneId && resolvedScene !== reference.sceneId) return "missing" as const;
    recordCurrentNavigation();
    const start = target.position + 1 + Math.max(0, reference.fromOffset ?? 0);
    const maximum = target.position + 1 + target.text.length;
    const from = Math.min(start, maximum);
    editor.view.dispatch(editor.state.tr
      .setSelection(TextSelection.create(editor.state.doc, from)));
    setActiveScene(reference.sceneId);
    activeSceneRef.current = reference.sceneId;
    setMobileSidebar(null);
    if (!options.preservePanel) setTimelineExpanded(false);
    revealWriterBlock(target.position);
    clearSceneHighlight();
    setWriterSceneHighlight(editor, target.id);
    highlightTimeoutRef.current = window.setTimeout(clearSceneHighlight, 1_800);
    if (!options.preservePanel && window.matchMedia("(max-width: 900px)").matches) setObservationsOpen(false);
    return requested || !reference.blockId ? "exact" as const : "scene-fallback" as const;
  }, [clearSceneHighlight, editor, recordCurrentNavigation, revealWriterBlock]);

  const navigateBack = useCallback(() => {
    if (!editor) return;
    while (navigationHistoryRef.current.length) {
      const entry = navigationHistoryRef.current.pop()!;
      const target = findWriterBlockById(editor, entry.blockId);
      if (!target || findSceneForPosition(editor.getJSON() as unknown as WriterDocument, entry.blockId) !== entry.sceneId) continue;
      const node = editor.state.doc.nodeAt(target.position);
      if (!node) continue;
      const from = target.position + 1 + Math.min(entry.fromOffset, node.content.size);
      const to = target.position + 1 + Math.min(entry.toOffset, node.content.size);
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, Math.max(from, to))).scrollIntoView());
      editor.view.focus();
      setActiveScene(entry.sceneId);
      setNavigationDepth(navigationHistoryRef.current.length);
      return;
    }
    setNavigationDepth(0);
  }, [editor]);

  useEffect(() => clearSceneHighlight, [clearSceneHighlight, script.id]);
  useEffect(() => () => {
    if (navigationFrameRef.current !== null) cancelAnimationFrame(navigationFrameRef.current);
  }, []);
  useEffect(() => () => {
    if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
  }, []);

  useEffect(() => {
    timelineOpenRef.current = timelineOpen;
  }, [timelineOpen]);

  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    const sessionId = sessionIdRef.current;
    async function initialize() {
      let snapshot: WriterSnapshot = {
        title: script.title,
        document: script.document,
        schemaVersion: script.schemaVersion,
      };
      let baseRevision = script.revision;
      let initialSequence = 0;
      let initialPending = false;
      let hasConflict = false;
      try {
        const drafts = await loadLocalWriterDrafts(location.origin, userId, script.id);
        const local = drafts.find((candidate) => candidate.pending);
        if (local) {
          const validated = validateWriterDocument(local.document);
          if (validated.ok && local.schemaVersion === WRITER_SCHEMA_VERSION) {
            snapshot = { title: local.title, document: validated.document, schemaVersion: local.schemaVersion };
            baseRevision = local.baseRevision;
            initialSequence = local.sequence;
            initialPending = true;
            hasConflict = local.baseRevision !== script.revision;
            editor!.commands.setContent(snapshot.document, { emitUpdate: false });
            titleRef.current = snapshot.title;
            setTitle(snapshot.title);
            documentRef.current = snapshot.document;
            setDocument(snapshot.document);
          }
        }
      } catch {
        setSaveState({
          status: "error",
          revision: script.revision,
          localAvailable: false,
          message: "No se pudo leer el respaldo de este dispositivo.",
        });
      }
      if (cancelled) return;
      const controller = new WriterPersistenceController({
        origin: location.origin,
        userId,
        scriptId: script.id,
        sessionId,
        initialSnapshot: snapshot,
        initialRevision: baseRevision,
        initialSequence,
        initialPending,
        saveRemote,
        onState: (next) => {
          saveStateRef.current = next;
          setSaveState(next);
          if (next.status !== "cloud" || next.revision <= confirmedTimelineRevisionRef.current) return;
          confirmedTimelineRevisionRef.current = next.revision;
          if (timelineOpenRef.current) {
            timelineRequestedRevisionRef.current = next.revision;
            setTimelineRefreshToken((value) => value + 1);
          }
        },
      });
      controllerRef.current = controller;
      if (hasConflict) controller.setInitialConflict();
      else if (initialPending) void controller.flush();

      leaseRef.current = startWriterTabLease({
        userId,
        scriptId: script.id,
        sessionId,
        onBlocked: (blocked) => {
          if (blocked) controller.pauseForOtherTab();
          else controller.resumeFromOtherTab();
        },
      });
      setReady(true);
    }
    void initialize();

    const online = () => void controllerRef.current?.flush();
    const keyboard = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void controllerRef.current?.flush();
      } else if (key === "f" || (key === "h" && event.ctrlKey && !event.metaKey)) {
        event.preventDefault();
        setSearchReplaceMode(key === "h");
        setSearchOpen(true);
      }
    };
    window.addEventListener("online", online);
    window.addEventListener("keydown", keyboard);
    return () => {
      cancelled = true;
      window.removeEventListener("online", online);
      window.removeEventListener("keydown", keyboard);
      leaseRef.current?.release();
      void controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [editor, script, userId]);

  useEffect(() => {
    const syncFullscreen = () => {
      if (window.document.fullscreenElement === workspaceRef.current) {
        nativeFullscreenRef.current = true;
        setFocusMode(true);
        return;
      }
      if (nativeFullscreenRef.current) {
        nativeFullscreenRef.current = false;
        setFocusMode(false);
        setFocusScale(1);
        restoreTimelineAfterFocus();
      }
    };
    window.document.addEventListener("fullscreenchange", syncFullscreen);
    return () => window.document.removeEventListener("fullscreenchange", syncFullscreen);
  }, [restoreTimelineAfterFocus]);

  useEffect(() => {
    if (!focusMode) return;
    const paper = paperRef.current;
    if (!paper) return;
    const updateScale = () => {
      const exteriorMargin = window.innerWidth <= 600 ? 20 : 80;
      const available = Math.max(0, paper.clientWidth - exteriorMargin);
      const next = Math.max(1, Math.min(1.15, available / 960));
      setFocusScale(Math.round(next * 1_000) / 1_000);
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(paper);
    return () => observer.disconnect();
  }, [focusMode]);

  useEffect(() => {
    const closeSurfaceOrFocus = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (importOpen) return;
      if (shotlistModalOpen && !shotlistBusy) return setShotlistModalOpen(false);
      if (shortcutsOpen) return setShortcutsOpen(false);
      if (appearanceOpen) return setAppearanceOpen(false);
      if (searchOpen) return setSearchOpen(false);
      if (versionsOpen) return setVersionsOpen(false);
      if (autoFormatPlan) return closeAutoFormat();
      if (pasteAssist) return setPasteAssist(null);
      if (contextMenu) return setContextMenu(null);
      if (insertState) return setInsertState(null);
      if (mobileMoreOpen) return setMobileMoreOpen(false);
      if (mobileNavigateOpen) return setMobileNavigateOpen(false);
      if (exportMenu) return setExportMenu(false);
      if (pdfExportOpen) return setPdfExportOpen(false);
      if (feedback) return setFeedback(null);
      if (timelineExpanded) return setTimelineExpanded(false);
      if (observationsOpen) {
        setObservationsOpen(false);
        focusObservationsTrigger();
        return;
      }
      if (timelineOpen) {
        timelineOpenRef.current = false;
        setTimelineOpen(false);
        return;
      }
      if (focusMode && window.document.fullscreenElement !== workspaceRef.current) {
        setFocusMode(false);
        setFocusScale(1);
        restoreTimelineAfterFocus();
      }
    };
    window.addEventListener("keydown", closeSurfaceOrFocus);
    return () => window.removeEventListener("keydown", closeSurfaceOrFocus);
  }, [appearanceOpen, autoFormatPlan, contextMenu, exportMenu, feedback, focusMode, importOpen, insertState, mobileMoreOpen, mobileNavigateOpen, observationsOpen, pasteAssist, pdfExportOpen, restoreTimelineAfterFocus, searchOpen, shortcutsOpen, shotlistBusy, shotlistModalOpen, timelineExpanded, timelineOpen, versionsOpen]);

  useEffect(() => {
    if (!editor || !ready || deepLinkHandledRef.current) return;
    deepLinkHandledRef.current = true;
    const sceneId = new URLSearchParams(window.location.search).get("scene");
    if (!sceneId) return;
    const frame = requestAnimationFrame(() => {
      if (!navigateToScene(sceneId, true, true)) setFeedback("La escena enlazada ya no existe o dejó de ser un encabezado.");
    });
    return () => cancelAnimationFrame(frame);
  }, [editor, navigateToScene, ready]);

  useEffect(() => {
    if (!ready || importNoticeHandledRef.current) return;
    importNoticeHandledRef.current = true;
    const url = new URL(window.location.href);
    const importedMode = url.searchParams.get("imported");
    if (!importedMode) return;
    const sceneCount = deriveScenes(document).length;
    const characterCount = deriveCharacters(document).length;
    const optionalObservations = Number(url.searchParams.get("observations") ?? "0");
    const identityCount = Number(url.searchParams.get("identities") ?? "0");
    const analysisStatus = parseAssistedImportAnalysisStatus(url.searchParams.get("analysis"));
    const frame = requestAnimationFrame(() => {
      setFeedback(writerImportCompletionMessage({
        mode: importedMode,
        analysisStatus,
        identityCount: Number.isSafeInteger(identityCount) && identityCount >= 0 ? identityCount : 0,
        sceneCount,
        characterHeadingCount: characterCount,
        blockCount: document.content.length,
        observationCount: Number.isSafeInteger(optionalObservations) && optionalObservations >= 0 ? optionalObservations : 0,
        recoverySkippedReason: url.searchParams.get("recovery") === "budget"
          ? "recovery_budget_unavailable"
          : url.searchParams.get("recovery") === "calls"
            ? "recovery_call_limit_unavailable"
            : null,
      }));
    });
    url.searchParams.delete("imported");
    url.searchParams.delete("observations");
    url.searchParams.delete("analysis");
    url.searchParams.delete("identities");
    url.searchParams.delete("recovery");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    return () => cancelAnimationFrame(frame);
  }, [document, ready]);

  const updateTitle = useCallback((value: string) => {
    setTitle(value);
    titleRef.current = value;
    if (!editor || !value.trim()) return;
    const validated = validateWriterDocument(editor.getJSON());
    if (validated.ok) {
      controllerRef.current?.markChanged({
        title: value.trim(),
        document: validated.document,
        schemaVersion: WRITER_SCHEMA_VERSION,
      });
    }
  }, [editor]);

  function currentSnapshot(): WriterSnapshot {
    return controllerRef.current?.getSnapshot() ?? {
      title: titleRef.current,
      document,
      schemaVersion: WRITER_SCHEMA_VERSION,
    };
  }

  function downloadBackup(kind: "json" | "fdx") {
    const snapshot = currentSnapshot();
    const contents = kind === "json" ? createWriterBackup(snapshot) : createBasicFdx(snapshot);
    downloadText(
      contents,
      `${writerFileStem(snapshot.title)}.${kind}`,
      kind === "json" ? "application/json;charset=utf-8" : "application/xml;charset=utf-8",
    );
    setExportMenu(false);
    if (kind === "fdx") setFeedback("FDX básico generado. Las notas del autor no se incluyen; la interoperabilidad externa sigue pendiente.");
  }

  async function fetchRemoteScript() {
    const response = await fetch(`/api/writer/scripts/${script.id}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "No se pudo cargar la versión remota.");
    const validated = validateWriterDocument(data.script.document);
    if (!validated.ok || data.script.schema_version !== WRITER_SCHEMA_VERSION) {
      throw new Error("La versión remota no es compatible con este editor.");
    }
    return {
      snapshot: {
        title: data.script.title,
        document: validated.document,
        schemaVersion: data.script.schema_version,
      } satisfies WriterSnapshot,
      revision: Number(data.script.revision),
    };
  }

  async function useRemoteVersion() {
    if (!editor) return;
    setConflictBusy(true);
    try {
      const remote = await fetchRemoteScript();
      editor.commands.setContent(remote.snapshot.document, { emitUpdate: false });
      titleRef.current = remote.snapshot.title;
      setTitle(remote.snapshot.title);
      documentRef.current = remote.snapshot.document;
      setDocument(remote.snapshot.document);
      await controllerRef.current?.acceptRemote(remote.snapshot, remote.revision);
      setFeedback("Versión de la nube cargada.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo resolver el conflicto.");
    } finally {
      setConflictBusy(false);
    }
  }

  async function keepLocalVersion() {
    setConflictBusy(true);
    try {
      const remote = await fetchRemoteScript();
      controllerRef.current?.overwriteFromCurrent(remote.revision);
      setFeedback("Se conservará esta versión al sincronizar.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo resolver el conflicto.");
    } finally {
      setConflictBusy(false);
    }
  }

  async function saveConflictCopy() {
    setConflictBusy(true);
    const snapshot = currentSnapshot();
    const response = await fetch("/api/writer/scripts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...snapshot, operationId: crypto.randomUUID(), title: `${snapshot.title} — recuperado`.slice(0, 160) }),
    });
    const data = await response.json().catch(() => ({}));
    setConflictBusy(false);
    if (!response.ok) {
      setFeedback(data.error ?? "No se pudo crear la copia.");
      return;
    }
    router.push(`/writer/${data.script.id}`);
  }

  function openTimeline(sceneId: string | null = null, view: "timeline" | "pulse" | "ideas" | null = null) {
    setExportMenu(false);
    setContextMenu(null);
    setInsertState(null);
    setMobileSidebar(null);
    setMobileNavigateOpen(false);
    setMobileMoreOpen(false);
    setTimelineRequestedScene(sceneId);
    setTimelineRequestedView(view);
    setTimelineRequestedViewToken((value) => value + 1);
    setTimelineMounted(true);
    timelineRequestedRevisionRef.current = confirmedTimelineRevisionRef.current;
    if (view !== "ideas") setTimelineRefreshToken((value) => value + 1);
    timelineOpenRef.current = true;
    setTimelineOpen(true);
    if (focusMode) {
      timelineBeforeFocusRef.current = true;
      void exitFocus();
    }
  }

  async function analyzeSceneFromMenu(sceneId: string) {
    setContextMenu(null);
    setActiveScene(sceneId);
    setObservationsSection("assistant");
    setObservationsOpen(true);
    try {
      await ensureCurrentDocumentSaved();
      await assistant.analyzeScene(sceneId);
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "No pudimos analizar esta escena ahora.");
    }
  }

  function openAssistantForScene(sceneId: string) {
    setContextMenu(null);
    setActiveScene(sceneId);
    setObservationsSection("assistant");
    setObservationsOpen(true);
  }

  function openSelectionAnalysis(target: WriterSelectionTarget) {
    setContextMenu(null);
    const text = target.document.textBetween(target.from, target.to, "\n").trim();
    if (!text) return setFeedback("Selecciona un fragmento con texto para analizarlo.");
    if (text.length > 6_000) return setFeedback("La selección supera 6,000 caracteres. Reduce el fragmento; no lo truncaremos en silencio.");
    if (!guidedWriting.documentHash) return setFeedback("Espera a que Writer termine de preparar la revisión actual.");
    const blockIds: string[] = [];
    const sceneIds: string[] = [];
    let currentSceneId: string | null = null;
    target.document.forEach((node, position) => {
      if (node.type.name !== "screenplayBlock") return;
      const id = String(node.attrs.id ?? "");
      if (node.attrs.kind === "sceneHeading") currentSceneId = id;
      const overlaps = position + node.nodeSize > target.from && position < target.to;
      if (!overlaps || !id) return;
      blockIds.push(id);
      if (currentSceneId && !sceneIds.includes(currentSceneId)) sceneIds.push(currentSceneId);
    });
    if (!blockIds.length || !sceneIds.length) return setFeedback("La selección debe pertenecer a una escena del guion.");
    setGuidedSelection({
      blockIds,
      sceneIds,
      text,
      from: target.from,
      to: target.to,
      sourceRevision: saveStateRef.current.revision,
      documentHash: guidedWriting.documentHash,
    });
  }

  async function analyzeSetupPayoff() {
    setContextMenu(null);
    setObservationsSection("setupPayoff");
    setObservationsOpen(true);
    try {
      await ensureCurrentDocumentSaved();
      await setupPayoff.analyze();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "No pudimos analizar Setup / Payoff ahora.");
    }
  }

  async function sendGuidedWriting(question: string) {
    try {
      await ensureCurrentDocumentSaved();
      return await guidedWriting.send(question, null, guidedIdeaContext);
    } catch (cause) {
      guidedWriting.setFeedback(cause instanceof Error ? cause.message : "No pudimos responder ahora.");
      return false;
    }
  }

  function openImportFlow() {
    setExportMenu(false);
    setMobileMoreOpen(false);
    setContextMenu(null);
    setInsertState(null);
    closeTimeline();
    setObservationsOpen(false);
    setImportOpen(true);
  }

  function dismissMobileNotice() {
    try {
      window.localStorage.setItem(`filmatta.writer.mobile-notice.v1:${userId}`, "dismissed");
    } catch {
      // The notice remains dismissible for this render when storage is unavailable.
    }
    setMobileNoticeOpen(false);
  }

  function closeTimeline() {
    timelineOpenRef.current = false;
    setTimelineExpanded(false);
    setTimelineOpen(false);
  }

  function focusObservationsTrigger() {
    const mobile = window.matchMedia("(max-width: 900px)").matches;
    (mobile ? mobileObservationsButtonRef.current : observationsButtonRef.current)?.focus();
  }

  async function ensureCurrentDocumentSaved() {
    const controller = controllerRef.current;
    if (!controller) throw new Error("El editor todavía no está preparado.");
    await controller.flush();
    const deadline = Date.now() + 16_000;
    while (["local", "saving"].includes(saveStateRef.current.status) && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      if (saveStateRef.current.status === "local") await controller.flush();
    }
    if (saveStateRef.current.status !== "cloud") {
      throw new Error("No pudimos guardar los últimos cambios.");
    }
  }

  function openShotlistFlow() {
    if (shotlistBusy) return;
    if (shotlists.length === 1) {
      router.push(`/shotlists/${shotlists[0].id}`);
      return;
    }
    if (shotlists.length > 1) {
      router.push("/shotlists");
      return;
    }
    setShotlistModalOpen(true);
  }

  async function createShotlist(mode: "manual" | "suggested") {
    if (shotlistBusy) return;
    setShotlistBusy(true);
    setFeedback(null);
    try {
      await ensureCurrentDocumentSaved();
      const createResponse = await fetch(`/api/writer/scripts/${script.id}/shotlists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId: crypto.randomUUID(), title: `${title.trim() || "Guion sin título"} — Shotlist` }),
      });
      const created = await createResponse.json();
      if (!createResponse.ok || typeof created.id !== "string") throw new Error(created.error ?? "No pudimos crear la Shotlist.");
      setShotlistModalOpen(false);
      setShotlists([{ id: created.id, title: `${title.trim() || "Guion sin título"} — Shotlist` }]);
      router.push(`/shotlists/${created.id}${mode === "suggested" ? "?mode=suggested" : ""}`);
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "No pudimos abrir la Shotlist.");
      setShotlistBusy(false);
    }
  }

  function setCharacterDecision(decision: WriterCharacterDecision) {
    updateCharacterDecisions((current) => ({
      ...current,
      decisions: [...current.decisions.filter((item) => item.fingerprint !== decision.fingerprint), decision],
    }));
    void persistCharacterDecision(decision);
  }

  function confirmCharacterObservation(observation: WriterCharacterObservation, value: string) {
    const candidate = value.trim().replace(/\s+/gu, " ").slice(0, 64);
    const name = parseWriterCharacterCue(candidate).name;
    if (!name || isClearlyNonCharacterLine(candidate)) return;
    const key = writerCharacterIdentityKey(name);
    const existing = characterDecisionsRef.current.identities.find(
      (identity) => writerCharacterIdentityKey(identity.name) === key,
    );
    const identityId = existing?.id ?? crypto.randomUUID();
    updateCharacterDecisions((current) => ({
      ...current,
      identities: existing ? current.identities : [...current.identities, {
        id: identityId,
        name,
        source: "confirmedAction",
        createdAt: Date.now(),
      }],
      decisions: [
        ...current.decisions.filter((item) => item.fingerprint !== observation.fingerprint),
        {
          fingerprint: observation.fingerprint,
          blockId: observation.blockId,
          state: "confirmed",
          identityId,
          decidedAt: Date.now(),
        },
      ],
    }));
    void persistCharacterDecision({
      fingerprint: observation.fingerprint,
      blockId: observation.blockId,
      state: "confirmed",
      identityId,
      identityKey: key,
      decidedAt: Date.now(),
    }, name);
  }

  function addManualCharacter(value: string) {
    const candidate = value.trim().replace(/\s+/gu, " ").slice(0, 64);
    const name = parseWriterCharacterCue(candidate).name;
    const key = writerCharacterIdentityKey(name);
    if (!key || isClearlyNonCharacterLine(candidate)
      || knownCharacterIdentities.some((identity) => identity.key === key)) return;
    updateCharacterDecisions((current) => ({
      ...current,
      identities: [...current.identities, {
        id: crypto.randomUUID(),
        name,
        source: "manual",
        createdAt: Date.now(),
      }],
    }));
  }

  function viewNarrativeObservation(observation: WriterNarrativeObservation) {
    if (!activeScene) return;
    const blockId = observation.evidence[0]?.blockId ?? activeScene;
    if (navigateToWriterReference({ sceneId: activeScene, blockId }) === "missing") {
      setFeedback("La evidencia ya no existe en la escena actual.");
      return;
    }
    setSelectedAssistantObservationId(observation.id);
  }

  function viewSetupPayoffElement(element: WriterNarrativeElement) {
    const navigation = navigateToWriterReference({ sceneId: element.sceneId, blockId: element.blockId });
    if (navigation === "missing") {
      setFeedback("La escena vinculada ya no existe. La relación se conserva para revisión.");
    } else if (navigation === "scene-fallback") {
      setFeedback("El fragmento cambió; mostrando la escena.");
    }
  }

  function viewGuidedReference(reference: WriterGuidedReference) {
    if (!editor) return;
    if (reference.type === "pulse") {
      openTimeline(reference.sceneId, "pulse");
      return;
    }
    if (reference.type === "setup" || reference.type === "payoff") {
      const element = setupPayoff.elements.find((item) => item.id === reference.targetId);
      if (!element) {
        setFeedback("La relación narrativa ya no está disponible.");
        return;
      }
      setObservationsSection("setupPayoff");
      viewSetupPayoffElement(element);
      return;
    }
    if (reference.type === "scene") {
      if (navigateToWriterReference({ sceneId: reference.sceneId }) === "missing") setFeedback("La escena referenciada ya no existe.");
    } else {
      const navigation = navigateToWriterReference({ sceneId: reference.sceneId, blockId: reference.blockId });
      if (navigation === "missing") {
        setFeedback("La evidencia referenciada ya no existe.");
        return;
      }
      if (navigation === "scene-fallback") setFeedback("El fragmento cambió; mostrando la escena.");
      setObservationsSection("assistant");
      if (reference.type === "observation") setSelectedAssistantObservationId(reference.targetId);
    }
  }

  function viewCharacterObservation(observation: WriterCharacterObservation) {
    if (!editor) return;
    setSelectedObservationBlockId(observation.blockId);
    const target = findWriterBlockById(editor, observation.blockId);
    if (!target || writerObservationTextHash(target.text) !== observation.blockHash) {
      setFeedback("Este fragmento cambió desde la revisión.");
      setAnalysisEpoch((value) => value + 1);
      if (observation.sceneId) navigateToWriterReference({ sceneId: observation.sceneId });
      if (window.matchMedia("(max-width: 900px)").matches) setObservationsOpen(false);
      return;
    }
    const sceneId = observation.sceneId
      ?? findSceneForPosition(editor.getJSON() as unknown as WriterDocument, observation.blockId);
    if (!sceneId || navigateToWriterReference({
      sceneId,
      blockId: observation.blockId,
      fromOffset: observation.start,
      toOffset: observation.end,
    }) === "missing") setFeedback("Este fragmento cambió desde la revisión.");
    if (window.matchMedia("(max-width: 900px)").matches) setObservationsOpen(false);
  }

  function viewFormatObservation(observation: WriterFormatObservation) {
    openFormatObservation(observation);
  }

  function reviewFormatObservation(observation: WriterFormatObservation) {
    setReviewedFormatIds((current) => {
      if (current.has(observation.id)) return current;
      const next = new Set(current).add(observation.id);
      try {
        saveWriterImportReviewState(location.origin, userId, script.id, {
          version: 1,
          reviewedFormatIds: [...next],
        });
        setFormatReviewStoragePersistent(true);
      } catch {
        setFormatReviewStoragePersistent(false);
      }
      return next;
    });
  }

  function changeFormatObservation(observation: WriterFormatObservation, kind: ScreenplayKind) {
    if (!editor) return;
    const target = findWriterBlockById(editor, observation.blockId);
    if (!target || writerObservationTextHash(target.text) !== observation.blockHash) {
      setFeedback("Este fragmento cambió y la observación de importación quedó desactualizada.");
      return;
    }
    if (!changeWriterBlockKind(editor, observation.blockId, kind)) {
      setFeedback("No se pudo cambiar el formato de este fragmento.");
      return;
    }
    setFeedback(`Formato actualizado a ${WRITER_KIND_LABELS[kind]}. Puedes deshacer el cambio desde Writer.`);
  }

  function handleMoveScene(sceneId: string, targetSceneId: string, position: WriterSceneMovePosition) {
    if (!editor) return;
    const result = moveWriterScene(editor, sceneId, targetSceneId, position);
    setDraggedSceneId(null);
    setSceneDropTarget(null);
    setSceneActionsOpen(null);
    if (result === "applied") {
      setActiveScene(sceneId);
      setTimelineRequestedScene(sceneId);
      showStructuralUndo("Escena movida");
    } else if (result !== "unchanged") {
      setFeedback("No se pudo mover la escena porque el orden del documento cambió.");
    }
  }

  function moveSceneByOffset(sceneId: string, offset: -1 | 1) {
    if (!editor) return;
    const ids = writerSceneIds(editor.state.doc);
    const index = ids.indexOf(sceneId);
    const target = ids[index + offset];
    if (!target) return;
    handleMoveScene(sceneId, target, offset < 0 ? "before" : "after");
  }

  function handleDuplicateScene(sceneId: string) {
    if (!editor) return;
    const nickname = structuralMetadataRef.current.sceneNicknames[sceneId];
    const copiedNickname = nickname ? `${nickname} (copia)`.slice(0, 80) : "";
    const result = duplicateWriterScene(editor, sceneId, copiedNickname);
    setSceneActionsOpen(null);
    if (result.status !== "applied" || !result.sceneId) {
      setFeedback("No se pudo duplicar la escena.");
      return;
    }
    setActiveScene(result.sceneId);
    setTimelineRequestedScene(result.sceneId);
    showStructuralUndo("Escena duplicada");
  }

  function beginSceneNicknameEdit(sceneId: string) {
    setSceneActionsOpen(null);
    setEditingSceneNickname(sceneId);
    setSceneNicknameDraft(structuralMetadataRef.current.sceneNicknames[sceneId] ?? "");
  }

  function commitSceneNickname(sceneId: string) {
    if (!editor) return;
    const nickname = normalizeWriterSceneNickname(sceneNicknameDraft);
    const result = renameWriterSceneNickname(editor, sceneId, nickname);
    setEditingSceneNickname(null);
    if (result === "missing") setFeedback("La escena ya no existe.");
  }

  function beginCharacterRename(identityId: string, name: string) {
    setEditingCharacterId(identityId);
    setCharacterNameDraft(name);
  }

  function commitCharacterRename(identityId: string) {
    if (!editor) return;
    const character = characterRows.find((candidate) => candidate.identityId === identityId);
    if (!character) return setEditingCharacterId(null);
    const name = normalizeWriterStructuralName(characterNameDraft);
    if (!name || !/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}\s.'’\-]*$/u.test(name)) {
      setFeedback("Usa un nombre de personaje válido.");
      return;
    }
    const nextKey = writerCharacterIdentityKey(name);
    const collision = characterRows.find((candidate) => candidate.identityId !== identityId && candidate.key === nextKey);
    if (collision) {
      setFeedback(`Ya existe un personaje llamado ${collision.name}.`);
      return;
    }
    if (nextKey === character.key && name === character.name) return setEditingCharacterId(null);
    const renameObservations = [
      ...combinedCharacterObservations,
      ...analyzeWriterCharacterObservations(document, knownCharacterIdentities, new Map()).observations,
    ];
    const references: WriterCharacterReference[] = renameObservations
      .filter((observation) => observation.identityKey === character.key
        && (observation.evidence === "actionReference" || observation.evidence === "intervention")
        && observation.presence !== "absent")
      .map((observation) => ({
        blockId: observation.blockId,
        start: observation.start,
        end: observation.end,
        text: observation.identity,
      }))
      .filter((reference, index, all) => all.findIndex((candidate) => candidate.blockId === reference.blockId
        && candidate.start === reference.start && candidate.end === reference.end) === index);
    const explicitBlockIds = document.content
      .filter((block) => block.attrs.kind === "character" && writerCharacterIdentityKey(blockText(block)) === character.key)
      .map((block) => block.attrs.id);
    const result = renameWriterCharacter(editor, {
      identityId,
      sourceKey: character.key,
      newName: name,
      references,
    });
    if (result !== "applied") {
      setFeedback("No se encontraron referencias seguras para renombrar.");
      return;
    }
    updateCharacterDecisions((current) => {
      const matching = current.identities.some((identity) => identity.id === identityId
        || writerCharacterIdentityKey(identity.name) === character.key);
      return {
        ...current,
        identities: matching
          ? current.identities.map((identity) => identity.id === identityId
            || writerCharacterIdentityKey(identity.name) === character.key ? { ...identity, name } : identity)
          : [...current.identities, { id: identityId, name, source: "confirmedAction", createdAt: Date.now() }],
        decisions: current.decisions.map((decision) => decision.identityKey === character.key
          ? { ...decision, identityKey: nextKey, identityId }
          : decision),
      };
    });
    updateStructuralMetadata((current) => ({
      ...current,
      characterAliases: {
        ...current.characterAliases,
        [character.key]: {
          identityId,
          name,
          previousName: character.name,
          blockIds: [...new Set([...explicitBlockIds, ...references.map((reference) => reference.blockId)])],
        },
      },
    }));
    setEditingCharacterId(null);
    showStructuralUndo("Personaje renombrado");
  }

  async function startAutoFormat(scope: "document" | "partial" | "paste", blockIds?: readonly string[]) {
    if (!editor) return;
    if (readiness.state === "EMPTY" && scope !== "paste") {
      setFeedback("Añade contenido antes de aplicar Formato Automático.");
      return;
    }
    try {
      const ids = scope === "partial" ? readiness.suspiciousBlockIds : blockIds;
      const sourceDocument = editor.getJSON() as unknown as WriterDocument;
      const plan = createWriterAutoFormatPlan(
        sourceDocument,
        { scope, ...(ids ? { blockIds: ids } : {}) },
      );
      const candidates = writerAutoFormatCandidates(sourceDocument, plan);
      const request = ++autoFormatRequestRef.current;
      setAutoFormatPlan(plan);
      setAutoFormatFallback(null);
      setAutoFormatResolving(candidates.length > 0);
      setPasteAssist(null);
      if (candidates.length === 0) return;
      try {
        await ensureCurrentDocumentSaved();
        const classifications = await classifyWriterAutoFormat(script.id, {
          scope,
          blockIds: plan.blockIds,
        });
        if (autoFormatRequestRef.current !== request) return;
        setAutoFormatPlan(mergeWriterAutoFormatClassifications(plan, classifications));
      } catch {
        if (autoFormatRequestRef.current !== request) return;
        setAutoFormatFallback("No pudimos resolver todas las ambigüedades con clasificación contextual. Puedes aplicar la detección local y revisar los elementos pendientes.");
      } finally {
        if (autoFormatRequestRef.current === request) setAutoFormatResolving(false);
      }
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "No se pudo detectar la estructura del texto.");
    }
  }

  function closeAutoFormat() {
    autoFormatRequestRef.current += 1;
    setAutoFormatResolving(false);
    setAutoFormatFallback(null);
    setAutoFormatPlan(null);
  }

  async function applyAutoFormatPlan(choices: Readonly<Record<string, ScreenplayKind>>, reviewAll: boolean) {
    if (!editor || !autoFormatPlan) return;
    try {
      await createWriterCheckpoint(script.id, {
        kind: "before_auto_format",
        label: writerCheckpointLabel("before_auto_format"),
        snapshot: currentSnapshot(),
        sourceRevision: Math.max(1, saveStateRef.current.revision),
      });
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "No pudimos crear la versión de seguridad.");
      return;
    }
    const plan = autoFormatPlan;
    const mutations = [
      ...plan.blockIds.map((blockId) => ({ blockId, kind: "action" as const })),
      ...resolveWriterAutoFormatChanges(plan, choices, reviewAll),
    ];
    const result = applyWriterAutoFormat(editor, mutations, { blockIds: plan.blockIds });
    closeAutoFormat();
    if (result === "applied") {
      refreshWriterDerivedStateAfterFormatting();
      const validated = validateWriterDocument(editor.getJSON() as unknown as WriterDocument);
      if (validated.ok) {
        const nextBaseline = resolveWriterFormatBaseline(
          formatBaselineRef.current,
          validated.document,
          plan.blockIds,
          Math.max(1, saveStateRef.current.revision),
        );
        persistFormatBaseline(nextBaseline);
      }
      setFeedback(`Formato aplicado. El texto se conservó y la estructura de Writer se actualizó.${plan.redundantBlankBlocks ? ` ${plan.redundantBlankBlocks} espacios redundantes normalizados.` : ""}`);
      showStructuralUndo("Formato Automático aplicado");
    } else {
      const nextBaseline = createWriterFormatBaseline(documentRef.current, Math.max(1, saveStateRef.current.revision));
      persistFormatBaseline(nextBaseline);
      setFeedback("Este documento ya parece estar correctamente formateado como guion.");
    }
  }

  function persistFormatBaseline(next: WriterFormatBaseline) {
    formatBaselineRef.current = next;
    setFormatBaseline(next);
    try { saveWriterFormatBaseline(window.location.origin, userId, script.id, next); } catch { /* local baseline is best-effort */ }
  }

  function navigateSearchResult(result: WriterSearchResult) {
    setTimelineExpanded(false);
    if (!result.sceneId) {
      setFeedback("La referencia no tiene una escena válida en el documento actual.");
      return;
    }
    const navigation = navigateToWriterReference({
      sceneId: result.sceneId,
      blockId: result.blockId,
      fromOffset: result.start,
      toOffset: result.end,
    });
    if (navigation === "missing") setFeedback("La referencia ya no está disponible en el documento actual.");
    else if (navigation === "scene-fallback") setFeedback("El fragmento cambió; mostrando la escena.");
    else setFeedback(null);
  }

  function replaceSearchResult(result: WriterSearchResult, replacement: string) {
    if (!editor) return false;
    return replaceWriterTextMatches(editor, [{
      blockId: result.blockId,
      start: result.start,
      end: result.end,
      expectedText: result.text,
      replacement,
    }]).status === "applied";
  }

  async function replaceAllSearchResults(results: WriterSearchResult[], replacement: string) {
    if (!editor || !results.length) return 0;
    try {
      await createWriterCheckpoint(script.id, {
        kind: "before_replace_all",
        label: writerCheckpointLabel("before_replace_all"),
        snapshot: currentSnapshot(),
        sourceRevision: Math.max(1, saveStateRef.current.revision),
      });
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "No pudimos crear la versión de seguridad.");
      return 0;
    }
    const result = replaceWriterTextMatches(editor, results.map((item) => ({
      blockId: item.blockId,
      start: item.start,
      end: item.end,
      expectedText: item.text,
      replacement,
    })));
    if (result.status === "applied" && result.replaced >= 8) {
      const nextBaseline = invalidateWriterFormatBaseline(formatBaselineRef.current, {
        kind: "structural",
        reason: "largeReplace",
        affectedBlockIds: [...new Set(results.map((item) => item.blockId))],
        replacementCount: result.replaced,
      });
      if (nextBaseline) persistFormatBaseline(nextBaseline);
    }
    return result.replaced;
  }

  async function restoreWriterCheckpoint(snapshot: WriterSnapshot) {
    if (!editor) return;
    await createWriterCheckpoint(script.id, {
      kind: "before_restore",
      label: writerCheckpointLabel("before_restore"),
      snapshot: currentSnapshot(),
      sourceRevision: Math.max(1, saveStateRef.current.revision),
    });
    editor.commands.setContent(snapshot.document, { emitUpdate: false });
    titleRef.current = snapshot.title;
    setTitle(snapshot.title);
    documentRef.current = snapshot.document;
    setDocument(snapshot.document);
    controllerRef.current?.markChanged(snapshot);
    const nextBaseline = createWriterFormatBaseline(snapshot.document, Math.max(1, saveStateRef.current.revision));
    persistFormatBaseline(nextBaseline);
  }

  function thinkTogetherFromIdea(idea: WriterIdea, scope: WriterSearchScope, sceneId: string | null, sourceRevision: number) {
    setGuidedIdeaContext({
      ideaId: idea.id,
      title: idea.title,
      direction: idea.direction,
      consequence: idea.consequence,
      category: idea.category,
      scope,
      sceneId: scope === "scene" ? sceneId : null,
      sourceRevision,
    });
    guidedWriting.setScope(scope);
    setObservationsSection("guided");
    setObservationsOpen(true);
  }

  function toggleTypewriterSound() {
    const next = !typewriterSoundEnabledRef.current;
    typewriterSoundEnabledRef.current = next;
    setTypewriterSoundEnabled(next);
    saveWriterTypewriterSoundPreference(userId, next);
    if (next) void primeWriterTypewriterSound();
  }

  function refreshWriterDerivedStateAfterFormatting() {
    if (!editor || editor.isDestroyed) return;
    const validated = validateWriterDocument(editor.getJSON() as unknown as WriterDocument);
    if (!validated.ok) {
      setFeedback(validated.reason);
      return;
    }
    const canonical = canonicalWriterDocument(validated.document);
    if (JSON.stringify(canonical) !== JSON.stringify(documentRef.current)) {
      documentRef.current = canonical;
      controllerRef.current?.markChanged({
        title: titleRef.current,
        document: canonical,
        schemaVersion: WRITER_SCHEMA_VERSION,
      });
    }
    setDocument(canonical);
    setDismissedReadiness(new Set());
    setAnalysisEpoch((value) => value + 1);
  }

  function readinessNotice(feature: WriterStructuredFeature) {
    if (dismissedReadiness.has(feature)) return null;
    return <WriterReadinessNotice
      feature={feature}
      readiness={readiness}
      onFormat={(scope) => startAutoFormat(scope)}
      onDismiss={() => setDismissedReadiness((current) => new Set(current).add(feature))}
    />;
  }

  async function enterFocus() {
    timelineBeforeFocusRef.current = timelineOpenRef.current;
    observationsBeforeFocusRef.current = observationsOpen;
    timelineOpenRef.current = false;
    setTimelineExpanded(false);
    setTimelineOpen(false);
    setObservationsOpen(false);
    setSelectedObservationBlockId(null);
    setMobileSidebar(null);
    setMobileNavigateOpen(false);
    setMobileMoreOpen(false);
    setExportMenu(false);
    setContextMenu(null);
    setInsertState(null);
    setFocusMode(true);
    const workspace = workspaceRef.current;
    if (!workspace?.requestFullscreen) return;
    try {
      await workspace.requestFullscreen();
    } catch {
      nativeFullscreenRef.current = false;
    }
  }

  async function exitFocus() {
    setFocusMode(false);
    setFocusScale(1);
    if (window.document.fullscreenElement === workspaceRef.current) {
      try {
        await window.document.exitFullscreen();
        return;
      } catch {
        nativeFullscreenRef.current = false;
      }
    }
    restoreTimelineAfterFocus();
  }

  function captureApplicationMenuContext() {
    const activeElement = window.document.activeElement;
    if (editor && activeElement instanceof Node && editor.view.dom.contains(activeElement)) {
      const selection = captureWriterSelectionTarget(editor.state);
      activeWriterSelectionRef.current = selection;
      setApplicationMenuSelection(selection);
    } else if (!(activeElement instanceof Element && activeElement.closest(".writer-app-menu"))) {
      activeWriterSelectionRef.current = null;
      setApplicationMenuSelection(null);
    }
  }

  function restoreApplicationMenuSelection() {
    const snapshot = applicationMenuSelection ?? activeWriterSelectionRef.current;
    if (!editor || !snapshot || !writerSelectionTargetIsCurrent(editor.state, snapshot)) return null;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, snapshot.from, snapshot.to)));
    return snapshot;
  }

  async function createNewScriptFromMenu() {
    if (creatingScript) return;
    setCreatingScript(true);
    try {
      await ensureCurrentDocumentSaved();
      const response = await fetch("/api/writer/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId: crypto.randomUUID(), title: "Guion sin título" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload?.script?.id !== "string") throw new Error(payload.error ?? "No se pudo crear el guion.");
      router.push(`/writer/${payload.script.id}`);
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "No se pudo crear el guion.");
      setCreatingScript(false);
    }
  }

  async function navigateWriterHistory(direction: -1 | 1) {
    const step = stepWriterInternalHistory(internalHistory, direction);
    if (!step) return;
    try {
      await ensureCurrentDocumentSaved();
      window.sessionStorage.setItem(internalHistoryKey, JSON.stringify(step.history));
      setInternalHistory(step.history);
      router.push(step.route);
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "No pudimos guardar antes de navegar.");
    }
  }

  async function applyImportedToCurrent(imported: WriterDocument, options: { organize: boolean; format: "pasted" | "txt" | "fdx" | "docx" }) {
    if (!editor) throw new Error("El editor todavía no está preparado.");
    const remainsEmpty = (editor.getJSON() as unknown as WriterDocument).content.every((block) => !blockText(block).trim());
    const result = applyWriterImportedDocument(editor, imported, remainsEmpty ? "replace-empty" : "append");
    if (!result.applied) throw new Error("No se pudo aplicar la importación de forma segura. Revisa que no existan IDs duplicados.");
    setFeedback(`${options.format.toUpperCase()} importado en este guion${options.organize ? "; revisa la propuesta de organización" : ""}.`);
    if (options.organize) window.requestAnimationFrame(() => void startAutoFormat("paste", result.blockIds));
  }

  function insertFromApplicationMenu(kind: ScreenplayKind) {
    const snapshot = restoreApplicationMenuSelection();
    if (!editor || !snapshot || !insertWriterEmptyBlock(editor, snapshot.targetId, kind)) setFeedback("Vuelve a colocar el cursor en el guion para insertar un bloque.");
  }

  function changeKindFromApplicationMenu(kind: ScreenplayKind) {
    const snapshot = restoreApplicationMenuSelection();
    if (!editor || !snapshot || !changeWriterBlockKind(editor, snapshot.targetId, kind)) setFeedback("La selección cambió. Elige de nuevo el bloque que quieres convertir.");
  }

  function toggleInlineFormatFromApplicationMenu(format: "bold" | "italic" | "underline") {
    if (!restoreApplicationMenuSelection() || !editor) return setFeedback("Selecciona texto del guion para aplicar formato.");
    const chain = editor.chain().focus();
    if (format === "bold") chain.toggleBold().run();
    if (format === "italic") chain.toggleItalic().run();
    if (format === "underline") chain.toggleUnderline().run();
  }

  return (
    <div
      ref={workspaceRef}
      className={`writer-workspace${focusMode ? " writer-workspace--focus" : ""}${timelineOpen ? " writer-workspace--timeline" : ""}${timelineExpanded ? " writer-workspace--timeline-expanded" : ""}${observationsOpen && !focusMode ? " writer-workspace--observations" : ""}${!workspaceLayout.leftSidebarVisible && !focusMode ? " writer-workspace--left-hidden" : ""}${charactersCollapsed ? " writer-workspace--characters-collapsed" : ""}`}
      data-writer-skin={appearance.skin}
      data-writer-warm-filter={appearance.warmFilter ? "true" : "false"}
      data-focus-scale={focusScale.toFixed(3)}
      data-structural-metadata-persistent={structuralMetadataPersistent ? "true" : "false"}
      style={{
        "--writer-focus-scale": focusScale,
        "--writer-left-panel-width": `${panelLayout.left}px`,
        "--writer-right-panel-width": `${panelLayout.right}px`,
        "--writer-timeline-panel-height": `${workspaceLayout.timelineHeight}px`,
        "--writer-character-panel-height": `${workspaceLayout.charactersHeight}px`,
        "--writer-warm-intensity": appearance.warmIntensity / 100,
      } as CSSProperties}
    >
      {!focusMode && <WriterApplicationMenu
        canBack={internalHistory.index > 0}
        canForward={internalHistory.index >= 0 && internalHistory.index < internalHistory.entries.length - 1}
        hasEditorContext={Boolean(editor && applicationMenuSelection)}
        canUndo={applicationMenuEditorState?.canUndo ?? false}
        canRedo={applicationMenuEditorState?.canRedo ?? false}
        leftPanelVisible={workspaceLayout.leftSidebarVisible}
        assistantVisible={observationsOpen}
        focusMode={focusMode}
        timelineVisible={timelineOpen}
        appearance={appearance.skin}
        warmFilter={appearance.warmFilter}
        typewriterSound={typewriterSoundEnabled}
        onCaptureContext={captureApplicationMenuContext}
        onBack={() => void navigateWriterHistory(-1)}
        onForward={() => void navigateWriterHistory(1)}
        onNew={() => void createNewScriptFromMenu()}
        onImport={openImportFlow}
        onScripts={() => void (async () => { try { await ensureCurrentDocumentSaved(); router.push("/writer"); } catch (cause) { setFeedback(cause instanceof Error ? cause.message : "No pudimos guardar antes de navegar."); } })()}
        onVersions={() => setVersionsOpen(true)}
        onExport={(format) => format === "pdf" ? setPdfExportOpen(true) : downloadBackup(format)}
        onUndo={() => { restoreApplicationMenuSelection(); editor?.chain().focus().undo().run(); }}
        onRedo={() => { restoreApplicationMenuSelection(); editor?.chain().focus().redo().run(); }}
        onSearch={(replace) => { setSearchReplaceMode(replace); setSearchOpen(true); }}
        onInlineFormat={toggleInlineFormatFromApplicationMenu}
        onInsert={insertFromApplicationMenu}
        onChangeKind={changeKindFromApplicationMenu}
        onAutoFormat={() => void startAutoFormat(readiness.state === "PARTIALLY_FORMATTED" ? "partial" : "document")}
        onLeftPanel={() => setLeftSidebarVisible(!workspaceLayout.leftSidebarVisible)}
        onAssistant={() => setRightSidebarVisible(!observationsOpen)}
        onFocus={() => void (focusMode ? exitFocus() : enterFocus())}
        onTimeline={(view) => openTimeline(null, view)}
        onAppearance={(skin) => commitAppearance({ skin })}
        onWarmFilter={() => commitAppearance({ warmFilter: !appearanceRef.current.warmFilter })}
        onTypewriterSound={toggleTypewriterSound}
        onShortcuts={() => setShortcutsOpen(true)}
      />}
      <header className="writer-header">
        <div className="writer-header-brand">
          <Link href="/" aria-label="FILMATTA — Inicio">FILMATTA</Link>
          <span aria-hidden="true" />
          <Link href="/writer">Writer</Link>
        </div>
        <nav className="writer-mobile-app-bar" aria-label="Navegación de Writer">
          <Link className="writer-mobile-back" href="/writer" aria-label="Volver a Mis guiones">←</Link>
          <Link className="writer-mobile-brand" href="/writer" aria-label="FILMATTA Writer">FILMATTA</Link>
          <span className="writer-mobile-title" title={title || "Guion sin título"}>{title || "Guion sin título"}</span>
          <MobileSaveStatus state={saveState} />
          <button className="writer-mobile-more" type="button" aria-label="Más acciones de Writer" aria-expanded={mobileMoreOpen} onClick={() => { setMobileNavigateOpen(false); setMobileMoreOpen((open) => !open); }}>⋯</button>
        </nav>
        <input
          className="writer-title-input"
          value={title}
          onChange={(event) => updateTitle(event.target.value)}
          onBlur={() => {
            if (!title.trim()) updateTitle("Guion sin título");
          }}
          maxLength={160}
          title={title || "Guion sin título"}
          aria-label="Título del guion"
          disabled={!ready || saveState.status === "tabBlocked"}
        />
        <div className="writer-header-actions">
          <div className="writer-panel-toggles" role="group" aria-label="Paneles de Writer">
            <button
              type="button"
              aria-label={workspaceLayout.leftSidebarVisible ? "Ocultar panel izquierdo" : "Mostrar panel izquierdo"}
              aria-pressed={workspaceLayout.leftSidebarVisible}
              title={workspaceLayout.leftSidebarVisible ? "Ocultar escenas y personajes" : "Mostrar escenas y personajes"}
              onClick={() => setLeftSidebarVisible(!workspaceLayout.leftSidebarVisible)}
            ><WriterIcon name="panelLeft" /></button>
            <button
              type="button"
              aria-label={observationsOpen ? "Ocultar Asistente" : "Mostrar Asistente"}
              aria-pressed={observationsOpen}
            title={observationsOpen ? "Ocultar Asistente" : "Mostrar Asistente"}
              onClick={() => setRightSidebarVisible(!observationsOpen)}
            ><WriterIcon name="panelRight" /></button>
          </div>
          <SaveStatus state={saveState} />
          <div ref={appearanceRootRef} className="writer-appearance">
            <button ref={appearanceButtonRef} className="writer-appearance-button" type="button" aria-label="Apariencia de Writer" aria-expanded={appearanceOpen} onClick={() => setAppearanceOpen((open) => !open)}><WriterIcon name="eye" /></button>
            {appearanceOpen && <div className="writer-appearance-popover" role="dialog" aria-label="Apariencia de Writer">
              <strong>Apariencia</strong>
              <div className="writer-skin-options" role="radiogroup" aria-label="Skin de Writer">{(["carbon", "navy", "cream"] as WriterSkin[]).map((skin) => <button key={skin} type="button" role="radio" aria-checked={appearance.skin === skin} onClick={() => commitAppearance({ skin })}><span className={`writer-skin-swatch is-${skin}`} />{skin === "carbon" ? "Carbon" : skin === "navy" ? "Marino" : "Cream"}</button>)}</div>
              <label className="writer-warm-toggle"><input type="checkbox" checked={appearance.warmFilter} onChange={(event) => commitAppearance({ warmFilter: event.target.checked })} />Confort visual / filtro cálido</label>
              {appearance.warmFilter && <label className="writer-warm-intensity">Intensidad<input type="range" min="4" max="14" value={appearance.warmIntensity} onChange={(event) => commitAppearance({ warmIntensity: Number(event.target.value) })} /></label>}
              {appearanceStorageError && <small role="alert">No se pudo guardar la preferencia de apariencia en este navegador.</small>}
              <small>El filtro cálido altera temporalmente la percepción del color. No cambia el guion ni sus exports.</small>
              <button type="button" onClick={() => { setAppearanceOpen(false); setShortcutsOpen(true); }}>Atajos de teclado</button>
            </div>}
          </div>
          <button
            className="writer-import-open-button"
            type="button"
            onClick={openImportFlow}
            disabled={!ready}
          >Importar guion</button>
          <button
            ref={observationsButtonRef}
            className="writer-observations-open-button"
            type="button"
            onClick={() => { setSelectedObservationBlockId(null); setRightSidebarVisible(true); }}
            aria-expanded={observationsOpen}
          ><SmartFeatureIndicator label={`Asistente${pendingObservationCount ? ` (${pendingObservationCount})` : ""}`} /></button>
          <button
            className="writer-timeline-button"
            type="button"
            aria-expanded={timelineOpen}
            aria-controls="writer-timeline-panel"
            onClick={() => timelineOpen ? closeTimeline() : openTimeline()}
            disabled={!initialTimeline.ok}
          >Timeline</button>
          <button className="writer-versions-button" type="button" onClick={() => setVersionsOpen(true)}><WriterIcon name="history" /><span>Versiones</span></button>
          <div className="writer-export-wrap">
            <button
              ref={exportButtonRef}
              type="button"
              aria-haspopup="menu"
              aria-controls="writer-export-menu"
              onClick={() => {
                setContextMenu(null);
                setInsertState(null);
                setExportMenu((open) => !open);
              }}
              aria-expanded={exportMenu}
            >Exportar</button>
            {exportMenu && (
              <div id="writer-export-menu" className="writer-export-menu" role="group" aria-label="Formatos de exportación">
                <button type="button" onClick={() => {
                  setContextMenu(null);
                  setInsertState(null);
                  setExportMenu(false);
                  setPdfExportOpen(true);
                }}>PDF de guion</button>
                <button type="button" onClick={() => downloadBackup("json")}>Respaldo JSON</button>
                <button type="button" onClick={() => downloadBackup("fdx")}>FDX básico</button>
              </div>
            )}
          </div>
          <button className="writer-focus-button" type="button" onClick={() => focusMode ? void exitFocus() : void enterFocus()}>
            {focusMode ? "Salir de Focus" : "Focus"}
          </button>
        </div>
        <button className="writer-mobile-navigate" type="button" aria-expanded={mobileNavigateOpen} aria-controls="writer-mobile-navigation" onClick={() => { setMobileMoreOpen(false); setMobileNavigateOpen((open) => !open); }}>
          Navegar{pendingObservationCount ? ` · ${pendingObservationCount}` : ""}
        </button>
        {mobileNavigateOpen && (
          <div id="writer-mobile-navigation" className="writer-mobile-sheet writer-mobile-nav-sheet" role="dialog" aria-label="Navegar por el guion">
            <div className="writer-mobile-sheet-head"><strong>Navegar</strong><button type="button" onClick={() => setMobileNavigateOpen(false)}>Cerrar</button></div>
            <div className="writer-mobile-nav-tabs" role="group" aria-label="Secciones de Writer">
              <button type="button" onClick={() => { setMobileSidebar("scenes"); setMobileNavigateOpen(false); }}>Escenas</button>
              <button type="button" onClick={() => { setMobileSidebar("characters"); setMobileNavigateOpen(false); }}>Personajes</button>
              <button ref={mobileObservationsButtonRef} type="button" onClick={() => { observationsExplicitRef.current = true; setSelectedObservationBlockId(null); setObservationsOpen(true); setMobileNavigateOpen(false); }}><SmartFeatureIndicator label={`Asistente${pendingObservationCount ? ` (${pendingObservationCount})` : ""}`} /></button>
              <button type="button" disabled={!initialTimeline.ok} onClick={() => openTimeline()}>Timeline</button>
            </div>
          </div>
        )}
        {mobileMoreOpen && (
          <div className="writer-mobile-sheet writer-mobile-more-sheet" role="dialog" aria-label="Más acciones de Writer">
            <div className="writer-mobile-sheet-head"><strong>Writer</strong><button type="button" onClick={() => setMobileMoreOpen(false)}>Cerrar</button></div>
            <button type="button" onClick={openImportFlow}>Importar guion</button>
            <button type="button" onClick={() => { setMobileMoreOpen(false); setAppearanceOpen(true); }}>Apariencia y atajos</button>
            <button type="button" onClick={() => { setMobileMoreOpen(false); startAutoFormat(readiness.state === "PARTIALLY_FORMATTED" ? "partial" : "document"); }}><SmartFeatureIndicator label="FORMATO AUTOMÁTICO" /></button>
            <button type="button" onClick={() => { setMobileMoreOpen(false); setSearchReplaceMode(false); setSearchOpen(true); }}><WriterIcon name="search" /> Buscar</button>
            <button type="button" onClick={() => { setMobileMoreOpen(false); openTimeline(null, "ideas"); }}><WriterIcon name="ideas" /> Ideas</button>
            <button type="button" onClick={() => { setMobileMoreOpen(false); setVersionsOpen(true); }}><WriterIcon name="history" /> Versiones</button>
            <button type="button" onClick={() => { setMobileMoreOpen(false); toggleTypewriterSound(); }}><WriterIcon name={typewriterSoundEnabled ? "soundOn" : "soundOff"} /> {typewriterSoundEnabled ? "Desactivar sonido" : "Activar sonido"}</button>
            <button type="button" onClick={() => { setMobileMoreOpen(false); setPdfExportOpen(true); }}>Exportar PDF</button>
            <button type="button" onClick={() => { setMobileMoreOpen(false); downloadBackup("json"); }}>Exportar JSON</button>
            <button type="button" onClick={() => { setMobileMoreOpen(false); downloadBackup("fdx"); }}>Exportar FDX</button>
            <button type="button" onClick={() => { setMobileMoreOpen(false); void (focusMode ? exitFocus() : enterFocus()); }}>{focusMode ? "Salir de Focus" : "Focus"}</button>
            <button type="button" onClick={() => { setMobileMoreOpen(false); setMobileNoticeOpen(true); }}>Información de uso móvil</button>
          </div>
        )}
      </header>

      <aside className={`writer-sidebar ${mobileSidebar ? "writer-sidebar--open" : ""} writer-sidebar--mobile-${mobileSidebar ?? "closed"}`}>
        <div className="writer-sidebar-mobile-head">
          <strong>{mobileSidebar === "characters" ? "Personajes" : "Escenas"}</strong>
          <button type="button" onClick={() => setMobileSidebar(null)}>Cerrar</button>
        </div>
        <div className="writer-sidebar-title">
          <small>Guion</small>
          <strong>{title || "Guion sin título"}</strong>
        </div>
        <nav className="writer-scene-region" aria-label="Escenas del guion" tabIndex={0}>
          <p className="writer-sidebar-heading">Escenas <span>{scenes.length}</span></p>
          {scenes.length ? (
            <ol className="writer-scene-list">
              {scenes.map((scene, index) => (
                <li
                  key={scene.id}
                  className={`${activeScene === scene.id ? "is-active" : ""}${draggedSceneId === scene.id ? " is-dragging" : ""}${sceneDropTarget?.sceneId === scene.id ? ` is-drop-${sceneDropTarget.position}` : ""}`}
                  onDragOver={(event) => {
                    if (!draggedSceneId || draggedSceneId === scene.id) return;
                    event.preventDefault();
                    const bounds = event.currentTarget.getBoundingClientRect();
                    setSceneDropTarget({ sceneId: scene.id, position: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after" });
                    event.currentTarget.parentElement?.scrollBy({
                      top: event.clientY < bounds.top + 12 ? -24 : event.clientY > bounds.bottom - 12 ? 24 : 0,
                    });
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedSceneId && sceneDropTarget) handleMoveScene(draggedSceneId, sceneDropTarget.sceneId, sceneDropTarget.position);
                  }}
                >
                  <button
                    className="writer-scene-drag-handle"
                    type="button"
                    draggable
                    aria-label={`Mover escena ${scene.order}`}
                    title="Arrastrar para reordenar"
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", scene.id);
                      setWriterDragPreview(event.nativeEvent, event.currentTarget.closest("li") as HTMLElement);
                      setDraggedSceneId(scene.id);
                    }}
                    onDragEnd={() => { setDraggedSceneId(null); setSceneDropTarget(null); }}
                  >⋮⋮</button>
                  {editingSceneNickname === scene.id ? (
                    <input
                      className="writer-scene-nickname-input"
                      value={sceneNicknameDraft}
                      onChange={(event) => setSceneNicknameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") { event.preventDefault(); commitSceneNickname(scene.id); }
                        if (event.key === "Escape") { event.preventDefault(); setEditingSceneNickname(null); }
                      }}
                      onBlur={() => commitSceneNickname(scene.id)}
                      aria-label={`Nombre interno de la escena ${scene.order}`}
                      autoFocus
                    />
                  ) : (
                    <button type="button" className="writer-scene-link" onClick={() => navigateToScene(scene.id)} onDoubleClick={() => beginSceneNicknameEdit(scene.id)}>
                      <span>{scene.order}</span>
                      <span className="writer-scene-labels">
                        {structuralMetadata.sceneNicknames[scene.id] && <strong>{structuralMetadata.sceneNicknames[scene.id]}</strong>}
                        <b>{scene.title}</b>
                        <small>{sceneMetadata[scene.id]?.blockCount ?? 1} bloques · {sceneMetadata[scene.id]?.wordCount ?? 0} palabras</small>
                      </span>
                    </button>
                  )}
                  <button type="button" className="writer-scene-pencil" aria-label={`Renombrar escena ${scene.order}`} onClick={() => beginSceneNicknameEdit(scene.id)}>✎</button>
                  <button type="button" className="writer-scene-more" aria-label={`Acciones de escena ${scene.order}`} aria-expanded={sceneActionsOpen === scene.id} onClick={() => setSceneActionsOpen((current) => current === scene.id ? null : scene.id)}>•••</button>
                  {sceneActionsOpen === scene.id && (
                    <div className="writer-scene-actions" role="menu">
                      <button type="button" role="menuitem" disabled={index === 0} onClick={() => moveSceneByOffset(scene.id, -1)}>Mover arriba</button>
                      <button type="button" role="menuitem" disabled={index === scenes.length - 1} onClick={() => moveSceneByOffset(scene.id, 1)}>Mover abajo</button>
                      <button type="button" role="menuitem" onClick={() => beginSceneNicknameEdit(scene.id)}>Renombrar</button>
                      <button type="button" role="menuitem" onClick={() => handleDuplicateScene(scene.id)}>Duplicar escena</button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          ) : <p className="writer-sidebar-empty">Añade un encabezado para crear una escena.</p>}
        </nav>
        {!charactersCollapsed && (
          <WriterHorizontalResizeHandle
            panel="characters"
            value={workspaceLayout.charactersHeight}
            workspaceRef={workspaceRef}
            onCommit={(charactersHeight) => commitWorkspaceLayout({ charactersHeight })}
          />
        )}
        <section className={`writer-character-section${charactersCollapsed ? " is-collapsed" : ""}`} aria-labelledby="writer-character-heading">
          <button className="writer-character-section-toggle" type="button" aria-expanded={!charactersCollapsed} onClick={() => setCharactersCollapsed((value) => !value)}>
            <span id="writer-character-heading" className="writer-sidebar-heading">Elementos detectados</span><span aria-hidden="true">{charactersCollapsed ? "⌄" : "⌃"}</span>
          </button>
          {!charactersCollapsed && <WriterBreakdownPanel
            scriptId={script.id}
            activeSceneId={activeScene}
            characterCount={characterRows.length}
            onEnsureSaved={ensureCurrentDocumentSaved}
            onNavigate={(reference) => {
              if (!reference.sceneId) return;
              navigateToWriterReference({
                sceneId: reference.sceneId,
                blockId: reference.blockId,
                fromOffset: reference.fromOffset ?? undefined,
                toOffset: reference.toOffset ?? undefined,
              });
            }}
            characters={characterRows.length ? (
            <ul aria-label="Personajes del guion" tabIndex={0}>{characterRows.map((character) => (
              <li key={character.identityId} className="writer-character-item">
                {editingCharacterId === character.identityId ? (
                  <input
                    className="writer-character-rename-input"
                    value={characterNameDraft}
                    onChange={(event) => setCharacterNameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") { event.preventDefault(); commitCharacterRename(character.identityId); }
                      if (event.key === "Escape") { event.preventDefault(); setEditingCharacterId(null); }
                    }}
                    onBlur={() => commitCharacterRename(character.identityId)}
                    aria-label={`Renombrar ${character.name}`}
                    autoFocus
                  />
                ) : <button type="button" onDoubleClick={() => beginCharacterRename(character.identityId, character.name)} onClick={() => {
                  setSelectedObservationBlockId(character.firstBlockId);
                  setObservationsOpen(true);
                  setMobileSidebar(null);
                  const evidence = combinedCharacterObservations.find((observation) => observation.identityKey === character.key
                    && observation.blockId === character.firstBlockId);
                  if (evidence) viewCharacterObservation(evidence);
                  else if (editor && character.firstBlockId) {
                    const target = findWriterBlockById(editor, character.firstBlockId);
                    if (target) {
                      recordCurrentNavigation();
                      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, target.position + 1)).scrollIntoView());
                      editor.view.focus();
                      setActiveScene(findSceneForPosition(editor.getJSON() as unknown as WriterDocument, character.firstBlockId));
                    }
                  }
                }}>
                  <strong>{character.name}</strong>
                  <span>{character.evidenceCount} {character.evidenceCount === 1 ? "evidencia" : "evidencias"}</span>
                </button>}
                <button type="button" className="writer-character-pencil" aria-label={`Renombrar ${character.name}`} onClick={() => beginCharacterRename(character.identityId, character.name)}>✎</button>
                <div className="writer-character-hover" role="tooltip">
                  <strong>{character.name}</strong>
                  <span>Evidencias: {character.evidenceCount}</span>
                  <span>Escenas: {character.sceneCount}</span>
                  <span>Primera aparición: {character.firstSceneOrder ? `Escena ${character.firstSceneOrder}` : "Sin escena"}</span>
                  <span>Última aparición: {character.lastSceneOrder ? `Escena ${character.lastSceneOrder}` : "Sin escena"}</span>
                </div>
              </li>
            ))}</ul>
          ) : <p className="writer-sidebar-empty">Los personajes aceptados aparecerán aquí.</p>}
          />}
        </section>
      </aside>

      {!focusMode && workspaceLayout.leftSidebarVisible && (
        <WriterPanelResizeHandle
          side="left"
          value={panelLayout.left}
          otherValue={panelLayout.right}
          otherVisible={observationsOpen}
          workspaceRef={workspaceRef}
          onCommit={(value) => commitPanelWidth("left", value)}
        />
      )}

      <main className="writer-editor-area">
        <WriterToolbar
          editor={editor}
          words={words}
          onAutoFormat={() => startAutoFormat(readiness.state === "PARTIALLY_FORMATTED" ? "partial" : "document")}
          onSearch={() => { setSearchReplaceMode(false); setSearchOpen(true); }}
          onIdeas={() => openTimeline(null, "ideas")}
          soundEnabled={typewriterSoundEnabled}
          onToggleSound={toggleTypewriterSound}
          onInsert={(next) => {
            setExportMenu(false);
            setContextMenu(null);
            setInsertState(next);
          }}
        />
        <div className="writer-editor-notices">
          {!focusMode && shotlistReturnPath && <Link className="writer-navigation-back" href={shotlistReturnPath}>← Volver a Shotlist</Link>}
          {!focusMode && navigationDepth > 0 && <button className="writer-navigation-back" type="button" onClick={navigateBack}>← Volver</button>}
          {feedback && <div className="writer-editor-feedback" role="status">{feedback}<button type="button" onClick={() => setFeedback(null)}>Cerrar</button></div>}
        </div>
        <div
          ref={paperRef}
          className="writer-paper"
          aria-busy={!ready}
          onPointerDownCapture={(event) => {
            pointerRef.current = { type: event.pointerType || "mouse", at: Date.now() };
            if (event.button !== 2 || pointerRef.current.type !== "mouse") return;
            rightClickSelectionRef.current = activeWriterSelectionRef.current && editor
              ? captureWriterSelectionTarget(editor.state)
              : null;
            event.preventDefault();
          }}
          onContextMenu={(event) => {
            if (event.defaultPrevented || event.shiftKey) return;
            const recentPointer = Date.now() - pointerRef.current.at < 2_000 ? pointerRef.current.type : "mouse";
            if (recentPointer !== "mouse") return;
            event.preventDefault();
            if (!editor) return;
            openContextMenuAtPointer(
              editor.state,
              rightClickSelectionRef.current ?? activeWriterSelectionRef.current,
              event.clientX,
              event.clientY,
            );
            rightClickSelectionRef.current = null;
          }}
        >
          {!ready && <div className="writer-loading">Preparando tu guion…</div>}
          <div className="writer-paper-sheet">
            {ready && document.content.every((block) => !blockText(block).trim()) && <div className="writer-empty-document-help">
              <strong>Empieza tu guión</strong>
              <span>Escribe, pega tu texto o importa un guion existente.</span>
              <button type="button" onClick={openImportFlow}>Importar guion</button>
              <small>DOCX · FDX · TXT</small>
            </div>}
            <EditorContent editor={editor} />
          </div>
        </div>
        {autocomplete && (
          <WriterAutocompleteMenu
            state={autocomplete}
            onSelect={(suggestion) => {
              if (acceptAutocompleteRef.current?.(suggestion)) updateAutocomplete(null);
            }}
          />
        )}
      </main>

      {observationsOpen && !focusMode && (
        <WriterPanelResizeHandle
          side="right"
          value={panelLayout.right}
          otherValue={workspaceLayout.leftSidebarVisible ? panelLayout.left : 0}
          otherVisible={workspaceLayout.leftSidebarVisible}
          workspaceRef={workspaceRef}
          onCommit={(value) => commitPanelWidth("right", value)}
        />
      )}

      {editor && contextMenu && (
        <WriterContextMenu
          editor={editor}
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onConvertSceneHeading={() => {
            const snapshot = contextMenu.target;
            if (!snapshot || !writerSelectionTargetIsCurrent(editor.state, snapshot)) {
              setFeedback("El cursor o el documento cambió. Abre de nuevo el menú en el destino actual.");
              return setContextMenu(null);
            }
            setInsertState({
              targetId: snapshot.targetId,
              x: contextMenu.x,
              y: contextMenu.y,
              view: "scene",
              intent: "convert",
              expectedKind: snapshot.kind,
              expectedText: snapshot.text,
              selectionFrom: snapshot.from,
              selectionTo: snapshot.to,
              documentAtOpen: snapshot.document,
            });
            setContextMenu(null);
          }}
          onTimeline={(sceneId) => openTimeline(sceneId)}
          onAnalyzeScene={(sceneId) => void analyzeSceneFromMenu(sceneId)}
          onAnalyzeSelection={openSelectionAnalysis}
          onAssistant={openAssistantForScene}
          onFeedback={setFeedback}
        />
      )}
      {guidedSelection && <WriterSelectionAnalysisDialog
        selection={guidedSelection}
        currentDocumentHash={guidedWriting.documentHash}
        busy={guidedWriting.sending}
        onAnalyze={async (question) => {
          try {
            await ensureCurrentDocumentSaved();
            if (!guidedWriting.documentHash || guidedWriting.documentHash !== guidedSelection.documentHash) {
              guidedWriting.setFeedback("El guion cambió desde esta selección. Selecciona el fragmento de nuevo.");
              return null;
            }
            return await guidedWriting.analyzeSelection({
              ...guidedSelection,
              sourceRevision: saveStateRef.current.revision,
              documentHash: guidedWriting.documentHash,
            }, question);
          } catch (cause) {
            guidedWriting.setFeedback(cause instanceof Error ? cause.message : "No pudimos analizar la selección.");
            return null;
          }
        }}
        onCancel={guidedWriting.cancel}
        onClose={() => setGuidedSelection(null)}
        onView={() => {
          if (!editor || guidedWriting.documentHash !== guidedSelection.documentHash) return;
          editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, guidedSelection.from, guidedSelection.to)).scrollIntoView());
          editor.commands.focus();
          setGuidedSelection(null);
        }}
      />}
      {editor && insertState && (
        <WriterInsertPanel editor={editor} state={insertState} onClose={() => setInsertState(null)} />
      )}

      {timelineMounted && initialTimeline.ok && (
        <section
          id="writer-timeline-panel"
          className="writer-timeline-panel"
          aria-label="Timeline del guion"
          hidden={!timelineOpen}
        >
          {!timelineExpanded && (
            <WriterHorizontalResizeHandle
              panel="timeline"
              value={workspaceLayout.timelineHeight}
              workspaceRef={workspaceRef}
              onCommit={(timelineHeight) => commitWorkspaceLayout({ timelineHeight })}
            />
          )}
          <WriterTimelineView
            initialTimeline={initialTimeline.timeline}
            variant="embedded"
            localDirty={["saving", "local", "error", "conflict", "sessionExpired", "deleted"].includes(saveState.status)}
            confirmedRevision={saveState.revision}
            active={timelineOpen}
            requestedSceneId={timelineRequestedScene}
            requestedView={timelineRequestedView}
            requestedViewToken={timelineRequestedViewToken}
            timelineReadinessNotice={readinessNotice("timeline")}
            pulseReadinessNotice={readinessNotice("pulse")}
            pulseAvailable={canUseStructuredFeature(readiness, "pulse").available}
            onEnsureCurrentSaved={ensureCurrentDocumentSaved}
            refreshToken={timelineRefreshToken}
            activeSceneId={activeScene}
            sceneNicknames={structuralMetadata.sceneNicknames}
            onMoveScene={handleMoveScene}
            onClose={closeTimeline}
            expanded={timelineExpanded}
            onToggleExpanded={() => setTimelineExpanded((value) => !value)}
            ideasPanel={(
              <WriterIdeasPanel
                scriptId={script.id}
                activeSceneId={activeScene}
                confirmedRevision={saveState.revision}
                onEnsureCurrentSaved={ensureCurrentDocumentSaved}
                onNavigate={navigateSearchResult}
                onThinkTogether={thinkTogetherFromIdea}
              />
            )}
            onGoToWriter={(sceneId, options) => {
              if (!options?.preservePanel) setTimelineExpanded(false);
              if (!editor) {
                setFeedback("El editor todavía no está preparado.");
                return;
              }
              const target = findWriterBlockById(editor, sceneId);
              if (!target || target.kind !== "sceneHeading" || navigateToWriterReference({ sceneId }, { preservePanel: options?.preservePanel }) === "missing") {
                setFeedback("Timeline está desactualizado: la escena ya no existe o dejó de ser un encabezado.");
                return;
              }
              setFeedback(null);
              if (!options?.preservePanel && window.matchMedia("(max-width: 900px)").matches) setTimelineOpen(false);
            }}
          />
        </section>
      )}

      {saveState.status === "tabBlocked" && (
        <div className="writer-tab-notice" role="alert">
          <div><strong>Abierto en otra pestaña</strong><p>Esta copia permanece protegida y no enviará cambios hasta tomar el control.</p></div>
          <button type="button" onClick={() => leaseRef.current?.takeOver()}>Editar aquí</button>
        </div>
      )}

      {searchOpen && <WriterSearchPanel
        scriptId={script.id}
        document={document}
        activeSceneId={activeScene}
        initialReplace={searchReplaceMode}
        onClose={() => setSearchOpen(false)}
        onNavigate={navigateSearchResult}
        onReplace={replaceSearchResult}
        onReplaceAll={replaceAllSearchResults}
      />}

      {versionsOpen && <WriterVersionsPanel
        scriptId={script.id}
        snapshot={currentSnapshot()}
        revision={Math.max(1, saveState.revision)}
        onClose={() => setVersionsOpen(false)}
        onRestore={restoreWriterCheckpoint}
      />}

      {pdfExportOpen && (
        <WriterPdfExportDialog
          initialTitle={title}
          getSnapshot={currentSnapshot}
          returnFocusRef={exportButtonRef}
          onClose={() => setPdfExportOpen(false)}
        />
      )}

      {importOpen && (
        <WriterImportFlow
          beforeCreate={ensureCurrentDocumentSaved}
          currentDocument={{ title, empty: document.content.every((block) => !blockText(block).trim()), onApply: applyImportedToCurrent }}
          onClose={() => setImportOpen(false)}
        />
      )}

      {autoFormatPlan && (
        <WriterAutoFormatFlow
          plan={autoFormatPlan}
          resolving={autoFormatResolving}
          fallbackNotice={autoFormatFallback}
          onApply={applyAutoFormatPlan}
          onClose={closeAutoFormat}
        />
      )}

      {pasteAssist && !autoFormatPlan && (
        <WriterPasteFormatPrompt
          step={pasteAssist.step}
          onFormat={() => startAutoFormat("paste", pasteAssist.blockIds)}
          onContinue={() => {
            if (pasteAssist.step === "offer") {
              setPasteAssist((current) => current ? { ...current, step: "consequence" } : null);
            } else {
              setPasteAssist(null);
            }
          }}
          onBack={() => setPasteAssist((current) => current ? { ...current, step: "offer" } : null)}
          onClose={() => setPasteAssist(null)}
        />
      )}

      {mobileNoticeOpen && !focusMode && (
        <div className="writer-mobile-notice" role="dialog" aria-labelledby="writer-mobile-notice-title">
          <strong id="writer-mobile-notice-title">Writer en móvil</strong>
          <p>Writer funciona mejor en una pantalla grande. Puedes escribir y revisar desde el teléfono, pero Timeline, reorganización de escenas y algunas herramientas avanzadas son más cómodas en tablet o desktop.</p>
          <button type="button" onClick={dismissMobileNotice}>Entendido</button>
        </div>
      )}

      <WriterObservationsPanel
        hidden={!observationsOpen || focusMode}
        section={observationsSection}
        readinessNotice={readinessNotice(observationsSection === "review"
          ? "review"
          : observationsSection === "assistant"
            ? (readiness.sceneCount > 0 && !canUseStructuredFeature(readiness, "ooc").available ? "ooc" : "assistant")
            : observationsSection === "setupPayoff" ? "setupPayoff" : "guided")}
        onSectionChange={(section) => {
          observationsExplicitRef.current = true;
          setObservationsSection(section);
        }}
        assistantPanel={(
          <WriterAssistantNarrative
            enabled={assistant.enabled}
            sceneNumber={activeScene ? (scenes.find((scene) => scene.id === activeScene)?.order ?? null) : null}
            sceneTitle={activeScene ? (structuralMetadata.sceneNicknames[activeScene]
              || scenes.find((scene) => scene.id === activeScene)?.title || null) : null}
            status={assistant.activeStatus}
            analysis={assistant.activeAnalysis}
            override={assistant.activeOverride}
            observations={assistant.activeObservations}
            selectedObservationId={selectedAssistantObservationId}
            feedback={assistant.feedback}
            onToggle={(next) => void assistant.setEnabled(next)}
            onAnalyze={() => { if (activeScene) void analyzeSceneFromMenu(activeScene); }}
            onSaveOverride={(field, value) => { if (activeScene) void assistant.saveOverride(activeScene, field, value); }}
            onDismiss={(observation) => {
              if (activeScene && assistant.activeHash) void assistant.dismissObservation(activeScene, assistant.activeHash, observation.id);
            }}
            onViewObservation={viewNarrativeObservation}
          />
        )}
        setupPayoffPanel={(
          <WriterSetupPayoff
            elements={setupPayoff.elements}
            links={setupPayoff.links}
            scenes={scenes.map((scene) => ({
              id: scene.id,
              order: scene.order,
              title: structuralMetadata.sceneNicknames[scene.id] || scene.title,
            }))}
            activeSceneId={activeScene}
            current={setupPayoff.current}
            loaded={setupPayoff.loaded}
            analyzing={setupPayoff.analyzing}
            feedback={setupPayoff.feedback}
            onAnalyze={() => void analyzeSetupPayoff()}
            onView={viewSetupPayoffElement}
            onViewPulse={(sceneId) => openTimeline(sceneId, "pulse")}
            onElementStatus={(element, status) => void setupPayoff.setElementStatus(element.id, status)}
            onLinkStatus={(link, status) => void setupPayoff.setLinkStatus(link.id, status)}
            onCreateElement={setupPayoff.createElement}
            onCreateLink={setupPayoff.createLink}
          />
        )}
        guidedWritingPanel={(
          <WriterGuidedWriting
            scope={guidedWriting.scope}
            sceneNumber={activeScene ? (scenes.find((scene) => scene.id === activeScene)?.order ?? null) : null}
            sceneTitle={activeScene ? (structuralMetadata.sceneNicknames[activeScene]
              || scenes.find((scene) => scene.id === activeScene)?.title || null) : null}
            messages={guidedWriting.messages}
            documentHash={guidedWriting.documentHash}
            loaded={guidedWriting.loaded}
            sending={guidedWriting.sending}
            feedback={guidedWriting.feedback}
            onScopeChange={guidedWriting.setScope}
            onSend={sendGuidedWriting}
            onCancel={guidedWriting.cancel}
            onReference={viewGuidedReference}
            ideaContext={guidedIdeaContext}
            onClearIdeaContext={() => setGuidedIdeaContext(null)}
          />
        )}
        footer={<button ref={shotlistTriggerRef} className={`writer-shotlist-footer-button${shotlistQueryState === "error" ? " is-error" : ""}`} type="button" disabled={!ready || shotlistBusy || shotlistQueryState === "loading"} onClick={() => shotlistQueryState === "error" ? void loadShotlists() : openShotlistFlow()}>{shotlistQueryState === "error" ? "Reintentar consulta de Shotlist" : shotlistQueryState === "loading" ? "Comprobando Shotlist…" : shotlists.length ? "Abrir shotlist" : <SmartFeatureIndicator label={shotlistBusy ? "GUARDANDO…" : "GENERAR SHOTLIST"} />}</button>}
        observations={combinedCharacterObservations}
        knownIdentities={knownCharacterIdentities}
        knownCharacterActivity={characterRows}
        decisions={characterDecisions}
        storagePersistent={characterStoragePersistent}
        importedAnalysisPersistent={Boolean(persistedImportAnalysis)}
        formatObservations={formatObservations}
        reviewedFormatIds={reviewedFormatIds}
        activeFormatObservationId={activeFormatObservationId}
        showHighlights={showImportReviewHighlights}
        formatReviewPersistent={formatReviewStoragePersistent}
        sceneCount={scenes.length}
        sceneOrder={scenes.map((scene) => scene.id)}
        activeSceneId={activeScene}
        selectedBlockId={selectedObservationBlockId}
        onClose={() => {
            setRightSidebarVisible(false);
            focusObservationsTrigger();
        }}
        onConfirm={confirmCharacterObservation}
        onLink={(observation, identityKey) => setCharacterDecision({
            fingerprint: observation.fingerprint,
            blockId: observation.blockId,
            state: "linked",
            identityKey,
            decidedAt: Date.now(),
        })}
        onIgnore={(observation) => setCharacterDecision({
            fingerprint: observation.fingerprint,
            blockId: observation.blockId,
            state: "ignored",
            decidedAt: Date.now(),
        })}
        onRestore={(decision) => {
            updateCharacterDecisions((current) => ({
              ...current,
              decisions: current.decisions.filter((item) => item.fingerprint !== decision.fingerprint),
            }));
            void removePersistedCharacterDecision(decision.fingerprint);
        }}
        onAddManual={addManualCharacter}
        onView={viewCharacterObservation}
        onViewFormat={viewFormatObservation}
        onReviewFormat={reviewFormatObservation}
        onChangeFormat={changeFormatObservation}
        onToggleHighlights={setShowImportReviewHighlights}
      />

      {shotlistModalOpen && !focusMode && <div className="writer-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !shotlistBusy) setShotlistModalOpen(false); }}>
        <section className="writer-modal writer-shotlist-modal" role="dialog" aria-modal="true" aria-labelledby="writer-shotlist-modal-title">
          <p className="writer-eyebrow">Preproducción</p>
          <h2 id="writer-shotlist-modal-title">Generar Shotlist</h2>
          <p>Puedes crear una base desde las escenas de tu guion o pedir una propuesta de planos con IA.</p>
          <p className="writer-shotlist-credit-note">{previewNoCredits ? "Esta prueba no descontará créditos." : "La generación sugerida está sujeta a la política generativa disponible para tu cuenta."}</p>
          <div className="writer-shotlist-modal-actions"><button className="writer-satin-button writer-satin-button--primary" type="button" autoFocus disabled={shotlistBusy} onClick={() => void createShotlist("suggested")}><SmartFeatureIndicator label="Generar sugerida" /></button><button className="writer-satin-button" type="button" disabled={shotlistBusy} onClick={() => void createShotlist("manual")}>Continuar sin IA</button><button type="button" disabled={shotlistBusy} onClick={() => { setShotlistModalOpen(false); window.requestAnimationFrame(() => shotlistTriggerRef.current?.focus()); }}>Cancelar</button></div>
          <small>La opción sugerida abre Shotlist en modo Sugerido. La IA sólo se ejecuta allí con otra confirmación explícita.</small>
        </section>
      </div>}

      {shortcutsOpen && !focusMode && <div className="writer-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShortcutsOpen(false); }}>
        <section className="writer-modal writer-shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="writer-shortcuts-title">
          <p className="writer-eyebrow">Escritura</p><h2 id="writer-shortcuts-title">Atajos de teclado</h2>
          <p>Estos atajos cambian el tipo del bloque actual; no insertan ni borran texto.</p>
          <dl>{WRITER_KIND_SHORTCUTS.map((item) => <div key={item.digit}><dt>{item.label}</dt><dd><kbd>{writerShortcutLabel(item.digit, typeof navigator === "undefined" ? "" : navigator.platform)}</kbd></dd></div>)}</dl>
          <p><kbd>Enter</kbd> crea el siguiente bloque según el contexto. <kbd>Tab</kbd> sólo cambia un bloque vacío cuando Writer reconoce una transición segura.</p>
          <button type="button" autoFocus onClick={() => setShortcutsOpen(false)}>Cerrar</button>
        </section>
      </div>}

      {structuralToast && !focusMode && (
        <div className="writer-structural-toast" role="status" aria-live="polite">
          <span>{structuralToast.message}</span>
          <button type="button" onClick={() => {
            editor?.chain().focus().undo().run();
            setStructuralToast(null);
          }}>Deshacer</button>
        </div>
      )}

      {["conflict", "deleted", "sessionExpired"].includes(saveState.status) && (
        <div className="writer-modal-backdrop">
          <section className="writer-modal writer-conflict-modal" role="alertdialog" aria-modal="true" aria-labelledby="writer-conflict-title">
            <p className="writer-eyebrow">Tu texto permanece en este dispositivo</p>
            <h2 id="writer-conflict-title">{saveState.status === "conflict" ? "Conflicto de versiones" : saveState.status === "deleted" ? "El guion fue eliminado" : "La sesión terminó"}</h2>
            <p>{saveState.message}</p>
            <div className="writer-conflict-actions">
              <button type="button" onClick={() => downloadBackup("json")}>Descargar mi versión</button>
              {saveState.status === "conflict" && <>
                <button type="button" onClick={useRemoteVersion} disabled={conflictBusy}>Usar versión de la nube</button>
                <button type="button" onClick={keepLocalVersion} disabled={conflictBusy}>Conservar esta versión</button>
                <button className="writer-primary-button" type="button" onClick={saveConflictCopy} disabled={conflictBusy}>Guardar como copia</button>
              </>}
              {saveState.status === "sessionExpired" && <Link href={`/login?next=/writer/${script.id}`}>Volver a iniciar sesión</Link>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function WriterAutocompleteMenu({
  state,
  onSelect,
}: {
  state: WriterAutocompleteState;
  onSelect: (suggestion: WriterAutocompleteSuggestion) => void;
}) {
  const width = 276;
  const left = typeof window === "undefined"
    ? state.x
    : Math.max(8, Math.min(state.x, window.innerWidth - width - 8));
  const maxTop = typeof window === "undefined" ? state.y : window.innerHeight - 176;
  const top = Math.max(8, Math.min(state.y, maxTop));
  return (
    <div
      className="writer-autocomplete"
      role="listbox"
      aria-label="Sugerencias de formato"
      style={{ left, top, width }}
    >
      {state.suggestions.map((suggestion, index) => (
        <button
          key={suggestion.id}
          type="button"
          role="option"
          aria-selected={index === state.selectedIndex && state.explicitlySelected}
          className={index === state.selectedIndex && state.explicitlySelected ? "is-selected" : ""}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(suggestion)}
        >
          <span>{suggestion.label}</span>
          <small>{suggestion.description}</small>
        </button>
      ))}
      <p><kbd>Tab</kbd> aceptar · <kbd>Esc</kbd> cerrar</p>
    </div>
  );
}

function WriterToolbar({
  editor,
  words,
  onAutoFormat,
  onSearch,
  onIdeas,
  soundEnabled,
  onToggleSound,
  onInsert,
}: {
  editor: Editor | null;
  words: number;
  onAutoFormat: () => void;
  onSearch: () => void;
  onIdeas: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onInsert: (state: WriterInsertState) => void;
}) {
  const [formatOpen, setFormatOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [toolbarMode, setToolbarMode] = useState<"wide" | "compact" | "minimal">("wide");
  const toolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const update = () => {
      const width = toolbar.clientWidth;
      setToolbarMode(width >= 860 ? "wide" : width >= 620 ? "compact" : "minimal");
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, []);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive("bold") ?? false,
      italic: current?.isActive("italic") ?? false,
      underline: current?.isActive("underline") ?? false,
      canUndo: current?.can().chain().undo().run() ?? false,
      canRedo: current?.can().chain().redo().run() ?? false,
    }),
  });
  if (!editor || !state) return <div className="writer-toolbar" aria-hidden="true" />;
  const preserveSelection = (event: React.MouseEvent) => event.preventDefault();
  return (
    <div ref={toolbarRef} className="writer-toolbar" role="toolbar" aria-label="Formato del guion" data-toolbar-mode={toolbarMode}>
      <button
        className="writer-insert-button"
        type="button"
        onMouseDown={preserveSelection}
        onClick={(event) => {
          const target = currentWriterBlock(editor);
          if (!target) return;
          const rect = event.currentTarget.getBoundingClientRect();
          onInsert({
            targetId: target.id,
            x: rect.left,
            y: rect.bottom + 6,
            view: "menu",
            intent: "insert",
            expectedKind: target.kind,
            expectedText: target.text,
            selectionFrom: editor.state.selection.from,
            selectionTo: editor.state.selection.to,
            documentAtOpen: editor.state.doc,
          });
        }}
        aria-label="Insertar en el guion"
        title="Insertar"
      ><WriterIcon name="insert" /><span className="writer-toolbar-label">Insertar</span><WriterIcon className="writer-insert-chevron" name="chevronDown" size={14} /></button>
      <button className="writer-auto-format-button" type="button" onMouseDown={preserveSelection} onClick={onAutoFormat}>
        <SmartFeatureIndicator label="FORMATO AUTOMÁTICO" />
      </button>
      <div className="writer-toolbar-desktop-actions">
        <div className="writer-toolbar-formatting-actions">
        <span className="writer-toolbar-divider" aria-hidden="true" />
        <button type="button" aria-label="Negrita" aria-pressed={state.bold} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></button>
        <button type="button" aria-label="Cursiva" aria-pressed={state.italic} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></button>
        <button type="button" aria-label="Subrayado" aria-pressed={state.underline} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></button>
        </div>
        <div className="writer-toolbar-history-actions">
        <span className="writer-toolbar-divider" aria-hidden="true" />
        <button type="button" onMouseDown={preserveSelection} onClick={() => editor.chain().focus().undo().run()} disabled={!state.canUndo} aria-label="Deshacer" title="Deshacer"><WriterIcon name="undo" /></button>
        <button type="button" onMouseDown={preserveSelection} onClick={() => editor.chain().focus().redo().run()} disabled={!state.canRedo} aria-label="Rehacer" title="Rehacer"><WriterIcon name="redo" /></button>
        </div>
        <div className="writer-toolbar-secondary-actions">
        <span className="writer-toolbar-divider" aria-hidden="true" />
        <button className="writer-search-button" type="button" aria-label="Buscar" onMouseDown={preserveSelection} onClick={onSearch} title="Buscar · Ctrl/Cmd+F"><WriterIcon name="search" /><span className="writer-toolbar-label">Buscar</span></button>
        {toolbarMode !== "minimal" && <button className="writer-ideas-button" type="button" aria-label="Ideas" onMouseDown={preserveSelection} onClick={onIdeas} title="Ideas narrativas"><WriterIcon name="ideas" /><span className="writer-toolbar-label">Ideas</span></button>}
        </div>
      </div>
      <div className="writer-format-wrap">
        <button className="writer-format-button" type="button" aria-label="Formato de texto" aria-expanded={formatOpen} onMouseDown={preserveSelection} onClick={() => setFormatOpen((open) => !open)}>Aa</button>
        {formatOpen && <div className="writer-format-menu" role="menu" aria-label="Formato de texto">
          <button type="button" role="menuitemcheckbox" aria-checked={state.bold} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleBold().run()}>Negrita</button>
          <button type="button" role="menuitemcheckbox" aria-checked={state.italic} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleItalic().run()}>Cursiva</button>
          <button type="button" role="menuitemcheckbox" aria-checked={state.underline} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleUnderline().run()}>Subrayado</button>
          <button type="button" role="menuitem" disabled={!state.canUndo} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().undo().run()}>Deshacer</button>
          <button type="button" role="menuitem" disabled={!state.canRedo} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().redo().run()}>Rehacer</button>
        </div>}
      </div>
      {toolbarMode === "wide" && <span className="writer-word-count">{words.toLocaleString("es-MX")} palabras</span>}
      {toolbarMode !== "minimal" && <button className="writer-sound-button" type="button" aria-label="Sonido de máquina de escribir" aria-pressed={soundEnabled} title="Sonido de máquina de escribir" onMouseDown={preserveSelection} onClick={onToggleSound}><WriterIcon name={soundEnabled ? "soundOn" : "soundOff"} /></button>}
      {toolbarMode === "minimal" && <div className="writer-toolbar-overflow-wrap">
        <button className="writer-toolbar-overflow-button" type="button" aria-label="Más acciones" aria-expanded={overflowOpen} title="Más acciones" onMouseDown={preserveSelection} onClick={() => setOverflowOpen((open) => !open)}><WriterIcon name="more" /></button>
        {overflowOpen && <div className="writer-toolbar-overflow-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOverflowOpen(false); onIdeas(); }}><WriterIcon name="ideas" /> Ideas</button>
          <button type="button" role="menuitem" onClick={() => { setOverflowOpen(false); onToggleSound(); }}><WriterIcon name={soundEnabled ? "soundOn" : "soundOff"} /> {soundEnabled ? "Desactivar sonido" : "Activar sonido"}</button>
          <span>{words.toLocaleString("es-MX")} palabras</span>
        </div>}
      </div>}
    </div>
  );
}

function SaveStatus({ state }: { state: WriterPersistenceState }) {
  const labels: Record<WriterPersistenceState["status"], string> = {
    cloud: "Guardado en la nube",
    saving: "Guardando…",
    local: "Guardado en este dispositivo; pendiente de sincronizar",
    error: "No se pudo guardar",
    conflict: "Conflicto de versiones",
    sessionExpired: "Sesión vencida; copia local protegida",
    deleted: "Eliminado en la nube; copia local protegida",
    tabBlocked: "Edición pausada en esta pestaña",
  };
  return <span className={`writer-save-status writer-save-status--${state.status}`} title={state.message ?? labels[state.status]}>{labels[state.status]}</span>;
}

function MobileSaveStatus({ state }: { state: WriterPersistenceState }) {
  const shortLabels: Record<WriterPersistenceState["status"], string> = {
    cloud: "Guardado",
    saving: "Guardando…",
    local: "Local",
    error: "Error",
    conflict: "Conflicto",
    sessionExpired: "Sesión",
    deleted: "Eliminado",
    tabBlocked: "Pausado",
  };
  return <span className={`writer-mobile-save-status writer-save-status--${state.status}`} title={state.message}>{shortLabels[state.status]}</span>;
}

async function saveRemote(request: RemoteSaveRequest): Promise<RemoteSaveResult> {
  try {
    const response = await fetch(`/api/writer/scripts/${request.scriptId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return { status: "saved", revision: Number(data.revision) };
    if (response.status === 409 && data.code === "conflict") return { status: "conflict" };
    if (response.status === 401) return { status: "unauthorized" };
    if (response.status === 404) return { status: "notFound" };
    if (response.status === 400) return { status: "invalid", message: data.error ?? "Documento inválido." };
    return { status: "retryable", message: data.error };
  } catch {
    return { status: "retryable", message: "No se pudo contactar al servidor." };
  }
}

function findSceneForPosition(document: WriterDocument, blockId: unknown) {
  let scene: string | null = null;
  for (const block of document.content) {
    if (block.attrs.kind === "sceneHeading") scene = block.attrs.id;
    if (block.attrs.id === blockId) return scene;
  }
  return scene;
}

function deriveWriterSceneMetadata(document: WriterDocument) {
  const result: Record<string, { blockCount: number; wordCount: number }> = {};
  let sceneId: string | null = null;
  for (const block of document.content) {
    if (block.attrs.kind === "sceneHeading") {
      sceneId = block.attrs.id;
      result[sceneId] = { blockCount: 1, wordCount: 0 };
      continue;
    }
    if (!sceneId) continue;
    result[sceneId].blockCount += 1;
    if (block.attrs.kind === "authorNote") continue;
    const text = blockText(block).trim();
    if (text) result[sceneId].wordCount += text.split(/\s+/u).length;
  }
  return result;
}

function extractWriterSceneNicknames(document: WriterDocument) {
  const result: Record<string, string> = {};
  for (const block of document.content) {
    if (block.attrs.kind !== "sceneHeading") continue;
    const nickname = normalizeWriterSceneNickname(String((block.attrs as Record<string, unknown>).sceneNickname ?? ""));
    if (nickname) result[block.attrs.id] = nickname;
  }
  return result;
}

function sameStringRecord(left: Readonly<Record<string, string>>, right: Readonly<Record<string, string>>) {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return leftEntries.length === rightEntries.length
    && leftEntries.every(([key, value]) => right[key] === value);
}

function writerAliasUsesPreviousName(
  document: WriterDocument,
  previousKey: string,
  previousName?: string,
  blockIds: readonly string[] = [],
) {
  const ids = new Set(blockIds);
  const matcher = previousName
    ? new RegExp(`(?<![\\p{L}\\p{N}_])${escapeWriterRegExp(previousName)}(?![\\p{L}\\p{N}_])`, "iu")
    : null;
  return document.content.some((block) => ids.has(block.attrs.id) && (
    (block.attrs.kind === "character" && writerCharacterIdentityKey(blockText(block)) === previousKey)
    || Boolean(matcher?.test(blockText(block)))
  ));
}

function escapeWriterRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function downloadText(contents: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

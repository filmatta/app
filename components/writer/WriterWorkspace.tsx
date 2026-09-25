"use client";

import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Fragment, Slice } from "@tiptap/pm/model";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SCREENPLAY_KINDS,
  WRITER_SCHEMA_VERSION,
  countDocumentWords,
  deriveCharacters,
  deriveScenes,
  validateWriterDocument,
  type ScreenplayKind,
  type WriterDocument,
  type WriterSnapshot,
} from "@/lib/writer/document";
import { createBasicFdx, createWriterBackup, writerFileStem } from "@/lib/writer/export";
import {
  WriterPersistenceController,
  type RemoteSaveRequest,
  type RemoteSaveResult,
  type WriterPersistenceState,
} from "@/lib/writer/persistence";
import { loadLocalWriterDrafts } from "@/lib/writer/storage";
import { startWriterTabLease, type WriterTabLease } from "@/lib/writer/tab-lease";
import { ScreenplayBlockExtension } from "@/lib/writer/tiptap";
import { writerTimelineHref } from "@/lib/writer/routes";
import WriterPdfExportDialog from "./WriterPdfExportDialog";
import {
  WriterCharacterPanel,
  WriterContextMenu,
  WriterInsertPanel,
  WRITER_KIND_LABELS,
  type WriterContextMenuState,
  type WriterInsertState,
} from "@/components/writer/WriterWritingTools";
import {
  currentWriterBlock,
  findWriterBlockAtPosition,
  selectionSpansWriterBlocks,
} from "@/lib/writer/editor-actions";

type ScriptInput = {
  id: string;
  title: string;
  document: WriterDocument;
  schemaVersion: number;
  revision: number;
  updatedAt: string;
};

const initialSaveState: WriterPersistenceState = {
  status: "cloud",
  revision: 1,
  localAvailable: true,
};

export default function WriterWorkspace({
  script,
  userId,
}: {
  script: ScriptInput;
  userId: string;
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
  const [mobileSidebar, setMobileSidebar] = useState<"scenes" | "characters" | null>(null);
  const [activeScene, setActiveScene] = useState<string | null>(null);
  const [exportMenu, setExportMenu] = useState(false);
  const [pdfExportOpen, setPdfExportOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<WriterContextMenuState | null>(null);
  const [insertState, setInsertState] = useState<WriterInsertState | null>(null);
  const [conflictBusy, setConflictBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const controllerRef = useRef<WriterPersistenceController | null>(null);
  const leaseRef = useRef<WriterTabLease | null>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const sessionIdRef = useRef(crypto.randomUUID());
  const openContextMenu = useCallback((next: WriterContextMenuState) => {
    setExportMenu(false);
    setInsertState(null);
    setContextMenu(next);
  }, []);

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
        const blocks = text.split(/\r?\n/).map((line) =>
          view.state.schema.nodes.screenplayBlock.create(
            { id: crypto.randomUUID(), kind: "action" },
            line ? view.state.schema.text(line) : undefined,
          ),
        );
        view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.fromArray(blocks), 0, 0)).scrollIntoView());
        return true;
      },
      handleDOMEvents: {
        contextmenu: (view, event) => {
          const contextEvent = event as MouseEvent;
          const pointerType = "pointerType" in contextEvent
            ? (contextEvent as PointerEvent).pointerType
            : "mouse";
          if (contextEvent.shiftKey || (pointerType && pointerType !== "mouse")) return false;
          const result = view.posAtCoords({ left: contextEvent.clientX, top: contextEvent.clientY });
          if (!result) return false;
          const target = findWriterBlockAtPosition(view.state.doc, result.pos);
          if (!target) return false;
          contextEvent.preventDefault();
          openContextMenu({
            targetId: target.id,
            kind: target.kind,
            x: contextEvent.clientX,
            y: contextEvent.clientY,
            multipleBlocks: selectionSpansWriterBlocks(view.state),
          });
          return true;
        },
      },
      handleKeyDown: (view, event) => {
        if (view.composing || event.isComposing || !((event.shiftKey && event.key === "F10") || event.key === "ContextMenu")) {
          return false;
        }
        const target = findWriterBlockAtPosition(view.state.doc, view.state.selection.from);
        if (!target) return false;
        event.preventDefault();
        const coordinates = view.coordsAtPos(view.state.selection.from);
        openContextMenu({
          targetId: target.id,
          kind: target.kind,
          x: coordinates.left,
          y: coordinates.bottom,
          multipleBlocks: selectionSpansWriterBlocks(view.state),
        });
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      const validated = validateWriterDocument(current.getJSON());
      if (!validated.ok) {
        setFeedback(validated.reason);
        return;
      }
      setDocument(validated.document);
      controllerRef.current?.markChanged({
        title: titleRef.current,
        document: validated.document,
        schemaVersion: WRITER_SCHEMA_VERSION,
      });
    },
    onSelectionUpdate: ({ editor: current }) => {
      const parent = current.state.selection.$from.parent;
      setActiveScene(findSceneForPosition(current.getJSON() as unknown as WriterDocument, parent.attrs.id));
    },
  });

  const scenes = useMemo(() => deriveScenes(document), [document]);
  const characters = useMemo(() => deriveCharacters(document), [document]);
  const words = useMemo(() => countDocumentWords(document), [document]);

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
        onState: setSaveState,
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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void controllerRef.current?.flush();
      }
      if (event.key === "Escape") setFocusMode(false);
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

  function navigateToScene(id: string) {
    if (!editor) return;
    let position: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "screenplayBlock" && node.attrs.id === id) {
        position = pos + 1;
        return false;
      }
    });
    if (position !== null) {
      editor.chain().focus().setTextSelection(position).scrollIntoView().run();
      setActiveScene(id);
      setMobileSidebar(null);
    }
  }

  return (
    <div className={`writer-workspace ${focusMode ? "writer-workspace--focus" : ""}`}>
      <header className="writer-header">
        <div className="writer-header-brand">
          <Link href="/" aria-label="FILMATTA — Inicio">FILMATTA</Link>
          <span aria-hidden="true" />
          <Link href="/writer">Writer</Link>
        </div>
        <button className="writer-mobile-scenes" type="button" onClick={() => setMobileSidebar("scenes")} aria-expanded={mobileSidebar === "scenes"}>
          Escenas
        </button>
        <button className="writer-mobile-characters" type="button" onClick={() => setMobileSidebar("characters")} aria-expanded={mobileSidebar === "characters"}>
          Personajes
        </button>
        <input
          className="writer-title-input"
          value={title}
          onChange={(event) => updateTitle(event.target.value)}
          onBlur={() => {
            if (!title.trim()) updateTitle("Guion sin título");
          }}
          maxLength={160}
          aria-label="Título del guion"
          disabled={!ready || saveState.status === "tabBlocked"}
        />
        <div className="writer-header-actions">
          <SaveStatus state={saveState} />
          <Link className="writer-timeline-link" href={writerTimelineHref(script.id)}>Timeline</Link>
          <div className="writer-export-wrap">
            <button
              ref={exportButtonRef}
              type="button"
              onClick={() => {
                setContextMenu(null);
                setInsertState(null);
                setExportMenu((open) => !open);
              }}
              aria-expanded={exportMenu}
            >Exportar</button>
            {exportMenu && (
              <div className="writer-export-menu">
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
          <button className="writer-focus-button" type="button" onClick={() => setFocusMode((value) => !value)}>
            {focusMode ? "Salir de enfoque" : "Modo enfoque"}
          </button>
        </div>
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
        <Link className="writer-timeline-mobile-link" href={writerTimelineHref(script.id)}>Timeline</Link>
        <nav aria-label="Escenas del guion">
          <p className="writer-sidebar-heading">Escenas <span>{scenes.length}</span></p>
          {scenes.length ? (
            <ol className="writer-scene-list">
              {scenes.map((scene) => (
                <li key={scene.id}>
                  <button type="button" className={activeScene === scene.id ? "is-active" : ""} onClick={() => navigateToScene(scene.id)}>
                    <span>{scene.order}</span>{scene.title}
                  </button>
                </li>
              ))}
            </ol>
          ) : <p className="writer-sidebar-empty">Añade un encabezado para crear una escena.</p>}
        </nav>
        <WriterCharacterPanel document={document} />
      </aside>

      <main className="writer-editor-area">
        <WriterToolbar
          editor={editor}
          words={words}
          characters={characters.map((item) => item.name)}
          onInsert={(next) => {
            setExportMenu(false);
            setContextMenu(null);
            setInsertState(next);
          }}
        />
        {feedback && <div className="writer-editor-feedback" role="status">{feedback}<button type="button" onClick={() => setFeedback(null)}>Cerrar</button></div>}
        <div className="writer-paper" aria-busy={!ready}>
          {!ready && <div className="writer-loading">Preparando tu guion…</div>}
          <EditorContent editor={editor} />
        </div>
      </main>

      {editor && contextMenu && document.content.some((block) => block.attrs.id === contextMenu.targetId) && (
        <WriterContextMenu
          editor={editor}
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onInsert={(view) => {
            setInsertState({ targetId: contextMenu.targetId, x: contextMenu.x, y: contextMenu.y, view });
            setContextMenu(null);
          }}
        />
      )}
      {editor && insertState && document.content.some((block) => block.attrs.id === insertState.targetId) && (
        <WriterInsertPanel editor={editor} state={insertState} onClose={() => setInsertState(null)} />
      )}

      {saveState.status === "tabBlocked" && (
        <div className="writer-tab-notice" role="alert">
          <div><strong>Abierto en otra pestaña</strong><p>Esta copia permanece protegida y no enviará cambios hasta tomar el control.</p></div>
          <button type="button" onClick={() => leaseRef.current?.takeOver()}>Editar aquí</button>
        </div>
      )}

      {pdfExportOpen && (
        <WriterPdfExportDialog
          initialTitle={title}
          getSnapshot={currentSnapshot}
          returnFocusRef={exportButtonRef}
          onClose={() => setPdfExportOpen(false)}
        />
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

function WriterToolbar({
  editor,
  words,
  characters,
  onInsert,
}: {
  editor: Editor | null;
  words: number;
  characters: string[];
  onInsert: (state: WriterInsertState) => void;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      kind: (current?.getAttributes("screenplayBlock").kind ?? "action") as ScreenplayKind,
      bold: current?.isActive("bold") ?? false,
      italic: current?.isActive("italic") ?? false,
      underline: current?.isActive("underline") ?? false,
      canUndo: current?.can().chain().undo().run() ?? false,
      canRedo: current?.can().chain().redo().run() ?? false,
    }),
  });
  if (!editor || !state) return <div className="writer-toolbar" aria-hidden="true" />;
  const preserveSelection = (event: React.MouseEvent) => event.preventDefault();
  const applyCharacter = (name: string) => {
    editor.chain().focus().selectParentNode().insertContent({
      type: "screenplayBlock",
      attrs: { id: crypto.randomUUID(), kind: "character" },
      content: [{ type: "text", text: name }],
    }).run();
  };
  return (
    <div className="writer-toolbar" role="toolbar" aria-label="Formato del guion">
      <select
        aria-label="Tipo de bloque"
        value={state.kind}
        onChange={(event) => editor.chain().focus().updateAttributes("screenplayBlock", { kind: event.target.value }).run()}
      >
        {SCREENPLAY_KINDS.map((kind) => <option key={kind} value={kind}>{WRITER_KIND_LABELS[kind]}</option>)}
      </select>
      <button
        className="writer-insert-button"
        type="button"
        onMouseDown={preserveSelection}
        onClick={(event) => {
          const target = currentWriterBlock(editor);
          if (!target) return;
          const rect = event.currentTarget.getBoundingClientRect();
          onInsert({ targetId: target.id, x: rect.left, y: rect.bottom + 6, view: "menu" });
        }}
        aria-label="Insertar en el guion"
      >Insertar</button>
      <span className="writer-toolbar-divider" aria-hidden="true" />
      <button type="button" aria-label="Negrita" aria-pressed={state.bold} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></button>
      <button type="button" aria-label="Cursiva" aria-pressed={state.italic} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></button>
      <button type="button" aria-label="Subrayado" aria-pressed={state.underline} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></button>
      <span className="writer-toolbar-divider" aria-hidden="true" />
      <button type="button" onMouseDown={preserveSelection} onClick={() => editor.chain().focus().undo().run()} disabled={!state.canUndo} aria-label="Deshacer">↶</button>
      <button type="button" onMouseDown={preserveSelection} onClick={() => editor.chain().focus().redo().run()} disabled={!state.canRedo} aria-label="Rehacer">↷</button>
      {state.kind === "character" && characters.length > 0 && (
        <div className="writer-character-suggestions" aria-label="Personajes del guion">
          {characters.slice(0, 6).map((name) => <button key={name} type="button" onMouseDown={preserveSelection} onClick={() => applyCharacter(name)}>{name}</button>)}
        </div>
      )}
      <span className="writer-word-count">{words.toLocaleString("es-MX")} palabras</span>
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
  return <span className={`writer-save-status writer-save-status--${state.status}`} title={state.message}>{labels[state.status]}</span>;
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

function downloadText(contents: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

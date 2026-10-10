"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ScreenplayKind } from "@/lib/writer/document";
import type { WriterSkin } from "@/lib/writer/appearance";
import WriterIcon from "./WriterIcon";
import Link from "next/link";

export type WriterApplicationMenuProps = {
  canBack: boolean;
  canForward: boolean;
  hasEditorContext: boolean;
  canUndo: boolean;
  canRedo: boolean;
  leftPanelVisible: boolean;
  assistantVisible: boolean;
  focusMode: boolean;
  timelineVisible: boolean;
  appearance: WriterSkin;
  warmFilter: boolean;
  typewriterSound: boolean;
  onCaptureContext: () => void;
  onBack: () => void;
  onForward: () => void;
  onNew: () => void;
  onImport: () => void;
  onScripts: () => void;
  onVersions: () => void;
  onExport: (format: "pdf" | "json" | "fdx") => void;
  onUndo: () => void;
  onRedo: () => void;
  onSearch: (replace: boolean) => void;
  onInlineFormat: (format: "bold" | "italic" | "underline") => void;
  onInsert: (kind: ScreenplayKind) => void;
  onChangeKind: (kind: ScreenplayKind) => void;
  onAutoFormat: () => void;
  onLeftPanel: () => void;
  onAssistant: () => void;
  onFocus: () => void;
  onTimeline: (view: "timeline" | "pulse" | "ideas") => void;
  onAppearance: (skin: WriterSkin) => void;
  onWarmFilter: () => void;
  onTypewriterSound: () => void;
  onShortcuts: () => void;
  projectNavigation?: { name: string; items: { label: string; href: string; active?: boolean }[] };
};

const KINDS: Array<{ kind: ScreenplayKind; label: string }> = [
  { kind: "sceneHeading", label: "Encabezado de escena" },
  { kind: "action", label: "Acción" },
  { kind: "character", label: "Personaje" },
  { kind: "dialogue", label: "Diálogo" },
  { kind: "parenthetical", label: "Acotación" },
  { kind: "transition", label: "Transición" },
  { kind: "authorNote", label: "Nota" },
];

type MenuName = "file" | "project" | "edit" | "view" | "help";

export default function WriterApplicationMenu(props: WriterApplicationMenuProps) {
  const [open, setOpen] = useState<MenuName | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && (rootRef.current?.contains(event.target) || (event.target as Element).closest?.(".writer-app-submenu-popover"))) return;
      setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(null); return; }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const activeMenu = (document.activeElement as Element | null)?.closest?.('[role="menu"]');
      const items = [...((activeMenu ?? rootRef.current?.querySelector(".writer-app-menu-popover"))?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      if (!items.length) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "ArrowDown" ? (current + 1 + items.length) % items.length : (current - 1 + items.length) % items.length;
      items[next]?.focus();
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  function run(action: () => void) {
    setOpen(null);
    action();
  }

  function toggle(menu: MenuName) {
    props.onCaptureContext();
    setOpen((current) => current === menu ? null : menu);
  }

  return (
    <div ref={rootRef} className="writer-app-menu" aria-label="Menú de aplicación de Writer">
      <div className="writer-app-history" role="group" aria-label="Historial interno">
        <button type="button" aria-label="Atrás en Writer" title="Atrás en Writer" disabled={!props.canBack} onClick={props.onBack}>←</button>
        <button type="button" aria-label="Adelante en Writer" title="Adelante en Writer" disabled={!props.canForward} onClick={props.onForward}>→</button>
      </div>
      <span className="writer-app-menu-divider" aria-hidden="true" />
      <MenuButton label="Archivo" name="file" open={open} onToggle={toggle}>
        <MenuItem onClick={() => run(props.onNew)}>Nuevo guion</MenuItem>
        <MenuItem onClick={() => run(props.onImport)}>Importar guion…</MenuItem>
        <MenuItem onClick={() => run(props.onScripts)}>Mis guiones</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => run(props.onVersions)}>Versiones…</MenuItem>
        <MenuSeparator />
        <MenuGroup label="Exportar">
          <MenuItem onClick={() => run(() => props.onExport("pdf"))}>PDF de guion</MenuItem>
          <MenuItem onClick={() => run(() => props.onExport("fdx"))}>FDX básico</MenuItem>
          <MenuItem onClick={() => run(() => props.onExport("json"))}>Respaldo JSON</MenuItem>
        </MenuGroup>
      </MenuButton>
      {props.projectNavigation && <MenuButton label={props.projectNavigation.name} name="project" open={open} onToggle={toggle}>
        {props.projectNavigation.items.map((item) => <MenuLink key={item.label} href={item.href} current={item.active}>{item.label}</MenuLink>)}
      </MenuButton>}
      <MenuButton label="Editar" name="edit" open={open} onToggle={toggle}>
        <MenuItem disabled={!props.hasEditorContext || !props.canUndo} onClick={() => run(props.onUndo)}>Deshacer</MenuItem>
        <MenuItem disabled={!props.hasEditorContext || !props.canRedo} onClick={() => run(props.onRedo)}>Rehacer</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => run(() => props.onSearch(false))}>Buscar…</MenuItem>
        <MenuItem onClick={() => run(() => props.onSearch(true))}>Buscar y reemplazar…</MenuItem>
        <MenuGroup label="Estilo de texto">
          <MenuItem disabled={!props.hasEditorContext} onClick={() => run(() => props.onInlineFormat("bold"))}>Negrita</MenuItem>
          <MenuItem disabled={!props.hasEditorContext} onClick={() => run(() => props.onInlineFormat("italic"))}>Cursiva</MenuItem>
          <MenuItem disabled={!props.hasEditorContext} onClick={() => run(() => props.onInlineFormat("underline"))}>Subrayado</MenuItem>
        </MenuGroup>
        <MenuGroup label="Insertar">
          {KINDS.map((item) => <MenuItem key={`insert:${item.kind}`} disabled={!props.hasEditorContext} onClick={() => run(() => props.onInsert(item.kind))}>{item.label}</MenuItem>)}
        </MenuGroup>
        <MenuGroup label="Cambiar tipo de bloque">
          {KINDS.map((item) => <MenuItem key={`change:${item.kind}`} disabled={!props.hasEditorContext} onClick={() => run(() => props.onChangeKind(item.kind))}>{item.label}</MenuItem>)}
        </MenuGroup>
        <MenuSeparator />
        <MenuItem onClick={() => run(props.onAutoFormat)}>Formato automático</MenuItem>
      </MenuButton>
      <MenuButton label="Ver" name="view" open={open} onToggle={toggle}>
        <MenuCheck checked={props.leftPanelVisible} onClick={() => run(props.onLeftPanel)}>Escenas y elementos</MenuCheck>
        <MenuCheck checked={props.assistantVisible} onClick={() => run(props.onAssistant)}>Asistente</MenuCheck>
        <MenuCheck checked={props.focusMode} onClick={() => run(props.onFocus)}>Modo Focus</MenuCheck>
        <MenuSeparator />
        <MenuCheck checked={props.timelineVisible} onClick={() => run(() => props.onTimeline("timeline"))}>Timeline</MenuCheck>
        <MenuItem onClick={() => run(() => props.onTimeline("pulse"))}>Narrative Pulse</MenuItem>
        <MenuItem onClick={() => run(() => props.onTimeline("ideas"))}>Ideas</MenuItem>
        <MenuGroup label="Apariencia">
          {(["carbon", "navy", "cream"] as WriterSkin[]).map((skin) => <MenuCheck key={skin} checked={props.appearance === skin} onClick={() => run(() => props.onAppearance(skin))}>{skin === "carbon" ? "Carbon" : skin === "navy" ? "Marino" : "Cream"}</MenuCheck>)}
        </MenuGroup>
        <MenuCheck checked={props.warmFilter} onClick={() => run(props.onWarmFilter)}>Confort visual</MenuCheck>
        <MenuCheck checked={props.typewriterSound} onClick={() => run(props.onTypewriterSound)}>Sonido de máquina de escribir</MenuCheck>
      </MenuButton>
      <MenuButton label="Ayuda" name="help" open={open} onToggle={toggle}>
        <MenuItem onClick={() => run(props.onShortcuts)}>Atajos de teclado</MenuItem>
      </MenuButton>
    </div>
  );
}

function MenuButton({ label, name, open, onToggle, children }: { label: string; name: MenuName; open: MenuName | null; onToggle: (name: MenuName) => void; children: ReactNode }) {
  const expanded = open === name;
  return <div className="writer-app-menu-root"><button className="writer-app-menu-trigger" type="button" aria-haspopup="menu" aria-expanded={expanded} onPointerDown={() => onToggle(name)} onClick={(event) => { event.preventDefault(); if (event.detail === 0) onToggle(name); }}>{label}</button>{expanded && <div className="writer-app-menu-popover" role="menu" aria-label={label}>{children}</div>}</div>;
}

function MenuItem({ children, disabled = false, onClick }: { children: ReactNode; disabled?: boolean; onClick?: () => void }) {
  return <button type="button" role="menuitem" disabled={disabled} onClick={onClick}>{children}</button>;
}

function MenuLink({ children, href, current = false }: { children: ReactNode; href: string; current?: boolean }) {
  return <Link role="menuitem" href={href} aria-current={current ? "page" : undefined}>{children}</Link>;
}

function MenuCheck({ children, checked, onClick }: { children: ReactNode; checked: boolean; onClick: () => void }) {
  return <button type="button" role="menuitemcheckbox" aria-checked={checked} onClick={onClick}><span aria-hidden="true">{checked ? "✓" : ""}</span>{children}</button>;
}

function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 230, maxHeight: 400 });
  const [portalRoot, setPortalRoot] = useState<Element | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const keyboardOpenRef = useRef(false);
  const bindTrigger = useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node;
    setPortalRoot(node?.closest(".writer-workspace") ?? null);
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(230, window.innerWidth - 16);
      const right = rect.right + 4;
      const left = right + width <= window.innerWidth - 8 ? right : rect.left - width - 4 >= 8 ? rect.left - width - 4 : Math.max(8, window.innerWidth - width - 8);
      const height = Math.min(panelRef.current?.scrollHeight ?? 400, window.innerHeight - 16);
      setPosition({ left, top: Math.min(Math.max(8, rect.top), window.innerHeight - height - 8), width, maxHeight: window.innerHeight - 16 });
    };
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" && document.activeElement === triggerRef.current) { event.preventDefault(); panelRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus(); }
      if (event.key !== "Escape" && event.key !== "ArrowLeft") return;
      if (!panelRef.current?.contains(document.activeElement) && document.activeElement !== triggerRef.current) return;
      event.preventDefault(); event.stopPropagation(); setOpen(false); triggerRef.current?.focus();
    };
    update();
    if (keyboardOpenRef.current) panelRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    keyboardOpenRef.current = false;
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", keydown, true);
    return () => { window.removeEventListener("resize", update); document.removeEventListener("scroll", update, true); document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", keydown, true); };
  }, [open]);
  return <div className="writer-app-submenu"><button ref={bindTrigger} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} onKeyDown={(event) => { if (event.key === "ArrowRight") { event.preventDefault(); keyboardOpenRef.current = true; setOpen(true); } }}><span>{label}</span><WriterIcon name="chevronDown" size={13} /></button>{open && portalRoot && createPortal(<div ref={panelRef} className="writer-app-submenu-popover" role="menu" aria-label={label} style={position}>{children}</div>, portalRoot)}</div>;
}

function MenuSeparator() {
  return <span className="writer-app-menu-separator" role="separator" />;
}

"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SHOTLIST_COLUMNS, type ShotlistColumnKey } from "@/lib/shotlist/ux";

type MenuName = "file" | "edit" | "format" | "help";

export default function ShotlistApplicationMenu({
  canBack,
  canForward,
  selectionCount,
  canPaste,
  canUndo,
  canRedo,
  visibleColumns,
  onNew,
  onImport,
  onExport,
  onCopyLink,
  onDuplicate,
  onCopy,
  onPaste,
  onUndo,
  onRedo,
  onDelete,
  onInsertShot,
  onInsertScene,
  onToggleColumn,
  onShortcuts,
  onBack,
  onForward,
}: {
  canBack: boolean;
  canForward: boolean;
  selectionCount: number;
  canPaste: boolean;
  canUndo: boolean;
  canRedo: boolean;
  visibleColumns: ReadonlySet<ShotlistColumnKey>;
  onNew: () => void;
  onImport: () => void;
  onExport: (format: "csv" | "pdf") => void;
  onCopyLink: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onInsertShot: () => void;
  onInsertScene: () => void;
  onToggleColumn: (column: ShotlistColumnKey) => void;
  onShortcuts: () => void;
  onBack: () => void;
  onForward: () => void;
}) {
  const [open, setOpen] = useState<MenuName | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>();

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(260, window.innerWidth - 16);
      const menuHeight = popover.current?.scrollHeight ?? 280;
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const maxHeight = Math.max(96, Math.min(menuHeight, Math.max(below, above)));
      const top = below >= Math.min(menuHeight, 180) || below >= above ? rect.bottom + 4 : Math.max(8, rect.top - maxHeight - 4);
      setPosition({ top: Math.min(top, window.innerHeight - maxHeight - 8), left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width, maxHeight });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && (root.current?.contains(event.target) || popover.current?.contains(event.target))) return;
      setOpen(null);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(null);
        window.requestAnimationFrame(() => trigger.current?.focus());
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = [...(popover.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      if (!items.length) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "ArrowDown" ? (current + 1 + items.length) % items.length : (current - 1 + items.length) % items.length;
      items[next]?.focus();
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", keyboard);
    };
  }, [open]);

  function run(action: () => void) {
    setOpen(null);
    action();
  }

  function toggle(name: MenuName, button: HTMLButtonElement) {
    trigger.current = button;
    const rect = button.getBoundingClientRect();
    const width = Math.min(260, window.innerWidth - 16);
    // Anchor the portal in the same update as the open menu; never reuse the previous menu's coordinates.
    setPosition({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width });
    setOpen((current) => current === name ? null : name);
  }

  return <nav ref={root} className="shotlist-app-menu" aria-label="Menú de aplicación de Shotlist">
    <div className="shotlist-app-history" role="group" aria-label="Historial interno">
      <button type="button" aria-label="Atrás en FILMATTA" title="Atrás en FILMATTA" disabled={!canBack} onClick={onBack}>←</button>
      <button type="button" aria-label="Adelante en FILMATTA" title="Adelante en FILMATTA" disabled={!canForward} onClick={onForward}>→</button>
    </div>
    <span className="shotlist-app-menu-divider" aria-hidden="true" />
    <Menu label="Archivo" name="file" open={open} onToggle={toggle} popoverRef={popover} position={position}>
      <Item onClick={() => run(onNew)}>Nueva shotlist</Item>
      <Item onClick={() => run(onImport)}>Importar…</Item>
      <Separator />
      <Item onClick={() => run(() => onExport("csv"))}>Exportar CSV</Item>
      <Item onClick={() => run(() => onExport("pdf"))}>Exportar PDF</Item>
      <Separator />
      <Item onClick={() => run(onCopyLink)}>Copiar enlace privado</Item>
    </Menu>
    <Menu label="Editar" name="edit" open={open} onToggle={toggle} popoverRef={popover} position={position}>
      <Item disabled={!canUndo} onClick={() => run(onUndo)} shortcut="Ctrl/Cmd+Z">Deshacer</Item>
      <Item disabled={!canRedo} onClick={() => run(onRedo)} shortcut="Ctrl/Cmd+Mayús+Z">Rehacer</Item>
      <Separator />
      <Item disabled={!selectionCount} onClick={() => run(onCopy)} shortcut="Ctrl/Cmd+C">Copiar</Item>
      <Item disabled={!canPaste} reason="Copia planos y elige una escena de destino." onClick={() => run(onPaste)} shortcut="Ctrl/Cmd+V">Pegar</Item>
      <Item disabled={!selectionCount || selectionCount > 50} reason={selectionCount > 50 ? "Duplica hasta 50 planos por operación." : "Selecciona al menos un plano."} onClick={() => run(onDuplicate)}>Duplicar{selectionCount > 1 ? ` (${selectionCount})` : ""}</Item>
      <Separator />
      <Item onClick={() => run(onInsertShot)}>Añadir plano</Item>
      <Item onClick={() => run(onInsertScene)}>Nueva escena…</Item>
      <Separator />
      <Item disabled={!selectionCount || selectionCount > 500} reason={selectionCount > 500 ? "Elimina hasta 500 planos por operación; el borrado es definitivo." : "Selecciona al menos un plano; el borrado es definitivo."} onClick={() => run(onDelete)} shortcut="Delete">Eliminar{selectionCount > 1 ? ` (${selectionCount})` : ""}</Item>
    </Menu>
    <Menu label="Formato" name="format" open={open} onToggle={toggle} popoverRef={popover} position={position}>
      <Group label="Columnas visibles" initiallyOpen>
        {SHOTLIST_COLUMNS.map((column) => <Check key={column.key} checked={visibleColumns.has(column.key)} onClick={() => onToggleColumn(column.key)}>{column.label}</Check>)}
      </Group>
    </Menu>
    <Menu label="Ayuda" name="help" open={open} onToggle={toggle} popoverRef={popover} position={position}>
      <Item onClick={() => run(onShortcuts)}>Atajos y navegación</Item>
      <Separator />
      <Item disabled>Cómo preparar una Shotlist · Próximamente</Item>
      <Item disabled>Importar una Shotlist · Próximamente</Item>
    </Menu>
  </nav>;
}

function Menu({ label, name, open, onToggle, popoverRef, position, children }: { label: string; name: MenuName; open: MenuName | null; onToggle: (name: MenuName, button: HTMLButtonElement) => void; popoverRef: React.RefObject<HTMLDivElement | null>; position?: CSSProperties; children: ReactNode }) {
  const expanded = open === name;
  return <div className="shotlist-app-menu-root"><button type="button" className="shotlist-app-menu-trigger" aria-haspopup="menu" aria-expanded={expanded} onPointerDown={(event) => onToggle(name, event.currentTarget)} onClick={(event) => { event.preventDefault(); if (event.detail === 0) onToggle(name, event.currentTarget); }}>{label}</button>{expanded && createPortal(<div ref={popoverRef} className="shotlist-app-menu-popover is-portal shotlist-scroll" role="menu" aria-label={label} style={position}>{children}</div>, document.body)}</div>;
}

function Item({ children, disabled = false, reason, shortcut, onClick }: { children: ReactNode; disabled?: boolean; reason?: string; shortcut?: string; onClick?: () => void }) {
  const reasonId = useId();
  return <button type="button" role="menuitem" disabled={disabled} title={disabled ? reason : undefined} aria-describedby={disabled && reason ? reasonId : undefined} onClick={onClick}><span className="shotlist-menu-label">{children}</span>{shortcut && <kbd><Shortcut label={shortcut} /></kbd>}{disabled && reason && <span id={reasonId} className="sr-only">{reason}</span>}</button>;
}

function Shortcut({ label }: { label: string }) {
  const modifier = useSyncExternalStore(noSubscribe, () => /Mac|iPhone|iPad/u.test(navigator.userAgent) ? "⌘" : "Ctrl", () => "Ctrl");
  return label.replace("Ctrl/Cmd", modifier);
}

function noSubscribe() { return () => {}; }

function Check({ children, checked, onClick }: { children: ReactNode; checked: boolean; onClick: () => void }) {
  return <button type="button" role="menuitemcheckbox" aria-checked={checked} onClick={onClick}><span aria-hidden="true">{checked ? "✓" : ""}</span>{children}</button>;
}

function Group({ label, children, initiallyOpen = false }: { label: string; children: ReactNode; initiallyOpen?: boolean }) {
  return <details className="shotlist-app-submenu" open={initiallyOpen || undefined}><summary>{label}<span aria-hidden="true">›</span></summary><div>{children}</div></details>;
}

function Separator() {
  return <span className="shotlist-app-menu-separator" role="separator" />;
}

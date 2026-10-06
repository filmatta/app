"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SHOTLIST_COLUMNS, type ShotlistColumnKey } from "@/lib/shotlist/ux";

type MenuName = "file" | "edit" | "format" | "help";

export default function ShotlistApplicationMenu({
  canBack,
  canForward,
  hasSelection,
  visibleColumns,
  onNew,
  onImport,
  onExport,
  onCopyLink,
  onDuplicate,
  onCopy,
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
  hasSelection: boolean;
  visibleColumns: ReadonlySet<ShotlistColumnKey>;
  onNew: () => void;
  onImport: () => void;
  onExport: (format: "csv" | "pdf") => void;
  onCopyLink: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
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

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && root.current?.contains(event.target)) return;
      setOpen(null);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(null);
        window.requestAnimationFrame(() => trigger.current?.focus());
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menu"] button:not(:disabled)') ?? [])];
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
    setOpen((current) => current === name ? null : name);
  }

  return <nav ref={root} className="shotlist-app-menu" aria-label="Menú de aplicación de Shotlist">
    <div className="shotlist-app-history" role="group" aria-label="Historial interno">
      <button type="button" aria-label="Atrás en FILMATTA" title="Atrás en FILMATTA" disabled={!canBack} onClick={onBack}>←</button>
      <button type="button" aria-label="Adelante en FILMATTA" title="Adelante en FILMATTA" disabled={!canForward} onClick={onForward}>→</button>
    </div>
    <span className="shotlist-app-menu-divider" aria-hidden="true" />
    <Menu label="Archivo" name="file" open={open} onToggle={toggle}>
      <Item onClick={() => run(onNew)}>Nueva shotlist</Item>
      <Item onClick={() => run(onImport)}>Importar…</Item>
      <Separator />
      <Group label="Exportar">
        <Item onClick={() => run(() => onExport("csv"))}>CSV</Item>
        <Item onClick={() => run(() => onExport("pdf"))}>PDF horizontal…</Item>
      </Group>
      <Separator />
      <Item onClick={() => run(onCopyLink)}>Copiar enlace privado</Item>
    </Menu>
    <Menu label="Editar" name="edit" open={open} onToggle={toggle}>
      <Item disabled={!hasSelection} onClick={() => run(onDuplicate)}>Duplicar</Item>
      <Item disabled={!hasSelection} onClick={() => run(onCopy)}>Copiar</Item>
      <Item disabled={!hasSelection} onClick={() => run(onDelete)}>Eliminar</Item>
      <Separator />
      <Group label="Insertar">
        <Item onClick={() => run(onInsertShot)}>Plano</Item>
        <Item onClick={() => run(onInsertScene)}>Escena</Item>
      </Group>
      <Separator />
      <Item disabled>Deshacer · No disponible</Item>
      <Item disabled>Rehacer · No disponible</Item>
    </Menu>
    <Menu label="Formato" name="format" open={open} onToggle={toggle}>
      <Group label="Columnas visibles" initiallyOpen>
        {SHOTLIST_COLUMNS.map((column) => <Check key={column.key} checked={visibleColumns.has(column.key)} onClick={() => onToggleColumn(column.key)}>{column.label}</Check>)}
      </Group>
    </Menu>
    <Menu label="Ayuda" name="help" open={open} onToggle={toggle}>
      <Item onClick={() => run(onShortcuts)}>Atajos y navegación</Item>
      <Separator />
      <Item disabled>Cómo preparar una Shotlist · Próximamente</Item>
      <Item disabled>Importar una Shotlist · Próximamente</Item>
    </Menu>
  </nav>;
}

function Menu({ label, name, open, onToggle, children }: { label: string; name: MenuName; open: MenuName | null; onToggle: (name: MenuName, button: HTMLButtonElement) => void; children: ReactNode }) {
  const expanded = open === name;
  return <div className="shotlist-app-menu-root"><button type="button" className="shotlist-app-menu-trigger" aria-haspopup="menu" aria-expanded={expanded} onPointerDown={(event) => onToggle(name, event.currentTarget)} onClick={(event) => { event.preventDefault(); if (event.detail === 0) onToggle(name, event.currentTarget); }}>{label}</button>{expanded && <div className="shotlist-app-menu-popover" role="menu" aria-label={label}>{children}</div>}</div>;
}

function Item({ children, disabled = false, onClick }: { children: ReactNode; disabled?: boolean; onClick?: () => void }) {
  return <button type="button" role="menuitem" disabled={disabled} onClick={onClick}>{children}</button>;
}

function Check({ children, checked, onClick }: { children: ReactNode; checked: boolean; onClick: () => void }) {
  return <button type="button" role="menuitemcheckbox" aria-checked={checked} onClick={onClick}><span aria-hidden="true">{checked ? "✓" : ""}</span>{children}</button>;
}

function Group({ label, children, initiallyOpen = false }: { label: string; children: ReactNode; initiallyOpen?: boolean }) {
  return <details className="shotlist-app-submenu" open={initiallyOpen || undefined}><summary>{label}<span aria-hidden="true">›</span></summary><div>{children}</div></details>;
}

function Separator() {
  return <span className="shotlist-app-menu-separator" role="separator" />;
}

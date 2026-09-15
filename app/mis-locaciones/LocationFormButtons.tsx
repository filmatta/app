"use client";

import { useFormStatus } from "react-dom";
import type { LocationStatus } from "@/lib/locations/form";

type LocationFormButtonsProps =
  | { mode: "create"; currentStatus?: never }
  | { mode: "edit"; currentStatus: LocationStatus };

export default function LocationFormButtons(props: LocationFormButtonsProps) {
  const { pending, data } = useFormStatus();
  const activeIntent = String(data?.get("intent") ?? "");

  if (props.mode === "create") {
    return (
      <div aria-live="polite" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <ActionButton
          value="draft"
          label="Guardar borrador"
          pendingLabel="Guardando…"
          pending={pending}
          activeIntent={activeIntent}
          primary
        />
        <ActionButton
          value="published"
          label="Publicar"
          pendingLabel="Publicando…"
          pending={pending}
          activeIntent={activeIntent}
        />
      </div>
    );
  }

  const { currentStatus } = props;

  if (currentStatus === "published") {
    return (
      <div aria-live="polite" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <ActionButton
          value="preserve"
          label="Guardar cambios"
          pendingLabel="Guardando…"
          pending={pending}
          activeIntent={activeIntent}
          primary
        />
        <ActionButton
          value="draft"
          label="Despublicar"
          pendingLabel="Despublicando…"
          pending={pending}
          activeIntent={activeIntent}
        />
      </div>
    );
  }

  return (
    <div aria-live="polite" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <ActionButton
        value={currentStatus === "archived" ? "preserve" : "draft"}
        label={
          currentStatus === "archived" ? "Guardar archivada" : "Guardar borrador"
        }
        pendingLabel="Guardando…"
        pending={pending}
        activeIntent={activeIntent}
        primary
      />
      {currentStatus === "archived" && (
        <ActionButton
          value="draft"
          label="Reactivar como borrador"
          pendingLabel="Reactivando…"
          pending={pending}
          activeIntent={activeIntent}
        />
      )}
      <ActionButton
        value="published"
        label="Publicar"
        pendingLabel="Publicando…"
        pending={pending}
        activeIntent={activeIntent}
      />
    </div>
  );
}

function ActionButton({
  value,
  label,
  pendingLabel,
  pending,
  activeIntent,
  primary = false,
}: {
  value: "preserve" | "draft" | "published";
  label: string;
  pendingLabel: string;
  pending: boolean;
  activeIntent: string;
  primary?: boolean;
}) {
  return (
    <button
      type="submit"
      name="intent"
      value={value}
      disabled={pending}
      className={
        primary
          ? "rounded-full bg-white px-7 py-3.5 font-semibold text-black transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-60"
          : "rounded-full border border-white/15 px-7 py-3.5 font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-60"
      }
    >
      {pending && activeIntent === value ? pendingLabel : label}
    </button>
  );
}

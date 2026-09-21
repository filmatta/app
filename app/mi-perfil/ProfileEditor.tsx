"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ProfilePortfolio from "@/components/profiles/ProfilePortfolio";
import ProjectPreferencesDialog from "./ProjectPreferencesDialog";
import PrivateContactDialog from "./PrivateContactDialog";
import type { ProjectPreferences } from "@/lib/profiles/project-preferences";
import PortfolioMedia from "@/components/profiles/PortfolioMedia";
import {
  EMPTY_PRESENTATION,
  isTalent,
  profileCompletion,
} from "@/lib/profiles/presentation";
import type { ProfessionalProfile } from "@/lib/profiles/types";
import type { MediaCategory, MediaItem } from "@/lib/profiles/media";
import {
  loadMyPortfolio,
  managePortfolioItem,
  startPortfolioEditing,
} from "./portfolio-actions";
import {
  WorkDialog,
  SectionDialog,
  type EditorState,
} from "./PortfolioDialogs";
import "@/components/profiles/portfolio-editor.css";

export default function ProfileEditor({
  profile,
  displayName,
  initialItems,
  initialPreferences,
}: {
  profile: ProfessionalProfile | null;
  displayName: string;
  initialItems: MediaItem[] | null;
  initialPreferences: ProjectPreferences | null;
}) {
  const [draft, setDraft] = useState<ProfessionalProfile>(
    profile ?? {
      slug: "tu-perfil",
      display_name: displayName,
      disciplines: [],
      city: "",
      bio: "",
      availability: "not_specified",
      skills: [],
      equipment: [],
      portfolio_items: [],
      presentation: { ...EMPTY_PRESENTATION, stage_name: displayName },
      contact_policy: "members_only",
      is_public: false,
      updated_at: "",
    },
  );
  const [items, setItems] = useState(initialItems);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [bioDraft, setBioDraft] = useState(profile?.bio ?? "");
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [dialog, setDialog] = useState<
    { section: string } | { category: MediaCategory; item?: MediaItem } | null
  >(null);
  function accept(v: EditorState) {
    setDraft(v.profile);
    setItems(v.items);
    setMessage(
      v.profile.is_public
        ? "Cambios guardados en tu perfil público."
        : "Cambios guardados en tu borrador privado.",
    );
    setError("");
  }
  const pending =
    items?.some((i) => ["uploading", "processing"].includes(i.status)) ?? false;
  useEffect(() => {
    if (!pending) return;
    let live = true;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadMyPortfolio().then((r) => {
        if (live && "data" in r) {
          setItems(r.data.items);
          setDraft(r.data.profile);
        }
      });
    }, 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [pending]);
  async function begin() {
    if (editing) {
      setEditing(false);
      return;
    }
    if (!profile && !draft.updated_at) {
      setEditing(true);
      setDialog({ section: "identity" });
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await startPortfolioEditing();
      if ("error" in r) setError(r.error);
      else {
        setDraft(r.data.profile);
        setItems(r.data.items);
        setMessage("");
        setEditing(true);
      }
    } catch {
      setError("No pudimos abrir la edición.");
    } finally {
      setBusy(false);
    }
  }
  async function action(item: MediaItem, name: string) {
    if (
      name === "archive" &&
      !window.confirm(
        `¿Archivar «${item.title}»? Dejará de mostrarse. El archivo se conserva; archivar no lo elimina.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (name === "complete-image") {
        const response = await fetch(`/api/portfolio/media/${item.id}/complete`, { method: "POST" });
        if (!response.ok) throw new Error("Image finalization failed");
        const refreshed = await loadMyPortfolio();
        if ("data" in refreshed) accept(refreshed.data);
        else setError(refreshed.error);
        return;
      }
      const r = await managePortfolioItem(item.id, name);
      if ("error" in r) setError(r.error);
      else {
        accept(r.data);
        if (name === "up" || name === "down")
          setMessage(
            `Orden de «${item.title}» actualizado. Los destacados conservan el primer lugar.`,
          );
      }
    } catch {
      setError("No pudimos guardar el cambio.");
    } finally {
      setBusy(false);
    }
  }
  const completion = profileCompletion({
    ...draft,
    portfolio_items:
      items
        ?.filter((i) => i.status === "ready" && i.visibility !== "archived")
        .map((i) => ({
          kind: i.category === "reel" ? "reel" : "project",
          title: i.title,
          url: i.url || `https://app.filmatta.com/perfiles/${draft.slug}`,
        })) ?? draft.portfolio_items,
  });
  const section = (name: string, label: string) =>
    editing ? (
      <div className="pe-edit-sections">
        <button type="button" onClick={() => setDialog({ section: name })}>
          Editar {label}
        </button>
      </div>
    ) : undefined;
  return (
    <div className="pe-shell">
      <div className="pe-toolbar">
        <div>
          <p className="eyebrow">
            MI PERFIL / {draft.is_public ? "Público" : "Borrador privado"}
          </p>
          <small>
            {completion.percent}% completo · sólo tú ves este indicador
          </small>
        </div>
        <div className="pe-tools">
          {draft.is_public && (
            <Link
              className="editorial-secondary"
              href={`/perfiles/${draft.slug}`}
            >
              Ver perfil público ↗
            </Link>
          )}
          <button
            type="button"
            onClick={() => setDialog({ section: "publication" })}
          >
            Publicar
          </button>
          <button
            type="button"
            className="pe-primary"
            onClick={begin}
            disabled={busy}
          >
            {editing ? "Terminar edición" : "Editar perfil"}
          </button>
        </div>
      </div>
      {message && (
        <p role="status" className="pe-message">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="pe-message pe-error">
          {error}
        </p>
      )}
      <ProfilePortfolio
        profile={
          items === null
            ? draft
            : {
                ...draft,
                presentation: {
                  ...draft.presentation,
                  book: draft.presentation.book.filter((b) =>
                    items.some(
                      (i) =>
                        i.category === "book" &&
                        i.url === b.url &&
                        i.visibility === "visible" &&
                        i.status === "ready",
                    ),
                  ),
                },
              }
        }
        preview
        signedIn
        preferences={preferences}
        sectionControls={{
          identity: section("identity", "identidad"),
          about: section("about", "bio"),
          credits: section("credits", "créditos"),
          skills: editing && <div className="pe-professional-actions"><button type="button" onClick={() => setDialog({section:"skills"})}>Editar habilidades / equipo</button><button type="button" onClick={() => setDialog({ section: "preferences" })}>Editar preferencias de proyectos</button><button type="button" onClick={() => setDialog({ section: "contact" })}>Editar datos de contacto</button></div>,
        }}
        media={
          items !== null || editing ? (
            <PortfolioMedia
              items={items ?? []}
              talent={isTalent(draft.disciplines)}
              controls={
                editing
                  ? {
                      add: (category) => {
                        if (!draft.updated_at) {
                          setDialog({ section: "identity" });
                          return;
                        }
                        setDialog({ category });
                      },
                      edit: (item) =>
                        setDialog({ category: item.category, item }),
                      action,
                      busy,
                    }
                  : undefined
              }
            />
          ) : undefined
        }
      />
      {editing && items?.some((i) => i.visibility === "archived") && (
        <details className="pe-archive">
          <summary>Trabajos archivados</summary>
          <p className="pe-hint">
            Restaurar los deja ocultos. Los archivos se conservan hasta 30 días.
          </p>
          <ul>
            {items
              .filter((i) => i.visibility === "archived")
              .map((i) => (
                <li key={i.id}>
                  <span>
                    {i.title}
                    {i.status === "deleted" ? " · archivo eliminado" : ""}
                  </span>
                  <button
                    type="button"
                    disabled={busy || i.status === "deleted"}
                    onClick={() => action(i, "restore")}
                  >
                    Restaurar
                  </button>
                </li>
              ))}
          </ul>
        </details>
      )}
      {dialog &&
        ("section" in dialog ? (dialog.section === "preferences" ? <ProjectPreferencesDialog close={() => setDialog(null)} saved={setPreferences} /> : dialog.section === "contact" ? <PrivateContactDialog close={() => setDialog(null)} /> :
          <SectionDialog
            section={dialog.section}
            profile={draft}
            bioDraft={bioDraft}
            setBioDraft={setBioDraft}
            done={accept}
            close={() => setDialog(null)}
          />
        ) : (
          <WorkDialog
            category={dialog.category}
            item={dialog.item}
            items={items ?? []}
            done={accept}
            close={() => setDialog(null)}
          />
        ))}
    </div>
  );
}

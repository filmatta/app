"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProfilePortfolio from "@/components/profiles/ProfilePortfolio";
import ProjectPreferencesDialog from "./ProjectPreferencesDialog";
import PrivateContactDialog from "./PrivateContactDialog";
import type { ProjectPreferences } from "@/lib/profiles/project-preferences";
import PortfolioMedia from "@/components/profiles/PortfolioMedia";
import { EMPTY_PRESENTATION, isTalent } from "@/lib/profiles/presentation";
import { activationCompletion } from "@/lib/profiles/activation-completion";
import { activationEvent } from "@/lib/profiles/activation-events";
import { minimumProfile } from "@/lib/profiles/activation";
import ProfileTour from "@/components/profiles/ProfileTour";
import "@/components/profiles/activation-owner.css";
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
  completionPreferences,
  startTour = false,
}: {
  profile: ProfessionalProfile | null;
  displayName: string;
  initialItems: MediaItem[] | null;
  initialPreferences: ProjectPreferences | null;
  completionPreferences: ProjectPreferences | null;
  startTour?: boolean;
}) {
  const router = useRouter();
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
  const [privatePreferences, setPrivatePreferences] = useState(
    completionPreferences,
  );
  const [preferences, setPreferences] = useState(initialPreferences);
  const [archiveOpen, setArchiveOpen] = useState(false);
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
        const response = await fetch(
          `/api/portfolio/media/${item.id}/complete`,
          { method: "POST" },
        );
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
  const completion = activationCompletion(draft, items, privatePreferences);
  async function addEmpty(category: MediaCategory) {
    if (!draft.updated_at) {
      router.push("/onboarding/perfil");
      return;
    }
    setBusy(true);
    try {
      const r = await startPortfolioEditing();
      if ("error" in r) setError(r.error);
      else {
        accept(r.data);
        setEditing(true);
        setDialog({ category });
      }
    } catch {
      setError("No pudimos abrir el editor. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }
  function completeSection(key: string) {
    if (!draft.updated_at) {
      router.push("/onboarding/perfil");
      return;
    }
    activationEvent("profile_completion_cta_clicked");
    if (key === "reel" || key === "book") {
      void addEmpty(key);
      return;
    }
    setDialog({
      section: key === "photo" || key === "availability" ? "identity" : key,
    });
  }
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
        </div>
        <div className="pe-tools" data-tour-target="public">
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
        </div>
      </div>
      <section className="activation-owner" aria-label="Completar tu perfil">
        <h2>Perfil {completion.percent}% completo</h2>
        <progress
          aria-label="Completitud del perfil"
          value={completion.percent}
          max={100}
        />
        <p>Un perfil completo ayuda a que otros entiendan mejor tu trabajo.</p>
        <ul>
          {completion.checks
            .filter((c) => !c.done)
            .map((c) => (
              <li key={c.key}>
                <button type="button" onClick={() => completeSection(c.key)}>
                  {c.label} ↗
                </button>
              </li>
            ))}
        </ul>
        <Link
          href="/onboarding/perfil"
          onClick={() => activationEvent("profile_completion_cta_clicked")}
        >
          {minimumProfile(draft)
            ? "Revisar lo esencial"
            : "Completar perfil · continuar paso a paso"}
        </Link>
      </section>
      <ProfileTour autoStart={startTour} />
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
      <div>
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
          editAction={
            <button
              type="button"
              className="p2-contact-button"
              data-tour-target="identity"
              onClick={begin}
              disabled={busy}
            >
              {editing ? "Terminar edición" : "Editar perfil"}
            </button>
          }
          preferences={preferences}
          sectionControls={{
            cover: (
              <div
                className={`activation-cover-owner ${draft.presentation.cover_media_id ? "activation-cover-owner--saved" : ""}`}
              >
                {!draft.presentation.cover_media_id && (
                  <>
                    <h2>Portada de perfil</h2>
                    <p>
                      Agrega una imagen horizontal para personalizar tu perfil.
                    </p>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setDialog({ section: "cover" })}
                >
                  {draft.presentation.cover_media_id
                    ? "Cambiar portada"
                    : "Agregar portada"}
                </button>
              </div>
            ),
            identity: section("identity", "identidad"),
            about: section("about", "bio"),
            credits: draft.presentation.credits.length ? (
              section("credits", "CV")
            ) : (
              <div className="activation-owner-empty" id="credits">
                <h2>Trayectoria</h2>
                <p>
                  Agrega experiencia, proyectos y colaboraciones que cuenten tu
                  recorrido.
                </p>
                <button
                  type="button"
                  onClick={() => completeSection("credits")}
                >
                  Construir CV
                </button>
              </div>
            ),
            skills: editing && (
              <div className="pe-professional-actions">
                <button
                  type="button"
                  onClick={() => setDialog({ section: "skills" })}
                >
                  Editar habilidades / equipo
                </button>
                <button
                  type="button"
                  onClick={() => setDialog({ section: "preferences" })}
                >
                  Editar preferencias de proyectos
                </button>
                <button
                  type="button"
                  onClick={() => setDialog({ section: "contact" })}
                >
                  Editar datos de contacto
                </button>
              </div>
            ),
          }}
          media={
            items !== null || editing || !draft.portfolio_items.length ? (
              <div data-tour-target="media">
                <PortfolioMedia
                  items={items ?? []}
                  talent={isTalent(draft.disciplines)}
                  emptyAdd={addEmpty}
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
              </div>
            ) : undefined
          }
        />
      </div>
      {editing && items?.some((i) => i.visibility === "archived") && (
        <details
          className="pe-archive"
          open={archiveOpen}
          onToggle={(e) => setArchiveOpen(e.currentTarget.open)}
        >
          <summary aria-expanded={archiveOpen}>
            {archiveOpen
              ? "Ocultar trabajos archivados ↑"
              : "Ver trabajos archivados ↓"}
          </summary>
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
        ("section" in dialog ? (
          dialog.section === "preferences" ? (
            <ProjectPreferencesDialog
              close={() => setDialog(null)}
              saved={setPreferences}
              privateSaved={setPrivatePreferences}
            />
          ) : dialog.section === "contact" ? (
            <PrivateContactDialog close={() => setDialog(null)} />
          ) : (
            <SectionDialog
              section={dialog.section}
              profile={draft}
              bioDraft={bioDraft}
              setBioDraft={setBioDraft}
              done={accept}
              close={() => setDialog(null)}
            />
          )
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

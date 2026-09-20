"use client";
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveProfessionalProfile } from "./actions";
import ProfilePortfolio from "@/components/profiles/ProfilePortfolio";
import ShareProfile from "@/components/profiles/ShareProfile";
import {
  AVAILABILITY_LABELS,
  CONTACT_POLICY_LABELS,
  PORTFOLIO_KIND_LABELS,
  PROFILE_DISCIPLINES,
  PROFILE_LIMITS,
} from "@/lib/profiles/constants";
import {
  EMPTY_PRESENTATION,
  isTalent,
  parsePresentation,
  profileCompletion,
} from "@/lib/profiles/presentation";
import type {
  ProfessionalProfile,
  PortfolioItemKind,
} from "@/lib/profiles/types";

export default function ProfileEditor({
  profile,
  displayName,
}: {
  profile: ProfessionalProfile | null;
  displayName: string;
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
      presentation: { ...EMPTY_PRESENTATION },
      contact_policy: "members_only",
      is_public: false,
      updated_at: "",
    },
  );
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const talent = isTalent(draft.disciplines),
    p = draft.presentation;
  const completion = profileCompletion(draft);
  function update<K extends keyof ProfessionalProfile>(
    key: K,
    value: ProfessionalProfile[K],
  ) {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  }
  function presentation<K extends keyof typeof p>(
    key: K,
    value: (typeof p)[K],
  ) {
    update("presentation", { ...p, [key]: value });
  }
  function reorder<T>(items: T[], index: number, direction: number) {
    const copy = [...items];
    [copy[index], copy[index + direction]] = [
      copy[index + direction],
      copy[index],
    ];
    return copy;
  }
  function showPreview() {
    setPreview(true);
    dialog.current?.showModal();
  }
  const previewProfile = {
    ...draft,
    presentation: parsePresentation(p) ?? EMPTY_PRESENTATION,
  };
  return (
    <>
      <div className="profile-editor-overview">
        <div>
          <p className="eyebrow">
            {profile?.is_public ? "Público" : "Borrador privado"}
            {dirty ? " / Cambios sin guardar" : ""}
          </p>
          <h2>Tu trabajo, a tu manera.</h2>
          <p>
            Empieza por lo que quieres mostrar. Puedes guardar y seguir después.
          </p>
        </div>
        <button
          type="button"
          className="editorial-secondary"
          onClick={showPreview}
        >
          Vista previa ↗
        </button>
      </div>
      <div className="profile-completion">
        <div>
          <span>Completitud de la presentación</span>
          <strong>{completion.percent}%</strong>
        </div>
        <progress
          value={completion.percent}
          max={100}
          aria-label="Completitud del perfil"
        />
        <p>
          {completion.checks.filter((c) => c.done).length} de{" "}
          {completion.checks.length} apartados con contenido. No es una
          valoración de tu trabajo.
        </p>
        <div className="profile-checklist">
          {completion.checks.map((c) => (
            <a href={c.href} key={c.label} data-complete={c.done}>
              {c.done ? "✓" : "+"} {c.label}
            </a>
          ))}
        </div>
      </div>
      {profile?.is_public && <ShareProfile slug={profile.slug} />}
      <nav className="profile-editor-nav" aria-label="Secciones del editor">
        {[
          ["material", "Material"],
          ["identity", "Identidad"],
          ["experience", "Experiencia"],
          ["capabilities", "Habilidades"],
          ["publication", "Publicación"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>
      <form action={saveProfessionalProfile} className="profile-editor-form">
        <input
          type="hidden"
          name="portfolio_items"
          value={JSON.stringify(draft.portfolio_items)}
        />
        <input type="hidden" name="presentation" value={JSON.stringify(p)} />
        <section id="material">
          <Heading
            number="01"
            title="Tu material, al frente."
            description="Añade enlaces a tu reel y a tus imágenes. El primer reel será la pieza principal. Hasta 6 piezas y 6 imágenes de book."
          />
          <div className="profile-form-grid">
            <Field label="Retrato · URL de imagen (https)" id="portrait">
              <input
                id="portrait"
                type="url"
                value={p.portrait_url}
                maxLength={500}
                onChange={(e) => presentation("portrait_url", e.target.value)}
                placeholder="https://…/retrato.jpg"
              />
            </Field>
            <p className="profile-field-help">
              Usa un enlace directo y público a una imagen que puedas compartir.
              Para video, añade la URL de YouTube, Vimeo o tu plataforma.
            </p>
          </div>
          <div className="profile-editor-subheading">
            <h3>Reels y trabajos</h3>
            <button
              type="button"
              className="profile-text-link"
              disabled={draft.portfolio_items.length >= 6}
              onClick={() =>
                update("portfolio_items", [
                  ...draft.portfolio_items,
                  { kind: "reel", title: "", url: "", summary: "" },
                ])
              }
            >
              + Añadir pieza
            </button>
          </div>
          {!draft.portfolio_items.length && (
            <p className="profile-editor-empty">
              Empieza con una pieza que muestre tu forma de trabajar.
            </p>
          )}
          {draft.portfolio_items.map((item, index) => (
            <fieldset className="profile-edit-item" key={index}>
              <legend>
                Pieza {index + 1}
                {item.kind === "reel" &&
                draft.portfolio_items.findIndex((i) => i.kind === "reel") ===
                  index
                  ? " / Reel principal"
                  : ""}
              </legend>
              <div className="profile-form-grid">
                <Field label="Tipo" id={`kind-${index}`}>
                  <select
                    id={`kind-${index}`}
                    value={item.kind}
                    onChange={(e) =>
                      update(
                        "portfolio_items",
                        draft.portfolio_items.map((v, i) =>
                          i === index
                            ? {
                                ...v,
                                kind: e.target.value as PortfolioItemKind,
                              }
                            : v,
                        ),
                      )
                    }
                  >
                    {Object.entries(PORTFOLIO_KIND_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Título" id={`title-${index}`}>
                  <input
                    id={`title-${index}`}
                    required
                    maxLength={80}
                    value={item.title}
                    onChange={(e) =>
                      update(
                        "portfolio_items",
                        draft.portfolio_items.map((v, i) =>
                          i === index ? { ...v, title: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="URL del trabajo" id={`url-${index}`}>
                  <input
                    id={`url-${index}`}
                    type="url"
                    required
                    maxLength={500}
                    value={item.url}
                    onChange={(e) =>
                      update(
                        "portfolio_items",
                        draft.portfolio_items.map((v, i) =>
                          i === index ? { ...v, url: e.target.value } : v,
                        ),
                      )
                    }
                    placeholder="https://"
                  />
                </Field>
                <Field
                  label="Tu participación / contexto"
                  id={`summary-${index}`}
                >
                  <input
                    id={`summary-${index}`}
                    maxLength={180}
                    value={item.summary ?? ""}
                    onChange={(e) =>
                      update(
                        "portfolio_items",
                        draft.portfolio_items.map((v, i) =>
                          i === index ? { ...v, summary: e.target.value } : v,
                        ),
                      )
                    }
                    placeholder="Dirección de fotografía · Cortometraje · 2026"
                  />
                </Field>
              </div>
              <ItemActions
                label={`pieza ${index + 1}`}
                index={index}
                length={draft.portfolio_items.length}
                move={(direction) =>
                  update(
                    "portfolio_items",
                    reorder(draft.portfolio_items, index, direction),
                  )
                }
                remove={() =>
                  update(
                    "portfolio_items",
                    draft.portfolio_items.filter((_, i) => i !== index),
                  )
                }
              />
            </fieldset>
          ))}
          <div className="profile-editor-subheading">
            <h3>{talent ? "Book" : "Imágenes de tu trabajo"}</h3>
            <button
              type="button"
              className="profile-text-link"
              disabled={p.book.length >= 6}
              onClick={() =>
                presentation("book", [...p.book, { url: "", caption: "" }])
              }
            >
              + Añadir imagen
            </button>
          </div>
          {p.book.map((item, index) => (
            <fieldset className="profile-edit-item" key={index}>
              <legend>Imagen {index + 1}</legend>
              <div className="profile-form-grid">
                <Field label="URL de imagen (https)" id={`book-${index}`}>
                  <input
                    id={`book-${index}`}
                    type="url"
                    required
                    maxLength={500}
                    value={item.url}
                    onChange={(e) =>
                      presentation(
                        "book",
                        p.book.map((v, i) =>
                          i === index ? { ...v, url: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </Field>
                <Field
                  label="Pie de foto / descripción"
                  id={`caption-${index}`}
                >
                  <input
                    id={`caption-${index}`}
                    maxLength={120}
                    value={item.caption}
                    onChange={(e) =>
                      presentation(
                        "book",
                        p.book.map((v, i) =>
                          i === index ? { ...v, caption: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </Field>
              </div>
              <ItemActions
                label={`imagen ${index + 1}`}
                index={index}
                length={p.book.length}
                move={(direction) =>
                  presentation("book", reorder(p.book, index, direction))
                }
                remove={() =>
                  presentation(
                    "book",
                    p.book.filter((_, i) => i !== index),
                  )
                }
              />
            </fieldset>
          ))}
        </section>
        <section id="identity">
          <Heading
            number="02"
            title="Una identidad. Varias disciplinas."
            description="Elige hasta 5 disciplinas. Actuación y Modelaje también muestran tu perfil en Talento."
          />
          <fieldset className="profile-discipline-options">
            <legend className="sr-only">Disciplinas</legend>
            {Array.from(
              new Set([...PROFILE_DISCIPLINES, ...draft.disciplines]),
            ).map((d) => (
              <label key={d}>
                <input
                  name="disciplines"
                  value={d}
                  type="checkbox"
                  checked={draft.disciplines.includes(d)}
                  disabled={
                    !draft.disciplines.includes(d) &&
                    draft.disciplines.length >= 5
                  }
                  onChange={(e) =>
                    update(
                      "disciplines",
                      e.target.checked
                        ? [...draft.disciplines, d]
                        : draft.disciplines.filter((v) => v !== d),
                    )
                  }
                />
                {d}
              </label>
            ))}
          </fieldset>
          <div className="profile-form-grid">
            <Field label="Alias artístico (opcional)" id="stage-name">
              <input
                id="stage-name"
                value={p.stage_name}
                maxLength={80}
                onChange={(e) => presentation("stage_name", e.target.value)}
              />
            </Field>
            <Field label="Ciudad" id="city">
              <input
                id="city"
                name="city"
                value={draft.city ?? ""}
                maxLength={80}
                onChange={(e) => update("city", e.target.value)}
                placeholder="Guadalajara"
              />
            </Field>
            <Field label="Zona de trabajo aproximada (opcional)" id="work-area">
              <input
                id="work-area"
                value={p.work_area}
                maxLength={80}
                onChange={(e) => presentation("work_area", e.target.value)}
                placeholder="Zona Poniente · No incluyas tu dirección"
              />
            </Field>
            <Field label="Disponibilidad" id="availability">
              <select
                id="availability"
                name="availability"
                value={draft.availability}
                onChange={(e) =>
                  update(
                    "availability",
                    e.target.value as ProfessionalProfile["availability"],
                  )
                }
              >
                {Object.entries(AVAILABILITY_LABELS).map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Sobre mí" id="bio">
            <textarea
              id="bio"
              name="bio"
              rows={5}
              maxLength={PROFILE_LIMITS.bio}
              value={draft.bio ?? ""}
              onChange={(e) => update("bio", e.target.value)}
              placeholder="Tu enfoque, tu práctica y las historias que te interesa contar."
            />
          </Field>
        </section>
        <section id="experience">
          <Heading
            number="03"
            title="Experiencia con contexto."
            description="Selecciona hasta 12 créditos. Incluye proyecto, participación y año; no hace falta contar toda tu trayectoria."
          />
          {p.credits.map((c, index) => (
            <fieldset className="profile-edit-item" key={index}>
              <legend>Crédito {index + 1}</legend>
              <div className="profile-form-grid">
                {(["title", "role", "year"] as const).map((key) => (
                  <Field
                    key={key}
                    label={
                      key === "title"
                        ? "Proyecto / producción"
                        : key === "role"
                          ? "Participación"
                          : "Año (opcional)"
                    }
                    id={`credit-${key}-${index}`}
                  >
                    <input
                      id={`credit-${key}-${index}`}
                      required={key !== "year"}
                      maxLength={
                        key === "year" ? 4 : key === "title" ? 100 : 80
                      }
                      inputMode={key === "year" ? "numeric" : undefined}
                      pattern={key === "year" ? "(19|20)[0-9]{2}" : undefined}
                      value={c[key]}
                      onChange={(e) =>
                        presentation(
                          "credits",
                          p.credits.map((v, i) =>
                            i === index ? { ...v, [key]: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </Field>
                ))}
              </div>
              <ItemActions
                label={`crédito ${index + 1}`}
                index={index}
                length={p.credits.length}
                move={(direction) =>
                  presentation("credits", reorder(p.credits, index, direction))
                }
                remove={() =>
                  presentation(
                    "credits",
                    p.credits.filter((_, i) => i !== index),
                  )
                }
              />
            </fieldset>
          ))}
          <button
            type="button"
            className="profile-text-link"
            disabled={p.credits.length >= 12}
            onClick={() =>
              presentation("credits", [
                ...p.credits,
                { title: "", role: "", year: "" },
              ])
            }
          >
            + Añadir crédito
          </button>
        </section>
        <section id="capabilities">
          <Heading
            number="04"
            title={
              talent
                ? "Lo que aportas a escena."
                : "Habilidades y herramientas."
            }
            description="Separa cada elemento con una coma. Incluye sólo lo que aporta contexto a tu trabajo."
          />
          <div className="profile-form-grid">
            <Field label="Habilidades (hasta 12)" id="skills">
              <input
                id="skills"
                name="skills"
                defaultValue={draft.skills.join(", ")}
                onChange={(e) =>
                  update(
                    "skills",
                    e.target.value
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean),
                  )
                }
                placeholder={
                  talent
                    ? "Inglés, danza, improvisación"
                    : "Iluminación, DaVinci Resolve, inglés"
                }
              />
            </Field>
            <Field
              label="Equipo y sistemas (hasta 10, opcional)"
              id="equipment"
            >
              <input
                id="equipment"
                name="equipment"
                defaultValue={draft.equipment.join(", ")}
                onChange={(e) =>
                  update(
                    "equipment",
                    e.target.value
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean),
                  )
                }
                placeholder="Sony FX6, Aputure 600D"
              />
            </Field>
            <Field label="Rango orientativo (opcional)" id="rate">
              <input
                id="rate"
                maxLength={100}
                value={p.rate_range}
                onChange={(e) => presentation("rate_range", e.target.value)}
                placeholder="MXN 4,000–6,000 / jornada, según proyecto"
              />
            </Field>
          </div>
        </section>
        <section id="publication">
          <Heading
            number="05"
            title="Tú eliges cuándo compartir."
            description="Los campos de este editor serán públicos al publicar. No incluyas correo, teléfono ni dirección exacta en tu bio, enlaces o imágenes."
          />
          <Field label="Quién puede solicitar contacto" id="contact-policy">
            <select
              id="contact-policy"
              name="contact_policy"
              value={draft.contact_policy}
              onChange={(e) =>
                update(
                  "contact_policy",
                  e.target.value as ProfessionalProfile["contact_policy"],
                )
              }
            >
              {Object.entries(CONTACT_POLICY_LABELS).map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <p className="profile-field-help">
            Conservamos tu preferencia. Las solicitudes entre perfiles aún no
            están habilitadas.
          </p>
          <label className="profile-publish-toggle">
            <input
              type="checkbox"
              name="is_public"
              checked={draft.is_public}
              onChange={(e) => update("is_public", e.target.checked)}
            />
            <span>
              <strong>Publicar mi perfil</strong>
              <span>
                Visible por enlace y en los catálogos. Desactívalo y guarda para
                volver a borrador.
              </span>
            </span>
          </label>
        </section>
        <div className="profile-save-bar">
          <p>
            {dirty
              ? "Cambios sin guardar"
              : profile?.is_public
                ? "Perfil público"
                : "Borrador privado"}
            <span>
              {draft.is_public
                ? "Se guardará público"
                : "Se guardará como borrador"}
            </span>
          </p>
          <div>
            <button
              type="button"
              className="profile-text-link"
              onClick={showPreview}
            >
              Vista previa
            </button>
            <SaveButton />
          </div>
        </div>
      </form>
      <dialog
        ref={dialog}
        className="profile-preview-dialog"
        onClose={() => setPreview(false)}
      >
        <div className="profile-preview-toolbar">
          <span>Vista previa privada · cambios sin publicar</span>
          <button
            type="button"
            autoFocus
            onClick={() => dialog.current?.close()}
            aria-label="Cerrar vista previa"
          >
            Cerrar ✕
          </button>
        </div>
        {preview && (
          <div className="editorial-page profiles-page">
            <div className="editorial-container">
              <ProfilePortfolio profile={previewProfile} preview />
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="editorial-primary" disabled={pending}>
      {pending ? "Guardando…" : "Guardar perfil"}
    </button>
  );
}
function Heading({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="profile-form-heading">
      <p className="eyebrow">{number} / Mi perfil</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="profile-field">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}
function ItemActions({
  label,
  index,
  length,
  move,
  remove,
}: {
  label: string;
  index: number;
  length: number;
  move: (direction: number) => void;
  remove: () => void;
}) {
  return (
    <div className="profile-item-actions">
      <button
        type="button"
        disabled={index === 0}
        aria-label={`Subir ${label}`}
        onClick={() => move(-1)}
      >
        ↑ Subir
      </button>
      <button
        type="button"
        disabled={index === length - 1}
        aria-label={`Bajar ${label}`}
        onClick={() => move(1)}
      >
        ↓ Bajar
      </button>
      <button type="button" aria-label={`Quitar ${label}`} onClick={remove}>
        Quitar
      </button>
    </div>
  );
}

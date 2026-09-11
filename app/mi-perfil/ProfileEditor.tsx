"use client";

import { useState } from "react";
import { saveProfessionalProfile } from "@/app/mi-perfil/actions";
import {
  AVAILABILITY_LABELS,
  CONTACT_POLICY_LABELS,
  PORTFOLIO_KIND_LABELS,
  PROFILE_DISCIPLINES,
  PROFILE_LIMITS,
} from "@/lib/profiles/constants";
import type {
  PortfolioItem,
  PortfolioItemKind,
  ProfessionalProfile,
} from "@/lib/profiles/types";

type EditableProfile = ProfessionalProfile | null;

export default function ProfileEditor({ profile }: { profile: EditableProfile }) {
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>(
    profile?.portfolio_items ?? []
  );

  function addPortfolioItem() {
    if (portfolioItems.length >= PROFILE_LIMITS.portfolioItems) {
      return;
    }

    setPortfolioItems((current) => [
      ...current,
      { kind: "project", title: "", url: "", summary: "" },
    ]);
  }

  function updatePortfolioItem(
    index: number,
    field: keyof PortfolioItem,
    value: string
  ) {
    setPortfolioItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  }

  function removePortfolioItem(index: number) {
    setPortfolioItems((current) =>
      current.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  return (
    <form action={saveProfessionalProfile} className="mt-10 space-y-14">
      <section aria-labelledby="identity-heading" className={sectionClass}>
        <SectionHeading
          eyebrow="Identidad profesional"
          id="identity-heading"
          title="Qué haces"
          description={`Selecciona hasta ${PROFILE_LIMITS.disciplines} disciplinas. Puedes tener varias dentro del mismo perfil.`}
        />

        <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <legend className="sr-only">Disciplinas</legend>
          {PROFILE_DISCIPLINES.map((discipline) => (
            <label
              key={discipline}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70 transition hover:border-white/20 has-checked:border-white/35 has-checked:bg-white/[0.07] has-checked:text-white"
            >
              <input
                type="checkbox"
                name="disciplines"
                value={discipline}
                defaultChecked={profile?.disciplines.includes(discipline)}
                className="size-4 accent-white"
              />
              {discipline}
            </label>
          ))}
        </fieldset>
      </section>

      <section aria-labelledby="about-heading" className={sectionClass}>
        <SectionHeading
          eyebrow="Presentación"
          id="about-heading"
          title="Sobre ti"
          description="Comparte lo necesario para entender tu trabajo. Tu nombre completo, correo y teléfono permanecen privados."
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Ciudad" htmlFor="city">
            <input
              id="city"
              name="city"
              type="text"
              maxLength={PROFILE_LIMITS.city}
              defaultValue={profile?.city ?? ""}
              placeholder="Ciudad de México"
              className={inputClass}
            />
          </Field>

          <Field label="Disponibilidad" htmlFor="availability">
            <select
              id="availability"
              name="availability"
              defaultValue={profile?.availability ?? "not_specified"}
              className={inputClass}
            >
              {Object.entries(AVAILABILITY_LABELS).map(([value, label]) => (
                <option key={value} value={value} className="bg-[#111]">
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Bio" htmlFor="bio">
          <textarea
            id="bio"
            name="bio"
            rows={7}
            maxLength={PROFILE_LIMITS.bio}
            defaultValue={profile?.bio ?? ""}
            placeholder="Cuenta brevemente qué haces, tu enfoque y el tipo de proyectos en los que trabajas."
            className={inputClass}
          />
        </Field>
      </section>

      <section aria-labelledby="capabilities-heading" className={sectionClass}>
        <SectionHeading
          eyebrow="Capacidades"
          id="capabilities-heading"
          title="Skills y equipo"
          description="Añade sólo lo relevante para tu práctica. Separa cada elemento con una coma o un salto de línea."
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Skills" htmlFor="skills">
            <textarea
              id="skills"
              name="skills"
              rows={6}
              defaultValue={profile?.skills.join("\n") ?? ""}
              placeholder={"DaVinci Resolve\nOperación de gimbal\nInglés"}
              className={inputClass}
            />
          </Field>

          <Field label="Equipo o sistemas que dominas" htmlFor="equipment">
            <textarea
              id="equipment"
              name="equipment"
              rows={6}
              defaultValue={profile?.equipment.join("\n") ?? ""}
              placeholder={"ARRI Alexa Mini LF\nSony FX6\nAputure 600D"}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section aria-labelledby="portfolio-heading" className={sectionClass}>
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <SectionHeading
            eyebrow="Trabajo"
            id="portfolio-heading"
            title="Reels y portafolio"
            description="Enlaza piezas ya publicadas. FILMATTA no copia ni procesa tus videos en esta versión."
          />
          <button
            type="button"
            onClick={addPortfolioItem}
            disabled={portfolioItems.length >= PROFILE_LIMITS.portfolioItems}
            className="w-fit shrink-0 rounded-full border border-white/15 px-5 py-3 text-sm font-medium transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35"
          >
            Añadir enlace
          </button>
        </div>

        <input
          type="hidden"
          name="portfolio_items"
          value={JSON.stringify(portfolioItems)}
        />

        {portfolioItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 px-6 py-10 text-center text-sm text-white/35">
            Aún no has añadido reels, proyectos o enlaces.
          </div>
        ) : (
          <div className="space-y-4">
            {portfolioItems.map((item, index) => (
              <div
                key={index}
                className="grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-5 md:grid-cols-[10rem_minmax(0,1fr)_auto]"
              >
                <Field label="Tipo" htmlFor={`portfolio-kind-${index}`}>
                  <select
                    id={`portfolio-kind-${index}`}
                    value={item.kind}
                    onChange={(event) =>
                      updatePortfolioItem(
                        index,
                        "kind",
                        event.target.value as PortfolioItemKind
                      )
                    }
                    className={inputClass}
                  >
                    {Object.entries(PORTFOLIO_KIND_LABELS).map(
                      ([value, label]) => (
                        <option key={value} value={value} className="bg-[#111]">
                          {label}
                        </option>
                      )
                    )}
                  </select>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Título" htmlFor={`portfolio-title-${index}`}>
                    <input
                      id={`portfolio-title-${index}`}
                      value={item.title}
                      maxLength={PROFILE_LIMITS.itemTitle}
                      required
                      onChange={(event) =>
                        updatePortfolioItem(index, "title", event.target.value)
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="URL" htmlFor={`portfolio-url-${index}`}>
                    <input
                      id={`portfolio-url-${index}`}
                      value={item.url}
                      maxLength={PROFILE_LIMITS.itemUrl}
                      type="url"
                      inputMode="url"
                      required
                      placeholder="https://"
                      onChange={(event) =>
                        updatePortfolioItem(index, "url", event.target.value)
                      }
                      className={inputClass}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field
                      label="Descripción breve (opcional)"
                      htmlFor={`portfolio-summary-${index}`}
                    >
                      <input
                        id={`portfolio-summary-${index}`}
                        value={item.summary ?? ""}
                        maxLength={PROFILE_LIMITS.itemSummary}
                        onChange={(event) =>
                          updatePortfolioItem(index, "summary", event.target.value)
                        }
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removePortfolioItem(index)}
                  className="h-fit text-left text-sm text-red-300/70 transition hover:text-red-200 md:mt-9"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="privacy-heading" className={sectionClass}>
        <SectionHeading
          eyebrow="Privacidad"
          id="privacy-heading"
          title="Publicación y contacto"
          description="El perfil público usa tu primer nombre y la inicial de tu último apellido. Nunca muestra tu correo, teléfono ni nombre completo."
        />

        <Field label="Quién puede solicitar contacto" htmlFor="contact_policy">
          <select
            id="contact_policy"
            name="contact_policy"
            defaultValue={profile?.contact_policy ?? "members_only"}
            className={inputClass}
          >
            {Object.entries(CONTACT_POLICY_LABELS).map(([value, label]) => (
              <option key={value} value={value} className="bg-[#111]">
                {label}
              </option>
            ))}
          </select>
        </Field>

        <label className="flex cursor-pointer gap-4 rounded-2xl border border-white/10 bg-black/20 p-5">
          <input
            type="checkbox"
            name="is_public"
            defaultChecked={profile?.is_public ?? false}
            className="mt-1 size-4 shrink-0 accent-white"
          />
          <span>
            <span className="block font-medium">Publicar mi perfil</span>
            <span className="mt-1 block text-sm leading-6 text-white/40">
              Cualquier persona con el enlace podrá ver la versión abreviada y
              profesional. Puedes volver a borrador cuando quieras.
            </span>
          </span>
        </label>
      </section>

      <div className="sticky bottom-4 z-10 flex flex-col items-center justify-between gap-4 rounded-2xl border border-white/15 bg-[#111]/95 p-4 shadow-2xl backdrop-blur sm:flex-row sm:px-6">
        <p className="text-sm text-white/45">
          {profile ? "Actualiza tu página pública." : "Crea tu primer perfil profesional."}
        </p>
        <button
          type="submit"
          className="w-full rounded-full bg-white px-7 py-3.5 font-semibold text-black transition hover:bg-white/85 sm:w-auto"
        >
          Guardar perfil
        </button>
      </div>
    </form>
  );
}

function SectionHeading({
  eyebrow,
  id,
  title,
  description,
}: {
  eyebrow: string;
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/30">
        {eyebrow}
      </p>
      <h2 id={id} className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
      <p className="mt-3 leading-7 text-white/40">{description}</p>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm text-white/60">
        {label}
      </label>
      {children}
    </div>
  );
}

const sectionClass =
  "space-y-7 rounded-3xl border border-white/10 bg-white/[0.025] p-6 sm:p-8";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3.5 text-white outline-none transition placeholder:text-white/20 focus:border-white/30";

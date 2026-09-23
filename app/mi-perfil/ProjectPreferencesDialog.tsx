"use client";
import FilmattaAccordion from "@/components/ui/FilmattaAccordion";
import SelectionRow from "@/components/ui/SelectionRow";
import StatusBadge from "@/components/ui/StatusBadge";
import ProfileDetailIcon from "@/components/profiles/ProfileDetailIcon";
import { useEffect, useState } from "react";
import { EditorDialog } from "./PortfolioDialogs";
import {
  loadProjectPreferences,
  saveProjectPreferences,
} from "./preference-actions";
import {
  PROJECT_FORMATS,
  PROFILE_PREFERENCE_CATEGORIES,
  PREFERENCE_CHOICES,
  preferenceCategoryCount,
  type ProjectPreferences,
  type PreferenceChoice,
} from "@/lib/profiles/project-preferences";
export default function ProjectPreferencesDialog({
  close,
  saved,
  privateSaved,
}: {
  close: () => void;
  saved: (value: ProjectPreferences | null) => void;
  privateSaved?: (value: ProjectPreferences) => void;
}) {
  const [value, setValue] = useState<ProjectPreferences | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    void loadProjectPreferences()
      .then((r) => {
        if (!live) return;
        if (r.data) {
          setValue(r.data);
        } else setError(r.error ?? "No pudimos cargar las preferencias.");
      })
      .catch(() => {
        if (live) setError("No pudimos cargar las preferencias.");
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <EditorDialog title="Preferencias de proyectos" close={close} busy={busy}>
      <p className="pe-hint">
        Las preferencias que configures se mostrarán en tu perfil público. Deja sin especificar aquellas que no quieras mostrar.
        Trabajar técnicamente en una producción no significa representar
        personalmente sus escenas.
      </p>
      <p className="bio-contact-warning">
        Estas preferencias no constituyen consentimiento definitivo ni acreditan
        capacitación. Cada escena, condición, límites y medidas de seguridad se
        acuerdan por separado.
      </p>
      {value && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            setMessage("");
            try {
              const result = await saveProjectPreferences(value);
              if (result.error) setError(result.error);
              else {
                setMessage("Preferencias guardadas en tu perfil.");
                saved(value);
                privateSaved?.(value);
              }
            } catch {
              setError("No pudimos guardar tus preferencias.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {PROFILE_PREFERENCE_CATEGORIES.map((category) => (
            <FilmattaAccordion
              key={category.key}
              title={category.title}
              icon={<ProfileDetailIcon kind={category.icon} />}
              summary={`${preferenceCategoryCount(category, value)} respondidas`}
              closedLabel="Ver opciones"
              openLabel="Ocultar opciones"
            >
              {category.format ? <>
                <SelectionRow checked={value.open_formats} onChange={(e) => setValue({ ...value, open_formats: e.target.checked })}>Abierto a distintos formatos</SelectionRow>
                <p className="pe-hint">Esta opción sólo afecta formatos; no acepta escenas ni condiciones.</p>
                <div className="selection-grid">{PROJECT_FORMATS.map((format) => <SelectionRow key={format} checked={value.formats.includes(format)} onChange={(e) => setValue({ ...value, formats: e.target.checked ? [...value.formats, format] : value.formats.filter((item) => item !== format) })}>{format}</SelectionRow>)}</div>
              </> : category.sections.map((section, index) => <section className="preference-subgroup" key={section.title ?? index}>
                {section.title && <h3>{section.title}</h3>}
                <div className="preference-options-grid">{section.options.map((item) => {
                  const choice = value[item.group][item.key] ?? "unspecified";
                  return <label className="preference-choice" key={item.key}>
                    <span>{item.label}</span>
                    <StatusBadge tone={choice === "accept" ? "success" : choice === "consult" ? "warning" : choice === "decline" ? "danger" : "neutral"}>{PREFERENCE_CHOICES[choice]}</StatusBadge>
                    <select aria-label={item.label} value={choice} onChange={(e) => setValue({ ...value, [item.group]: { ...value[item.group], [item.key]: e.target.value as PreferenceChoice } })}>
                      {Object.entries(PREFERENCE_CHOICES).map(([choiceValue, label]) => <option value={choiceValue} key={choiceValue}>{label}</option>)}
                    </select>
                  </label>;
                })}</div>
              </section>)}
              {category.help && <p className="pe-hint">{category.help}</p>}
            </FilmattaAccordion>
          ))}
          <footer>
            <button type="button" onClick={close} disabled={busy}>
              Cerrar
            </button>
            <button type="submit" disabled={busy} className="pe-primary">
              {busy ? "Guardando…" : "Guardar preferencias"}
            </button>
          </footer>
        </form>
      )}
      {!value && !error && <p role="status">Cargando preferencias…</p>}
      {error && (
        <p className="pe-error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </EditorDialog>
  );
}

import FilmattaAccordion from "@/components/ui/FilmattaAccordion";
import StatusBadge from "@/components/ui/StatusBadge";
import { MetaChips } from "@/components/ui/MetaChip";
import {
  PROFILE_PREFERENCE_CATEGORIES,
  preferenceCategoryCount,
  type PreferenceChoice,
  type ProjectPreferences,
} from "@/lib/profiles/project-preferences";
import ProfileDetailIcon from "./ProfileDetailIcon";

const states: Record<Exclude<PreferenceChoice, "unspecified">, string> = {
  accept: "Sí ✓",
  consult: "Consultar ?",
  decline: "No ×",
};

export default function ProfileProjectPreferences({ value }: { value: ProjectPreferences | null }) {
  if (!value) return null;
  const visible = PROFILE_PREFERENCE_CATEGORIES.filter(
    (category) => preferenceCategoryCount(category, value) > 0,
  );
  if (!visible.length) return null;
  return <section className="p2-foundation-box p2-preferences" id="project-preferences">
    <h2>Preferencias de proyectos</h2>
    {visible.map((category) => <FilmattaAccordion
      key={category.key}
      title={category.title}
      icon={<ProfileDetailIcon kind={category.icon} />}
      summary={`${preferenceCategoryCount(category, value)} mostradas`}
      closedLabel="Ver preferencias"
      openLabel="Ocultar preferencias"
    >
      {category.format ? <>
        {value.open_formats && <p className="p2-preference-formats"><ProfileDetailIcon kind="formats" />Abierto a distintos formatos</p>}
        <MetaChips labels={value.formats} limit={PROJECT_FORMAT_LIMIT} />
      </> : category.sections.map((section, index) => {
        const entries = section.options.filter((item) => value[item.group][item.key] && value[item.group][item.key] !== "unspecified");
        return entries.length ? <section className="p2-preference-group" key={section.title ?? index}>
          {section.title && <h3>{section.title}</h3>}
          <ul>{entries.map((item) => {
            const choice = value[item.group][item.key] as Exclude<PreferenceChoice, "unspecified">;
            return <li key={item.key}><span>{item.label}</span><StatusBadge tone={choice === "accept" ? "success" : choice === "consult" ? "warning" : "danger"}>{states[choice]}</StatusBadge></li>;
          })}</ul>
        </section> : null;
      })}
      {category.help && <p className="p2-preference-help">{category.help}</p>}
    </FilmattaAccordion>)}
    <small>Preferencias publicadas por el profesional. Cada proyecto, escena y condición se acuerda por separado.</small>
  </section>;
}

const PROJECT_FORMAT_LIMIT = 12;

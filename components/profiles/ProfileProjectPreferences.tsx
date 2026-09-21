import { PREFERENCE_GROUPS, type ProjectPreferences } from "@/lib/profiles/project-preferences";
import ProfileDetailIcon from "./ProfileDetailIcon";
export default function ProfileProjectPreferences({ value }: { value: ProjectPreferences | null }) {
  if (!value) return null;
  const states = { accept: "Sí ✓", consult: "Consultar ?", decline: "No ×" };
  return <section className="p2-foundation-box" id="project-preferences"><h2>Preferencias de proyectos</h2>
    {(value.open_formats || value.formats.length>0) && <p className="p2-preference-formats"><ProfileDetailIcon kind="formats" />{value.open_formats ? "Abierto a distintos formatos" : value.formats.join(" · ")}</p>}
    {(Object.keys(PREFERENCE_GROUPS) as (keyof typeof PREFERENCE_GROUPS)[]).map(group => {
      const entries = Object.entries(PREFERENCE_GROUPS[group]).filter(([key]) => value[group][key] && value[group][key] !== "unspecified");
      return entries.length ? <div className="p2-preference-group" key={group}><h3>{group === "themes" ? "Temáticas" : group === "participation" ? "Participación frente a cámara" : "Condiciones de trabajo"}</h3><ul>{entries.map(([key,label]) => { const choice = value[group][key] as keyof typeof states; return <li key={key}><span><ProfileDetailIcon kind={group} />{label}</span><strong data-choice={choice}>{states[choice]}</strong></li>; })}</ul></div> : null;
    })}
    <small>Preferencias publicadas por el profesional. Cada proyecto, escena y condición se acuerda por separado.</small>
  </section>;
}

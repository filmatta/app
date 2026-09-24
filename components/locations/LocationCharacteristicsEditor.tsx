import {
  LOCATION_BOOLEAN_CHARACTERISTICS,
  LOCATION_NUMERIC_CHARACTERISTICS,
  LOCATION_TEXT_CHARACTERISTICS,
  type LocationCharacteristics,
} from "@/lib/locations/characteristics";
import styles from "./locations.module.css";

export default function LocationCharacteristicsEditor({ value = {} }: { value?: LocationCharacteristics }) {
  return (
    <div className={styles.editorStack}>
      <div className={styles.editorGrid}>
        {LOCATION_NUMERIC_CHARACTERISTICS.map((field) => {
          const current = value[field.key];
          return <label key={field.key} className={styles.editorField}>
            <span>{field.label} <small>({field.unit})</small></span>
            <input name={`characteristic.${field.key}`} type="number" min="0" max={field.max} step="any" defaultValue={typeof current === "number" ? current : ""} placeholder="No informado" />
          </label>;
        })}
      </div>
      <div className={styles.editorGrid}>
        {LOCATION_BOOLEAN_CHARACTERISTICS.map((field) => (
          <label key={field.key} className={styles.editorField}>
            <span>{field.label}</span>
            <select name={`characteristic.${field.key}`} defaultValue={typeof value[field.key] === "boolean" ? (value[field.key] ? "yes" : "no") : ""}>
              <option value="">No informado</option><option value="yes">Sí</option><option value="no">No</option>
            </select>
          </label>
        ))}
      </div>
      {LOCATION_TEXT_CHARACTERISTICS.map((field) => {
        const current = value[field.key];
        return <label key={field.key} className={styles.editorField}>
          <span>{field.label}</span>
          <textarea name={`characteristic.${field.key}`} maxLength={field.maxLength} rows={3} defaultValue={typeof current === "string" ? current : ""} placeholder="No informado" />
        </label>;
      })}
    </div>
  );
}

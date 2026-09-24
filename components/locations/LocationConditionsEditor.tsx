"use client";

import { useState } from "react";
import FilmattaAccordion from "@/components/ui/FilmattaAccordion";
import {
  LOCATION_CONDITION_GROUPS,
  LOCATION_CONDITION_LABELS,
  type LocationConditions,
  type LocationConditionValue,
} from "@/lib/locations/conditions";
import styles from "./locations.module.css";

const ICONS: Record<string, string> = {
  clock: "◷", tools: "⌁", edit: "✎", spark: "✦", sound: "◖",
  car: "◇", people: "◎", drone: "⌃", camera: "◉",
};

export default function LocationConditionsEditor({
  initialValue = {},
}: {
  initialValue?: LocationConditions;
}) {
  const [value, setValue] = useState<LocationConditions>(initialValue);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  return (
    <div className={styles.conditionEditor}>
      {LOCATION_CONDITION_GROUPS.map((group) => {
        const count = group.options.filter((option) => value[option.key]).length;
        const isOpen = Boolean(openGroups[group.id]);
        return (
          <FilmattaAccordion
            key={group.id}
            title={`${ICONS[group.icon] ?? "•"}  ${group.title}`}
            summary={`${count} especificada${count === 1 ? "" : "s"} · ${isOpen ? "Ocultar" : "Ver"} condiciones`}
            open={isOpen}
            onOpenChange={(open) =>
              setOpenGroups((current) => ({ ...current, [group.id]: open }))
            }
          >
            <div className={styles.conditionGrid}>
              {group.options.map((option) => (
                <label key={option.key} className={styles.conditionField}>
                  <span>{option.label}</span>
                  <select
                    name={`condition.${option.key}`}
                    value={value[option.key] ?? ""}
                    onChange={(event) => {
                      const next = event.target.value as LocationConditionValue | "";
                      setValue((current) => {
                        const updated = { ...current };
                        if (next) updated[option.key] = next;
                        else delete updated[option.key];
                        return updated;
                      });
                    }}
                    className={styles.compactSelect}
                  >
                    <option value="">Sin especificar</option>
                    {Object.entries(LOCATION_CONDITION_LABELS).map(([state, label]) => (
                      <option key={state} value={state}>{label}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </FilmattaAccordion>
        );
      })}
    </div>
  );
}

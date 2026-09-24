export const LOCATION_CONDITION_VALUES = ["yes", "consult", "no"] as const;

export type LocationConditionValue =
  (typeof LOCATION_CONDITION_VALUES)[number];
export type LocationConditions = Record<string, LocationConditionValue>;

type ConditionOption = { key: string; label: string };
type ConditionGroup = {
  id: string;
  title: string;
  icon: string;
  options: readonly ConditionOption[];
};

export const LOCATION_CONDITION_GROUPS = [
  {
    id: "schedule",
    title: "Horarios y producción",
    icon: "clock",
    options: [
      ["day_shoots", "Rodajes diurnos"], ["night_shoots", "Rodajes nocturnos"],
      ["dawn_shoots", "Madrugada"], ["weekends", "Fines de semana"],
      ["holidays", "Festivos"], ["over_eight_hours", "Jornadas de más de 8 horas"],
      ["consecutive_days", "Varios días consecutivos"], ["early_setup", "Montaje previo"],
      ["late_strike", "Desmontaje posterior"], ["crew_up_to_5", "Equipos hasta 5 personas"],
      ["crew_6_to_15", "Equipos de 6–15 personas"], ["crew_over_15", "Equipos de más de 15 personas"],
      ["large_extras", "Figuración numerosa"], ["audience", "Público o audiencia"],
      ["events", "Eventos además de filmación"],
    ],
  },
  {
    id: "equipment",
    title: "Equipo y montaje",
    icon: "tools",
    options: [
      ["light_equipment", "Trípodes y equipo ligero"], ["dolly_sliders", "Dolly o sliders"],
      ["large_lighting", "Iluminación de gran formato"], ["grip_stands", "C-stands y grip"],
      ["cranes_jib", "Grúas o jib"], ["heavy_equipment", "Equipo pesado"],
      ["set_design", "Escenografía"], ["temporary_backdrops", "Fondos o cicloramas temporales"],
      ["production_furniture", "Mobiliario de producción"], ["external_generator", "Generador eléctrico externo"],
    ],
  },
  {
    id: "modifications",
    title: "Modificaciones",
    icon: "edit",
    options: [
      ["temporary_decor", "Decoración temporal"], ["rearrange_furniture", "Reacomodar muebles"],
      ["remove_furniture", "Retirar muebles"], ["temporary_paint", "Pintura temporal"],
      ["permanent_paint", "Pintura permanente"], ["drill_walls", "Perforar paredes"],
      ["wall_ceiling_mounts", "Fijaciones en paredes o techos"], ["tapes_adhesives", "Cintas o adhesivos"],
      ["cover_windows", "Cubrir ventanas"], ["blackout_space", "Oscurecer el espacio"],
      ["modify_signage", "Modificar señalización"],
    ],
  },
  {
    id: "effects",
    title: "Efectos y utilería",
    icon: "spark",
    options: [
      ["haze", "Humo o haze"], ["stage_fog", "Niebla escénica"],
      ["simulated_rain", "Lluvia simulada"], ["indoor_water", "Agua dentro del espacio"],
      ["soil_sand", "Tierra o arena"], ["stage_dust", "Polvo escénico"],
      ["confetti", "Confeti"], ["artificial_snow", "Nieve artificial"],
      ["stage_liquids", "Sangre falsa o líquidos escénicos"], ["candles", "Velas"],
      ["controlled_flame", "Llama controlada"], ["pyrotechnics", "Pirotecnia"],
      ["practical_effects", "Efectos prácticos a consultar"], ["prop_weapons", "Réplicas o utilería de armas"],
    ],
  },
  {
    id: "sound",
    title: "Sonido y ruido",
    icon: "sound",
    options: [
      ["direct_sound", "Diálogo o sonido directo"], ["moderate_music", "Música moderada"],
      ["loud_music", "Música alta"], ["instruments", "Instrumentos"],
      ["drums", "Batería o percusión"], ["playback", "Playback"],
      ["loud_scenes", "Gritos o escenas ruidosas"], ["night_noise", "Actividad ruidosa nocturna"],
    ],
  },
  {
    id: "vehicles",
    title: "Vehículos",
    icon: "car",
    options: [
      ["cars_inside", "Automóviles dentro del espacio"], ["motorcycles", "Motocicletas"],
      ["bicycles", "Bicicletas"], ["equipment_vans", "Camionetas de equipo"],
      ["trucks", "Camiones"], ["production_parking", "Estacionamiento de producción"],
      ["picture_vehicles", "Vehículos estacionados para escena"], ["driving_scene", "Conducción en escena"],
      ["indoor_engines", "Encender vehículos en interiores"],
    ],
  },
  {
    id: "support",
    title: "Animales, personas y apoyo",
    icon: "people",
    options: [
      ["cats_dogs", "Perros o gatos"], ["other_pets", "Otros animales domésticos"],
      ["farm_animals", "Animales de granja"], ["horses", "Caballos"],
      ["trained_animals", "Animales entrenados para producción"], ["minors", "Participación de menores"],
      ["babies", "Bebés"], ["school_groups", "Grupos escolares"],
      ["makeup_area_use", "Uso de área de maquillaje"], ["wardrobe_area_use", "Uso de vestuario"],
      ["catering", "Catering"], ["food_consumption", "Consumo de alimentos"],
      ["drink_consumption", "Consumo de bebidas"], ["kitchen_use", "Uso de cocina"],
      ["food_refrigeration", "Refrigeración de alimentos"],
    ],
  },
  {
    id: "exterior",
    title: "Exterior, drones y alturas",
    icon: "drone",
    options: [
      ["facade", "Fachada"], ["garden_patio", "Patio o jardín"],
      ["rooftop", "Azotea"], ["balconies", "Balcones"],
      ["work_at_height", "Trabajo en altura"], ["drones", "Drones"],
      ["night_exterior_lighting", "Iluminación exterior nocturna"], ["access_area_setup", "Montaje en accesos del inmueble"],
    ],
  },
  {
    id: "production_type",
    title: "Tipo de producción y contenido",
    icon: "camera",
    options: [
      ["photography", "Fotografía"], ["advertising", "Publicidad"],
      ["music_videos", "Videoclips"], ["films", "Cortometrajes o largometrajes"],
      ["series", "Series"], ["documentaries", "Documentales"],
      ["social_media", "Redes sociales"], ["corporate", "Corporativo"],
      ["student", "Estudiantil"], ["live_streaming", "Transmisiones en vivo"],
      ["horror", "Terror"], ["simulated_violence", "Violencia simulada"],
      ["intimacy", "Intimidad escénica"], ["nudity", "Desnudez escénica"],
      ["political_content", "Contenido político"], ["religious_content", "Contenido religioso"],
      ["alcohol_scene", "Alcohol en escena"], ["simulated_tobacco", "Tabaco simulado"],
    ],
  },
].map((group) => ({
  ...group,
  options: group.options.map(([key, label]) => ({ key, label })),
})) as readonly ConditionGroup[];

export const LOCATION_CONDITION_KEYS = LOCATION_CONDITION_GROUPS.flatMap(
  (group) => group.options.map((option) => option.key),
);

const CONDITION_KEY_SET = new Set(LOCATION_CONDITION_KEYS);
const CONDITION_VALUE_SET = new Set<string>(LOCATION_CONDITION_VALUES);

export function parseLocationConditions(formData: FormData): LocationConditions {
  const conditions: LocationConditions = {};
  for (const key of LOCATION_CONDITION_KEYS) {
    const value = String(formData.get(`condition.${key}`) ?? "");
    if (CONDITION_VALUE_SET.has(value)) {
      conditions[key] = value as LocationConditionValue;
    }
  }
  return conditions;
}

export function normalizeLocationConditions(value: unknown): LocationConditions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, state]) => CONDITION_KEY_SET.has(key) && CONDITION_VALUE_SET.has(String(state)),
    ),
  ) as LocationConditions;
}

export const LOCATION_CONDITION_LABELS: Record<LocationConditionValue, string> = {
  yes: "Sí",
  consult: "Consultar",
  no: "No",
};

export const LOCATION_CONDITIONS_NOTICE =
  "Las condiciones deben confirmarse para cada producción. Estas respuestas no sustituyen permisos, evaluación técnica ni medidas de seguridad.";

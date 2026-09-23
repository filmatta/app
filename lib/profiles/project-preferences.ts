export const PROJECT_FORMATS = [
  "Cortometraje", "Largometraje", "Series", "Documental", "Publicidad",
  "Videoclip", "Contenido digital", "Institucional", "Educativo",
  "Proyecto estudiantil", "Eventos", "Fotografía",
] as const;

export const PREFERENCE_CHOICES = { unspecified: "Sin especificar", accept: "Sí", consult: "Consultar", decline: "No" } as const;
export type PreferenceChoice = keyof typeof PREFERENCE_CHOICES;
export type PreferenceGroup = "themes" | "participation" | "conditions";
export type PreferenceIcon = "formats" | "themes" | "participation" | "conditions" | "skills" | "equipment";

export type PreferenceOption = { key: string; label: string; group: PreferenceGroup; projectRequirement?: boolean };
export type PreferenceSection = { title?: string; options: readonly PreferenceOption[] };
export type PreferenceCategory = { key: string; title: string; icon: PreferenceIcon; help?: string; format?: boolean; sections: readonly PreferenceSection[] };

const option = (group: PreferenceGroup, key: string, label: string, projectRequirement = false): PreferenceOption => ({ group, key, label, projectRequirement });

export const PROFILE_PREFERENCE_CATEGORIES: readonly PreferenceCategory[] = [
  { key: "project-types", title: "Tipos de proyecto", icon: "formats", format: true, sections: [] },
  {
    key: "interpretation", title: "Interpretación y participación", icon: "participation",
    sections: [
      { title: "Actuación", options: [
        option("participation", "dialogue_roles", "Personajes con diálogo"),
        option("participation", "non_dialogue_roles", "Personajes sin diálogo"),
        option("participation", "brief_appearances", "Participaciones breves"),
        option("participation", "recurring_roles", "Personajes recurrentes"),
        option("participation", "background_extra", "Figuración / extra"),
        option("participation", "script_readings", "Lecturas de guion"),
        option("participation", "camera_rehearsals", "Ensayos de cámara"),
        option("participation", "stand_in", "Doble de luces o posición — stand-in"),
      ] },
      { title: "Presentación y contenido", options: [
        option("participation", "camera_presenting", "Presentación a cámara"),
        option("participation", "interview_hosting", "Conducción de entrevistas"),
        option("participation", "event_hosting", "Presentación de eventos"),
        option("participation", "product_demos", "Demostraciones de producto"),
        option("participation", "camera_tutorials", "Tutoriales o explicaciones a cámara"),
        option("participation", "live_streaming", "Transmisiones en vivo"),
        option("participation", "ad_performance", "Interpretación en anuncios"),
        option("participation", "ugc_brand_content", "Contenido para marcas estilo UGC"),
        option("participation", "institutional_content", "Contenido institucional"),
      ] },
      { title: "Modelaje y fotografía", options: [
        option("participation", "editorial_photography", "Fotografía editorial"),
        option("participation", "fashion_campaigns", "Campañas de moda"),
        option("participation", "catalog_ecommerce", "Catálogo / e-commerce"),
        option("participation", "beauty_hair", "Belleza y peluquería"),
        option("participation", "hands_product_modeling", "Modelaje de manos o detalles para producto"),
        option("participation", "runway", "Pasarela"),
        option("participation", "creative_photo_tests", "Pruebas creativas de fotografía"),
      ] },
      { title: "Voz y performance", options: [
        option("participation", "commercial_voiceover", "Locución comercial"),
        option("participation", "narration", "Narración"),
        option("participation", "dubbing", "Doblaje"),
        option("participation", "animation_game_characters", "Personajes de animación o videojuegos"),
        option("participation", "audiobooks", "Audiolibros"),
        option("participation", "onstage_singing", "Canto en escena"),
        option("participation", "onstage_dance", "Baile en escena"),
        option("participation", "instrument_performance", "Interpretación de instrumentos"),
        option("participation", "improvisation", "Improvisación"),
        option("participation", "physical_comedy", "Comedia física"),
        option("participation", "choreographed_movement", "Movimiento coreografiado"),
        option("participation", "motion_capture", "Captura de movimiento"),
      ] },
    ],
  },
  {
    key: "characterization", title: "Caracterización y vestuario", icon: "skills",
    sections: [
      { title: "Cabello y apariencia", options: [
        option("participation", "character_haircut", "Corte de cabello para personaje"),
        option("participation", "temporary_hair_color", "Coloración temporal"),
        option("participation", "permanent_hair_color", "Coloración permanente"),
        option("participation", "facial_hair_shaving", "Rasurado de barba o bigote"),
        option("participation", "grow_hair_or_beard", "Dejar crecer cabello o barba"),
        option("participation", "wigs", "Uso de pelucas"),
      ] },
      { title: "Maquillaje", options: [
        option("participation", "beauty_makeup", "Maquillaje de belleza"),
        option("participation", "period_makeup", "Maquillaje de época"),
        option("participation", "special_effects_makeup", "Maquillaje de efectos especiales"),
        option("participation", "character_prosthetics", "Prótesis de caracterización"),
        option("participation", "simulated_wounds", "Simulación de heridas"),
        option("participation", "temporary_tattoos", "Tatuajes temporales"),
        option("participation", "cover_visible_tattoos", "Cubrir tatuajes visibles"),
      ] },
      { title: "Vestuario y presentación", options: [
        option("participation", "period_costume", "Vestuario de época"),
        option("participation", "uniforms", "Uniformes"),
        option("participation", "bulky_stage_costume", "Vestuario escénico voluminoso"),
        option("participation", "masks", "Máscaras"),
        option("participation", "character_mascot_suits", "Trajes de personaje o mascota"),
        option("participation", "special_footwear", "Calzado especial para personaje"),
        option("participation", "no_makeup_appearance", "Aparición sin maquillaje"),
        option("participation", "major_appearance_change", "Caracterización que modifique notablemente la apariencia"),
      ] },
    ],
  },
  {
    key: "schedule-mobility", title: "Horarios y movilidad", icon: "conditions",
    help: "Transporte, hospedaje y viáticos se acuerdan para cada proyecto.",
    sections: [
      { title: "Horarios", options: [
        option("conditions", "day_shoots", "Rodajes diurnos"),
        option("conditions", "night", "Rodajes nocturnos", true),
        option("conditions", "early_morning_calls", "Llamados de madrugada"),
        option("conditions", "weekends", "Fines de semana"),
        option("conditions", "holidays", "Días festivos"),
        option("conditions", "consecutive_days", "Varios días consecutivos"),
        option("conditions", "short_notice_calls", "Llamados con poca anticipación"),
      ] },
      { title: "Movilidad", options: [
        option("conditions", "travel", "Desplazamientos", true),
        option("conditions", "within_city", "Trabajo dentro de mi ciudad"),
        option("conditions", "metro_area", "Trabajo en zona metropolitana"),
        option("conditions", "same_day_travel", "Viajes con regreso el mismo día"),
        option("conditions", "overnight_travel", "Viajes con pernocta"),
        option("conditions", "other_states", "Trabajo en otros estados"),
        option("conditions", "international_projects", "Proyectos internacionales"),
        option("conditions", "temporary_relocation", "Estancias temporales fuera de mi ciudad"),
      ] },
    ],
  },
  {
    key: "modality-collaboration", title: "Modalidad y colaboración", icon: "equipment",
    sections: [{ options: [
      option("conditions", "onsite_work", "Trabajo presencial"),
      option("conditions", "remote_work", "Trabajo remoto"),
      option("conditions", "hybrid_work", "Trabajo híbrido"),
      option("conditions", "one_off_collaborations", "Colaboraciones puntuales"),
      option("conditions", "multiweek_projects", "Proyectos de varias semanas"),
      option("conditions", "recurring_collaborations", "Colaboraciones recurrentes"),
      option("conditions", "paid_work", "Trabajo remunerado"),
      option("conditions", "unpaid_collaboration", "Colaboración sin honorarios"),
      option("conditions", "portfolio_exchange", "Intercambio por material de portfolio"),
      option("conditions", "revenue_share", "Participación en ingresos, sujeta a acuerdo"),
    ] }],
  },
  {
    key: "environments-scenes", title: "Entornos y escenas especiales", icon: "themes",
    help: "Estas preferencias no acreditan capacitación. Las condiciones y medidas necesarias se revisan para cada proyecto.",
    sections: [
      { title: "Temáticas existentes", options: [
        option("themes", "romance", "Romance", true), option("themes", "comedy", "Comedia", true),
        option("themes", "drama", "Drama", true), option("themes", "horror", "Terror / suspenso", true),
        option("themes", "violence", "Violencia dramatizada", true), option("themes", "gore", "Gore simulado", true),
      ] },
      { title: "Entornos", options: [
        option("conditions", "studio", "Estudio"), option("conditions", "location_interiors", "Interiores en locación"),
        option("conditions", "urban_exteriors", "Exteriores urbanos"), option("conditions", "nature", "Campo o naturaleza"),
        option("conditions", "beach", "Playa"), option("conditions", "mountain", "Montaña"),
        option("conditions", "industrial_spaces", "Espacios industriales"), option("conditions", "boats", "Rodajes a bordo de embarcaciones"),
        option("conditions", "grounded_aircraft", "Interior de aeronave en tierra"), option("conditions", "in_flight", "Rodaje durante un vuelo"),
        option("conditions", "confined_spaces", "Espacios reducidos"), option("conditions", "filming_at_height", "Rodajes en altura"),
      ] },
      { title: "Situaciones", options: [
        option("conditions", "argument_scenes", "Escenas de discusión"),
        option("conditions", "emotionally_intense_scenes", "Escenas emocionalmente intensas"),
        option("conditions", "horror_scenes", "Escenas de terror"), option("conditions", "real_public_interaction", "Interacción con público real"),
        option("conditions", "animals", "Trabajo con animales", true), option("conditions", "minors", "Trabajo con intérpretes menores de edad"),
        option("conditions", "large_groups", "Escenas con grupos numerosos"), option("conditions", "simulated_rain", "Lluvia simulada"),
        option("conditions", "water_scenes", "Escenas en agua"), option("conditions", "underwater_scenes", "Escenas subacuáticas"),
        option("conditions", "water_heights", "Trabajo en agua o alturas", true),
      ] },
      { title: "Acción", options: [
        option("conditions", "action", "Acción física / coreografía", true),
        option("conditions", "prepared_falls", "Caídas preparadas"),
        option("conditions", "prop_weapons", "Escenas con réplicas o utilería de armas", true),
        option("conditions", "scene_driving", "Conducción en escena"),
      ] },
    ],
  },
  {
    key: "professional-collaboration", title: "Colaboración profesional / crew", icon: "equipment",
    sections: [
      { title: "Etapas", options: [
        option("conditions", "creative_development", "Desarrollo creativo"), option("conditions", "preproduction", "Preproducción"),
        option("conditions", "production", "Rodaje"), option("conditions", "postproduction", "Postproducción"),
        option("conditions", "multiple_stages", "Participación en varias etapas"),
      ] },
      { title: "Integración", options: [
        option("conditions", "individual_work", "Trabajo individual"), option("conditions", "join_existing_team", "Integrarme a un equipo existente"),
        option("conditions", "department_lead", "Coordinar un área"), option("conditions", "day_reinforcement", "Refuerzo por jornada"),
        option("conditions", "second_unit", "Segunda unidad"), option("conditions", "replacements_reliefs", "Sustituciones o relevos"),
      ] },
      { title: "Recursos", options: [
        option("conditions", "production_equipment", "Trabajar con equipo proporcionado por producción"),
        option("conditions", "own_equipment_quote", "Aportar equipo propio con cotización separada"),
        option("conditions", "own_studio", "Trabajar desde mi estudio"),
        option("conditions", "client_facilities", "Desplazarme a instalaciones del cliente"),
      ] },
      { title: "Otras colaboraciones", options: [
        option("conditions", "technical_advice", "Asesoría técnica"), option("conditions", "material_review", "Revisión de materiales"),
        option("conditions", "mentoring_workshops", "Mentoría o talleres de mi especialidad"),
      ] },
    ],
  },
  {
    key: "intimacy", title: "Límites de intimidad escénica", icon: "participation",
    help: "Las condiciones y el consentimiento se confirman para cada escena.",
    sections: [{ options: [
      option("participation", "kissing", "Besos", true), option("participation", "contact", "Contacto físico", true),
      option("participation", "intimacy_without_contact", "Intimidad simulada sin contacto", true),
      option("participation", "intimacy_with_contact", "Intimidad simulada con contacto", true),
      option("participation", "partial_nudity", "Desnudez parcial", true), option("participation", "nudity", "Desnudez total", true),
    ] }],
  },
] as const;

const allOptions = PROFILE_PREFERENCE_CATEGORIES.flatMap((category) => category.sections.flatMap((section) => section.options));
function optionsForGroup(group: PreferenceGroup, projectOnly = false) {
  return Object.fromEntries(allOptions.filter((item) => item.group === group && (!projectOnly || item.projectRequirement)).map((item) => [item.key, item.label]));
}

// Existing project/networking consumers retain their established requirement set.
export const PREFERENCE_GROUPS = {
  themes: optionsForGroup("themes", true), participation: optionsForGroup("participation", true), conditions: optionsForGroup("conditions", true),
} as const;
export const PROFILE_PREFERENCE_GROUPS = {
  themes: optionsForGroup("themes"), participation: optionsForGroup("participation"), conditions: optionsForGroup("conditions"),
} as const;

export type ProjectPreferences = { formats: string[]; open_formats: boolean } & Record<PreferenceGroup, Record<string, PreferenceChoice>>;
export const EMPTY_PREFERENCES: ProjectPreferences = { formats: [], open_formats: false, themes: {}, participation: {}, conditions: {} };

export function preferenceCategoryCount(category: PreferenceCategory, value: ProjectPreferences) {
  if (category.format) return value.formats.length + Number(value.open_formats);
  return category.sections.reduce((count, section) => count + section.options.filter((item) => value[item.group][item.key] && value[item.group][item.key] !== "unspecified").length, 0);
}

export function parseProjectPreferences(value: unknown): ProjectPreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => !["formats", "open_formats", "themes", "participation", "conditions"].includes(key)) ||
    typeof candidate.open_formats !== "boolean" || !Array.isArray(candidate.formats) || candidate.formats.length > PROJECT_FORMATS.length ||
    candidate.formats.some((format) => typeof format !== "string" || !PROJECT_FORMATS.includes(format as (typeof PROJECT_FORMATS)[number])) ||
    new Set(candidate.formats).size !== candidate.formats.length) return null;
  const result: ProjectPreferences = { formats: [...candidate.formats], open_formats: candidate.open_formats, themes: {}, participation: {}, conditions: {} };
  for (const group of ["themes", "participation", "conditions"] as const) {
    const fields = candidate[group];
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) return null;
    for (const [key, choice] of Object.entries(fields)) {
      if (!Object.hasOwn(PROFILE_PREFERENCE_GROUPS[group], key) || typeof choice !== "string" || !Object.hasOwn(PREFERENCE_CHOICES, choice)) return null;
      result[group][key] = choice as PreferenceChoice;
    }
  }
  return result;
}

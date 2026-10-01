import type {
  EntitlementDefinition,
  PlanCode,
  PlanDefinition,
} from "./types";

export const PLAN_DEFINITIONS = {
  free: {
    code: "free",
    label: "Baseline",
    audience: "Participación profesional básica",
    description:
      "La base gratuita para aprender con previews, crear una presencia profesional y participar.",
    currentPriceMxn: 0,
    sortOrder: 0,
    active: true,
    badgeVariant: "baseline",
    features: [
      "Perfil profesional base",
      "1 Reel, 2 videos complementarios y 6 fotos Book",
      "Búsqueda básica",
      "Participación normal en oportunidades",
    ],
  },
  starter: {
    code: "starter",
    label: "Starter",
    audience: "Learner y creador inicial",
    description:
      "Aprendizaje completo y una entrada práctica a las herramientas creativas de FILMATTA.",
    currentPriceMxn: 139,
    sortOrder: 10,
    active: true,
    badgeVariant: "starter",
    features: [
      "Learn completo",
      "Todas las capacidades baseline",
      "Writer entry",
      "50 AI Credits por periodo",
    ],
  },
  plus: {
    code: "plus",
    label: "Plus",
    audience: "Profesional que busca más capacidad",
    description:
      "Más espacio para mostrar trabajo y mejores herramientas de descubrimiento profesional.",
    currentPriceMxn: 299,
    sortOrder: 20,
    active: true,
    badgeVariant: "plus",
    features: [
      "Todo Starter",
      "Expansión de Profiles y media",
      "Filtros avanzados",
      "Colecciones cuando estén disponibles",
      "200 AI Credits por periodo",
    ],
  },
  pro: {
    code: "pro",
    label: "Pro",
    audience: "Profesional audiovisual activo",
    description:
      "Inteligencia, matching y herramientas de producción para trabajo audiovisual continuo.",
    currentPriceMxn: 599,
    sortOrder: 30,
    active: true,
    badgeVariant: "pro",
    features: [
      "Todo Plus",
      "Filtros especiales y Project Matchmaking",
      "500 AI Credits por periodo",
      "Production, Director, Scene y Light Assistant",
      "Storyboard Gen",
    ],
  },
  pro_plus: {
    code: "pro_plus",
    label: "Pro+",
    audience: "Productor, productora, estudio o negocio",
    description:
      "Capacidad superior y presencia comercial para operar con mayor escala dentro de FILMATTA.",
    currentPriceMxn: 999,
    sortOrder: 40,
    active: true,
    badgeVariant: "pro_plus",
    features: [
      "Todo Pro",
      "1,000 AI Credits por periodo",
      "Límites superiores sujetos a uso razonable",
      "Perfil y listing de negocio cuando estén disponibles",
      "Acceso a solicitar verificación comercial",
    ],
  },
} as const satisfies Record<PlanCode, PlanDefinition>;

export const COMMERCIAL_PLAN_CODES = [
  "starter",
  "plus",
  "pro",
  "pro_plus",
] as const;

export const ENTITLEMENT_DEFINITIONS = {
  "learn.full_access": define({
    key: "learn.full_access",
    name: "Learn completo",
    description: "Acceso al catálogo regular completo de FILMATTA Learn.",
    minimumPlan: "starter",
    upgradeTitle: "Aprende sin límites de contenido regular",
    upgradeDescription:
      "Accede a las lecciones regulares completas y continúa tu progreso en FILMATTA Learn.",
    values: { starter: { access: true } },
  }),
  "profiles.base": define({
    key: "profiles.base",
    name: "Perfil profesional",
    description: "Presencia profesional base y participación normal en Search.",
    minimumPlan: "free",
    upgradeTitle: "Tu perfil profesional base",
    upgradeDescription: "El perfil profesional base está incluido para todos.",
    values: { free: { access: true } },
  }),
  "profiles.reels": defineAllowance(
    "profiles.reels",
    "Reels",
    "reels",
    1
  ),
  "profiles.complementary_videos": defineAllowance(
    "profiles.complementary_videos",
    "Videos complementarios",
    "videos",
    2
  ),
  "profiles.photos": defineAllowance(
    "profiles.photos",
    "Fotos Book",
    "fotos",
    6
  ),
  "profiles.extra_storage": premiumProfile(
    "profiles.extra_storage",
    "Más almacenamiento",
    "Amplía el espacio disponible para presentar tu trabajo."
  ),
  "profiles.extra_videos": premiumProfile(
    "profiles.extra_videos",
    "Más videos",
    "Añade más piezas audiovisuales a tu perfil."
  ),
  "profiles.extra_photos": premiumProfile(
    "profiles.extra_photos",
    "Más fotos",
    "Amplía tu Book con más imágenes."
  ),
  "profiles.collections": premiumProfile(
    "profiles.collections",
    "Colecciones",
    "Organiza tu trabajo en colecciones cuando esta función esté disponible."
  ),
  "profiles.verification": define({
    key: "profiles.verification",
    name: "Solicitud de verificación",
    description:
      "Permite iniciar una solicitud; no concede verificación automática.",
    minimumPlan: "pro_plus",
    upgradeTitle: "Inicia tu proceso de verificación",
    upgradeDescription:
      "PRO+ permite solicitar revisión. La insignia sólo se concede después de una validación real.",
    values: { pro_plus: { access: true } },
  }),
  "search.basic": define({
    key: "search.basic",
    name: "Búsqueda básica",
    description: "Descubrimiento básico dentro de la política actual.",
    minimumPlan: "free",
    upgradeTitle: "Búsqueda básica",
    upgradeDescription: "La búsqueda básica forma parte de FILMATTA baseline.",
    values: { free: { access: true } },
  }),
  "search.advanced_filters": define({
    key: "search.advanced_filters",
    name: "Filtros avanzados",
    description: "Refina resultados con señales profesionales adicionales.",
    minimumPlan: "plus",
    upgradeTitle: "Encuentra perfiles con mayor precisión",
    upgradeDescription:
      "Usa filtros avanzados para reducir ruido y llegar antes a perfiles relevantes.",
    values: { plus: { access: true } },
  }),
  "search.special_filters": define({
    key: "search.special_filters",
    name: "Filtros especiales",
    description: "Filtros profesionales especializados sujetos a disponibilidad.",
    minimumPlan: "pro",
    upgradeTitle: "Refina búsquedas profesionales complejas",
    upgradeDescription:
      "PRO añade filtros especializados para necesidades de producción más precisas.",
    values: { pro: { access: true } },
  }),
  "search.project_matchmaking": define({
    key: "search.project_matchmaking",
    name: "Match con proyecto",
    description: "Cruza un proyecto con roles, disponibilidad y preferencias.",
    minimumPlan: "pro",
    upgradeTitle: "Encuentra perfiles compatibles automáticamente",
    upgradeDescription:
      "Usa el contexto de tu proyecto para filtrar roles, disponibilidad, preferencias y otras señales relevantes.",
    values: { pro: { access: true } },
  }),
  "search.monthly_allowance": define({
    key: "search.monthly_allowance",
    name: "Capacidad mensual de Search",
    description: "Cantidad configurable de búsquedas asistidas por periodo.",
    minimumPlan: "free",
    upgradeTitle: "Amplía tu capacidad de búsqueda",
    upgradeDescription:
      "Los planes superiores incluyen más capacidad de descubrimiento por periodo.",
    values: {
      free: { allowance: 25, unit: "búsquedas" },
      starter: { allowance: 50, unit: "búsquedas" },
      plus: { allowance: 100, unit: "búsquedas" },
      pro: { allowance: 250, unit: "búsquedas", fairUse: true },
      pro_plus: { allowance: 500, unit: "búsquedas", fairUse: true },
    },
  }),
  "writer.entry": define({
    key: "writer.entry",
    name: "Writer entry",
    description: "Acceso inicial a Writer cuando su integración esté disponible.",
    minimumPlan: "starter",
    upgradeTitle: "Empieza a trabajar con Writer",
    upgradeDescription:
      "Starter incluye la entrada a Writer y una cuota inicial de AI Credits.",
    values: { starter: { access: true } },
  }),
  "writer.ai_credits": define({
    key: "writer.ai_credits",
    name: "AI Credits",
    description: "Créditos de IA por periodo, separados de Contact Credits.",
    minimumPlan: "starter",
    upgradeTitle: "Amplía tus AI Credits",
    upgradeDescription:
      "Cada plan incluye una cuota distinta de AI Credits para herramientas compatibles.",
    values: {
      free: { allowance: 0, unit: "AI Credits" },
      starter: { allowance: 50, unit: "AI Credits" },
      plus: { allowance: 200, unit: "AI Credits" },
      pro: { allowance: 500, unit: "AI Credits", fairUse: true },
      pro_plus: { allowance: 1000, unit: "AI Credits", fairUse: true },
    },
  }),
  "writer.setup_payoff": define({
    key: "writer.setup_payoff",
    name: "Setup / Payoff",
    description: "Detecta y revisa relaciones narrativas entre preparaciones y resoluciones.",
    minimumPlan: "free",
    upgradeTitle: "Setup / Payoff en Writer",
    upgradeDescription:
      "La función queda preparada para Entitlements sin activar todavía un paywall comercial.",
    values: { free: { access: true } },
  }),
  "writer.guided_writing": define({
    key: "writer.guided_writing",
    name: "Guided Writing",
    description: "Acompañamiento editorial contextual para pensar decisiones del guion sin escribirlo por el usuario.",
    minimumPlan: "free",
    upgradeTitle: "Guided Writing en Writer",
    upgradeDescription:
      "La función queda preparada para Entitlements sin activar todavía un paywall comercial.",
    values: { free: { access: true } },
  }),
  "writer.narrative_pulse": define({
    key: "writer.narrative_pulse",
    name: "Narrative Pulse",
    description: "Vista descriptiva de intensidad narrativa, zonas e hitos del guion.",
    minimumPlan: "free",
    upgradeTitle: "Narrative Pulse en Writer",
    upgradeDescription:
      "La función queda preparada para Entitlements sin activar todavía un paywall comercial.",
    values: { free: { access: true } },
  }),
  "production.assistant": productionTool(
    "production.assistant",
    "Production Assistant"
  ),
  "production.director_assistant": productionTool(
    "production.director_assistant",
    "Director Assistant"
  ),
  "production.scene_assistant": productionTool(
    "production.scene_assistant",
    "Scene Assistant"
  ),
  "production.light_assistant": productionTool(
    "production.light_assistant",
    "Light Assistant"
  ),
  "production.storyboard_gen": productionTool(
    "production.storyboard_gen",
    "Storyboard Gen"
  ),
  "services.business_profile": businessFeature(
    "services.business_profile",
    "Perfil de negocio"
  ),
  "services.business_verification": businessFeature(
    "services.business_verification",
    "Solicitud de verificación de negocio"
  ),
  "services.advanced_listing": businessFeature(
    "services.advanced_listing",
    "Listing de negocio ampliado"
  ),
} as const satisfies Record<string, EntitlementDefinition>;

export type EntitlementKey = keyof typeof ENTITLEMENT_DEFINITIONS;

export function isEntitlementKey(value: string): value is EntitlementKey {
  return Object.prototype.hasOwnProperty.call(ENTITLEMENT_DEFINITIONS, value);
}

export function getEntitlementDefinition(
  key: string
): EntitlementDefinition | null {
  return isEntitlementKey(key) ? ENTITLEMENT_DEFINITIONS[key] : null;
}

export function getPlanDefinition(plan: PlanCode): PlanDefinition {
  return PLAN_DEFINITIONS[plan];
}

function define<T extends EntitlementDefinition>(definition: T) {
  return definition;
}

function defineAllowance(
  key: string,
  name: string,
  unit: string,
  allowance: number
) {
  return define({
    key,
    name,
    description: `Allowance baseline de ${name.toLocaleLowerCase("es-MX")}.`,
    minimumPlan: "free",
    upgradeTitle: `Amplía tu capacidad de ${name.toLocaleLowerCase("es-MX")}`,
    upgradeDescription:
      "El perfil base conserva su capacidad actual; los planes premium añaden más cuando corresponda.",
    values: { free: { allowance, unit } },
  });
}

function premiumProfile(key: string, name: string, description: string) {
  return define({
    key,
    name,
    description,
    minimumPlan: "plus",
    upgradeTitle: name,
    upgradeDescription: description,
    values: { plus: { access: true } },
  });
}

function productionTool(key: string, name: string) {
  return define({
    key,
    name,
    description: `${name} estará disponible desde PRO cuando la herramienta exista.`,
    minimumPlan: "pro",
    upgradeTitle: `Trabaja con ${name}`,
    upgradeDescription:
      "PRO reúne asistentes de producción para acelerar decisiones y trabajo audiovisual.",
    values: { pro: { access: true, fairUse: true } },
  });
}

function businessFeature(key: string, name: string) {
  return define({
    key,
    name,
    description: `${name} estará disponible para PRO+ cuando Services exista.`,
    minimumPlan: "pro_plus",
    upgradeTitle: name,
    upgradeDescription:
      "PRO+ prepara una presencia comercial ampliada para productoras, estudios y negocios audiovisuales.",
    values: { pro_plus: { access: true, fairUse: true } },
  });
}

// Fictional local review fixtures. No remote accounts or user data.
const blank = {
  portrait_url: "",
  stage_name: "",
  work_area: "",
  rate_range: "",
  book: [],
  credits: [],
};
const image = "https://profiles-fixture.invalid/";
const base = {
  availability: "available",
  city: "Guadalajara",
  bio: "Perfil ficticio para revisión visual. Trabajo con historias íntimas, luz natural y personajes que encuentran su propia voz.",
  skills: ["Inglés", "Improvisación", "Danza contemporánea"],
  equipment: [],
  is_public: true,
  contact_policy: "members_only",
  updated_at: "2026-09-19T00:00:00Z",
  portfolio_items: [
    {
      kind: "reel",
      title: "Escenas seleccionadas · 2026",
      url: "https://vimeo.com/123456789",
      summary: "Cine independiente · Drama · Interpretación",
    },
    {
      kind: "project",
      title: "La última luz",
      url: "https://example.invalid/proyecto",
      summary: "Cortometraje · Personaje principal · 2025",
    },
  ],
  presentation: {
    ...blank,
    portrait_url: image + "portrait",
    work_area: "Zona Poniente",
    book: [
      {
        url: image + "portrait",
        caption: "Retrato editorial · Imagen de stock para esta prueba",
      },
      {
        url: image + "monitor",
        caption: "En set · Imagen editorial de prueba",
      },
    ],
    credits: [
      {
        title: "La última luz",
        role: "Personaje principal · Cortometraje",
        year: "2025",
      },
      {
        title: "Días de verano",
        role: "Reparto · Serie independiente",
        year: "2024",
      },
    ],
  },
};
let owned;
let rows;
export function resetProfileFixture() {
  rows = [
    {
      ...base,
      slug: "elena-demo",
      display_name: "Elena R.",
      disciplines: ["Actuación", "Modelaje"],
    },
    {
      ...base,
      slug: "mateo-demo",
      display_name: "Mateo C.",
      bio:
        "Perfil ficticio para revisión visual. " +
        "Trabajo con luz natural y equipos de cine independientes. Cada proyecto reúne una mirada distinta, desde la preparación hasta el último plano. ".repeat(
          7,
        ),
      portfolio_items: [
        ...base.portfolio_items,
        {
          kind: "reel",
          title: "Luz del norte",
          url: "https://vimeo.com/123456788",
          summary: "Fotografía · 2025",
        },
        {
          kind: "project",
          title: "Entre escenas",
          url: "https://vimeo.com/123456787",
          summary: "Dirección · 2024",
        },
      ],
      disciplines: ["Dirección de fotografía", "Dirección"],
      equipment: ["Sony FX6", "DaVinci Resolve"],
      skills: ["Iluminación", "Color"],
      presentation: {
        ...base.presentation,
        portrait_url: image + "portrait",
        stage_name: "Mateo Campos",
        book: [
          {
            url: image + "monitor",
            caption: "Luz y encuadre · Imagen editorial de prueba",
          },
        ],
      },
    },
    {
      ...base,
      slug: "sofia-demo",
      display_name: "Sofía M.",
      disciplines: ["Actuación"],
      availability: "limited",
      portfolio_items: [],
      presentation: { ...base.presentation },
    },
    {
      ...base,
      slug: "daniel-demo",
      display_name: "Daniel A.",
      bio: "",
      skills: [],
      equipment: [],
      disciplines: ["Sonido"],
      availability: "unavailable",
      portfolio_items: [],
      presentation: { ...blank },
    },
  ];
  owned = structuredClone(rows[0]);
  owned.slug = "perfil-propio-demo";
  owned.is_public = false;
}
resetProfileFixture();
export async function profileFixture(req, res, url, token) {
  const body =
    req.method === "POST"
      ? JSON.parse(
          await new Promise((resolve) => {
            let value = "";
            req.on("data", (chunk) => (value += chunk));
            req.on("end", () => resolve(value || "{}"));
          }),
        )
      : {};
  if (url.pathname === "/rest/v1/professional_profiles") {
    res.end(JSON.stringify(token.includes(".") ? owned : null));
    return true;
  }
  if (url.pathname.endsWith("save_my_professional_portfolio")) {
    if (!token.includes(".")) {
      res.statusCode = 403;
      res.end("{}");
      return true;
    }
    owned = {
      ...owned,
      updated_at: new Date().toISOString(),
      disciplines: body.p_disciplines,
      city: body.p_city,
      bio: body.p_bio,
      availability: body.p_availability,
      skills: body.p_skills,
      equipment: body.p_equipment,
      portfolio_items: body.p_portfolio_items,
      presentation: body.p_presentation,
      is_public: body.p_is_public,
      contact_policy: body.p_contact_policy,
    };
    rows = rows.some((p) => p.slug === owned.slug)
      ? rows.map((p) => (p.slug === owned.slug ? owned : p))
      : [...rows, owned];
    res.end(JSON.stringify(owned.slug));
    return true;
  }
  if (url.pathname.endsWith("get_public_professional_portfolio")) {
    res.end(
      JSON.stringify(rows.filter((p) => p.slug === body.p_slug && p.is_public)),
    );
    return true;
  }
  if (url.pathname.endsWith("list_public_professional_portfolios")) {
    const filtered = rows.filter(
      (p) =>
        p.is_public &&
        (!body.p_talent ||
          p.disciplines.some((d) => ["Actuación", "Modelaje"].includes(d))) &&
        (!body.p_discipline || p.disciplines.includes(body.p_discipline)) &&
        (!body.p_city ||
          p.city.toLowerCase().includes(body.p_city.toLowerCase())) &&
        (!body.p_availability || p.availability === body.p_availability),
    );
    res.end(
      JSON.stringify(
        filtered.slice(
          ((body.p_page || 1) - 1) * 24,
          (body.p_page || 1) * 24 + 1,
        ),
      ),
    );
    return true;
  }
  return false;
}

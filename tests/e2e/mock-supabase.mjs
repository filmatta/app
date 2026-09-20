// Local transport fixture only. This does NOT test PostgreSQL RLS.
// No production credentials or remote database access.
import http from "node:http";
import {profileFixture,resetProfileFixture} from "./profiles-fixture.mjs";
const id = "11111111-1111-4111-8111-111111111111";
let scenario = "empty";
const profile = {
  slug: "test-profile",
  display_name: "Persona P.",
  disciplines: ["Actuación"],
  city: "México",
  bio: "Material de prueba exclusivamente local.",
  availability: "available",
  updated_at: "2026-09-01T00:00:00Z",
  portfolio_items: [],
  skills: [],
  equipment: [],
  is_public: true,
  contact_policy: "closed",
};
const project = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Proyecto de prueba local",
  slug: "test-project",
};
const opportunity = {
  id,
  project_id: project.id,
  projects: project,
  title: "Convocatoria de prueba local",
  slug: "test-opportunity",
  summary: "Prueba de catálogo sin datos de producción.",
  description: "Descripción de prueba local.",
  category: "crew",
  discipline: "Sonido",
  city: "México",
  work_mode: "remote",
  compensation_type: "paid",
  compensation_min: 1000,
  compensation_max: 2000,
  compensation_currency: "MXN",
  published_at: "2026-09-01T00:00:00Z",
};
const location = {
  id,
  title: "Espacio de prueba local",
  slug: "test-location",
  summary: "Prueba local de catálogo.",
  city: "México",
  space_type: "Estudio",
  environment: "interior",
  published_at: "2026-09-01T00:00:00Z",
  price_amount: null,
  price_currency: null,
  price_unit: null,
};
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:54329");
    const token = (req.headers.authorization ?? "").replace("Bearer ", "");
    let role = "user";
    try {
      role =
        JSON.parse(Buffer.from(token.split(".")[1], "base64url")).test_role ??
        "user";
    } catch {}
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Range", "0-0/0");
    if (url.pathname === "/health") return res.end("{}");
    if (url.pathname === "/__scenario") {
      scenario = url.searchParams.get("value") ?? "empty";
      if (scenario === "profiles-polish") resetProfileFixture();
      return res.end("{}");
    }
    if (url.pathname === "/auth/v1/user") {
      if (!token.includes(".")) {
        res.statusCode = 401;
        return res.end('{"message":"No session"}');
      }
      return res.end(
        JSON.stringify({
          id,
          aud: "authenticated",
          role: "authenticated",
          email: "preview@example.invalid",
          user_metadata: { full_name: "Preview User" },
          app_metadata: {},
          created_at: "2026-01-01T00:00:00Z",
        }),
      );
    }
    if (url.pathname === "/rest/v1/profiles")
      return res.end(JSON.stringify({ role }));
    if (req.method !== "GET" && req.method !== "POST") {
      res.statusCode = 405;
      return res.end("{}");
    }
    if (scenario === "profiles-polish" && await profileFixture(req,res,url,token)) return;
    if (scenario === "unconfigured") {
      res.statusCode = 404;
      return res.end('{"code":"PGRST202","message":"fixture missing schema"}');
    }
    if (scenario === "failure") {
      res.statusCode = 500;
      return res.end('{"code":"XX000","message":"fixture transport error"}');
    }
    if (scenario === "published") {
      const body =
        req.method === "POST"
          ? JSON.parse(
              await new Promise((resolve) => {
                let text = "";
                req.on("data", (chunk) => (text += chunk));
                req.on("end", () => resolve(text || "{}"));
              }),
            )
          : {};
      if (url.pathname.endsWith("list_public_professional_portfolios"))
        return res.end(
          JSON.stringify(body.p_city === "Sin resultados" ? [] : [profile]),
        );
      if (url.pathname.endsWith("get_public_professional_portfolio"))
        return res.end(
          JSON.stringify(body.p_slug === profile.slug ? [profile] : []),
        );
      if (url.searchParams.get("slug") === "eq.draft-only")
        return res.end("[]");
      if (url.pathname === "/rest/v1/locations")
        return res.end(JSON.stringify([location]));
      if (url.pathname === "/rest/v1/opportunities")
        return res.end(JSON.stringify([opportunity]));
      if (url.pathname === "/rest/v1/projects")
        return res.end(JSON.stringify([project]));
      if (url.pathname === "/rest/v1/courses")
        return res.end(
          JSON.stringify([
            {
              id,
              title: "Curso de prueba local",
              slug: "test-course",
              short_description: "Prueba local del catálogo Learn.",
              category: "Sonido",
              level: "Principiante",
              duration_minutes: 45,
              featured: false,
              content_type: "course",
            },
          ]),
        );
    }
    res.end("[]");
  })
  .listen(54329, "127.0.0.1", () =>
    console.log("Local fixture listening on 54329"),
  );

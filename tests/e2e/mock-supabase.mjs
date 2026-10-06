// Local transport fixture only. This does NOT test PostgreSQL RLS.
// No production credentials or remote database access.
import http from "node:http";
import fs from "node:fs";
import {profileFixture,resetProfileFixture} from "./profiles-fixture.mjs";
const pulseDenseFixture = JSON.parse(fs.readFileSync(new URL("../fixtures/writer/pulse-dense-original.json", import.meta.url), "utf8"));
const port = Number.parseInt(process.env.MOCK_SUPABASE_PORT ?? "54329", 10);
const id = "11111111-1111-4111-8111-111111111111";
let scenario = "empty";
let profileDelayMs = 0;
let writerRevision = 1;
let writerDocument = makeWriterDocument();
let writerSaveDelayMs = 0;
let writerScriptId = id;
let writerTitle = "Guion de prueba UX";
let writerSaveCount = 0;
let writerReadCount = 0;
let writerCreateCount = 0;
let writerCheckpoints = [];
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
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
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
      profileDelayMs = Math.min(5000, Math.max(0, Number(url.searchParams.get("delay")) || 0));
      writerSaveDelayMs = Math.min(5000, Math.max(0, Number(url.searchParams.get("writerSaveDelay")) || 0));
      if (scenario === "profiles-polish") resetProfileFixture();
      if (scenario === "writer-ux") {
        writerRevision = 1;
        const writerScenes = Math.min(160, Math.max(0, Number(url.searchParams.get("writerScenes")) || 0));
        writerDocument = url.searchParams.get("writerSceneSelection") === "1"
          ? makeSceneSelectionWriterDocument()
          : url.searchParams.get("writerPulseDense") === "1"
          ? makePulseDenseWriterDocument()
          : writerScenes ? makeLongWriterDocument(writerScenes) : makeWriterDocument();
        writerScriptId = id;
        writerTitle = "Guion de prueba UX";
        writerSaveCount = 0;
        writerReadCount = 0;
        writerCreateCount = 0;
        writerCheckpoints = [];
      }
      return res.end("{}");
    }
    if (url.pathname === "/__writer_state") {
      return res.end(JSON.stringify({
        revision: writerRevision,
        document: writerDocument,
        saves: writerSaveCount,
        reads: writerReadCount,
        creates: writerCreateCount,
        checkpoints: writerCheckpoints,
        approximateResponseBytes: Buffer.byteLength(JSON.stringify(writerDocument), "utf8"),
      }));
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
    if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
      res.statusCode = 405;
      return res.end("{}");
    }
    if (
      profileDelayMs &&
      (url.pathname.endsWith("/list_public_professional_portfolios") ||
        url.pathname.endsWith("/search_public_professional_profiles"))
    )
      await new Promise((resolve) => setTimeout(resolve, profileDelayMs));
    if (scenario === "profiles-polish" && await profileFixture(req,res,url,token)) return;
    if (scenario === "writer-ux") {
      if (url.pathname === "/rest/v1/writer_checkpoints" && req.method === "GET") {
        const checkpointId = url.searchParams.get("id")?.replace(/^eq\./u, "");
        const rangeStart = Number.parseInt(String(req.headers.range ?? "0-").split("-")[0] ?? "0", 10) || 0;
        const automaticRetentionOffset = url.searchParams.get("kind") === "neq.manual" ? 15 : 0;
        const rows = checkpointId
          ? writerCheckpoints.filter((item) => item.id === checkpointId)
          : [...writerCheckpoints].sort((left, right) => right.created_at.localeCompare(left.created_at)).slice(Math.max(rangeStart, automaticRetentionOffset));
        const row = rows[0] ?? null;
        return res.end(req.headers.accept?.includes("vnd.pgrst.object") ? JSON.stringify(row) : JSON.stringify(rows));
      }
      if (url.pathname === "/rest/v1/writer_checkpoints" && req.method === "POST") {
        const payload = await readJson(req);
        const body = Array.isArray(payload) ? payload[0] : payload;
        const row = { ...body, id: crypto.randomUUID(), created_at: new Date().toISOString() };
        writerCheckpoints.push(row);
        return res.end(req.headers.accept?.includes("vnd.pgrst.object") ? JSON.stringify(row) : JSON.stringify([row]));
      }
      if (url.pathname === "/rest/v1/writer_checkpoints" && req.method === "DELETE") {
        const ids = (url.searchParams.get("id") ?? "").replace(/^in\.\(/u, "").replace(/\)$/u, "").split(",").filter(Boolean);
        writerCheckpoints = writerCheckpoints.filter((item) => !ids.includes(item.id));
        return res.end("[]");
      }
      if (url.pathname === "/rest/v1/writer_scripts" && req.method === "GET") {
        writerReadCount += 1;
        const row = {
          id: writerScriptId,
          title: writerTitle,
          document: writerDocument,
          schema_version: 1,
          revision: writerRevision,
          updated_at: "2026-09-25T12:00:00Z",
        };
        return res.end(req.headers.accept?.includes("vnd.pgrst.object") ? JSON.stringify(row) : JSON.stringify([row]));
      }
      if (url.pathname.endsWith("/writer_save_script") && req.method === "POST") {
        const body = await readJson(req);
        if (writerSaveDelayMs) await new Promise((resolve) => setTimeout(resolve, writerSaveDelayMs));
        writerDocument = body.p_document;
        writerRevision += 1;
        writerSaveCount += 1;
        return res.end(JSON.stringify([{ revision: writerRevision }]));
      }
      if (url.pathname.endsWith("/writer_create_script") && req.method === "POST") {
        const body = await readJson(req);
        writerScriptId = "33333333-3333-4333-8333-333333333333";
        writerTitle = body.p_title;
        writerDocument = body.p_document;
        writerRevision = 1;
        writerCreateCount += 1;
        return res.end(JSON.stringify([{
          id: writerScriptId,
          title: writerTitle,
          document: writerDocument,
          schema_version: 1,
          revision: writerRevision,
          updated_at: "2026-09-27T12:00:00Z",
        }]));
      }
    }
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
      if (url.pathname.endsWith("search_public_professional_profiles"))
        return res.end(
          JSON.stringify(
            body.p_city === "Sin resultados" || body.p_query === "Sin resultados"
              ? []
              : [
                  {
                    ...profile,
                    total_count: 1,
                    visual_media_id: null,
                    visual_url: null,
                  },
                ],
          ),
        );
      if (url.pathname.endsWith("get_public_profile_search_facets"))
        return res.end(
          JSON.stringify({
            cities: ["México", "Sin resultados"],
            skills: ["Actuación"],
          }),
        );
      if (url.pathname.endsWith("get_public_professional_portfolio"))
        return res.end(
          JSON.stringify(body.p_slug === profile.slug ? [profile] : []),
        );
      if (url.pathname.endsWith("get_public_location"))
        return res.end(
          JSON.stringify(body.p_slug === location.slug ? location : null),
        );
      if (url.pathname.endsWith("list_public_opportunities"))
        return res.end(
          JSON.stringify(
            body.p_q === "sin-resultados" ||
              body.p_city === "Sin resultados"
              ? []
              : [
                  {
                    ...opportunity,
                    project_title: project.title,
                    project_slug: project.slug,
                    description_excerpt: opportunity.description,
                    application_deadline: null,
                  },
                ],
          ),
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
  .listen(port, "127.0.0.1", () =>
    console.log(`Local fixture listening on ${port}`),
  );

async function readJson(req) {
  return JSON.parse(await new Promise((resolve) => {
    let text = "";
    req.on("data", (chunk) => (text += chunk));
    req.on("end", () => resolve(text || "{}"));
  }));
}

function makeWriterDocument() {
  const block = (suffix, kind, text) => ({
    type: "screenplayBlock",
    attrs: { id: `11111111-1111-4111-8111-1111111111${suffix}`, kind },
    ...(text ? { content: [{ type: "text", text }] } : {}),
  });
  return {
    type: "doc",
    content: [
      block("01", "sceneHeading", "INT. ESTUDIO - DÍA"),
      block("02", "action", "ANA observa la VENTANA."),
      block("03", "character", "ANA"),
      block("04", "dialogue", "Hola, ANA MARÍA."),
      block("05", "character", "ANA MARÍA"),
      block("06", "parenthetical", "(sonríe)"),
      block("07", "dialogue", "Hola, Ana."),
      block("08", "sceneHeading", "INT. ESTUDIO - DÍA"),
      block("09", "action", "La segunda escena conserva un ID distinto."),
    ],
  };
}

function makeLongWriterDocument(sceneCount) {
  const content = [];
  for (let index = 0; index < sceneCount; index += 1) {
    const headingId = stableWriterId(index * 3 + 1);
    const actionId = stableWriterId(index * 3 + 2);
    const characterId = stableWriterId(index * 3 + 3);
    content.push({
      type: "screenplayBlock",
      attrs: { id: headingId, kind: "sceneHeading" },
      content: [{ type: "text", text: `INT. ESCENARIO ${index + 1} - DÍA` }],
    }, {
      type: "screenplayBlock",
      attrs: { id: actionId, kind: "action" },
      content: [{ type: "text", text: index === 73 ? "María se tropieza con el cable junto a la puerta." : `Acción de prueba ${index + 1}.` }],
    }, {
      type: "screenplayBlock",
      attrs: { id: characterId, kind: "character" },
      content: [{ type: "text", text: `PERSONA ${index % 30 + 1}` }],
    });
  }
  return { type: "doc", content };
}

function makeSceneSelectionWriterDocument() {
  const content = [];
  const kinds = ["sceneHeading", "action", "character", "dialogue", "parenthetical", "transition", "authorNote"];
  for (let sceneIndex = 0; sceneIndex < 10; sceneIndex += 1) {
    kinds.forEach((kind, kindIndex) => {
      const texts = {
        sceneHeading: `INT. ESCENA ${sceneIndex + 1} - DÍA`,
        action: `Acción verificable de la escena ${sceneIndex + 1}.`,
        character: `PERSONA ${sceneIndex + 1}`,
        dialogue: `Diálogo de la escena ${sceneIndex + 1}.`,
        parenthetical: "(en voz baja)",
        transition: "CORTE A:",
        authorNote: `Nota de la escena ${sceneIndex + 1}.`,
      };
      content.push({
        type: "screenplayBlock",
        attrs: { id: stableWriterId(sceneIndex * kinds.length + kindIndex + 1), kind },
        content: [{ type: "text", text: texts[kind] }],
      });
    });
  }
  return { type: "doc", content };
}

function makePulseDenseWriterDocument() {
  const content = [];
  pulseDenseFixture.scenes.forEach((scene, index) => {
    content.push({
      type: "screenplayBlock",
      attrs: { id: stableWriterId(index * 3 + 1), kind: "sceneHeading" },
      content: [{ type: "text", text: scene.heading }],
    }, {
      type: "screenplayBlock",
      attrs: { id: stableWriterId(index * 3 + 2), kind: "action" },
      content: [{ type: "text", text: scene.action }],
    }, {
      type: "screenplayBlock",
      attrs: { id: stableWriterId(index * 3 + 3), kind: "character" },
      content: [{ type: "text", text: index % 2 ? "TOMÁS" : "MARA" }],
    });
  });
  return { type: "doc", content };
}

function stableWriterId(index) {
  return `11111111-1111-4111-8111-${index.toString(16).padStart(12, "0")}`;
}

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
let workspaceProjects = [];
const workspaceMetricProjectId = "22222222-2222-4222-8222-222222222222";
const workspaceMetricScriptId = "66666666-6666-4666-8666-666666666666";
const workspaceMetricShotlistId = "77777777-7777-4777-8777-777777777777";
const workspaceMetricProductionId = "88888888-8888-4888-8888-888888888888";
const workspaceMetricGroupId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const workspaceMetricShotIds = ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "cccccccc-cccc-4ccc-8ccc-cccccccccccc"];
const workspaceMetricDayId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const workspaceMetricArtifacts = {
  writer_scripts: [{
    id: workspaceMetricScriptId, owner_id: id, project_id: workspaceMetricProjectId,
    title: "LA FRECUENCIA — Guion", document: makeWriterDocument(), updated_at: "2026-10-09T13:00:00Z",
  }],
  writer_shotlists: [{
    id: workspaceMetricShotlistId, owner_id: id, project_id: workspaceMetricProjectId,
    script_id: workspaceMetricScriptId, title: "LA FRECUENCIA — Shotlist", updated_at: "2026-10-09T13:10:00Z",
  }],
  writer_shotlist_groups: [{
    id: workspaceMetricGroupId, owner_id: id, shotlist_id: workspaceMetricShotlistId,
    source_scene_id: "11111111-1111-4111-8111-111111111101",
  }],
  writer_shotlist_shots: workspaceMetricShotIds.map((shotId) => ({
    id: shotId, owner_id: id, shotlist_id: workspaceMetricShotlistId, group_id: workspaceMetricGroupId,
  })),
  storyboard_panels: [{
    id: "99999999-9999-4999-8999-999999999999", owner_id: id, project_id: workspaceMetricProjectId,
    shotlist_id: workspaceMetricShotlistId, shot_id: workspaceMetricShotIds[0],
    current_revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", updated_at: "2026-10-09T13:20:00Z",
  }],
  storyboard_panel_revisions: [{
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", owner_id: id, content_kind: "image",
  }],
  production_plans: [{
    id: workspaceMetricProductionId, owner_id: id, project_id: workspaceMetricProjectId,
    name: "Plan de rodaje", updated_at: "2026-10-09T13:30:00Z",
  }],
  production_days: [{
    id: workspaceMetricDayId, owner_id: id, production_id: workspaceMetricProductionId,
  }],
  production_schedule_items: [{
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff", owner_id: id,
    production_id: workspaceMetricProductionId, day_id: workspaceMetricDayId,
    source_shot_id: workspaceMetricShotIds[0],
  }],
  production_document_exports: [{
    id: "10101010-1010-4010-8010-101010101010", owner_id: id,
    production_id: workspaceMetricProductionId, document_key: "pack",
    version_major: 1, version_minor: 2, generated_at: "2026-10-09T13:40:00Z",
  }],
};
const workspaceSpotProjectId = "44444444-4444-4444-8444-444444444444";
const workspaceSpotScriptId = "66666666-6666-4666-8666-666666666667";
const workspaceSpotShotlistId = "77777777-7777-4777-8777-777777777778";
const workspaceSpotProductionId = "88888888-8888-4888-8888-888888888889";
const workspaceSpotGroupId = "dddddddd-dddd-4ddd-8ddd-ddddddddddde";
const workspaceSpotShotId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc";
const workspaceSpotArtifacts = {
  writer_scripts: [{
    id: workspaceSpotScriptId, owner_id: id, project_id: workspaceSpotProjectId,
    title: "SPOT OTOÑO — Guion", document: makeLongWriterDocument(1), updated_at: "2026-10-08T13:00:00Z",
  }],
  writer_shotlists: [{
    id: workspaceSpotShotlistId, owner_id: id, project_id: workspaceSpotProjectId,
    script_id: workspaceSpotScriptId, title: "SPOT OTOÑO — Shotlist", updated_at: "2026-10-08T13:10:00Z",
  }],
  writer_shotlist_groups: [{
    id: workspaceSpotGroupId, owner_id: id, shotlist_id: workspaceSpotShotlistId,
    source_scene_id: "11111111-1111-4111-8111-000000000001",
  }],
  writer_shotlist_shots: [{
    id: workspaceSpotShotId, owner_id: id, shotlist_id: workspaceSpotShotlistId, group_id: workspaceSpotGroupId,
  }],
  storyboard_panels: [],
  storyboard_panel_revisions: [],
  production_plans: [{
    id: workspaceSpotProductionId, owner_id: id, project_id: workspaceSpotProjectId,
    name: "Plan comercial", updated_at: "2026-10-08T13:30:00Z",
  }],
  production_days: [{
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", owner_id: id, production_id: workspaceSpotProductionId,
  }],
  production_schedule_items: [],
  production_document_exports: [{
    id: "20202020-2020-4020-8020-202020202020", owner_id: id,
    production_id: workspaceSpotProductionId, document_key: "pack",
    version_major: 2, version_minor: 1, generated_at: "2026-10-08T13:40:00Z",
  }],
};

function workspaceRowsForRequest(rows, url) {
  return rows.filter((row) => ["id", "project_id", "shotlist_id", "production_id"].every((field) => {
    const filter = url.searchParams.get(field);
    if (!filter) return true;
    if (filter.startsWith("eq.")) return String(row[field]) === filter.slice(3);
    if (filter.startsWith("in.(") && filter.endsWith(")")) {
      return filter.slice(4, -1).split(",").includes(String(row[field]));
    }
    return true;
  }));
}
const shotlistId = "44444444-4444-4444-8444-444444444444";
const shotlistGroups = [
  { id: "44444444-4444-4444-8444-444444444401", shotlist_id: shotlistId, source_scene_id: null, source_scene_title: null, title: "INT. RADIO K-17 / CABINA — NOCHE", position: 0, source_status: "manual", revision: 1 },
  { id: "44444444-4444-4444-8444-444444444402", shotlist_id: shotlistId, source_scene_id: null, source_scene_title: null, title: "EXT. AZOTEA — AMANECER", position: 1, source_status: "manual", revision: 1 },
];
const shotlistShots = Array.from({ length: 8 }, (_, index) => ({
  id: `44444444-4444-4444-8444-${String(index + 100).padStart(12, "0")}`,
  shotlist_id: shotlistId,
  group_id: shotlistGroups[index < 5 ? 0 : 1].id,
  source_block_id: null,
  origin: "manual",
  shot_type: ["Plano general", "Plano medio", "Primer plano"][index % 3],
  composition: index % 2 ? "Regla de tercios" : "Centrada",
  subject: ["Mara entra en cuadro", "El técnico revisa la consola", "La alarma cambia a rojo"][index % 3],
  angle: index % 3 === 2 ? "Picado" : "A nivel",
  movement: index % 3 === 0 ? "Travelling lateral" : "Fijo",
  support: index % 3 === 0 ? "Dolly" : "Trípode",
  lens: ["24 mm", "50 mm", "85 mm"][index % 3],
  setup: String.fromCharCode(65 + (index % 3)),
  duration_seconds: 4 + index,
  status: index % 4 === 0 ? "ready" : "pending",
  description: "Cobertura de prueba local para verificar la Beta UX sin tocar datos reales.",
  intention: null,
  notes: index % 3 === 0 ? "Confirmar continuidad y reflejos." : null,
  asset_id: null,
  position: index < 5 ? index : index - 5,
  source_revision: null,
  revision: 1,
}));
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
      workspaceProjects = scenario === "workspace-multiple" || scenario === "workspace-master-detail" ? [{
        id: "22222222-2222-4222-8222-222222222222",
        owner_id: id,
        title: "LA FRECUENCIA",
        slug: "la-frecuencia",
        summary: "Un cortometraje sobre lo que nos conecta.",
        project_type: "Cortometraje",
        lifecycle_status: "draft",
        create_enabled: true,
        entry_module: "production",
        cover_image_path: null,
        updated_at: "2026-10-09T12:00:00Z",
        created_at: "2026-10-08T12:00:00Z",
      }, {
        id: "44444444-4444-4444-8444-444444444444",
        owner_id: id,
        title: "SPOT OTOÑO",
        slug: "spot-otono",
        summary: "Campaña estacional.",
        project_type: "Publicidad",
        lifecycle_status: "draft",
        create_enabled: true,
        entry_module: "shotlist",
        cover_image_path: null,
        updated_at: "2026-10-08T10:00:00Z",
        created_at: "2026-10-07T12:00:00Z",
      }, {
        id: "55555555-5555-4555-8555-555555555555",
        owner_id: id,
        title: "DOCUMENTAL SUR",
        slug: "documental-sur",
        summary: "Historias del sur.",
        project_type: "Documental",
        lifecycle_status: "draft",
        create_enabled: true,
        entry_module: "writer",
        cover_image_path: null,
        updated_at: "2026-10-07T09:00:00Z",
        created_at: "2026-10-06T12:00:00Z",
      }] : scenario === "workspace-populated" || scenario === "workspace-metrics" ? [{
        id: "22222222-2222-4222-8222-222222222222",
        owner_id: id,
        title: "LA FRECUENCIA",
        slug: "la-frecuencia",
        lifecycle_status: "draft",
        create_enabled: true,
        entry_module: "production",
        cover_image_path: null,
        updated_at: "2026-10-09T12:00:00Z",
        created_at: "2026-10-08T12:00:00Z",
      }] : [];
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
    if (scenario === "shotlist-ux") {
      if (url.pathname === "/rest/v1/writer_shotlists" && req.method === "GET") {
        const row = { id: shotlistId, script_id: null, title: "LA FRECUENCIA — Shotlist Beta", source_revision: null, revision: 1, updated_at: "2026-10-06T12:00:00Z" };
        return res.end(req.headers.accept?.includes("vnd.pgrst.object") ? JSON.stringify(row) : JSON.stringify([row]));
      }
      if (url.pathname === "/rest/v1/writer_shotlist_groups" && req.method === "GET") return res.end(JSON.stringify(shotlistGroups));
      if (url.pathname === "/rest/v1/writer_shotlist_shots" && req.method === "GET") return res.end(JSON.stringify(shotlistShots));
    }
    if (scenario === "unconfigured") {
      res.statusCode = 404;
      return res.end('{"code":"PGRST202","message":"fixture missing schema"}');
    }
    if (scenario === "failure") {
      res.statusCode = 500;
      return res.end('{"code":"XX000","message":"fixture transport error"}');
    }
    if (scenario.startsWith("workspace-")) {
      const single = req.headers.accept?.includes("vnd.pgrst.object");
      if (url.pathname === "/rest/v1/rpc/create_workspace_project_v1" && req.method === "POST") {
        const body = await readJson(req);
        const existing = workspaceProjects.find((item) => item.creation_operation_id === body.p_operation_id);
        if (existing) return res.end(JSON.stringify(existing.id));
        const nextId = "33333333-3333-4333-8333-333333333333";
        workspaceProjects.push({ id: nextId, owner_id: id, title: body.p_title, slug: "nuevo-proyecto", lifecycle_status: "draft", create_enabled: true, entry_module: body.p_entry_module, cover_image_path: null, updated_at: new Date().toISOString(), created_at: new Date().toISOString(), creation_operation_id: body.p_operation_id });
        return res.end(JSON.stringify(nextId));
      }
      if (url.pathname === "/rest/v1/projects" && req.method === "GET") {
        const requestedId = url.searchParams.get("id")?.replace(/^eq\./u, "");
        const rows = requestedId ? workspaceProjects.filter((item) => item.id === requestedId) : workspaceProjects;
        return res.end(JSON.stringify(single ? rows[0] ?? null : rows));
      }
      if ((scenario === "workspace-metrics" || scenario === "workspace-master-detail") && req.method === "GET") {
        const table = url.pathname.replace(/^\/rest\/v1\//u, "");
        if (Object.hasOwn(workspaceMetricArtifacts, table)) {
          const rows = workspaceRowsForRequest([
            ...workspaceMetricArtifacts[table],
            ...(scenario === "workspace-master-detail" ? workspaceSpotArtifacts[table] : []),
          ], url);
          return res.end(JSON.stringify(single ? rows[0] ?? null : rows));
        }
      }
      if (["writer_scripts", "writer_shotlists", "storyboard_panels", "production_plans", "production_document_exports"].some((table) => url.pathname === `/rest/v1/${table}`)) {
        return res.end(JSON.stringify(single ? null : []));
      }
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

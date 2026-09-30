import test from "node:test";
import assert from "node:assert/strict";
import { checked, withTestUsers } from "./test-project.mjs";

const publicSearch = (client, query) =>
  client.rpc("list_public_opportunities", {
    p_q: query,
    p_category: null,
    p_city: null,
    p_compensation: null,
    p_work_mode: null,
    p_offset: 0,
    p_limit: 25,
    p_jobs_only: false,
    p_currency: null,
    p_budget_min: null,
    p_deadline_from: null,
  });

const projectPayload = (title, lifecycle_status, visibility) => ({
  title,
  slug: title,
  summary: "Proyecto temporal de integración.",
  description: "Proyecto desechable para validar los límites públicos.",
  project_type: "Cortometraje",
  client_name: "",
  share_client_name: false,
  client_type: "Proyecto personal",
  city: "Ciudad de México",
  work_area: "",
  shooting_schedule: "day",
  economic_mode: "paid",
  date_window: "",
  starts_on: null,
  ends_on: null,
  dates_confirmed: false,
  roles: ["Edición"],
  requirements: { themes: [], participation: [], conditions: [] },
  operational_status: "active",
  lifecycle_status,
  visibility,
});

const opportunityPayload = (title, projectId = null, opportunityType = "opportunity") => ({
  title,
  project_id: projectId,
  summary: "Convocatoria temporal de integración.",
  description: "Convocatoria temporal con suficiente contexto para validación remota.",
  category: opportunityType === "job" ? "paid_work" : "crew",
  discipline: "Edición",
  city: "Ciudad de México",
  work_mode: "remote",
  compensation_type: "paid",
  compensation_min: 1500,
  compensation_max: 2500,
  compensation_currency: "MXN",
  starts_on: null,
  ends_on: null,
  application_deadline: "2099-01-01T23:59:59Z",
  opportunity_type: opportunityType,
  deliverables: opportunityType === "job" ? "Montaje final y una revisión." : null,
});

test("Search, Projects and historical independent Job inboxes coexist in Supabase Test", async () =>
  withTestUsers(async ({ prefix, anon, owner, stranger }) => {
    const independentTitle = `Independiente ${prefix}`;
    const independentId = checked(
      await owner.client.rpc("save_my_opportunity", {
        p_id: null,
        p_data: opportunityPayload(independentTitle, null, "job"),
        p_project_title: null,
        p_status: "published",
      }),
    );
    const independent = checked(
      await owner.client
        .from("opportunities")
        .select("id,slug,project_id")
        .eq("id", independentId)
        .single(),
    );
    assert.equal(independent.project_id, null);

    const independentRows = checked(await publicSearch(anon, independentTitle));
    assert.equal(independentRows.length, 1);
    assert.equal(independentRows[0].project_title, null);
    assert.equal(independentRows[0].project_slug, null);

    checked(
      await stranger.client.rpc("save_my_professional_profile", {
        p_disciplines: ["Edición"],
        p_city: "Ciudad de México",
        p_bio: "Perfil temporal para probar el inbox histórico.",
        p_availability: "available",
        p_skills: [],
        p_equipment: [],
        p_portfolio_items: [],
        p_is_public: true,
        p_contact_policy: "members_only",
      }),
    );
    const inquiryId = checked(
      await stranger.client.rpc("send_job_inquiry", {
        p_slug: independent.slug,
        p_message: "Mensaje temporal para validar la publicación independiente.",
      }),
    );
    const inbox = checked(
      await stranger.client.rpc("list_my_catalog_inquiries", { p_page: 1 }),
    ).find((item) => item.id === inquiryId);
    assert.equal(inbox?.target_title, independentTitle);
    assert.equal(inbox?.target_href, `/oportunidades/${independent.slug}`);

    const projectTitle = `Privado ${prefix}`;
    const projectId = checked(
      await owner.client.rpc("save_my_project_v15", {
        p_id: null,
        p_data: projectPayload(projectTitle, "draft", "private"),
      }),
    );
    const linkedTitle = `Vinculada ${prefix}`;
    checked(
      await owner.client.rpc("save_my_opportunity", {
        p_id: null,
        p_data: opportunityPayload(linkedTitle, projectId),
        p_project_title: null,
        p_status: "published",
      }),
    );
    assert.equal(checked(await publicSearch(anon, linkedTitle)).length, 0);

    checked(
      await owner.client.rpc("save_my_project_v15", {
        p_id: projectId,
        p_data: projectPayload(projectTitle, "active", "public"),
      }),
    );
    const linkedRows = checked(await publicSearch(anon, linkedTitle));
    assert.equal(linkedRows.length, 1);
    assert.equal(linkedRows[0].project_title, projectTitle);

    const convertibleId = checked(
      await owner.client.rpc("save_my_opportunity", {
        p_id: null,
        p_data: opportunityPayload(`Convertible ${prefix}`),
        p_project_title: null,
        p_status: "draft",
      }),
    );
    const firstProject = checked(
      await owner.client.rpc("convert_my_opportunity_to_project", {
        p_opportunity_id: convertibleId,
      }),
    );
    const retryProject = checked(
      await owner.client.rpc("convert_my_opportunity_to_project", {
        p_opportunity_id: convertibleId,
      }),
    );
    assert.equal(retryProject, firstProject);
  }));

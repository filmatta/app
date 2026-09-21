import test from "node:test";
import assert from "node:assert/strict";
import { withTestUsers, checked, verifyTestAdminMfa } from "./test-project.mjs";
test("real Jobs use Opportunities ownership, paid subset, dates and shared private inbox", async () =>
  withTestUsers(async ({ prefix, anon, owner, stranger, admin, outsider }) => {
    const values = {
      title: `Encargo ${prefix}`,
      opportunity_type: "job",
      category: "paid_work",
      compensation_type: "paid",
      work_mode: "remote",
      city: prefix,
      description:
        "Edición y revisión de un cortometraje audiovisual de ficción.",
      deliverables:
        "Montaje final y dos revisiones con archivos de exportación.",
      discipline: "Edición",
      compensation_min: 1500.25,
      compensation_max: 2000,
      compensation_currency: "MXN",
      application_deadline: "2099-01-01T23:59:59Z",
    };
    const args = {
      p_id: null,
      p_data: values,
      p_project_title: `Proyecto ${prefix}`,
      p_status: "draft",
    };
    assert.ok((await anon.rpc("save_my_opportunity", args)).error);
    const id = checked(await owner.client.rpc("save_my_opportunity", args));
    const row = checked(
      await owner.client
        .from("opportunities")
        .select("id,slug,owner_id,project_id")
        .eq("id", id)
        .single(),
    );
    assert.equal(row.owner_id, owner.id);
    assert.equal(
      checked(await anon.from("opportunities").select("id").eq("id", id))
        .length,
      0,
    );
    assert.equal(checked(await admin.client.from("opportunities").select("id").eq("id", id)).length, 0,
      "Admin AAL1 cannot read another owner's draft");
    await verifyTestAdminMfa(admin);
    assert.equal(checked(await admin.client.from("opportunities").select("id").eq("id", id)).length, 1,
      "Admin AAL2 can read the draft");
    assert.ok(
      (
        await stranger.client.rpc("save_my_opportunity", {
          ...args,
          p_id: id,
          p_status: "published",
        })
      ).error,
    );
    assert.equal(
      checked(
        await stranger.client
          .from("opportunities")
          .update({ title: "Forged" })
          .eq("id", id)
          .select("id"),
      ).length,
      0,
    );
    for (const invalid of [
      { deliverables: null },
      { compensation_min: 0 },
      { discipline: null },
      { application_deadline: null },
    ])
      assert.ok(
        (
          await owner.client.rpc("save_my_opportunity", {
            ...args,
            p_id: id,
            p_data: { ...values, ...invalid },
            p_status: "published",
          })
        ).error,
      );
    checked(
      await owner.client.rpc("save_my_opportunity", {
        ...args,
        p_id: id,
        p_status: "published",
      }),
    );
    // A generic paid opportunity must not silently become a Job.
    checked(
      await owner.client.rpc("save_my_opportunity", {
        ...args,
        p_data: { ...values, opportunity_type: "opportunity" },
        p_status: "published",
      }),
    );
    const query = () =>
      anon
        .from("opportunities")
        .select("id,slug,deliverables,projects!inner(id)")
        .eq("status", "published")
        .eq("projects.status", "published")
        .eq("opportunity_type", "job")
        .eq("compensation_type", "paid")
        .eq("city", prefix)
        .eq("compensation_currency", "MXN")
        .order("published_at", { ascending: false })
        .order("id");
    assert.equal(
      checked(
        await query()
          .gte("compensation_min", 1500)
          .gte("application_deadline", "2090-01-01")
          .range(0, 24),
      ).length,
      1,
    );
    assert.equal(
      checked(await query().gte("compensation_min", 1600)).length,
      0,
    );
    assert.equal(checked(await query().range(24, 48)).length, 0);
    const message =
      "Presento mi experiencia audiovisual y mi interés por este encargo.";
    assert.ok(
      (
        await anon.rpc("send_job_inquiry", {
          p_slug: row.slug,
          p_message: message,
        })
      ).error,
    );
    assert.ok(
      (
        await stranger.client.rpc("send_job_inquiry", {
          p_slug: row.slug,
          p_message: message,
        })
      ).error,
    );
    checked(
      await stranger.client.rpc("save_my_professional_profile", {
        p_disciplines: ["Edición"],
        p_city: prefix,
        p_bio: "Perfil desechable",
        p_availability: "available",
        p_skills: [],
        p_equipment: [],
        p_portfolio_items: [],
        p_is_public: true,
        p_contact_policy: "members_only",
      }),
    );
    const inquiry = checked(
      await stranger.client.rpc("send_job_inquiry", {
        p_slug: row.slug,
        p_message: message,
      }),
    );
    assert.ok(
      (
        await stranger.client.rpc("send_job_inquiry", {
          p_slug: row.slug,
          p_message: message,
        })
      ).error,
    );
    assert.equal(
      checked(
        await outsider.client
          .from("catalog_inquiries")
          .select("id")
          .eq("id", inquiry),
      ).length,
      0,
    );
    assert.equal(
      checked(await outsider.client.rpc("list_my_catalog_inquiries")).length,
      0,
    );
    assert.equal(
      checked(
        await stranger.client
          .from("catalog_inquiries")
          .update({ status: "accepted" })
          .eq("id", inquiry)
          .select("id"),
      ).length,
      0,
    );
    assert.ok(
      (
        await owner.client
          .from("catalog_inquiries")
          .update({ sender_id: owner.id })
          .eq("id", inquiry)
      ).error,
    );
    checked(
      await owner.client
        .from("catalog_inquiries")
        .update({ status: "accepted" })
        .eq("id", inquiry),
    );
    assert.equal(
      checked(await stranger.client.rpc("list_my_catalog_inquiries"))[0].status,
      "accepted",
    );
    checked(
      await owner.client.rpc("save_my_opportunity", {
        ...args,
        p_id: id,
        p_data: { ...values, application_deadline: "2001-01-01T23:59:59Z" },
        p_status: "published",
      }),
    );
    assert.ok(
      (
        await stranger.client.rpc("send_job_inquiry", {
          p_slug: row.slug,
          p_message: message,
        })
      ).error,
    );
    for (const status of ["closed", "draft", "published", "archived"]) {
      checked(
        await owner.client.rpc("save_my_opportunity", {
          ...args,
          p_id: id,
          p_status: status,
        }),
      );
      assert.equal(
        checked(await anon.from("opportunities").select("id").eq("id", id))
          .length,
        status === "published" ? 1 : 0,
      );
    }
    const received = checked(
      await stranger.client.rpc("list_my_catalog_inquiries"),
    )[0];
    assert.equal(received.target_href, null);
    assert.equal(received.target_title, "Publicación no disponible");
  }));

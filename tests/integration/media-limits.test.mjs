import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  TEST_REF,
  testContext,
  testSql,
} from "../../tools/portfolio-test-context.mjs";

const run = `media-limits-${randomUUID()}`;
const c = await testContext();
const users = [];
const storagePaths = [];

function ok(result, label) {
  assert.equal(result.error, null, label);
  return result.data;
}

function uuid(value) {
  assert.match(value, /^[0-9a-f-]{36}$/i);
  return value;
}

async function fixture(label) {
  const email = `${run}-${label}@example.invalid`;
  const password = randomBytes(24).toString("base64url") + "aA1!";
  const created = ok(
    await c.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Media Limits ${label}`, qa_run: run },
    }),
    "create disposable Test user",
  ).user;
  const client = c.client(c.anonKey);
  ok(await client.auth.signInWithPassword({ email, password }), "sign in disposable Test user");
  ok(
    await client.rpc("save_my_professional_profile", {
      p_disciplines: ["Dirección"],
      p_city: "QA Test",
      p_bio: "Perfil ficticio temporal para validar límites de media.",
      p_availability: "available",
      p_skills: [],
      p_equipment: [],
      p_portfolio_items: [],
      p_is_public: false,
      p_contact_policy: "closed",
    }),
    "create disposable profile",
  );
  ok(await client.rpc("initialize_my_profile_media"), "initialize disposable media");
  const user = { id: uuid(created.id), email, client };
  users.push(user);
  return user;
}

const external = (category = "work", title = "QA video") => ({
  category,
  title,
  role: category === "reel" ? "Reel" : "Dirección",
  year: "2026",
  description: "Fixture temporal",
  media_type: "video",
  source: "external",
  url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
  featured: false,
});
const mux = (category = "work") => ({
  ...external(category),
  source: "mux",
  url: "",
});
const book = {
  category: "book",
  title: "QA Book",
  role: "",
  year: "2026",
  description: "Fixture temporal",
  media_type: "image",
  source: "storage",
  url: "",
  featured: false,
};

async function save(user, data) {
  return user.client.rpc("save_my_profile_media", { p_id: null, p_data: data });
}
async function reserve(user, data, size, mime, extension) {
  return user.client.rpc("reserve_my_profile_upload", {
    p_data: data,
    p_size: size,
    p_mime: mime,
    p_extension: extension,
  });
}
async function manage(user, id, action) {
  return user.client.rpc("manage_my_profile_media", {
    p_id: id,
    p_action: action,
    p_target: null,
  });
}
function clear(owner) {
  testSql(`delete from public.profile_media where owner_id='${uuid(owner.id)}'`);
}

test(
  "Supabase Test enforces Free profile media limits and cleans every fixture",
  async () => {
    assert.equal(process.env.FILMATTA_RUN_REMOTE_TESTS, TEST_REF);
    const owner = await fixture("owner");
    const stranger = await fixture("stranger");
    const checks = {};
    try {
      assert.equal(ok(await owner.client.rpc("get_my_billing_plan"), "Free plan"), null);

      ok(await save(owner, external("reel", "Reel one")), "first Reel");
      assert.match((await save(owner, external("reel", "Reel two"))).error.message, /FREE_REEL_LIMIT/);
      checks.reel = "PASS";
      clear(owner);

      ok(await save(owner, external("work", "External one")), "external video one");
      ok(await save(owner, external("work", "External two")), "external video two");
      assert.match((await save(owner, external("work", "External three"))).error.message, /FREE_VIDEO_LIMIT/);
      checks.videos = "PASS";
      checks.externalLinks = "PASS";
      clear(owner);

      ok(await save(owner, external("work", "Existing slot")), "existing video slot");
      const simultaneous = await Promise.all([
        save(owner, external("work", "Concurrent A")),
        save(owner, external("work", "Concurrent B")),
      ]);
      assert.equal(simultaneous.filter((result) => !result.error).length, 1);
      assert.equal(simultaneous.filter((result) => result.error?.message.includes("FREE_VIDEO_LIMIT")).length, 1);
      checks.concurrency = "PASS";
      clear(owner);

      const pending = ok(await reserve(owner, mux(), 1_000, "video/mp4", "mp4"), "pending slot");
      testSql(`update public.profile_media set status='processing' where id='${uuid(pending)}' and owner_id='${owner.id}'`);
      ok(await reserve(owner, mux(), 1_000, "video/mp4", "mp4"), "second pending slot");
      assert.match((await reserve(owner, mux(), 1_000, "video/mp4", "mp4")).error.message, /FREE_VIDEO_LIMIT|Pending upload limit/);
      checks.pendingProcessing = "PASS";
      clear(owner);

      assert.ok(ok(await reserve(owner, mux(), 2_000_000_000, "video/mp4", "mp4"), "2 GB accepted"));
      assert.match((await reserve(owner, mux(), 2_000_000_001, "video/mp4", "mp4")).error.message, /FREE_VIDEO_FILE_LIMIT/);
      checks.fileSize = "PARTIAL";
      clear(owner);

      const exact = ok(await reserve(owner, mux(), 1_000, "video/mp4", "mp4"), "duration fixture");
      testSql(`update public.profile_media set status='ready',duration_seconds=300 where id='${uuid(exact)}' and owner_id='${owner.id}'`);
      ok(await manage(owner, exact, "reel"), "300 second Reel");
      clear(owner);
      const tooLong = ok(await reserve(owner, mux(), 1_000, "video/mp4", "mp4"), "long duration fixture");
      testSql(`update public.profile_media set status='ready',duration_seconds=300.01 where id='${uuid(tooLong)}' and owner_id='${owner.id}'`);
      assert.match((await manage(owner, tooLong, "reel")).error.message, /FREE_VIDEO_DURATION_LIMIT/);
      checks.duration = "PASS";
      clear(owner);

      const oldReel = ok(await save(owner, external("reel", "Old Reel")), "old Reel");
      const candidate = ok(await save(owner, external("work", "Existing candidate")), "existing candidate");
      ok(await manage(owner, candidate, "reel"), "select existing asset as Reel");
      const categories = ok(
        await owner.client.from("profile_media").select("id,category").in("id", [oldReel, candidate]),
        "read Reel selection",
      );
      assert.equal(categories.find((row) => row.id === candidate).category, "reel");
      assert.equal(categories.find((row) => row.id === oldReel).category, "work");
      const immutable = await owner.client.rpc("save_my_profile_media", {
        p_id: candidate,
        p_data: mux("reel"),
      });
      assert.match(immutable.error.message, /Media source is immutable/);
      checks.reelSelection = "PASS";
      checks.sourceReplacement = "NOT_SUPPORTED";
      clear(owner);

      let archivedBook;
      let storagePath;
      for (let index = 0; index < 6; index++) {
        const id = ok(await reserve(owner, book, 1_000, "image/jpeg", "jpg"), `Book ${index + 1}`);
        if (index === 0) {
          archivedBook = id;
          storagePath = `${owner.id}/${id}/original.jpg`;
          const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==", "base64");
          ok(
            await owner.client.storage.from("profile-media").upload(storagePath, jpeg, {
              contentType: "image/jpeg",
              upsert: false,
            }),
            "store archived fixture bytes",
          );
      storagePaths.push(storagePath);
        }
        testSql(`update public.profile_media set status='ready' where id='${uuid(id)}' and owner_id='${owner.id}'`);
      }
      assert.match((await reserve(owner, book, 1_000, "image/jpeg", "jpg")).error.message, /FREE_BOOK_LIMIT/);
      ok(await manage(owner, archivedBook, "archive"), "archive Book asset");
      assert.ok(ok(await c.admin.storage.from("profile-media").download(storagePath), "archived bytes retained"));
      assert.match((await manage(stranger, archivedBook, "restore")).error.message, /Not allowed/);
      assert.equal(
        ok(await stranger.client.from("profile_media").select("id").eq("owner_id", owner.id), "foreign RLS read").length,
        0,
      );
      checks.ownership = "PASS";
      assert.match((await reserve(owner, book, 1_000, "image/jpeg", "jpg")).error.message, /FREE_BOOK_LIMIT/);
      ok(await manage(owner, archivedBook, "restore"), "restore without re-upload");
      ok(await manage(owner, archivedBook, "archive"), "re-archive Book asset");
      testSql(`update public.profile_media set status='deleted' where id='${uuid(archivedBook)}' and owner_id='${owner.id}'`);
      assert.ok(ok(await reserve(owner, book, 1_000, "image/jpeg", "jpg"), "deleted historical row releases slot"));
      checks.book = "PASS";
      checks.archived = "PASS";

      console.log(JSON.stringify({ project: TEST_REF, run, checks }));
    } finally {
      if (storagePaths.length)
        ok(await c.admin.storage.from("profile-media").remove(storagePaths), "remove fixture storage objects");
      for (const user of users) {
        const current = ok(await c.admin.auth.admin.getUserById(user.id), "verify fixture owner").user;
        assert.equal(current.user_metadata.qa_run, run);
        ok(await c.admin.auth.admin.deleteUser(user.id), "delete disposable Test user");
      }
      assert.equal(
        testSql(`select count(*)::int n from auth.users where raw_user_meta_data->>'qa_run'='${run}'`)[0].n,
        0,
      );
      assert.equal(
        testSql(`select count(*)::int n from public.profile_media where owner_id in ('${users.map((user) => user.id).join("','")}')`)[0].n,
        0,
      );
      console.log(JSON.stringify({ run, fixturesRemoved: true }));
    }
  },
);

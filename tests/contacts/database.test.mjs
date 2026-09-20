import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const sender = "11111111-1111-4111-8111-111111111111";
const professional = "22222222-2222-4222-8222-222222222222";
const talent = "33333333-3333-4333-8333-333333333333";
const third = "44444444-4444-4444-8444-444444444444";
async function as(role, uid = "") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  if (role !== "postgres") await db.exec(`set role ${role}`);
}

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated; grant usage on schema private to authenticated;
    create table public.profiles(id uuid primary key,role text);`);
  const core = fs.readFileSync("supabase/production/0001_core_learn_prerequisites.sql", "utf8");
  await db.exec(core.match(/create function private\.is_admin\(\)[\s\S]*?\$\$;/)[0]);
  for (const file of [
    "20260910120000_create_professional_profiles.sql",
    "20260910230000_create_locations_opportunities_foundations.sql",
    "20260916010000_public_profile_catalog.sql",
    "20260916020000_opportunity_owner_publishing.sql",
    "20260916030000_services_directory.sql",
    "20260916040000_jobs_specialization.sql",
    "20260922010000_profile_contacts.sql",
  ]) await db.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.query("insert into auth.users(id,raw_user_meta_data) values ($1,$5),($2,$6),($3,$7),($4,$8)", [
    sender, professional, talent, third,
    { full_name: "Ana Remitente", email: "private-sender@example.invalid" },
    { full_name: "Bruno Privado", phone: "555-secret" },
    { full_name: "Carla Privada" }, { full_name: "Tercero Privado" },
  ]);
  await db.query("insert into profiles values ($1,'user'),($2,'user'),($3,'user'),($4,'user')", [sender, professional, talent, third]);
  await db.query(`insert into professional_profiles(user_id,slug,display_name,disciplines,is_public,contact_policy)
    values($1,'bruno-pro','Bruno P.',array['Dirección'],true,'members_only'),
      ($2,'carla-talento','Carla P.',array['Actuación','Modelaje'],true,'members_only')`, [professional, talent]);
});
after(() => db.close());

test("anon, self contact, closed and draft profiles are rejected without enumeration", async () => {
  await as("anon");
  await assert.rejects(db.query("select send_profile_contact('bruno-pro','professional_interest','Mensaje válido para iniciar contacto profesional.')"), /permission denied/);
  await as("authenticated", professional);
  await assert.rejects(db.query("select send_profile_contact('bruno-pro','other','Mensaje válido dirigido a la misma persona propietaria.')"), /unavailable/);
  await as("postgres");
  await db.query("update professional_profiles set contact_policy='closed' where user_id=$1", [talent]);
  await as("authenticated", sender);
  await assert.rejects(db.query("select send_profile_contact('carla-talento','casting','Invitación válida para un casting audiovisual concreto.')"), /unavailable/);
  await as("postgres");
  await db.query("update professional_profiles set contact_policy='members_only',is_public=false where user_id=$1", [talent]);
  await as("authenticated", sender);
  await assert.rejects(db.query("select send_profile_contact('carla-talento','casting','Invitación válida para un casting audiovisual concreto.')"), /unavailable/);
  await as("postgres");
  await db.query("update professional_profiles set is_public=true where user_id=$1", [talent]);
});

test("profile and Talent use one private contact architecture with safe identities", async () => {
  await as("authenticated", sender);
  const first = (await db.query("select send_profile_contact('bruno-pro','project_invitation','Quiero invitarte a conversar sobre un cortometraje independiente.') id")).rows[0].id;
  const second = (await db.query("select send_profile_contact('carla-talento','casting','Tenemos un casting y nos interesa conocer tu disponibilidad actual.') id")).rows[0].id;
  const sent = (await db.query("select * from list_my_profile_contacts('sent')")).rows;
  assert.deepEqual(new Set(sent.map(row => row.source_type)), new Set(["profile", "talent"]));
  assert.doesNotMatch(JSON.stringify(sent), /private-sender@|555-secret|raw_user_meta_data/);
  await assert.rejects(db.query("select send_profile_contact('bruno-pro','other','Otro mensaje inmediato al mismo perfil profesional.')"), /cooldown/);
  await assert.rejects(db.query("insert into catalog_inquiries(profile_id,sender_id,recipient_id,message,status,source_type,contact_type,sender_display_name) values($1,$2,$1,'Intento directo no autorizado con suficientes caracteres','sent','profile','other','Falso')", [professional, third]), /permission denied/);
  await as("authenticated", third);
  assert.equal((await db.query("select * from get_my_profile_contact($1)", [first])).rows.length, 0);
  assert.equal((await db.query("select * from catalog_inquiries")).rows.length, 0);
  await as("authenticated", professional);
  const received = (await db.query("select * from get_my_profile_contact($1)", [first])).rows[0];
  assert.equal(received.counterpart_name, "Ana R.");
  assert.equal(received.is_recipient, true);
  assert.equal((await db.query("select mark_profile_contact_read($1) ok", [first])).rows[0].ok, true);
  assert.equal((await db.query("select respond_profile_contact($1,'Gracias por escribir. Me interesa conocer fechas y condiciones.') ok", [first])).rows[0].ok, true);
  assert.equal((await db.query("select respond_profile_contact($1,'Esta segunda respuesta ya no debe aceptarse en V1.') ok", [first])).rows[0].ok, false);
  await as("authenticated", sender);
  const answered = (await db.query("select * from get_my_profile_contact($1)", [first])).rows[0];
  assert.match(answered.response_message, /Gracias por escribir/);
  assert.equal((await db.query("select manage_profile_contact($1,'archive',null) ok", [first])).rows[0].ok, true);
  assert.equal((await db.query("select count(*)::int n from list_my_profile_contacts('sent') where id=$1", [first])).rows[0].n, 0);
  assert.equal((await db.query("select manage_profile_contact($1,'report','Contenido no relevante para mi trabajo') ok", [second])).rows[0].ok, true);
  assert.equal((await db.query("select reported from get_my_profile_contact($1)", [second])).rows[0].reported, true);
});

test("daily rate limit is shared with the existing catalog inquiry foundation", async () => {
  await as("postgres");
  for (let i = 0; i < 9; i++) {
    const id = `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12,"0")}`;
    await db.query("insert into auth.users(id) values($1)", [id]);
    await db.query("insert into professional_profiles(user_id,slug,display_name,disciplines,is_public) values($1,$2,$3,array['Cámara'],true)", [id, `rate-${i}`, `Rate ${i}`]);
  }
  await as("authenticated", sender);
  for (let i = 0; i < 8; i++) await db.query("select send_profile_contact($1,'other',$2)", [`rate-${i}`, `Consulta número ${i} para validar el límite diario compartido.`]);
  await assert.rejects(db.query("select send_profile_contact('rate-8','other','Consulta adicional que debe exceder el límite diario compartido.')"), /Daily inquiry limit/);
});

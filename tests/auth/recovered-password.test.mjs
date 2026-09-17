import assert from "node:assert/strict";
import test from "node:test";
import load from "../load.mjs";

function actionsWith(client) {
  return load("app/cuenta/actions.ts", {
    "next/cache": { revalidatePath() {} },
    "next/headers": {
      async headers() {
        return new Headers({ origin: "https://app.filmatta.com" });
      },
    },
    "next/navigation": {
      redirect(destination) {
        throw Object.assign(new Error("NEXT_REDIRECT"), { destination });
      },
    },
    "@/lib/auth/safe-next-path": load("lib/auth/safe-next-path.ts"),
    "@/lib/security/auth-rate-limit": {
      async allowAuthAttempt() {
        return true;
      },
    },
    "@/lib/supabase/server": {
      async createClient() {
        return client;
      },
    },
  });
}

function passwordForm() {
  const form = new FormData();
  form.set("password", "secure-password");
  form.set("password_confirmation", "secure-password");
  form.set("next", "/cuenta");
  return form;
}

test("recovered password update is rejected without a valid session", async () => {
  let updateCalls = 0;
  const actions = actionsWith({
    auth: {
      async getUser() {
        return { data: { user: null }, error: new Error("no session") };
      },
      async updateUser() {
        updateCalls += 1;
        return { error: null };
      },
    },
  });

  await assert.rejects(
    actions.updateRecoveredPassword(passwordForm()),
    (error) => error.destination === "/login?next=%2Frestablecer-contrasena",
  );
  assert.equal(updateCalls, 0);
});

test("recovered password update is allowed with a valid session", async () => {
  const updates = [];
  const actions = actionsWith({
    auth: {
      async getUser() {
        return { data: { user: { id: "user-id" } }, error: null };
      },
      async updateUser(value) {
        updates.push(value);
        return { error: null };
      },
    },
  });

  await assert.rejects(
    actions.updateRecoveredPassword(passwordForm()),
    (error) =>
      error.destination === "/cuenta?password=updated#configuracion",
  );
  assert.equal(updates.length, 1);
  assert.equal(updates[0].password, "secure-password");
});

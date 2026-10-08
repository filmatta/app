"use server";

import { createClient } from "@/lib/supabase/server";
import { createProject, CreateProjectError } from "@/lib/create/project";

export async function createProjectAction(name: string, operationId: string): Promise<
  | { ok: true; id: string; writerId: string }
  | { ok: false; message: string }
> {
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) return { ok: false, message: "Inicia sesión para crear un proyecto." };
  try {
    const result = await createProject(db, auth.data.user.id, name, operationId);
    return { ok: true, ...result };
  } catch (cause) {
    if (cause instanceof CreateProjectError) return { ok: false, message: cause.message };
    return { ok: false, message: "No pudimos crear el proyecto." };
  }
}

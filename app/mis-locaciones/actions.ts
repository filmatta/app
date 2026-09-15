"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getLocationDatabaseError,
  parseLocationFormData,
  type LocationFormError,
  type LocationStatus,
  type LocationSuccess,
} from "@/lib/locations/form";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ExistingLocation = {
  id: string;
  slug: string;
  status: LocationStatus;
};

export async function createLocation(formData: FormData) {
  const { supabase, userId } = await requireLocationUser(
    "/mis-locaciones/nueva"
  );
  const intent = getText(formData, "intent");

  if (intent !== "draft" && intent !== "published") {
    redirect(newLocationFeedback("invalid-action"));
  }

  const parsed = parseLocationFormData(formData);
  if (!parsed.ok) {
    redirect(newLocationFeedback(parsed.error));
  }

  const { data, error } = await supabase
    .from("locations")
    .insert({
      ...parsed.values,
      owner_id: userId,
      status: intent,
    })
    .select("id, slug")
    .single();

  if (error || !data) {
    logLocationError("Error creando la locación:", error);
    redirect(newLocationFeedback(getLocationDatabaseError(error)));
  }

  revalidateLocationPaths(data.slug);
  redirect(
    locationsFeedback(
      intent === "published" ? "created-published" : "created-draft"
    )
  );
}

export async function updateLocation(locationId: string, formData: FormData) {
  if (!UUID_PATTERN.test(locationId)) {
    redirect(locationsErrorFeedback("not-found"));
  }

  const editPath = `/mis-locaciones/${locationId}/editar`;
  const { supabase, userId } = await requireLocationUser(editPath);
  const existing = await getOwnedLocation(supabase, userId, locationId);

  if (!existing) {
    redirect(locationsErrorFeedback("not-found"));
  }

  const parsed = parseLocationFormData(formData);
  if (!parsed.ok) {
    redirect(editLocationFeedback(locationId, "error", parsed.error));
  }

  const intent = getText(formData, "intent");
  const nextStatus = getUpdateStatus(intent, existing.status);
  if (!nextStatus) {
    redirect(editLocationFeedback(locationId, "error", "invalid-action"));
  }

  const { data, error } = await supabase
    .from("locations")
    .update({
      ...parsed.values,
      status: nextStatus,
    })
    .eq("id", locationId)
    .eq("owner_id", userId)
    .select("id, slug, status")
    .maybeSingle();

  if (error) {
    logLocationError("Error actualizando la locación:", error);
    redirect(
      editLocationFeedback(
        locationId,
        "error",
        getLocationDatabaseError(error)
      )
    );
  }

  if (!data) {
    redirect(locationsErrorFeedback("not-found"));
  }

  revalidateLocationPaths(existing.slug, data.slug, locationId);
  redirect(
    editLocationFeedback(
      locationId,
      "success",
      getUpdateSuccess(existing.status, nextStatus)
    )
  );
}

export async function archiveLocation(locationId: string) {
  if (!UUID_PATTERN.test(locationId)) {
    redirect(locationsErrorFeedback("not-found"));
  }

  const editPath = `/mis-locaciones/${locationId}/editar`;
  const { supabase, userId } = await requireLocationUser(editPath);
  const existing = await getOwnedLocation(supabase, userId, locationId);

  if (!existing) {
    redirect(locationsErrorFeedback("not-found"));
  }

  const { data, error } = await supabase
    .from("locations")
    .update({ status: "archived" })
    .eq("id", locationId)
    .eq("owner_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    logLocationError("Error archivando la locación:", error);
    redirect(editLocationFeedback(locationId, "error", "archive-failed"));
  }

  if (!data) {
    redirect(locationsErrorFeedback("not-found"));
  }

  revalidateLocationPaths(existing.slug, undefined, locationId);
  redirect(locationsFeedback("archived"));
}

async function requireLocationUser(nextPath: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect(`/acceso?next=${encodeURIComponent(nextPath)}`);
  }

  return { supabase, userId: data.user.id };
}

async function getOwnedLocation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  locationId: string
) {
  const { data, error } = await supabase
    .from("locations")
    .select("id, slug, status")
    .eq("id", locationId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) {
    logLocationError("Error verificando la locación:", error);
    redirect(editLocationFeedback(locationId, "error", "load-failed"));
  }

  return (data as ExistingLocation | null) ?? null;
}

function getUpdateStatus(
  intent: string,
  currentStatus: LocationStatus
): LocationStatus | null {
  if (intent === "preserve") {
    return currentStatus;
  }

  if (intent === "draft" || intent === "published") {
    return intent;
  }

  return null;
}

function getUpdateSuccess(
  previousStatus: LocationStatus,
  nextStatus: LocationStatus
): LocationSuccess {
  if (previousStatus === "published" && nextStatus === "draft") {
    return "unpublished";
  }

  if (previousStatus !== "published" && nextStatus === "published") {
    return "published";
  }

  return "saved";
}

function revalidateLocationPaths(
  previousSlug?: string,
  currentSlug?: string,
  locationId?: string
) {
  revalidatePath("/mis-locaciones");
  revalidatePath("/locaciones");

  if (locationId) {
    revalidatePath(`/mis-locaciones/${locationId}/editar`);
  }

  const slugs = [previousSlug, currentSlug].filter(
    (slug): slug is string => Boolean(slug)
  );

  for (const slug of new Set(slugs)) {
    revalidatePath(`/locaciones/${slug}`);
  }
}

function newLocationFeedback(error: LocationFormError) {
  const searchParams = new URLSearchParams({ error });
  return `/mis-locaciones/nueva?${searchParams.toString()}`;
}

function editLocationFeedback(
  locationId: string,
  type: "error" | "success",
  code: LocationFormError | LocationSuccess
) {
  const searchParams = new URLSearchParams({
    [type]: code,
    notice: crypto.randomUUID(),
  });
  return `/mis-locaciones/${locationId}/editar?${searchParams.toString()}`;
}

function locationsFeedback(success: LocationSuccess) {
  const searchParams = new URLSearchParams({
    success,
    notice: crypto.randomUUID(),
  });
  return `/mis-locaciones?${searchParams.toString()}`;
}

function locationsErrorFeedback(error: LocationFormError) {
  const searchParams = new URLSearchParams({
    error,
    notice: crypto.randomUUID(),
  });
  return `/mis-locaciones?${searchParams.toString()}`;
}

function getText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function logLocationError(
  message: string,
  error: { code?: string; message?: string } | null
) {
  console.error(message, {
    code: error?.code ?? "unknown",
    message: error?.message ?? "Unknown database error",
  });
}

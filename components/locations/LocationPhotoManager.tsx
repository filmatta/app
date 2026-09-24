"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LOCATION_PHOTO_BUCKET,
  LOCATION_PHOTO_LIMIT,
  validateLocationPhotoDeclaration,
  validateLocationPhotoSignature,
} from "@/lib/locations/media";
import styles from "./locations.module.css";

export type OwnerLocationPhoto = {
  id: string;
  src: string | null;
  altText: string | null;
  isCover: boolean;
  lifecycle: "uploading" | "ready" | "deleting" | "delete_failed";
};

type UploadItem = {
  key: string;
  file: File;
  previewUrl: string;
  progress: number;
  state: "waiting" | "uploading" | "verifying" | "ready" | "error";
  error?: string;
};

export default function LocationPhotoManager({ locationId, photos }: { locationId: string; photos: OwnerLocationPhoto[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const previewUrls = useRef(new Set<string>());
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const activeUploads = uploads.filter((item) => !["ready", "error"].includes(item.state)).length;
  const occupied = photos.length + activeUploads;
  const ready = photos.filter((photo) => photo.lifecycle === "ready");
  const persistedUploads = photos.filter((photo) => photo.lifecycle === "uploading");
  const failedDeletes = photos.filter((photo) => photo.lifecycle === "delete_failed" || photo.lifecycle === "deleting");

  useEffect(() => {
    const readyIds = new Set(photos.filter((photo) => photo.lifecycle === "ready").map((photo) => photo.id));
    setUploads((current) => current.filter((item) => {
      if (item.state !== "ready" || !readyIds.has(item.key)) return true;
      URL.revokeObjectURL(item.previewUrl);
      previewUrls.current.delete(item.previewUrl);
      return false;
    }));
  }, [photos]);

  useEffect(() => () => {
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
    previewUrls.current.clear();
  }, []);

  async function choose(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    const remaining = Math.max(0, LOCATION_PHOTO_LIMIT - occupied);
    if (selected.length > remaining) {
      setNotice(`Puedes añadir ${remaining} foto${remaining === 1 ? "" : "s"} más.`);
      if (input.current) input.current.value = "";
      return;
    }
    const next: UploadItem[] = [];
    for (const file of selected) {
      const declaration = validateLocationPhotoDeclaration(file);
      const signature = declaration ? false : await validateLocationPhotoSignature(file);
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      next.push({
        key: crypto.randomUUID(), file, previewUrl, progress: 0,
        state: declaration || !signature ? "error" : "waiting",
        error: declaration ?? (!signature ? "El contenido del archivo no coincide con JPG, PNG o WebP." : undefined),
      });
    }
    setNotice("");
    setUploads((current) => [...current, ...next]);
    for (const item of next) if (item.state === "waiting") void upload(item);
    if (input.current) input.current.value = "";
  }

  async function upload(item: UploadItem) {
    const update = (values: Partial<UploadItem>) => setUploads((current) => current.map((entry) => entry.key === item.key ? { ...entry, ...values } : entry));
    let reservationId: string | null = null;
    try {
      update({ state: "uploading", progress: 0, error: undefined });
      const response = await fetch("/api/locations/photos/reserve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          idempotencyKey: item.key,
          file: { name: item.file.name, size: item.file.size, type: item.file.type },
        }),
      });
      const reservation = await response.json();
      if (!response.ok) throw new Error(reservation.error ?? "No pudimos preparar la subida.");
      reservationId = reservation.id;
      const db = createClient();
      const { data } = await db.auth.getSession();
      if (!data.session) throw new Error("Tu sesión terminó. Inicia sesión de nuevo.");
      await xhrUpload(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${LOCATION_PHOTO_BUCKET}/${reservation.path}`, item.file, data.session.access_token, (progress) => update({ progress }));
      update({ state: "verifying", progress: 100 });
      const completed = await fetch(`/api/locations/photos/${reservationId}/complete`, { method: "POST" });
      const completion = await completed.json().catch(() => ({}));
      if (!completed.ok) throw new Error(completion.error ?? "No pudimos verificar la imagen.");
      update({ state: "ready", progress: 100 });
      router.refresh();
    } catch (error) {
      if (reservationId) await fetch(`/api/locations/photos/${reservationId}`, { method: "DELETE" }).catch(() => undefined);
      update({ state: "error", error: error instanceof Error ? error.message : "No pudimos subir la foto." });
      router.refresh();
    }
  }

  async function manage(id: string, action: "cover" | "up" | "down") {
    setBusyId(id); setNotice("");
    const response = await fetch("/api/locations/photos/manage", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }),
    });
    if (!response.ok) setNotice("No pudimos actualizar la galería. Inténtalo de nuevo.");
    setBusyId(null); router.refresh();
  }

  async function remove(id: string) {
    setBusyId(id); setNotice("");
    const response = await fetch(`/api/locations/photos/${id}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setNotice(result.error ?? "No pudimos eliminar el archivo. Puedes reintentar.");
    setBusyId(null); router.refresh();
  }

  return <div className={styles.photoManager}>
    <div className={styles.photoToolbar}>
      <div><strong>{occupied} / {LOCATION_PHOTO_LIMIT}</strong><span> espacios ocupados, incluida la portada</span></div>
      <button type="button" onClick={() => input.current?.click()} disabled={occupied >= LOCATION_PHOTO_LIMIT}>Añadir fotografías</button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => void choose(event.target.files)} />
    </div>
    <p className={styles.photoStatus}>
      {ready.length} {ready.length === 1 ? "lista" : "listas"}
      {persistedUploads.length + activeUploads > 0 ? ` · ${persistedUploads.length + activeUploads} en proceso` : ""}
      {failedDeletes.length > 0 ? ` · ${failedDeletes.length} pendiente${failedDeletes.length === 1 ? "" : "s"} de limpieza` : ""}
    </p>
    <p className={styles.photoHint}>JPG, PNG o WebP · máximo 10 MB por archivo. La portada ocupa uno de los 20 espacios.</p>
    {notice && <p role="alert" className={styles.photoError}>{notice}</p>}
    {ready.length ? <div className={styles.ownerGallery}>
      {ready.map((photo, index) => <article key={photo.id} className={styles.ownerPhotoCard}>
        <div className={styles.ownerPhoto}>{photo.src && <PhotoThumbnail src={photo.src} alt={photo.altText || `Foto ${index + 1}`} />}</div>
        <div className={styles.photoMeta}>{photo.isCover ? <strong>Portada</strong> : <span>Foto {index + 1}</span>}<span>{index + 1} / {ready.length}</span></div>
        <div className={styles.photoActions}>
          <button type="button" disabled={busyId === photo.id || index === 0} onClick={() => void manage(photo.id, "up")} aria-label="Mover foto antes">←</button>
          <button type="button" disabled={busyId === photo.id || index === ready.length - 1} onClick={() => void manage(photo.id, "down")} aria-label="Mover foto después">→</button>
          {!photo.isCover && <button type="button" disabled={busyId === photo.id} onClick={() => void manage(photo.id, "cover")}>Usar como portada</button>}
          <button type="button" className={styles.photoDelete} disabled={busyId === photo.id} onClick={() => void remove(photo.id)}>Eliminar</button>
        </div>
      </article>)}
    </div> : <div className={styles.ownerPlaceholder}>Aún no hay fotos. Guarda archivos reales para construir la portada y la galería.</div>}
    {persistedUploads.map((photo) => <div key={photo.id} className={styles.persistedUpload} role="status">
      <span>Una foto conserva su espacio mientras termina o vence la subida.</span>
      <strong>En proceso</strong>
    </div>)}
    {uploads.length > 0 && <div className={styles.uploadList}>{uploads.map((item) => <div key={item.key} className={styles.uploadRow}>
      <img className={styles.uploadPreview} src={item.previewUrl} alt="Vista previa local de la foto seleccionada" />
      <div><strong>{item.file.name}</strong><span>{item.state === "uploading" ? `Subiendo · ${item.progress}%` : item.state === "verifying" ? "Verificando formato…" : item.state === "ready" ? "Lista" : item.state === "error" ? item.error : "En espera"}</span></div>
      <progress max={100} value={item.progress} />
      {item.state === "error" && <button type="button" onClick={() => void upload(item)}>Reintentar</button>}
    </div>)}</div>}
    {failedDeletes.map((photo) => <div key={photo.id} className={styles.deleteRetry}>
      <span>Una foto ya no se muestra, pero su archivo sigue pendiente de eliminación y conserva su cupo.</span>
      <button type="button" disabled={busyId === photo.id} onClick={() => void remove(photo.id)}>Reintentar eliminación</button>
    </div>)}
  </div>;
}

function PhotoThumbnail({ src, alt }: { src: string; alt: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const resolved = attempt ? `${src}${src.includes("?") ? "&" : "?"}refresh=${attempt}` : src;
  return failed ? <div className={styles.photoLoadError}>
    <span>No pudimos cargar la miniatura.</span>
    <button type="button" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>Renovar acceso</button>
  </div> : <img src={resolved} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

function xhrUpload(url: string, file: File, token: string, progress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    request.setRequestHeader("Content-Type", file.type);
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = (event) => event.lengthComputable && progress(Math.round((event.loaded / event.total) * 100));
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error("No se completó la subida. Puedes reintentar este archivo."));
    request.onerror = () => reject(new Error("La conexión interrumpió la subida. Puedes reintentar este archivo."));
    request.send(file);
  });
}

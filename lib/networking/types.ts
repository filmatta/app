import { PROJECT_FORMATS, PREFERENCE_GROUPS } from "@/lib/profiles/project-preferences";
export const PROJECT_TYPES = [...PROJECT_FORMATS, "Live session", "Otro"];
export const CLIENT_TYPES = ["Artista", "Marca", "Agencia", "Productora", "Proyecto personal", "Institución", "Otro"];
export const SCHEDULES = { day: "Diurna", night: "Nocturna", mixed: "Mixta" };
export const ECONOMICS = { paid: "Pagado", collaboration: "Colaboración", undecided: "Por definir" };
export const PROJECT_STATES = { active: "Activo", pending_confirmation: "Por confirmar", inactive: "Inactivo" };
export type ProjectState = keyof typeof PROJECT_STATES;
export type Requirements = Record<keyof typeof PREFERENCE_GROUPS, string[]>;
export type Project = { id: string; slug: string; title: string; summary: string | null; project_type: string; client_name: string; share_client_name?: boolean; client_type: string; city: string; work_area: string; shooting_schedule: keyof typeof SCHEDULES; economic_mode: keyof typeof ECONOMICS; date_window: string; roles: string[]; requirements: Requirements; status: "draft" | "archived"; operational_status: ProjectState };
export type ProjectSnapshot = Pick<Project, "title" | "project_type" | "city" | "work_area" | "shooting_schedule" | "economic_mode" | "date_window" | "roles" | "requirements">;
export type Summary = { followers: number; following: number; pending_received: number; location_pending_received?: number; unread: number };
export type NetworkMember = { profile_id: string; slug: string | null; display_name: string; discipline: string | null; city: string | null; portrait_media_id: string | null; portrait_url: string | null };
export type NetworkNotification = { id: string; type: string; actor_name: string; has_actor?: boolean; portrait_media_id?: string | null; portrait_url?: string | null; project_title?: string | null; location_title?: string | null; href: string; created_at: string; read_at: string | null };
export type ContactRequest = { id: string; is_recipient: boolean; message: string; state: "pending" | "accepted" | "rejected" | "expired" | "cancelled"; created_at: string; expires_at: string; accepted_at: string | null; contact_unlocked_at: string | null; shared_contact_snapshot: Partial<Record<"instagram" | "whatsapp" | "email" | "phone", string>> | null; project_snapshot: ProjectSnapshot | null; project_slug?: string | null; credit_required: boolean; counterpart_name: string; counterpart_slug: string | null; discipline: string | null; city: string | null; portrait_media_id: string | null; portrait_url: string | null };
export const REQUEST_STATES = { pending: "Pendiente", accepted: "Aceptada", rejected: "Rechazada", expired: "Vencida", cancelled: "Cancelada" };
export function notificationText(n: NetworkNotification) {
  switch (n.type) {
    case "contact_request_received": return `${n.actor_name} quiere contactarte`;
    case "contact_request_accepted": return `${n.actor_name} aceptó tu solicitud`;
    case "contact_request_rejected": return `${n.actor_name} declinó tu solicitud`;
    case "contact_request_expiring": return "Tu solicitud está por vencer";
    case "follow_received": return `${n.actor_name} empezó a seguirte`;
    case "location_request_received": return `${n.actor_name} quiere contactar por una locación`;
    case "location_request_accepted": return `${n.actor_name} aceptó tu solicitud de Locaciones`;
    case "location_request_rejected": return `${n.actor_name} rechazó tu solicitud de Locaciones`;
    case "location_request_expired": return "Una solicitud de Locaciones venció";
    case "location_request_cancelled": return "Una solicitud de Locaciones dejó de estar disponible";
    default: return "Nueva notificación";
  }
}

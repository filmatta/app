export type LocationRequestState = "pending" | "accepted" | "rejected" | "expired" | "cancelled";

export type LocationContactSnapshot = Partial<Record<"instagram" | "whatsapp" | "email" | "phone", string>>;

export type LocationContactRequest = {
  id: string;
  is_recipient: boolean;
  message: string;
  state: LocationRequestState;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  contact_unlocked_at: string | null;
  shared_contact_snapshot: LocationContactSnapshot | null;
  location_id: string;
  location_title: string;
  location_slug: string;
  counterpart_name: string;
  counterpart_slug: string | null;
  portrait_media_id: string | null;
  portrait_url: string | null;
};

export type LocationCreditWallet = {
  eligible: boolean;
  initial_credits: number;
  available_credits: number;
  reserved_credits: number;
  consumed_credits: number;
  policy_pending: boolean;
};

export const LOCATION_REQUEST_STATES: Record<LocationRequestState, string> = {
  pending: "Pendiente",
  accepted: "Aceptada",
  rejected: "Rechazada",
  expired: "Vencida",
  cancelled: "Cancelada",
};

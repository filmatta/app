export const CONTACT_TYPES = [
  { value: "professional_interest", label: "Interés profesional" },
  { value: "project_invitation", label: "Invitación a proyecto" },
  { value: "casting", label: "Casting / talento" },
  { value: "service", label: "Consulta de servicio" },
  { value: "other", label: "Otro motivo" },
] as const;

export type ContactType = (typeof CONTACT_TYPES)[number]["value"];

export type ProfileContact = {
  id: string;
  message: string;
  response_message: string | null;
  status: string;
  created_at: string;
  read_at: string | null;
  responded_at: string | null;
  is_recipient: boolean;
  source_type: "profile" | "talent";
  contact_type: ContactType;
  counterpart_name: string;
  counterpart_profile_slug: string | null;
  target_name: string;
  target_profile_slug: string | null;
  reported?: boolean;
};

export function contactTypeLabel(value: string) {
  return CONTACT_TYPES.find((item) => item.value === value)?.label ?? "Consulta";
}

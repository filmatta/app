export type ContactAccess = { is_pro: boolean; free_contact_limit: number; remaining_contacts: number; reserved_contacts?: number; consumed_contacts?: number; already_contacted: boolean; thread_id: string | null };
export type ProfileFollower = { slug: string; display_name: string; portrait_media_id: string | null; portrait_url: string | null; total_count?: number };

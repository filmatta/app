export type AvailabilityStatus =
  | "available"
  | "limited"
  | "unavailable"
  | "not_specified";

export type ContactPolicy = "members_only" | "closed";

export type PortfolioItemKind = "reel" | "project" | "link";

export type PortfolioItem = {
  kind: PortfolioItemKind;
  title: string;
  url: string;
  summary?: string;
};

export type ProfessionalProfile = {
  slug: string;
  display_name: string;
  disciplines: string[];
  city: string | null;
  bio: string | null;
  availability: AvailabilityStatus;
  skills: string[];
  equipment: string[];
  portfolio_items: PortfolioItem[];
  contact_policy: ContactPolicy;
  is_public: boolean;
  updated_at: string;
};

export type PublicProfessionalProfile = Omit<
  ProfessionalProfile,
  "is_public"
>;

export type LocationTourStatus =
  | "authorizing"
  | "uploading"
  | "processing"
  | "ready"
  | "errored"
  | "cancelled"
  | "rejected"
  | "delete_pending"
  | "deleted";

export type OwnerLocationTour = {
  id: string;
  status: LocationTourStatus;
  recordedAt: string | null;
  durationSeconds: number | null;
  isActive: boolean;
};

export type PublicLocationCameraTour = {
  id: string;
  recordedAt: string | null;
};

// Explicit identity decoration; never portfolio, portrait or Reel artwork.
export const PROFILE_COVER_PRESETS = [
  {
    id: "camera",
    label: "Detrás de cámara",
    src: "/images/profile-covers/camera.webp",
  },
  {
    id: "monitor",
    label: "Sala de edición",
    src: "/images/profile-covers/monitor.webp",
  },
  {
    id: "space",
    label: "Luz y espacio",
    src: "/images/profile-covers/space.webp",
  },
  { id: "set", label: "En el set", src: "/images/profile-covers/set.webp" },
  { id: "rig", label: "Entre tomas", src: "/images/profile-covers/rig.webp" },
  {
    id: "outdoors",
    label: "Rodaje exterior",
    src: "/images/profile-covers/outdoors.webp",
  },
] as const;

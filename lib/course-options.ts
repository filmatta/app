export const COURSE_CATEGORIES = [
  "Fotografía",
  "Cine y Dirección",
  "Cámara y Cinematografía",
  "Iluminación",
  "Sonido",
  "Edición y Postproducción",
  "Color",
  "Producción",
  "Guion",
  "Actuación",
  "Dirección de Arte",
  "VFX y Motion Graphics",
  "Producción Musical",
  "Negocio y Carrera",
  "Herramientas y Software",
  "Otros",
] as const;

export const COURSE_LEVELS = [
  "Principiante",
  "Intermedio",
  "Avanzado",
  "Todos los niveles",
] as const;

export function isCourseCategory(value: string | null) {
  return (
    value !== null &&
    (COURSE_CATEGORIES as readonly string[]).includes(value)
  );
}

export function isCourseLevel(value: string | null) {
  return value !== null && (COURSE_LEVELS as readonly string[]).includes(value);
}

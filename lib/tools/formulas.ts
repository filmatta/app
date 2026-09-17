// Pure arithmetic, deliberately independent of framework, session and network.
function bounded(value: number, min: number, max: number, label: string) {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error(`${label}: usa un valor entre ${min} y ${max}.`);
  return value;
}
export function angleToExposure(fps: number, angle: number) {
  bounded(fps, 0.001, 10000, "Fotogramas por segundo");
  bounded(angle, 0.001, 360, "Ángulo en grados");
  const seconds = angle / (360 * fps);
  return { seconds, denominator: 1 / seconds, angle };
}
export function exposureToAngle(fps: number, denominator: number) {
  bounded(fps, 0.001, 10000, "Fotogramas por segundo");
  bounded(denominator, 0.001, 3.6e9, "Denominador del tiempo 1/x s");
  if (denominator < fps)
    throw new Error(
      "El tiempo de exposición no puede superar la duración de un fotograma.",
    );
  const angle = (360 * fps) / denominator;
  if (angle < 0.001)
    throw new Error(
      "El ángulo calculado es menor que el límite de 0.001° de esta utilidad.",
    );
  return { angle, seconds: 1 / denominator, denominator };
}
export type BitrateUnit = "kbps" | "Mbps" | "Gbps";
export function bitrateToMbps(value: number, unit: BitrateUnit) {
  const scales = { kbps: 0.001, Mbps: 1, Gbps: 1000 };
  if (!Object.hasOwn(scales, unit)) throw new Error("Elige una unidad de bitrate válida.");
  return bounded(value * scales[unit], 0.001, 100000, "Bitrate equivalente en Mbps");
}
export function decimalStorage(bytes: number) {
  bounded(bytes, 0, Number.MAX_SAFE_INTEGER, "Almacenamiento en bytes");
  const unit = bytes >= 1e12 ? "TB" : bytes >= 1e9 ? "GB" : "MB";
  const divisor = unit === "TB" ? 1e12 : unit === "GB" ? 1e9 : 1e6;
  return { value: bytes / divisor, unit };
}
export function storageEstimate(
  mbps: number,
  minutes: number,
  marginPercent = 0,
) {
  bounded(mbps, 0.001, 100000, "Bitrate total en Mbps");
  bounded(minutes, 0, 10080, "Duración en minutos");
  bounded(marginPercent, 0, 100, "Margen porcentual");
  const bytes = (mbps * 1e6 * minutes * 60) / 8;
  return {
    bytes,
    gb: bytes / 1e9,
    gib: bytes / 2 ** 30,
    plannedGb: (bytes * (1 + marginPercent / 100)) / 1e9,
  };
}
function dimension(value: number) {
  bounded(value, 1, 131072, "Dimensión en píxeles");
  if (!Number.isInteger(value))
    throw new Error("Las dimensiones deben ser píxeles enteros.");
  return value;
}
export function aspectFromDimensions(width: number, height: number) {
  dimension(width);
  dimension(height);
  let a = width,
    b = height;
  while (b) [a, b] = [b, a % b];
  return {
    numerator: width / a,
    denominator: height / a,
    decimal: width / height,
  };
}
export function dimensionFromAspect(
  known: number,
  ratioWidth: number,
  ratioHeight: number,
  knownAxis: "width" | "height",
) {
  dimension(known);
  bounded(ratioWidth, 0.001, 10000, "Proporción horizontal");
  bounded(ratioHeight, 0.001, 10000, "Proporción vertical");
  if (knownAxis !== "width" && knownAxis !== "height")
    throw new Error("Elige la dimensión conocida.");
  const exact =
    knownAxis === "width"
      ? (known * ratioHeight) / ratioWidth
      : (known * ratioWidth) / ratioHeight;
  const pixels = dimension(Math.round(exact));
  return {
    pixels,
    exact,
    width: knownAxis === "width" ? known : pixels,
    height: knownAxis === "height" ? known : pixels,
  };
}
export function focalFromCrop(focalMm: number, crop: number) {
  bounded(focalMm, 0.1, 10000, "Focal en mm");
  bounded(crop, 0.01, 100, "Crop factor");
  return { crop, equivalentMm: focalMm * crop };
}
export function focalFromSensor(
  focalMm: number,
  widthMm: number,
  heightMm: number,
) {
  bounded(widthMm, 1, 1000, "Ancho del área activa en mm");
  bounded(heightMm, 1, 1000, "Alto del área activa en mm");
  return focalFromCrop(
    focalMm,
    Math.hypot(36, 24) / Math.hypot(widthMm, heightMm),
  );
}

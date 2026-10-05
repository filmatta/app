export const productionFixtures = {
  manual: {
    name: "CORTO MANUAL",
    timezone: "America/Mexico_City",
    days: [{ name: "Día 1", blocks: [{ title: "Escena libre", shootMinutes: 60 }] }],
  },
  linked: {
    name: "LA FRECUENCIA",
    sceneCount: 8,
    shotCount: 20,
  },
  overnight: {
    name: "LA FRECUENCIA — NOCHE",
    date: "2026-10-03",
    call: "22:00",
    wrap: "02:00",
    wrapNextDay: true,
  },
  daySpecificResource: {
    requirement: "Mara — talento",
    resource: "Elena Ruiz",
    day1: "confirmed",
    day2: "unavailable",
  },
} as const;

export function volumeFixture(sceneCount = 150, shotCount = 3000) {
  return {
    scenes: Array.from({ length: sceneCount }, (_, index) => ({ id: `scene-${index + 1}`, title: `ESCENA ${index + 1}` })),
    shots: Array.from({ length: shotCount }, (_, index) => ({ id: `shot-${index + 1}`, sceneIndex: index % sceneCount, title: `Plano ${index + 1}` })),
  };
}

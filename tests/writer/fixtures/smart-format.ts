import { createBlock, type WriterDocument } from "../../../lib/writer/document.ts";

export const SMART_FORMAT_FIXTURES = {
  screenplay: `INT. CASA - DÍA

Una caja descansa sobre la mesa.

ALMA
No deberíamos abrirla.

CORTE A:

EXT. PATIO - NOCHE

Alma sale con la caja.`,
  unformatted: `INT. TALLER - DÍA

La radio chisporrotea.

MARA
(sin mirar atrás)
Apágala.

CORTE A:`,
  narrative: "La tarde cae sobre el barrio mientras las ventanas se encienden una por una.",
  singleLine: "Una frase breve.",
  multipleScenes: `INT. CASA - DÍA
La puerta se abre.
EXT. PARQUE - TARDE
Un perro cruza el sendero.
INT. CAFÉ - NOCHE
La máquina deja de sonar.`,
  parentheticals: `ALMA
(muy bajo)
No mires.

MARA
(a la puerta)
Ya es tarde.`,
  transitions: `FADE IN:

CORTE A:

FADE OUT:`,
  uppercaseAction: `LA CIUDAD DESPIERTA BAJO LA LLUVIA.

Las luces de los autobuses dibujan líneas en el asfalto.`,
  laCaja: `INT. PANADERÍA - NOCHE

LUCÍA limpia el mostrador. Una caja vieja espera junto al horno.

LUCÍA

Encontré la caja.

Silencio.

INT. CASA DE LUCÍA - NOCHE

LUCÍA deja la caja sobre la mesa.

PADRE (TELÉFONO)

No la abras.

INT. PASILLO - NOCHE

Una sombra cruza la pared.

EXT. CALLE - NOCHE

LUCÍA sale con la caja.

HOMBRE

Entrégamela.

INT. TAXI - NOCHE

La ciudad se deshace tras el cristal.

INT. BODEGA - NOCHE

LUCÍA enciende una lámpara.

INT. OFICINA - NOCHE

PADRE (TELÉFONO)

Escúchame con atención.

EXT. PUENTE - NOCHE

El HOMBRE espera bajo la lluvia.

INT. CUARTO VACÍO - NOCHE

La caja se abre.

EXT. BOSQUE - MADRUGADA

LUCÍA corre entre los árboles.

INT. CABAÑA - MADRUGADA

HOMBRE

Ya es tarde.

EXT. CLARO - AMANECER

LUCÍA deja la caja en el suelo.`,
} as const;

const existingScene = createBlock("sceneHeading", "INT. CASA - DÍA");
const existingAction = createBlock("action", "Una caja espera.");

export const SMART_FORMAT_MIXED_DOCUMENT: WriterDocument = {
  type: "doc",
  content: [
    existingScene,
    existingAction,
    createBlock("action", "EXT. PATIO - NOCHE"),
    createBlock("action", "Alma cruza el patio."),
  ],
};

export const SMART_FORMAT_PARTIAL_DOCUMENT: WriterDocument = {
  type: "doc",
  content: [
    createBlock("sceneHeading", "INT. CASA - DÍA"),
    createBlock("action", "Una caja espera."),
    createBlock("action", "EXT. PATIO - NOCHE"),
    createBlock("action", "Alma cruza el patio."),
  ],
};

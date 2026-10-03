import { createBlock, type WriterDocument } from "../../../lib/writer/document.ts";

export const LA_FRECUENCIA_CHARACTER_DOCUMENT: WriterDocument = {
  type: "doc",
  content: [
    createBlock("sceneHeading", "INT. CABINA DE RADIO - NOCHE"),
    createBlock("action", "17 DE NOVIEMBRE DE 2004"),
    createBlock("character", "MARA"),
    createBlock("dialogue", "La frecuencia volvió."),
    createBlock("character", "TOMÁS"),
    createBlock("dialogue", "Esta vez no contestes."),
    createBlock("character", "IRIS"),
    createBlock("dialogue", "Ya es tarde."),
    createBlock("character", "RUBÉN"),
    createBlock("dialogue", "Apaga el transmisor."),
    createBlock("character", "RUBÉN (ALTAVOCES)"),
    createBlock("dialogue", "Mara, sal de ahí."),
    createBlock("character", "PADRE (GRABACIÓN)"),
    createBlock("dialogue", "Si oyes esto, busca la cinta."),
    createBlock("character", "PADRE (VIDEO)"),
    createBlock("dialogue", "No abras la puerta."),
  ],
};

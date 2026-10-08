import type { WriterBreakdownCategory } from "./production.ts";

// Local, versioned Spanish production vocabulary. It is evidence, never a whitelist.
export const BREAKDOWN_LEXICON_VERSION = "local-breakdown-v3";
type Entry = { canonical: string; category: WriterBreakdownCategory; aliases?: readonly string[] };
const entries: readonly Entry[] = [
  { canonical: "pistola", category: "prop", aliases: ["arma de fuego", "revólver", "revolver"] },
  { canonical: "bomba", category: "prop" }, { canonical: "cajón", category: "prop" },
  { canonical: "llave", category: "prop", aliases: ["llaves"] },
  { canonical: "tarjeta de acceso", category: "prop", aliases: ["credencial de acceso"] },
  { canonical: "teléfono", category: "prop", aliases: ["celular", "móvil"] },
  { canonical: "computadora", category: "prop", aliases: ["ordenador"] },
  { canonical: "radio", category: "prop" }, { canonical: "grabadora", category: "prop" },
  { canonical: "cámara", category: "prop" }, { canonical: "linterna", category: "prop" },
  { canonical: "lámpara", category: "prop" }, { canonical: "reloj", category: "prop" },
  { canonical: "carpeta", category: "prop" }, { canonical: "recibo", category: "prop" },
  { canonical: "factura", category: "prop" }, { canonical: "libro contable", category: "prop" },
  { canonical: "carta", category: "prop" },
  { canonical: "bolsa", category: "prop" }, { canonical: "maletín", category: "prop" },
  { canonical: "botella", category: "prop" }, { canonical: "vaso", category: "prop" },
  { canonical: "taza", category: "prop" }, { canonical: "plato", category: "prop" },
  { canonical: "cuchillo", category: "prop" }, { canonical: "martillo", category: "prop" },
  { canonical: "destornillador", category: "prop" }, { canonical: "jeringa", category: "prop" },
  { canonical: "venda", category: "prop" }, { canonical: "micrófono", category: "prop" },
  { canonical: "guitarra", category: "prop" }, { canonical: "piano", category: "prop" },
  { canonical: "chaqueta", category: "wardrobe", aliases: ["chamarra"] },
  { canonical: "abrigo", category: "wardrobe" }, { canonical: "sombrero", category: "wardrobe" },
  { canonical: "gafas de sol", category: "wardrobe", aliases: ["lentes de sol"] },
  { canonical: "gafas", category: "wardrobe", aliases: ["lentes"] },
  { canonical: "botas", category: "wardrobe" }, { canonical: "guantes", category: "wardrobe" },
  { canonical: "uniforme", category: "wardrobe" }, { canonical: "vestido", category: "wardrobe" },
  { canonical: "automóvil", category: "vehicle", aliases: ["auto", "coche", "carro"] },
  { canonical: "motocicleta", category: "vehicle", aliases: ["moto"] },
  { canonical: "bicicleta", category: "vehicle" }, { canonical: "autobús", category: "vehicle" },
  { canonical: "camioneta", category: "vehicle" }, { canonical: "ambulancia", category: "vehicle" },
  { canonical: "tren", category: "vehicle" }, { canonical: "taxi", category: "vehicle" },
  { canonical: "mesa", category: "prop" }, { canonical: "silla", category: "prop" },
  { canonical: "armario", category: "prop" }, { canonical: "repisa", category: "prop" },
  { canonical: "sofá", category: "prop" }, { canonical: "espejo", category: "prop" },
  { canonical: "cuadro", category: "prop" }, { canonical: "cartel", category: "prop" },
];

export function normalizeBreakdownLookup(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("es").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/gu, " ").trim();
}

function plural(alias: string) {
  const words = alias.split(" ");
  const head = words[0];
  if (head.endsWith("s")) return alias;
  words[0] = /[aeiou]$/u.test(head) ? `${head}s` : `${head}es`;
  return words.join(" ");
}
const rawAliases = entries.flatMap((entry) => [entry.canonical, ...(entry.aliases ?? [])].flatMap((alias) => {
  const normalized = normalizeBreakdownLookup(alias);
  return [normalized, plural(normalized)].map((form) => ({ alias: form, canonical: entry.canonical, category: entry.category }));
}));
const duplicateAliases = rawAliases.length - new Set(rawAliases.map((entry) => entry.alias)).size;
const conflictingAliases = new Set(rawAliases.filter((entry) => rawAliases.some((other) => other.alias === entry.alias && (other.canonical !== entry.canonical || other.category !== entry.category))).map((entry) => entry.alias)).size;
const aliases = [...new Map(rawAliases.map((entry) => [entry.alias, entry])).values()]
  .sort((a, b) => b.alias.length - a.alias.length);

const byFirstWord = new Map<string, typeof aliases>();
for (const alias of aliases) {
  const first = alias.alias.split(" ")[0];
  byFirstWord.set(first, [...(byFirstWord.get(first) ?? []), alias]);
}

export function matchBreakdownLexicon(text: string) {
  const normalized = normalizeBreakdownLookup(text);
  const words = normalized.split(" ");
  const result: Array<{ canonical: string; category: WriterBreakdownCategory; alias: string; wordIndex: number }> = [];
  for (let index = 0; index < words.length; index += 1) {
    const options = byFirstWord.get(words[index]) ?? [];
    const match = options.find((option) => words.slice(index, index + option.alias.split(" ").length).join(" ") === option.alias);
    if (!match) continue;
    result.push({ ...match, wordIndex: index });
    index += match.alias.split(" ").length - 1;
  }
  return result;
}

export function breakdownLexiconStats() {
  return { canonicals: entries.length, aliases: aliases.length, duplicates: duplicateAliases, conflicts: conflictingAliases, locale: "es", version: BREAKDOWN_LEXICON_VERSION };
}

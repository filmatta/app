export const MEXICO_GEOGRAPHY_SOURCE = "inegi-catalogo-unico-v2";
export const MEXICO_COUNTRY = { code: "MX", name: "México" } as const;

export const MEXICO_REGIONS = [
  ["01", "Aguascalientes"], ["02", "Baja California"], ["03", "Baja California Sur"],
  ["04", "Campeche"], ["05", "Coahuila de Zaragoza"], ["06", "Colima"], ["07", "Chiapas"],
  ["08", "Chihuahua"], ["09", "Ciudad de México"], ["10", "Durango"], ["11", "Guanajuato"],
  ["12", "Guerrero"], ["13", "Hidalgo"], ["14", "Jalisco"], ["15", "México"],
  ["16", "Michoacán de Ocampo"], ["17", "Morelos"], ["18", "Nayarit"], ["19", "Nuevo León"],
  ["20", "Oaxaca"], ["21", "Puebla"], ["22", "Querétaro"], ["23", "Quintana Roo"],
  ["24", "San Luis Potosí"], ["25", "Sinaloa"], ["26", "Sonora"], ["27", "Tabasco"],
  ["28", "Tamaulipas"], ["29", "Tlaxcala"], ["30", "Veracruz de Ignacio de la Llave"],
  ["31", "Yucatán"], ["32", "Zacatecas"],
].map(([code, name]) => ({ code, name })) as readonly { code: string; name: string }[];

export type MexicoMunicipality = { code: string; name: string };
export type MexicoLocality = { code: string; name: string; scope: string };
export type NormalizedLocationGeography = {
  countryCode: "MX";
  regionCode: string;
  regionName: string;
  municipalityCode: string;
  municipalityName: string;
  localityCode: string;
  localityName: string;
  source: typeof MEXICO_GEOGRAPHY_SOURCE;
};

type InegiRow = {
  cve_ent?: unknown;
  cve_mun?: unknown;
  cve_loc?: unknown;
  nomgeo?: unknown;
  ambito?: unknown;
  estatus?: unknown;
};

export async function getMexicoMunicipalities(regionCode: string) {
  if (!validRegion(regionCode)) return [];
  const rows = await fetchInegi(`mgem/${regionCode}`);
  return rows.flatMap((row): MexicoMunicipality[] => {
    const code = text(row.cve_mun);
    const name = text(row.nomgeo);
    return code && name && /^\d{3}$/.test(code) ? [{ code, name }] : [];
  });
}

export async function getMexicoLocalities(regionCode: string, municipalityCode: string) {
  if (!validRegion(regionCode) || !/^\d{3}$/.test(municipalityCode)) return [];
  const rows = await fetchInegi(`localidades/${regionCode}/${municipalityCode}`);
  return rows.flatMap((row): MexicoLocality[] => {
    const code = text(row.cve_loc);
    const name = text(row.nomgeo);
    const scope = text(row.ambito) ?? "";
    const active = row.estatus === undefined || row.estatus === 1 || row.estatus === "1";
    return active && code && name && /^[0-9A-Z]{4}$/.test(code) ? [{ code, name, scope }] : [];
  });
}

export async function resolveMexicoGeography(input: {
  countryCode: string;
  regionCode: string;
  municipalityCode: string;
  localityCode: string;
}): Promise<NormalizedLocationGeography | null> {
  if (input.countryCode !== "MX" || !validRegion(input.regionCode)) return null;
  const region = MEXICO_REGIONS.find((item) => item.code === input.regionCode);
  if (!region) return null;
  const [municipalities, localities] = await Promise.all([
    getMexicoMunicipalities(input.regionCode),
    getMexicoLocalities(input.regionCode, input.municipalityCode),
  ]);
  const municipality = municipalities.find((item) => item.code === input.municipalityCode);
  const locality = localities.find((item) => item.code === input.localityCode);
  if (!municipality || !locality) return null;
  return {
    countryCode: "MX",
    regionCode: region.code,
    regionName: region.name,
    municipalityCode: municipality.code,
    municipalityName: municipality.name,
    localityCode: locality.code,
    localityName: locality.name,
    source: MEXICO_GEOGRAPHY_SOURCE,
  };
}

function validRegion(value: string) {
  return /^\d{2}$/.test(value) && MEXICO_REGIONS.some((region) => region.code === value);
}

async function fetchInegi(path: string): Promise<InegiRow[]> {
  const response = await fetch(`https://gaia.inegi.org.mx/wscatgeo/v2/${path}`, {
    next: { revalidate: 60 * 60 * 24 * 7 },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`INEGI catalog unavailable (${response.status})`);
  const payload = await response.json() as { datos?: unknown };
  return Array.isArray(payload.datos) ? payload.datos as InegiRow[] : [];
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

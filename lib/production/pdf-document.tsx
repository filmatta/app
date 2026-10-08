import "server-only";
/* eslint-disable jsx-a11y/alt-text -- React PDF Image does not support the HTML alt prop. */

import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { blockText } from "@/lib/writer/document";
import { sortProductionDocumentDays } from "./document-version";
import type { ProductionDocumentSources, ProductionStoryboardFrame } from "./document-sources";
import type { ProductionCoverage, ProductionDay, ProductionScheduleItem, ProductionWorkspaceData } from "./types";

export type ProductionPdfKind = "call-sheet" | "calendar" | "shotlist" | "storyboard" | "script" | "pack";
export type ProductionPdfSelection = {
  callSheetDayIds: string[];
  calendar: boolean;
  shotlist: boolean;
  storyboard: boolean;
  script: boolean;
};
export type ProductionPdfOptions = {
  version: string;
  preparedBy: string;
  confidential: boolean;
  watermarkText: string | null;
  showProductionName: boolean;
  showFilmattaFooter: boolean;
  logoDataUri: string | null;
};
type Props = {
  data: ProductionWorkspaceData;
  kind: ProductionPdfKind;
  selection: ProductionPdfSelection;
  sources: ProductionDocumentSources;
  options: ProductionPdfOptions;
  generatedAt: Date;
};

const ink = "#171717";
const muted = "#666666";
const rule = "#cecece";
const styles = StyleSheet.create({
  page: { paddingTop: 33, paddingRight: 37, paddingBottom: 44, paddingLeft: 37, backgroundColor: "#ffffff", color: ink, fontFamily: "Helvetica", fontSize: 8.5 },
  masthead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1.5, borderColor: ink, paddingBottom: 8, marginBottom: 15, minHeight: 33 },
  mastheadIdentity: { flexDirection: "row", alignItems: "center", gap: 9, maxWidth: "70%" },
  logo: { width: 40, height: 29, objectFit: "contain" },
  mastheadName: { fontFamily: "Helvetica-Bold", fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase" },
  mastheadRight: { color: muted, fontFamily: "Helvetica-Bold", fontSize: 7, letterSpacing: 1.4, textAlign: "right" },
  eyebrow: { color: muted, fontFamily: "Helvetica-Bold", fontSize: 7, letterSpacing: 1.7, textTransform: "uppercase", marginBottom: 5 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 23, letterSpacing: -0.4, marginBottom: 4 },
  subtitle: { color: muted, fontSize: 9, marginBottom: 12 },
  hero: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10, marginBottom: 14 },
  heroMeta: { color: muted, fontSize: 8, textAlign: "right", lineHeight: 1.5 },
  statBand: { flexDirection: "row", borderTopWidth: 0.8, borderBottomWidth: 0.8, borderColor: rule, marginBottom: 16 },
  statCell: { flexGrow: 1, paddingVertical: 10, paddingRight: 11 },
  statLabel: { color: muted, fontFamily: "Helvetica-Bold", fontSize: 6.8, letterSpacing: 1, marginBottom: 4 },
  statValue: { fontFamily: "Helvetica-Bold", fontSize: 16 },
  statSmall: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  section: { marginBottom: 15 },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 9, letterSpacing: 0.6, borderBottomWidth: 0.8, borderColor: ink, paddingBottom: 5, marginBottom: 7 },
  tableHead: { flexDirection: "row", borderBottomWidth: 0.7, borderColor: rule, paddingVertical: 6, backgroundColor: "#eeeeee" },
  tableHeaderText: { paddingHorizontal: 5, color: "#555555", fontFamily: "Helvetica-Bold", fontSize: 6.7, letterSpacing: 0.4 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.55, borderColor: rule, paddingVertical: 7 },
  tableText: { paddingHorizontal: 5, fontSize: 7.6, lineHeight: 1.28 },
  tableMuted: { color: muted, fontSize: 7 },
  locationRow: { flexDirection: "row", borderBottomWidth: 0.55, borderColor: rule, paddingVertical: 7 },
  locationName: { width: "29%", fontFamily: "Helvetica-Bold", fontSize: 8 },
  locationDetail: { width: "71%", fontSize: 8, lineHeight: 1.35 },
  note: { fontSize: 8.3, lineHeight: 1.45, marginBottom: 3 },
  empty: { paddingVertical: 9, color: muted, fontSize: 8 },
  watermark: { position: "absolute", top: "45%", left: 38, right: 38, color: "#777777", opacity: 0.07, fontFamily: "Helvetica-Bold", fontSize: 32, textAlign: "center", transform: "rotate(-28deg)" },
  footerRule: { position: "absolute", left: 37, right: 37, bottom: 31, borderTopWidth: 0.6, borderColor: rule },
  footerText: { position: "absolute", left: 37, right: 37, bottom: 17, color: muted, fontSize: 6.5, letterSpacing: 0.2 },
  coverLabel: { color: muted, fontFamily: "Helvetica-Bold", fontSize: 9, letterSpacing: 2.2, marginTop: 140 },
  coverName: { fontFamily: "Helvetica-Bold", fontSize: 31, lineHeight: 1.05, marginTop: 11, maxWidth: 450 },
  coverDay: { fontSize: 14, marginTop: 21 },
  coverVersion: { color: muted, fontSize: 10, marginTop: 7 },
  coverLine: { width: 85, height: 2, backgroundColor: ink, marginTop: 25 },
  calendarDay: { paddingVertical: 10, borderBottomWidth: 0.7, borderColor: rule },
  calendarDayTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  calendarDayName: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  calendarDayDate: { color: muted, fontSize: 8 },
  calendarDetail: { color: muted, fontSize: 7.6, lineHeight: 1.4 },
  storyboardGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  storyboardCard: { width: "48.5%", height: 305, borderBottomWidth: 0.8, borderColor: rule, marginBottom: 13 },
  storyboardImageBox: { height: 176, backgroundColor: "#f0f0f0", justifyContent: "center", alignItems: "center", marginBottom: 8 },
  storyboardImage: { width: "100%", height: 176, objectFit: "contain" },
  storyboardNumber: { fontFamily: "Helvetica-Bold", fontSize: 9, marginBottom: 4 },
  storyboardText: { color: "#444444", fontSize: 7.5, lineHeight: 1.35, marginBottom: 3 },
  scriptBlock: { fontFamily: "Courier", fontSize: 10, lineHeight: 1.33, marginBottom: 7 },
  scriptHeading: { fontFamily: "Courier-Bold", marginTop: 8 },
  scriptCharacter: { marginLeft: 175, marginTop: 5, marginBottom: 0 },
  scriptDialogue: { marginLeft: 105, marginRight: 90 },
  scriptParenthetical: { marginLeft: 143, marginRight: 90 },
  scriptTransition: { textAlign: "right", marginTop: 5 },
  scriptNote: { color: muted, fontSize: 8 },
});

export function ProductionPdfDocument({ data, kind, selection, sources, options, generatedAt }: Props) {
  const days = sortProductionDocumentDays(data.days).filter((day) => selection.callSheetDayIds.includes(day.id));
  const title = `${data.production.name} · ${kind === "pack" ? "Production Pack" : kind}`;
  return <Document title={title} author="FILMATTA" subject="Documentos de producción" language="es-MX">
    {kind === "pack" && <CoverPage data={data} days={days} options={options} generatedAt={generatedAt} />}
    {(kind === "call-sheet" || kind === "pack") && days.map((day) => <CallSheetPage key={day.id} data={data} day={day} options={options} generatedAt={generatedAt} />)}
    {(kind === "calendar" || kind === "pack" && selection.calendar) && <CalendarPage data={data} options={options} generatedAt={generatedAt} />}
    {(kind === "script" || kind === "pack" && selection.script) && sources.script && <ScriptPages data={data} source={sources.script} options={options} generatedAt={generatedAt} />}
    {(kind === "shotlist" || kind === "pack" && selection.shotlist) && sources.shotlist && <ShotlistPage data={data} source={sources.shotlist} options={options} generatedAt={generatedAt} />}
    {(kind === "storyboard" || kind === "pack" && selection.storyboard) && sources.storyboard && <StoryboardPages data={data} frames={sources.storyboard} options={options} generatedAt={generatedAt} />}
  </Document>;
}

function Frame({ data, type, options, generatedAt }: { data: ProductionWorkspaceData; type: string; options: ProductionPdfOptions; generatedAt: Date }) {
  return <>
    <View style={styles.masthead}>
      <View style={styles.mastheadIdentity}>
        {options.logoDataUri && <Image src={options.logoDataUri} style={styles.logo} />}
        <Text style={styles.mastheadName}>{options.showProductionName ? data.production.name : "FILMATTA"}</Text>
      </View>
      <Text style={styles.mastheadRight}>{type.toUpperCase()}{"\n"}{options.version.toUpperCase()}</Text>
    </View>
    {options.watermarkText && <Text style={styles.watermark} fixed>{options.watermarkText}</Text>}
    <View style={styles.footerRule} fixed />
    <Text style={styles.footerText} fixed>{data.production.name.toUpperCase()} · {options.confidential ? "CONFIDENTIAL · " : ""}{options.version} · Generated {formatGenerated(generatedAt, data.production.timezone)}{options.showFilmattaFooter ? " · FILMATTA" : ""}</Text>
  </>;
}

function CoverPage({ data, days, options, generatedAt }: { data: ProductionWorkspaceData; days: ProductionDay[]; options: ProductionPdfOptions; generatedAt: Date }) {
  return <Page size="A4" style={styles.page}>
    <Frame data={data} type="Production Pack" options={options} generatedAt={generatedAt} />
    <Text style={styles.coverLabel}>PRODUCTION PACK</Text>
    <Text style={styles.coverName}>{data.production.name.toUpperCase()}</Text>
    <Text style={styles.coverDay}>{days.length === 1 ? `SHOOT DAY ${String(days[0].position + 1).padStart(2, "0")}` : `${days.length} SHOOT DAYS`}</Text>
    <Text style={styles.coverVersion}>Version {options.version.replace(/^v/i, "")}</Text>
    <View style={styles.coverLine} />
  </Page>;
}

function CallSheetPage({ data, day, options, generatedAt }: { data: ProductionWorkspaceData; day: ProductionDay; options: ProductionPdfOptions; generatedAt: Date }) {
  const items = data.scheduleItems.filter((item) => item.dayId === day.id).sort((a, b) => a.position - b.position);
  const locations = dayLocations(data, day);
  const contacts = data.resources.filter((item) => item.resourceType === "person" && item.includeInCallSheet);
  return <Page size="A4" style={styles.page} wrap>
    <Frame data={data} type="Call Sheet" options={options} generatedAt={generatedAt} />
    <View style={styles.hero}>
      <View><Text style={styles.eyebrow}>SHOOT DAY {String(day.position + 1).padStart(2, "0")}</Text><Text style={styles.title}>CALL SHEET</Text><Text style={styles.subtitle}>{day.name} · {formatShootDate(day.shootDate)}</Text></View>
      <Text style={styles.heroMeta}>Version {options.version}{"\n"}Prepared by {options.preparedBy}{"\n"}{data.production.timezone}</Text>
    </View>
    <View style={styles.statBand}>
      <View style={styles.statCell}><Text style={styles.statLabel}>CREW CALL</Text><Text style={styles.statValue}>{day.callTime ?? "—"}</Text></View>
      <View style={styles.statCell}><Text style={styles.statLabel}>WRAP EST.</Text><Text style={styles.statValue}>{day.wrapTime ? `${day.wrapTime}${day.wrapNextDay ? " +1" : ""}` : "—"}</Text></View>
      <View style={styles.statCell}><Text style={styles.statLabel}>WEATHER</Text><Text style={styles.statSmall}>Pronóstico no disponible</Text></View>
    </View>
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>LOCATIONS</Text>
      {locations.length ? locations.map(({ resource, coverage }) => <View key={resource.id} style={styles.locationRow} wrap={false}>
        <Text style={styles.locationName}>{resource.name}</Text>
        <Text style={styles.locationDetail}>{resource.address || "Dirección pendiente"}{resource.notes ? `\nAcceso: ${resource.notes}` : ""}{resource.contact ? `\nContacto: ${resource.contact}` : ""}{coverage.needsReconfirmation ? "\nReconfirmar para esta fecha" : ""}</Text>
      </View>) : <Text style={styles.empty}>Locación por confirmar antes de distribuir esta hoja.</Text>}
    </View>
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>SHOOTING SCHEDULE</Text>
      <View style={styles.tableHead}><Cell width="12%" head>HORA</Cell><Cell width="14%" head>ESCENA</Cell><Cell width="24%" head>SET</Cell><Cell width="36%" head>DESCRIPCIÓN</Cell><Cell width="14%" head>PLANOS</Cell></View>
      {items.length ? items.map((item) => {
        const scene = item.sourceSceneId ? data.source.scenes.find((candidate) => candidate.id === item.sourceSceneId) : null;
        const group = item.sourceGroupId ? data.source.groups.find((candidate) => candidate.id === item.sourceGroupId) : null;
        const shot = item.sourceShotId ? group?.shots.find((candidate) => candidate.id === item.sourceShotId) : null;
        const location = scene?.title ?? group?.title ?? item.sourceLabel ?? "—";
        return <View key={item.id} style={styles.tableRow} wrap={false}>
          <Cell width="12%">{item.startTime ?? "—"}</Cell><Cell width="14%">{scene ? `ESC. ${String(scene.position + 1).padStart(2, "0")}` : item.itemType === "logistics" ? "LOG" : "—"}</Cell>
          <Cell width="24%">{item.itemType === "logistics" ? item.logisticsType?.toUpperCase() ?? "LOGÍSTICA" : location}</Cell>
          <Cell width="36%">{item.title}{item.notes ? `\n${item.notes}` : ""}</Cell>
          <Cell width="14%">{shot ? String(shot.position + 1).padStart(2, "0") : group?.shots.length ? `${group.shots.length} planos` : "—"}</Cell>
        </View>;
      }) : <Text style={styles.empty}>No hay escenas o bloques programados para esta jornada.</Text>}
    </View>
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>CREW / CONTACTS</Text>
      {contacts.length ? <>
        <View style={styles.tableHead}><Cell width="33%" head>NOMBRE</Cell><Cell width="37%" head>ROL</Cell><Cell width="30%" head>TELÉFONO</Cell></View>
        {contacts.map((person) => <View key={person.id} style={styles.tableRow} wrap={false}><Cell width="33%">{person.name}</Cell><Cell width="37%">{person.role || "—"}</Cell><Cell width="30%">{person.phone || "—"}</Cell></View>)}
      </> : <Text style={styles.empty}>No hay contactos marcados para incluir en Call Sheet.</Text>}
    </View>
    {day.notes && <View style={styles.section}><Text style={styles.sectionTitle}>PRODUCTION NOTES</Text><Text style={styles.note}>{day.notes}</Text></View>}
  </Page>;
}

function CalendarPage({ data, options, generatedAt }: { data: ProductionWorkspaceData; options: ProductionPdfOptions; generatedAt: Date }) {
  return <Page size="A4" style={styles.page} wrap>
    <Frame data={data} type="Production Calendar" options={options} generatedAt={generatedAt} />
    <Text style={styles.eyebrow}>PRODUCTION SCHEDULE</Text><Text style={styles.title}>Calendario de rodaje</Text>
    <Text style={styles.subtitle}>{data.days.length} jornadas · Version {options.version} · Prepared by {options.preparedBy}</Text>
    {sortProductionDocumentDays(data.days).map((day) => {
      const items = data.scheduleItems.filter((item) => item.dayId === day.id);
      const locations = dayLocations(data, day);
      const sceneNames = [...new Set(items.flatMap((item) => item.sourceSceneId ? data.source.scenes.filter((scene) => scene.id === item.sourceSceneId).map((scene) => scene.title) : []))];
      return <View key={day.id} style={styles.calendarDay} wrap={false}>
        <View style={styles.calendarDayTop}><Text style={styles.calendarDayName}>DAY {String(day.position + 1).padStart(2, "0")} · {day.name}</Text><Text style={styles.calendarDayDate}>{formatShootDate(day.shootDate)}</Text></View>
        <Text style={styles.calendarDetail}>CALL {day.callTime ?? "—"}  ·  WRAP {day.wrapTime ?? "—"}{day.wrapNextDay ? " +1" : ""}  ·  {items.length} bloques</Text>
        <Text style={styles.calendarDetail}>ESCENAS {sceneNames.length ? sceneNames.join(" · ") : "Por programar"}</Text>
        <Text style={styles.calendarDetail}>LOCACIONES {locations.length ? locations.map(({ resource }) => resource.name).join(" · ") : "Por confirmar"}</Text>
      </View>;
    })}
  </Page>;
}

function ShotlistPage({ data, source, options, generatedAt }: { data: ProductionWorkspaceData; source: NonNullable<ProductionDocumentSources["shotlist"]>; options: ProductionPdfOptions; generatedAt: Date }) {
  return <Page size="A4" orientation="landscape" style={styles.page} wrap>
    <Frame data={data} type="Shotlist" options={options} generatedAt={generatedAt} />
    <Text style={styles.eyebrow}>CAMERA DEPARTMENT</Text><Text style={styles.title}>Shotlist</Text><Text style={styles.subtitle}>{source.title} · Version {options.version}</Text>
    <View style={styles.tableHead}><Cell width="17%" head>SCENE</Cell><Cell width="7%" head>SHOT</Cell><Cell width="8%" head>SIZE</Cell><Cell width="9%" head>ANGLE</Cell><Cell width="10%" head>MOVEMENT</Cell><Cell width="8%" head>LENS</Cell><Cell width="29%" head>DESCRIPTION / AUDIO</Cell><Cell width="12%" head>DURATION</Cell></View>
    {source.groups.flatMap((group, groupIndex) => group.shots.map((shot, shotIndex) => <View key={shot.id} style={styles.tableRow} wrap={false}>
      <Cell width="17%">{group.title}</Cell><Cell width="7%">{groupIndex + 1}.{shotIndex + 1}</Cell><Cell width="8%">{shot.shotType}</Cell><Cell width="9%">{shot.angle}</Cell>
      <Cell width="10%">{shot.movement}</Cell><Cell width="8%">{shot.lens || "—"}</Cell><Cell width="29%">{shot.description || shot.subject || "—"}{shot.notes ? `\nAudio / notas: ${shot.notes}` : ""}</Cell><Cell width="12%">{shot.durationSeconds == null ? "—" : `${shot.durationSeconds} s`}</Cell>
    </View>))}
  </Page>;
}

function StoryboardPages({ data, frames, options, generatedAt }: { data: ProductionWorkspaceData; frames: ProductionStoryboardFrame[]; options: ProductionPdfOptions; generatedAt: Date }) {
  const pages = Array.from({ length: Math.ceil(frames.length / 4) }, (_, index) => frames.slice(index * 4, index * 4 + 4));
  return <>{pages.map((pageFrames, pageIndex) => <Page key={pageIndex} size="A4" style={styles.page}>
    <Frame data={data} type="Storyboard" options={options} generatedAt={generatedAt} />
    <View style={styles.hero}><View><Text style={styles.eyebrow}>VISUAL PLAN</Text><Text style={styles.title}>Storyboard</Text></View><Text style={styles.heroMeta}>Page {pageIndex + 1} / {pages.length}{"\n"}Version {options.version}</Text></View>
    <View style={styles.storyboardGrid}>{pageFrames.map((frame, index) => <View key={`${frame.shotNumber}-${index}`} style={styles.storyboardCard}>
      <View style={styles.storyboardImageBox}>{frame.image ? <Image src={frame.image} style={styles.storyboardImage} /> : <Text style={styles.tableMuted}>Sin miniatura disponible</Text>}</View>
      <Text style={styles.storyboardNumber}>SHOT {frame.shotNumber} · {frame.groupTitle}</Text>
      <Text style={styles.storyboardText}>{frame.shotType} · {frame.description}</Text>
      <Text style={styles.storyboardText}>Movement {frame.movement} · Lens {frame.lens}</Text>
    </View>)}</View>
  </Page>)}</>;
}

function ScriptPages({ data, source, options, generatedAt }: { data: ProductionWorkspaceData; source: NonNullable<ProductionDocumentSources["script"]>; options: ProductionPdfOptions; generatedAt: Date }) {
  return <Page size="A4" style={styles.page} wrap>
    <Frame data={data} type="Production Script" options={options} generatedAt={generatedAt} />
    <View style={styles.hero}><View><Text style={styles.eyebrow}>PRODUCTION SCRIPT</Text><Text style={styles.title}>{source.title}</Text>
      <Text style={styles.subtitle}>{data.production.name} · Version {options.version} · {formatGenerated(generatedAt, data.production.timezone)}</Text></View></View>
    {source.document.content.map((block) => {
      const value = blockText(block);
      if (!value.trim()) return null;
      const kind = block.attrs.kind;
      return <Text key={block.attrs.id} style={[styles.scriptBlock,
        ...(kind === "sceneHeading" ? [styles.scriptHeading] : []),
        ...(kind === "character" ? [styles.scriptCharacter] : []),
        ...(kind === "dialogue" ? [styles.scriptDialogue] : []),
        ...(kind === "parenthetical" ? [styles.scriptParenthetical] : []),
        ...(kind === "transition" ? [styles.scriptTransition] : []),
        ...(kind === "authorNote" ? [styles.scriptNote] : []),
      ]} wrap={false}>{value}</Text>;
    })}
  </Page>;
}

function Cell({ width, head = false, children }: { width: string; head?: boolean; children: React.ReactNode }) {
  return <Text style={[head ? styles.tableHeaderText : styles.tableText, { width }]}>{children}</Text>;
}

function dayLocations(data: ProductionWorkspaceData, day: ProductionDay): Array<{ resource: ProductionWorkspaceData["resources"][number]; coverage: ProductionCoverage }> {
  const requirementIds = new Set(data.requirements.filter((item) => item.category === "location").map((item) => item.id));
  const assignments = data.coverages.filter((coverage) => coverage.dayId === day.id && coverage.resourceId && coverage.status !== "unavailable" && requirementIds.has(coverage.requirementId));
  return assignments.flatMap((coverage) => {
    const resource = data.resources.find((item) => item.id === coverage.resourceId && item.resourceType === "location");
    return resource ? [{ resource, coverage }] : [];
  });
}

export function callSheetRows(data: ProductionWorkspaceData, dayId: string): ProductionScheduleItem[] {
  return data.scheduleItems.filter((item) => item.dayId === dayId).sort((a, b) => a.position - b.position);
}

function formatShootDate(value: string | null) {
  if (!value) return "Fecha por definir";
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function formatGenerated(value: Date, timezone: string) {
  try { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: timezone }).format(value); }
  catch { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(value); }
}

import "server-only";

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { SHOTLIST_COLUMNS, deriveSceneContext, type ShotlistColumnKey } from "./ux";
import type { WriterShot, WriterShotlist, WriterShotlistGroup } from "@/lib/writer/production";

const styles = StyleSheet.create({
  page: { paddingTop: 34, paddingRight: 28, paddingBottom: 34, paddingLeft: 28, fontFamily: "Helvetica", fontSize: 7, color: "#161616", backgroundColor: "#ffffff" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  meta: { fontSize: 7, color: "#5f5f5f", marginBottom: 12 },
  table: { borderTopWidth: 0.7, borderLeftWidth: 0.7, borderColor: "#777777" },
  header: { flexDirection: "row", backgroundColor: "#ece8df", borderBottomWidth: 0.7, borderColor: "#777777", minHeight: 22 },
  headerCell: { padding: 4, borderRightWidth: 0.7, borderColor: "#777777", fontFamily: "Helvetica-Bold", justifyContent: "center" },
  group: { paddingVertical: 5, paddingHorizontal: 6, backgroundColor: "#d9d4c8", borderRightWidth: 0.7, borderBottomWidth: 0.7, borderColor: "#777777", fontFamily: "Helvetica-Bold", fontSize: 7.5 },
  row: { flexDirection: "row", borderBottomWidth: 0.55, borderColor: "#9a9a9a", minHeight: 21 },
  cell: { padding: 4, borderRightWidth: 0.55, borderColor: "#9a9a9a", lineHeight: 1.25 },
  footer: { position: "absolute", bottom: 16, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", color: "#777777", fontSize: 6.5 },
});

const WIDTHS: Record<ShotlistColumnKey, number> = {
  number: 28, scene: 48, location: 76, interiorExterior: 38, shotType: 64, subject: 105,
  description: 130, lens: 45, composition: 62, angle: 54, movement: 62, support: 55,
  setup: 42, durationSeconds: 42, status: 42, notes: 120, storyboard: 0,
};

export function ShotlistPdfDocument({ shotlist, columns, paper = "A3" }: { shotlist: WriterShotlist; columns: ShotlistColumnKey[]; paper?: "A4" | "A3" }) {
  const printable = columns.filter((column) => column !== "storyboard");
  const totalWidth = printable.reduce((sum, column) => sum + WIDTHS[column], 0);
  const groupOffsets = shotlist.groups.map((_, index) => shotlist.groups.slice(0, index).reduce((sum, group) => sum + group.shots.length, 0));
  return <Document title={`${shotlist.title} — Shotlist`} author="FILMATTA">
    <Page size={paper} orientation="landscape" style={styles.page} wrap>
      <View fixed><Text style={styles.title}>{shotlist.title}</Text><Text style={styles.meta}>SHOTLIST · {shotlist.groups.length} escenas/grupos · {shotlist.groups.reduce((sum, group) => sum + group.shots.length, 0)} planos · {paper} horizontal</Text></View>
      <View style={styles.table}>
        <View style={styles.header} fixed>{printable.map((column) => <Text key={column} style={[styles.headerCell, flexWidth(column, totalWidth)]}>{columnLabel(column)}</Text>)}</View>
        {shotlist.groups.map((group, groupIndex) => <View key={group.id} wrap>
          <Text style={styles.group} minPresenceAhead={28}>{`ESCENA ${String(groupIndex + 1).padStart(2, "0")} · ${group.title} · ${group.shots.length} ${group.shots.length === 1 ? "plano" : "planos"}`}</Text>
          {group.shots.map((shot, shotIndex) => <PdfRow key={shot.id} group={group} shot={shot} number={(groupOffsets[groupIndex] ?? 0) + shotIndex + 1} sceneNumber={groupIndex + 1} columns={printable} totalWidth={totalWidth} />)}
        </View>)}
        {!shotlist.groups.some((group) => group.shots.length) && <Text style={styles.group}>La shotlist no contiene planos en este alcance.</Text>}
      </View>
      <View style={styles.footer} fixed><Text>FILMATTA · Exportación de Shotlist</Text><Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} /></View>
    </Page>
  </Document>;
}

function PdfRow({ group, shot, number, sceneNumber, columns, totalWidth }: { group: WriterShotlistGroup; shot: WriterShot; number: number; sceneNumber: number; columns: ShotlistColumnKey[]; totalWidth: number }) {
  const context = deriveSceneContext(group.title);
  return <View style={styles.row} wrap={false}>{columns.map((column) => <Text key={column} style={[styles.cell, flexWidth(column, totalWidth)]}>{pdfValue(column, group, shot, number, sceneNumber, context)}</Text>)}</View>;
}

function pdfValue(column: ShotlistColumnKey, group: WriterShotlistGroup, shot: WriterShot, number: number, sceneNumber: number, context: ReturnType<typeof deriveSceneContext>) {
  switch (column) {
    case "number": return String(number).padStart(2, "0");
    case "scene": return `ESC. ${String(sceneNumber).padStart(2, "0")}`;
    case "location": return context.location || "—";
    case "interiorExterior": return context.interiorExterior || "—";
    case "shotType": return shot.shotType;
    case "subject": return shot.subject || "—";
    case "description": return shot.description || "—";
    case "lens": return shot.lens || "—";
    case "composition": return shot.composition || "—";
    case "angle": return shot.angle;
    case "movement": return shot.movement;
    case "support": return shot.support || "—";
    case "setup": return shot.setup || "—";
    case "durationSeconds": return shot.durationSeconds == null ? "—" : `${shot.durationSeconds} s`;
    case "status": return shot.status === "ready" ? "Listo" : "Pendiente";
    case "notes": return shot.notes || "—";
    case "storyboard": return "";
    default: return group.title;
  }
}

function flexWidth(column: ShotlistColumnKey, totalWidth: number) {
  return { width: `${(WIDTHS[column] / totalWidth) * 100}%` };
}

function columnLabel(column: ShotlistColumnKey) {
  return SHOTLIST_COLUMNS.find((candidate) => candidate.key === column)?.label ?? column;
}

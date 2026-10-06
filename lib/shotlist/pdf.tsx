import "server-only";

import { Fragment } from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { SHOTLIST_COLUMNS, deriveSceneContext, type ShotlistColumnKey } from "./ux";
import type { WriterShot, WriterShotlist, WriterShotlistGroup } from "@/lib/writer/production";

const styles = StyleSheet.create({
  page: { paddingTop: 28, paddingRight: 28, paddingBottom: 34, paddingLeft: 28, fontFamily: "Helvetica", fontSize: 7, color: "#161616", backgroundColor: "#ffffff" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  meta: { fontSize: 7, color: "#5f5f5f", marginBottom: 10 },
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

const PAGE_BODY_HEIGHT = { A3: 580, A4: 330 } as const;
const PAGE_WIDTH = { A3: 1190.55, A4: 841.89 } as const;
const GROUP_HEIGHT = 24;

type PdfShotEntry = { shot: WriterShot; shotIndex: number };
type PdfGroupChunk = { group: WriterShotlistGroup; groupIndex: number; continuation: boolean; shots: PdfShotEntry[] };

export function ShotlistPdfDocument({ shotlist, columns, paper = "A3" }: { shotlist: WriterShotlist; columns: ShotlistColumnKey[]; paper?: "A4" | "A3" }) {
  const printable = columns.filter((column) => column !== "storyboard");
  const totalWidth = printable.reduce((sum, column) => sum + WIDTHS[column], 0);
  const groupOffsets = shotlist.groups.map((_, index) => shotlist.groups.slice(0, index).reduce((sum, group) => sum + group.shots.length, 0));
  const pages = paginateShotlist(shotlist, printable, paper, totalWidth, groupOffsets);
  return <Document title={`${shotlist.title} — Shotlist`} author="FILMATTA">
    {pages.map((chunks, pageIndex) => <Page key={pageIndex} size={paper} orientation="landscape" style={styles.page}>
      <Text style={styles.title}>{shotlist.title}</Text>
      <Text style={styles.meta}>SHOTLIST · {shotlist.groups.length} escenas/grupos · {shotlist.groups.reduce((sum, group) => sum + group.shots.length, 0)} planos · {paper} horizontal</Text>
      <View style={styles.table}>
        <View style={styles.header}>{printable.map((column) => <Text key={column} style={[styles.headerCell, flexWidth(column, totalWidth)]}>{columnLabel(column)}</Text>)}</View>
        {chunks.map((chunk) => <Fragment key={`${chunk.group.id}-${chunk.shots[0]?.shotIndex ?? "empty"}`}>
          <Text style={styles.group}>{groupLabel(chunk)}</Text>
          {chunk.shots.map(({ shot, shotIndex }) => <PdfRow key={shot.id} group={chunk.group} shot={shot} number={(groupOffsets[chunk.groupIndex] ?? 0) + shotIndex + 1} sceneNumber={chunk.groupIndex + 1} columns={printable} totalWidth={totalWidth} />)}
        </Fragment>)}
        {!shotlist.groups.length && <Text style={styles.group}>La shotlist no contiene planos en este alcance.</Text>}
      </View>
      <View style={styles.footer}><Text>FILMATTA · Exportación de Shotlist</Text><Text>{`Página ${pageIndex + 1} de ${pages.length}`}</Text></View>
    </Page>)}
  </Document>;
}

function paginateShotlist(shotlist: WriterShotlist, columns: ShotlistColumnKey[], paper: "A4" | "A3", totalWidth: number, groupOffsets: number[]) {
  const pages: PdfGroupChunk[][] = [];
  let current: PdfGroupChunk[] = [];
  let used = 0;

  function nextPage() {
    if (current.length) pages.push(current);
    current = [];
    used = 0;
  }

  for (let groupIndex = 0; groupIndex < shotlist.groups.length; groupIndex += 1) {
    const group = shotlist.groups[groupIndex]!;
    if (!group.shots.length) {
      if (current.length && used + GROUP_HEIGHT > PAGE_BODY_HEIGHT[paper]) nextPage();
      current.push({ group, groupIndex, continuation: false, shots: [] });
      used += GROUP_HEIGHT;
      continue;
    }

    for (let shotIndex = 0; shotIndex < group.shots.length; shotIndex += 1) {
      const shot = group.shots[shotIndex]!;
      const rowHeight = estimateRowHeight(group, shot, (groupOffsets[groupIndex] ?? 0) + shotIndex + 1, groupIndex + 1, columns, paper, totalWidth);
      let chunk = current.at(-1);
      const needsGroup = !chunk || chunk.group.id !== group.id;
      if (current.length && used + rowHeight + (needsGroup ? GROUP_HEIGHT : 0) > PAGE_BODY_HEIGHT[paper]) {
        nextPage();
        chunk = undefined;
      }
      if (!chunk || chunk.group.id !== group.id) {
        chunk = { group, groupIndex, continuation: shotIndex > 0, shots: [] };
        current.push(chunk);
        used += GROUP_HEIGHT;
      }
      chunk.shots.push({ shot, shotIndex });
      used += Math.min(rowHeight, PAGE_BODY_HEIGHT[paper] - GROUP_HEIGHT);
    }
  }

  nextPage();
  return pages.length ? pages : [[]];
}

function estimateRowHeight(group: WriterShotlistGroup, shot: WriterShot, number: number, sceneNumber: number, columns: ShotlistColumnKey[], paper: "A4" | "A3", totalWidth: number) {
  const context = deriveSceneContext(group.title);
  const availableWidth = PAGE_WIDTH[paper] - 56;
  const lines = columns.map((column) => {
    const width = availableWidth * WIDTHS[column] / totalWidth;
    const charactersPerLine = Math.max(4, Math.floor((width - 8) / 3.5));
    return String(pdfValue(column, group, shot, number, sceneNumber, context)).split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
  });
  return Math.max(21, Math.max(...lines, 1) * 8.75 + 8) * 1.8;
}

function groupLabel(chunk: PdfGroupChunk) {
  const base = `ESCENA ${String(chunk.groupIndex + 1).padStart(2, "0")} · ${chunk.group.title} · ${chunk.group.shots.length} ${chunk.group.shots.length === 1 ? "plano" : "planos"}`;
  return chunk.continuation ? `${base} · continuación` : base;
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

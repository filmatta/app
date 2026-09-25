import React from "react";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  type DocumentProps,
} from "@react-pdf/renderer";
import {
  WRITER_PDF_FONT_SIZE,
  WRITER_PDF_LINE_HEIGHT,
  layoutWriterPdf,
  type WriterPdfOptions,
  type WriterPdfRun,
} from "./pdf.ts";
import type { WriterSnapshot } from "./document.ts";

const styles = StyleSheet.create({
  page: {
    color: "#000000",
    backgroundColor: "#ffffff",
    fontFamily: "FilmattaCousine",
    fontSize: WRITER_PDF_FONT_SIZE,
  },
  line: {
    fontSize: WRITER_PDF_FONT_SIZE,
    lineHeight: 1.2,
  },
  sceneHeading: {
    fontFamily: "FilmattaCousine",
    fontWeight: 700,
  },
  pageNumber: {
    position: "absolute",
    top: 36,
    right: 72,
    width: 48,
    color: "#000000",
    fontFamily: "FilmattaCousine",
    fontSize: WRITER_PDF_FONT_SIZE,
    lineHeight: 1.2,
    textAlign: "right",
  },
  coverTitleArea: {
    position: "absolute",
    top: 220,
    left: 108,
    right: 72,
    textAlign: "center",
  },
  coverTitle: {
    fontFamily: "FilmattaCousine",
    fontWeight: 700,
    fontSize: WRITER_PDF_FONT_SIZE,
    lineHeight: 1.25,
  },
  coverByline: {
    marginTop: 28,
    lineHeight: 1.35,
  },
  coverVersion: {
    marginTop: 22,
    lineHeight: 1.35,
  },
  coverContact: {
    position: "absolute",
    left: 108,
    right: 72,
    bottom: 72,
    fontSize: 10,
    lineHeight: 1.25,
    whiteSpace: "pre-wrap",
  },
});

const registeredFontSources = new Set<string>();

export function createWriterPdfDocument(
  snapshot: WriterSnapshot,
  options: WriterPdfOptions,
  fontBaseUrl = "/fonts/cousine",
) {
  registerWriterPdfFonts(fontBaseUrl);
  const layout = layoutWriterPdf(snapshot, options);
  const pages: React.ReactNode[] = [];
  if (options.includeCover) {
    pages.push(React.createElement(CoverPage, { key: "cover", options }));
  }
  for (const page of layout.pages) {
    let previousBottom = layout.paper.marginTop;
    const lineElements = page.items.map((item, index) => {
      const marginTop = Math.max(0, item.y - previousBottom);
      previousBottom = item.y + WRITER_PDF_LINE_HEIGHT;
      return React.createElement(
        Text,
        {
          key: `${item.sourceBlockId ?? item.generated}-${item.y}-${index}`,
          style: [
            styles.line,
            ...(item.kind === "sceneHeading" ? [styles.sceneHeading] : []),
            runStyle(item.runs[0], item.kind === "sceneHeading"),
            {
              marginTop,
              marginLeft: item.x - layout.paper.marginLeft,
              width: item.width,
              textAlign: item.align,
            },
          ],
          wrap: false,
        },
        item.runs[0].text,
        ...item.runs.slice(1).map((run, runIndex) => React.createElement(
          Text,
          { key: runIndex, style: runStyle(run, item.kind === "sceneHeading") },
          run.text,
        )),
      );
    });
    pages.push(React.createElement(
      Page,
      {
        key: `body-${page.number}`,
        size: options.paperSize,
        style: [styles.page, {
          paddingTop: layout.paper.marginTop,
          paddingRight: layout.paper.marginRight,
          paddingBottom: layout.paper.marginBottom,
          paddingLeft: layout.paper.marginLeft,
        }],
      },
      page.number > 1
        ? React.createElement(Text, { style: styles.pageNumber }, `${page.number}.`)
        : null,
      ...lineElements,
    ));
  }

  return React.createElement(
    Document,
    {
      title: options.title.trim(),
      ...(options.includeCover && options.authors.trim() ? { author: options.authors.trim() } : {}),
      subject: "Guion cinematográfico",
      language: "es-MX",
    } satisfies DocumentProps,
    ...pages,
  );
}

function CoverPage({ options }: { options: WriterPdfOptions }) {
  const byline = options.authors.trim();
  const version = options.version.trim();
  const contact = options.contact.trim();
  return React.createElement(
    Page,
    { size: options.paperSize, style: styles.page },
    React.createElement(
      View,
      { style: styles.coverTitleArea },
      React.createElement(Text, { style: styles.coverTitle }, options.title.trim()),
      byline ? React.createElement(Text, { style: styles.coverByline }, `Escrito por\n${byline}`) : null,
      version ? React.createElement(Text, { style: styles.coverVersion }, version) : null,
    ),
    contact ? React.createElement(Text, { style: styles.coverContact }, contact) : null,
  );
}

function runStyle(run: WriterPdfRun, forceBold = false) {
  const bold = forceBold || run.bold;
  return {
    fontFamily: "FilmattaCousine",
    fontWeight: bold ? 700 as const : 400 as const,
    fontStyle: run.italic ? "italic" as const : "normal" as const,
    ...(run.underline ? { textDecoration: "underline" as const } : {}),
  };
}

function registerWriterPdfFonts(fontBaseUrl: string) {
  const base = fontBaseUrl.replace(/[/\\]+$/u, "").replaceAll("\\", "/");
  if (registeredFontSources.has(base)) return;
  Font.register({
    family: "FilmattaCousine",
    fonts: [
      { src: `${base}/Cousine-Regular.ttf`, fontWeight: 400, fontStyle: "normal" },
      { src: `${base}/Cousine-Italic.ttf`, fontWeight: 400, fontStyle: "italic" },
      { src: `${base}/Cousine-Bold.ttf`, fontWeight: 700, fontStyle: "normal" },
      { src: `${base}/Cousine-BoldItalic.ttf`, fontWeight: 700, fontStyle: "italic" },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  registeredFontSources.add(base);
}

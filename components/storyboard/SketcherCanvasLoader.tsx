"use client";

import dynamic from "next/dynamic";
import type { StoryboardCanvasProps } from "./StoryboardCanvas";

const Canvas = dynamic(() => import("./StoryboardCanvas"), {
  ssr: false,
  loading: () => <div style={{ display: "grid", placeItems: "center", minHeight: 420, color: "#777" }}>Preparando canvas…</div>,
});

export default function SketcherCanvasLoader(props: StoryboardCanvasProps) {
  return <Canvas {...props} />;
}

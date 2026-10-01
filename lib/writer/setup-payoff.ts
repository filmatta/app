import type { WriterDocument } from "./document.ts";
import { deriveWriterSceneSources, writerSceneCanonicalSource, type WriterSceneSource } from "./script-assistant.ts";

export const WRITER_SETUP_PAYOFF_VERSION = "setup-payoff-v1" as const;
export const WRITER_SETUP_PAYOFF_MODEL = "gpt-5.6-terra" as const;

export type WriterNarrativeElementType = "setup" | "payoff";
export type WriterNarrativeElementStatus =
  | "suggested"
  | "confirmed"
  | "dismissed"
  | "unresolved"
  | "orphan"
  | "needs_review";
export type WriterNarrativeLinkStatus = "suggested" | "confirmed" | "dismissed" | "needs_review";

export type WriterSetupPayoffCandidate = {
  candidateId: string;
  sceneId: string;
  blockId: string;
  type: WriterNarrativeElementType;
  category: string;
  label: string;
  excerpt: string;
  explanation: string;
  confidence: "high" | "medium" | "low";
  disposition: "suggested" | "unresolved" | "orphan";
};

export type WriterSetupPayoffLinkCandidate = {
  setupCandidateId: string;
  payoffCandidateId: string;
  explanation: string;
  confidence: "high" | "medium" | "low";
};

export type WriterSetupPayoffPayload = {
  elements: WriterSetupPayoffCandidate[];
  links: WriterSetupPayoffLinkCandidate[];
};

export type WriterNarrativeElement = {
  id: string;
  scriptId: string;
  sceneId: string;
  blockId: string | null;
  type: WriterNarrativeElementType;
  category: string | null;
  label: string;
  excerpt: string;
  explanation: string | null;
  status: WriterNarrativeElementStatus;
  source: "ai" | "user";
  sourceHash: string | null;
  fingerprint: string;
  confidence: "high" | "medium" | "low" | null;
  updatedAt: string;
};

export type WriterNarrativeLink = {
  id: string;
  scriptId: string;
  setupElementId: string;
  payoffElementId: string;
  status: WriterNarrativeLinkStatus;
  source: "ai" | "user";
  explanation: string | null;
  confidence: "high" | "medium" | "low" | null;
  updatedAt: string;
};

export type WriterSetupPayoffAnalysis = {
  status: "analyzing" | "fresh" | "error" | "uncertain";
  sourceHash: string;
  analysisVersion: string;
  model: string;
  errorCode: string | null;
  updatedAt: string;
} | null;

export async function writerSetupPayoffSourceHash(document: WriterDocument) {
  const canonical = deriveWriterSceneSources(document).map((scene) => writerSceneCanonicalSource(scene)).join("\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function writerSetupPayoffProviderInput(scenes: WriterSceneSource[]) {
  return JSON.stringify({
    scenes: scenes.map((scene, index) => ({
      sceneId: scene.sceneId,
      sceneNumber: index + 1,
      heading: scene.heading,
      blocks: scene.blocks.map((block) => ({ blockId: block.id, type: block.kind, text: block.text })),
    })),
  });
}

export function validateWriterSetupPayoffOutput(value: unknown, scenes: WriterSceneSource[]): WriterSetupPayoffPayload {
  if (!isRecord(value) || !hasExactKeys(value, ["elements", "links"]) || !Array.isArray(value.elements)
    || !Array.isArray(value.links) || value.elements.length > 60 || value.links.length > 80) {
    throw new Error("setup_payoff_invalid_schema");
  }
  const sceneById = new Map(scenes.map((scene) => [scene.sceneId, scene]));
  const candidateIds = new Set<string>();
  const elements = value.elements.map((candidate) => {
    if (!isRecord(candidate) || !hasExactKeys(candidate, [
      "candidateId", "sceneId", "blockId", "type", "category", "label", "excerpt", "explanation", "confidence", "disposition",
    ])) throw new Error("setup_payoff_invalid_element");
    const candidateId = cleanToken(candidate.candidateId, 80);
    if (candidateIds.has(candidateId)) throw new Error("setup_payoff_duplicate_candidate");
    candidateIds.add(candidateId);
    const sceneId = cleanToken(candidate.sceneId, 80);
    const blockId = cleanToken(candidate.blockId, 80);
    const scene = sceneById.get(sceneId);
    if (!scene || !scene.blocks.some((block) => block.id === blockId)) throw new Error("setup_payoff_invalid_evidence");
    if (candidate.type !== "setup" && candidate.type !== "payoff") throw new Error("setup_payoff_invalid_type");
    if (!["high", "medium", "low"].includes(String(candidate.confidence))) throw new Error("setup_payoff_invalid_confidence");
    if (!["suggested", "unresolved", "orphan"].includes(String(candidate.disposition))) throw new Error("setup_payoff_invalid_status");
    if (candidate.type === "setup" && candidate.disposition === "orphan") throw new Error("setup_payoff_invalid_status");
    if (candidate.type === "payoff" && candidate.disposition === "unresolved") throw new Error("setup_payoff_invalid_status");
    return {
      candidateId,
      sceneId,
      blockId,
      type: candidate.type,
      category: cleanText(candidate.category, 64),
      label: cleanText(candidate.label, 160),
      excerpt: cleanText(candidate.excerpt, 360),
      explanation: cleanText(candidate.explanation, 400),
      confidence: candidate.confidence,
      disposition: candidate.disposition,
    } as WriterSetupPayoffCandidate;
  });
  const elementById = new Map(elements.map((element) => [element.candidateId, element]));
  const seenLinks = new Set<string>();
  const links = value.links.map((candidate) => {
    if (!isRecord(candidate) || !hasExactKeys(candidate, ["setupCandidateId", "payoffCandidateId", "explanation", "confidence"])) {
      throw new Error("setup_payoff_invalid_link");
    }
    const setupCandidateId = cleanToken(candidate.setupCandidateId, 80);
    const payoffCandidateId = cleanToken(candidate.payoffCandidateId, 80);
    const setup = elementById.get(setupCandidateId);
    const payoff = elementById.get(payoffCandidateId);
    const key = `${setupCandidateId}:${payoffCandidateId}`;
    if (!setup || !payoff || setup.type !== "setup" || payoff.type !== "payoff" || seenLinks.has(key)) {
      throw new Error("setup_payoff_invalid_link");
    }
    seenLinks.add(key);
    return {
      setupCandidateId,
      payoffCandidateId,
      explanation: cleanText(candidate.explanation, 400),
      confidence: candidate.confidence as WriterSetupPayoffLinkCandidate["confidence"],
    };
  });
  return { elements, links };
}

export function writerSetupPayoffOutputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["elements", "links"],
    properties: {
      elements: {
        type: "array", maxItems: 60,
        items: {
          type: "object", additionalProperties: false,
          required: ["candidateId", "sceneId", "blockId", "type", "category", "label", "excerpt", "explanation", "confidence", "disposition"],
          properties: {
            candidateId: { type: "string", maxLength: 80 }, sceneId: { type: "string" }, blockId: { type: "string" },
            type: { type: "string", enum: ["setup", "payoff"] }, category: { type: "string", maxLength: 64 },
            label: { type: "string", maxLength: 160 }, excerpt: { type: "string", maxLength: 360 },
            explanation: { type: "string", maxLength: 400 }, confidence: { type: "string", enum: ["high", "medium", "low"] },
            disposition: { type: "string", enum: ["suggested", "unresolved", "orphan"] },
          },
        },
      },
      links: {
        type: "array", maxItems: 80,
        items: {
          type: "object", additionalProperties: false,
          required: ["setupCandidateId", "payoffCandidateId", "explanation", "confidence"],
          properties: {
            setupCandidateId: { type: "string", maxLength: 80 }, payoffCandidateId: { type: "string", maxLength: 80 },
            explanation: { type: "string", maxLength: 400 }, confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
        },
      },
    },
  } as const;
}

function cleanText(value: unknown, limit: number) {
  if (typeof value !== "string") throw new Error("setup_payoff_invalid_text");
  const text = value.trim().replace(/\s+/gu, " ");
  if (!text || text.length > limit) throw new Error("setup_payoff_invalid_text");
  return text;
}

function cleanToken(value: unknown, limit: number) {
  const token = cleanText(value, limit);
  if (!/^[a-z0-9:_-]+$/iu.test(token)) throw new Error("setup_payoff_invalid_token");
  return token;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && [...keys].sort().every((key, index) => actual[index] === key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

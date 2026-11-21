/**
 * Multi-signal AI usage estimator for hackathon submissions (reports, READMEs,
 * and source code). Combines:
 *   1. Declared AI-use log & tool extraction (rulebook requirement)
 *   2. Prose/report stylometric signals (LLM transition phrases, uniform
 *      sentence burstiness, boilerplate hedging, markdown density)
 *   3. Source-code generation markers (explicit generator comments, dense
 *      step-by-step instructional comments, boilerplate scaffolding)
 *
 * Also supports storing externally measured percentages (e.g., from GPTZero,
 * Copyleaks, or custom OC scripts) when uploaded via the Admin Portal.
 */

import type { AiFileBreakdown } from "@/app/types/api";

const KNOWN_AI_TOOLS: Array<{ name: string; pattern: RegExp }> = [
  { name: "ChatGPT / GPT-4", pattern: /\b(chat\s?gpt|gpt-?3\.5|gpt-?4[o]?|openai)\b/i },
  { name: "Claude", pattern: /\b(claude|anthropic)\b/i },
  { name: "Gemini", pattern: /\b(gemini|google\s+ai\s+studio)\b/i },
  { name: "GitHub Copilot", pattern: /\b(copilot|github\s+copilot)\b/i },
  { name: "Cursor", pattern: /\b(cursor\s+ai|cursor\s+ide|cursor\s+composer)\b/i },
  { name: "DeepSeek", pattern: /\b(deepseek)\b/i },
  { name: "Perplexity", pattern: /\b(perplexity)\b/i },
  { name: "Windsurf / Codeium", pattern: /\b(windsurf|codeium)\b/i },
  { name: "Llama / Mistral", pattern: /\b(llama\s?3|mistral|mixtral)\b/i },
];

const LLM_PROSE_PHRASES: RegExp[] = [
  /\bdelve\s+into\b/gi,
  /\bin\s+conclusion,?\s+(this|our|the)\b/gi,
  /\bfurthermore,?\s+/gi,
  /\bmoreover,?\s+/gi,
  /\bit\s+is\s+worth\s+noting\s+that\b/gi,
  /\bplays?\s+a\s+(crucial|pivotal|vital)\s+role\b/gi,
  /\bcomprehensive\s+(overview|framework|solution|analysis)\b/gi,
  /\bseamlessly\s+integrat(es|ing|ed)\b/gi,
  /\bleverag(e|ing|ed)\s+(the|advanced|cutting-edge|state-of-the-art)\b/gi,
  /\brobust\s+and\s+scalable\b/gi,
  /\bstreamlin(e|ing|ed)\s+the\b/gi,
  /\bholistic\s+approach\b/gi,
  /\btestament\s+to\b/gi,
  /\bin\s+the\s+realm\s+of\b/gi,
  /\bnavigat(e|ing)\s+the\s+complexities\b/gi,
];

const CODE_AI_MARKERS: RegExp[] = [
  /\/\/\s*Step\s+\d+:/gi,
  /#\s*Step\s+\d+:/gi,
  /generated\s+by\s+(chatgpt|claude|copilot|gemini|ai|llm)/gi,
  /here['’]s\s+(a|the)\s+(complete|updated|improved)\s+(implementation|code|script)/gi,
  /\/\/\s*Helper\s+function\s+to\s+/gi,
  /#\s*Initialize\s+the\s+/gi,
  /\/\/\s*Ensure\s+that\s+/gi,
  /#\s*Perform\s+the\s+/gi,
];

export interface AnalyzedTextInput {
  path: string;
  kind: "code" | "report" | "readme";
  text: string;
}

export interface AiAnalysisOutput {
  overallAiPercent: number;
  codeAiPercent: number | null;
  reportAiPercent: number | null;
  declaredAiTools: string[];
  declaredAiLogPresent: boolean;
  undeclaredAiSuspected: boolean;
  riskLevel: "low" | "moderate" | "high";
  fileBreakdown: AiFileBreakdown[];
  signals: string[];
  summary: string;
}

function clampPct(n: number): number {
  return Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
}

/** Extract readable ASCII/UTF-8 prose runs from raw PDF or binary buffers. */
export function extractReadableText(bytes: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(bytes);
  // Capture PDF parenthesized literal strings or general readable text runs
  const runs = raw.match(/[A-Za-z0-9 ,.;:!?'"()\-_/\\@#%+*=\n]{18,}/g) ?? [];
  return runs.join("\n").slice(0, 200_000);
}

function detectDeclaredTools(text: string): { tools: string[]; hasAiLog: boolean } {
  const tools: string[] = [];
  for (const t of KNOWN_AI_TOOLS) {
    if (t.pattern.test(text)) tools.push(t.name);
  }
  const hasAiLog =
    /(ai[-\s]?use\s+log|ai\s+disclosure|ai\s+tools?\s+used|declaration\s+of\s+ai)/i.test(
      text,
    );
  return { tools, hasAiLog };
}

function scoreProse(text: string): { percent: number; confidence: "low" | "medium" | "high"; signals: string[] } {
  const words = text.split(/\s+/).filter((w) => w.length > 1);
  if (words.length < 40) {
    return { percent: 0, confidence: "low", signals: ["Insufficient text length for prose stylometry"] };
  }

  const signals: string[] = [];
  let phraseHits = 0;
  for (const re of LLM_PROSE_PHRASES) {
    const m = text.match(re);
    if (m) phraseHits += m.length;
  }
  const phraseRate = (phraseHits / words.length) * 1000; // per 1k words
  let score = Math.min(55, phraseRate * 9.5);
  if (phraseHits >= 3) {
    signals.push(`Detected ${phraseHits} high-frequency LLM transitional/hedging phrases`);
  }

  // Sentence-length uniformity (low burstiness is characteristic of LLM prose)
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim().split(/\s+/).filter(Boolean).length)
    .filter((len) => len >= 5 && len <= 60);

  if (sentences.length >= 8) {
    const mean = sentences.reduce((a, b) => a + b, 0) / sentences.length;
    const variance =
      sentences.reduce((a, b) => a + (b - mean) ** 2, 0) / sentences.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    if (cv < 0.32) {
      score += 24;
      signals.push(`Low sentence-length burstiness (CV=${cv.toFixed(2)}, uniform cadence)`);
    } else if (cv < 0.45) {
      score += 12;
      signals.push(`Moderate sentence-length uniformity (CV=${cv.toFixed(2)})`);
    }
  }

  // Bold-lead bullet density (**Label:** ...)
  const boldBullets = (text.match(/^\s*[-*]\s+\*\*[^*]{2,40}\*\*:/gm) ?? []).length;
  if (boldBullets >= 4) {
    score += Math.min(18, boldBullets * 2.5);
    signals.push(`High density of templated bold-lead bullet points (${boldBullets})`);
  }

  const confidence: "low" | "medium" | "high" =
    words.length >= 400 ? "high" : words.length >= 150 ? "medium" : "low";

  return { percent: clampPct(score), confidence, signals };
}

function scoreCode(text: string): { percent: number; confidence: "low" | "medium" | "high"; signals: string[] } {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 15) {
    return { percent: 0, confidence: "low", signals: ["Short code snippet"] };
  }

  const signals: string[] = [];
  let markerHits = 0;
  for (const re of CODE_AI_MARKERS) {
    const m = text.match(re);
    if (m) markerHits += m.length;
  }

  let score = Math.min(50, markerHits * 14);
  if (markerHits > 0) {
    signals.push(`Found ${markerHits} LLM-style step/scaffolding comment markers`);
  }

  // Comment-to-code ratio
  const commentLines = lines.filter((l) => /^\s*(\/\/|#|\/\*|\*)/.test(l)).length;
  const commentRatio = commentLines / lines.length;
  if (commentRatio > 0.28 && lines.length > 40) {
    score += 22;
    signals.push(`Elevated instructional comment density (${Math.round(commentRatio * 100)}% of lines)`);
  } else if (commentRatio > 0.18 && lines.length > 40) {
    score += 10;
  }

  // Long docstring blocks
  const docstrings = (text.match(/("""[\s\S]*?"""|\/\*\*[\s\S]*?\*\/)/g) ?? []).length;
  if (docstrings >= 4 && lines.length < 300) {
    score += 15;
    signals.push(`Dense standardized docstrings (${docstrings} blocks)`);
  }

  const confidence: "low" | "medium" | "high" =
    lines.length >= 120 ? "high" : lines.length >= 40 ? "medium" : "low";

  return { percent: clampPct(score), confidence, signals };
}

export function analyzeSubmissionTexts(inputs: AnalyzedTextInput[]): AiAnalysisOutput {
  const allText = inputs.map((i) => i.text).join("\n");
  const { tools, hasAiLog } = detectDeclaredTools(allText);

  const fileBreakdown: AiFileBreakdown[] = [];
  const allSignals = new Set<string>();
  const codeScores: number[] = [];
  const reportScores: number[] = [];

  for (const item of inputs) {
    const res = item.kind === "code" ? scoreCode(item.text) : scoreProse(item.text);
    fileBreakdown.push({
      path: item.path,
      aiPercent: res.percent,
      confidence: res.confidence,
      signals: res.signals,
    });
    for (const s of res.signals) allSignals.add(s);
    if (item.kind === "code") codeScores.push(res.percent);
    else reportScores.push(res.percent);
  }

  const avg = (arr: number[]) =>
    arr.length ? clampPct(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

  const codeAiPercent = avg(codeScores);
  const reportAiPercent = avg(reportScores);
  const combined = [...codeScores, ...reportScores];
  const overallAiPercent = avg(combined) ?? 0;

  const undeclaredAiSuspected = overallAiPercent >= 35 && !hasAiLog && tools.length === 0;
  if (undeclaredAiSuspected) {
    allSignals.add("Estimated AI usage ≥ 35% with no README AI-use log or declared tools detected");
  } else if (hasAiLog) {
    allSignals.add("AI-use log section detected in submission text");
  }

  const riskLevel: "low" | "moderate" | "high" =
    undeclaredAiSuspected || overallAiPercent >= 65
      ? "high"
      : overallAiPercent >= 30
        ? "moderate"
        : "low";

  const summary =
    inputs.length === 0
      ? "No analyzable text files were provided."
      : `Estimated ${overallAiPercent}% AI-assisted content across ${inputs.length} file(s). ${
          hasAiLog
            ? `AI-use log present (${tools.length ? tools.join(", ") : "tools noted"}).`
            : tools.length
              ? `Mentioned AI tools: ${tools.join(", ")}.`
              : "No AI-use log detected."
        }`;

  return {
    overallAiPercent,
    codeAiPercent,
    reportAiPercent,
    declaredAiTools: tools,
    declaredAiLogPresent: hasAiLog,
    undeclaredAiSuspected,
    riskLevel,
    fileBreakdown,
    signals: Array.from(allSignals),
    summary,
  };
}

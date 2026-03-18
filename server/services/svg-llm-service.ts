import { askOpenRouter } from '../openrouter';
import { OPENROUTER_SVG_MODEL, SVG_MODEL_FALLBACKS, DEFAULT_SVG_MODEL_FALLBACKS } from '../config/env';
import { SVG_PROMPTS } from '../prompts';

/** Ordered list of models to try: primary + fallbacks */
function getSvgModelChain(): string[] {
  const fallbacks = SVG_MODEL_FALLBACKS.length > 0
    ? SVG_MODEL_FALLBACKS
    : DEFAULT_SVG_MODEL_FALLBACKS;
  return [OPENROUTER_SVG_MODEL, ...fallbacks];
}

/** Returns true for errors that indicate the model should be skipped (unavailable or over budget) */
function isModelUnavailable(error: any): boolean {
  const msg = error?.message || '';
  return msg.includes('404') || msg.includes('402') || msg.includes('No endpoints found') || msg.includes('not available') || msg.includes('credits') || msg.includes('afford');
}

/** Returns true for billing errors (402/credits) — all models share the same account so no point trying fallbacks */
function isBillingError(error: any): boolean {
  const msg = error?.message || '';
  return msg.includes('402') || msg.includes('credits') || msg.includes('afford') || msg.includes('Insufficient');
}

/**
 * Lightweight SVG sanitizer — removes dangerous tags, attributes, and external
 * references.  This replaces isomorphic-dompurify (which pulls in jsdom →
 * ESM-only @exodus/bytes, breaking CJS require() on Railway/Node 22).
 *
 * Safe here because the input is our own LLM-generated SVG, not arbitrary
 * user HTML.
 */
function sanitizeSVG(raw: string): string {
  // Remove forbidden tags entirely (including content)
  const forbiddenTags = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'link', 'meta'];
  let svg = raw;
  for (const tag of forbiddenTags) {
    // Self-closing and paired variants
    svg = svg.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
    svg = svg.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, 'gi'), '');
  }

  // Remove event-handler attributes (on*)
  svg = svg.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Remove javascript: and data: URIs in href/xlink:href/src attributes
  svg = svg.replace(/(href|src)\s*=\s*["']?\s*(?:javascript|data):[^"'\s>]*/gi, '');

  return svg;
}

function generateId(length: number = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const SVG_SYSTEM_PROMPT = `You are an expert SVG illustrator for educational content. You generate clean, valid SVG markup directly.

STRICT RULES:
- Output ONLY the SVG markup, nothing else (no markdown, no explanation, no code fences)
- Always include xmlns="http://www.w3.org/2000/svg" and an explicit viewBox attribute
- Use only inline styles or presentation attributes — no <style> or <script> tags
- No external references (no xlink:href to URLs, no <image> with external src)
- No event handlers (no onclick, onload, onerror, onmouseover, etc.)
- Use child-safe, educational content only
- Use clear, readable fonts (Arial, sans-serif)
- Ensure text is legible with appropriate font sizes
- Use a clean white or light background`;

/**
 * Validates and sanitizes LLM-generated SVG using DOMPurify.
 * Critical for security since SVG is rendered via innerHTML on the frontend.
 */
export function validateAndSanitizeSVG(rawSvg: string): string | null {
  if (!rawSvg || typeof rawSvg !== 'string') return null;

  // Strip any markdown code fences the LLM might have added
  let svg = rawSvg.trim();
  svg = svg.replace(/^```(?:svg|xml)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  svg = svg.trim();

  // Must start with <svg
  if (!svg.startsWith('<svg')) {
    // Try to extract SVG from surrounding text
    const match = svg.match(/<svg[\s\S]*<\/svg>/i);
    if (match) {
      svg = match[0];
    } else {
      return null;
    }
  }

  // Sanitize — strip dangerous tags / attributes
  const clean = sanitizeSVG(svg);

  if (!clean || !clean.includes('<svg')) return null;

  // Reject SVGs that have no meaningful visual content — only a background rect
  // or empty groups. Require at least 2 visible drawing elements beyond a
  // simple background fill.
  if (!hasMeaningfulVisualContent(clean)) {
    return null;
  }

  return clean;
}

/**
 * Returns true when the SVG contains enough visible drawing elements to
 * be shown as an illustration rather than just a coloured rectangle.
 */
function hasMeaningfulVisualContent(svg: string): boolean {
  // Tags that can carry visible content
  const drawingRe = /<(path|circle|ellipse|polygon|polyline|line|text|tspan|image|use)\b/gi;
  const drawingMatches = svg.match(drawingRe) || [];

  // Count <rect> elements that are NOT simple full-canvas backgrounds
  const rectRe = /<rect\b[^>]*>/gi;
  const rects = [...svg.matchAll(rectRe)];
  const nonBgRects = rects.filter(m => {
    const r = m[0];
    // Treat as "background" if it covers the whole canvas (width/height = 100% or
    // the declared viewBox dimensions) and has no meaningful stroke
    const fullWidth = /width=["'](?:100%|\d{3,})/i.test(r);
    const fullHeight = /height=["'](?:100%|\d{3,})/i.test(r);
    return !(fullWidth && fullHeight);
  });

  return drawingMatches.length + nonBgRects.length >= 2;
}

export interface SVGResult {
  id: string;
  svgData: string;
  description: string;
}

export interface DiagramSVGResult {
  id: string;
  svgData: string;
  title: string;
  description: string;
  type: string;
}

/**
 * Generates an educational SVG illustration using an LLM via OpenRouter.
 * Tries the primary model first, then falls back through the model chain.
 */
export async function generateEducationalSVG(
  topic: string,
  concept: string,
  gradeLevel: number
): Promise<SVGResult | null> {
  const models = getSvgModelChain();
  const gradePrompt = SVG_PROMPTS.EDUCATIONAL_SVG(topic, concept, gradeLevel);
  const messages = [
    { role: 'system' as const, content: SVG_SYSTEM_PROMPT },
    {
      role: 'user' as const,
      content: `${gradePrompt}\n\nCreate an educational SVG illustration about "${concept}" related to "${topic}" for grade ${gradeLevel} students. Output only valid SVG markup.`
    }
  ];

  for (const model of models) {
    try {
      const response = await askOpenRouter({
        messages,
        model,
        temperature: 0.3,
        max_tokens: 1500,
      });

      const rawSvg = response.choices[0]?.message?.content;
      if (!rawSvg) continue;

      const svgData = validateAndSanitizeSVG(rawSvg);
      if (!svgData) {
        console.warn(`[SVG] Model ${model} returned invalid SVG, trying next`);
        continue;
      }

      console.log(`[SVG] Generated educational SVG with model: ${model}`);
      return {
        id: generateId(10),
        svgData,
        description: `Educational illustration of ${concept} for grade ${gradeLevel}`,
      };
    } catch (error: any) {
      if (isBillingError(error)) {
        console.error(`[SVG] Billing error (${model}): ${error.message}. All models share billing — aborting chain.`);
        return null;
      }
      if (isModelUnavailable(error) && model !== models[models.length - 1]) {
        console.warn(`[SVG] Model ${model} unavailable (${error.message}), trying next fallback`);
        continue;
      }
      console.error(`[SVG] Error generating educational SVG with ${model}:`, error.message);
      return null;
    }
  }

  console.error('[SVG] All models exhausted for educational SVG');
  return null;
}

/**
 * Generates a diagram SVG using an LLM via OpenRouter.
 * Tries the primary model first, then falls back through the model chain.
 */
export async function generateDiagramSVG(
  topic: string,
  diagramType: string,
  gradeLevel: number
): Promise<DiagramSVGResult | null> {
  const models = getSvgModelChain();
  const gradePrompt = SVG_PROMPTS.EDUCATIONAL_SVG(topic, diagramType, gradeLevel);
  const diagramInstructions = getDiagramInstructions(diagramType);
  const messages = [
    { role: 'system' as const, content: SVG_SYSTEM_PROMPT },
    {
      role: 'user' as const,
      content: `${gradePrompt}\n\n${diagramInstructions}\n\nCreate a ${diagramType} diagram about "${topic}" for grade ${gradeLevel} students. Output only valid SVG markup.`
    }
  ];

  for (const model of models) {
    try {
      const response = await askOpenRouter({
        messages,
        model,
        temperature: 0.3,
        max_tokens: 1500,
      });

      const rawSvg = response.choices[0]?.message?.content;
      if (!rawSvg) continue;

      const svgData = validateAndSanitizeSVG(rawSvg);
      if (!svgData) {
        console.warn(`[SVG] Model ${model} returned invalid diagram SVG, trying next`);
        continue;
      }

      const title = `${diagramType.charAt(0).toUpperCase() + diagramType.slice(1)} of ${topic}`;
      console.log(`[SVG] Generated diagram SVG with model: ${model}`);
      return {
        id: generateId(10),
        svgData,
        title,
        description: `${diagramType} diagram about ${topic} for grade ${gradeLevel}`,
        type: diagramType,
      };
    } catch (error: any) {
      if (isBillingError(error)) {
        console.error(`[SVG] Billing error (${model}): ${error.message}. All models share billing — aborting chain.`);
        return null;
      }
      if (isModelUnavailable(error) && model !== models[models.length - 1]) {
        console.warn(`[SVG] Model ${model} unavailable (${error.message}), trying next fallback`);
        continue;
      }
      console.error(`[SVG] Error generating diagram SVG with ${model}:`, error.message);
      return null;
    }
  }

  console.error('[SVG] All models exhausted for diagram SVG');
  return null;
}

function getDiagramInstructions(diagramType: string): string {
  switch (diagramType.toLowerCase()) {
    case 'flowchart':
      return 'Create a flowchart with rectangular boxes connected by arrows. Use rounded rectangles for start/end, rectangles for steps, and diamonds for decisions.';
    case 'concept map':
      return 'Create a concept map with oval nodes connected by labeled lines showing relationships between concepts.';
    case 'cycle':
      return 'Create a circular cycle diagram with stages arranged in a circle connected by curved arrows showing the cyclical process.';
    case 'comparison':
      return 'Create a comparison diagram with two columns showing similarities and differences, using a Venn diagram or side-by-side layout.';
    case 'hierarchy':
      return 'Create a hierarchical tree diagram with boxes arranged in levels from top to bottom, connected by lines.';
    case 'timeline':
      return 'Create a horizontal timeline with labeled events along a line, showing chronological progression.';
    default:
      return 'Create a clear, labeled diagram with shapes and connecting lines to illustrate the concept.';
  }
}

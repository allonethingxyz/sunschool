import { askOpenRouter } from '../openrouter';
import { OPENROUTER_SVG_MODEL, IMAGE_GENERATION_TIMEOUT } from '../config/env';
import { SVG_PROMPTS } from '../prompts';

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
    console.warn('SVG rejected: no meaningful visual content (truncated/empty generation)');
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

  return drawingMatches.length + nonBgRects.length >= 3;
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
 * Generates an educational SVG illustration using an LLM via OpenRouter
 */
export async function generateEducationalSVG(
  topic: string,
  concept: string,
  gradeLevel: number
): Promise<SVGResult | null> {
  try {
    const gradePrompt = SVG_PROMPTS.EDUCATIONAL_SVG(topic, concept, gradeLevel);

    const response = await askOpenRouter({
      messages: [
        { role: 'system', content: SVG_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `${gradePrompt}\n\nCreate an educational SVG illustration about "${concept}" related to "${topic}" for grade ${gradeLevel} students. Output only valid SVG markup.`
        }
      ],
      model: OPENROUTER_SVG_MODEL,
      temperature: 0.3,
      max_tokens: 4000,
    });

    const rawSvg = response.choices[0]?.message?.content;
    if (!rawSvg) return null;

    const svgData = validateAndSanitizeSVG(rawSvg);
    if (!svgData) {
      console.error('SVG LLM output failed validation/sanitization');
      return null;
    }

    return {
      id: generateId(10),
      svgData,
      description: `Educational illustration of ${concept} for grade ${gradeLevel}`,
    };
  } catch (error: any) {
    console.error('Error generating educational SVG:', error.message);
    return null;
  }
}

/**
 * Generates a diagram SVG using an LLM via OpenRouter
 */
export async function generateDiagramSVG(
  topic: string,
  diagramType: string,
  gradeLevel: number
): Promise<DiagramSVGResult | null> {
  try {
    const gradePrompt = SVG_PROMPTS.EDUCATIONAL_SVG(topic, diagramType, gradeLevel);

    const diagramInstructions = getDiagramInstructions(diagramType);

    const response = await askOpenRouter({
      messages: [
        { role: 'system', content: SVG_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `${gradePrompt}\n\n${diagramInstructions}\n\nCreate a ${diagramType} diagram about "${topic}" for grade ${gradeLevel} students. Output only valid SVG markup.`
        }
      ],
      model: OPENROUTER_SVG_MODEL,
      temperature: 0.3,
      max_tokens: 4000,
    });

    const rawSvg = response.choices[0]?.message?.content;
    if (!rawSvg) return null;

    const svgData = validateAndSanitizeSVG(rawSvg);
    if (!svgData) {
      console.error('SVG diagram LLM output failed validation/sanitization');
      return null;
    }

    const title = `${diagramType.charAt(0).toUpperCase() + diagramType.slice(1)} of ${topic}`;

    return {
      id: generateId(10),
      svgData,
      title,
      description: `${diagramType} diagram about ${topic} for grade ${gradeLevel}`,
      type: diagramType,
    };
  } catch (error: any) {
    console.error('Error generating diagram SVG:', error.message);
    return null;
  }
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

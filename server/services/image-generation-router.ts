import { IMAGE_PROVIDER, MAX_IMAGES_PER_LESSON } from '../config/env';
import { ENABLE_OPENROUTER_IMAGES, ENABLE_SVG_LLM, ENABLE_STABILITY_FALLBACK } from '../config/flags';
import { generateEducationalImage as generateOpenRouterImage } from './openrouter-image-service';
import { generateEducationalSVG, generateDiagramSVG } from './svg-llm-service';
import { generateEducationalImage as generateStabilityImage, generateEducationalDiagram as generateStabilityDiagram } from './stability-service';
import { getSubjectSVG } from '../content-generator';
import { getProgrammaticSVG } from './programmatic-svg';

export interface ImageResult {
  id: string;
  base64Data?: string;
  svgData?: string;
  promptUsed: string;
  description: string;
  path?: string;
}

export interface DiagramResult {
  id: string;
  svgData: string;
  title: string;
  description: string;
  type: string;
}

/**
 * Generates an image using the configured provider with fallback chain.
 * Fallback: OpenRouter images > SVG LLM > Stability AI > null
 */
export async function generateImage(
  prompt: string,
  description: string,
  gradeLevel: number,
  options: { subject?: string } = {}
): Promise<ImageResult | null> {
  const provider = IMAGE_PROVIDER;

  // Try OpenRouter image generation first (if enabled and configured)
  if ((provider === 'openrouter' || provider === 'svg-llm') && ENABLE_OPENROUTER_IMAGES && provider === 'openrouter') {
    const result = await generateOpenRouterImage(prompt, description, {}, gradeLevel);
    if (result) {
      return {
        id: result.id,
        base64Data: result.base64Data,
        promptUsed: result.promptUsed,
        description: result.description,
      };
    }
    console.log('[ImageRouter] OpenRouter image generation failed, trying fallback...');
  }

  // Try SVG LLM generation
  if (ENABLE_SVG_LLM) {
    const topic = options.subject || 'education';
    const svgResult = await generateEducationalSVG(topic, description, gradeLevel);
    if (svgResult) {
      return {
        id: svgResult.id,
        svgData: svgResult.svgData,
        promptUsed: prompt,
        description: svgResult.description,
      };
    }
    console.log('[ImageRouter] SVG LLM generation failed, trying fallback...');
  }

  // Try Stability AI fallback
  if (ENABLE_STABILITY_FALLBACK) {
    const stabilityResult = await generateStabilityImage(prompt, description);
    if (stabilityResult) {
      return {
        id: stabilityResult.id,
        base64Data: stabilityResult.base64Data,
        promptUsed: stabilityResult.promptUsed,
        description: stabilityResult.description,
      };
    }
    console.log('[ImageRouter] Stability AI fallback also failed');
  }

  // Final fallback: rich programmatic SVG illustration
  const topic = options.subject || prompt;
  const programmatic = getProgrammaticSVG(topic, description, options.subject);
  if (programmatic.svgData) {
    const id = Math.random().toString(36).substring(2, 12);
    console.log('[ImageRouter] Using programmatic SVG illustration as final fallback');
    return {
      id,
      svgData: programmatic.svgData,
      promptUsed: prompt,
      description: programmatic.description,
    };
  }

  return null;
}

/**
 * Generates a diagram using the configured provider with fallback chain.
 * Always prefers SVG LLM for diagrams (vector output is ideal).
 * Fallback: SVG LLM > programmatic SVG (getSubjectSVG)
 */
export async function generateDiagram(
  topic: string,
  diagramType: string,
  gradeLevel: number,
  description: string = ''
): Promise<DiagramResult | null> {
  // Try SVG LLM first (preferred for diagrams — produces actual vector content)
  if (ENABLE_SVG_LLM) {
    const svgResult = await generateDiagramSVG(topic, diagramType, gradeLevel);
    if (svgResult) {
      return {
        id: svgResult.id,
        svgData: svgResult.svgData,
        title: svgResult.title,
        description: svgResult.description,
        type: svgResult.type,
      };
    }
    console.log('[ImageRouter] SVG LLM diagram generation failed, trying fallback...');
  }

  // Fallback to subject-based programmatic SVG
  try {
    const subjectSVG = getSubjectSVG(topic, diagramType);
    if (subjectSVG) {
      const id = Math.random().toString(36).substring(2, 12);
      return {
        id,
        svgData: subjectSVG,
        title: `${diagramType.charAt(0).toUpperCase() + diagramType.slice(1)} of ${topic}`,
        description: description || `${diagramType} diagram about ${topic}`,
        type: diagramType,
      };
    }
  } catch (error) {
    console.error('[ImageRouter] Subject SVG fallback failed, trying topic-based:', error);
  }

  // Rich topic-based programmatic diagram
  const topicSVG = getProgrammaticSVG(topic, description || topic, topic);
  if (topicSVG.svgData) {
    const id = Math.random().toString(36).substring(2, 12);
    return {
      id,
      svgData: topicSVG.svgData,
      title: `${topic} — Visual`,
      description: topicSVG.description,
      type: diagramType,
    };
  }

  return null;
}

export { MAX_IMAGES_PER_LESSON };

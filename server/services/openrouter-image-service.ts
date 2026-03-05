import axios from 'axios';
import { OPENROUTER_API_KEY, OPENROUTER_IMAGE_MODEL, IMAGE_GENERATION_TIMEOUT } from '../config/env';

function generateId(length: number = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const OPENROUTER_IMAGE_URL = 'https://openrouter.ai/api/v1/images/generations';

export interface OpenRouterImageResult {
  id: string;
  base64Data: string;
  promptUsed: string;
  description: string;
}

interface OpenRouterImageOptions {
  size?: string;
  quality?: string;
  n?: number;
}

/**
 * Generates an educational image using OpenRouter's image generation API
 * (OpenAI-compatible endpoint supporting DALL-E 3, Flux, etc.)
 */
export async function generateEducationalImage(
  prompt: string,
  description: string = '',
  options: OpenRouterImageOptions = {},
  gradeLevel?: number
): Promise<OpenRouterImageResult | null> {
  if (!OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY not set — cannot generate images');
    return null;
  }

  try {
    // Enhance prompt for educational, child-safe content
    const enhancedPrompt = enhancePromptForEducation(prompt, gradeLevel);

    const body: Record<string, any> = {
      model: OPENROUTER_IMAGE_MODEL,
      prompt: enhancedPrompt,
      n: options.n || 1,
      size: options.size || '1024x1024',
      response_format: 'b64_json',
    };

    if (options.quality) {
      body.quality = options.quality;
    }

    const response = await axios.post(OPENROUTER_IMAGE_URL, body, {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://sunschool.xyz',
        'X-Title': 'SUNSCHOOL - The Open Source AI Tutor',
      },
      timeout: IMAGE_GENERATION_TIMEOUT,
    });

    const data = response.data?.data;
    if (data && data.length > 0 && data[0].b64_json) {
      return {
        id: generateId(10),
        base64Data: data[0].b64_json,
        promptUsed: enhancedPrompt,
        description: description || 'Educational image generated with AI',
      };
    }

    console.error('[OpenRouter Image] No image data in response');
    return null;
  } catch (error: any) {
    console.error('[OpenRouter Image] Error:', error.message);
    if (axios.isAxiosError(error) && error.response) {
      console.error('[OpenRouter Image] Response:', error.response.status, JSON.stringify(error.response.data));
    }
    return null;
  }
}

/**
 * Enhances a prompt for educational, child-safe image generation
 */
function enhancePromptForEducation(prompt: string, gradeLevel?: number): string {
  const safetyModifiers = 'safe for children, educational, no violence, no scary elements, appropriate for school';
  const qualityModifiers = 'high quality, clear, detailed, professional educational illustration';

  let gradeModifier = '';
  if (gradeLevel !== undefined) {
    if (gradeLevel <= 2) {
      gradeModifier = 'simple, bright colors, large shapes, friendly, cartoon-style for young children';
    } else if (gradeLevel <= 4) {
      gradeModifier = 'clear labels, colorful, engaging for elementary students';
    } else if (gradeLevel <= 6) {
      gradeModifier = 'detailed with labels, educational diagram style for middle-grade students';
    } else if (gradeLevel <= 8) {
      gradeModifier = 'detailed, annotated, scientific illustration style for middle school';
    } else {
      gradeModifier = 'detailed, publication-quality, academic illustration';
    }
  }

  return [prompt, safetyModifiers, qualityModifiers, gradeModifier].filter(Boolean).join(', ');
}

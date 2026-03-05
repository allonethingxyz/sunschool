import {
  askOpenRouter as chatOpenRouter,
  type Message,
  generateLessonContent as generateLessonContentOpenRouter,
  generateQuizQuestions as generateQuizQuestionsOpenRouter,
  generateFeedback as generateFeedbackOpenRouter,
  generateKnowledgeGraph as generateKnowledgeGraphOpenRouter
} from "../openrouter";

import {
  askBittensor as chatBittensor,
  type BittensorResponse,
  generateLessonContent as generateLessonContentBittensor,
  generateQuizQuestions as generateQuizQuestionsBittensor,
  generateFeedback as generateFeedbackBittensor,
  generateKnowledgeGraph as generateKnowledgeGraphBittensor
} from "../bittensor";

import { LLM_PROVIDER } from '../config/env';
import { ENABLE_BITTENSOR_SUBNET_1, BITTENSOR_FALLBACK_ENABLED } from '../config/flags';

// Provider selection logic
export const getLLMProvider = () => {
  const configured = process.env.LLM_PROVIDER?.toLowerCase() || 'openrouter';

  // Only allow Bittensor if explicitly enabled
  if (configured === 'bittensor' && !ENABLE_BITTENSOR_SUBNET_1) {
    console.warn('Bittensor requested but not enabled via ENABLE_BITTENSOR_SUBNET_1 flag. Falling back to OpenRouter.');
    return 'openrouter';
  }

  return configured;
};

export const chat = async (options: any): Promise<BittensorResponse> => {
  const provider = getLLMProvider();

  if (provider === 'bittensor') {
    try {
      return await chatBittensor(options);
    } catch (error) {
      console.error('Bittensor chat failed:', error);
      if (BITTENSOR_FALLBACK_ENABLED) {

        return await chatOpenRouter(options);
      }
      throw error;
    }
  }

  return await chatOpenRouter(options);
};

export const generateLessonContent = async (gradeLevel: number, topic: string) => {
  const provider = getLLMProvider();

  if (provider === 'bittensor') {
    try {
      return await generateLessonContentBittensor(gradeLevel, topic);
    } catch (error) {
      console.error('Bittensor lesson generation failed:', error);
      if (BITTENSOR_FALLBACK_ENABLED) {

        return await generateLessonContentOpenRouter(gradeLevel, topic);
      }
      throw error;
    }
  }

  return await generateLessonContentOpenRouter(gradeLevel, topic);
};

export const generateQuizQuestions = async (gradeLevel: number, topic: string, questionCount?: number) => {
  const provider = getLLMProvider();

  if (provider === 'bittensor') {
    try {
      return await generateQuizQuestionsBittensor(gradeLevel, topic, questionCount);
    } catch (error) {
      console.error('Bittensor quiz generation failed:', error);
      if (BITTENSOR_FALLBACK_ENABLED) {

        return await generateQuizQuestionsOpenRouter(gradeLevel, topic, questionCount);
      }
      throw error;
    }
  }

  return await generateQuizQuestionsOpenRouter(gradeLevel, topic, questionCount);
};

export const generateFeedback = async (quizQuestions: any[], userAnswers: number[], score: number, gradeLevel: number) => {
  const provider = getLLMProvider();

  if (provider === 'bittensor') {
    try {
      return await generateFeedbackBittensor(quizQuestions, userAnswers, score, gradeLevel);
    } catch (error) {
      console.error('Bittensor feedback generation failed:', error);
      if (BITTENSOR_FALLBACK_ENABLED) {

        return await generateFeedbackOpenRouter(quizQuestions, userAnswers, score, gradeLevel);
      }
      throw error;
    }
  }

  return await generateFeedbackOpenRouter(quizQuestions, userAnswers, score, gradeLevel);
};

export const generateKnowledgeGraph = async (topic: string, gradeLevel: number) => {
  const provider = getLLMProvider();

  if (provider === 'bittensor') {
    try {
      return await generateKnowledgeGraphBittensor(topic, gradeLevel);
    } catch (error) {
      console.error('Bittensor knowledge graph generation failed:', error);
      if (BITTENSOR_FALLBACK_ENABLED) {

        return await generateKnowledgeGraphOpenRouter(topic, gradeLevel);
      }
      throw error;
    }
  }

  return await generateKnowledgeGraphOpenRouter(topic, gradeLevel);
};

export { Message };

/**
 * generateLesson – legacy alias that now proxies to OpenRouter-based
 * generateLessonContent.
 */
export async function generateLesson(topic: string, gradeLevel: number): Promise<string> {
  return generateLessonContent(gradeLevel, topic);
}

/**
 * generateEnhancedLesson – placeholder until a dedicated enhanced generator is
 * ported to OpenRouter. Produces a minimal EnhancedLessonSpec-compatible
 * object so callers compile.
 */
export async function generateEnhancedLesson(gradeLevel: number, topic: string) {
  const content = await generateLessonContent(gradeLevel, topic);
  return {
    title: topic,
    targetGradeLevel: gradeLevel,
    summary: content.slice(0, 160),
    sections: [{ title: topic, content, type: "introduction" as const }],
    keywords: [],
    relatedTopics: [],
    estimatedDuration: 30, // Default 30 minutes
    difficultyLevel: "intermediate" as const,
    questions: [],
    images: [],
    diagrams: [],
    graph: {
      nodes: [],
      edges: []
    }
  };
}
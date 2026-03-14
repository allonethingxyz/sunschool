import axios from 'axios';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

/** Strip markdown code fences that some models add around JSON responses. */
function parseJsonResponse(raw: string): any {
  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned);
}
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterOptions {
  messages: Message[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  timeout?: number;
  response_format?: {
    type: 'json_schema';
    json_schema: any;
  };
}

interface OpenRouterResponse {
  id: string;
  model: string;
  object: string;
  created: number;
  choices: {
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Makes a request to the OpenRouter API
 */
export async function askOpenRouter(options: OpenRouterOptions): Promise<OpenRouterResponse> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const timeoutMs = options.timeout || 30000; // 30s default timeout

  try {
    const response = await axios.post<OpenRouterResponse>(API_URL, {
      model: options.model || 'openai/gpt-4o', // Default to gpt-4o
      messages: options.messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens,
      stream: options.stream || false,
      response_format: options.response_format,
    }, {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://sunschool.xyz',
        'X-Title': 'SUNSCHOOL - The Open Source AI Tutor'
      },
      timeout: timeoutMs,
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
      throw new Error(`OpenRouter API timeout after ${timeoutMs}ms`);
    }
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(`OpenRouter API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

import { LESSON_PROMPTS } from './prompts';
import { validateLessonContent } from './services/content-validator';

/**
 * Generate a lesson for a specific grade level and topic
 * WITH CONTENT VALIDATION AND RETRY LOGIC
 */
export async function generateLessonContent(gradeLevel: number, topic: string): Promise<string> {
  const messages: Message[] = [
    {
      role: 'system',
      content: LESSON_PROMPTS.STANDARD_LESSON(gradeLevel, topic)
    },
    {
      role: 'user',
      content: LESSON_PROMPTS.STANDARD_LESSON_USER(gradeLevel, topic)
    }
  ];

  // Retry up to 2 times if validation fails (fewer attempts for lessons since they're longer)
  const maxAttempts = 2;
  let lastContent: string = '';
  let lastValidationResult: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await askOpenRouter({
      messages,
      temperature: 0.4 + (attempt * 0.1) // Lower temperature for stricter following
    });

    const content = response.choices[0].message.content;
    lastContent = content;

    // Validate lesson content for age-appropriateness
    const validationResult = validateLessonContent(content, gradeLevel);
    lastValidationResult = validationResult;

    if (validationResult.isValid) {
      return content;
    } else {
      // Add validation feedback to messages for next attempt
      messages.push({
        role: 'assistant',
        content: content
      });
      messages.push({
        role: 'user',
        content: `This lesson has issues:\n${validationResult.issues.join('\n')}\n\nRecommendations:\n${validationResult.recommendations.join('\n')}\n\nPlease rewrite the lesson following ALL grade ${gradeLevel} requirements more carefully.`
      });
    }
  }

  return lastContent;
}

import { QUIZ_PROMPTS } from './prompts';
import { validateQuizQuestions } from './services/content-validator';

/**
 * Generate quiz questions for a specific grade level and topic
 * WITH CONTENT VALIDATION AND RETRY LOGIC
 * WITH ADAPTIVE REINFORCEMENT LEARNING
 */
export async function generateQuizQuestions(
  gradeLevel: number,
  topic: string,
  questionCount: number = 5,
  learnerId?: number,
  weakConcepts?: string[],
  recentQuestions?: string[]
): Promise<any[]> {
  // Build adaptive prompt additions
  let adaptiveInstructions = '';

  if (weakConcepts && weakConcepts.length > 0) {
    adaptiveInstructions += `\n\nFOCUS ON THESE CONCEPTS (learner needs practice):\n${weakConcepts.map(c => `- ${c}`).join('\n')}\n`;
    adaptiveInstructions += `Create variations that test these concepts with NEW scenarios and examples.`;
  }

  if (recentQuestions && recentQuestions.length > 0) {
    adaptiveInstructions += `\n\nAVOID EXACT DUPLICATES - Learner recently saw:\n${recentQuestions.slice(0, 10).map((q, i) => `${i + 1}. "${q}"`).join('\n')}\n`;
    adaptiveInstructions += `Generate DIFFERENT questions that test similar concepts with fresh wording and examples.`;
  }

  const messages: Message[] = [
    {
      role: 'system',
      content: QUIZ_PROMPTS.STANDARD_QUIZ(gradeLevel, topic) + adaptiveInstructions
    },
    {
      role: 'user',
      content: QUIZ_PROMPTS.STANDARD_QUIZ_USER(gradeLevel, topic, questionCount)
    }
  ];

  const response_format = {
    type: 'json_schema' as const,
    json_schema: {
      name: 'quiz_questions',
      strict: true,
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'The question text'
            },
            options: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Array of 4 answer choices'
            },
            correctIndex: {
              type: 'integer',
              description: 'Index of the correct answer (0-3)'
            },
            explanation: {
              type: 'string',
              description: 'Explanation of why the answer is correct'
            }
          },
          required: ['text', 'options', 'correctIndex', 'explanation'],
          additionalProperties: false
        }
      }
    }
  };

  // Retry up to 3 times if validation fails
  const maxAttempts = 3;
  let lastQuestions: any[] = [];
  let lastValidationResult: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await askOpenRouter({
      messages,
      response_format,
      temperature: 0.3 + (attempt * 0.1) // Lower temperature for stricter following
    });

    try {
      // Parse the JSON content
      const questions = parseJsonResponse(response.choices[0].message.content);
      lastQuestions = questions;

      // Validate quiz questions for age-appropriateness
      const validationResult = validateQuizQuestions(questions, gradeLevel);
      lastValidationResult = validationResult;

      if (validationResult.isValid) {
        return questions;
      } else {
        // Add validation feedback to messages for next attempt
        messages.push({
          role: 'assistant',
          content: JSON.stringify(questions)
        });
        messages.push({
          role: 'user',
          content: `These questions have issues:\n${validationResult.issues.join('\n')}\n\nRecommendations:\n${validationResult.recommendations.join('\n')}\n\nPlease regenerate ${questionCount} questions following ALL requirements more carefully.`
        });
      }
    } catch (error) {
      console.error(`Failed to parse quiz questions JSON on attempt ${attempt}:`, error);
      if (attempt === maxAttempts) {
        throw new Error('Failed to generate quiz questions after 3 attempts');
      }
    }
  }

  return lastQuestions;
}

import { FEEDBACK_PROMPTS } from './prompts';

/**
 * Generate personalized feedback for a learner based on their quiz performance
 */
export async function generateFeedback(quizQuestions: any[], userAnswers: number[], score: number, gradeLevel: number): Promise<string> {
  const questionAnalysis = quizQuestions.map((q, i) => {
    const isCorrect = userAnswers[i] === q.correctIndex;
    return {
      question: q.text,
      userAnswer: q.options[userAnswers[i]],
      correctAnswer: q.options[q.correctIndex],
      isCorrect,
      explanation: q.explanation
    };
  });

  const messages: Message[] = [
    {
      role: 'system',
      content: FEEDBACK_PROMPTS.PERSONALIZED_FEEDBACK(gradeLevel)
    },
    {
      role: 'user',
      content: FEEDBACK_PROMPTS.QUIZ_FEEDBACK_USER(quizQuestions, userAnswers, score, gradeLevel)
    }
  ];

  const response = await askOpenRouter({ messages, temperature: 0.7 });
  return response.choices[0].message.content;
}

import { KNOWLEDGE_GRAPH_PROMPTS } from './prompts';

/**
 * Generate a knowledge graph based on a topic
 */
export async function generateKnowledgeGraph(topic: string, gradeLevel: number): Promise<any> {
  const messages: Message[] = [
    {
      role: 'system',
      content: KNOWLEDGE_GRAPH_PROMPTS.KNOWLEDGE_GRAPH()
    },
    {
      role: 'user',
      content: KNOWLEDGE_GRAPH_PROMPTS.KNOWLEDGE_GRAPH_USER(topic, gradeLevel)
    }
  ];

  const response_format = {
    type: 'json_schema' as const,
    json_schema: {
      name: 'knowledge_graph',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          nodes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Unique identifier for the node' },
                label: { type: 'string', description: 'Display name for the concept' }
              },
              required: ['id', 'label'],
              additionalProperties: false
            },
            description: 'List of concept nodes in the knowledge graph'
          },
          edges: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source: { type: 'string', description: 'ID of the source node' },
                target: { type: 'string', description: 'ID of the target node' }
              },
              required: ['source', 'target'],
              additionalProperties: false
            },
            description: 'List of relationships between concept nodes'
          }
        },
        required: ['nodes', 'edges'],
        additionalProperties: false
      }
    }
  };

  const response = await askOpenRouter({ 
    messages, 
    response_format,
    temperature: 0.3
  });
  
  try {
    // Parse the JSON content
    return parseJsonResponse(response.choices[0].message.content);
  } catch (error) {
    console.error('Failed to parse knowledge graph JSON:', error);
    throw new Error('Failed to generate knowledge graph');
  }
}

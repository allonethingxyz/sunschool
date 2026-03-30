/**
 * Feature Flags
 * 
 * This module contains all feature flags for the application.
 * These are controlled through environment variables.
 */

// AI Generation Controls
export const USE_AI = process.env.USE_AI !== '0';

// LLM Provider Controls
export const ENABLE_BITTENSOR_SUBNET_1 = process.env.ENABLE_BITTENSOR_SUBNET_1 === '1';
export const BITTENSOR_FALLBACK_ENABLED = process.env.BITTENSOR_FALLBACK_ENABLED !== '0';

// Image Generation Controls
export const ENABLE_OPENROUTER_IMAGES = process.env.ENABLE_OPENROUTER_IMAGES !== '0';
export const ENABLE_SVG_LLM = process.env.ENABLE_SVG_LLM !== '0';
export const ENABLE_STABILITY_FALLBACK = process.env.ENABLE_STABILITY_FALLBACK === '1';

// Other feature flags can be added here

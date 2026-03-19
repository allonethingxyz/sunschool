/**
 * Prompt Safety Service
 *
 * Defense-in-depth for LLM prompt injection:
 * 1. Input validation — regex whitelist on user-facing text fields
 * 2. Pattern detection — known injection phrase matching
 * 3. Prompt hardening — delimiter-wrapped user input in prompts
 *
 * Note: hai-guardrails was removed because its CJS bundle uses
 * import.meta which crashes Node 22 in CJS mode on Railway.
 * The regex-based detection covers the same ground without the
 * ESM compatibility issue.
 */

// --- Input Validation ---

// Allow letters, numbers, common punctuation, and unicode for international names
const SAFE_TOPIC_PATTERN = /^[\p{L}\p{N}\s\-().,&'+:;!?/]{1,200}$/u;

// Patterns that indicate injection attempts
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(the\s+)?(above|system)\s+(prompt|instructions)/i,
  /disregard\s+(all\s+)?prior/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /new\s+instructions?\s*:/i,
  /system\s*prompt\s*:/i,
  /\bDAN\b.*\bmode\b/i,
  /do\s+anything\s+now/i,
  /jailbreak/i,
  /bypass\s+(safety|content|filter)/i,
  /\bprocess\.env\b/i,
  /\beval\s*\(/i,
  /<script/i,
  /\$\{.*\}/,  // Template literal injection
  /\bprompt\s*leak/i,
  /\bexfiltrate\b/i,
  /\bsudo\b/i,
  /\brm\s+-rf\b/i,
  /\bpassword\b.*\bshow\b/i,
  /\bapi[_\s]?key\b/i,
  /\bsecret\b.*\btoken\b/i,
  /act\s+as\s+(a|an)\s+/i,
  /pretend\s+(to\s+be|you'?re)\s+/i,
  /roleplay\s+as\s+/i,
  /\bformat:\s*json\b/i,
  /respond\s+with\s+(only|just)\s+/i,
  /output\s+(only|just)\s+/i,
];

export interface SafetyResult {
  safe: boolean;
  reason?: string;
  sanitized: string;
}

/**
 * Validate and sanitize a user-provided topic/subject string.
 * Returns { safe: false } if the input looks like an injection attempt.
 */
export function validateTopicInput(input: string): SafetyResult {
  if (!input || typeof input !== 'string') {
    return { safe: false, reason: 'Input is required', sanitized: '' };
  }

  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return { safe: false, reason: 'Input is empty', sanitized: '' };
  }

  if (trimmed.length > 200) {
    return { safe: false, reason: 'Input exceeds 200 character limit', sanitized: '' };
  }

  // Check against known injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      console.warn(`[PromptSafety] Injection pattern detected: "${trimmed.substring(0, 50)}..."`);
      return { safe: false, reason: 'Input contains disallowed patterns', sanitized: '' };
    }
  }

  // Validate against safe character whitelist
  if (!SAFE_TOPIC_PATTERN.test(trimmed)) {
    console.warn(`[PromptSafety] Invalid characters in input: "${trimmed.substring(0, 50)}..."`);
    return { safe: false, reason: 'Input contains invalid characters', sanitized: '' };
  }

  return { safe: true, sanitized: trimmed };
}

// --- Prompt Hardening ---

/**
 * Wrap user input with delimiters so the LLM can distinguish it from instructions.
 * Use this when interpolating user input into prompts.
 */
export function delimitUserInput(input: string): string {
  return `<<<${input}>>>`;
}

/**
 * Full validation pipeline: regex whitelist + injection pattern detection.
 * Use this for all user-provided text that flows into LLM prompts.
 */
export async function validatePromptInput(input: string, fieldName: string = 'input'): Promise<SafetyResult> {
  return validateTopicInput(input);
}

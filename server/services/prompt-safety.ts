/**
 * Prompt Safety Service
 *
 * Defense-in-depth for LLM prompt injection:
 * 1. Input validation — regex whitelist on user-facing text fields
 * 2. Pattern detection — known injection phrase matching
 * 3. Prompt hardening — delimiter-wrapped user input in prompts
 *
 * hai-guardrails is kept as an optional enhancement but is not required.
 * Its CJS bundle uses import.meta which can crash Node 22 in CJS mode
 * (e.g. on Railway). The regex-based detection below covers the same
 * ground without the ESM compatibility issue.
 */

// --- Optional hai-guardrails integration ---
let haiGuard: ((messages: any[]) => Promise<any[]>) | null = null;

try {
  // Dynamic import so the module is optional — if it fails to load
  // (CJS/ESM issues on Node 22, missing dep, etc.) we fall back to
  // regex-only detection which provides equivalent coverage.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const hai = require('@presidio-dev/hai-guardrails');
  if (hai && hai.injectionGuard) {
    haiGuard = hai.injectionGuard(
      { roles: ['user'] },
      { mode: 'heuristic', threshold: 0.7, failOnError: false }
    );
    console.log('[PromptSafety] hai-guardrails loaded successfully');
  }
} catch {
  console.log('[PromptSafety] hai-guardrails not available — using regex-only detection');
}

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

// --- Optional Guardrails Engine ---

/**
 * Run hai-guardrails injection detection on a string (if available).
 * Returns { safe: false } if injection is detected.
 * Falls back to pass-through if hai-guardrails is not loaded.
 */
export async function checkInjection(input: string): Promise<SafetyResult> {
  if (!haiGuard) {
    // hai-guardrails not available — regex patterns above are the baseline defense
    return { safe: true, sanitized: input };
  }

  try {
    const messages = [{ role: 'user', content: input }];
    const results = await haiGuard(messages);

    const failed = results.find((r: any) => !r.passed);
    if (failed) {
      console.warn(`[PromptSafety] Injection detected by guardrails: "${input.substring(0, 50)}..." reason: ${failed.reason}`);
      return { safe: false, reason: failed.reason || 'Injection detected', sanitized: '' };
    }

    return { safe: true, sanitized: input };
  } catch (err) {
    // Fail open — don't block legitimate requests if guardrails crash
    console.error('[PromptSafety] Guardrails error (failing open):', err);
    return { safe: true, sanitized: input };
  }
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
 * If hai-guardrails is available, it runs as an additional layer.
 * Use this for all user-provided text that flows into LLM prompts.
 */
export async function validatePromptInput(input: string, fieldName: string = 'input'): Promise<SafetyResult> {
  // Step 1: Basic validation (regex patterns — always active)
  const basicResult = validateTopicInput(input);
  if (!basicResult.safe) {
    return basicResult;
  }

  // Step 2: Optional guardrails injection detection
  const guardResult = await checkInjection(basicResult.sanitized);
  if (!guardResult.safe) {
    return guardResult;
  }

  return { safe: true, sanitized: basicResult.sanitized };
}

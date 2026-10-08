import type { LLMOptions, QuotaInfo } from '../types/course'

/**
 * Interface for an LLM provider that can generate text completions.
 */
export interface LLMProvider {
  name: string
  isAvailable(): Promise<boolean>
  complete(prompt: string, options?: LLMOptions): Promise<string>
  getRemainingQuota(): QuotaInfo
}

/**
 * Configuration for request timeout duration in milliseconds.
 */
const REQUEST_TIMEOUT_MS = 15_000

/**
 * Maximum number of entries in the LRU response cache.
 */
const MAX_CACHE_ENTRIES = 50

// ---------------------------------------------------------------------------
// LRU Cache
// ---------------------------------------------------------------------------

/**
 * A simple Least-Recently-Used (LRU) cache with a fixed maximum capacity.
 * On overflow, evicts the least-recently-used entry.
 */
export class LRUCache {
  private readonly maxSize: number
  private readonly cache = new Map<string, string>()

  constructor(maxSize: number = MAX_CACHE_ENTRIES) {
    this.maxSize = maxSize
  }

  get(key: string): string | undefined {
    const value = this.cache.get(key)
    if (value === undefined) {
      return undefined
    }
    // Move to end (most recently used)
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }

  set(key: string, value: string): void {
    // If key already exists, remove it so we can re-insert at end
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      // Evict the least recently used (first entry in Map iteration order)
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }
    this.cache.set(key, value)
  }

  has(key: string): boolean {
    return this.cache.has(key)
  }

  get size(): number {
    return this.cache.size
  }

  clear(): void {
    this.cache.clear()
  }
}

// ---------------------------------------------------------------------------
// Hugging Face Provider
// ---------------------------------------------------------------------------

/**
 * Hugging Face Inference API provider (free tier).
 *
 * Uses the free Inference API endpoint for text generation.
 * Tracks rate limits (~30,000 tokens/day estimated) and handles
 * HTTP 429 responses by marking the provider as temporarily unavailable.
 */
export class HuggingFaceProvider implements LLMProvider {
  readonly name = 'HuggingFace'

  private readonly apiKey: string
  private readonly model: string
  private rateLimitedUntil: Date | null = null
  private requestCount = 0
  private readonly maxDailyRequests = 100 // conservative estimate for free tier
  private requestCountResetTime: Date

  constructor(apiKey: string, model = 'meta-llama/Llama-3.1-8B-Instruct') {
    this.apiKey = apiKey
    this.model = model
    this.requestCountResetTime = getNextDayReset()
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false
    if (this.rateLimitedUntil && new Date() < this.rateLimitedUntil) {
      return false
    }
    // Reset daily counter if past reset time
    if (new Date() >= this.requestCountResetTime) {
      this.requestCount = 0
      this.requestCountResetTime = getNextDayReset()
    }
    return this.requestCount < this.maxDailyRequests
  }

  getRemainingQuota(): QuotaInfo {
    if (new Date() >= this.requestCountResetTime) {
      this.requestCount = 0
      this.requestCountResetTime = getNextDayReset()
    }
    return {
      remainingCalls: Math.max(0, this.maxDailyRequests - this.requestCount),
      resetTime: this.requestCountResetTime,
    }
  }

  async complete(prompt: string, options?: LLMOptions): Promise<string> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const messages: Array<{ role: string; content: string }> = []

      if (options?.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt })
      }
      messages.push({ role: 'user', content: prompt })

      // Hugging Face's OpenAI-compatible router endpoint.
      // The legacy api-inference.huggingface.co host is no longer reachable.
      const response = await fetch(
        'https://router.huggingface.co/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            max_tokens: options?.maxTokens ?? 1024,
            temperature: options?.temperature ?? 0.7,
          }),
          signal: controller.signal,
        }
      )

      if (response.status === 429) {
        // Rate limited - mark unavailable for 1 hour
        this.rateLimitedUntil = new Date(Date.now() + 60 * 60 * 1000)
        throw new Error('Rate limit exceeded')
      }

      if (response.status >= 500) {
        throw new Error(`Server error: ${response.status}`)
      }

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`)
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>
      }

      const content = data.choices?.[0]?.message?.content
      if (!content) {
        throw new Error('Malformed response from HuggingFace')
      }

      this.requestCount++
      return content
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

// ---------------------------------------------------------------------------
// Groq Provider
// ---------------------------------------------------------------------------

/**
 * Groq API provider (free tier).
 *
 * Uses the Groq OpenAI-compatible chat completions endpoint.
 * Free tier: 14,400 requests/day, 6,000 tokens/min.
 * Handles HTTP 429 responses by marking the provider as temporarily unavailable.
 */
export class GroqProvider implements LLMProvider {
  readonly name = 'Groq'

  private readonly apiKey: string
  private readonly model: string
  private rateLimitedUntil: Date | null = null
  private requestCount = 0
  private readonly maxDailyRequests = 14_400
  private requestCountResetTime: Date

  constructor(apiKey: string, model = 'llama-3.1-8b-instant') {
    this.apiKey = apiKey
    this.model = model
    this.requestCountResetTime = getNextDayReset()
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false
    if (this.rateLimitedUntil && new Date() < this.rateLimitedUntil) {
      return false
    }
    // Reset daily counter if past reset time
    if (new Date() >= this.requestCountResetTime) {
      this.requestCount = 0
      this.requestCountResetTime = getNextDayReset()
    }
    return this.requestCount < this.maxDailyRequests
  }

  getRemainingQuota(): QuotaInfo {
    if (new Date() >= this.requestCountResetTime) {
      this.requestCount = 0
      this.requestCountResetTime = getNextDayReset()
    }
    return {
      remainingCalls: Math.max(0, this.maxDailyRequests - this.requestCount),
      resetTime: this.requestCountResetTime,
    }
  }

  async complete(prompt: string, options?: LLMOptions): Promise<string> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const messages: Array<{ role: string; content: string }> = []

      if (options?.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt })
      }
      messages.push({ role: 'user', content: prompt })

      const body = {
        model: this.model,
        messages,
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature ?? 0.7,
      }

      const response = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }
      )

      if (response.status === 429) {
        // Rate limited - mark unavailable for 1 minute (token-per-minute limit)
        this.rateLimitedUntil = new Date(Date.now() + 60 * 1000)
        throw new Error('Rate limit exceeded')
      }

      if (response.status >= 500) {
        throw new Error(`Server error: ${response.status}`)
      }

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`)
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>
      }

      if (
        !data.choices ||
        !Array.isArray(data.choices) ||
        data.choices.length === 0 ||
        !data.choices[0].message?.content
      ) {
        throw new Error('Malformed response from Groq')
      }

      this.requestCount++
      return data.choices[0].message.content
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

// ---------------------------------------------------------------------------
// LLM Provider Chain
// ---------------------------------------------------------------------------

/**
 * Orchestrates multiple LLM providers with ordered fallback.
 *
 * Behavior:
 * - NEVER throws an exception for non-empty prompts ≤ 10,000 characters
 * - Always returns a non-empty string
 * - Checks LRU cache before making any network calls
 * - Tries each provider in order, skipping unavailable or failed ones
 * - Falls back to local heuristic generation when all providers fail
 * - Caches successful responses (max 50 entries, LRU eviction)
 */
export class LLMProviderChain {
  readonly providers: LLMProvider[]
  private readonly cache: LRUCache

  constructor(providers: LLMProvider[], cache?: LRUCache) {
    this.providers = providers
    this.cache = cache ?? new LRUCache(MAX_CACHE_ENTRIES)
  }

  /**
   * Completes a prompt using the provider chain with fallback.
   * Never throws for valid prompts (non-empty, ≤ 10,000 chars).
   * Always returns a non-empty string.
   */
  async complete(prompt: string, options?: LLMOptions): Promise<string> {
    try {
      // Check cache first
      const cacheKey = hashPrompt(prompt)
      const cached = this.cache.get(cacheKey)
      if (cached !== undefined) {
        return cached
      }

      // Try each provider in order
      for (const provider of this.providers) {
        try {
          const available = await provider.isAvailable()
          if (!available) continue

          const quota = provider.getRemainingQuota()
          if (quota.remainingCalls <= 0) continue

          const response = await provider.complete(prompt, options)

          // Validate the response is non-empty
          if (!response || response.trim().length === 0) {
            continue // Treat empty response as failure
          }

          // Cache successful response
          this.cache.set(cacheKey, response)
          return response
        } catch {
          // Provider failed — skip to next
          continue
        }
      }

      // All providers failed — use local heuristic fallback
      const fallbackResponse = fallbackLocalGeneration(prompt)
      this.cache.set(hashPrompt(prompt), fallbackResponse)
      return fallbackResponse
    } catch {
      // Absolute safety net — should never reach here, but guarantees no throw
      return fallbackLocalGeneration(prompt)
    }
  }

  /**
   * Returns the current cache instance (useful for testing).
   */
  getCache(): LRUCache {
    return this.cache
  }
}

// ---------------------------------------------------------------------------
// Local Heuristic Fallback
// ---------------------------------------------------------------------------

/**
 * Generates a valid course section JSON string from prompt content
 * when all LLM providers are unavailable.
 *
 * Extracts sentences from the prompt to create:
 * - At least 1 multiple-choice quiz question with 4 options
 * - At least 2 flashcards
 * - Returns valid JSON matching the CourseSection format
 */
export function fallbackLocalGeneration(prompt: string): string {
  const sentences = extractSentences(prompt)

  const quizzes = generateFallbackQuizzes(sentences)
  const flashcards = generateFallbackFlashcards(sentences)

  const result = {
    title: 'Section Review',
    summary: 'Review the key concepts from this section.',
    quizzes,
    flashcards,
    puzzles: [] as unknown[],
  }

  return JSON.stringify(result)
}

/**
 * Extracts meaningful sentences from prompt text.
 */
function extractSentences(text: string): string[] {
  // Split by sentence boundaries and filter out very short or empty fragments
  const raw = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10)
  // Return at least a few usable sentences; if none, create from words
  if (raw.length === 0) {
    const words = text.split(/\s+/).filter(w => w.length > 0)
    if (words.length >= 3) {
      return [words.slice(0, Math.min(10, words.length)).join(' ')]
    }
    return ['Key concepts from this content']
  }
  return raw.slice(0, 10) // Limit to 10 sentences for processing
}

/**
 * Generates at least 1 multiple-choice quiz question from extracted sentences.
 */
function generateFallbackQuizzes(
  sentences: string[]
): Array<{
  type: string
  question: string
  options: string[]
  correctAnswer: string
  explanation: string
}> {
  const quizzes: Array<{
    type: string
    question: string
    options: string[]
    correctAnswer: string
    explanation: string
  }> = []

  // Take the first available sentence to form a question
  const baseSentence = sentences[0] || 'Key concepts'
  const words = baseSentence.split(/\s+/)
  const keyTerm = words.length > 2 ? words.slice(0, 3).join(' ') : baseSentence

  quizzes.push({
    type: 'multiple-choice',
    question: `Which of the following best describes: "${keyTerm}"?`,
    options: [
      `It relates to ${keyTerm}`,
      `It is unrelated to the topic`,
      `It is a secondary concept`,
      `None of the above`,
    ],
    correctAnswer: `It relates to ${keyTerm}`,
    explanation: `This concept was discussed in the source material.`,
  })

  return quizzes
}

/**
 * Generates at least 2 flashcards from extracted sentences.
 */
function generateFallbackFlashcards(
  sentences: string[]
): Array<{ front: string; back: string }> {
  const flashcards: Array<{ front: string; back: string }> = []

  // Generate flashcard 1
  const sentence1 = sentences[0] || 'Key concept'
  flashcards.push({
    front: `What is meant by: "${truncate(sentence1, 80)}"?`,
    back: `This refers to: ${truncate(sentence1, 120)}`,
  })

  // Generate flashcard 2
  const sentence2 = sentences.length > 1 ? sentences[1] : sentences[0] || 'Key concept'
  flashcards.push({
    front: `Explain the concept: "${truncate(sentence2, 80)}"`,
    back: `${truncate(sentence2, 120)}`,
  })

  return flashcards
}

/**
 * Truncates a string to the specified maximum length, adding ellipsis if truncated.
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Computes a simple hash string from a prompt for use as a cache key.
 */
export function hashPrompt(prompt: string): string {
  let hash = 0
  for (let i = 0; i < prompt.length; i++) {
    hash = ((hash << 5) - hash) + prompt.charCodeAt(i)
    hash |= 0 // Convert to 32-bit integer
  }
  return hash.toString(36)
}

/**
 * Returns a Date representing the next day's midnight (UTC) for rate limit reset.
 */
function getNextDayReset(): Date {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  tomorrow.setUTCHours(0, 0, 0, 0)
  return tomorrow
}

import OpenAI from "openai";

// process.env.GROQ_MODEL lets this be swapped without a code change;
// "openai/gpt-oss-120b" is confirmed available on our Groq account
// (llama-3.3-70b-versatile 404'd — account doesn't have that tier).
export const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

// Shown to the user when Groq is still rate-limiting us after our one
// retry. Both routes return it as `{ error: "busy", message }` with HTTP 429
// so the client can style it as temporary load rather than a breakage.
export const GROQ_BUSY_MESSAGE = "Lots of people vibing right now — try again in a moment.";

// Shared by every route that talks to Groq (app/api/generate-question,
// app/api/summarize-profile) so the base URL and key handling live in one
// place. Throws if the key is missing — callers decide how to surface that.
export function getGroqClient(): OpenAI {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set.");
  }
  // maxRetries: 0 — the SDK otherwise silently retries 429s/5xx twice on its
  // own, so every "one" call could really be three, stacked under our own
  // retries below. All retrying is explicit in withRateLimitRetry and the
  // routes' JSON-validation retry instead.
  return new OpenAI({ baseURL: "https://api.groq.com/openai/v1", apiKey, maxRetries: 0 });
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The openai SDK throws an APIError with `status`/`code` attached for
// non-2xx responses — this is the one place both routes check for a Groq
// rate limit (429) so their handling can't drift on what shape to check.
export function isGroqRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const status = (err as { status?: unknown }).status;
  const code = (err as { code?: unknown }).code;
  return status === 429 || code === "rate_limit_exceeded";
}

const RATE_LIMIT_RETRY_DELAY_MS = 1750;

// Groq's rate-limit headers tell us which limit tripped (requests vs tokens)
// and how close we are — the difference between real traffic and a bug
// hammering the endpoint shows up here.
function rateLimitDetails(err: unknown) {
  const headers = (err as { headers?: unknown }).headers;
  const get = (name: string) => (headers instanceof Headers ? headers.get(name) : null);
  return {
    retryAfter: get("retry-after"),
    remainingRequests: get("x-ratelimit-remaining-requests"),
    remainingTokens: get("x-ratelimit-remaining-tokens"),
    resetRequests: get("x-ratelimit-reset-requests"),
    resetTokens: get("x-ratelimit-reset-tokens"),
    message: err instanceof Error ? err.message : String(err),
  };
}

// Runs one Groq call; on a 429 only, logs it, waits briefly and retries the
// identical call exactly once. Any other error, or a second 429, is thrown
// to the caller unchanged (check it with isGroqRateLimitError). Every log
// line starts with "[groq-429]" so they're easy to filter in Vercel logs.
export async function withRateLimitRetry<T>(
  route: string,
  meta: Record<string, unknown>,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (!isGroqRateLimitError(err)) throw err;
    console.warn(`[groq-429] ${route}: rate limited, retrying once in ${RATE_LIMIT_RETRY_DELAY_MS}ms`, {
      ...meta,
      ...rateLimitDetails(err),
    });
  }
  await sleep(RATE_LIMIT_RETRY_DELAY_MS);
  try {
    return await call();
  } catch (err) {
    if (isGroqRateLimitError(err)) {
      console.error(`[groq-429] ${route}: still rate limited after retry, giving up`, {
        ...meta,
        ...rateLimitDetails(err),
      });
    }
    throw err;
  }
}

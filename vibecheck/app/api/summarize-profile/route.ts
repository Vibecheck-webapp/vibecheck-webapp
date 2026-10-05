import { NextResponse } from "next/server";
import {
  getGroqClient,
  GROQ_BUSY_MESSAGE,
  GROQ_MODEL,
  isGroqRateLimitError,
  sleep,
  withRateLimitRetry,
} from "@/lib/groq";
import { extractScriptedName, filterUsableTurns, type UsableTurn } from "@/lib/summarize-filter";
import { isProfileContext, type ProfileContext } from "@/lib/supabase/types";

const MAX_BODY_BYTES = 20 * 1024;
const MAX_TURNS = 20;

const HEADLINE_MAX = 80;
const BIO_MAX = 400;
const SLIDE_ANSWER_MAX = 200; // rule (b) asks the model to aim for ~140; this is the hard ceiling
const VIBE_TAGS_MAX = 5;
const INTERESTS_MAX = 12;
const SLIDES_MIN = 2;
const SLIDES_MAX = 5;

// Pause before the JSON-validation retry so a failed call isn't immediately
// followed by another one — back-to-back calls can themselves trip Groq's
// rate limit rather than just recover from a bad response.
const JSON_RETRY_DELAY_MS = 500;

// Same mock-mode convention as generate-question, but gated on NODE_ENV too
// — a summarization bug shipping mock/fake profile content to real users in
// production is a much worse failure mode than a mock question would be.
const MOCK_MODE = process.env.AI_MOCK_MODE === "true" && process.env.NODE_ENV !== "production";

const CONTEXT_TONE: Record<ProfileContext, string> = {
  dating: "warm and playful",
  friendship: "casual and funny",
  get_to_know: "curious and expressive",
};

interface RequestTurn {
  question: string;
  answer: string | null;
  status: "answered" | "skipped_for_now" | "excluded";
}

interface RequestBody {
  context: ProfileContext;
  conversation: RequestTurn[];
}

export interface SummarySlide {
  question: string;
  answer: string;
  source_index: number;
}

export interface SummaryResult {
  name: string | null;
  headline: string;
  bio: string;
  vibe_tags: string[];
  interests: string[];
  slides: SummarySlide[];
}

function buildIndexedTranscript(usable: UsableTurn[]): string {
  return usable.map((t) => `${t.index}. Q: ${t.question}\n   A: ${t.answer}`).join("\n");
}

function buildSystemPrompt(context: ProfileContext): string {
  return `You are Vibecheck, turning someone's own conversation answers into a short shareable profile. This is their real conversation — treat every fact as sacred.

Rules:
a. Use ONLY what the user actually said in the answers given to you. Never invent facts, names, places, jobs, ages, relationships, or opinions. If you're not sure something is true from their answers, leave it out entirely.
b. For each slide, rewrite that answer as ONE punchy first-person statement, at most about 140 characters, in their own voice and vocabulary — fix grammar, cut filler, keep their specific details. Never make it funnier, more flirtatious, or more impressive than what they actually said. Example: if they said "yeah I've entered like 3 amateur baking contests and I lost every single time lol", write "I've competed in three amateur baking competitions and lost every single one." The "question" field must be copied exactly from the item it came from, unchanged.
c. When choosing which answers become slides, prefer the most distinctive and specific answers over generic, forgettable ones.
d. Never state or imply a sensitive attribute — health, religion, sexual orientation, ethnicity, or finances — unless the user explicitly said it themselves in one of the answers given to you.
e. Tone: ${CONTEXT_TONE[context]}. This affects word choice only — it must never add content that isn't in their answers.
f. Respond with ONLY a JSON object, no other text, no markdown fences.

Respond with ONLY a json object matching this exact shape:
{"name": "their name if they stated it, or null", "headline": "one short punchy line, max 80 characters", "bio": "2-4 sentences summarizing them, max 400 characters", "vibe_tags": ["up to 5 short tags"], "interests": ["up to 12 short interest/topic words or phrases"], "slides": [{"question": "<copied exactly from an item below>", "answer": "<their answer, rewritten per rule b>", "source_index": <that item's index number>}]}

Include about 4 slides — at least 2, at most 5 — picking the best answers per rule c. Every "source_index" must be one of the index numbers given below.`;
}

// Manual validation (no schema library in this project) — re-derives every
// field from the raw model output defensively, and critically, re-checks
// every slide's source_index against the actual set of usable indices. This
// is the second and final gate an excluded/skipped/scripted answer would
// have to pass through: it never reached the prompt (see
// filterUsableTurns), and even if the model somehow fabricated or
// misattributed an index, this drops anything outside that set.
function validateSummaryOutput(
  raw: unknown,
  usable: UsableTurn[],
  scriptedName: string | null,
): SummaryResult | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const usableByIndex = new Map(usable.map((t) => [t.index, t]));

  const modelName = typeof obj.name === "string" && obj.name.trim() ? obj.name.trim().slice(0, 60) : null;
  // The scripted answer is a direct, deterministic value the user typed
  // into the exact "what should I call you?" question — prefer it over
  // anything the model inferred from free-text answers.
  const name = scriptedName ?? modelName;

  const headline = typeof obj.headline === "string" ? obj.headline.trim().slice(0, HEADLINE_MAX) : "";
  const bio = typeof obj.bio === "string" ? obj.bio.trim().slice(0, BIO_MAX) : "";
  const vibe_tags = Array.isArray(obj.vibe_tags)
    ? obj.vibe_tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, VIBE_TAGS_MAX)
    : [];
  const interests = Array.isArray(obj.interests)
    ? obj.interests.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, INTERESTS_MAX)
    : [];

  const rawSlides = Array.isArray(obj.slides) ? obj.slides : [];
  const slides: SummarySlide[] = rawSlides
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({
      source_index: typeof s.source_index === "number" ? s.source_index : -1,
      answer: typeof s.answer === "string" ? s.answer.trim().slice(0, SLIDE_ANSWER_MAX) : "",
    }))
    // The actual exclusion guarantee: drop anything not in the allowed set.
    .filter((s) => usableByIndex.has(s.source_index) && s.answer.length > 0)
    // Always use OUR stored question text for that index, never the
    // model's copy of it — guarantees rule (b)'s "unchanged" requirement
    // regardless of whether the model echoed it correctly.
    .map((s) => ({
      question: usableByIndex.get(s.source_index)!.question,
      answer: s.answer,
      source_index: s.source_index,
    }))
    .slice(0, SLIDES_MAX);

  if (slides.length < SLIDES_MIN || !headline || !bio) return null;

  return { name, headline, bio, vibe_tags, interests, slides };
}

function buildMockSummary(
  context: ProfileContext,
  usable: UsableTurn[],
  scriptedName: string | null,
): SummaryResult {
  const slides: SummarySlide[] = usable.slice(0, 4).map((t) => ({
    question: t.question,
    answer: t.answer.length > 140 ? `${t.answer.slice(0, 137)}...` : t.answer,
    source_index: t.index,
  }));
  return {
    name: scriptedName,
    headline: `[MOCK] A ${context.replace("_", " ")} profile built from ${usable.length} real answer${usable.length === 1 ? "" : "s"}`,
    bio: `[MOCK MODE] This bio is a placeholder standing in for the real AI summary, built from your actual answers so the review/edit flow can be tested end to end without calling Groq.`,
    vibe_tags: ["mock", "testing"],
    interests: usable.slice(0, 3).map((t) => t.question.split(" ").slice(0, 3).join(" ")),
    slides,
  };
}

export async function POST(request: Request) {
  const rawText = await request.text();
  if (new TextEncoder().encode(rawText).length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request body too large." }, { status: 413 });
  }

  let body: RequestBody;
  try {
    body = JSON.parse(rawText) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { context, conversation } = body;

  if (!isProfileContext(context)) {
    return NextResponse.json({ error: `Unknown context: ${context}` }, { status: 400 });
  }
  if (!Array.isArray(conversation)) {
    return NextResponse.json({ error: "conversation must be an array." }, { status: 400 });
  }
  if (conversation.length > MAX_TURNS) {
    return NextResponse.json({ error: `conversation must be at most ${MAX_TURNS} turns.` }, { status: 400 });
  }

  const usable = filterUsableTurns(conversation);
  const scriptedName = extractScriptedName(conversation);

  if (usable.length === 0) {
    return NextResponse.json(
      { error: "Not enough answered questions to build a profile yet." },
      { status: 400 },
    );
  }

  if (MOCK_MODE) {
    return NextResponse.json(buildMockSummary(context, usable, scriptedName));
  }

  let client: ReturnType<typeof getGroqClient>;
  try {
    client = getGroqClient();
  } catch {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not set. Add it to .env.local before summarizing can work." },
      { status: 500 },
    );
  }

  const systemPrompt = buildSystemPrompt(context);
  const userPrompt = `Here are their real answers:\n${buildIndexedTranscript(usable)}`;

  async function askOnce(extraInstruction?: string) {
    const completion = await withRateLimitRetry("summarize-profile", { context, turns: usable.length }, () =>
      client.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: extraInstruction ? `${systemPrompt}\n\n${extraInstruction}` : systemPrompt,
          },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 1,
        top_p: 1,
        // Generous headroom: reasoning tokens count against this limit before
        // the visible JSON is emitted, and this output is much larger than a
        // single question (headline + bio + tags + interests + ~4 slides) —
        // the earlier json_validate_failed error came from too tight a cap.
        max_completion_tokens: 2000,
        reasoning_effort: "low",
      }),
    );
    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
    return JSON.parse(raw);
  }

  try {
    let result: SummaryResult | null = null;
    try {
      result = validateSummaryOutput(await askOnce(), usable, scriptedName);
    } catch (err) {
      // askOnce has already retried a 429 once — don't pile the JSON retry
      // on top of a rate limit; report it as busy below.
      if (isGroqRateLimitError(err)) throw err;
      console.warn("summarize-profile: first attempt failed, retrying with JSON reminder", err);
    }
    if (!result) {
      await sleep(JSON_RETRY_DELAY_MS);
      try {
        result = validateSummaryOutput(
          await askOnce("Be concise. Output complete, valid JSON only — no markdown fences, no trailing text."),
          usable,
          scriptedName,
        );
      } catch (err) {
        if (isGroqRateLimitError(err)) throw err;
        console.error("summarize-profile retry failed to parse", err);
      }
    }
    if (!result) {
      return NextResponse.json(
        { error: "Couldn't build a valid profile from that. Try again." },
        { status: 502 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    if (isGroqRateLimitError(err)) {
      // Already logged with a [groq-429] tag by withRateLimitRetry.
      return NextResponse.json({ error: "busy", message: GROQ_BUSY_MESSAGE }, { status: 429 });
    }
    console.error("summarize-profile failed", err);
    return NextResponse.json({ error: "Couldn't reach the AI. Try again." }, { status: 502 });
  }
}

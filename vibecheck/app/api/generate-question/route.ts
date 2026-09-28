import { NextResponse } from "next/server";
import { MAX_BUILDER_TURNS } from "@/lib/builder-constants";
import { getGroqClient, GROQ_MODEL } from "@/lib/groq";
import { isProfileContext, type ProfileContext } from "@/lib/supabase/types";

// ============ TESTING SCAFFOLD — remove once a real provider is funded ============
// AI_MOCK_MODE=true in .env.local bypasses DeepSeek entirely so the builder
// flow can be exercised end to end without a funded API key. Delete this
// block and the MOCK_MODE branch below to remove it; the real
// implementation beneath is untouched either way.
const MOCK_MODE = process.env.AI_MOCK_MODE === "true";

const MOCK_QUESTIONS: Record<ProfileContext, string[]> = {
  dating: [
    "First things first — what should I call you?",
    "What's something people are always surprised to learn about you?",
    "What does a perfect low-key weekend look like for you?",
    "Are you more of a planner or a go-with-the-flow person?",
    "What's a small thing that instantly makes someone more attractive to you?",
    "What's your love language, if you had to pick one?",
    "What's a hobby or interest you could talk about for hours?",
    "What's one thing you're looking for that you won't compromise on?",
  ],
  friendship: [
    "First things first — what should I call you?",
    "What's something people are always surprised to learn about you?",
    "How do you usually make new friends?",
    "What's your go-to hangout activity?",
    "Are you the planner of the friend group, or the one who just shows up?",
    "What's a hobby or interest you could talk about for hours?",
    "What kind of humor do you vibe with most?",
    "How would your closest friend describe you in three words?",
  ],
  get_to_know: [
    "First things first — what should I call you?",
    "What's something people are always surprised to learn about you?",
    "What's a hobby or interest you could talk about for hours?",
    "Are you more of an introvert or extrovert, or somewhere in between?",
    "What's something you're really passionate about right now?",
    "How would your closest friend describe you in three words?",
    "What does a perfect day look like for you?",
    "What's something you're proud of that isn't on a resume?",
  ],
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
// ============ end testing scaffold (declarations) ============

const CONTEXT_PERSONA: Record<ProfileContext, string> = {
  dating:
    "warm, playful, and curious — like a good friend helping someone build a dating profile that shows their romantic side without being cheesy.",
  friendship:
    "casual, energetic, and funny — like texting a new friend and getting to know their social side, interests, and quirks.",
  get_to_know:
    "curious, expressive, and playful — broad and personality-first, suitable for sharing with anyone regardless of context.",
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

function buildTranscript(conversation: RequestTurn[]): string {
  if (!conversation.length) return "(no questions asked yet)";
  return conversation
    .map((turn, i) => {
      const answerLine =
        turn.status === "answered"
          ? `A: ${turn.answer}`
          : turn.status === "skipped_for_now"
            ? "A: (skipped for now)"
            : "A: (declined — do not ask again, do not reference)";
      return `${i + 1}. Q: ${turn.question}\n   ${answerLine}`;
    })
    .join("\n");
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
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

  // Hard backstop independent of the client's own cap, in case that logic
  // ever has a bug — never keep calling the AI past this no matter what.
  if (conversation.length >= MAX_BUILDER_TURNS) {
    return NextResponse.json({ done: true });
  }

  // ============ TESTING SCAFFOLD — remove once a real provider is funded ============
  if (MOCK_MODE) {
    await sleep(400 + Math.random() * 400);
    const bank = MOCK_QUESTIONS[context];
    const nextQuestion = bank[conversation.length];
    if (!nextQuestion) {
      return NextResponse.json({ done: true });
    }
    return NextResponse.json({ done: false, question: nextQuestion });
  }
  // ============ end testing scaffold ============

  let client: ReturnType<typeof getGroqClient>;
  try {
    client = getGroqClient();
  } catch {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not set. Add it to .env.local before the builder can ask questions." },
      { status: 500 },
    );
  }

  // Groq's JSON object mode requires the response shape to be spelled out
  // explicitly in the prompt — there's no separate schema param for it.
  const systemPrompt = `You are Vibecheck, an AI interviewer helping someone build a shareable personality profile.
Persona for this conversation: ${CONTEXT_PERSONA[context]}

Ask ONE next question that fits naturally after what's already been asked — don't repeat a topic already covered by an answered or declined question, but you may gently re-approach a "skipped for now" topic later if it fits.
If you now have enough answers (roughly 8-12 exchanges, or clearly enough to build a good profile), set "done" to true instead of asking another question.
If a short set of quick-reply choices would help (e.g. an age range, a yes/no, a short list of options), include 2-6 short options in "quickReplies" — otherwise omit it.
Keep the question short, conversational, and in character. Never ask for anything that identifies exact real-world location, contact info, or content unsuitable for a 13+ audience.

Respond with ONLY a json object, no other text, matching this exact shape:
{"done": false, "question": "your next question here", "quickReplies": ["optional", "short", "options"]}
or, once you have enough:
{"done": true}`;

  const userPrompt = `Conversation so far:\n${buildTranscript(conversation)}`;

  async function askOnce(extraInstruction?: string) {
    const completion = await client.chat.completions.create({
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
      // Generous headroom: reasoning_effort spends part of this budget on
      // hidden reasoning tokens before the visible JSON is emitted, so a
      // tight cap here truncates the JSON output mid-object.
      max_completion_tokens: 600,
      reasoning_effort: "medium",
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
    return JSON.parse(raw);
  }

  try {
    let parsed;
    try {
      parsed = await askOnce();
    } catch {
      parsed = await askOnce("Keep your response concise and ensure the JSON is complete and valid.");
    }
    return NextResponse.json({
      done: Boolean(parsed.done),
      question: typeof parsed.question === "string" ? parsed.question : undefined,
      quickReplies: Array.isArray(parsed.quickReplies) ? parsed.quickReplies.slice(0, 6) : undefined,
    });
  } catch (err) {
    console.error("generate-question failed", err);
    return NextResponse.json({ error: "Couldn't reach the AI. Try again." }, { status: 502 });
  }
}

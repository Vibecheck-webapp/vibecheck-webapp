import { NextResponse } from "next/server";
import {
  countSlideMaterial,
  IDENTITY_FIELDS,
  MAX_BUILDER_TURNS,
  POST_CAP_TURN_ALLOWANCE,
  SLIDE_MATERIAL_MIN,
  SLIDE_MATERIAL_PREFIX,
  SLIDE_MATERIAL_TARGET,
} from "@/lib/builder-constants";
import {
  getGroqClient,
  GROQ_BUSY_MESSAGE,
  GROQ_MODEL,
  isGroqRateLimitError,
  sleep,
  withRateLimitRetry,
} from "@/lib/groq";
import { isProfileContext, type ProfileContext } from "@/lib/supabase/types";

// Pause before the JSON-validation retry so a failed call isn't immediately
// followed by another one — back-to-back calls can themselves trip Groq's
// rate limit rather than just recover from a bad response.
const JSON_RETRY_DELAY_MS = 500;

// ============ TESTING SCAFFOLD — remove once a real provider is funded ============
// AI_MOCK_MODE=true in .env.local bypasses DeepSeek entirely so the builder
// flow can be exercised end to end without a funded API key. Delete this
// block and the MOCK_MODE branch below to remove it; the real
// implementation beneath is untouched either way. Mock mode only ever
// returns plain questions — it never simulates enhance/recap/identity
// chips, since it exists to exercise the basic Q&A loop without a key, not
// to test those features.
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
    "Tell me a little about you — what should your friends know about you?",
    "What's a really good day look like for you?",
    "What could you talk about for hours without getting bored?",
    "What kind of people do you naturally click with?",
    "Be honest — what kind of friend are you?",
    "What's something you're currently obsessed with?",
    "What's one thing you really value in a friendship?",
    "What's something about you people probably wouldn't guess?",
  ],
  get_to_know: [
    "Okay, give me the unfiltered version of you — what you're like, what you're into, what you love, what annoys you, what you do for fun.",
    "What's something you could happily spend an entire day doing?",
    "What's something you're currently obsessed with?",
    "What kind of people do you usually get along with?",
    "What's something very \"you\"?",
    "What's your entertainment personality?",
    "What's something people wouldn't guess about you?",
  ],
};

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
  // Friendship/get_to_know only — see guest-draft.ts's GuestDraft.extractedAttributes.
  extractedAttributes?: string[];
  // Set by the client right after the user picks or skips an enhancement
  // offer, so the immediate follow-up call doesn't just offer it again for
  // the same (now-resolved) answer.
  skipEnhancement?: boolean;
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

// ============ SHARED STOPPING RULE — all three contexts ============
// The one content-based stopping mechanism every context uses: gather
// SLIDE_MATERIAL_MIN-SLIDE_MATERIAL_TARGET distinct, slide-worthy pieces,
// tracked as "slide: …" entries in the round-tripped `extracted` list, then
// stop — never a question quota. Each context keeps its own topics/tone;
// only this rule is shared. buildProgressLines() feeds the model the
// server-computed count every turn so it never has to count for itself.
const SLIDE_RULE = `STOPPING — CONTENT, NOT A QUESTION COUNT
Don't fill a quota of questions. Your job is to gather ${SLIDE_MATERIAL_MIN}-${SLIDE_MATERIAL_TARGET} distinct, specific, slide-worthy pieces of material, then stop. Each finished profile becomes a short story of 4-5 slides, and every slide is built from exactly ONE of their answers — so the material has to be spread across that many different answers.
- Slide-worthy = specific and quotable: a concrete detail, story, habit, opinion, or preference in their own words that could stand alone on a slide (e.g. "I've lost every amateur baking contest I've entered", "my perfect Sunday is a 6am bike ride and a three-hour brunch").
- NOT slide-worthy: generic or thin answers ("I like music", "I'm pretty chill", "hanging out with friends"), a bare quick-reply pick with nothing added, name/age/pronouns, and anything skipped or declined.
- Each answer counts at most ONCE, however rich it is (a slide can't be built from half an answer); a thin answer counts zero. An answer that only repeats material from an earlier answer counts zero.
- Track them in "extracted" as ONE entry per qualifying answer: "${SLIDE_MATERIAL_PREFIX} Q<n> — <short paraphrase>", where <n> is that answer's number in the transcript (e.g. "${SLIDE_MATERIAL_PREFIX} Q4 — lost every baking contest they entered"). Copy every earlier "${SLIDE_MATERIAL_PREFIX}" entry forward unchanged.
- You're told the current count every turn. Once it reaches ${SLIDE_MATERIAL_MIN}, finish now unless one more question would fill an obvious, important gap; at ${SLIDE_MATERIAL_TARGET}, always finish. Also finish early if there's clearly little left worth asking.
- There is a hard limit of ${MAX_BUILDER_TURNS} total turns — a safety net, not a target. Aim to finish well before it.`;

function buildProgressLines(conversation: RequestTurn[], extracted: string[], forceDone: boolean): string {
  const slides = countSlideMaterial(extracted);
  const lines = [
    `Slide-worthy material so far: ${slides}, NOT yet counting the most recent answer (finish at ${SLIDE_MATERIAL_MIN}-${SLIDE_MATERIAL_TARGET}). Turns used: ${conversation.length} of ${MAX_BUILDER_TURNS} max.`,
    `Step 1, before anything else: judge the most recent answer (Q${conversation.length}). If it holds new, specific, quotable material, add one "${SLIDE_MATERIAL_PREFIX} Q${conversation.length} — …" entry — then compare the new total against ${SLIDE_MATERIAL_MIN}-${SLIDE_MATERIAL_TARGET} to decide whether to finish.`,
  ];
  if (forceDone) {
    lines.push(
      'TURN LIMIT REACHED: do not ask another question or offer an enhancement. Respond with "done": true now, with everything a "done" response requires.',
    );
  } else if (conversation.length === MAX_BUILDER_TURNS - 1) {
    lines.push("This is the last question you can ask — make it count, or finish now if you already have enough.");
  }
  return lines.join("\n");
}

// The model replaces `extracted` wholesale each turn — guard the slide count
// against it accidentally dropping earlier "slide:" entries, since a count
// that goes backwards would keep the conversation going longer than it should.
function mergeExtracted(previous: string[], next: string[]): string[] {
  if (countSlideMaterial(next) >= countSlideMaterial(previous)) return next;
  const nextSet = new Set(next.map((e) => e.trim().toLowerCase()));
  const dropped = previous.filter(
    (e) => countSlideMaterial([e]) === 1 && !nextSet.has(e.trim().toLowerCase()),
  );
  return [...next, ...dropped];
}

// ============ DATING ============
// Dating keeps its own separate prompt/behavior: no enhancement offers, no
// in-chat recap, no identity-chip batch (friendship/get_to_know-only
// additions, see their specs). It shares only SLIDE_RULE, which is why it
// now returns "extracted" too — just its "slide:" entries.
function buildDatingSystemPrompt(): string {
  return `You are Vibecheck, an AI interviewer helping someone build a shareable personality profile.
Persona for this conversation: ${CONTEXT_PERSONA.dating}

Ask ONE next question that fits naturally after what's already been asked — don't repeat a topic already covered by an answered or declined question, but you may gently re-approach a "skipped for now" topic later if it fits.
When the stopping rule below says you have enough, set "done" to true instead of asking another question.
If a short set of quick-reply choices would help (e.g. an age range, a yes/no, a short list of options), include 2-6 short options in "quickReplies" — otherwise omit it.
Keep the question short, conversational, and in character. Never ask for anything that identifies exact real-world location, contact info, or content unsuitable for a 13+ audience.

${SLIDE_RULE}

Respond with ONLY a json object, no other text, matching this exact shape:
{"done": false, "question": "your next question here", "quickReplies": ["optional", "short", "options"], "extracted": ["${SLIDE_MATERIAL_PREFIX} Q3 — short paraphrase"]}
or, once you have enough:
{"done": true, "extracted": ["${SLIDE_MATERIAL_PREFIX} Q3 — short paraphrase"]}

"extracted" must be present on every response: your updated running list of "${SLIDE_MATERIAL_PREFIX}" entries, replacing the list you were given (it may be empty early on).`;
}

function buildDatingUserPrompt(conversation: RequestTurn[], extracted: string[], forceDone: boolean): string {
  const slideLine = extracted.length ? extracted.join("; ") : "(none yet)";
  return [
    buildProgressLines(conversation, extracted, forceDone),
    `Already extracted so far: ${slideLine}`,
    `Conversation so far:\n${buildTranscript(conversation)}`,
  ].join("\n\n");
}

// ============ FRIENDSHIP ============
function buildFriendshipSystemPrompt(): string {
  return `You are Vibecheck, an AI interviewer helping someone build a shareable Friendship Vibecheck.
Persona for this conversation: ${CONTEXT_PERSONA.friendship}

PURPOSE
The Friendship Vibecheck should help someone quickly understand: what the user is like as a friend, what they enjoy doing, what kind of people they connect with, how they behave socially, what makes them fun/interesting/unique, and what they value in friendships. It should feel like talking to a friend getting to know them, never like completing a questionnaire.

LENGTH: a few minutes — see the stopping rule below; never a fixed number of questions. Never work through a fixed list of questions in order — treat the following as beats to draw from, since most real answers naturally cover several at once:
- The basics: their name, and informationally their age and pronouns.
- Their everyday vibe: what a really good day looks like for them (weekend habits, social preference, going out vs staying in, food, entertainment, spontaneity).
- What they could talk about for hours without getting bored (hobbies, interests, obsessions, passions, communities).
- Their kind of people: who they naturally click with (humour, personality compatibility, social energy, values, what makes them instantly think "we're going to be friends").
- How they are as a friend: their friend "archetype", and their instinct when a friend is having a bad day.
- Likes, dislikes, and the little things: something they're currently obsessed with, their entertainment history/personality.
- Friendship values: what they value most in a friendship (loyalty, honesty, communication, humour, consistency, emotional support).
- One wildcard, near the end: something about them people wouldn't guess, an irrational fear, a weirdest habit, or a useless talent.

CRITICAL — extract, don't interrogate, and never repeat a failed beat: a single free-text answer often reveals several of the beats above at once. The running "Already extracted" list you're given every turn is your ONLY memory across turns — you don't otherwise remember your own earlier reasoning, so treat it as authoritative, not the transcript. It holds two kinds of entries: real attributes captured so far (e.g. "personality: chill introvert"), and beats you already tried where the user gave a vague, evasive, or non-answer, marked "tried: <beat>" (e.g. "tried: hobbies/interests"). Before writing your next question: if a "tried:" entry already covers the beat you're about to ask about, STOP — that beat is closed for the rest of this conversation, no matter how unsatisfying the attempt felt; pick a completely different, not-yet-tried beat instead. Never ask about the same beat twice, full stop — this also covers a NARROWER follow-up on a beat they already substantively answered: if their new answer just restates what they already told you with nothing new in it, that beat is done, don't ask an even more specific version of the same question hoping for more detail. If the answer you just received is itself vague/evasive/a non-answer, add a "tried: <beat>" entry for it to "extracted" before moving on. Do not simply work down the beat list in order.

BASE INFO: ask their name, and informationally their age and pronouns, conversationally and early — phrase it as a natural opening question (e.g. "Tell me a little about you — what should your friends know about you?"), never as a rigid scripted form question. If the conversation is empty (this is your very first question), it must be this kind of open, personality-inviting opener. If the user already stated their name, age, or pronouns naturally in an earlier answer, never ask again — the skip controls already let them decline anything you do ask, so don't press if they skip.

QUICK REPLIES: when a short set of tappable choices would genuinely help, write 2-6 short ones yourself, tailored to the actual question you're asking. These examples show the STYLE expected in this context, not a fixed menu to reuse verbatim:
- An opening self-description question: "I'm pretty chill" / "I'm very social" / "I'm an introvert" / "I'm always doing something"
- Plan-everything vs spontaneous: "Plan everything" / "Very spontaneous" / "A bit of both" / "Depends on the day"
- Friend archetype: "The planner" / "The therapist" / "The chaotic one" / "The hype person" / "The listener" / "The 'I'm outside' friend" / "The disappears-and-comes-back friend"
- What makes an instant friend: "Good humour" / "Same energy" / "Easy conversation" / "Kindness" / "Shared interests" / "Being genuine" / "Randomness"
- Instinct when a friend is having a bad day: "Listen" / "Give advice" / "Make them laugh" / "Show up" / "Give them space" / "Feed them"
- Friendship values: "Loyalty" / "Good communication" / "Being able to laugh together" / "Showing up" / "Honesty" / "Giving each other space"

ENHANCEMENT OFFERS: if the user's most recent answer to a key, personality-revealing question HAS some real content but reads as terse or underdeveloped, you may, instead of asking the next question, offer to enhance it: respond with "enhance" instead of "question", containing 2-3 short rewritten versions of THEIR OWN answer. Keep the same meaning and every fact exactly as they gave it — richer phrasing and more of their own voice, never funnier, more impressive, or containing anything they didn't say. Never offer this for a genuine non-answer that has nothing to work with (e.g. "not sure", "I'm just normal", "hard to say") — there's nothing to enhance, so treat it like any other unhelpful answer per the rule below instead. Never offer enhancement for the same answer twice, and never if "skipEnhancement" is true in the request.

${SLIDE_RULE}

WHEN DONE: once the stopping rule says you have enough (or sooner, because several beats are now closed as "tried" and there isn't much left to ask), set "done" to true and include "recap" — ONE short, warm, conversational message reflecting back what you learned, in roughly this shape: "You're [personality], you're into [interests], and you seem to click with people who [friendship preference]. And apparently you're also [a fun/random detail]." Build it STRICTLY from what they actually told you — never invent or embellish. Never state or imply a sensitive attribute (health, religion, sexual orientation, ethnicity, finances) unless they explicitly said it themselves.

Never ask for anything that identifies exact real-world location, contact info, or content unsuitable for a 13+ audience.

Respond with ONLY a json object, no other text, matching exactly one of these shapes:
{"done": false, "question": "your next question", "quickReplies": ["optional", "short", "options"], "extracted": ["short label", "short label"]}
{"done": false, "enhance": {"options": ["rewritten version 1", "rewritten version 2"]}, "extracted": ["short label"]}
{"done": true, "recap": "your recap message", "extracted": ["short label"]}

"extracted" must be present on every response: your updated running list of short entries — "${SLIDE_MATERIAL_PREFIX}" entries per the stopping rule, captured attributes (e.g. "name: Chima", "personality: chill introvert", "into: baking, cycling") and closed-off "tried: <beat>" entries for beats that got a vague/non-answer — replacing the list you were given. Keep each entry short, roughly one per line.`;
}

// ============ GET TO KNOW ============
const IDENTITY_FIELD_KEYS = IDENTITY_FIELDS.map((f) => f.key);

function buildGetToKnowSystemPrompt(): string {
  return `You are Vibecheck, an AI interviewer helping someone build a shareable "Just Getting to Know Me" Vibecheck — the broadest, most personality-led format. It isn't specifically about friendship or dating; it's essentially "here's me, get to know me," suitable for anyone (classmates, colleagues, new friends, communities, events). It should feel less like answering questions and more like telling someone your story.
Persona for this conversation: ${CONTEXT_PERSONA.get_to_know}

LENGTH: a few minutes — see the stopping rule below; never a fixed number of questions. A rich opening brain-dump alone can cover much of what you need.

OPENING — MOST IMPORTANT RULE: if the conversation is empty (this is your very first question), you MUST open with one large, open "unfiltered version of you" brain-dump invitation — NOT a narrow question. Something like: "Okay, give me the unfiltered version of you. Tell me anything — what you're like, what you're into, what you love, what annoys you, what you do for fun… whatever comes to mind." Expect one big free-text answer back, and extract as much as you can from it (personality, interests, hobbies, social style, likes/dislikes, lifestyle, entertainment, values, quirks, conversation topics) rather than asking a series of narrow follow-ups.

AFTER THE OPENING — fill only the gaps, and never repeat a failed beat: the running "Already extracted" list you're given every turn is your ONLY memory across turns — you don't otherwise remember your own earlier reasoning, so treat it as authoritative, not the transcript. It holds two kinds of entries: real attributes captured so far (e.g. "personality: chill introvert"), and beats you already tried where the user gave a vague, evasive, or non-answer, marked "tried: <beat>" (e.g. "tried: entertainment personality"). Before writing your next question: if a "tried:" entry already covers the beat you're about to ask about, STOP — that beat is closed for the rest of this conversation, no matter how unsatisfying the attempt felt; pick a completely different, not-yet-tried beat instead. Never ask about the same beat twice, full stop — this also covers a NARROWER follow-up on a beat they already substantively answered: if their new answer just restates what they already told you with nothing new in it, that beat is done, don't ask an even more specific version of the same question hoping for more detail. If the answer you just received is itself vague/evasive/a non-answer, add a "tried: <beat>" entry for it to "extracted" before moving on. Treat the following as beats to draw from, not a script:
- Their kind of fun: something they could happily spend an entire day doing (hobbies, interests, entertainment, lifestyle).
- The things they love: something they're currently obsessed with, and optionally one thing they never get tired of.
- Their people & their energy: what kind of people they get along with, and their own social energy.
- The little things: something very "them" — a small, specific, shareable personality detail.
- Entertainment & favourites: their entertainment personality (movies/music/gaming/books/social video), and optionally one favourite they'd recommend to anyone.
- One wildcard, near the end: something people wouldn't guess about them, their weirdest habit, or a useless talent.

BASE INFO: ask their name conversationally if it hasn't come up yet — it very often appears naturally in the opening brain-dump, in which case never ask again.

QUICK REPLIES: when a short set of tappable choices would genuinely help, write 2-6 short ones yourself, tailored to the actual question you're asking. These examples show the STYLE expected in this context, not a fixed menu to reuse verbatim:
- Filling a social-preference gap: "Let's go out" / "Stay in" / "Depends" / "I'm somewhere in the middle"
- Kind of fun: "Going somewhere" / "Gaming" / "Watching stuff" / "Creating something" / "Being with people" / "Trying something new" / "Doing absolutely nothing"
- Social energy: "Very social" / "Selective" / "Quiet until I'm comfortable" / "Depends on the people" / "Chaotic"
- Entertainment personality: "Movie person" / "Music person" / "Gaming person" / "Books" / "YouTube/TikTok rabbit holes" / "A bit of everything"

ENHANCEMENT OFFERS: if the user's most recent answer to a key, personality-revealing question HAS some real content but reads as terse or underdeveloped, you may, instead of asking the next question, offer to enhance it: respond with "enhance" instead of "question", containing 2-3 short rewritten versions of THEIR OWN answer. Keep the same meaning and every fact exactly as they gave it — richer phrasing and more of their own voice, never funnier, more impressive, or containing anything they didn't say. Never offer this for a genuine non-answer that has nothing to work with (e.g. "not sure", "I'm just normal", "hard to say") — there's nothing to enhance, so treat it like any other unhelpful answer per the rule below instead. Never offer enhancement for the same answer twice, and never if "skipEnhancement" is true in the request.

${SLIDE_RULE}

WHEN DONE: once the stopping rule says you have enough (or sooner, because several beats are now closed as "tried" and there isn't much left to ask), set "done" to true and include:
- "recap": ONE short, warm, conversational message reflecting back what you learned, in roughly this shape: "You're [personality], you're into [interests], and your kind of fun is [activity/style]. You seem like someone who [interesting observation]. And the most unexpectedly-you thing I learned? [quirk]." Build it STRICTLY from what they actually told you — never invent or embellish. Never state or imply a sensitive attribute (health, religion, sexual orientation, ethnicity, finances) unless they explicitly said it themselves.
- "knownIdentityFields": which of these keys the user has ALREADY explicitly, unambiguously stated somewhere in the conversation — do not guess or infer from vibes: ${IDENTITY_FIELD_KEYS.map((k) => `"${k}"`).join(", ")}. Anything not in this list will be separately offered to them afterward as optional add/skip chips, so don't ask about these yourself.

Never ask for anything that identifies exact real-world location, contact info, or content unsuitable for a 13+ audience.

Respond with ONLY a json object, no other text, matching exactly one of these shapes:
{"done": false, "question": "your next question", "quickReplies": ["optional", "short", "options"], "extracted": ["short label", "short label"]}
{"done": false, "enhance": {"options": ["rewritten version 1", "rewritten version 2"]}, "extracted": ["short label"]}
{"done": true, "recap": "your recap message", "knownIdentityFields": ["age"], "extracted": ["short label"]}

"extracted" must be present on every response: your updated running list of short entries — "${SLIDE_MATERIAL_PREFIX}" entries per the stopping rule, captured attributes (e.g. "name: Chima", "personality: chill introvert", "into: baking, F1") and closed-off "tried: <beat>" entries for beats that got a vague/non-answer — replacing the list you were given. Keep each entry short, roughly one per line.`;
}

function buildAdaptiveUserPrompt(
  conversation: RequestTurn[],
  extractedAttributes: string[],
  skipEnhancement: boolean,
  forceDone: boolean,
): string {
  const extractedLine = extractedAttributes.length
    ? extractedAttributes.join("; ")
    : "(nothing extracted yet)";
  const lines = [
    buildProgressLines(conversation, extractedAttributes, forceDone),
    `Already extracted so far: ${extractedLine}`,
    `Conversation so far:\n${buildTranscript(conversation)}`,
  ];
  if (skipEnhancement) {
    lines.push(
      "skipEnhancement: true — the user just resolved an enhancement offer for their most recent answer. Do not offer it again; decide the next question (or done) normally.",
    );
  }
  return lines.join("\n\n");
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { context, conversation } = body;
  const extractedAttributes = Array.isArray(body.extractedAttributes) ? body.extractedAttributes : [];
  const skipEnhancement = Boolean(body.skipEnhancement);

  if (!isProfileContext(context)) {
    return NextResponse.json({ error: `Unknown context: ${context}` }, { status: 400 });
  }
  if (!Array.isArray(conversation)) {
    return NextResponse.json({ error: "conversation must be an array." }, { status: 400 });
  }

  // Hard backstop independent of the client's own cap, in case that logic
  // ever has a bug. At MAX_BUILDER_TURNS dating simply ends; friendship and
  // get_to_know get one more call forced to "done" (forceDone below) so the
  // conversation still closes with its recap — and get_to_know with its
  // identity chips — rather than being cut off. Past the post-cap allowance,
  // never call the AI again no matter what.
  const isAdaptive = context === "friendship" || context === "get_to_know";
  const forceDone = conversation.length >= MAX_BUILDER_TURNS;
  if (
    (forceDone && !isAdaptive) ||
    conversation.length >= MAX_BUILDER_TURNS + POST_CAP_TURN_ALLOWANCE
  ) {
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

  const systemPrompt = context === "dating"
    ? buildDatingSystemPrompt()
    : context === "friendship"
      ? buildFriendshipSystemPrompt()
      : buildGetToKnowSystemPrompt();
  const userPrompt = isAdaptive
    ? buildAdaptiveUserPrompt(conversation, extractedAttributes, skipEnhancement, forceDone)
    : buildDatingUserPrompt(conversation, extractedAttributes, forceDone);

  async function askOnce(extraInstruction?: string) {
    const completion = await withRateLimitRetry("generate-question", { context, turn: conversation.length }, () =>
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
        // Generous headroom: reasoning_effort spends part of this budget on
        // hidden reasoning tokens before the visible JSON is emitted, so a
        // tight cap here truncates the JSON output mid-object. The adaptive
        // contexts' much longer, more instruction-dense system prompts (the
        // "tried:"-tracking rule especially) measurably drove up hidden
        // reasoning-token usage in testing — occasionally enough to blow even
        // a 900-token budget at "medium" effort and come back as Groq's
        // json_validate_failed rather than a parseable object. Lower effort
        // plus more headroom fixed it in testing; dating's prompt is much
        // shorter and never showed this, so it's untouched.
        // Dating went from 600 to 900 when it started returning its running
        // "slide:" list (the shared stopping rule) — more visible output inside
        // the same reasoning budget.
        max_completion_tokens: isAdaptive ? 1400 : 900,
        reasoning_effort: isAdaptive ? "low" : "medium",
      }),
    );

    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
    return JSON.parse(raw);
  }

  try {
    let parsed;
    try {
      parsed = await askOnce();
    } catch (err) {
      // askOnce has already retried a 429 once — don't pile a second call on
      // top of a rate limit; report it as busy below.
      if (isGroqRateLimitError(err)) throw err;
      console.warn("generate-question: first attempt failed, retrying with JSON reminder", err);
      await sleep(JSON_RETRY_DELAY_MS);
      parsed = await askOnce("Keep your response concise and ensure the JSON is complete and valid.");
    }

    // forceDone wins over whatever the model said: past the cap there is no
    // next question, whether or not it obeyed the instruction.
    const done = forceDone || Boolean(parsed.done);
    const question = !forceDone && typeof parsed.question === "string" ? parsed.question : undefined;
    const quickReplies = Array.isArray(parsed.quickReplies) ? parsed.quickReplies.slice(0, 6) : undefined;

    const extracted = mergeExtracted(
      extractedAttributes,
      Array.isArray(parsed.extracted)
        ? parsed.extracted.filter((s: unknown): s is string => typeof s === "string").slice(0, 30)
        : extractedAttributes,
    );

    // Dating never reads the adaptive-only fields below; keeping them out of
    // its payload entirely is the stronger guarantee.
    if (!isAdaptive) {
      return NextResponse.json({ done, question, quickReplies, extracted });
    }

    const enhanceOptions =
      !forceDone && parsed.enhance && Array.isArray(parsed.enhance.options)
        ? parsed.enhance.options.filter((s: unknown): s is string => typeof s === "string").slice(0, 3)
        : undefined;

    const recap = typeof parsed.recap === "string" && parsed.recap.trim() ? parsed.recap.trim() : undefined;

    const knownIdentityFields =
      context === "get_to_know" && Array.isArray(parsed.knownIdentityFields)
        ? parsed.knownIdentityFields.filter((k: unknown): k is string => IDENTITY_FIELD_KEYS.includes(k as string))
        : undefined;

    return NextResponse.json({
      done,
      question: enhanceOptions ? undefined : question,
      quickReplies: enhanceOptions ? undefined : quickReplies,
      enhance: enhanceOptions && enhanceOptions.length > 0 ? { options: enhanceOptions } : undefined,
      recap: done ? recap : undefined,
      knownIdentityFields: done ? knownIdentityFields : undefined,
      extracted,
    });
  } catch (err) {
    if (isGroqRateLimitError(err)) {
      // Already logged with a [groq-429] tag by withRateLimitRetry.
      return NextResponse.json({ error: "busy", message: GROQ_BUSY_MESSAGE }, { status: 429 });
    }
    console.error("generate-question failed", err);
    return NextResponse.json({ error: "Couldn't reach the AI. Try again." }, { status: 502 });
  }
}

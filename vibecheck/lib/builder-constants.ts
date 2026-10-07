// Shared between the client builder UI and the /api/generate-question route
// so the "how many questions" ceiling can't drift between them. A safety net
// only, never a target: every context stops on content instead (see
// SLIDE_MATERIAL_TARGET), and this just bounds a conversation whose answers
// never get rich enough to trigger that. Counts dating's 2 scripted turns.
export const MAX_BUILDER_TURNS = 9;

// Friendship/get_to_know only: turns allowed past MAX_BUILDER_TURNS for
// get_to_know's optional identity chips (each committed as a turn, but
// resolved client-side without another AI call) — so hitting the cap still
// lets that batch finish instead of cutting it off mid-way. The route stops
// calling the AI entirely beyond this.
export const POST_CAP_TURN_ALLOWANCE = 9;

// The shared, content-based stopping rule for all three contexts: the model
// tracks each answer that holds specific, quotable story material as a
// "slide: Q<n> — …" entry in its running `extracted` list, and finishes once
// it has SLIDE_MATERIAL_MIN-SLIDE_MATERIAL_TARGET of them — never a fixed
// number of questions. Counted per ANSWER, not per fact, because
// /api/summarize-profile builds every story slide from exactly one answer:
// five facts packed into three answers only ever yield three slides. The
// client also fills its progress bar from this count.
export const SLIDE_MATERIAL_PREFIX = "slide:";
export const SLIDE_MATERIAL_MIN = 5;
export const SLIDE_MATERIAL_TARGET = 6;

// Distinct answers with slide material. Entries are deduped by their "Q<n>"
// tag, so a model that logs two entries for one answer can't inflate the
// count; an untagged entry counts on its own.
export function countSlideMaterial(extracted: string[]): number {
  const keys = new Set<string>();
  for (const entry of extracted) {
    const e = entry.trim().toLowerCase();
    if (!e.startsWith(SLIDE_MATERIAL_PREFIX)) continue;
    const tag = /^q(\d+)\b/.exec(e.slice(SLIDE_MATERIAL_PREFIX.length).trim());
    keys.add(tag ? `q${tag[1]}` : e);
  }
  return keys.size;
}

// Dating ONLY opens with these two scripted turns — never sent to the AI to
// generate — before normal AI-driven questions take over at turn 3. Matches
// the prototype's name -> age-with-chips pattern. Friendship and
// get_to_know ask name/age/pronouns conversationally instead, per their own
// specs — see BuilderView's gating on `context === "dating"` and each of
// those two contexts' system prompts in generate-question/route.ts.
export const SCRIPTED_OPENING_QUESTIONS: { question: string; quickReplies?: string[] }[] = [
  { question: "First things first — what should I call you?" },
  { question: "How old are you?", quickReplies: ["13", "14", "15", "16", "17", "18+"] },
];

// Any quick-reply value from the age question below this counts as under 18.
// Only the dating context actually gates on this (see BuilderView) — asking
// age in friendship/get_to_know is informational only, nothing is blocked.
export const UNDER_18_AGE_REPLIES = new Set(["13", "14", "15", "16", "17"]);

// A deterministic safety net under the model's own judgment: these exact
// phrases (trimmed, case-insensitive, trailing punctuation ignored) never
// count as slide-worthy material and never count as a topic being
// answered, no matter what the model itself decides — see
// generate-question/route.ts's stripping pass and summarize-filter.ts's
// own filtering. The model is additionally asked to use its own judgment
// for every other phrasing that amounts to the same thing (e.g. "I
// genuinely don't know", "can't think of anything") — this list only
// covers the common exact cases a server-side check can catch for free.
// Never applied to the two SCRIPTED_OPENING_QUESTIONS above (dating's name
// and age) — those never reach the model or this check in the first place.
export const NON_ANSWER_PHRASES = new Set([
  "idk",
  "nothing",
  "no",
  "not sure",
  "pass",
  "hard to put into words",
  "no idea",
  "nothing really",
  "i'm just normal",
  "im just normal",
]);

// Trims, lowercases, and drops trailing punctuation (".", "!", "?", "...")
// before comparing against NON_ANSWER_PHRASES, so "idk." / "No!" / "pass…"
// still match the exact phrase they're a punctuation variant of.
export function isNonAnswerPhrase(answer: string | null | undefined): boolean {
  if (!answer) return false;
  const normalized = answer
    .trim()
    .toLowerCase()
    .replace(/[.!?…]+$/, "")
    .trim();
  return NON_ANSWER_PHRASES.has(normalized);
}

// get_to_know's post-wildcard "optional identity details" batch (see its
// spec). Keyed so the client (rendering the chip batch and building each
// resulting DraftTurn's question text) and generate-question's system
// prompt (telling the model which keys to report back as already known via
// `knownIdentityFields`) can never drift apart on what a field is called.
// Friendship does not use this — its own spec caps "the basics" at
// name/age/pronouns, asked conversationally, not this full list.
export const IDENTITY_FIELDS: { key: string; label: string; question: string }[] = [
  { key: "age", label: "Age", question: "How old are you?" },
  { key: "pronouns", label: "Pronouns", question: "What are your pronouns?" },
  { key: "sex", label: "Sex", question: "What's your sex?" },
  { key: "religion", label: "Religion", question: "What's your religion?" },
  { key: "sexual_orientation", label: "Sexual orientation", question: "What's your sexual orientation?" },
  { key: "zodiac", label: "Zodiac sign", question: "What's your zodiac sign?" },
];

// Shared between the client builder UI and the /api/generate-question route
// so the "how many questions" ceiling can't drift between them.
export const MAX_BUILDER_TURNS = 12;

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

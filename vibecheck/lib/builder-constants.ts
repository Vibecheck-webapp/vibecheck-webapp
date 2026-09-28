// Shared between the client builder UI and the /api/generate-question route
// so the "how many questions" ceiling can't drift between them.
export const MAX_BUILDER_TURNS = 12;

// Every context always opens with these two scripted turns — never sent to
// the AI to generate — before normal AI-driven questions take over at turn
// 3. Matches the prototype's name -> age-with-chips pattern.
export const SCRIPTED_OPENING_QUESTIONS: { question: string; quickReplies?: string[] }[] = [
  { question: "First things first — what should I call you?" },
  { question: "How old are you?", quickReplies: ["13", "14", "15", "16", "17", "18+"] },
];

// Any quick-reply value from the age question below this counts as under 18.
// Only the dating context actually gates on this (see BuilderView) — asking
// age in friendship/get_to_know is informational only, nothing is blocked.
export const UNDER_18_AGE_REPLIES = new Set(["13", "14", "15", "16", "17"]);

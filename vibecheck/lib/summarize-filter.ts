import { SCRIPTED_OPENING_QUESTIONS } from "@/lib/builder-constants";
import type { DraftTurn } from "@/lib/guest-draft";

export interface UsableTurn {
  // Index in the ORIGINAL conversation array — carried through so the
  // model's `source_index` (and our server-side re-validation of it) can
  // map back to the exact turn, regardless of how many turns were filtered
  // out before it.
  index: number;
  question: string;
  answer: string;
}

// Matched by question text, not by a fixed index — every context now opens
// with these two scripted turns (see builder-constants.ts), so they're
// always conversation[0]/[1] in practice, but matching by text is what
// actually guarantees they're excluded rather than assuming a position.
const SCRIPTED_QUESTION_TEXT = new Set(SCRIPTED_OPENING_QUESTIONS.map((q) => q.question));

// Everything the model is allowed to see and everything the output is
// allowed to reference. A turn is "usable" only if the user actually
// answered it (not skipped, not excluded — see DraftTurnStatus) and it
// isn't one of the scripted name/age turns, which are never profile
// content. This is the single choke point both the request (what gets
// sent to the model) and the response (what's allowed to come back) are
// filtered through, so an excluded answer has no path to either.
export function filterUsableTurns(conversation: DraftTurn[]): UsableTurn[] {
  return conversation
    .map((turn, index) => ({ turn, index }))
    .filter(
      ({ turn }) =>
        turn.status === "answered" && typeof turn.answer === "string" && turn.answer.trim().length > 0,
    )
    .filter(({ turn }) => !SCRIPTED_QUESTION_TEXT.has(turn.question))
    .map(({ turn, index }) => ({ index, question: turn.question, answer: (turn.answer as string).trim() }));
}

// The scripted name answer, if the user actually answered it. Used to
// prefill the name field on the summary page — every context asks this
// now (see builder-constants.ts), not dating only.
export function extractScriptedName(conversation: DraftTurn[]): string | null {
  const nameQuestion = SCRIPTED_OPENING_QUESTIONS[0]?.question;
  const turn = conversation.find((t) => t.question === nameQuestion);
  if (turn && turn.status === "answered" && typeof turn.answer === "string" && turn.answer.trim()) {
    return turn.answer.trim();
  }
  return null;
}

import { describe, expect, it } from "vitest";
import { extractScriptedName, filterUsableTurns } from "@/lib/summarize-filter";
import type { DraftTurn } from "@/lib/guest-draft";

// A representative conversation: scripted name+age (index 0, 1), a mix of
// answered/skipped/excluded turns, exactly like a real dating draft.
const CONVERSATION: DraftTurn[] = [
  { question: "First things first — what should I call you?", answer: "Jordan", status: "answered" },
  {
    question: "How old are you?",
    answer: "18+",
    status: "answered",
    quickReplies: ["13", "14", "15", "16", "17", "18+"],
  },
  {
    question: "What's something people are always surprised to learn about you?",
    answer: "I've competed in three amateur baking competitions and lost every single one.",
    status: "answered",
  },
  {
    question: "What's a small thing that instantly makes someone more attractive to you?",
    answer: null,
    status: "skipped_for_now",
  },
  {
    question: "What's your love language, if you had to pick one?",
    answer: "I own a secret second apartment where I hide from everyone I know.",
    status: "excluded",
  },
  {
    question: "What's a hobby or interest you could talk about for hours?",
    answer: "Restoring old bicycles — I've done four this year.",
    status: "answered",
  },
];

describe("filterUsableTurns", () => {
  it("drops the scripted name and age turns", () => {
    const usable = filterUsableTurns(CONVERSATION);
    const questions = usable.map((t) => t.question);
    expect(questions).not.toContain("First things first — what should I call you?");
    expect(questions).not.toContain("How old are you?");
  });

  it("drops skipped_for_now turns", () => {
    const usable = filterUsableTurns(CONVERSATION);
    expect(usable.some((t) => t.question === "What's a small thing that instantly makes someone more attractive to you?")).toBe(false);
    // The skipped turn has answer: null, so this also confirms no usable
    // turn carries a null/empty answer through.
    expect(usable.every((t) => t.answer.length > 0)).toBe(true);
  });

  it("never includes an excluded ('don't put this on my profile') answer — the core guarantee", () => {
    const usable = filterUsableTurns(CONVERSATION);
    const answers = usable.map((t) => t.answer);
    expect(answers).not.toContain("I own a secret second apartment where I hide from everyone I know.");
    expect(usable.some((t) => t.question === "What's your love language, if you had to pick one?")).toBe(
      false,
    );
  });

  it("keeps exactly the answered, non-scripted turns, with their original indices", () => {
    const usable = filterUsableTurns(CONVERSATION);
    expect(usable).toEqual([
      {
        index: 2,
        question: "What's something people are always surprised to learn about you?",
        answer: "I've competed in three amateur baking competitions and lost every single one.",
      },
      {
        index: 5,
        question: "What's a hobby or interest you could talk about for hours?",
        answer: "Restoring old bicycles — I've done four this year.",
      },
    ]);
  });

  it("returns an empty array when every turn is scripted, skipped, or excluded", () => {
    const onlyUnusable: DraftTurn[] = [
      { question: "First things first — what should I call you?", answer: "Sam", status: "answered" },
      { question: "How old are you?", answer: "18+", status: "answered" },
      { question: "Some question", answer: null, status: "skipped_for_now" },
      { question: "Another question", answer: "secret", status: "excluded" },
    ];
    expect(filterUsableTurns(onlyUnusable)).toEqual([]);
  });
});

describe("extractScriptedName", () => {
  it("returns the answered scripted name", () => {
    expect(extractScriptedName(CONVERSATION)).toBe("Jordan");
  });

  it("returns null when the name turn is missing or unanswered", () => {
    expect(extractScriptedName([])).toBeNull();
    expect(
      extractScriptedName([
        { question: "First things first — what should I call you?", answer: null, status: "skipped_for_now" },
      ]),
    ).toBeNull();
  });
});

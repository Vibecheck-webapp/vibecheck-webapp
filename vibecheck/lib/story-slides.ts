import type { ProfileContext } from "@/lib/supabase/types";

// The shape StoryViewer renders — shared between the real /[handle] route
// (built from a profiles row's headline/prompts once Supabase is reachable
// again) and this file's static demo data. No "react" slide/kind exists —
// profile_reactions is out of MVP scope, so there's nothing to build here.
export type StorySlide =
  | { kind: "intro"; name: string }
  | { kind: "answer"; question: string; answer: string }
  | { kind: "end"; name: string; ctaHref: string };

// Sample data for the landing page's "Preview Orla's Vibecheck" button —
// the prototype's "Orla" demo persona, hand-written rather than pulled from
// a real profile (there is no real profile named Orla).
export const ORLA_DEMO_CONTEXT: ProfileContext = "dating";
export const ORLA_DEMO_PHOTO_URL = "/orla.png";

export const ORLA_DEMO_SLIDES: StorySlide[] = [
  { kind: "intro", name: "Orla" },
  { kind: "answer", question: "What should I call you?", answer: "Orla, 27" },
  {
    kind: "answer",
    question: "What's something people are always surprised to learn about you?",
    answer: "I've competed in three amateur baking competitions and lost every single one.",
  },
  {
    kind: "answer",
    question: "What does a perfect low-key weekend look like for you?",
    answer:
      "Farmers market in the morning, a long walk with a podcast, then cooking something too ambitious for a Tuesday night.",
  },
  {
    kind: "answer",
    question: "What's your love language, if you had to pick one?",
    answer: "Quality time — and remembering the small things I mentioned once, three weeks ago.",
  },
  { kind: "end", name: "Orla", ctaHref: "/create" },
];

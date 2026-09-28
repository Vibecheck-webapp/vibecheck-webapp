import type { GuestDraft } from "@/lib/guest-draft";
import type { StorySlide } from "@/lib/story-slides";

// Pure so it's trivial to reason about/test independently of the page:
// one intro slide, one answer slide per (possibly user-edited)
// summary.slides entry in order, one end slide. Age is never part of
// draft.summary (the scripted age turn is filtered out before
// summarization — see lib/summarize-filter.ts), so there's nothing to
// specifically exclude here; it simply never reaches this shape.
export function buildStorySlidesFromDraft(draft: GuestDraft, ctaHref: string): StorySlide[] | null {
  const summary = draft.summary;
  const name = summary?.name?.trim();
  if (!summary || !name) return null;

  return [
    { kind: "intro", name },
    ...summary.slides.map(
      (slide): StorySlide => ({ kind: "answer", question: slide.question, answer: slide.answer }),
    ),
    { kind: "end", name, ctaHref },
  ];
}

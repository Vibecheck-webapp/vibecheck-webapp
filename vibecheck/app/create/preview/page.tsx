"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StoryViewer } from "@/components/viewer/StoryViewer";
import { UNDER_18_AGE_REPLIES } from "@/lib/builder-constants";
import { buildStorySlidesFromDraft } from "@/lib/build-story-slides";
import { hasFinishedDraft, loadDraft, type GuestDraft } from "@/lib/guest-draft";

// StoryViewer's own wrapper still contributes this much vertical padding
// around the card even in ownerPreview mode (py-8 on mobile, sm:py-6 on
// desktop — this uses the larger mobile figure everywhere, which is safe:
// worst case the card comes out a little shorter than strictly necessary
// on desktop, never taller than the available space). A little extra
// breathing room is added on top for the gap before the button row.
const STORY_WRAPPER_VERTICAL_PADDING = 64;
const EXTRA_BREATHING_ROOM = 24;
const CARD_MIN = 420;
const CARD_MAX = 640;

export default function CreatePreviewPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<GuestDraft | null>(null);
  const actionRowRef = useRef<HTMLDivElement>(null);

  // Both measured, not guessed — the navbar's height varies by breakpoint,
  // and the action row's height depends on its own content (the no-photo
  // notice adds a line), so neither is a constant this page can hardcode.
  const [navHeight, setNavHeight] = useState(0);
  const [actionRowHeight, setActionRowHeight] = useState(0);

  useEffect(() => {
    function measure() {
      const nav = document.querySelector("nav");
      setNavHeight(nav ? nav.getBoundingClientRect().height : 0);
      setActionRowHeight(actionRowRef.current?.getBoundingClientRect().height ?? 0);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [draft]);

  // Reads the draft once, on mount only — no API calls on this page. A
  // fresh mount (e.g. navigating back here from "Edit") re-reads it, which
  // is what actually picks up edits made on /create/summary; there's no
  // live-sync needed beyond that.
  useEffect(() => {
    const existing = loadDraft();
    if (!existing) {
      router.replace("/create/summary");
      return;
    }
    // Same re-derivation as /create/photo and /create/summary: the age
    // gate itself is live-only React state in BuilderView, never
    // persisted, so it's checked again here from the raw scripted answer.
    const ageAnswer = existing.context === "dating" ? existing.conversation[1]?.answer : null;
    if (ageAnswer && UNDER_18_AGE_REPLIES.has(ageAnswer)) {
      router.replace("/create?notice=age-restricted");
      return;
    }
    // Shared with the home page's CTA (lib/guest-draft.ts) so the two
    // never disagree about what counts as a finished vibe — this also
    // tightens the old inline check here, which didn't require a minimum
    // slide count the way /create/summary's own "Continue" button already
    // does before a user can ever reach this page normally.
    if (!hasFinishedDraft(existing)) {
      router.replace("/create/summary");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(existing);
  }, [router]);

  if (!draft) return null;

  // ctaHref is passed for type-shape completeness, but ownerPreview=true
  // means StoryViewer never renders the end-slide CTA at all — this is the
  // owner's own preview, not the real public viewer.
  const slides = buildStorySlidesFromDraft(draft, "/create/preview");
  if (!slides) return null;

  const hasPhoto = !!draft.photoDataUrl;
  const reservedPx = navHeight + actionRowHeight + STORY_WRAPPER_VERTICAL_PADDING + EXTRA_BREATHING_ROOM;
  const cardHeight = `clamp(${CARD_MIN}px, calc(100dvh - ${reservedPx}px), ${CARD_MAX}px)`;

  return (
    <div className="flex flex-col items-center bg-[#0a0a0a]">
      <StoryViewer
        context={draft.context}
        slides={slides}
        photoUrl={draft.photoDataUrl ?? undefined}
        ownerPreview
        cardHeight={cardHeight}
      />

      {/* Below the card, not overlaid on it — an earlier fixed-overlay
          version covered the card's progress bars/counter (bottom bar) and
          then the site navbar (top bar) before landing here. Sticky so it
          stays reachable if the card ever comes out taller than expected,
          same width as the card via the shared max-w-[320px]/sm:max-w-[400px]
          pair StoryViewer itself uses. */}
      <div
        ref={actionRowRef}
        className="sticky bottom-0 z-10 flex w-full justify-center bg-[#0a0a0a] px-6 pt-2 sm:px-4"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex w-full max-w-[320px] flex-col gap-2 sm:max-w-[400px]">
          {!hasPhoto && (
            <button
              type="button"
              onClick={() => router.push("/create/photo")}
              className="rounded-xl border border-[#2A2726] bg-[#171514] px-3 py-2 text-left text-[12px] text-[#FFB1D0] hover:bg-[#1F1B1A]"
            >
              No photo yet. Your Vibecheck looks better with one →
            </button>
          )}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => router.push("/create/summary")}
              className="h-[46px] shrink-0 rounded-[14px] border border-[#2A2726] bg-[#171514] px-5 text-[14px] font-extrabold text-white/80 hover:bg-[#1F1B1A] sm:h-[50px]"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => router.push("/create/save")}
              className="h-[46px] flex-1 rounded-[14px] bg-[#FF96C3] px-5 text-[14px] font-extrabold text-neutral-900 shadow-[0_10px_30px_rgba(255,150,195,0.35)] sm:h-[50px]"
            >
              Save &amp; get my link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

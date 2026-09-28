"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StoryViewer } from "@/components/viewer/StoryViewer";
import { UNDER_18_AGE_REPLIES } from "@/lib/builder-constants";
import { buildStorySlidesFromDraft } from "@/lib/build-story-slides";
import { loadDraft, type GuestDraft } from "@/lib/guest-draft";

export default function CreatePreviewPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<GuestDraft | null>(null);
  // The site navbar (rendered by the root layout, not this page) is itself
  // `position: sticky`, not part of a flex column this page controls, so a
  // `fixed` action bar at top:0 floats right over it. Measured instead of
  // hardcoded, since its height already varies by breakpoint.
  const [navHeight, setNavHeight] = useState(0);

  useEffect(() => {
    function measureNav() {
      const nav = document.querySelector("nav");
      setNavHeight(nav ? nav.getBoundingClientRect().height : 0);
    }
    measureNav();
    window.addEventListener("resize", measureNav);
    return () => window.removeEventListener("resize", measureNav);
  }, []);

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
    if (!existing.summary || !existing.summary.name?.trim()) {
      router.replace("/create/summary");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(existing);
  }, [router]);

  if (!draft) return null;

  // ctaHref: the viewer's end-slide button is meant for OTHER people
  // viewing this story ("Create my own Vibecheck"), but this is the
  // owner's own preview of their not-yet-saved story — sending them to
  // "/create/preview" just re-shows the same page, harmlessly, instead of
  // routing the owner back into the picker mid-review. The real public
  // viewer page (a later task) should pass "/create" here instead, so a
  // stranger's tap on this button actually starts a new Vibecheck.
  const slides = buildStorySlidesFromDraft(draft, "/create/preview");
  if (!slides) return null;

  const hasPhoto = !!draft.photoDataUrl;

  return (
    <div className="relative">
      <StoryViewer context={draft.context} slides={slides} photoUrl={draft.photoDataUrl ?? undefined} />

      {/* A bottom bar overlapped the viewer's own card (and, on most sizes,
          its end-slide CTA button) — measured up to ~140px of overlap at
          360x640/375x667/1222x900, since StoryViewer centers its card
          vertically and, at some sizes, already nearly fills the viewport
          on its own. A slim top bar instead sits in space the card's own
          top padding already leaves clear at every tested size.
          Single row, constant height, always — a second stacked row for
          the "no photo" notice (tested first) pushed the bar 27px into the
          card specifically at 1222x900 (the tightest case, ~136px of clear
          space above the card there vs 181-234px elsewhere), so the notice
          is folded into a compact icon button in the same row instead. */}
      <div
        className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 pt-2 pb-1.5"
        style={{ top: navHeight }}
      >
        <div className="pointer-events-auto flex w-full max-w-[400px] gap-2">
          {!hasPhoto && (
            <button
              type="button"
              onClick={() => router.push("/create/photo")}
              title="No photo yet. Your Vibecheck looks better with one."
              aria-label="Add a photo"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-[#2A2726] bg-black/70 text-[15px] backdrop-blur-md hover:bg-black/85"
            >
              📷
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push("/create/summary")}
            className="h-9 shrink-0 rounded-[12px] border border-[#2A2726] bg-black/70 px-4 text-[13px] font-extrabold text-white/80 backdrop-blur-md hover:bg-black/85"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => router.push("/create/save")}
            className="h-9 flex-1 rounded-[12px] bg-[#FF96C3] px-4 text-[13px] font-extrabold text-neutral-900 shadow-[0_6px_20px_rgba(255,150,195,0.35)]"
          >
            Save &amp; get my link
          </button>
        </div>
      </div>
    </div>
  );
}

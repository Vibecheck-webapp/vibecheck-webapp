"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearDraft, loadDraft, type GuestDraft } from "@/lib/guest-draft";
import { CONTEXT_LABEL } from "@/lib/profile-meta";

// Guards the shared-device case: localStorage is per-browser, not per-account,
// so without this a second person on the same device would silently resume
// whatever draft is sitting there the moment they open the builder. Surfacing
// it here as a deliberate choice, before a context is even picked.
export function ResumeDraftPrompt() {
  const router = useRouter();
  const [draft, setDraft] = useState<GuestDraft | null>(null);

  useEffect(() => {
    const existing = loadDraft();
    // A draft with no answered turns yet is indistinguishable from a fresh
    // start — nothing to "continue", so don't prompt for it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(existing && existing.conversation.length > 0 ? existing : null);
  }, []);

  if (!draft) return null;

  function handleStartFresh() {
    clearDraft();
    setDraft(null);
  }

  function handleResume() {
    router.push(`/create/build?context=${draft!.context}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
      <div className="w-full max-w-[380px] rounded-[22px] border border-[#2A2726] bg-[#151313] p-6 text-center">
        <div className="text-[28px]">👋</div>
        <h2 className="mt-2 text-[18px] font-black text-white">
          Continue your in-progress {CONTEXT_LABEL[draft.context]} Vibecheck?
        </h2>
        <p className="mt-1.5 text-[13px] text-white/60">
          You&apos;ve answered {draft.conversation.length} question
          {draft.conversation.length === 1 ? "" : "s"} so far.
        </p>
        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={handleResume}
            className="h-[44px] rounded-[14px] bg-[#FF96C3] text-[14px] font-extrabold text-neutral-900"
          >
            Resume
          </button>
          <button
            type="button"
            onClick={handleStartFresh}
            className="h-[44px] rounded-[14px] border border-[#2A2726] text-[14px] font-extrabold text-white/80 hover:bg-[#1A1817]"
          >
            Start Fresh
          </button>
        </div>
      </div>
    </div>
  );
}

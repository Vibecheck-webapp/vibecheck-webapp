"use client";

import { useSearchParams } from "next/navigation";

// Shown when /create/photo or /create/summary redirect back here — a guest
// landing on either of those pages with no draft, an under-18 dating draft,
// or (summary only) no usable answers yet, all bounce back to the picker
// with one of these as ?notice=.
const NOTICES: Record<string, string> = {
  "start-first": "Start a Vibecheck below to continue.",
  "age-restricted": "That step isn't available for this Vibecheck.",
  "not-enough-answers": "Answer a few more questions before continuing.",
};

export function CreateNotice() {
  const searchParams = useSearchParams();
  const notice = searchParams.get("notice");
  const message = notice ? NOTICES[notice] : null;
  if (!message) return null;

  return (
    <div className="mb-5 rounded-2xl border border-[#2A2726] bg-[#171514] px-4 py-3 text-[13px] text-[#FFB1D0]">
      {message}
    </div>
  );
}

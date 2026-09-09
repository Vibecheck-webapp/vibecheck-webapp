"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfileVisibility } from "@/lib/actions/profiles";
import { CONTEXT_LABEL, VISIBILITY_COPY, profileUrl } from "@/lib/profile-meta";
import type { ProfileRow } from "@/lib/supabase/types";

const VISIBILITY_OPTIONS: ProfileRow["visibility"][] = ["public", "unlisted", "private"];

export function ShareModal({
  profile,
  username,
  onClose,
}: {
  profile: Pick<ProfileRow, "id" | "slug" | "context" | "visibility" | "is_primary">;
  username: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [visibility, setVisibility] = useState(profile.visibility);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = profileUrl(username, profile);

  function handleCopy() {
    navigator.clipboard
      .writeText(`https://${url}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setError("Couldn't copy — copy the link manually."));
  }

  function handleVisibilityChange(next: ProfileRow["visibility"]) {
    if (next === visibility || isPending) return;
    const previous = visibility;
    setVisibility(next);
    setError(null);
    startTransition(async () => {
      try {
        await updateProfileVisibility(profile.id, next);
        router.refresh();
      } catch (err) {
        setVisibility(previous);
        setError(err instanceof Error ? err.message : "Couldn't update visibility.");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div className="w-full max-w-[560px] rounded-[28px] border border-[#2A2726] bg-[#151313] p-6">
        <div className="flex items-start justify-between gap-5">
          <div>
            <div className="text-[13px] font-semibold tracking-wide text-white/50 uppercase">
              Share your Vibecheck
            </div>
            <h3 id="share-modal-title" className="mt-3 text-[26px] font-black text-[#FFF8F2]">
              Share your {CONTEXT_LABEL[profile.context].toLowerCase()} Vibecheck.
            </h3>
            <p className="mt-1 text-white/60">
              Anyone with a public or unlisted link can view your profile without creating an
              account.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-2xl text-white/50 hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="mt-5 rounded-[18px] border border-[#4A3941] bg-gradient-to-br from-[#21181D] to-[#171514] p-4">
          <div className="text-[12px] font-semibold tracking-wide text-white/50 uppercase">
            Profile link
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <div className="min-w-0 flex-1 truncate rounded-xl border border-[#2A2726] bg-[#0F0E0E] px-3.5 py-3 text-[#F3ECE6]">
              {url}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded-[14px] bg-[#FF96C3] px-4 py-3 text-[14px] font-extrabold text-neutral-900"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-2.5">
          {VISIBILITY_OPTIONS.map((option) => {
            const isActive = visibility === option;
            return (
              <button
                key={option}
                type="button"
                disabled={isPending}
                onClick={() => handleVisibilityChange(option)}
                className={`rounded-[16px] border p-3.5 text-left transition-colors disabled:opacity-50 ${
                  isActive
                    ? "border-[#FF96C3] bg-[#2B2025]"
                    : "border-[#2A2726] bg-[#1C1918] hover:bg-[#221E1D]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <strong className="text-[#FFF8F2]">{VISIBILITY_COPY[option].label}</strong>
                  {isActive && (
                    <span className="text-[12px] font-extrabold text-[#FF96C3]">Current</span>
                  )}
                </div>
                <p className="mt-1 text-[13px] text-white/60">
                  {VISIBILITY_COPY[option].description}
                </p>
              </button>
            );
          })}
        </div>

        {error && <p className="mt-3 text-[13px] text-[#FFB1B4]">{error}</p>}
      </div>
    </div>
  );
}

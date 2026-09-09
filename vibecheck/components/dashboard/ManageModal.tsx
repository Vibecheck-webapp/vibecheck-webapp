"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteProfile } from "@/lib/actions/profiles";
import { profilePath } from "@/lib/profile-meta";
import type { ProfileRow } from "@/lib/supabase/types";

const rowClasses =
  "block w-full rounded-[13px] border border-[#2A2726] bg-[#1C1918] px-3.5 py-3.5 text-left font-extrabold text-[#F4ECE4] hover:bg-[#252120]";

export function ManageModal({
  profile,
  username,
  onClose,
  onShare,
}: {
  profile: Pick<ProfileRow, "id" | "slug" | "context" | "visibility" | "is_primary" | "headline">;
  username: string;
  onClose: () => void;
  onShare: () => void;
}) {
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const canView = profile.visibility !== "private";

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteProfile(profile.id);
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't delete this profile.");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-modal-title"
    >
      <div className="w-full max-w-[560px] rounded-[28px] border border-[#2A2726] bg-[#151313] p-6">
        <div className="flex items-start justify-between gap-5">
          <div>
            <div className="text-[13px] font-semibold tracking-wide text-white/50 uppercase">
              Manage Vibecheck
            </div>
            <h3 id="manage-modal-title" className="mt-3 text-[26px] font-black text-[#FFF8F2]">
              {profile.headline || "Your profile"}
            </h3>
            <p className="mt-1 text-white/60">
              Control the profile itself and the link people use to reach it.
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

        <div className="mt-4 grid gap-2.5">
          <Link href={`/dashboard/profiles/${profile.id}/edit`} className={rowClasses}>
            ✏️ Edit profile
          </Link>
          <button type="button" onClick={onShare} className={rowClasses}>
            🔗 Manage &amp; share link
          </button>
          {canView && (
            <Link href={profilePath(username, profile)} className={rowClasses}>
              👀 View profile
            </Link>
          )}

          {confirmingDelete ? (
            <div className="rounded-[13px] border border-[#593438] bg-[#241416] p-3.5">
              <p className="text-[13px] text-[#FFB1B4]">
                Delete &quot;{profile.headline || "this profile"}&quot;? This cannot be undone.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isPending}
                  className="rounded-[10px] bg-[#FFB1B4] px-3 py-2 text-[13px] font-extrabold text-neutral-900 disabled:opacity-50"
                >
                  {isPending ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-[10px] border border-[#2A2726] px-3 py-2 text-[13px] font-extrabold text-white/80"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="block w-full rounded-[13px] border border-[#593438] bg-[#1C1918] px-3.5 py-3.5 text-left font-extrabold text-[#FFB1B4] hover:bg-[#241416]"
            >
              🗑️ Delete Vibecheck
            </button>
          )}
        </div>

        {error && <p className="mt-3 text-[13px] text-[#FFB1B4]">{error}</p>}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Shown when the builder's "Save & leave" sends someone back here with
// ?draftSaved=1 — the draft itself already lives in localStorage by then,
// this is purely the confirmation toast.
export function DraftSavedToast() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (searchParams.get("draftSaved") !== "1") return;
    // Reacting to a URL param on mount, then stripping it — has to run
    // post-mount, not derivable from render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
    router.replace("/", { scroll: false });
    const timeout = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timeout);
  }, [searchParams, router]);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div className="rounded-[14px] border border-[#2A2726] bg-[#171514] px-5 py-3 text-[14px] font-semibold text-white shadow-lg">
        Draft saved — come back anytime to finish your Vibecheck.
      </div>
    </div>
  );
}

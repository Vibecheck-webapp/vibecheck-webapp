"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { buyCredits } from "@/lib/actions/buy-credits";

const TIERS = [1, 3, 5, 10];

export function CreditModal({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleContinue() {
    setError(null);
    startTransition(async () => {
      try {
        const { url } = await buyCredits(selected);
        window.location.href = url;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="credit-modal-title"
    >
      <div className="w-full max-w-[560px] rounded-[28px] border border-[#2A2726] bg-[#151313] p-6">
        <div className="flex items-start justify-between gap-5">
          <div>
            <div className="text-[13px] font-semibold tracking-wide text-white/50 uppercase">
              Buy credits
            </div>
            <h3 id="credit-modal-title" className="mt-3 text-[26px] font-black text-[#FFF8F2]">
              How many Vibechecks?
            </h3>
            <p className="mt-1 text-white/60">Pay securely with Stripe. 1 credit = $1.</p>
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

        <div className="mt-5 grid grid-cols-4 gap-2.5">
          {TIERS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSelected(n)}
              className={`rounded-[18px] border p-3.5 text-center font-extrabold text-[#F4ECE4] ${
                selected === n
                  ? "border-[#FF96C3] bg-[#2B2025] shadow-[inset_0_0_0_2px_rgba(255,150,195,0.1)]"
                  : "border-[#413B37] bg-[#211E1D]"
              }`}
            >
              <strong className="block text-2xl leading-none text-[#FFF8F2]">{n}</strong>${n}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between border-y border-[#2A2726] py-3.5">
          <div>
            <div className="text-[12px] text-[#C8C0B9]">SELECTED</div>
            <strong className="text-[#FFF8F2]">
              {selected} credit{selected === 1 ? "" : "s"}
            </strong>
          </div>
          <div className="text-[28px] font-black text-[#FFF8F2]">${selected}</div>
        </div>

        {error && <p className="mt-3 text-[13px] text-[#FFB1B4]">{error}</p>}

        <Button
          variant="primary"
          className="mt-4 w-full"
          onClick={handleContinue}
          disabled={isPending}
        >
          {isPending ? "Redirecting…" : "Continue to Stripe →"}
        </Button>
      </div>
    </div>
  );
}

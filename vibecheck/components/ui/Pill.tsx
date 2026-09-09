import type { ReactNode } from "react";

// The small bordered eyebrow tag used above headings (e.g. Hero's "Fun way
// to start conversations", /create's "Step 01 · Choose your vibe").
export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="w-fit rounded-full border border-[#2A2726] px-[11.71px] py-[7.71px] font-inter text-[12px] leading-[100%] font-normal tracking-normal text-white/80">
      {children}
    </span>
  );
}

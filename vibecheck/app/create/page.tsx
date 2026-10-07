import Link from "next/link";
import { Suspense } from "react";
import { ContextPicker } from "@/components/create/ContextPicker";
import { CreateNotice } from "@/components/create/CreateNotice";
import { ArrowLeftIcon } from "@/components/ui/ArrowLeftIcon";
import { BetaFooter } from "@/components/ui/BetaFooter";
import { Pill } from "@/components/ui/Pill";

export default function CreatePage() {
  return (
    <section className="mx-auto w-full max-w-[1100px] px-6 py-12 lg:px-10 lg:py-16">
      <Suspense fallback={null}>
        <CreateNotice />
      </Suspense>
      <div className="flex flex-col items-start gap-3">
        <Link
          href="/"
          aria-label="Back"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-[#1A1817]"
        >
          <ArrowLeftIcon />
        </Link>
        <Pill>Step 01 · Choose your vibe</Pill>
      </div>

      <div className="max-w-[600px]">
        <h1 className="mt-3.5 font-inter text-[30px] leading-[32.3px] font-bold tracking-[-1.87px] text-white lg:text-[42px] lg:leading-[39.9px] lg:tracking-[-2.31px]">
          What kind of
          <br />
          Vibecheck is this?
        </h1>
        <p className="mt-2 text-center font-inter text-[16px] leading-[100%] font-normal tracking-normal text-white/60 lg:text-left">
          You&apos;ll get a different conversational personality for each mode.
        </p>
      </div>

      <ContextPicker />

      <p className="mt-8 font-inter text-[12px] leading-[100%] font-normal text-[#716B67] text-center">
        Vibecheck MVP prototype · vibrant, dark, bold, friendly · 13+
      </p>

      <div className="mt-8">
        <BetaFooter />
      </div>
    </section>
  );
}

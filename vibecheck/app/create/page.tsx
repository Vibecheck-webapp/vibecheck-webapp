import Link from "next/link";
import { BetaFooter } from "@/components/ui/BetaFooter";
import { Pill } from "@/components/ui/Pill";
import type { ProfileContext } from "@/lib/supabase/types";

const CONTEXTS: {
  context: ProfileContext;
  icon: string;
  iconWidth: number;
  iconHeight: number;
  title: string;
  description: string;
  tags: string;
  accent: string;
  blob: string;
}[] = [
  {
    context: "dating",
    icon: "/icon-dating.svg",
    iconWidth: 34,
    iconHeight: 30,
    title: "Dating",
    description: "A shareable \"what I'm like romantically\" blueprint. No matching in MVP.",
    tags: "Playful · warm · curious",
    accent: "text-[#FF9C9F]",
    blob: "bg-[#FF6961]",
  },
  {
    context: "friendship",
    icon: "/icon-friendship.svg",
    iconWidth: 39,
    iconHeight: 29,
    title: "Friendship",
    description: "Show people your social energy, interests, quirks, and friend style.",
    tags: "Casual · energetic · funny",
    accent: "text-[#FFB1D0]",
    blob: "bg-[#FF96C3]",
  },
  {
    context: "get_to_know",
    icon: "/icon-get-to-know.svg",
    iconWidth: 34,
    iconHeight: 31,
    title: "Getting to Know Me",
    description: "A broad, personality-first blueprint for anyone you want to share with.",
    tags: "Curious · expressive · playful",
    accent: "text-[#9FE1CA]",
    blob: "bg-[#8FE3B0]",
  },
];

function ArrowLeftIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <line x1="20.25" y1="12" x2="3.75" y2="12" stroke="#FFFDF9" strokeWidth="1.5" strokeLinecap="round" />
      <polyline
        points="10.5 5.25 3.75 12 10.5 18.75"
        stroke="#FFFDF9"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function CreatePage() {
  return (
    <section className="mx-auto w-full max-w-[1100px] px-6 py-12 lg:px-10 lg:py-16">
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

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {CONTEXTS.map((c) => (
          <Link
            key={c.context}
            href={`/create/build?context=${c.context}`}
            className="group relative flex min-h-[210px] flex-col items-center justify-between overflow-hidden rounded-[22px] border border-[#2A2726] bg-[#171514] p-5 text-center transition-colors hover:border-[#4A4541]"
          >
            <span
              className={`pointer-events-none absolute -top-10 -right-10 h-[170px] w-[170px] rounded-full opacity-15 ${c.blob}`}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.icon}
              alt=""
              width={c.iconWidth}
              height={c.iconHeight}
              className="relative"
            />
            <div className="relative">
              <h3 className="font-inter text-[24px] leading-[100%] font-bold tracking-[-0.72px] text-[#FFFDF9]">
                {c.title}
              </h3>
              <p className="mt-1.5 font-inter text-[16px] leading-[100%] font-normal text-[#D8D1CB]">
                {c.description}
              </p>
            </div>
            <div
              className={`relative mt-3 font-inter text-[12px] leading-[100%] font-bold ${c.accent}`}
            >
              {c.tags}
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-8 font-inter text-[12px] leading-[100%] font-normal text-[#716B67] text-center">
        Vibecheck MVP prototype · vibrant, dark, bold, friendly · 13+
      </p>

      <div className="mt-8">
        <BetaFooter />
      </div>
    </section>
  );
}

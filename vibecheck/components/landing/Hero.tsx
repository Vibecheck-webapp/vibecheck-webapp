"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { BetaFooter } from "@/components/ui/BetaFooter";
import { Pill } from "@/components/ui/Pill";

function PrimaryButton({ children, href }: { children: ReactNode; href?: string }) {
  const className =
    "flex h-[45px] w-55.75 items-center justify-center rounded-[14px] bg-[#FF96C3] pt-[13.71px] pr-4 pb-3 pl-4 text-center font-inter text-[16px] leading-[100%] font-extrabold tracking-normal text-neutral-900";

  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={className}>
      {children}
    </button>
  );
}

function SecondaryButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className="flex h-[44.7px] w-61.75 items-center justify-center rounded-[14px] border border-[#2A2726] bg-transparent pt-[11.86px] pr-[15.57px] pb-[11.85px] pl-[15.57px] text-center font-inter text-[16px] leading-[100%] font-extrabold tracking-normal text-white"
    >
      {children}
    </button>
  );
}

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    // Reveal once the section scrolls into view, then stop observing — this
    // is a one-time entrance, not a repeat-on-every-scroll effect. Hero sits
    // close enough to the top of the page (right after ChatSimulator) that
    // on most normal browser windows it's already inside the viewport at
    // load — with no rootMargin, "intersecting" would be true immediately
    // on mount and the reveal would fire before any scrolling happened,
    // which reads as "there's no animation". The -500px bottom margin
    // shrinks the effective viewport so a real scroll is required first.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0, rootMargin: "0px 0px -500px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`flex flex-col items-center gap-16 px-6 pt-24 pb-10 transition-all duration-700 ease-out lg:px-16 lg:pt-32 lg:pb-16 ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
      }`}
    >
      <div className="flex w-full max-w-[1400px] flex-col items-start gap-10 lg:flex-row lg:justify-between">
        <div className="flex w-full max-w-[660px] flex-col items-start gap-5">
          <Pill>Fun way to start conversations</Pill>

          <h1 className="font-inter text-[64px] leading-[54.4px] font-bold tracking-[-5.12px] text-white lg:text-[112px] lg:leading-[95.2px] lg:tracking-[-8.96px]">
            <span className="block">Know me</span>
            <span className="block text-[#FF96C3]">without</span>
            <span className="block">the talking.</span>
          </h1>

          <p className="max-w-[560px] pt-[10px] font-inter text-[20px] leading-[29px] font-normal tracking-normal text-[#DED7D1]">
            Have a fun conversation that builds your personal blueprint, then
            turn it into a bold, shareable Vibecheck Story.
          </p>

          <div className="flex flex-col items-start gap-3 sm:flex-row">
            <PrimaryButton href="/create">Create my Vibecheck </PrimaryButton>
            <SecondaryButton>Preview sample Vibecheck</SecondaryButton>
          </div>

          <p className="font-inter text-[12px] leading-normal font-normal text-[#716B67]">
            1 free Vibecheck · more profiles are 1 credit each · 1 credit = $1
          </p>
        </div>

        <div className="w-full max-w-[489.6px] shrink-0 overflow-hidden rounded-[36px] lg:min-h-[520px]">
          {/* next/image bypasses the optimizer for local SVG sources (verified:
              it renders via a plain <img src="/file.svg">, not the
              /_next/image route), so no images.dangerouslyAllowSVG config
              is needed here. */}
          <Image
            src="/hero-card-mockup.svg"
            alt="Vibecheck profile card preview"
            width={490}
            height={520}
            priority
            className="h-auto w-full"
          />
        </div>
      </div>

      <BetaFooter />
    </section>
  );
}

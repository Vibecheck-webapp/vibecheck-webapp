"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

function CreditsPill() {
  return (
    <div className="flex h-[32.43px] w-[80.43px] items-center justify-center rounded-full border border-[#2A2726] pt-[7.71px] pr-[11.71px] pb-[7.71px] pl-[11.71px] font-inter text-[12px] leading-[100%] font-normal tracking-normal text-white/70 align-middle">
      Credits: 0
    </div>
  );
}

function MyVibechecksButton() {
  return (
    <Link
      href="/dashboard"
      className="flex h-[44.43px] w-[156.43px] items-center justify-center rounded-[14px] border border-[#2A2726] pt-[11.71px] pr-[15.71px] pb-[11.71px] pl-[15.71px] text-center font-inter text-[16px] leading-[100%] font-extrabold tracking-normal text-white align-middle"
    >
      My Vibechecks
    </Link>
  );
}

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 w-full bg-[#0E0D0DF0]">
      <div className="flex items-center justify-between px-6 py-4 sm:px-10">
        <Link href="/">
          <Image src="/logo.svg" alt="Vibecheck" width={120} height={39} priority />
        </Link>

        <div className="hidden items-center gap-3 sm:flex">
          <CreditsPill />
          <MyVibechecksButton />
        </div>

        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((open) => !open)}
          className="relative h-8 w-8 shrink-0 sm:hidden"
        >
          <span
            className={`absolute left-1.25 h-0.5 w-5.5 bg-[#FFFDF9] transition-all duration-300 ease-in-out ${
              isMenuOpen ? "top-3.75 rotate-45" : "top-1.5 rotate-0"
            }`}
          />
          <span
            className={`absolute top-3.75 left-1.25 h-0.5 w-5.5 bg-[#FFFDF9] transition-all duration-300 ease-in-out ${
              isMenuOpen ? "scale-x-0 opacity-0" : "scale-x-100 opacity-100"
            }`}
          />
          <span
            className={`absolute left-1.25 h-0.5 w-5.5 bg-[#FFFDF9] transition-all duration-300 ease-in-out ${
              isMenuOpen ? "top-3.75 -rotate-45" : "top-6 rotate-0"
            }`}
          />
        </button>
      </div>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out sm:hidden ${
          isMenuOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col items-start gap-3 border-t border-[#2A2726] px-6 py-4">
            <CreditsPill />
            <MyVibechecksButton />
          </div>
        </div>
      </div>
    </nav>
  );
}

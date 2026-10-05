"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FRAME_ASPECT_RATIO, PhotoFrame } from "@/components/viewer/PhotoFrame";
import type { StorySlide } from "@/lib/story-slides";
import type { ProfileContext } from "@/lib/supabase/types";

const HEADLINE_FONT =
  "'Fredoka', Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
const BODY_FONT =
  "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

const SIX_DARK_COLORS: Array<{ from: string; to: string }> = [
  { from: "#5C1512", to: "#1A0403" },
  { from: "#5C2038", to: "#1F0A16" },
  { from: "#3A2260", to: "#140A26" },
  { from: "#1F4A34", to: "#04140E" },
  { from: "#1E3A5C", to: "#08182B" },
  { from: "#5C3E16", to: "#241800" },
];

function slideBackground(_context: ProfileContext, index: number): string {
  const { from, to } = SIX_DARK_COLORS[index % SIX_DARK_COLORS.length];
  return `linear-gradient(165deg, ${from} 0%, #0a0a0a 48%, ${to} 100%)`;
}

// Proper fluid-typography formula: linearly interpolates between minPx (at
// a 340px-wide phone) and maxPx (at a 700px-wide screen), then clamps at
// both ends. The earlier version's vw term barely moved across mobile
// widths, so it was landing near maxPx almost everywhere — this is why
// the bold hero text wasn't actually shrinking on phones before.
function fluidClamp(minPx: number, maxPx: number, minVw = 340, maxVw = 700): string {
  const slope = (maxPx - minPx) / (maxVw - minVw);
  const intercept = minPx - slope * minVw;
  const preferred = `calc(${intercept.toFixed(2)}px + ${(slope * 100).toFixed(3)}vw)`;
  return `clamp(${minPx}px, ${preferred}, ${maxPx}px)`;
}

function heroFontSize(text: string, maxPx: number, minPx: number): string {
  const len = text.length;
  // Longer text pulls the max down first (still fluid across viewport
  // width below that adjusted ceiling).
  const adjustedMax = Math.max(minPx, maxPx - Math.max(0, len - 28) * ((maxPx - minPx) / 90));
  return fluidClamp(minPx, adjustedMax);
}

function slideDuration(slide: StorySlide): number {
  if (slide.kind === "answer") {
    const words = (slide.answer + " " + slide.question).trim().split(/\s+/).length;
    return Math.max(3800, Math.min(8500, 1400 + words * 220));
  }
  return 4200;
}

function EyebrowLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{ fontFamily: BODY_FONT }}
      className="text-[10px] font-bold tracking-[0.14em] text-[#FFDDE9]/80 sm:text-[11px] sm:tracking-[0.16em]"
    >
      {children}
    </div>
  );
}

function RevealText({
  text,
  animKey,
  style,
  className,
}: {
  text: string;
  animKey: number | string;
  style?: React.CSSProperties;
  className?: string;
}) {
  const words = text.split(" ");
  return (
    <div style={style} className={className}>
      {words.map((word, i) => (
        <span
          key={`${animKey}-${i}`}
          className="inline-block animate-[word-in_480ms_cubic-bezier(0.22,1,0.36,1)_backwards]"
          style={{ animationDelay: `${i * 45}ms` }}
        >
          {word}
          {i < words.length - 1 ? "\u00A0" : ""}
        </span>
      ))}
    </div>
  );
}

// Dummy demo interaction — purely local state, no Supabase, no API, no
// modal. Shared across the whole story: one `reacted` boolean lives in
// the parent and is passed down unchanged regardless of slide.
function ReactButton({
  reacted,
  onReact,
}: {
  reacted: boolean;
  onReact: () => void;
}) {
  const [popKey, setPopKey] = useState(0);
  const [bursts, setBursts] = useState<number[]>([]);
  const nextBurstId = useRef(0);

  function handleClick() {
    const willReact = !reacted;
    onReact();
    setPopKey((k) => k + 1);
    if (!willReact) return;
    const id = nextBurstId.current++;
    setBursts((prev) => [...prev, id]);
    setTimeout(() => setBursts((prev) => prev.filter((b) => b !== id)), 900);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={reacted}
      style={{ fontFamily: BODY_FONT }}
      className={`pointer-events-auto relative z-20 flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12px] font-semibold text-white backdrop-blur-md transition-all duration-200 sm:px-4 sm:py-2.5 sm:text-[13px] ${
        reacted
          ? "border-[#FF96C3]/70 bg-[#FF96C3]/20"
          : "border-white/15 bg-black/35 hover:border-white/30"
      }`}
    >
      <span key={popKey} className="inline-block animate-[pop_320ms_ease-out] text-[15px] sm:text-[16px]">
        {reacted ? "💕" : "🤍"}
      </span>
      <span>{reacted ? "Reacted" : "React to this"}</span>

      {bursts.map((burstId) => (
        <span key={burstId} className="pointer-events-none absolute top-0 left-4">
          {[0, 1, 2].map((p) => (
            <span
              key={p}
              className="absolute text-[14px] animate-[float-up-fade_850ms_ease-out_forwards] sm:text-[15px]"
              style={{ left: `${p * 9}px`, animationDelay: `${p * 70}ms` }}
              aria-hidden="true"
            >
              💕
            </span>
          ))}
        </span>
      ))}
    </button>
  );
}

export function StoryViewer({
  context,
  slides,
  photoUrl,
  ownerPreview = false,
  cardHeight,
}: {
  context: ProfileContext;
  slides: StorySlide[];
  photoUrl?: string;
  // The owner viewing their own not-yet-published story: no React button
  // (there's no one else to react), no "Create my own Vibecheck" CTA (it's
  // already theirs), and the wrapper doesn't force min-h-[100dvh] so a
  // caller can size the card itself instead. Defaults to false so every
  // existing caller (the real public viewer, the Orla demo) is unaffected.
  ownerPreview?: boolean;
  // Overrides the card's height (a CSS length, e.g. "560px" or a clamp())
  // — set via inline style, which wins over the height classes below
  // regardless of whether cardHeight is given, so this is a pure add-on.
  cardHeight?: string;
}) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [reacted, setReacted] = useState(false);
  const [paused, setPaused] = useState(false);
  const total = slides.length;
  const slide = slides[index];
  const profileName =
    slides.find((s) => s.kind === "intro" || s.kind === "end")?.name ?? "";

  // PhotoFrame sizes itself purely from the card's width (a %, clamped by
  // min/max-w), with height following via its own aspect-ratio — it has no
  // idea how much vertical room is actually left once the eyebrow label,
  // name and caption have taken their share. That's fine on an
  // unconstrained card (plenty of height to spare), but a caller that
  // passes `cardHeight` can shrink the card enough that the frame's
  // width-driven height pushes the caption (and the frame's own smiley)
  // past the card's bottom edge, where overflow-hidden clips them.
  //
  // Fixed by measuring the actual overflow after layout and, only then,
  // capping the frame's width (its height follows via the same
  // aspect-ratio) by just enough to remove it — imperative DOM writes via
  // refs rather than React state, so there's no extra render pass and,
  // critically, no code path here that can ever run when `cardHeight` is
  // undefined. That keeps every existing caller (the real public viewer,
  // Orla's /preview demo) byte-for-byte unaffected.
  const introContentRef = useRef<HTMLDivElement>(null);
  const photoFrameRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!cardHeight) return;
    const contentEl = introContentRef.current;
    const frameEl = photoFrameRef.current;
    if (!contentEl || !frameEl) return;

    function measureAndApply() {
      if (!frameEl || !contentEl) return;
      // Clear any previous cap first so this always measures the natural,
      // width-driven size — otherwise a resize from short to tall would
      // never be able to grow the frame back.
      frameEl.style.width = "";
      frameEl.style.maxWidth = "";
      // A handful of passes rather than one: shrinking the frame by exactly
      // the measured overflow assumes nothing else reflows in response,
      // which is usually true but not guaranteed (sub-pixel rounding, a
      // font swap mid-measurement). Each pass re-measures from scratch, so
      // this converges rather than trusting a single estimate.
      for (let i = 0; i < 4; i++) {
        const overflowPx = contentEl.scrollHeight - contentEl.clientHeight;
        if (overflowPx <= 0) break;
        const naturalHeight = frameEl.getBoundingClientRect().height;
        const cappedHeight = Math.max(120, naturalHeight - overflowPx - 6);
        if (cappedHeight >= naturalHeight) break;
        // width/height = FRAME_ASPECT_RATIO (1/1.05), so width = height *
        // FRAME_ASPECT_RATIO — dividing here would inflate instead of shrink.
        const cappedWidth = cappedHeight * FRAME_ASPECT_RATIO;
        frameEl.style.width = `${cappedWidth}px`;
        frameEl.style.maxWidth = `${cappedWidth}px`;
      }
    }

    measureAndApply();
    // Webfonts (Fredoka etc.) can finish loading after this first pass and
    // reflow the eyebrow/name/caption text taller, without changing
    // contentEl's own (flex-computed) box size — so the ResizeObserver
    // below wouldn't catch that on its own.
    document.fonts?.ready?.then(measureAndApply).catch(() => {});
    const ro = new ResizeObserver(measureAndApply);
    ro.observe(contentEl);
    return () => ro.disconnect();
  }, [cardHeight, index]);

  // The prev/next tap zones must never overlap the bottom action bar (React
  // button, end-slide CTA). Out-ranking them by z-index can't work: the bar
  // lives inside the content wrapper, which is its own stacking context at
  // z-[2], so nothing inside it can beat the zones' z-[5]. Instead the zones
  // stop exactly where the bar starts — measured, since its height differs
  // per slide type (React button vs. CTA vs. nothing) and per breakpoint.
  const bottomBarRef = useRef<HTMLDivElement>(null);
  const [bottomBarHeight, setBottomBarHeight] = useState(0);

  useLayoutEffect(() => {
    const el = bottomBarRef.current;
    if (!el) return;
    function measure() {
      // An empty bar (intro slide, owner preview) is just padding — nothing
      // to protect, so the zones keep the full height there.
      setBottomBarHeight(el!.childElementCount > 0 ? el!.getBoundingClientRect().height : 0);
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [index]);

  function next() {
    if (index >= total - 1) return;
    setDirection(1);
    setIndex((i) => i + 1);
  }
  function prev() {
    if (index <= 0) return;
    setDirection(-1);
    setIndex((i) => i - 1);
  }
  function handleReact() {
    setReacted((prev) => !prev);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") setPaused((p) => !p);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, index]);

  const duration = slideDuration(slide);
  useEffect(() => {
    if (paused || index >= total - 1) return;
    const timer = setTimeout(next, duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused]);

  return (
    // Full-bleed on mobile (no outer padding, no rounded card — the story
    // itself IS the screen, matching Instagram/TikTok). From the sm:
    // breakpoint up, it becomes the floating rounded "phone mockup" card
    // look, since there's actual room around it on a real desktop screen.
    <div
      className={`flex items-center justify-center bg-[#0a0a0a] px-6 py-8 sm:px-4 sm:py-6${
        ownerPreview ? "" : " min-h-[100dvh]"
      }`}
    >
      <div
        style={{
          background: slideBackground(context, index),
          ...(cardHeight ? { height: cardHeight } : {}),
        }}
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
        className="relative flex h-[min(66dvh,520px)] w-full max-w-[320px] flex-col overflow-hidden rounded-[24px] border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.6)] ring-1 ring-black/20 transition-[background] duration-500 ease-out select-none sm:h-[min(780px,calc(100dvh-48px))] sm:max-w-[400px] sm:rounded-[30px]"
      >
        <div className="pointer-events-none absolute -top-[100px] -right-[110px] z-0 h-[280px] w-[280px] rounded-full bg-[#FF96C3] opacity-[0.14] blur-[6px]" />
        <div className="pointer-events-none absolute -bottom-[120px] -left-[130px] z-0 h-[260px] w-[260px] rounded-full bg-[#FF6961] opacity-[0.12] blur-[6px]" />
        <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-white/[0.04] to-transparent" />

        <button
          type="button"
          aria-label="Previous slide"
          onClick={prev}
          disabled={index === 0}
          style={{ bottom: bottomBarHeight }}
          className="absolute top-0 left-0 z-[5] w-[26%] cursor-pointer disabled:cursor-default"
        />
        <button
          type="button"
          aria-label="Next slide"
          onClick={next}
          disabled={index === total - 1}
          style={{ bottom: bottomBarHeight }}
          className="absolute top-0 right-0 z-[5] w-[26%] cursor-pointer disabled:cursor-default"
        />

        <div className="pointer-events-none relative z-[2] flex h-full flex-col">
          {/* pt-[env(safe-area-inset-top)] clears the iOS notch/status bar
              when running full-bleed on a real phone, not just the
              browser chrome shown in a screenshot. */}
          <div
            style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
            className="flex items-center gap-3 px-3 sm:px-4 sm:pt-4"
          >
            <div className="flex flex-1 gap-[4px] sm:gap-[5px]">
              {slides.map((_, i) => (
                <span
                  key={i}
                  className="h-[3px] flex-1 min-w-3 overflow-hidden rounded-full bg-white/25"
                >
                  {i < index && <span className="block h-full w-full rounded-full bg-[#FFF6E0]" />}
                  {i === index && (
                    <span
                      key={`${index}-${paused}`}
                      className="block h-full rounded-full bg-[#FFF6E0]"
                      style={{
                        width: "0%",
                        animation: `fill-bar ${duration}ms linear forwards`,
                        animationPlayState: paused ? "paused" : "running",
                      }}
                    />
                  )}
                </span>
              ))}
            </div>
            <span
              style={{ fontFamily: BODY_FONT }}
              className="shrink-0 rounded-full border border-white/15 bg-black/40 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm sm:px-2.5 sm:text-[11px]"
            >
              {index + 1}/{total}
            </span>
          </div>

          <div
            key={index}
            ref={introContentRef}
            style={{
              animation: `${
                direction === 1 ? "slide-in-right" : "slide-in-left"
              } 320ms cubic-bezier(0.22,1,0.36,1)`,
            }}
            className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-3 text-center sm:px-7 sm:py-4"
          >
            {slide.kind === "intro" && (
              <>
                <EyebrowLabel>MADE WITH VIBECHECK</EyebrowLabel>
                <RevealText
                  text={profileName}
                  animKey={index}
                  style={{
                    fontFamily: HEADLINE_FONT,
                    fontSize: fluidClamp(22, 40),
                    fontWeight: 700,
                    letterSpacing: "normal",
                    lineHeight: 0.95,
                  }}
                  className="mt-2 text-white sm:mt-3"
                />
                <PhotoFrame ref={photoFrameRef} photoUrl={photoUrl} name={profileName} />
                <div
                  style={{ fontFamily: BODY_FONT }}
                  className="px-2 text-[12px] text-white/70 sm:text-[13px]"
                >
                  Tap to get to know {profileName} a little better →
                </div>
              </>
            )}

            {slide.kind === "answer" && (
              <>
                <EyebrowLabel>{profileName.toUpperCase()}&apos;S VIBECHECK</EyebrowLabel>
                <RevealText
                  text={slide.answer}
                  animKey={index}
                  style={{
                    fontFamily: HEADLINE_FONT,
                    fontSize: heroFontSize(slide.answer, 40, 18),
                    fontWeight: 700,
                    letterSpacing: "normal",
                    lineHeight: 1.05,
                  }}
                  className="mt-2 text-white sm:mt-3"
                />
                <div
                  style={{ fontFamily: BODY_FONT, letterSpacing: "normal" }}
                  className="mt-3 animate-[word-in_480ms_cubic-bezier(0.22,1,0.36,1)_backwards] text-[14px] leading-[1.4] text-white/70 sm:mt-4 sm:text-[15px]"
                >
                  {slide.question}
                </div>
              </>
            )}

            {slide.kind === "end" && (
              <>
                <EyebrowLabel>THAT&apos;S {profileName.toUpperCase()}&apos;S VIBE ✨</EyebrowLabel>
                <RevealText
                  text={`Thanks for viewing ${profileName}'s vibe!`}
                  animKey={index}
                  style={{
                    fontFamily: HEADLINE_FONT,
                    fontSize: fluidClamp(20, 32),
                    fontWeight: 700,
                    letterSpacing: "normal",
                    lineHeight: 0.95,
                  }}
                  className="mt-2 text-white sm:mt-3"
                />
                <div
                  style={{ fontFamily: BODY_FONT }}
                  className="mt-2 px-2 text-[13px] leading-[1.4] text-white/70 sm:mt-3 sm:text-[14px]"
                >
                  Now it&apos;s your turn — build one in a few minutes.
                </div>
              </>
            )}
          </div>

          {/* pb clears the iOS home-indicator area on full-bleed mobile. */}
          <div
            ref={bottomBarRef}
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            className="flex items-center justify-between gap-2.5 px-3 sm:px-4 sm:pb-5"
          >
            {slide.kind === "answer" && !ownerPreview && (
              <ReactButton reacted={reacted} onReact={handleReact} />
            )}
            {slide.kind === "end" && !ownerPreview && (
              <div className="pointer-events-auto relative w-full">
                <Link
                  href={slide.ctaHref}
                  style={{ fontFamily: BODY_FONT }}
                  className="relative z-20 flex h-[46px] w-full items-center justify-center rounded-[14px] bg-[#FF96C3] px-6 text-[14px] font-extrabold text-neutral-900 shadow-[0_10px_30px_rgba(255,150,195,0.35)] transition-transform active:scale-[0.98] sm:h-[50px] sm:rounded-[16px] sm:text-[15px]"
                >
                  Create my own Vibecheck →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes pop {
          0% {
            transform: scale(1);
          }
          40% {
            transform: scale(1.35);
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes float-up-fade {
          0% {
            opacity: 1;
            transform: translateY(0) scale(0.9);
          }
          100% {
            opacity: 0;
            transform: translateY(-34px) scale(1.15);
          }
        }
        @keyframes slide-in-right {
          from {
            opacity: 0;
            transform: translateX(18px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes slide-in-left {
          from {
            opacity: 0;
            transform: translateX(-18px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes word-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fill-bar {
          from {
            width: 0%;
          }
          to {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
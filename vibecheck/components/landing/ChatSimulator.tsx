"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Keep every timing/copy decision here so the animation can be re-tuned
// without touching the playback or render logic below.
type Sender = "them" | "me";

type ChatStep =
  | { type: "typing"; from: Sender; duration: number }
  | { type: "text"; from: Sender; text: string }
  | { type: "image"; from: "me"; src: string; caption?: string };

const SCRIPT: ChatStep[] = [
  { type: "typing", from: "them", duration: 1400 },
  { type: "text", from: "them", text: "So... what do you like to do for fun?" },
  { type: "typing", from: "me", duration: 1000 },
  { type: "text", from: "me", text: "Oh please, not this question again 😅" },
  { type: "typing", from: "me", duration: 900 },
  {
    type: "text",
    from: "me",
    text: "Hang on, I'll send you my vibecheck doc. It's easier",
  },
  { type: "image", from: "me", src: "/demo-card.svg" },
  { type: "typing", from: "them", duration: 900 },
  { type: "text", from: "them", text: "lol 🥺..." },
  { type: "typing", from: "them", duration: 1300 },
  {
    type: "text",
    from: "them",
    text: "Wait, this is sick. You hate carrots too? AND you're a night owl??",
  },
  { type: "typing", from: "them", duration: 1100 },
  {
    type: "text",
    from: "them",
    text: "Checking our compatibility now... 87%?! Say less 😄",
  },
];

const INITIAL_DELAY_MS = 400;
const LOOP_PAUSE_MS = 3000;

type VisibleItem = { id: number } & (
  | { type: "text"; from: Sender; text: string }
  | { type: "image"; from: "me"; src: string; caption?: string }
);

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isRenderableStep(step: ChatStep): step is Extract<ChatStep, { type: "text" | "image" }> {
  return step.type !== "typing";
}

function buildFinalItems(): VisibleItem[] {
  let id = 0;
  return SCRIPT.filter(isRenderableStep).map((step) => {
    id += 1;
    return { id, ...step };
  });
}

// Module-level, not React/sessionStorage state, and deliberately so: a real
// page reload re-evaluates this module from scratch (resets to false), while
// clicking around the app client-side (Link navigation) never re-evaluates
// it (stays true once set). That's the exact distinction needed — and it's
// simpler and more reliable than it sounds: an earlier version of this used
// performance.getEntriesByType("navigation") to detect reloads instead, but
// that API reflects how the current *document* loaded, and a single-page
// app only ever has one such entry for the whole tab session — client-side
// navigation never creates a new one. So once the page had been reloaded
// even once, that check stayed "true" for every navigation afterward,
// replaying the animation on every single visit instead of just once.
let hasPlayedThisLoad = false;

// Shared shape/color so a typing indicator always matches the sender's
// real message bubble — no separate style to drift out of sync.
function bubbleShapeClass(from: Sender) {
  return from === "me"
    ? "self-end rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl rounded-br-md bg-[#F7BFD6] text-neutral-900"
    : "self-start rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-md bg-[#262626] text-white";
}

function TextBubble({ from, text }: { from: Sender; text: string }) {
  return (
    <div
      className={`w-fit max-w-[75%] px-4 py-2.5 font-inter text-[15px] leading-snug ${bubbleShapeClass(
        from,
      )} animate-[bubble-in_200ms_ease-out]`}
    >
      {text}
    </div>
  );
}

function ImageCard({ src, caption }: { src: string; caption?: string }) {
  return (
    <div className="w-full max-w-[260px] self-end animate-[card-in_250ms_ease-out]">
      {/* Plain <img>, not next/image: local SVGs need images.dangerouslyAllowSVG
          configured before next/image will render them, and this static
          decorative asset doesn't benefit from the optimizer anyway. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={caption ?? "Vibecheck bio-card"} className="h-auto w-full" />
    </div>
  );
}

function TypingBubble({ from }: { from: Sender }) {
  const dotColor = from === "me" ? "bg-neutral-700" : "bg-white/70";
  return (
    <div
      className={`flex w-fit items-center gap-1 px-4 py-3 ${bubbleShapeClass(
        from,
      )} animate-[bubble-in_200ms_ease-out]`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${dotColor} animate-[typing-dot_1.2s_ease-in-out_infinite] [animation-delay:0ms]`}
      />
      <span
        className={`h-1.5 w-1.5 rounded-full ${dotColor} animate-[typing-dot_1.2s_ease-in-out_infinite] [animation-delay:150ms]`}
      />
      <span
        className={`h-1.5 w-1.5 rounded-full ${dotColor} animate-[typing-dot_1.2s_ease-in-out_infinite] [animation-delay:300ms]`}
      />
    </div>
  );
}

interface ChatSimulatorProps {
  loop?: boolean;
}

export function ChatSimulator({ loop = false }: ChatSimulatorProps) {
  // Read exactly ONCE, via a lazy initializer — never re-read inside the
  // effect below. React Strict Mode (dev only) invokes this component's
  // effect twice per mount (setup -> cleanup -> setup); if the effect body
  // re-read the module flag fresh each time instead, whichever of those two
  // invocations set it first would make the OTHER one (including the real,
  // surviving one) see it as already-played and skip its own animation. A
  // lazy initializer runs exactly once, during this mount's first render,
  // strictly before either effect invocation — so both invocations agree on
  // the same skipAnimation value for this mount's entire lifetime.
  const [skipAnimation] = useState(() => !loop && hasPlayedThisLoad);
  const [visibleItems, setVisibleItems] = useState<VisibleItem[]>(() =>
    skipAnimation ? buildFinalItems() : [],
  );
  const [typingFrom, setTypingFrom] = useState<Sender | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    // The finished chat was already set via the lazy initializers above —
    // both the server render and this component's very first client render
    // agree on it (skipAnimation is derived from module state that doesn't
    // exist during SSR, so the server always renders the empty/playing
    // state — see the hydration note below), so there's nothing left for
    // this effect to do on a skipped mount.
    if (skipAnimation) return;

    // Set synchronously, not after an await: since skipAnimation is no
    // longer read here (only written), it's safe for both of Strict Mode's
    // dev-only double-invoked effect calls to set this — neither can affect
    // what THIS mount displays, only what the NEXT mount's lazy initializer
    // sees.
    if (!loop) {
      hasPlayedThisLoad = true;
    }

    // A plain closure variable, not a ref: React Strict Mode runs this
    // effect's setup twice (mount -> cleanup -> mount) in dev. A ref shared
    // across both invocations would have its `false` reset by the second
    // setup un-cancel the first invocation's loop, leaving two players
    // running at once (visible as duplicate React keys). A variable scoped
    // to this specific effect call is isolated from the other invocation.
    let cancelled = false;
    let nextId = 0;

    async function play() {
      do {
        setVisibleItems([]);
        setTypingFrom(null);
        await sleep(INITIAL_DELAY_MS);
        if (cancelled) return;

        for (const step of SCRIPT) {
          if (cancelled) return;

          if (step.type === "typing") {
            setTypingFrom(step.from);
            await sleep(step.duration);
            if (cancelled) return;
            setTypingFrom(null);
            continue;
          }

          nextId += 1;
          const id = nextId;
          setVisibleItems((prev) => [...prev, { id, ...step }]);
        }

        if (cancelled) return;
        if (!loop) return;
        await sleep(LOOP_PAUSE_MS);
      } while (!cancelled);
    }

    play();

    return () => {
      cancelled = true;
    };
  }, [loop, skipAnimation]);

  useEffect(() => {
    if (skipAnimation) return;
    // No inner scroll container: this scrolls the actual page to reveal each
    // new bubble as it lands, the way a growing feed does, instead of boxing
    // the conversation into its own scrollbar.
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visibleItems, typingFrom, skipAnimation]);

  return (
    <section className="flex flex-col items-center gap-8 px-6 py-16 lg:gap-12 lg:py-28">
      <h2 className="max-w-sm text-center font-inter text-3xl font-bold text-white sm:text-4xl lg:max-w-lg lg:text-5xl">
        The chat that changed everything 👇
      </h2>

      <div className="flex w-full max-w-sm flex-col gap-3 lg:max-w-xl lg:gap-5">
        {visibleItems.map((item) =>
          item.type === "text" ? (
            <TextBubble key={item.id} from={item.from} text={item.text} />
          ) : (
            <ImageCard key={item.id} src={item.src} caption={item.caption} />
          ),
        )}
        {typingFrom && <TypingBubble from={typingFrom} />}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}

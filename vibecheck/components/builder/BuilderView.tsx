"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MAX_BUILDER_TURNS, SCRIPTED_OPENING_QUESTIONS, UNDER_18_AGE_REPLIES } from "@/lib/builder-constants";
import {
  createDraft,
  loadDraft,
  saveDraft,
  type DraftTurn,
  type GuestDraft,
} from "@/lib/guest-draft";
import { CONTEXT_LABEL } from "@/lib/profile-meta";
import { isProfileContext, type ProfileContext } from "@/lib/supabase/types";

type PendingQuestion = { question: string; quickReplies?: string[] };

export function BuilderView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [draft, setDraft] = useState<GuestDraft | null>(null);
  const [pending, setPending] = useState<PendingQuestion | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [ageBlocked, setAgeBlocked] = useState(false);
  const [skipMenuOpen, setSkipMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [sectionHeight, setSectionHeight] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Whether the user is currently scrolled near the bottom — read (not
  // reactive state) so tracking it doesn't itself trigger re-renders.
  const isNearBottomRef = useRef(true);
  // Forces the next auto-scroll even if the user had scrolled up, since they
  // just took an action that should bring them back to the live edge.
  const justActedRef = useRef(false);

  // Resume an in-progress draft if one exists; otherwise start a fresh one
  // from the ?context= the picker sent us. Runs once on mount only.
  useEffect(() => {
    const existing = loadDraft();
    if (existing) {
      // localStorage can't be read during SSR/first paint without a
      // hydration mismatch, so this has to happen post-mount in an effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(existing);
      return;
    }
    const contextParam = searchParams.get("context");
    if (!isProfileContext(contextParam)) {
      router.replace("/create");
      return;
    }
    const fresh = createDraft(contextParam);
    saveDraft(fresh);
    setDraft(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchNextQuestion = useCallback(async (current: GuestDraft) => {
    if (current.conversation.length >= MAX_BUILDER_TURNS) {
      setIsDone(true);
      return;
    }
    setIsThinking(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: current.context,
          conversation: current.conversation.map(({ question, answer, status }) => ({
            question,
            answer,
            status,
          })),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? "Couldn't reach the AI.");
      }
      const data = (await res.json()) as {
        done: boolean;
        question?: string;
        quickReplies?: string[];
      };
      if (data.done || !data.question) {
        setIsDone(true);
      } else {
        setPending({ question: data.question, quickReplies: data.quickReplies });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reach the AI.");
    } finally {
      setIsThinking(false);
    }
  }, []);

  // Whenever there's a draft but nothing pending/done/erroring, ask for the
  // next question. Covers both the initial question and every question
  // after an answer/skip commits and clears `pending`. Every context's first
  // two turns are scripted (name, then age-with-chips) and never go through
  // the AI — only once both are answered does generation take over.
  useEffect(() => {
    if (!draft || pending || isDone || isThinking || error || ageBlocked) return;
    if (draft.conversation.length < SCRIPTED_OPENING_QUESTIONS.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPending(SCRIPTED_OPENING_QUESTIONS[draft.conversation.length]);
      return;
    }
    // Data fetching in response to state changes — fetchNextQuestion sets
    // isThinking/error synchronously before its first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNextQuestion(draft);
  }, [draft, pending, isDone, isThinking, error, ageBlocked, fetchNextQuestion]);

  // Locks the page itself from scrolling while the builder is open, so
  // there's exactly one scrollable element on screen: the chat log below.
  // Without this, the outer page can still scroll a few px — a browser's own
  // "scroll the focused input above the keyboard" behavior operates on
  // whichever ancestor is actually scrollable, which would otherwise be the
  // window, not this container.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Measures the real remaining space instead of guessing it. A fixed
  // "100dvh minus N px" calc has to guess the height of everything above
  // this section (navbar, safe-area insets, whatever) — if the guess runs
  // short, the input gets pushed below the fold with no way to reach it
  // now that the page itself can't scroll. This reads the section's actual
  // position and the *visual* viewport's actual height instead, so it's
  // correct regardless of what's above it, and re-runs on
  // visualViewport's resize event so it also tracks the on-screen keyboard
  // opening/closing on browsers where the keyboard overlays rather than
  // resizes the layout viewport (interactiveWidget: resizes-content, set in
  // app/layout.tsx, handles the browsers that support it directly).
  useEffect(() => {
    function updateHeight() {
      const el = sectionRef.current;
      if (!el) return;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const top = el.getBoundingClientRect().top;
      // No artificial floor here: on a short device with the keyboard open,
      // the real available space can legitimately be small, and the header/
      // input rows (both shrink-0) protect their own minimum size — a floor
      // would just force the box taller than the keyboard leaves room for.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSectionHeight(viewportHeight - top);
    }
    updateHeight();
    window.visualViewport?.addEventListener("resize", updateHeight);
    window.addEventListener("resize", updateHeight);
    return () => {
      window.visualViewport?.removeEventListener("resize", updateHeight);
      window.removeEventListener("resize", updateHeight);
    };
    // Re-runs once `draft` flips from null to real: before that, this
    // component returns null (see the early return below) so sectionRef
    // isn't attached to anything yet on the very first effect pass.
  }, [draft]);

  // Tracks how close to the bottom the log currently is, so a message
  // arriving while the user has scrolled up to re-read something doesn't
  // yank them back down.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    function handleScroll() {
      const distanceFromBottom = el!.scrollHeight - el!.scrollTop - el!.clientHeight;
      isNearBottomRef.current = distanceFromBottom < 120;
    }
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
    // Same reattachment concern as the height effect above.
  }, [draft]);

  // Re-pins the log to the bottom after every append: the user's own
  // message, the AI's reply, and the typing indicator appearing or
  // disappearing all change scrollHeight and land here. useLayoutEffect (not
  // useEffect) runs synchronously after the DOM updates but before the
  // browser paints, so the corrected position is what actually gets
  // painted — no flash of the old position followed by a visible catch-up.
  // `behavior: "auto"` (not "smooth") for the same reason: an in-flight
  // smooth-scroll animation getting retargeted by the next rapid state
  // change (e.g. the typing bubble vanishing right as a reply lands) is
  // exactly what read as a "jump" before.
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (isNearBottomRef.current || justActedRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    }
    justActedRef.current = false;
    // sectionHeight is also a dependency: any resize (keyboard, browser
    // window, or a chrome-shrinking deploy like this one) changes how much
    // of the log is actually visible without adding/removing a message, so
    // without re-pinning here the view can end up showing a scroll position
    // that predates the resize — the exact "stuck near the top" symptom.
  }, [draft?.conversation.length, pending, isThinking, sectionHeight]);

  // Textarea auto-grows with content from a 44px single line up to a 3-line
  // cap, then scrolls internally — re-measured on every value change,
  // including the programmatic reset to "" after sending, which needs to
  // shrink the box back down but never fires a native input/change event.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(96, Math.max(44, el.scrollHeight))}px`;
  }, [inputValue]);

  function commitTurn(turn: DraftTurn) {
    if (!draft) return;
    const updated: GuestDraft = {
      ...draft,
      conversation: [...draft.conversation, turn],
      updatedAt: new Date().toISOString(),
    };
    saveDraft(updated);
    setDraft(updated);
    setPending(null);
    setInputValue("");
    setSkipMenuOpen(false);
  }

  function handleSend(answerText?: string) {
    if (!pending || !draft) return;
    const answer = (answerText ?? inputValue).trim();
    if (!answer) return;

    // The age question is always the 2nd scripted turn (index 1) — check
    // before committing so we still have the pre-commit conversation length
    // to identify it by. Only dating actually gates on the answer; asking
    // age in friendship/get_to_know is informational only.
    const isAgeQuestion = draft.conversation.length === 1;

    justActedRef.current = true;
    commitTurn({
      question: pending.question,
      answer,
      status: "answered",
      quickReplies: pending.quickReplies,
    });

    if (isAgeQuestion && draft.context === "dating" && UNDER_18_AGE_REPLIES.has(answer)) {
      setAgeBlocked(true);
    }
  }

  function switchContext(newContext: ProfileContext) {
    const fresh = createDraft(newContext);
    saveDraft(fresh);
    setDraft(fresh);
    setPending(null);
    setIsDone(false);
    setAgeBlocked(false);
    setError(null);
    setInputValue("");
    router.replace(`/create/build?context=${newContext}`);
  }

  function handleSkip(status: "skipped_for_now" | "excluded") {
    if (!pending) return;
    justActedRef.current = true;
    commitTurn({
      question: pending.question,
      answer: null,
      status,
      quickReplies: pending.quickReplies,
    });
  }

  function handleSaveAndLeave() {
    if (draft) saveDraft(draft);
    router.push("/?draftSaved=1");
  }

  function handleRetry() {
    setError(null);
    if (draft) fetchNextQuestion(draft);
  }

  if (!draft) return null;

  const progress = Math.min(draft.conversation.length / MAX_BUILDER_TURNS, 1) * 100;

  return (
    <section
      ref={sectionRef}
      style={{ height: sectionHeight ?? undefined }}
      // The h-[calc(...)] class is only a fallback for the one frame before
      // the measurement effect above runs — sectionHeight then takes over.
      // builder-shell: see globals.css for the max-height:720px rules that
      // shrink this padding further and hide the navbar entirely.
      className="builder-shell mx-auto flex h-[calc(100dvh-160px)] w-full max-w-[820px] flex-col overflow-hidden px-6 py-4 lg:py-6"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[30px] border border-[#2A2726] bg-[#111]">
        {/* Progress + header, merged into one compact bar (was a separate
            rounded progress card plus a taller header) so the log gets the
            vertical space back. */}
        <div className="h-1 shrink-0 overflow-hidden bg-[#221F1E]">
          <div
            className="h-full bg-[#FF96C3] transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#2A2726] px-4 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-black text-white">
              Building your {CONTEXT_LABEL[draft.context]} Vibecheck
            </div>
            <div className="truncate text-[11px] text-[#FFB1D0]">
              Question {Math.min(draft.conversation.length + 1, MAX_BUILDER_TURNS)} of up to{" "}
              {MAX_BUILDER_TURNS} · 1 free Vibecheck
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Hidden below 400px: it repeats the context name already in
                the title right next to it, and on the narrowest phones that
                title needs the room more than this redundant pill does. */}
            <span className="rounded-full border border-[#2A2726] px-2 py-1 text-[11px] font-extrabold whitespace-nowrap text-white/80 max-[400px]:hidden">
              {CONTEXT_LABEL[draft.context]}
            </span>
            <button
              type="button"
              onClick={handleSaveAndLeave}
              className="rounded-[10px] border border-[#2A2726] px-2 py-1 text-[11px] font-extrabold whitespace-nowrap text-white/80 hover:bg-[#1A1817]"
            >
              Save &amp; leave
            </button>
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          className="flex min-h-[45dvh] flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-4"
        >
          {draft.conversation.map((turn, i) => (
            <div key={i} className="flex flex-col gap-2">
              <AiBubble text={turn.question} />
              {turn.status === "answered" ? (
                <UserBubble text={turn.answer ?? ""} />
              ) : (
                <div className="self-end text-[12px] text-white/40">
                  {turn.status === "skipped_for_now"
                    ? "⏳ Skipped for now"
                    : "🔒 Won't be on your profile"}
                </div>
              )}
            </div>
          ))}

          {pending && <AiBubble text={pending.question} />}
          {isThinking && <TypingBubble />}

          {error && (
            <div className="rounded-2xl border border-[#593438] bg-[#241416] px-4 py-3 text-[13px] text-[#FFB1B4]">
              {error}{" "}
              <button type="button" onClick={handleRetry} className="font-extrabold underline">
                Try again
              </button>
            </div>
          )}

          {isDone && (
            <div className="rounded-2xl border border-[#4A3941] bg-gradient-to-br from-[#21181D] to-[#171514] p-5 text-center">
              <div className="text-[28px]">✨</div>
              <h3 className="mt-2 text-[18px] font-black text-white">
                That&apos;s enough to build a great profile.
              </h3>
              <p className="mt-1 text-[13px] text-white/60">
                Next, take a look at what we&apos;ve got before it&apos;s shared anywhere.
              </p>
              <Link
                href="/create/photo"
                className="mt-3.5 inline-flex h-[44px] items-center justify-center rounded-[14px] bg-[#FF96C3] px-5 font-inter text-[15px] font-extrabold text-neutral-900"
              >
                Continue
              </Link>
            </div>
          )}

          {ageBlocked && (
            <div className="rounded-2xl border border-[#4A3941] bg-gradient-to-br from-[#21181D] to-[#171514] p-5 text-center">
              <div className="text-[28px]">🔒</div>
              <h3 className="mt-2 text-[18px] font-black text-white">
                Dating Vibechecks are for ages 18 and up.
              </h3>
              <p className="mt-1 text-[13px] text-white/60">
                No worries — you can still build a Friendship or Getting to Know Me Vibecheck instead.
              </p>
              <div className="mt-3.5 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={() => switchContext("friendship")}
                  className="inline-flex h-[44px] items-center justify-center rounded-[14px] bg-[#FF96C3] px-5 font-inter text-[15px] font-extrabold text-neutral-900"
                >
                  Switch to Friendship
                </button>
                <button
                  type="button"
                  onClick={() => switchContext("get_to_know")}
                  className="inline-flex h-[44px] items-center justify-center rounded-[14px] border border-[#2A2726] px-5 font-inter text-[15px] font-extrabold text-white/80 hover:bg-[#1A1817]"
                >
                  Switch to Getting to Know Me
                </button>
              </div>
            </div>
          )}
        </div>

        {!isDone && !ageBlocked && (
          <div
            className="relative shrink-0 border-t border-[#2A2726] px-4 pt-3.5"
            style={{ paddingBottom: "max(0.875rem, env(safe-area-inset-bottom))" }}
          >
            {skipMenuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close skip menu"
                  onClick={() => setSkipMenuOpen(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute right-4 bottom-16 z-20 w-60 rounded-[18px] border border-[#2A2726] bg-[#151313] p-2.5">
                  <button
                    type="button"
                    onClick={() => handleSkip("skipped_for_now")}
                    className="block w-full rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-white hover:bg-[#1F1B1A]"
                  >
                    ⏳ Skip for now
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSkip("excluded")}
                    className="block w-full rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-white hover:bg-[#1F1B1A]"
                  >
                    🔒 Don&apos;t put this on my profile
                  </button>
                  <p className="px-3 pt-1 pb-0.5 text-[11px] text-white/40">
                    You&apos;ll still be asked, but never have to publish an answer.
                  </p>
                </div>
              </>
            )}

            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={!pending || isThinking}
                placeholder="Type naturally — you don't need the perfect words."
                // Height is driven entirely by the auto-grow effect above
                // (44px single line up to a 96px/3-line cap, then it scrolls
                // internally) — h-11 here is only the pre-JS/SSR fallback.
                className="h-11 w-full flex-1 resize-none rounded-2xl border border-[#2A2726] bg-[#181615] px-3.5 py-2.5 text-white placeholder:text-white/30 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!pending || isThinking || !inputValue.trim()}
                aria-label="Send"
                // Icon-only under 480px width — just the arrow, no label —
                // so it and Skip both fit beside the textarea in one row
                // instead of needing a row of their own.
                className="flex h-11 shrink-0 items-center justify-center rounded-[14px] bg-[#FF96C3] px-4 text-[14px] font-extrabold text-neutral-900 disabled:opacity-40 max-[479px]:w-11 max-[479px]:px-0"
              >
                <span className="max-[479px]:hidden">Send </span>↗
              </button>
              <button
                type="button"
                onClick={() => setSkipMenuOpen((open) => !open)}
                disabled={!pending || isThinking}
                className="h-11 shrink-0 rounded-[14px] border border-[#2A2726] px-4 text-[14px] font-extrabold text-white/80 disabled:opacity-40"
              >
                Skip
              </button>
            </div>

            {pending?.quickReplies && pending.quickReplies.length > 0 && (
              // Horizontally scrollable, not wrapping, scrollbar hidden — a
              // wrapped multi-row chip block can grow tall enough to push
              // everything below it (or itself, on a short viewport) out of
              // view; a single row has a fixed, predictable height no
              // matter how many chips there are.
              <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
                {pending.quickReplies.map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    onClick={() => handleSend(reply)}
                    className="shrink-0 rounded-full border border-[#2A2726] bg-[#1F1B1A] px-3 py-1.5 text-[13px] whitespace-nowrap text-[#DDD4CC] hover:bg-[#262220]"
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function AiBubble({ text }: { text: string }) {
  return (
    <div className="max-w-[78%] self-start rounded-2xl rounded-bl-md bg-[#211F1E] px-4 py-3.5 text-[#F4ECE4]">
      <div className="mb-1 text-[10px] font-semibold tracking-wide text-white/40 uppercase">
        Vibecheck
      </div>
      {text}
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="max-w-[78%] self-end rounded-2xl rounded-br-md bg-[#FF96C3] px-4 py-3.5 text-neutral-900">
      <div className="mb-1 text-[10px] font-semibold tracking-wide text-neutral-900/50 uppercase">
        You
      </div>
      {text}
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex w-fit items-center gap-1 self-start rounded-2xl rounded-bl-md bg-[#211F1E] px-4 py-3.5">
      <span className="h-1.5 w-1.5 animate-[typing-dot_1.2s_ease-in-out_infinite] rounded-full bg-white/70 [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-[typing-dot_1.2s_ease-in-out_infinite] rounded-full bg-white/70 [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-[typing-dot_1.2s_ease-in-out_infinite] rounded-full bg-white/70 [animation-delay:300ms]" />
    </div>
  );
}

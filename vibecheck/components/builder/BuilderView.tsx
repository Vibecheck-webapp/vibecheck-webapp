"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MAX_BUILDER_TURNS } from "@/lib/builder-constants";
import {
  createDraft,
  loadDraft,
  saveDraft,
  type DraftTurn,
  type GuestDraft,
} from "@/lib/guest-draft";
import { CONTEXT_LABEL } from "@/lib/profile-meta";
import { isProfileContext } from "@/lib/supabase/types";

type PendingQuestion = { question: string; quickReplies?: string[] };

export function BuilderView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [draft, setDraft] = useState<GuestDraft | null>(null);
  const [pending, setPending] = useState<PendingQuestion | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [skipMenuOpen, setSkipMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
  // after an answer/skip commits and clears `pending`.
  useEffect(() => {
    if (!draft || pending || isDone || isThinking || error) return;
    // Data fetching in response to state changes — fetchNextQuestion sets
    // isThinking/error synchronously before its first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNextQuestion(draft);
  }, [draft, pending, isDone, isThinking, error, fetchNextQuestion]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [draft?.conversation.length, pending, isThinking]);

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
    if (!pending) return;
    const answer = (answerText ?? inputValue).trim();
    if (!answer) return;
    commitTurn({
      question: pending.question,
      answer,
      status: "answered",
      quickReplies: pending.quickReplies,
    });
  }

  function handleSkip(status: "skipped_for_now" | "excluded") {
    if (!pending) return;
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
    <section className="mx-auto w-full max-w-[820px] px-6 py-10 lg:py-14">
      <div className="sticky top-[84px] z-10 mb-5 flex items-center gap-3 rounded-2xl border border-[#2A2726] bg-[#0E0D0DF5] px-3 py-2.5 backdrop-blur-md">
        <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-[#221F1E]">
          <div
            className="h-full rounded-full bg-[#FF96C3] transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[12px] whitespace-nowrap text-[#D8D0C9]">1 free Vibecheck</span>
        <button
          type="button"
          onClick={handleSaveAndLeave}
          className="rounded-[10px] border border-[#2A2726] px-2.5 py-2 text-[12px] font-extrabold whitespace-nowrap text-white/80 hover:bg-[#1A1817]"
        >
          Save &amp; leave
        </button>
      </div>

      <div className="flex h-[calc(100vh-220px)] min-h-[560px] flex-col overflow-hidden rounded-[30px] border border-[#2A2726] bg-[#111]">
        <div className="flex items-center justify-between border-b border-[#2A2726] px-5 py-4">
          <div>
            <div className="text-[12px] text-white/50">BUILDING</div>
            <div className="text-[17px] font-black text-white">
              Building your {CONTEXT_LABEL[draft.context]} Vibecheck
            </div>
            <div className="mt-1 text-[12px] text-[#FFB1D0]">
              Question {Math.min(draft.conversation.length + 1, MAX_BUILDER_TURNS)} of up to{" "}
              {MAX_BUILDER_TURNS}
            </div>
          </div>
          <span className="rounded-full border border-[#2A2726] px-3 py-1.5 text-[12px] font-extrabold text-white/80">
            {CONTEXT_LABEL[draft.context]}
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-5">
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
                href="/create/summary"
                className="mt-3.5 inline-flex h-[44px] items-center justify-center rounded-[14px] bg-[#FF96C3] px-5 font-inter text-[15px] font-extrabold text-neutral-900"
              >
                Continue
              </Link>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {!isDone && (
          <div className="relative border-t border-[#2A2726] px-4 py-3.5">
            {skipMenuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close skip menu"
                  onClick={() => setSkipMenuOpen(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute right-4 bottom-[74px] z-20 w-60 rounded-[18px] border border-[#2A2726] bg-[#151313] p-2.5">
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

            <div className="flex gap-2.5">
              <textarea
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
                className="max-h-[150px] min-h-[52px] flex-1 resize-y rounded-2xl border border-[#2A2726] bg-[#181615] px-3.5 py-3 text-white placeholder:text-white/30 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!pending || isThinking || !inputValue.trim()}
                className="rounded-[14px] bg-[#FF96C3] px-4 py-2.5 text-[14px] font-extrabold text-neutral-900 disabled:opacity-40"
              >
                Send ↗
              </button>
              <button
                type="button"
                onClick={() => setSkipMenuOpen((open) => !open)}
                disabled={!pending || isThinking}
                className="rounded-[14px] border border-[#2A2726] px-4 py-2.5 text-[14px] font-extrabold text-white/80 disabled:opacity-40"
              >
                Skip
              </button>
            </div>

            {pending?.quickReplies && pending.quickReplies.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {pending.quickReplies.map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    onClick={() => handleSend(reply)}
                    className="rounded-full border border-[#2A2726] bg-[#1F1B1A] px-3 py-2 text-[12px] text-[#DDD4CC] hover:bg-[#262220]"
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

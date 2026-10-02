"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  countSlideMaterial,
  IDENTITY_FIELDS,
  MAX_BUILDER_TURNS,
  POST_CAP_TURN_ALLOWANCE,
  SCRIPTED_OPENING_QUESTIONS,
  SLIDE_MATERIAL_TARGET,
  UNDER_18_AGE_REPLIES,
} from "@/lib/builder-constants";
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
type EnhanceOffer = { options: string[] };
type IdentityField = (typeof IDENTITY_FIELDS)[number];

interface GenerateQuestionResponse {
  done: boolean;
  question?: string;
  quickReplies?: string[];
  // Friendship/get_to_know only — see app/api/generate-question/route.ts.
  enhance?: { options: string[] };
  recap?: string;
  knownIdentityFields?: string[];
  extracted?: string[];
}

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
  // Friendship/get_to_know only, all three below — see their specs. An
  // enhance offer replaces the next question for one turn; the recap is a
  // single in-chat message shown once the model signals done, before the
  // existing custom-question step; the identity batch (get_to_know only)
  // is shown before that recap. Each is null everywhere else, including
  // for dating, which never populates any of them.
  const [enhanceOffer, setEnhanceOffer] = useState<EnhanceOffer | null>(null);
  const [recapText, setRecapText] = useState<string | null>(null);
  const [identityBatch, setIdentityBatch] = useState<IdentityField[] | null>(null);
  // Stashes the recap while the identity batch is being resolved, since the
  // spec orders identity chips before the recap but the model returns both
  // in the same "done" response.
  const pendingRecapRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  // Whether the user is currently scrolled near the bottom — a ref (not
  // state) so tracking it doesn't itself cause re-renders.
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

  const fetchNextQuestion = useCallback(async (current: GuestDraft, opts?: { skipEnhancement?: boolean }) => {
    // Mirrors the route's backstop: dating just ends at the cap; the other
    // two still make one forced-"done" call there to get their recap.
    const turnLimit =
      current.context === "dating" ? MAX_BUILDER_TURNS : MAX_BUILDER_TURNS + POST_CAP_TURN_ALLOWANCE;
    if (current.conversation.length >= turnLimit) {
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
          extractedAttributes: current.extractedAttributes,
          skipEnhancement: opts?.skipEnhancement ?? false,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? "Couldn't reach the AI.");
      }
      const data = (await res.json()) as GenerateQuestionResponse;

      if (data.extracted) {
        const withExtracted: GuestDraft = { ...current, extractedAttributes: data.extracted };
        saveDraft(withExtracted);
        setDraft(withExtracted);
      }

      if (data.enhance && data.enhance.options.length > 0) {
        setEnhanceOffer({ options: data.enhance.options });
        return;
      }

      if (data.done || !data.question) {
        if (current.context === "get_to_know" && data.recap) {
          const known = new Set(data.knownIdentityFields ?? []);
          const remaining = IDENTITY_FIELDS.filter((f) => !known.has(f.key));
          if (remaining.length > 0) {
            pendingRecapRef.current = data.recap;
            setIdentityBatch(remaining);
            return;
          }
        }
        if (data.recap) {
          setRecapText(data.recap);
          return;
        }
        setIsDone(true);
        return;
      }

      setPending({ question: data.question, quickReplies: data.quickReplies });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reach the AI.");
    } finally {
      setIsThinking(false);
    }
  }, []);

  // Whenever there's a draft but nothing pending/done/erroring, ask for the
  // next question. Covers both the initial question and every question
  // after an answer/skip commits and clears `pending`. Only dating's first
  // two turns are scripted (name, then age-with-chips) and never go through
  // the AI — friendship and get_to_know ask both conversationally instead
  // (see their system prompts), so generation takes over from turn 1.
  useEffect(() => {
    if (
      !draft ||
      pending ||
      isDone ||
      isThinking ||
      error ||
      ageBlocked ||
      enhanceOffer ||
      recapText ||
      identityBatch
    )
      return;
    if (draft.context === "dating" && draft.conversation.length < SCRIPTED_OPENING_QUESTIONS.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPending(SCRIPTED_OPENING_QUESTIONS[draft.conversation.length]);
      return;
    }
    // Data fetching in response to state changes — fetchNextQuestion sets
    // isThinking/error synchronously before its first await.
    fetchNextQuestion(draft);
  }, [
    draft,
    pending,
    isDone,
    isThinking,
    error,
    ageBlocked,
    enhanceOffer,
    recapText,
    identityBatch,
    fetchNextQuestion,
  ]);

  // Tracks how close to the bottom the log currently is, so a message
  // arriving while the user has scrolled up to re-read something doesn't
  // yank them back down.
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    function handleScroll() {
      const distanceFromBottom = el!.scrollHeight - el!.scrollTop - el!.clientHeight;
      isNearBottomRef.current = distanceFromBottom < 120;
    }
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [draft]);

  // Re-pins the log to the bottom after every append — the user's own
  // message, the AI's reply, and the typing indicator appearing or
  // disappearing all change scrollHeight (and, since the input area and the
  // log share a fixed-height parent, the log's own clientHeight shifts too
  // whenever quick-reply chips show up or go away) and land here.
  // useLayoutEffect (not useEffect) runs synchronously after the DOM
  // updates but before the browser paints, so the corrected position is
  // what actually gets painted — no flash of the old position followed by
  // a visible catch-up. Setting scrollTop directly (not
  // bottomRef.scrollIntoView) targets only this container, not the window,
  // and doing it instantly (not an animated "smooth" scroll) means a rapid
  // follow-up change (e.g. the chip row appearing right as a reply lands)
  // can't interrupt an in-flight animation — that's what read as a "jump."
  useLayoutEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (isNearBottomRef.current || justActedRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    justActedRef.current = false;
  }, [draft?.conversation.length, pending, isThinking, enhanceOffer, recapText, identityBatch]);

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
    setEnhanceOffer(null);
    setRecapText(null);
    setIdentityBatch(null);
    pendingRecapRef.current = null;
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

  // Selecting a rewritten option REPLACES the most recent turn's stored
  // answer; skipping keeps what the user originally typed either way. Both
  // then re-ask for the real next question with skipEnhancement so the
  // model doesn't just offer the same enhancement again for that answer.
  function handleEnhancePick(option: string) {
    if (!draft) return;
    justActedRef.current = true;
    const lastIndex = draft.conversation.length - 1;
    const updated: GuestDraft = {
      ...draft,
      conversation: draft.conversation.map((t, i) => (i === lastIndex ? { ...t, answer: option } : t)),
      updatedAt: new Date().toISOString(),
    };
    saveDraft(updated);
    setDraft(updated);
    setEnhanceOffer(null);
    fetchNextQuestion(updated, { skipEnhancement: true });
  }

  function handleEnhanceSkip() {
    if (!draft) return;
    justActedRef.current = true;
    setEnhanceOffer(null);
    fetchNextQuestion(draft, { skipEnhancement: true });
  }

  // "Nope, that's me" proceeds straight into the existing custom-question
  // step exactly as before this task (the isDone card below). The recap
  // itself is never stored as a conversation turn — it's a chat moment for
  // pacing only, not profile content.
  function handleRecapConfirm() {
    justActedRef.current = true;
    setRecapText(null);
    setIsDone(true);
  }

  // Reopens the normal composer for one more free-text answer, which feeds
  // back into the conversation like any other turn — the main "decide
  // next" effect picks up from there once `pending` clears, so the model
  // may ask one more follow-up or re-recap on its own.
  function handleRecapAddSomething() {
    justActedRef.current = true;
    setRecapText(null);
    setPending({ question: "What would you like to add?" });
  }

  // Resolves one field of the get_to_know-only optional identity batch.
  // Once every field in the batch has been handled, shows the recap that
  // was stashed alongside this same "done" response (see fetchNextQuestion).
  function resolveIdentityField(field: IdentityField, turn: DraftTurn) {
    justActedRef.current = true;
    commitTurn(turn);
    setIdentityBatch((current) => {
      const remaining = (current ?? []).filter((f) => f.key !== field.key);
      if (remaining.length === 0) {
        const stashedRecap = pendingRecapRef.current;
        pendingRecapRef.current = null;
        if (stashedRecap) setRecapText(stashedRecap);
        else setIsDone(true);
        return null;
      }
      return remaining;
    });
  }

  function handleIdentityAdd(field: IdentityField, value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    resolveIdentityField(field, { question: field.question, answer: trimmed, status: "answered" });
  }

  function handleIdentitySkip(field: IdentityField, status: "skipped_for_now" | "excluded") {
    resolveIdentityField(field, { question: field.question, answer: null, status });
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

  // Fills by story material gathered (the same "slide:" count the model
  // stops on), not by a countdown to a question number nobody reaches —
  // with turns-used as a floor so it still moves on thin answers.
  const progress = isDone
    ? 100
    : Math.min(
        Math.max(
          countSlideMaterial(draft.extractedAttributes) / SLIDE_MATERIAL_TARGET,
          draft.conversation.length / MAX_BUILDER_TURNS,
        ),
        0.95,
      ) * 100;

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

      <div className="flex h-[calc(100dvh-220px)] min-h-[560px] flex-col overflow-hidden rounded-[30px] border border-[#2A2726] bg-[#111]">
        <div className="flex items-center justify-between border-b border-[#2A2726] px-5 py-4">
          <div>
            <div className="text-[12px] text-white/50">BUILDING</div>
            <div className="text-[17px] font-black text-white">
              Building your {CONTEXT_LABEL[draft.context]} Vibecheck
            </div>
            <div className="mt-1 text-[12px] text-[#FFB1D0]">
              {isDone ? "All done" : "We'll wrap up once we've got your vibe"}
            </div>
          </div>
          <span className="rounded-full border border-[#2A2726] px-3 py-1.5 text-[12px] font-extrabold text-white/80">
            {CONTEXT_LABEL[draft.context]}
          </span>
        </div>

        <div ref={logRef} className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-5">
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

          {enhanceOffer && (
            <div className="flex flex-col gap-2">
              <AiBubble text="Want to make that a little more you?" />
              <div className="flex flex-wrap gap-2">
                {enhanceOffer.options.map((option, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleEnhancePick(option)}
                    className="max-w-full rounded-2xl border border-[#2A2726] bg-[#1F1B1A] px-3.5 py-2.5 text-left text-[13px] text-[#DDD4CC] hover:bg-[#262220]"
                  >
                    {option}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleEnhanceSkip}
                  className="rounded-full border border-[#2A2726] px-3 py-2 text-[12px] font-semibold text-white/60 hover:bg-[#1F1B1A]"
                >
                  Keep what I wrote
                </button>
              </div>
            </div>
          )}

          {identityBatch && (
            <div className="rounded-2xl border border-[#2A2726] bg-[#151313] p-4">
              <p className="text-[13px] font-semibold text-white/80">
                A few optional details you can add if you want them on your profile.
              </p>
              <div className="mt-3 flex flex-col gap-2.5">
                {identityBatch.map((field) => (
                  <IdentityFieldRow
                    key={field.key}
                    field={field}
                    onAdd={(value) => handleIdentityAdd(field, value)}
                    onSkip={() => handleIdentitySkip(field, "skipped_for_now")}
                    onDecline={() => handleIdentitySkip(field, "excluded")}
                  />
                ))}
              </div>
            </div>
          )}

          {recapText && (
            <div className="flex flex-col gap-2">
              <AiBubble text={recapText} />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleRecapAddSomething}
                  className="rounded-full border border-[#2A2726] bg-[#1F1B1A] px-3.5 py-2 text-[12px] font-semibold text-[#DDD4CC] hover:bg-[#262220]"
                >
                  Add something
                </button>
                <button
                  type="button"
                  onClick={handleRecapConfirm}
                  className="rounded-full bg-[#FF96C3] px-3.5 py-2 text-[12px] font-extrabold text-neutral-900"
                >
                  Nope, that&apos;s me →
                </button>
              </div>
            </div>
          )}

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

          <div ref={bottomRef} />
        </div>

        {!isDone && !ageBlocked && !enhanceOffer && !recapText && !identityBatch && (
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

            <div className="flex flex-col gap-2.5 sm:flex-row">
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
                className="max-h-[150px] min-h-[52px] w-full flex-1 resize-none rounded-2xl border border-[#2A2726] bg-[#181615] px-3.5 py-3 text-white transition-[height] duration-150 ease-out placeholder:text-white/30 disabled:opacity-50"
              />
              <div className="flex gap-2.5 sm:contents">
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={!pending || isThinking || !inputValue.trim()}
                  className="flex-1 rounded-[14px] bg-[#FF96C3] px-4 py-2.5 text-[14px] font-extrabold text-neutral-900 disabled:opacity-40 sm:flex-none"
                >
                  Send ↗
                </button>
                <button
                  type="button"
                  onClick={() => setSkipMenuOpen((open) => !open)}
                  disabled={!pending || isThinking}
                  className="flex-1 rounded-[14px] border border-[#2A2726] px-4 py-2.5 text-[14px] font-extrabold text-white/80 disabled:opacity-40 sm:flex-none"
                >
                  Skip
                </button>
              </div>
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

// One row of get_to_know's post-wildcard optional identity batch (see its
// spec) — a field name plus Add/Skip/Decline, tapped through quickly rather
// than as sequential forced questions. "Add" reveals a small inline input
// just for this one field instead of reusing the main composer, since
// several of these rows can be open/resolved independently in one batch.
function IdentityFieldRow({
  field,
  onAdd,
  onSkip,
  onDecline,
}: {
  field: { key: string; label: string };
  onAdd: (value: string) => void;
  onSkip: () => void;
  onDecline: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");

  if (adding) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) onAdd(value);
          }}
          placeholder={field.label}
          className="min-w-0 flex-1 rounded-xl border border-[#2A2726] bg-[#181615] px-3 py-2 text-[13px] text-white placeholder:text-white/30"
        />
        <button
          type="button"
          onClick={() => value.trim() && onAdd(value)}
          disabled={!value.trim()}
          className="shrink-0 rounded-xl bg-[#FF96C3] px-3 py-2 text-[12px] font-extrabold text-neutral-900 disabled:opacity-40"
        >
          Save
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-[13px] font-semibold text-white/70">{field.label}</span>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full border border-[#2A2726] bg-[#1F1B1A] px-2.5 py-1.5 text-[11px] font-semibold text-[#DDD4CC] hover:bg-[#262220]"
        >
          Add
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-full border border-[#2A2726] px-2.5 py-1.5 text-[11px] font-semibold text-white/60 hover:bg-[#1F1B1A]"
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="rounded-full border border-[#2A2726] px-2.5 py-1.5 text-[11px] font-semibold text-white/60 hover:bg-[#1F1B1A]"
        >
          Don&apos;t want this
        </button>
      </div>
    </div>
  );
}

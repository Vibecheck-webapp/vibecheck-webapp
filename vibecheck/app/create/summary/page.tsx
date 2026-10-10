"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { RefreshIcon } from "@/components/ui/RefreshIcon";
import {
  isAgeBlocked,
  loadDraft,
  saveDraft,
  type DraftSlide,
  type DraftSummary,
  type GuestDraft,
} from "@/lib/guest-draft";
import type { ProfileContext } from "@/lib/supabase/types";

type Status = "idle" | "loading" | "ready" | "not_enough" | "error";

interface SummaryApiResult {
  notEnough?: boolean;
  name: string | null;
  headline?: string;
  bio?: string;
  vibe_tags?: string[];
  interests?: string[];
  slides?: { question: string; answer: string; source_index: number }[];
}

// Mirrors SLIDES_MAX in summarize-profile/route.ts — the add-answer control
// can't push a draft past the same ceiling the AI-generated side respects.
const SLIDES_MAX = 5;

// A deliberate cost/usage cap on the explicit "Regenerate" control, not on
// the automatic first generation or the error-state "Try again" retry —
// see GuestDraft.regenerateCount.
const REGENERATE_MAX = 3;

// Three starting points per context for "Add an answer" — short, concrete
// prompts likely to surface something specific and shareable, plus a
// "write your own" escape hatch. Not exhaustive, just a running start.
const ADD_ANSWER_SUGGESTIONS: Record<ProfileContext, string[]> = {
  dating: [
    "What's something people are always surprised to learn about you?",
    "What's a small thing that instantly makes someone more attractive to you?",
    "What's one thing you're looking for that you won't compromise on?",
  ],
  friendship: [
    "What's something people wouldn't guess about you?",
    "What could you talk about for hours?",
    "What's one thing you really value in a friendship?",
  ],
  get_to_know: [
    "What's something very you?",
    "What could you talk about for hours?",
    "What's something people wouldn't guess about you?",
  ],
};

export default function CreateSummaryPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<GuestDraft | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // True when the failure was the API's rate-limit "busy" response — shown
  // as temporary load rather than as something broken.
  const [errorIsBusy, setErrorIsBusy] = useState(false);

  // "Add an answer" is a small inline flow, not a modal — reuses the
  // existing chip/card styles. "picking" shows the 3 suggestions + custom
  // option, "custom-question" lets them type their own question, and
  // "answering" is the final answer textarea for whichever question got
  // chosen either way.
  const [addAnswerStep, setAddAnswerStep] = useState<"closed" | "picking" | "custom-question" | "answering">(
    "closed",
  );
  const [addAnswerQuestion, setAddAnswerQuestion] = useState("");
  const [addAnswerText, setAddAnswerText] = useState("");
  // Shown only when Regenerate is clicked while summary.slides has diverged
  // from summary.generatedSlides (see hasCustomizations below).
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  // Same guard pattern as /create/photo: no draft, or a dating draft the
  // age gate blocked, never reach this page — reads the same persisted
  // flag the builder itself sets, see isAgeBlocked() in guest-draft.ts.
  useEffect(() => {
    const existing = loadDraft();
    if (!existing) {
      router.replace("/create?notice=start-first");
      return;
    }
    if (isAgeBlocked(existing)) {
      router.replace("/create?notice=age-restricted");
      return;
    }
    // Too few usable answers no longer bounces the user away — the API
    // itself reports that as a distinct "not enough" result (see
    // generateSummary below), rendered as an in-page add-answer prompt
    // instead of a redirect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(existing);
  }, [router]);

  const generateSummary = useCallback(async (current: GuestDraft) => {
    setStatus("loading");
    setErrorMessage(null);
    setErrorIsBusy(false);
    try {
      const res = await fetch("/api/summarize-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: current.context,
          conversation: current.conversation.map(({ question, answer, status: turnStatus }) => ({
            question,
            answer,
            status: turnStatus,
          })),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        if (res.status === 429 || errBody?.error === "busy") {
          setErrorIsBusy(true);
          throw new Error(errBody?.message || "Lots of people vibing right now — try again in a moment.");
        }
        throw new Error(errBody?.error || "Couldn't build your summary.");
      }
      const data = (await res.json()) as SummaryApiResult;

      // User-added slides (source_index === null) never came from the AI
      // and never get resubmitted to it — regenerating must carry them
      // forward rather than wiping them out, whether this call landed on a
      // real result or another "not enough".
      const userAdded = current.summary?.slides.filter((s) => s.source_index === null) ?? [];

      if (data.notEnough) {
        const summary: DraftSummary = {
          name: data.name,
          headline: "",
          bio: "",
          vibe_tags: [],
          interests: [],
          slides: userAdded,
          generatedSlides: userAdded,
          sourceConversation: current.conversation,
          generatedAt: new Date().toISOString(),
          notEnough: true,
        };
        const updated: GuestDraft = { ...current, summary, updatedAt: new Date().toISOString() };
        saveDraft(updated);
        setDraft(updated);
        setStatus("not_enough");
        return;
      }

      // The API already re-validates every source_index against the real
      // conversation server-side (see summarize-profile/route.ts) before
      // this ever reaches us — this lookup is just reading our own local
      // data, not re-trusting anything the network sent back.
      const apiSlides: DraftSlide[] = (data.slides ?? []).map((s) => ({
        question: s.question,
        answer: s.answer,
        originalAnswer: current.conversation[s.source_index]?.answer ?? s.answer,
        source_index: s.source_index,
      }));
      // Keep every user-added slide; trim AI slides first if the combined
      // total would exceed the shared cap.
      const roomForApiSlides = Math.max(0, SLIDES_MAX - userAdded.length);
      const slides = [...apiSlides.slice(0, roomForApiSlides), ...userAdded];

      const summary: DraftSummary = {
        name: data.name,
        headline: data.headline ?? "",
        bio: data.bio ?? "",
        vibe_tags: data.vibe_tags ?? [],
        interests: data.interests ?? [],
        slides,
        generatedSlides: slides,
        sourceConversation: current.conversation,
        generatedAt: new Date().toISOString(),
        notEnough: false,
      };
      const updated: GuestDraft = { ...current, summary, updatedAt: new Date().toISOString() };
      saveDraft(updated);
      setDraft(updated);
      setStatus("ready");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Couldn't build your summary.");
      setStatus("error");
    }
  }, []);

  // Generates once per distinct conversation: if a summary already exists
  // for the exact conversation currently on the draft, reuse it instead of
  // silently re-calling the API on every refresh — the "Regenerate" button
  // is the explicit way to ask for a fresh one.
  useEffect(() => {
    if (!draft) return;
    const needsGeneration =
      !draft.summary || JSON.stringify(draft.summary.sourceConversation) !== JSON.stringify(draft.conversation);
    if (needsGeneration) {
      // Data fetching in response to state changes — generateSummary sets
      // status synchronously before its first await.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (status !== "loading") generateSummary(draft);
    } else if (status === "idle") {
      setStatus(draft.summary?.notEnough ? "not_enough" : "ready");
    }
  }, [draft, status, generateSummary]);

  function updateSummary(patch: Partial<DraftSummary>) {
    if (!draft || !draft.summary) return;
    const updated: GuestDraft = {
      ...draft,
      summary: { ...draft.summary, ...patch },
      updatedAt: new Date().toISOString(),
    };
    saveDraft(updated);
    setDraft(updated);
  }

  function updateSlide(index: number, patch: Partial<DraftSlide>) {
    if (!draft?.summary) return;
    const slides = draft.summary.slides.map((s, i) => (i === index ? { ...s, ...patch } : s));
    updateSummary({ slides });
  }

  function removeSlide(index: number) {
    if (!draft?.summary) return;
    updateSummary({ slides: draft.summary.slides.filter((_, i) => i !== index) });
  }

  function addSlide(question: string, answer: string) {
    if (!draft?.summary) return;
    const trimmedAnswer = answer.trim();
    if (!trimmedAnswer || draft.summary.slides.length >= SLIDES_MAX) return;
    const slide: DraftSlide = {
      question,
      answer: trimmedAnswer,
      originalAnswer: trimmedAnswer,
      source_index: null,
    };
    updateSummary({ slides: [...draft.summary.slides, slide] });
  }

  function openAddAnswer() {
    setAddAnswerQuestion("");
    setAddAnswerText("");
    setAddAnswerStep("picking");
  }

  function pickSuggestedQuestion(question: string) {
    setAddAnswerQuestion(question);
    setAddAnswerStep("answering");
  }

  function startCustomQuestion() {
    setAddAnswerQuestion("");
    setAddAnswerStep("custom-question");
  }

  function confirmCustomQuestion() {
    if (!addAnswerQuestion.trim()) return;
    setAddAnswerStep("answering");
  }

  function cancelAddAnswer() {
    setAddAnswerStep("closed");
    setAddAnswerQuestion("");
    setAddAnswerText("");
  }

  function submitAddAnswer() {
    addSlide(addAnswerQuestion.trim(), addAnswerText);
    cancelAddAnswer();
  }

  function handleContinue() {
    router.push("/create/preview");
  }

  if (!draft) return null;

  const summary = draft.summary;
  const canContinue = !!summary && !!summary.name?.trim() && summary.slides.length >= 2;
  const regenerateUsesLeft = Math.max(0, REGENERATE_MAX - draft.regenerateCount);
  // Edited, added, or removed since the last generation — regenerating
  // would silently discard that, so the confirm dialog warns first. Keyed
  // on {source_index, answer} pairs in order, which catches all three
  // cases: a changed answer, a new entry (added), or a missing one
  // (removed).
  const hasCustomizations =
    !!summary &&
    JSON.stringify(summary.slides.map((s) => ({ source_index: s.source_index, answer: s.answer }))) !==
      JSON.stringify(summary.generatedSlides.map((s) => ({ source_index: s.source_index, answer: s.answer })));

  function performRegenerate() {
    const updated: GuestDraft = {
      ...draft!,
      regenerateCount: draft!.regenerateCount + 1,
      updatedAt: new Date().toISOString(),
    };
    saveDraft(updated);
    setDraft(updated);
    generateSummary(updated);
  }

  function handleRegenerateClick() {
    if (status === "loading" || regenerateUsesLeft <= 0) return;
    if (hasCustomizations) {
      setShowRegenerateConfirm(true);
    } else {
      performRegenerate();
    }
  }

  return (
    <section className="mx-auto w-full max-w-[640px] px-6 pt-12 pb-32 lg:py-16">
      <button
        type="button"
        onClick={() => router.push("/create/photo")}
        className="text-[13px] font-semibold text-white/60 hover:text-white"
      >
        ← Back
      </button>
      <h1 className="mt-3 font-inter text-[26px] font-black text-white">Review your Vibecheck</h1>
      <p className="mt-1.5 text-[14px] text-white/60">
        We turned your answers into a first draft — edit anything that doesn&apos;t sound like you.
      </p>

      {status === "loading" && !summary && (
        <Card className="mt-8 flex flex-col items-center gap-3 bg-[#111] p-10 text-center">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 animate-[typing-dot_1.2s_ease-in-out_infinite] rounded-full bg-[#FF96C3] [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-[typing-dot_1.2s_ease-in-out_infinite] rounded-full bg-[#FF96C3] [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-[typing-dot_1.2s_ease-in-out_infinite] rounded-full bg-[#FF96C3] [animation-delay:300ms]" />
          </div>
          <p className="text-[14px] text-white/70">Putting your vibe together…</p>
        </Card>
      )}

      {status === "error" && (
        <Card className={`mt-8 p-6 text-center ${errorIsBusy ? "bg-[#21181D]" : "bg-[#241416]"}`}>
          <p className={`text-[14px] ${errorIsBusy ? "text-white/80" : "text-[#FFB1B4]"}`}>{errorMessage}</p>
          <Button variant="primary" className="mt-4" onClick={() => generateSummary(draft)}>
            Try again
          </Button>
        </Card>
      )}

      {summary && (
        <>
          <Card className="mt-8 bg-[#111] p-5">
            {status === "not_enough" && (
              <p className="mb-4 text-[14px] text-white/80">
                We don&apos;t have enough yet. Add a couple of answers below.
              </p>
            )}
            <label className="block text-[12px] font-semibold text-white/50">
              Your name{" "}
              <span className="text-[#FF96C3]">
                {summary.name?.trim() ? "" : "— required"}
              </span>
            </label>
            <input
              type="text"
              value={summary.name ?? ""}
              onChange={(e) => updateSummary({ name: e.target.value })}
              placeholder="What should people call you?"
              className="mt-1.5 w-full rounded-2xl border border-[#2A2726] bg-[#181615] px-3.5 py-3 text-[15px] text-white placeholder:text-white/30"
            />

            {status !== "not_enough" && (
              <>
                <label className="mt-5 block text-[12px] font-semibold text-white/50">Headline</label>
                <input
                  type="text"
                  value={summary.headline}
                  onChange={(e) => updateSummary({ headline: e.target.value })}
                  maxLength={80}
                  className="mt-1.5 w-full rounded-2xl border border-[#2A2726] bg-[#181615] px-3.5 py-3 text-[15px] font-black text-white"
                />

                {summary.bio && <p className="mt-4 text-[13px] leading-relaxed text-white/60">{summary.bio}</p>}

                {(summary.vibe_tags.length > 0 || summary.interests.length > 0) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[...summary.vibe_tags, ...summary.interests].map((tag, i) => (
                      <span
                        key={`${tag}-${i}`}
                        className="rounded-full border border-[#2A2726] bg-[#1F1B1A] px-2.5 py-1 text-[11px] text-[#DDD4CC]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>

          {status === "ready" && summary.slides.length > 0 && summary.slides.length < 4 && (
            <p className="mt-3 text-[12px] text-white/50">
              Short answers make a short Vibecheck. Add an answer to make it richer.
            </p>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-bold text-white/70">Your slides</h2>
            <button
              type="button"
              onClick={handleRegenerateClick}
              disabled={status === "loading" || regenerateUsesLeft <= 0}
              className="flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-white/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshIcon />
              {status === "loading" ? "Regenerating…" : `Regenerate · ${regenerateUsesLeft} left`}
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-3.5">
            {summary.slides.map((slide, i) => (
              <Card key={`${slide.source_index}-${i}`} className="bg-[#111] p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[12px] font-semibold text-white/40">{slide.question}</p>
                  <button
                    type="button"
                    onClick={() => removeSlide(i)}
                    aria-label="Remove this slide"
                    className="shrink-0 text-[12px] font-semibold text-white/40 hover:text-[#FFB1B4]"
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  value={slide.answer}
                  onChange={(e) => updateSlide(i, { answer: e.target.value })}
                  rows={2}
                  className="mt-2 w-full resize-none rounded-2xl border border-[#2A2726] bg-[#181615] px-3.5 py-3 text-[14px] text-white"
                />
                {slide.answer !== slide.originalAnswer && (
                  <button
                    type="button"
                    onClick={() => updateSlide(i, { answer: slide.originalAnswer })}
                    className="mt-2 text-[12px] font-semibold text-[#FF96C3] hover:underline"
                  >
                    Use my original words
                  </button>
                )}
              </Card>
            ))}
          </div>

          <div className="mt-4">
            {addAnswerStep === "closed" ? (
              summary.slides.length < SLIDES_MAX && (
                <button
                  type="button"
                  onClick={openAddAnswer}
                  className="rounded-full border border-[#2A2726] px-3.5 py-2 text-[12px] font-semibold text-white/70 hover:bg-[#1F1B1A]"
                >
                  + Add an answer
                </button>
              )
            ) : (
              <Card className="bg-[#111] p-5">
                {addAnswerStep === "picking" && (
                  <div className="w-full max-w-full">
                    <p className="text-[12px] font-semibold text-white/50">Pick a prompt, or write your own</p>
                    <div className="mt-2.5 flex w-full flex-col gap-2">
                      {ADD_ANSWER_SUGGESTIONS[draft.context].map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => pickSuggestedQuestion(q)}
                          className="w-full rounded-2xl border border-[#2A2726] bg-[#1F1B1A] px-3.5 py-2.5 text-left text-[12px] whitespace-normal break-words text-[#DDD4CC] hover:bg-[#262220]"
                        >
                          {q}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={startCustomQuestion}
                        className="w-full rounded-2xl border border-[#2A2726] px-3.5 py-2.5 text-left text-[12px] whitespace-normal break-words text-[#DDD4CC] hover:bg-[#262220]"
                      >
                        Write your own question
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={cancelAddAnswer}
                      className="mt-3 text-[12px] font-semibold text-white/40 hover:text-white/70"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {addAnswerStep === "custom-question" && (
                  <>
                    <label className="block text-[12px] font-semibold text-white/50">Your question</label>
                    <input
                      type="text"
                      autoFocus
                      value={addAnswerQuestion}
                      onChange={(e) => setAddAnswerQuestion(e.target.value)}
                      placeholder="What do you want to answer?"
                      className="mt-1.5 w-full rounded-2xl border border-[#2A2726] bg-[#181615] px-3.5 py-3 text-[14px] text-white placeholder:text-white/30"
                    />
                    <div className="mt-3 flex gap-3">
                      <button
                        type="button"
                        onClick={cancelAddAnswer}
                        className="text-[12px] font-semibold text-white/40 hover:text-white/70"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={confirmCustomQuestion}
                        disabled={!addAnswerQuestion.trim()}
                        className="text-[12px] font-semibold text-[#FF96C3] hover:underline disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </>
                )}

                {addAnswerStep === "answering" && (
                  <>
                    <p className="text-[12px] font-semibold text-white/40">{addAnswerQuestion}</p>
                    <textarea
                      autoFocus
                      value={addAnswerText}
                      onChange={(e) => setAddAnswerText(e.target.value)}
                      rows={2}
                      placeholder="Type your answer exactly how you'd say it…"
                      className="mt-2 w-full resize-none rounded-2xl border border-[#2A2726] bg-[#181615] px-3.5 py-3 text-[14px] text-white placeholder:text-white/30"
                    />
                    <div className="mt-3 flex gap-3">
                      <button
                        type="button"
                        onClick={cancelAddAnswer}
                        className="text-[12px] font-semibold text-white/40 hover:text-white/70"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={submitAddAnswer}
                        disabled={!addAnswerText.trim()}
                        className="text-[12px] font-semibold text-[#FF96C3] hover:underline disabled:opacity-40"
                      >
                        Add
                      </button>
                    </div>
                  </>
                )}
              </Card>
            )}
          </div>

          {summary.slides.length < 2 && (
            <p className="mt-3 text-[12px] text-[#FFB1B4]">
              You need at least 2 slides to continue — add an answer above, regenerate, or stop removing.
            </p>
          )}

          {/* Desktop: primary button stays inline at the end of the page,
              not sticky. Hidden on mobile, where the fixed bar below takes
              over. */}
          <div className="mt-8 hidden lg:block">
            <Button
              variant="primary"
              onClick={handleContinue}
              disabled={!canContinue}
              className="h-[48px] w-full text-[15px]"
            >
              Looks good, continue
            </Button>
          </div>
        </>
      )}

      {/* Mobile: primary button pinned to the bottom of the viewport, with
          a fade behind it so content keeps scrolling underneath — the
          section's own pb-32 above keeps the last slide clear of it. */}
      {summary && (
        <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black via-black/90 to-transparent backdrop-blur-sm" />
          <div
            className="relative px-6 pt-3"
            style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
          >
            <Button
              variant="primary"
              onClick={handleContinue}
              disabled={!canContinue}
              className="h-[48px] w-full text-[15px]"
            >
              Looks good, continue
            </Button>
          </div>
        </div>
      )}

      {showRegenerateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="regenerate-confirm-title"
            className="w-full max-w-[380px] rounded-[22px] border border-[#2A2726] bg-[#151313] p-6 text-center"
          >
            <h2 id="regenerate-confirm-title" className="text-[18px] font-black text-white">
              Regenerate?
            </h2>
            <p className="mt-1.5 text-[13px] text-white/60">
              Regenerating replaces your edited slides. Your own added answers stay.
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <Button
                variant="primary"
                onClick={() => {
                  setShowRegenerateConfirm(false);
                  performRegenerate();
                }}
                className="h-[44px] text-[14px]"
              >
                Regenerate
              </Button>
              <Button
                variant="ghost"
                autoFocus
                onClick={() => setShowRegenerateConfirm(false)}
                className="h-[44px] text-[14px]"
              >
                Keep going
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

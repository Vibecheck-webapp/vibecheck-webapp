"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { PhotoFrame } from "@/components/viewer/PhotoFrame";
import { Button } from "@/components/ui/Button";
import { isAgeBlocked, loadDraft, saveDraft, type GuestDraft } from "@/lib/guest-draft";
import { PhotoProcessingError, processPhotoFile } from "@/lib/process-photo";

export default function CreatePhotoPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<GuestDraft | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const existing = loadDraft();
    if (!existing) {
      router.replace("/create");
      return;
    }
    // Keeps an under-18 dating draft from reaching this step by navigating
    // here directly (e.g. after the builder tab was closed and reopened) —
    // reads the same persisted flag the builder itself sets, see
    // isAgeBlocked() in guest-draft.ts.
    if (isAgeBlocked(existing)) {
      router.replace("/create");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(existing);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhotoDataUrl(existing.photoDataUrl ?? null);
  }, [router]);

  async function handleFile(file: File) {
    setError(null);
    setIsProcessing(true);
    try {
      const dataUrl = await processPhotoFile(file);
      setPhotoDataUrl(dataUrl);
    } catch (err) {
      setError(err instanceof PhotoProcessingError ? err.message : "Couldn't process that image — try again.");
    } finally {
      setIsProcessing(false);
    }
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be re-selected later
    if (file) handleFile(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function commitAndContinue(finalPhotoDataUrl: string | null) {
    if (!draft) return;
    saveDraft({ ...draft, photoDataUrl: finalPhotoDataUrl, updatedAt: new Date().toISOString() });
    // /create/summary doesn't exist yet (separate task: AI summarization,
    // preview card, auth gate) — this will 404 until that lands.
    router.push("/create/summary");
  }

  if (!draft) return null;

  const name = draft.conversation[0]?.answer || "You";

  return (
    <section className="mx-auto w-full max-w-[480px] px-6 py-12 lg:py-16">
      <h1 className="font-inter text-[26px] font-black text-white">Add your photo</h1>
      <p className="mt-1.5 text-[14px] text-white/60">
        This is the first thing people see on your Vibecheck.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`mt-6 flex flex-col items-center rounded-[24px] border p-6 transition-colors ${
          isDragging ? "border-[#FF96C3] bg-[#1A1414]" : "border-[#2A2726] bg-[#111]"
        }`}
      >
        <PhotoFrame photoUrl={photoDataUrl ?? undefined} name={name} />

        {isProcessing && <p className="mt-1 text-[13px] text-white/50">Processing photo…</p>}
        {error && <p className="mt-1 text-center text-[13px] text-[#FFB1B4]">{error}</p>}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleInputChange}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
          className="mt-4 rounded-[14px] border border-[#2A2726] px-4 py-2.5 text-[14px] font-extrabold text-white/80 hover:bg-[#1A1817] disabled:opacity-40"
        >
          {photoDataUrl ? "Change photo" : "Choose a photo"}
        </button>

        {!photoDataUrl && (
          <p className="mt-2 hidden text-center text-[12px] text-white/40 sm:block">
            Or drag a photo here
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
        <Button
          variant="primary"
          onClick={() => commitAndContinue(photoDataUrl)}
          disabled={!photoDataUrl || isProcessing}
          className="h-[48px] flex-1 text-[15px]"
        >
          Continue
        </Button>
        <Button
          variant="ghost"
          onClick={() => commitAndContinue(null)}
          disabled={isProcessing}
          className="h-[48px] flex-1 text-[15px]"
        >
          Skip for now
        </Button>
      </div>
    </section>
  );
}

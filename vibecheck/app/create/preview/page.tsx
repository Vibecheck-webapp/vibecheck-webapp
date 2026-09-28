// Stub — the preview screen (rendering the reviewed draft through
// StoryViewer, before the auth gate) is step 2 of 3 in this flow and not
// built yet. /create/summary's "Looks good, continue" already links here.
export default function CreatePreviewPage() {
  return (
    <section className="mx-auto w-full max-w-[480px] px-6 py-16 text-center">
      <h1 className="font-inter text-[22px] font-black text-white">Preview — coming soon</h1>
      <p className="mt-2 text-[14px] text-white/60">
        This step turns your reviewed answers into a shareable story. Not built yet.
      </p>
    </section>
  );
}

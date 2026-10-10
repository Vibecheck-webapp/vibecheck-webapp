import { bubbleShapeClass } from "@/components/landing/ChatSimulator";

// Exact wording — don't reword.
const CARD_CAPTION = "Roselin Harperton bio-card";
const CARD_LINK_LABEL = "vibecheck.me";

// The home page's chat simulator "sends" this in place of a real photo
// card — same photo and path as the Orla demo story (lib/story-slides.ts),
// not a separate asset.
const CARD_PHOTO_SRC = "/orla.png";

// Hand-coded replacement for the old /demo-card.svg: that asset
// letterboxed the photo inside a wide frame with white blocks on both
// sides. This crops it instead (object-cover), so the frame is filled
// edge to edge, with the card's own bubble color showing as a margin
// around the frame instead of those white blocks.
export function ChatCard() {
  return (
    <div
      className={`w-full max-w-[230px] self-end p-2.5 animate-[card-in_250ms_ease-out] min-[400px]:max-w-[260px] ${bubbleShapeClass(
        "me",
      )}`}
    >
      <div className="w-full overflow-hidden rounded-2xl" style={{ aspectRatio: "16 / 10" }}>
        {/* Plain <img>, not next/image: this is a small, fixed local asset
            and next/image's sizing machinery doesn't add anything here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={CARD_PHOTO_SRC}
          alt={CARD_CAPTION}
          className="h-full w-full object-cover"
          style={{ objectPosition: "50% 35%" }}
        />
      </div>
      <div className="mt-2 px-0.5 text-right font-inter text-neutral-900">
        <p className="text-[16px] font-bold leading-tight">{CARD_CAPTION}</p>
        <p className="mt-0.5 text-[13px] font-bold text-neutral-900/60">{CARD_LINK_LABEL}</p>
      </div>
    </div>
  );
}

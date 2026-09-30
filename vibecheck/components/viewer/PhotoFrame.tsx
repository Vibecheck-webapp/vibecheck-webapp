"use client";

import { forwardRef, useState } from "react";

// Matches the frame's own aspect-[1/1.05] class below — kept in sync here
// since the fit-mode decision needs the same ratio to compare against.
// Exported so StoryViewer's height-fitting logic (which shrinks this same
// box when the card is too short) can derive width from height without a
// second, possibly-drifting copy of the number.
export const FRAME_ASPECT_RATIO = 1 / 1.05;
const ASPECT_TOLERANCE = 0.15;

// Extracted from StoryViewer so the guest photo-upload step (app/create/photo)
// can show the same framed treatment live as the user picks a photo, instead
// of duplicating the markup and having the two drift apart. Forwards a ref
// to its own outer box so StoryViewer can measure and, only on a
// caller-shortened card, imperatively cap its width (height follows via the
// aspect-ratio) when the normal width-driven size would overflow.
export const PhotoFrame = forwardRef<HTMLDivElement, { photoUrl?: string; name: string }>(
  function PhotoFrame({ photoUrl, name }, ref) {
    // object-cover crops a photo to fill the frame regardless of its own
    // shape — fine when the photo is already close to the frame's ratio
    // (Orla's demo photo is, within ~4%, so this never touches it), but it
    // crops hard on a full-body or wide shot, cutting off heads or
    // shoulders. Checked once the photo's real dimensions are known (onLoad,
    // not derivable from the data URL itself) and switched to
    // object-contain — full photo visible, letterboxed against the frame's
    // own #111 background — whenever it's off by more than 15%.
    const [fitMode, setFitMode] = useState<"cover" | "contain">("cover");

    function handlePhotoLoad(e: React.SyntheticEvent<HTMLImageElement>) {
      const img = e.currentTarget;
      if (!img.naturalWidth || !img.naturalHeight) return;
      const photoRatio = img.naturalWidth / img.naturalHeight;
      const offBy = Math.abs(photoRatio - FRAME_ASPECT_RATIO) / FRAME_ASPECT_RATIO;
      setFitMode(offBy <= ASPECT_TOLERANCE ? "cover" : "contain");
    }

    return (
      <div
        ref={ref}
        className="relative mx-auto my-1 aspect-[1/1.05] w-[72%] min-w-[190px] max-w-[280px] animate-[frame-float_5s_ease-in-out_infinite] sm:my-1.5 sm:w-[78%] sm:min-w-[230px] sm:max-w-[320px]"
      >
        <div className="h-full w-full animate-[frame-in_450ms_cubic-bezier(0.22,1,0.36,1)] rounded-[18px] border border-white/15 bg-[#111] p-[10px] shadow-[0_18px_40px_rgba(0,0,0,0.55)] sm:rounded-[22px] sm:p-[12px]">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={name}
              onLoad={handlePhotoLoad}
              className={`block h-full w-full rounded-[12px] sm:rounded-[14px] ${
                fitMode === "cover" ? "object-cover" : "object-contain"
              }`}
            />
          ) : (
            <div className="h-full w-full rounded-[12px] bg-white/10 sm:rounded-[14px]" />
          )}
        </div>
        <span
          className="absolute -top-[13px] -right-[8px] animate-[wave_2.4s_ease-in-out_infinite] text-[21px] drop-shadow-[0_6px_5px_rgba(0,0,0,0.5)] sm:-top-[16px] sm:-right-[10px] sm:text-[26px]"
          style={{ transformOrigin: "70% 70%" }}
          aria-hidden="true"
        >
          👋🏽
        </span>
        <span
          className="absolute -bottom-[10px] -left-[8px] animate-[frame-in_550ms_cubic-bezier(0.22,1,0.36,1)] text-[22px] drop-shadow-[0_6px_5px_rgba(0,0,0,0.5)] sm:-bottom-[12px] sm:-left-[10px] sm:text-[28px]"
          aria-hidden="true"
        >
          😊
        </span>
      </div>
    );
  },
);

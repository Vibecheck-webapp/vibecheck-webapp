// Extracted from StoryViewer so the guest photo-upload step (app/create/photo)
// can show the same framed treatment live as the user picks a photo, instead
// of duplicating the markup and having the two drift apart.
export function PhotoFrame({ photoUrl, name }: { photoUrl?: string; name: string }) {
  return (
    <div className="relative mx-auto my-3 aspect-[1/1.05] w-[72%] min-w-[190px] max-w-[280px] animate-[frame-float_5s_ease-in-out_infinite] sm:my-4 sm:w-[78%] sm:min-w-[230px] sm:max-w-[320px]">
      <div className="h-full w-full animate-[frame-in_450ms_cubic-bezier(0.22,1,0.36,1)] rounded-[18px] border border-white/15 bg-[#111] p-[10px] shadow-[0_18px_40px_rgba(0,0,0,0.55)] sm:rounded-[22px] sm:p-[12px]">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={name}
            className="block h-full w-full rounded-[12px] object-contain sm:rounded-[14px]"
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
}

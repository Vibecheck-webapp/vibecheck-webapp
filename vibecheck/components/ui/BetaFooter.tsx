// The "Made by Sogie / Vibecheck Beta" badge shown at the bottom of every
// screen in the prototype — shared so it stays identical wherever it's used.
export function BetaFooter() {
  return (
    <div className="flex flex-col items-center gap-2 pt-20 pb-1">
      <p className="font-inter text-[14px] leading-[100%] font-semibold tracking-normal text-[#716B67]">
        Made by Sogie
      </p>
      <div className="flex h-[27.7px] w-[147px] items-center justify-center rounded-full border border-[#DEB00A] bg-[#E6E8A8]/20 pt-1 pr-[8.71px] pb-[4.72px] pl-[8.71px]">
        <span className="font-inter text-[12px] font-medium text-white">Vibecheck Beta 👷🏻</span>
      </div>
    </div>
  );
}

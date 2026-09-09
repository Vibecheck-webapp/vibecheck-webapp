import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-[#FF96C3] text-neutral-900 hover:bg-[#FFA9CE]",
  secondary: "border border-[#2A2726] bg-transparent text-white hover:bg-[#1A1817]",
  ghost: "border border-[#2A2726] bg-transparent text-white/80 hover:bg-[#1A1817]",
  danger: "border border-[#593438] bg-transparent text-[#FFB1B4] hover:bg-[#241416]",
};

// Size controls padding/font-size only, kept separate from variant so a
// caller's own className additions (margins, width) never collide with a
// utility already baked into these strings.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-2 text-[12px]",
  md: "px-4 py-2.5 text-[14px]",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-[14px] font-inter font-extrabold tracking-normal transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}

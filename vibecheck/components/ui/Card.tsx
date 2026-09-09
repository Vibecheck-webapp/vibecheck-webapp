import type { HTMLAttributes } from "react";

// No default background or padding — every call site sets its own via
// className, so overriding either never collides with a class already
// baked in here (Tailwind can't guarantee "last class wins" for utilities
// of the same kind).
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-[22px] border border-[#2A2726] ${className}`} {...props} />;
}

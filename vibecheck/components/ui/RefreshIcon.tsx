// Small "regenerate" icon next to /create/summary's Regenerate control.
// stroke="currentColor" so it always matches whatever text color the
// button around it uses, rather than a hardcoded color like
// ArrowLeftIcon's that would need to be picked separately for every
// context it's reused in.
export function RefreshIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M3 12a9 9 0 0 1 15-6.7M21 12a9 9 0 0 1-15 6.7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="17.5 3.5 17.5 8.5 12.5 8.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="6.5 20.5 6.5 15.5 11.5 15.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

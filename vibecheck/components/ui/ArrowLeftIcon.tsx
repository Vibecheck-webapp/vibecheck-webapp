// Shared back arrow — the picker's "Back" link and the builder's "change
// vibe" button use the same icon so the two read as one pattern.
export function ArrowLeftIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <line x1="20.25" y1="12" x2="3.75" y2="12" stroke="#FFFDF9" strokeWidth="1.5" strokeLinecap="round" />
      <polyline
        points="10.5 5.25 3.75 12 10.5 18.75"
        stroke="#FFFDF9"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

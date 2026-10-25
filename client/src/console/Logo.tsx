export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true" className="text-primary">
        <rect width="28" height="28" rx="7" fill="currentColor" fillOpacity="0.12" />
        <path d="M7 14h4l2-5 3 10 2-5h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="21" cy="8" r="2" fill="currentColor" />
      </svg>
      <div>
        <span className="font-semibold text-sm">PropAI</span>
        <span className="text-muted-foreground text-sm"> · Code Alchemist Labs</span>
      </div>
    </div>
  );
}

/** Dual CDJ + center mixer — wide 2:1 mark for Auto DJ header/compact controls. */
export default function DjIcon({
  className,
  preserveAspectRatio = 'xMidYMid meet',
}: {
  className?: string
  preserveAspectRatio?: string
}) {
  return (
    <svg
      viewBox="0 0 48 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      preserveAspectRatio={preserveAspectRatio}
      aria-hidden="true"
    >
      {/* Left CDJ */}
      <rect x="1.5" y="4" width="14" height="16" rx="2" />
      <circle cx="8.5" cy="12" r="5.2" />
      <circle cx="8.5" cy="12" r="3.2" />
      <circle cx="8.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      {/* Mixer */}
      <rect x="18.5" y="3.5" width="11" height="17" rx="1.5" />
      <path d="M21 7.5v8M24 7.5v8M27 7.5v8" />
      <path d="M20.5 18.5h7" />
      {/* Right CDJ */}
      <rect x="32.5" y="4" width="14" height="16" rx="2" />
      <circle cx="39.5" cy="12" r="5.2" />
      <circle cx="39.5" cy="12" r="3.2" />
      <circle cx="39.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

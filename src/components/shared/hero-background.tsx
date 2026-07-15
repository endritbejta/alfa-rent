/**
 * Layered premium hero backdrop — pure CSS/SVG, no external asset.
 * A near-black base, a soft red glow, a faint vignette that keeps the
 * headline and search bar legible, and a low-opacity car silhouette
 * fading into the dark on the right.
 */
export function HeroBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Base + red glow top-right */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_85%_-10%,rgba(220,32,40,0.18),transparent_45%),radial-gradient(90%_90%_at_0%_100%,rgba(255,255,255,0.04),transparent_50%)]" />
      {/* Contrast vignette — darkens toward the content (left/bottom) */}
      <div className="absolute inset-0 bg-[radial-gradient(100%_100%_at_20%_35%,transparent_0%,rgba(8,7,7,0.55)_70%,rgba(8,7,7,0.9)_100%)]" />
      {/* Car silhouette, fading left-to-transparent */}
      <svg
        viewBox="0 0 800 300"
        className="absolute right-0 bottom-0 h-[70%] w-auto [mask-image:linear-gradient(to_left,black_30%,transparent_85%)] text-white/[0.05]"
        preserveAspectRatio="xMaxYMax meet"
        fill="currentColor"
      >
        <path d="M60 210c0-14 10-24 24-24s24 10 24 24h520c0-14 10-24 24-24s24 10 24 24h40c8 0 14-6 14-14v-30c0-16-10-30-26-35l-120-36c-10-3-18-9-26-16l-58-52c-16-14-36-22-58-22H286c-26 0-50 12-66 32l-40 50-92 20c-22 5-38 24-38 47v22c0 8 6 14 14 14h-4z" />
        <circle cx="84" cy="212" r="30" className="text-white/[0.06]" />
        <circle cx="628" cy="212" r="30" className="text-white/[0.06]" />
      </svg>
    </div>
  );
}

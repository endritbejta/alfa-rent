/**
 * Hero backdrop — pure CSS, no external asset: a near-black base, a soft
 * red glow and a vignette that keeps the headline and search legible. The
 * real vehicles are the featured cards that overlap the hero's lower edge;
 * a drawn silhouette competed with them.
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
    </div>
  );
}

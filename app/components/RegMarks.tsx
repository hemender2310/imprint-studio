/**
 * Four registration crosshairs at the corners of a content column. These replace horizontal
 * rules as the section divider throughout the site.
 *
 * The crosshair must extend past the circle on all four sides — that overhang is what makes
 * it a printer's registration mark rather than a target reticle.
 */
export function RegMark({
  size = 12,
  color = 'rgba(23,21,15,0.2)',
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="presentation"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="7" stroke={color} strokeWidth="1.4" />
      <line x1="12" y1="0.5" x2="12" y2="23.5" stroke={color} strokeWidth="1.4" />
      <line x1="0.5" y1="12" x2="23.5" y2="12" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}

/**
 * `inset` is positive by design: a negative inset puts the marks outside the content
 * column, and on mobile the column is the full viewport, so they push the page wider
 * than the screen.
 */
export default function RegMarks({
  inset = 6,
  size = 12,
  color = 'rgba(23,21,15,0.2)',
}: {
  inset?: number;
  size?: number;
  color?: string;
}) {
  const corners = [
    { top: inset, left: inset },
    { top: inset, right: inset },
    { bottom: inset, left: inset },
    { bottom: inset, right: inset },
  ];
  return (
    <>
      {corners.map((pos, i) => (
        <span
          key={i}
          role="presentation"
          aria-hidden="true"
          style={{ position: 'absolute', lineHeight: 0, ...pos }}
        >
          <RegMark size={size} color={color} />
        </span>
      ))}
    </>
  );
}

// The Spreadless mark: two fine bows that sweep the full width, running level and
// nearly touching at the centre — a bright horizontal seam — then flaring apart to
// the edges. That's the spread narrowing to zero. Only one bow-half is drawn (the
// top-left quadrant); the other three are that same path mirrored across the
// horizontal and vertical centre lines, so the whole mark is one curve.
//
// Colour is theme-driven, not hard-coded: the "currentColor" half inherits the
// surrounding text colour (black on light, white on dark), which keeps the mark
// in step with the monochrome design language. The one exception is the gold —
// the brand's signature split — which is opt-in via `variant="split"`.

// One bow-half, from a needle tip at the outer edge to a blunt end at the centre
// (the `L` is that flat end, where gold butts against ink to continue the bow).
// Two weights: `regular` is the delicate brand mark; `bold` keeps the identical
// silhouette but thickens the stroke so it survives at header / favicon sizes,
// where the hairline of `regular` would all but vanish.
const BLADE = {
  regular: "M20,18C120,66 260,87 340,89L340,93C260,91 120,72 20,18Z",
  bold: "M16,14C120,60 250,82 340,86L340,95C250,96 120,74 16,14Z",
};
const GOLD = "#C79A3E";

// viewBox is 680×200 (a wide ~3.4:1 mark); the wordmark lockup adds height below.
const MARK_W = 680;
const MARK_H = 200;

type Variant = "split" | "mono" | "gold";
type Weight = "regular" | "bold";

interface LogoProps {
  variant?: Variant;
  /** Stroke weight — `bold` for small sizes (header, favicon). */
  weight?: Weight;
  /** Rendered height of the mark in px. Width follows the 3.4:1 ratio. */
  height?: number;
  /** Show the "SPREADLESS" wordmark beneath the mark (vertical lockup). */
  wordmark?: boolean;
  className?: string;
  title?: string;
}

function Blades({ variant, weight }: { variant: Variant; weight: Weight }) {
  // Left pair (top-left + its vertical mirror) and right pair (horizontal
  // mirrors of the left). In "split" the left pair is gold and the right pair
  // takes the text colour; the other variants paint all four the same.
  const d = BLADE[weight];
  const leftFill = variant === "gold" ? GOLD : variant === "split" ? GOLD : "currentColor";
  const rightFill = variant === "gold" ? GOLD : "currentColor";
  return (
    <>
      <g fill={leftFill}>
        <path d={d} />
        <path d={d} transform={`matrix(1 0 0 -1 0 ${MARK_H})`} />
      </g>
      <g fill={rightFill}>
        <path d={d} transform={`matrix(-1 0 0 1 ${MARK_W} 0)`} />
        <path d={d} transform={`matrix(-1 0 0 -1 ${MARK_W} ${MARK_H})`} />
      </g>
    </>
  );
}

export default function Logo({
  variant = "mono",
  weight = "regular",
  height = 26,
  wordmark = false,
  className,
  title = "Spreadless",
}: LogoProps) {
  if (!wordmark) {
    const width = (height * MARK_W) / MARK_H;
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${MARK_W} ${MARK_H}`}
        className={className}
        role="img"
        aria-label={title}
      >
        <Blades variant={variant} weight={weight} />
      </svg>
    );
  }

  // Vertical lockup: mark on top, wide-tracked wordmark below.
  const totalH = MARK_H + 130;
  const width = (height * MARK_W) / MARK_H;
  return (
    <svg
      width={width}
      height={(height * totalH) / MARK_H}
      viewBox={`0 0 ${MARK_W} ${totalH}`}
      className={className}
      role="img"
      aria-label={title}
    >
      <Blades variant={variant} weight={weight} />
      <text
        x={MARK_W / 2}
        y={totalH - 26}
        textAnchor="middle"
        fill="currentColor"
        style={{ font: "300 62px system-ui, sans-serif", letterSpacing: "0.34em" }}
        // The tracking pushes the visual centre right by half a letter-space;
        // nudge the anchor so the word stays optically centred under the mark.
        dx="0.17em"
      >
        SPREADLESS
      </text>
    </svg>
  );
}

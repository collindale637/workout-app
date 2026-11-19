/**
 * The Reps logo: an italic cobalt "gym tag" with four tally notches, a gold slash and the REPS wordmark.
 * The wordmark is Barlow Condensed Black Italic converted to outlines, so it looks the same without the font loaded.
 * Source files: public/icons/reps-logo.svg and public/icons/reps-mark.svg (regenerate both together if this changes).
 */
const COBALT = "#1F4BFF";
const GOLD = "#FFC533";
const WORD = "M141.4 79 138.5 59.3Q138.5 59 138.2 59Q137.8 59 137.8 59.4L134.8 78.8Q134.7 79.4 134.2 79.7Q133.8 80 133.2 80H118Q117.4 80 117 79.7Q116.7 79.4 116.8 78.8L124.9 26.6Q125 26 125.4 25.7Q125.9 25.4 126.5 25.4H148.1Q156 25.4 160.6 29.4Q165.2 33.4 165.2 39.9Q165.2 41.8 165 42.8Q164.3 47.1 161.9 50.5Q159.6 53.9 155.8 56Q155.3 56.2 155.5 56.5L159.8 78.7V79Q159.8 79.5 159.4 79.7Q159 80 158.4 80H142.8Q141.6 80 141.4 79ZM141.6 38Q141.1 38 141.1 38.3L139.6 47.5Q139.6 47.9 140.1 47.9H141.4Q143.8 47.9 145.4 46.2Q147 44.6 147 41.7Q147 39.9 145.9 38.9Q144.8 38 143 38ZM206.9 38H188.5Q188 38 188 38.3L186.8 46Q186.6 46.4 187.2 46.4H196.8Q197.5 46.4 197.8 46.7Q198.2 47 198.1 47.6L196.5 57.8Q196.2 58.9 194.8 58.9H185.3Q184.8 58.9 184.8 59.3L183.6 67.1Q183.4 67.4 184 67.4H202.3Q203 67.4 203.4 67.8Q203.7 68.1 203.6 68.6L202 78.8Q201.9 79.4 201.5 79.7Q201.1 80 200.4 80H164.9Q164.3 80 164 79.7Q163.6 79.4 163.7 78.8L171.8 26.6Q171.9 26 172.4 25.7Q172.8 25.4 173.4 25.4H208.9Q209.6 25.4 209.9 25.7Q210.2 26 210.1 26.6L208.6 36.8Q208.5 37.3 208 37.6Q207.6 38 206.9 38ZM254.5 40.1Q254.5 41.9 254.3 43Q253.5 47.9 250.6 51.8Q247.7 55.6 243.1 57.7Q238.5 59.7 233 59.7H227.5Q227 59.7 227 60.1L224.1 78.8Q224 79.4 223.5 79.7Q223.1 80 222.5 80H207.3Q206.7 80 206.3 79.7Q206 79.4 206.1 78.8L214.2 26.6Q214.3 26 214.7 25.7Q215.2 25.4 215.8 25.4H237.4Q245.3 25.4 249.9 29.4Q254.5 33.4 254.5 40.1ZM236.2 43.3Q236.3 42.8 236.3 41.9Q236.3 40 235.2 39Q234.2 38 232.3 38H230.9Q230.4 38 230.4 38.3L228.9 48Q228.7 48.4 229.3 48.4H230.6Q232.8 48.4 234.3 47.1Q235.8 45.8 236.2 43.3ZM253.8 67.9Q253.8 67.4 254 66L254.4 63.5Q254.5 63 255 62.7Q255.4 62.4 256 62.4H271Q271.6 62.4 271.9 62.7Q272.3 63 272.2 63.5L272 65.3Q271.8 66.5 272.4 67.3Q273 68.1 274.2 68.1Q275.5 68.1 276.3 67.2Q277.2 66.3 277.2 65.1Q277.2 63.9 275.8 62.7Q274.4 61.4 270.3 58.9Q266.4 56.3 263.8 54.3Q261.2 52.3 259.3 49.4Q257.5 46.5 257.5 42.7Q257.5 42 257.7 40.3Q258.8 33.4 265 29.1Q271.2 24.8 280.5 24.8Q289 24.8 293.9 28.4Q298.8 32 298.8 38Q298.8 38.7 298.6 40.3L298.3 42Q298.2 42.6 297.7 42.9Q297.3 43.2 296.7 43.2H281.8Q281.2 43.2 280.8 42.9Q280.5 42.6 280.6 42L280.9 40Q281 38.8 280.3 38.1Q279.7 37.3 278.5 37.3Q277.1 37.3 276.2 38.3Q275.4 39.2 275.4 40.8Q275.4 42.1 276.7 43.5Q278.1 44.9 281.9 47.4Q286.9 50.8 289.6 52.8Q292.2 54.9 293.8 57.3Q295.3 59.8 295.3 62.9Q295.3 63.5 295.1 65.1Q293.9 72.2 287.7 76.4Q281.4 80.6 272.2 80.6Q263.7 80.6 258.8 77.2Q253.8 73.7 253.8 67.9Z";

function Tally({ y1, y2, slash }: { y1: number; y2: number; slash: [number, number, number, number] }) {
  const lean = ((y2 - y1) * 0.21) / 2;
  const [x1, sy1, x2, sy2] = slash;
  return (
    <>
      {[30, 44, 58, 72].map((x) => (
        <line key={x} x1={x + lean} y1={y1} x2={x - lean} y2={y2} stroke="#fff" strokeWidth={7} strokeLinecap="round" />
      ))}
      <line x1={x1} y1={sy1} x2={x2} y2={sy2} stroke={COBALT} strokeWidth={14} strokeLinecap="round" />
      <line x1={x1} y1={sy1} x2={x2} y2={sy2} stroke={GOLD} strokeWidth={6} strokeLinecap="round" />
    </>
  );
}

/** Full lockup (tag + REPS). Width follows height at 3.3 : 1. */
export function RepsLogo({ height = 40, className }: { height?: number; className?: string }) {
  return (
    <svg viewBox="0 0 330 100" height={height} width={height * 3.3} className={className} role="img" aria-label="Reps">
      <path d="M26 8H322Q330 8 328 16L306 86Q304 92 296 92H8Q0 92 2 84L24 14Q26 8 34 8Z" fill={COBALT} />
      <Tally y1={28} y2={72} slash={[18, 64, 86, 36]} />
      <line x1="106" y1="22" x2="96" y2="78" stroke="#fff" strokeOpacity=".35" strokeWidth="2" />
      <path d={WORD} fill="#fff" />
    </svg>
  );
}

/** The tag on its own (square), for small spots. */
export function RepsMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} role="img" aria-label="Reps">
      <path d="M24 14H92Q98 14 96 20L80 82Q78 86 72 86H8Q2 86 4 80L20 18Q22 14 28 14Z" fill={COBALT} />
      <Tally y1={30} y2={70} slash={[18, 64, 84, 36]} />
    </svg>
  );
}

import type { LatencyPoint } from "@/lib/sites-data";

interface Props {
  data: LatencyPoint[];
  height?: number;
  color?: "phosphor" | "amber" | "alert";
  showAxis?: boolean;
}

export function LatencySparkline({
  data,
  height = 80,
  color = "phosphor",
  showAxis = false,
}: Props) {
  if (data.length === 0) return null;

  const width = 100; // viewBox width, scales fluidly
  const max = Math.max(1, ...data.map((d) => d.ms));
  const min = 0;
  const range = max - min || 1;

  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1 || 1)) * width;
      const y = height - ((d.ms - min) / range) * (height - 4) - 2;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  const stroke =
    color === "alert" ? "var(--alert)" : color === "amber" ? "var(--amber)" : "var(--phosphor)";

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`grad-${color}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill={`url(#grad-${color})`} />
        <polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {showAxis && (
        <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-widest text-dim">
          <span>{Math.round(max)}ms peak</span>
          <span>{Math.round(data[data.length - 1].ms)}ms now</span>
        </div>
      )}
    </div>
  );
}

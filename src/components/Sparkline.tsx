import type { SVGProps } from "react";

export type SparklineProps = {
  series: number[];
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, "children">;

export function Sparkline({ series, className, ...props }: SparklineProps) {
  if (series.length < 2) {
    return null;
  }

  const width = 120;
  const height = 36;
  const padding = 4;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const step = (width - padding * 2) / (series.length - 1);

  // Normalize points into a compact SVG polyline for quick visual trend cues.
  const path = series
    .map((value, index) => {
      const x = padding + index * step;
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-hidden="true"
      {...props}
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={path}
      />
    </svg>
  );
}

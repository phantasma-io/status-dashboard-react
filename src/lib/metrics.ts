export type DeltaTone = "neutral" | "success" | "warning" | "danger";
export type DelayTone = "neutral" | "warning" | "danger";

const heightFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export function formatHeight(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return heightFormatter.format(value);
}

export function formatDelta(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return `Δ ${heightFormatter.format(value)}`;
}

export function formatNumberString(value: string | null): string {
  if (!value) {
    return "—";
  }
  // Format large numeric strings without losing precision in Number/BigInt conversions.
  const [rawInt, rawFrac] = value.split(".");
  const sign = rawInt.startsWith("-") ? "-" : "";
  const intPart = sign ? rawInt.slice(1) : rawInt;
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}${rawFrac ? `.${rawFrac}` : ""}`;
}

export function formatNumberStringWhole(value: string | null): string {
  if (!value) {
    return "—";
  }
  const [rawInt] = value.split(".");
  return formatNumberString(rawInt);
}

export function computeDelta(height: number | null, maxHeight: number | null): number | null {
  if (height === null || maxHeight === null) {
    return null;
  }
  return Math.max(0, maxHeight - height);
}

export function getDeltaTone(delta: number | null): DeltaTone {
  if (delta === null) {
    return "neutral";
  }
  if (delta === 0) {
    return "success";
  }
  if (delta <= 10) {
    return "warning";
  }
  return "danger";
}

export function formatSeconds(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return formatDurationSeconds(value);
}

export function formatMilliseconds(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return formatDurationSeconds(value / 1000);
}

export function getDelayToneSeconds(value: number | null): DelayTone {
  if (value === null) {
    return "neutral";
  }
  if (value >= 3600) {
    return "danger";
  }
  if (value >= 60) {
    return "warning";
  }
  return "neutral";
}

function formatDurationSeconds(value: number): string {
  // Render a compact duration string (s/m/h/d/w) for large delays.
  const abs = Math.abs(value);
  const unit =
    abs < 60
      ? { div: 1, suffix: "s" }
      : abs < 3600
        ? { div: 60, suffix: "m" }
        : abs < 86400
          ? { div: 3600, suffix: "h" }
          : abs < 604800
            ? { div: 86400, suffix: "d" }
            : { div: 604800, suffix: "w" };

  const scaled = value / unit.div;
  const precision = Math.abs(scaled) < 10 ? 1 : 0;
  return `${scaled.toFixed(precision)}${unit.suffix}`;
}

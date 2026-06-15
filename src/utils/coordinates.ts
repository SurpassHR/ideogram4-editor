export function norm(val: number, max: number): number {
  return Math.min(1000, Math.max(0, Math.round((val / max) * 1000)));
}

export function denorm(val: number, max: number): number {
  return (val / 1000) * max;
}
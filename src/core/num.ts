/** Positive modulo. `mod(-1, 4) === 3`. */
export function mod(n: number, m: number): number {
  if (!(m > 0)) {
    throw new Error("modulus must be positive");
  }
  return ((n % m) + m) % m;
}

export function assertSafeInt(n: number, label: string): void {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`${label} is outside the safe integer range (±2^53)`);
  }
}

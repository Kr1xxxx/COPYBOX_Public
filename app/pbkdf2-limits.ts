// Every encrypted record and backup file names its own PBKDF2 count. A file someone made up could ask for billions of
// rounds and freeze the app while it "tries the password", so counts outside this range are refused before any work.
// Copyboxx itself only ever writes 210 000, 310 000 or 600 000.
export const MIN_ITERATIONS = 100_000;
export const MAX_ITERATIONS = 5_000_000;

/** A count read from a file the user picked: within the range Copyboxx writes. */
export function isSaneIterationCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_ITERATIONS && value <= MAX_ITERATIONS;
}

/** Last line of defence where a key is worked out: never more than MAX_ITERATIONS rounds, whatever the record says. */
export function assertIterationCap(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_ITERATIONS) {
    throw new Error("加密数据已损坏");
  }
}

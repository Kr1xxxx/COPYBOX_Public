// Password helper for 账号密码 in the 保险箱: a random password that always has all four kinds of characters.

const LOWER = "abcdefghijkmnopqrstuvwxyz"; // no l
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I, O
const DIGITS = "23456789"; // no 0, 1
const SYMBOLS = "!@#$%^&*-_=+?";

function pick(chars: string, random: (max: number) => number) {
  return chars.charAt(random(chars.length));
}

function cryptoRandom(max: number): number {
  // Rejection sampling so every character is equally likely.
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer); while (buffer[0] >= limit);
  return buffer[0] % max;
}

export function generatePassword(length = 16, random: (max: number) => number = cryptoRandom): string {
  const size = Math.min(64, Math.max(8, Math.floor(length)));
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const chars = [pick(LOWER, random), pick(UPPER, random), pick(DIGITS, random), pick(SYMBOLS, random)];
  while (chars.length < size) chars.push(pick(all, random));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function hasEdgeSpace(value: string): boolean {
  return value !== value.trim();
}

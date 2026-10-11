// 恢复码: backup codes a website gives out once. Pure functions.
export const RECOVERY_MAX_CODES = 50;
export const RECOVERY_CODE_MAX = 80;

// One code per line (commas and spaces between codes also work). Duplicates are dropped, order is kept.
export function parseRecoveryCodes(text: string): string[] {
  const seen = new Set<string>();
  const codes: string[] = [];
  for (const line of text.split(/[\r\n,;，；]+/)) {
    const code = line.trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }
  return codes;
}

export function recoveryProblem(codes: string[]): string {
  if (codes.length === 0) return "请粘贴恢复码，一行一个";
  if (codes.length > RECOVERY_MAX_CODES) return `最多 ${RECOVERY_MAX_CODES} 个恢复码`;
  if (codes.some((code) => Array.from(code).length > RECOVERY_CODE_MAX)) return "有一行太长了，看起来不是恢复码";
  return "";
}

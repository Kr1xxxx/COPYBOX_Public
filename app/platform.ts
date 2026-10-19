// Both platforms have the 账号 page. Only the Mac also has the old 秘密 list inside it (其他, folders, masked copy, references);
// PLAIN_NOTES = no old list, so Windows shows the new account types only.
export const PLAIN_NOTES = typeof window === "undefined" || window.clipboxDesktop?.platform !== "darwin";
export const SECRET_WORD = "账号";
// 账号 kinds this platform has no category for (D-038: Windows has no API 密钥, 恢复码 or 其他); nothing of these kinds is
// offered, seeded as a 范例 or listed as a category there.
export const HIDDEN_ACCOUNT_KINDS: string[] = PLAIN_NOTES ? ["other", "apikey", "recovery"] : [];

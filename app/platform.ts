// Both platforms have the 账号 page. Only the Mac also has the old 秘密 list inside it (其他, folders, masked copy, references);
// PLAIN_NOTES = no old list, so Windows shows the new account types only.
export const PLAIN_NOTES = typeof window === "undefined" || window.clipboxDesktop?.platform !== "darwin";
export const SECRET_WORD = "账号";

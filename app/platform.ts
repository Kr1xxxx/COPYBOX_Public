// Windows shows this section as 备注; darwin calls it 账号 (it was 秘密).
// Windows has no password-style masking or reference links: 备注 is a plain notes list.
export const PLAIN_NOTES = typeof window === "undefined" || window.clipboxDesktop?.platform !== "darwin";
export const SECRET_WORD = typeof window !== "undefined" && window.clipboxDesktop?.platform === "darwin" ? "账号" : "备注";

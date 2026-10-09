// Windows shows this section as 备注; darwin keeps the original 秘密 wording.
// Windows has no password-style masking or reference links: 备注 is a plain notes list.
export const PLAIN_NOTES = typeof window === "undefined" || window.clipboxDesktop?.platform !== "darwin";
export const SECRET_WORD = typeof window !== "undefined" && window.clipboxDesktop?.platform === "darwin" ? "秘密" : "备注";

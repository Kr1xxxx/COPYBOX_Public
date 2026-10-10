// Turns a number from a spreadsheet cell into the text Excel shows for it, given the cell's number format
// (001 for format 000, 50% for 0.5 with 0%, 1,234.50, 2023-03-15, ...). Covers the common formats; anything it does
// not understand falls back to Excel's "General" look, so a number is never lost or garbled.

const BUILTIN_FORMATS: Record<number, string> = {
  1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 9: "0%", 10: "0.00%",
  14: "m/d/yy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy", 18: "h:mm AM/PM", 19: "h:mm:ss AM/PM",
  20: "h:mm", 21: "h:mm:ss", 22: "m/d/yy h:mm", 37: "#,##0;(#,##0)", 38: "#,##0;(#,##0)",
  39: "#,##0.00;(#,##0.00)", 40: "#,##0.00;(#,##0.00)", 45: "mm:ss", 46: "[h]:mm:ss",
  // Chinese-locale date and time formats (Excel shows these for ids the file does not define itself)
  27: 'yyyy"年"m"月"', 28: 'm"月"d"日"', 29: 'm"月"d"日"', 30: "m/d/yy", 31: 'yyyy"年"m"月"d"日"',
  32: 'h"时"mm"分"', 33: 'h"时"mm"分"ss"秒"', 34: '上午/下午h"时"mm"分"', 35: '上午/下午h"时"mm"分"ss"秒"',
  36: 'yyyy"年"m"月"', 50: 'yyyy"年"m"月"', 51: 'm"月"d"日"', 52: 'yyyy"年"m"月"', 53: 'm"月"d"日"',
  54: 'm"月"d"日"', 55: '上午/下午h"时"mm"分"', 56: '上午/下午h"时"mm"分"ss"秒"', 57: 'yyyy"年"m"月"', 58: 'm"月"d"日"',
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatGeneral(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return String(Number(value.toPrecision(15)));
}

/** Format code for a numFmtId, from the workbook's custom formats first. */
export function formatCodeFor(numFmtId: number, custom: Map<number, string>): string {
  return custom.get(numFmtId) ?? BUILTIN_FORMATS[numFmtId] ?? "General";
}

// Replace quoted text, escaped characters and [..] parts by neutral markers so the rest can be scanned safely.
function tokenizeLiterals(code: string): { text: string; literals: string[] } {
  const literals: string[] = [];
  const keep = (literal: string) => { literals.push(literal); return String.fromCharCode(0xE100 + literals.length - 1); };
  const text = code
    .replace(/"([^"]*)"/g, (_, inner: string) => keep(inner))
    .replace(/\\(.)/g, (_, char: string) => keep(char))
    .replace(/_(.)/g, () => keep(" "))
    .replace(/\*(.)/g, "")
    .replace(/\[\$([^\]-]*)[^\]]*\]/g, (_, symbol: string) => keep(symbol))
    .replace(/\[[^\]]*\]/g, "");
  return { text, literals };
}

function restoreLiterals(text: string, literals: string[]) {
  return text.replace(/[\uE100-\uF8FF]/g, (marker) => literals[marker.charCodeAt(0) - 0xE100]);
}

function isDateFormat(code: string) {
  const { text } = tokenizeLiterals(code);
  return /[ymdhs]/i.test(text.replace(/[\uE100-\uF8FF]/g, "")) && !/general/i.test(text);
}

function pad(value: number, width = 2) { return String(value).padStart(width, "0"); }

function formatDate(serial: number, code: string, date1904: boolean): string {
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.round(serial * 86400000));
  if (Number.isNaN(date.getTime())) return formatGeneral(serial);
  const { text, literals } = tokenizeLiterals(code);
  const twelveHour = /AM\/PM|A\/P|上午\/下午/i.test(text);
  const tokens = [...text.matchAll(/yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|A\/P|上午\/下午|[\uE100-\uF8FF]|./gi)].map((m) => m[0]);
  const hours = date.getUTCHours();
  let out = "";
  let previousTime = "";
  tokens.forEach((token, index) => {
    const lower = token.toLowerCase();
    const next = tokens.slice(index + 1).find((candidate) => /^(ss|s|h|hh)$/i.test(candidate));
    switch (lower) {
      case "yyyy": out += date.getUTCFullYear(); break;
      case "yy": out += pad(date.getUTCFullYear() % 100); break;
      case "mmmm": out += MONTHS[date.getUTCMonth()]; break;
      case "mmm": out += MONTHS[date.getUTCMonth()].slice(0, 3); break;
      case "mm": case "m": {
        const isMinute = previousTime === "h" || (next !== undefined && /^s/i.test(next));
        const number = isMinute ? date.getUTCMinutes() : date.getUTCMonth() + 1;
        out += lower === "mm" ? pad(number) : number;
        if (isMinute) previousTime = "m";
        break;
      }
      case "dddd": out += DAYS[date.getUTCDay()]; break;
      case "ddd": out += DAYS[date.getUTCDay()].slice(0, 3); break;
      case "dd": out += pad(date.getUTCDate()); break;
      case "d": out += date.getUTCDate(); break;
      case "hh": case "h": {
        const shown = twelveHour ? (hours % 12 || 12) : hours;
        out += lower === "hh" ? pad(shown) : shown;
        previousTime = "h";
        break;
      }
      case "ss": out += pad(date.getUTCSeconds()); previousTime = "s"; break;
      case "s": out += date.getUTCSeconds(); previousTime = "s"; break;
      case "am/pm": out += hours < 12 ? "AM" : "PM"; break;
      case "上午/下午": out += hours < 12 ? "上午" : "下午"; break;
      case "a/p": out += hours < 12 ? "A" : "P"; break;
      default: out += token;
    }
  });
  return restoreLiterals(out, literals);
}

function formatNumberSection(value: number, section: string): string | null {
  const { text, literals } = tokenizeLiterals(section);
  if (/e[+-]/i.test(text) || /[#0?]\/[#0?\d]/.test(text)) return null;
  const runs = [...text.matchAll(/[#0?.,]+/g)];
  if (runs.length !== 1) return null;
  const run = runs[0];
  const pattern = run[0];
  if (/,+$/.test(pattern) && !pattern.includes(".")) return null; // trailing commas scale by 1000: not supported
  const [intPattern, decPattern = ""] = pattern.split(".");
  const percent = text.includes("%");
  const scaled = percent ? value * 100 : value;
  const decimals = decPattern.replace(/,/g, "").length;
  const minDecimals = (decPattern.match(/0/g) || []).length;
  const minInt = (intPattern.match(/0/g) || []).length;
  let digits = Math.abs(scaled).toFixed(decimals);
  if (decimals > minDecimals) digits = digits.replace(new RegExp(`(\\.\\d{${minDecimals}}\\d*?)0+$`), "$1").replace(/\.$/, "");
  const [integerPart, fraction = ""] = digits.split(".");
  let integer = integerPart;
  if (integer === "0" && minInt === 0 && fraction) integer = "";
  if (integer === "0" && minInt === 0 && !fraction && decimals === 0) integer = "";
  integer = integer.padStart(minInt, "0");
  if (intPattern.includes(",")) integer = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const number = fraction ? `${integer}.${fraction}` : integer;
  const rendered = text.slice(0, run.index) + number + text.slice(run.index! + pattern.length);
  return restoreLiterals(rendered, literals);
}

function splitSections(code: string): string[] {
  const sections: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of code) {
    if (char === '"') quoted = !quoted;
    if (char === ";" && !quoted) { sections.push(current); current = ""; } else current += char;
  }
  sections.push(current);
  return sections;
}

export function formatNumberCell(value: number, code: string, date1904 = false): string {
  if (!code || /^general$/i.test(code) || code === "@") return formatGeneral(value);
  if (isDateFormat(code)) return formatDate(value, splitSections(code)[0], date1904);
  const sections = splitSections(code);
  const negativeSection = value < 0 && sections.length > 1;
  const formatted = formatNumberSection(negativeSection ? -value : value, negativeSection ? sections[1] : sections[0]);
  if (formatted === null) return formatGeneral(value);
  return value < 0 && !negativeSection ? `-${formatted}` : formatted;
}

// This timer belongs to the application module, not to the editor that unmounts
// after saving. Desktop expiry runs in the main process even while hidden.
let clearTimer: ReturnType<typeof setTimeout> | undefined;

export async function copyTextWithExpiry(text: string) {
  if (window.clipboxDesktop) {
    await window.clipboxDesktop.copyText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
  clearTimeout(clearTimer);
  clearTimer = setTimeout(async () => {
    try {
      if (await navigator.clipboard.readText() === text) await navigator.clipboard.writeText("");
    } catch {
      // Browser clipboard permission can be withdrawn after the copy.
    }
  }, 60_000);
}

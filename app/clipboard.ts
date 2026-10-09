export async function copyTextWithExpiry(text: string) {
  if (window.clipboxDesktop) {
    await window.clipboxDesktop.copyText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}

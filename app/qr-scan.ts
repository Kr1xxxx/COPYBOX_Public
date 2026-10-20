// Reads an otpauth:// link out of a QR picture, using the browser's own barcode detector (no extra library, nothing leaves the device).

type DetectorLike = { detect(image: ImageBitmap): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (options: { formats: string[] }) => DetectorLike;

export async function scanQrFromBlob(blob: Blob): Promise<string> {
  const Detector = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (!Detector) throw new Error("这里不能识别二维码图片，请粘贴密钥或 otpauth:// 链接");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error("这张图片打不开");
  }
  try {
    const found = await new Detector({ formats: ["qr_code"] }).detect(bitmap);
    const text = found.map((entry) => entry.rawValue).find((value) => /^otpauth:/i.test(value.trim()));
    if (!text) throw new Error(found.length > 0 ? "二维码里不是验证码，请换一张" : "没有找到二维码，请截得完整一些");
    return text.trim();
  } finally {
    bitmap.close();
  }
}

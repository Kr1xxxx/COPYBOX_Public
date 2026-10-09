import zlib from "node:zlib";

// A valid RGB PNG without binary fixtures. A flat colour compresses to a few hundred bytes even at 3000×3000, so
// the extreme sizes cost nothing in the repository. With `frame` the picture gets a coloured border, which makes it
// easy to see in a screenshot whether the whole image is shown (contain) or cropped (cover).
export function makePng(width, height, [red, green, blue], { frame } = {}) {
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(stride * height);
  const edge = frame ? Math.max(2, Math.round(Math.min(width, height) / 12)) : 0;
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride; // The filter byte stays 0.
    const rowInFrame = edge > 0 && (y < edge || y >= height - edge);
    for (let x = 0; x < width; x += 1) {
      const inFrame = rowInFrame || (edge > 0 && (x < edge || x >= width - edge));
      const [r, g, b] = inFrame ? frame : [red, green, blue];
      const at = rowStart + 1 + x * 3;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
    }
  }

  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

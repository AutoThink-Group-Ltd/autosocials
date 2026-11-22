export function canvasTileRunKey(
  workspaceId: string,
  canvasId: string,
  version: number,
  blockIndex: number,
) {
  return `as:canvas-tile-run:${workspaceId}:${canvasId}:${version}:${blockIndex}`;
}

export function tileRequestUuid(hash: Uint8Array) {
  const bytes = hash.slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

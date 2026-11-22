/** X counts URLs as 23 characters and most emoji and CJK characters as two. */
export function xCaptionLength(value: string): number {
  let total = 0;
  const parts = value.split(/(https?:\/\/[^\s]+)/gi);
  for (const part of parts) {
    if (/^https?:\/\//i.test(part)) { total += 23; continue; }
    for (const character of part) {
      const point = character.codePointAt(0)!;
      total += point <= 0x10ff || (point >= 0x2000 && point <= 0x200d) || (point >= 0x2010 && point <= 0x201f) || (point >= 0x2032 && point <= 0x2037) ? 1 : 2;
    }
  }
  return total;
}

export function validChannelCaption(caption: string, platform: string): boolean {
  return !!caption.trim() && caption.length <= (platform === "x" ? 280 : 2200) && (platform !== "x" || xCaptionLength(caption) <= 280);
}

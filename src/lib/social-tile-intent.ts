import { MAX_SOCIAL_TILES_PER_PLAN } from "./content-rules";

/** Only current, explicit tile requests enter the tile planning flow. */
export function isSocialTileRequest(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (
    /\b(?:do not|don't|dont|never|not yet|without)\b.{0,35}\b(?:make|create|generate|design|produce|build|give me)\b/.test(
      text,
    )
  )
    return false;
  return (
    /\b(?:make|create|generate|design|produce|build|give me|i (?:want|need|would like))\b/.test(
      text,
    ) &&
    /\b(?:tiles?|graphics?|images?|static designs?|social (?:posts?|assets?))\b/.test(
      text,
    )
  );
}

export function isStandaloneTileRequest(message: string): boolean {
  return (
    isSocialTileRequest(message) &&
    !/^\s*(?:how|why|what|when|where|should|do we|can i|i want to know)\b/i.test(
      message,
    ) &&
    /\b(?:tiles?|static (?:graphics?|designs?|images?))\b/i.test(message) &&
    !/\b(?:carousels?|calendars?|schedule|scheduled|publishing|publish)\b/i.test(
      message,
    ) &&
    !/\b(?:and|plus|with)\s+(?:\d+\s+|a\s+|some\s+)?(?:videos?|reels?)\b/i.test(
      message,
    )
  );
}

const quantities = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

export function requestedSocialTileCount(message: string): number {
  const count =
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:social(?: media)?\s+)?(?:tiles?|graphics?|images?|static designs?)/i.exec(
      message,
    )?.[1];
  if (!count) return 1;
  const numeric = /^\d+$/.test(count)
    ? Number(count)
    : quantities.indexOf(count.toLowerCase()) + 1;
  return Math.min(Math.max(1, numeric), MAX_SOCIAL_TILES_PER_PLAN);
}

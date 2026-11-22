import type { WordTime } from "./film-qa";

type TranscribedWord = { word: string; start: number; end: number };
const normalise = (word: string) => word.toLocaleLowerCase("en-GB").replace(/[^\p{L}\p{N}]/gu, "");
const units = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function comparable(word: string): string {
  const value = normalise(word);
  if (!/^(?:0|[1-9]\d?)$/.test(value)) return value;
  const number = Number(value);
  return number < 20 ? units[number]! : tens[Math.floor(number / 10)]! + (number % 10 ? units[number % 10]! : "");
}

/** Map recorded speech to the original wording; grouped transcript words retain their measured interval. */
export function verifiedNarrationWords(script: string, words: TranscribedWord[], audioSeconds: number): WordTime[] {
  const expected = script.trim().split(/\s+/).filter(Boolean);
  if (!expected.length || !Array.isArray(words) || !words.length || !Number.isFinite(audioSeconds) || audioSeconds <= 0) throw new Error("Narration could not be matched to the script. Review the script and try again.");
  let previousEnd = 0;
  for (const spoken of words) {
    if (!spoken || !normalise(spoken.word) || !Number.isFinite(spoken.start) || !Number.isFinite(spoken.end) || spoken.start < previousEnd - 0.05 || spoken.end <= spoken.start || spoken.end > audioSeconds + 0.25) throw new Error("Narration could not be matched to the script. Review the audio and try again.");
    previousEnd = spoken.end;
  }
  let cursor = 0;
  const result = expected.map((word) => {
    const wanted = comparable(word);
    if (!wanted) throw new Error("Narration could not be matched to the script. Review the script and try again.");
    let combined = "";
    const start = cursor;
    while (cursor < words.length && cursor - start < 3 && combined.length < wanted.length) {
      combined += comparable(words[cursor]!.word);
      cursor++;
    }
    if (combined !== wanted) throw new Error("Narration could not be matched to the script. Review the audio and try again.");
    return { word, start: words[start]!.start, end: words[cursor - 1]!.end };
  });
  if (cursor !== words.length) throw new Error("Narration could not be matched to the script. Review the audio and try again.");
  return result;
}

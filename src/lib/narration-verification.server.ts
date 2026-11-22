import { fetchOpenAI } from "./openai-quota.server";
import { verifiedNarrationWords } from "./narration-verification";

/** Inspect the generated audio itself; do not infer word timing from script length. */
export async function verifyNarration(audio: ArrayBuffer, script: string, seconds: number, media: "source" | "export" = "source") {
  if (media === "export" && audio.byteLength > 24 * 1024 * 1024) throw new Error("Export audio verification is unavailable for this file size.");
  const key = process.env["OPENAI_API_KEY"];
  if (!key) throw new Error("Narration verification is unavailable. Check the audio service before trying again.");
  const body = new FormData();
  body.append("model", "whisper-1");
  body.append("response_format", "verbose_json");
  body.append("timestamp_granularities[]", "word");
  body.append("language", "en");
  body.append("file", new Blob([new Uint8Array(audio)], { type: media === "export" ? "audio/mpeg" : "audio/wav" }), media === "export" ? "export.mp3" : "narration.wav");
  const response = await fetchOpenAI("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error("Narration verification is unavailable. Try again after checking the audio service.");
  const result = await response.json() as { words?: Array<{ word: string; start: number; end: number }> };
  return verifiedNarrationWords(script, result.words ?? [], seconds);
}

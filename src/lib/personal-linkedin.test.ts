import { describe, expect, it } from "vitest";
import { extractLinkedInProfileContext } from "./personal-linkedin";
const url = "https://www.linkedin.com/in/example/";
const payload = { data: { markdown: "# Name\n\n**Founder and writer**\n\n## About\nI write about science.\n\n## Employment\nOther", metadata: { sourceURL: url } } };
describe("LinkedIn self description", () => {
  it("extracts bounded profile text without adding employment claims", () => expect(extractLinkedInProfileContext(url, payload)).toBe("Founder and writer. I write about science."));
  it("rejects mismatched profile provenance", () => expect(extractLinkedInProfileContext(url, { data: { ...payload.data, metadata: { sourceURL: "https://linkedin.com/in/other" } } })).toBeNull());
  it("rejects pages with no self description", () => expect(extractLinkedInProfileContext(url, { data: { markdown: "# Name", metadata: { sourceURL: url } } })).toBeNull());
});

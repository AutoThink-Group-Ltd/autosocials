import { describe, expect, it } from "vitest";
import { reusablePersonalSections } from "./personal-retry";

describe("personal profile retry", () => {
  const urls = ["https://x.com/one", "https://www.instagram.com/two/"];
  const content = `Selected profiles: ${urls.join(" | ")}\nChecked: now\nProfile: ${urls[0]}\n- post one\n\nProfile: https://www.instagram.com/two\n- post two`;
  it("reuses each unchanged profile section without the snapshot header", () => {
    const sections = reusablePersonalSections(content, urls);
    expect(sections?.get(urls[0]!)).toBe(`Profile: ${urls[0]}\n- post one`);
    expect(sections?.get(urls[1]!)).toBe("Profile: https://www.instagram.com/two\n- post two");
  });
  it("rejects changed or incomplete snapshots", () => {
    expect(reusablePersonalSections(content, [urls[0]!])).toBeNull();
    expect(reusablePersonalSections(content.split("\n\n")[0]!, urls)).toBeNull();
  });
});

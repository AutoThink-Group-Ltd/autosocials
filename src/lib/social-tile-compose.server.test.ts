import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { composeSocialTile } from "./social-tile-compose.server";

describe("social tile composition", () => {
  it("preserves the real logo over the generated square at the expected size", async () => {
    const background = await sharp({create:{width:1024,height:1024,channels:4,background:"#ffffff"}}).png().toBuffer();
    const logo = await sharp({create:{width:40,height:30,channels:4,background:"#ff0000"}}).png().toBuffer();
    const result = await composeSocialTile(background, `data:image/png;base64,${logo.toString("base64")}`);
    const {data,info} = await sharp(result).raw().toBuffer({resolveWithObject:true});
    expect([info.width,info.height]).toEqual([1000,1000]);
    const pixel = (x:number,y:number) => [...data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3)];
    expect(pixel(930,940)).toEqual([255,0,0]);
    expect(pixel(100,100)).toEqual([255,255,255]);
  });
  it("rejects an invalid logo rather than silently omitting it", async () => {
    const image = await sharp({create:{width:10,height:10,channels:3,background:"#ffffff"}}).png().toBuffer();
    await expect(composeSocialTile(image, "data:image/svg+xml;base64,AAA=")).rejects.toThrow("logo");
  });
});

it("composes a portrait typography tile without an image provider", async () => {
  const { composeDesignedSocialTile } = await import("./social-tile-compose.server");
  const result = await composeDesignedSocialTile(undefined, {headline:"A thoughtful headline",supporting:"Supporting words",design:{aspect:"portrait",treatment:"typography",composition:"full",medium:"Editorial",accent:"#ffcc00",emphasis:"thoughtful",typeface:"serif"}});
  const info = await sharp(result).metadata();
  expect([info.width,info.height]).toEqual([1000,1250]);
});

it("keeps full-bleed artwork out of the text area", async () => {
  const { composeDesignedSocialTile } = await import("./social-tile-compose.server");
  const background = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#ff0000" } }).png().toBuffer();
  const result = await composeDesignedSocialTile(background, {
    headline: "Meet Tyson",
    supporting: "Your AI website agent",
    design: { aspect: "square", treatment: "illustration", composition: "full", medium: "Editorial", paper: "#ffffff", ink: "#000000", accent: "#000000", emphasis: "", typeface: "sans" },
  });
  const { data, info } = await sharp(result).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
  expect(pixel(10, 10)).toEqual([255, 0, 0]);
  expect(pixel(10, 700)).toEqual([255, 255, 255]);
});

it("rejects copy that cannot fit even at the minimum size", async () => {
  const { composeDesignedSocialTile } = await import("./social-tile-compose.server");
  await expect(composeDesignedSocialTile(undefined, {
    headline: "W".repeat(1000),
    supporting: "",
    design: { aspect: "square", treatment: "typography", composition: "full", medium: "Editorial", accent: "#ffffff", emphasis: "", typeface: "sans" },
  })).rejects.toThrow("does not fit without breaking words");
});

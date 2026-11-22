import { describe, expect, it } from "vitest";
import { verifiedNarrationWords } from "./narration-verification";
describe("narration verification", () => {
 it("uses spoken word timestamps while keeping original punctuation", () => {
  expect(verifiedNarrationWords("Hello, world!", [{word:"Hello",start:0.2,end:0.6},{word:"world",start:0.8,end:1.2}], 2)).toEqual([{word:"Hello,",start:0.2,end:0.6},{word:"world!",start:0.8,end:1.2}]);
 });
 it("rejects missing, altered or invalid speech rather than fabricating timing", () => {
  expect(() => verifiedNarrationWords("Hello world", [{word:"Hello",start:0,end:0.5}], 2)).toThrow();
  expect(() => verifiedNarrationWords("Hello world", [{word:"Hello",start:0,end:0.5},{word:"wrong",start:0.7,end:1}], 2)).toThrow();
  expect(() => verifiedNarrationWords("Hello world", [{word:"Hello",start:0,end:0.5},{word:"world",start:1,end:3}], 2)).toThrow();
 });
});

it("accepts equivalent spoken number and split-word formatting using actual bounds", () => {
 expect(verifiedNarrationWords("25 AI-assisted teams", [{word:"twenty",start:0.1,end:0.4},{word:"five",start:0.4,end:0.6},{word:"AI",start:0.7,end:0.9},{word:"assisted",start:0.9,end:1.2},{word:"teams",start:1.3,end:1.6}], 2)).toEqual([{word:"25",start:0.1,end:0.6},{word:"AI-assisted",start:0.7,end:1.2},{word:"teams",start:1.3,end:1.6}]);
 expect(() => verifiedNarrationWords("25 teams", [{word:"twenty",start:0.1,end:0.4},{word:"six",start:0.4,end:0.6},{word:"teams",start:0.7,end:1}], 2)).toThrow();
 expect(() => verifiedNarrationWords("Hello", [{word:"Hello",start:0.1,end:0.5},{word:"again",start:0.6,end:0.8}], 1)).toThrow();
});

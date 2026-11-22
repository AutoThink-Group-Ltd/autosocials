import { describe, it, expect } from "vitest";
import { avatarPath } from "@/features/profile/ProfileForm";
describe("avatarPath", () => {
  it("always stores in the signed-in user's own folder", () => {
    expect(avatarPath("user-1", "Me.JPG")).toBe("user-1/avatar.jpg");
  });
});

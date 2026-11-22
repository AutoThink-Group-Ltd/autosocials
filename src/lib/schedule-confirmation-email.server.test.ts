import { describe, expect, it } from "vitest";
import { renderScheduleConfirmation } from "./schedule-confirmation-email.server";

describe("schedule confirmation email", () => {
  it("shows every post, local time and channel in HTML and plain text while escaping untrusted content", () => {
    const message = renderScheduleConfirmation("Example <brand>", "Europe/London", [
      { title: "First <tile>", scheduledAt: "2026-11-20T09:00:00Z", channels: ["Facebook", "Instagram"], imageContentId: "schedule-0" },
      { title: "Second", scheduledAt: "2026-11-21T10:00:00Z", channels: ["Instagram"] },
    ]);
    expect(message.html).toContain("First &lt;tile&gt;");
    expect(message.html).toContain("cid:schedule-0");
    expect(message.html).toContain("20 November 2026");
    expect(message.text).toContain("Second");
    expect(message.text).toContain("Facebook · Instagram");
  });
  it("clearly identifies a partial confirmation", () => {
    const email = renderScheduleConfirmation("Brand", "UTC", [{ title: "First", scheduledAt: "2026-11-20T09:00:00Z", channels: ["Facebook"] }], true);
    expect(email.html).toContain("Some posts could not be scheduled");
    expect(email.text).toContain("Only the confirmed posts are listed");
  });
});

import { describe, expect, it } from "vitest";
import { activePlanningVariants } from "@/lib/production-plan";

describe("active video plan", () => {
  const variants = [
    { id: "old", position: 0, production_plan: { plan_id: "plan-a" } },
    { id: "new", position: 1, production_plan: { plan_id: "plan-b" } },
  ];

  it("reopens the requested saved plan, even after a newer plan was made", () => {
    expect(activePlanningVariants(variants, "plan-a").map((variant) => variant.id)).toEqual(["old"]);
  });

  it("uses the latest plan for batches created before active plan tracking", () => {
    expect(activePlanningVariants(variants).map((variant) => variant.id)).toEqual(["new"]);
  });
});

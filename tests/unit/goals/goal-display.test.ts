import { describe, expect, it } from "vitest";
import { calculateGoalProgress } from "@/features/goals/goal.service";

describe("goal progress presentation", () => {
  it("starts at zero until transactions are explicitly linked", () => {
    expect(calculateGoalProgress("1000", [])).toEqual({
      progress: "0",
      remaining: "1000",
      isComplete: false,
    });
  });

  it("uses exact integer amounts and never shows negative remaining", () => {
    expect(
      calculateGoalProgress("9007199254740993", ["9007199254740000", "993"]),
    ).toEqual({
      progress: "9007199254740993",
      remaining: "0",
      isComplete: true,
    });
    expect(calculateGoalProgress("1000", ["750", "500"])).toEqual({
      progress: "1250",
      remaining: "0",
      isComplete: true,
    });
  });

  it("accounts for signed corrections only from linked transactions", () => {
    expect(calculateGoalProgress("1000", ["800", "-125"])).toEqual({
      progress: "675",
      remaining: "325",
      isComplete: false,
    });
  });
});

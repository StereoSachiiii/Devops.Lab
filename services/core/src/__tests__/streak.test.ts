import { describe, it, expect } from "vitest";
import { calculateStreak } from "../utils/streak";

describe("Streak Calculation Utility", () => {
  it("initializes streak to 1 on first-ever user activity", () => {
    const state = {
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: null,
    };
    const now = new Date("2026-08-27T10:00:00Z");
    const result = calculateStreak(state, now);

    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
    expect(result.lastActivityDate).toEqual(now);
    expect(result.incremented).toBe(true);
  });

  it("preserves streak count on same-day multiple activities", () => {
    const initialActivity = new Date("2026-08-27T08:00:00Z");
    const state = {
      currentStreak: 3,
      longestStreak: 5,
      lastActivityDate: initialActivity,
    };
    const laterSameDay = new Date("2026-08-27T22:30:00Z");
    const result = calculateStreak(state, laterSameDay);

    expect(result.currentStreak).toBe(3);
    expect(result.longestStreak).toBe(5);
    expect(result.lastActivityDate).toEqual(laterSameDay);
    expect(result.incremented).toBe(false);
  });

  it("increments streak on consecutive day activity", () => {
    const yesterday = new Date("2026-08-26T20:00:00Z");
    const state = {
      currentStreak: 4,
      longestStreak: 10,
      lastActivityDate: yesterday,
    };
    const today = new Date("2026-08-27T09:15:00Z");
    const result = calculateStreak(state, today);

    expect(result.currentStreak).toBe(5);
    expect(result.longestStreak).toBe(10);
    expect(result.lastActivityDate).toEqual(today);
    expect(result.incremented).toBe(true);
  });

  it("updates longestStreak when currentStreak exceeds it", () => {
    const yesterday = new Date("2026-08-26T14:00:00Z");
    const state = {
      currentStreak: 7,
      longestStreak: 7,
      lastActivityDate: yesterday,
    };
    const today = new Date("2026-08-27T11:00:00Z");
    const result = calculateStreak(state, today);

    expect(result.currentStreak).toBe(8);
    expect(result.longestStreak).toBe(8);
    expect(result.lastActivityDate).toEqual(today);
    expect(result.incremented).toBe(true);
  });

  it("resets streak to 1 after a multi-day gap (missed day)", () => {
    const threeDaysAgo = new Date("2026-08-24T12:00:00Z");
    const state = {
      currentStreak: 12,
      longestStreak: 12,
      lastActivityDate: threeDaysAgo,
    };
    const today = new Date("2026-08-27T16:00:00Z");
    const result = calculateStreak(state, today);

    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(12); // longest streak preserved
    expect(result.lastActivityDate).toEqual(today);
    expect(result.incremented).toBe(true);
  });
});

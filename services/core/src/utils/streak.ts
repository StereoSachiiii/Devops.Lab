export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: Date | null;
}

export interface StreakUpdateResult {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: Date;
  incremented: boolean;
}

/**
 * Calculates updated streak counts based on user's previous activity date and current activity date.
 *
 * Rules:
 * 1. First-ever activity (lastActivityDate is null):
 *    - currentStreak = 1
 *    - longestStreak = max(longestStreak, 1)
 *    - lastActivityDate = activityDate
 *
 * 2. Same UTC Calendar Day as lastActivityDate:
 *    - No-op for streak counts (streak stays currentStreak)
 *    - lastActivityDate is refreshed to activityDate
 *
 * 3. Consecutive UTC Calendar Day (yesterday):
 *    - currentStreak = currentStreak + 1
 *    - longestStreak = max(longestStreak, currentStreak)
 *    - lastActivityDate = activityDate
 *
 * 4. Gap of 2 or more UTC Calendar Days:
 *    - Streak is broken: currentStreak resets to 1
 *    - longestStreak = max(longestStreak, 1)
 *    - lastActivityDate = activityDate
 */
export function calculateStreak(
  state: StreakState,
  activityDate: Date = new Date()
): StreakUpdateResult {
  const currentLongest = state.longestStreak || 0;
  const current = state.currentStreak || 0;

  if (!state.lastActivityDate) {
    const newCurrent = 1;
    return {
      currentStreak: newCurrent,
      longestStreak: Math.max(currentLongest, newCurrent),
      lastActivityDate: activityDate,
      incremented: true,
    };
  }

  const actUtcYear = activityDate.getUTCFullYear();
  const actUtcMonth = activityDate.getUTCMonth();
  const actUtcDate = activityDate.getUTCDate();

  const last = new Date(state.lastActivityDate);
  const lastUtcYear = last.getUTCFullYear();
  const lastUtcMonth = last.getUTCMonth();
  const lastUtcDate = last.getUTCDate();

  // Normalize both to UTC midnight timestamps to compute day difference
  const actMidnight = Date.UTC(actUtcYear, actUtcMonth, actUtcDate);
  const lastMidnight = Date.UTC(lastUtcYear, lastUtcMonth, lastUtcDate);

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const dayDiff = Math.round((actMidnight - lastMidnight) / MS_PER_DAY);

  if (dayDiff === 0) {
    // Same day activity: preserve streak, update timestamp
    return {
      currentStreak: current > 0 ? current : 1,
      longestStreak: Math.max(currentLongest, current > 0 ? current : 1),
      lastActivityDate: activityDate,
      incremented: false,
    };
  }

  if (dayDiff === 1) {
    // Consecutive day activity: increment streak
    const newCurrent = (current > 0 ? current : 0) + 1;
    return {
      currentStreak: newCurrent,
      longestStreak: Math.max(currentLongest, newCurrent),
      lastActivityDate: activityDate,
      incremented: true,
    };
  }

  if (dayDiff > 1) {
    // Gap of 2+ days: reset streak to 1
    const newCurrent = 1;
    return {
      currentStreak: newCurrent,
      longestStreak: Math.max(currentLongest, newCurrent),
      lastActivityDate: activityDate,
      incremented: true,
    };
  }

  // If activityDate is in the past (clock skew / historical backfill):
  // Preserve streak, do not regress lastActivityDate
  return {
    currentStreak: current > 0 ? current : 1,
    longestStreak: Math.max(currentLongest, current > 0 ? current : 1),
    lastActivityDate: state.lastActivityDate,
    incremented: false,
  };
}

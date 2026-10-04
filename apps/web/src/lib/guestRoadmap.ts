import type { RoadmapProgress } from "@/lib/api-types";

export const GUEST_ROADMAP_STORAGE_KEY = "devopslab_guest_roadmap_progress";

export interface GuestRoadmapStore {
  [roadmapSlug: string]: {
    completedNodes: string[];
    inProgressNodes?: string[];
    updatedAt: number;
  };
}

/**
 * Reads all guest roadmap progress from localStorage.
 */
export function getGuestRoadmapStore(): GuestRoadmapStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(GUEST_ROADMAP_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Gets guest roadmap progress for a specific slug.
 */
export function getGuestRoadmapProgress(slug: string): RoadmapProgress | null {
  const store = getGuestRoadmapStore();
  const entry = store[slug];
  if (!entry) return null;
  return {
    roadmapId: slug,
    completedNodes: Array.isArray(entry.completedNodes) ? entry.completedNodes : [],
    inProgressNodes: Array.isArray(entry.inProgressNodes) ? entry.inProgressNodes : [],
  };
}

/**
 * Sets guest roadmap completed nodes for a specific slug.
 */
export function saveGuestRoadmapProgress(
  slug: string,
  completedNodes: string[],
  inProgressNodes: string[] = []
): void {
  if (typeof window === "undefined") return;
  try {
    const store = getGuestRoadmapStore();
    store[slug] = {
      completedNodes,
      inProgressNodes,
      updatedAt: Date.now(),
    };
    localStorage.setItem(GUEST_ROADMAP_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage write failure
  }
}

/**
 * Clears guest roadmap progress from localStorage.
 */
export function clearGuestRoadmapStore(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(GUEST_ROADMAP_STORAGE_KEY);
  } catch {
    // Ignore storage remove failure
  }
}

/**
 * Non-destructive Union Merge Strategy for syncing guest progress to account.
 * Merges local completed nodes with account completed nodes without overwriting
 * existing completions on either side.
 */
export function mergeRoadmapProgress(
  accountProgress: RoadmapProgress | null,
  guestProgress: { completedNodes: string[]; inProgressNodes?: string[] }
): RoadmapProgress {
  const accountCompleted = accountProgress?.completedNodes || [];
  const guestCompleted = guestProgress.completedNodes || [];

  // Union of completed nodes
  const mergedCompleted = Array.from(new Set([...accountCompleted, ...guestCompleted]));

  // In-progress: preserve active items not yet completed
  const accountInProgress = accountProgress?.inProgressNodes || [];
  const guestInProgress = guestProgress.inProgressNodes || [];
  const mergedInProgress = Array.from(
    new Set([...accountInProgress, ...guestInProgress])
  ).filter((nodeId) => !mergedCompleted.includes(nodeId));

  return {
    roadmapId: accountProgress?.roadmapId || "",
    completedNodes: mergedCompleted,
    inProgressNodes: mergedInProgress,
  };
}

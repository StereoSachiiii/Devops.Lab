import { describe, it, expect, vi, beforeEach } from "vitest";
import { awardBadgeIfEligible, evaluateMilestoneBadges } from "../utils/badges";

describe("Badge Awarding Engine", () => {
  let mockPrisma: any;
  let mockFastify: any;

  beforeEach(() => {
    mockPrisma = {
      badge: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      userBadge: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      labSession: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
      challenge: {
        findUnique: vi.fn(),
      },
    };

    mockFastify = {
      prisma: mockPrisma,
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
  });

  it("awards badge when user is eligible and has not earned it", async () => {
    mockPrisma.badge.findUnique.mockResolvedValueOnce({
      id: "b-1",
      slug: "first-blood",
      title: "First Deployment",
    });
    mockPrisma.userBadge.findUnique.mockResolvedValueOnce(null);
    mockPrisma.userBadge.create.mockResolvedValueOnce({ id: "ub-1" });

    const result = await awardBadgeIfEligible(mockFastify, {
      userId: "u-123",
      badgeSlug: "first-blood",
    });

    expect(result.awarded).toBe(true);
    expect(result.badgeSlug).toBe("first-blood");
    expect(mockPrisma.userBadge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u-123",
        badgeId: "b-1",
      }),
    });
  });

  it("does not re-award badge if user already has it", async () => {
    mockPrisma.badge.findUnique.mockResolvedValueOnce({
      id: "b-1",
      slug: "first-blood",
    });
    mockPrisma.userBadge.findUnique.mockResolvedValueOnce({ userId: "u-123", badgeId: "b-1" });

    const result = await awardBadgeIfEligible(mockFastify, {
      userId: "u-123",
      badgeSlug: "first-blood",
    });

    expect(result.awarded).toBe(false);
    expect(mockPrisma.userBadge.create).not.toHaveBeenCalled();
  });

  it("awards first-blood and streak milestone badges on evaluation", async () => {
    mockPrisma.labSession.count.mockResolvedValueOnce(1); // 1 challenge completed
    mockPrisma.badge.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.slug === "first-blood") return { id: "b-first", slug: "first-blood", title: "First Blood" };
      if (where.slug === "streak-3") return { id: "b-streak3", slug: "streak-3", title: "3-Day Drill" };
      return null;
    });

    mockPrisma.userBadge.findUnique.mockResolvedValue(null); // not earned yet
    mockPrisma.userBadge.create.mockResolvedValue({ id: "ub-new" });

    const awarded = await evaluateMilestoneBadges(mockFastify, "u-123", 3);

    expect(awarded).toContain("first-blood");
    expect(awarded).toContain("streak-3");
    expect(mockPrisma.userBadge.create).toHaveBeenCalledTimes(2);
  });
});

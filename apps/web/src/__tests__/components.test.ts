import { describe, it, expect, vi } from "vitest";
import { TagPill } from "../components/ui/TagPill";
import { SegmentTabs } from "../components/ui/SegmentTabs";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";
import { EyebrowHeader } from "../components/ui/EyebrowHeader";
import { getErrorMessage, ApiError, ErrorCodes } from "../lib/errors";

describe("Frontend UI Design System & Component Library", () => {
  describe("TagPill Component", () => {
    it("renders children text with default styling classes", () => {
      const element = TagPill({ children: "Kubernetes", variant: "default" });
      expect(element).toBeDefined();
      expect(element.props.children).toBe("Kubernetes");
      expect(element.props.className).toContain("bg-panel-2");
    });

    it("renders teal variant styling", () => {
      const element = TagPill({ children: "Easy", variant: "teal" });
      expect(element.props.className).toContain("text-teal");
      expect(element.props.className).toContain("border-teal/30");
    });

    it("renders amber variant styling for Senior/Mid difficulty", () => {
      const element = TagPill({ children: "Senior", variant: "amber" });
      expect(element.props.className).toContain("text-amber");
      expect(element.props.className).toContain("border-amber/30");
    });
  });

  describe("SegmentTabs Component", () => {
    const tabs = [
      { id: "description", label: "Description" },
      { id: "hints", label: "Hints" },
      { id: "discussion", label: "Discussion" },
    ] as const;

    it("renders all options in container", () => {
      const onChange = vi.fn();
      const element = SegmentTabs({
        options: tabs,
        activeTab: "description",
        onChange,
      });

      expect(element).toBeDefined();
      expect(element.props.children).toHaveLength(3);
    });

    it("highlights active tab with distinct background and amber text", () => {
      const onChange = vi.fn();
      const element = SegmentTabs({
        options: tabs,
        activeTab: "discussion",
        onChange,
      });

      const discussionButton = element.props.children.find((c: any) => c.key === "discussion");
      expect(discussionButton.props.className).toContain("text-amber");
      expect(discussionButton.props.className).toContain("bg-panel-2");
    });
  });

  describe("Breadcrumbs Component", () => {
    it("renders single item with active label", () => {
      const element = Breadcrumbs({ items: [{ label: "Challenges" }] });
      expect(element).toBeDefined();
      expect(element.props.children).toBeDefined();
    });

    it("renders multi-level hierarchy with href links", () => {
      const element = Breadcrumbs({
        items: [{ label: "Challenges", href: "/challenges" }, { label: "Nginx Debugging" }],
      });
      expect(element.props.children).toBeDefined();
    });
  });

  describe("EyebrowHeader Component", () => {
    it("renders category with dot indicator", () => {
      const element = EyebrowHeader({
        children: "KUBERNETES DEVOPS",
        dotColor: "teal",
      });
      expect(element).toBeDefined();
      expect(element.props.children).toBeDefined();
      expect(element.props.className).toContain("text-teal");
    });
  });

  describe("Error Mapping & Normalization Engine", () => {
    it("translates known backend ErrorCodes to human-readable text", () => {
      const err = new ApiError("Volatile message", 400, ErrorCodes.INVALID_MFA_CODE);
      const userMessage = getErrorMessage(err);
      expect(userMessage).toBe("The verification code is incorrect. Please try again.");
    });

    it("falls back to custom fallback string on unknown error", () => {
      const err = new Error("Network timeout");
      const fallback = "Unable to reach DevOps.lab API";
      const userMessage = getErrorMessage(err, fallback);
      expect(userMessage).toBe(fallback);
    });
  });
});

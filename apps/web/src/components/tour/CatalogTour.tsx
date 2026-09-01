"use client";

import { useEffect, useRef } from "react";
import { apiClient } from "@/lib/apiClient";
import { API_ROUTES } from "@/lib/api-routes";

interface CatalogTourProps {
  show: boolean;
  onDone: () => void;
}

let driverModule: typeof import("driver.js") | null = null;

const TOUR_STEPS = [
  {
    popover: {
      title: "New here? Let's find your first challenge.",
      description:
        "This page is every challenge we have - searchable, filterable, and free to explore. Want the sixty-second tour, or would you rather just look around?",
      side: "top" as const,
      align: "center" as const,
      nextBtnText: "Show me around →",
      prevBtnText: "I'll explore",
    },
  },
  {
    element: "#catalog-search",
    popover: {
      title: "STEP 1 OF 4\nSearch anything",
      description:
        'Type a keyword - a technology, a tag, even a symptom like "502" - and results update as you type.',
      side: "bottom" as const,
      align: "center" as const,
    },
  },
  {
    element: "#catalog-toolbar",
    popover: {
      title: "STEP 2 OF 4\nNarrow it down",
      description: "Filter by difficulty or how much time you've got, or sort by what's newest.",
      side: "bottom" as const,
      align: "center" as const,
    },
  },
  {
    element: "#challenge-c1",
    popover: {
      title: "STEP 3 OF 4\nNew here? Start with this one.",
      description:
        '"Fix your SSH key permissions" takes about five minutes and fixes a mistake basically every engineer has made at least once. Low stakes, real fix.',
      side: "top" as const,
      align: "start" as const,
    },
  },
  {
    element: "#challenge-c1",
    popover: {
      title: "STEP 4 OF 4\nThat's it - go fix something.",
      description:
        "Click the card whenever you're ready. Everything else on this page will still be here.",
      side: "bottom" as const,
      align: "start" as const,
      nextBtnText: "Got it",
    },
  },
];

export function CatalogTour({ show, onDone }: CatalogTourProps) {
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!show || hasRunRef.current) return;
    hasRunRef.current = true;

    async function startTour() {
      if (!driverModule) {
        driverModule = await import("driver.js");
        await import("driver.js/dist/driver.css" as any);
      }

      const { driver } = driverModule;

      const tourDriver = driver({
        popoverClass: "devops-tour-popover",
        showProgress: false,
        animate: true,
        overlayColor: "rgba(7, 9, 12, 0.7)",
        smoothScroll: true,
        allowClose: true, // Crucial: ensures it can be closed by clicking outside

        onDestroyStarted: () => {
          apiClient.post(API_ROUTES.onboarding.complete).catch(() => {});
          onDone();
          tourDriver.destroy();
        },

        // Overriding the button handlers for Step 1
        onPopoverRender: (popover, { state }) => {
          if (state.activeIndex === 0) {
            const prevBtn = popover.wrapper.querySelector(
              ".driver-popover-prev-btn"
            ) as HTMLButtonElement;
            if (prevBtn) {
              prevBtn.innerText = "I'll explore";
              prevBtn.onclick = () => tourDriver.destroy();
            }
          }
        },

        steps: TOUR_STEPS,
      });

      // Wait 1.2s before auto-starting
      setTimeout(() => tourDriver.drive(), 1200);
    }

    startTour().catch(console.error);
  }, [show, onDone]);

  return show ? (
    <style>{`
      .devops-tour-popover {
        background: #10141b !important;
        border: 1px solid #1d232e !important;
        border-radius: 10px !important;
        color: #eef1f6 !important;
        font-family: var(--font-mono) !important;
        box-shadow: 0 20px 40px -10px rgba(0,0,0,0.6) !important;
        max-width: 340px !important;
      }
      .devops-tour-popover .driver-popover-title {
        font-size: 13px !important;
        font-weight: 700 !important;
        color: var(--auth-amber, #ff9d5c) !important;
        letter-spacing: 0.02em !important;
        margin-bottom: 8px !important;
        white-space: pre-wrap !important;
      }
      .devops-tour-popover .driver-popover-description {
        font-size: 12.5px !important;
        color: var(--auth-muted, #7c8698) !important;
        line-height: 1.6 !important;
        font-family: inherit !important;
      }
      .devops-tour-popover .driver-popover-prev-btn,
      .devops-tour-popover .driver-popover-next-btn {
        background: transparent !important;
        border: 1px solid var(--auth-border, #1d232e) !important;
        color: #eef1f6 !important;
        border-radius: 5px !important;
        font-family: inherit !important;
        font-size: 11.5px !important;
        padding: 6px 14px !important;
        cursor: pointer !important;
        transition: border-color 0.2s, color 0.2s !important;
      }
      .devops-tour-popover .driver-popover-next-btn {
        background: rgba(255,157,92,0.15) !important;
        border-color: rgba(255,157,92,0.3) !important;
        color: var(--auth-amber, #ff9d5c) !important;
      }
      .devops-tour-popover .driver-popover-next-btn:hover {
        background: rgba(255,157,92,0.25) !important;
      }
      .devops-tour-popover .driver-popover-arrow-side-top .driver-popover-arrow {
        border-top-color: #10141b !important;
      }
      .devops-tour-popover .driver-popover-close-btn {
        color: #4b5262 !important;
        font-size: 16px !important;
      }
      .driver-overlay {
        backdrop-filter: blur(1px) !important;
      }
    `}</style>
  ) : null;
}

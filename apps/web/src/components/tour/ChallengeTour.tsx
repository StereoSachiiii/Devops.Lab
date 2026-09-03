"use client";

/**
 * ChallengeTour - new-user onboarding tour for the challenge workspace page.
 *
 * Built with Driver.js:
 *   - Framework-agnostic, MIT-licensed, smallest bundle of the viable options
 *   - Spotlight highlighting works correctly in dark mode (no mix-blend-mode issues)
 *   - Easy to skin to match the amber/teal/dark design system
 *
 * Tour steps (5 total, short enough for a challenge-page orientation):
 *   1. Terminal chrome - "your interactive sandbox"
 *   2. Config editor  - "reference material, read-only"
 *   3. Validate button - "check your work"
 *   4. Persistence note - "what survives a restart" (per Katacoda precedent:
 *      be explicit about what does and doesn't persist, rather than leaving
 *      the user to discover it the hard way)
 *   5. (End) Fires POST /api/me/onboarding-status/complete
 *
 * Gating:
 *   - The parent calls GET /api/me/onboarding-status on mount.
 *   - Only renders if state === 'NEW'. Never reads the JWT claim for this decision.
 *   - onComplete fires the explicit mutation, not an inferred action.
 */

import { useEffect, useRef } from "react";
import { apiClient } from "@/lib/apiClient";
import { API_ROUTES } from "@/lib/api-routes";

interface ChallengeTourProps {
  /** Whether to show the tour. Caller checks onboarding status. */
  show: boolean;
  /** Called when the user dismisses or completes the tour. */
  onDone: () => void;
}

// Driver.js is dynamically imported to avoid SSR errors
let driverModule: typeof import("driver.js") | null = null;

const TOUR_STEPS = [
  {
    element: "#terminal-chrome",
    popover: {
      title: "Your interactive sandbox",
      description:
        "This is your live container environment. Type commands here exactly as you would in a real terminal - the sandbox is isolated and safe to experiment in.",
      side: "top" as const,
      align: "center" as const,
    },
  },
  {
    element: "#config-editor",
    popover: {
      title: "Reference configuration",
      description:
        "This shows the challenge's starting configuration or template. It's read-only - use the terminal to make actual changes inside the sandbox.",
      side: "left" as const,
      align: "center" as const,
    },
  },
  {
    element: "#validate-button",
    popover: {
      title: "Check your work",
      description:
        "When you think you've solved it, hit Validate. The checker runs automatically and tells you which conditions passed and which still need work.",
      side: "top" as const,
      align: "end" as const,
    },
  },
  {
    element: "#session-controls",
    popover: {
      title: "What survives a restart",
      description:
        "Your edited files and verified check results are saved even if the sandbox stops unexpectedly. Your live terminal session (scrollback, running processes) doesn't - but you won't lose your actual work.",
      side: "right" as const,
      align: "center" as const,
    },
  },
];

export default function ChallengeTour({ show, onDone }: ChallengeTourProps) {
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!show || hasRunRef.current) return;
    hasRunRef.current = true;

    async function startTour() {
      if (!driverModule) {
        driverModule = await import("driver.js");
        // Import Driver.js CSS
        await import("driver.js/dist/driver.css" as any);
      }

      const { driver } = driverModule;

      const tourDriver = driver({
        // Override Driver.js default styles to match the dark design system
        // The CSS variables below override driver.js's default light-mode look
        popoverClass: "devops-tour-popover",
        showProgress: true,
        animate: true,
        overlayColor: "rgba(7, 9, 12, 0.7)",
        smoothScroll: true,

        onDestroyStarted: () => {
          // Fire the completion mutation regardless of whether the user dismissed
          // or finished - this prevents the tour from reappearing on next visit.
          apiClient.post(API_ROUTES.onboarding.complete).catch(() => {
            // Non-fatal: if this fails, the user sees the tour again next visit.
            // That's acceptable - they won't be stuck in a loop.
          });
          onDone();
          tourDriver.destroy();
        },

        steps: TOUR_STEPS,
      });

      // Small delay so the page has fully rendered before tour begins
      setTimeout(() => tourDriver.drive(), 400);
    }

    startTour().catch(console.error);
  }, [show, onDone]);

  // Also inject custom CSS overrides for the Driver.js popover
  // to match the dark amber/teal design system
  return show ? (
    <style>{`
      .devops-tour-popover {
        background: #10141b !important;
        border: 1px solid #1d232e !important;
        border-radius: 10px !important;
        color: #eef1f6 !important;
        font-family: var(--font-mono) !important;
        box-shadow: 0 20px 40px -10px rgba(0,0,0,0.6) !important;
        max-width: 320px !important;
      }
      .devops-tour-popover .driver-popover-title {
        font-size: 13px !important;
        font-weight: 700 !important;
        color: #ff9d5c !important;
        letter-spacing: 0.02em !important;
        margin-bottom: 8px !important;
      }
      .devops-tour-popover .driver-popover-description {
        font-size: 12px !important;
        color: #7c8698 !important;
        line-height: 1.6 !important;
        font-family: inherit !important;
      }
      .devops-tour-popover .driver-popover-progress-text {
        font-size: 10px !important;
        color: #4b5262 !important;
        font-family: inherit !important;
      }
      .devops-tour-popover .driver-popover-prev-btn,
      .devops-tour-popover .driver-popover-next-btn {
        background: transparent !important;
        border: 1px solid #1d232e !important;
        color: #eef1f6 !important;
        border-radius: 5px !important;
        font-family: inherit !important;
        font-size: 11px !important;
        padding: 5px 12px !important;
        cursor: pointer !important;
        transition: border-color 0.2s, color 0.2s !important;
      }
      .devops-tour-popover .driver-popover-next-btn {
        background: rgba(255,157,92,0.15) !important;
        border-color: rgba(255,157,92,0.3) !important;
        color: #ff9d5c !important;
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

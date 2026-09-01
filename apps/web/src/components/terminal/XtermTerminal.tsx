"use client";

/**
 * XtermTerminal - a real xterm.js terminal wired to the state machine's WebSocket.
 *
 * Stack (per design report, Part 3):
 *   @xterm/xterm           - terminal emulator
 *   @xterm/addon-fit       - responsive resize (debounced ResizeObserver)
 *   @xterm/addon-webgl     - GPU-accelerated renderer for smooth scrollback
 *
 * Theme is derived from existing CSS tokens (globals.css):
 *   background  #07090c   (near-black, matches .term chrome)
 *   foreground  #eef1f6   (primary text)
 *   cursor      #ff9d5c   (amber - matches --auth-amber)
 *   green ANSI  #35d6b4   (teal - matches --auth-teal)
 *   red ANSI    #ff6b6b   (matches --auth-red)
 *
 * Font: JetBrains Mono - already loaded by the landing page, so no extra request.
 * Ligatures are off by default - they can misrender certain shell output.
 *
 * Padding lives on the container div (via the TerminalChrome wrapper), not inside
 * xterm's internal options, for more predictable layout control.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import type { WebglAddon } from "@xterm/addon-webgl";

// Dynamically imported to avoid SSR errors (xterm touches window/document)
let xtermModule: typeof import("@xterm/xterm") | null = null;
let fitModule: typeof import("@xterm/addon-fit") | null = null;
let webglModule: typeof import("@xterm/addon-webgl") | null = null;

interface XtermTerminalProps {
  /** The live WebSocket. When non-null, terminal I/O is wired to it. */
  socket: WebSocket | null;
  /** Whether to dim the terminal content (used during RECONNECTING state). */
  dimmed?: boolean;
  /** Callback fired when the user resizes the terminal, with new cols/rows. */
  onResize?: (cols: number, rows: number) => void;
  /** Injected lines for provisioning skeleton state. */
  statusLines?: string[];
  className?: string;
}

// The xterm.js theme object, derived from the design system tokens in globals.css.
// Keep this in sync with --auth-* CSS custom properties.
const XTERM_THEME = {
  background: "#07090c",
  foreground: "#eef1f6",
  cursor: "#ff9d5c",
  cursorAccent: "#07090c",
  selectionBackground: "rgba(255,157,92,0.2)",
  black: "#1a1e27",
  red: "#ff6b6b",
  green: "#35d6b4",
  yellow: "#ffca5c",
  blue: "#7c9cff",
  magenta: "#c99dff",
  cyan: "#35d6b4",
  white: "#eef1f6",
  brightBlack: "#4b5262",
  brightRed: "#ff6b6b",
  brightGreen: "#35d6b4",
  brightYellow: "#ffca5c",
  brightBlue: "#7c9cff",
  brightMagenta: "#c99dff",
  brightCyan: "#35d6b4",
  brightWhite: "#ffffff",
};

export default function XtermTerminal({
  socket,
  dimmed = false,
  onResize,
  statusLines,
  className,
}: XtermTerminalProps) {
  const [isTermReady, setIsTermReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const webglAddonRef = useRef<WebglAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  // ── Initialize xterm.js ───────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    // Prevent double-init in StrictMode
    if (termRef.current) return;

    let term: Terminal;
    let fitAddon: FitAddon;
    let webglAddon: WebglAddon;

    async function init() {
      // Dynamic imports so xterm never runs during SSR
      if (!xtermModule) xtermModule = await import("@xterm/xterm");
      if (!fitModule) fitModule = await import("@xterm/addon-fit");
      if (!webglModule) webglModule = await import("@xterm/addon-webgl");

      term = new xtermModule.Terminal({
        fontFamily: "var(--font-mono), 'JetBrains Mono', 'Cascadia Code', 'Fira Code', Menlo, Monaco, 'Courier New', monospace",
        fontSize: 15,
        lineHeight: 1.35,
        letterSpacing: 0,
        cursorBlink: true,
        cursorStyle: "block",
        theme: XTERM_THEME,
        // Dynamically adjust foreground to maintain readability over colored backgrounds.
        // Particularly useful when the validator emits colored diffs on dark backgrounds.
        minimumContrastRatio: 4.5,
        allowTransparency: true,
        scrollback: 2000,
        // Note: ligature control is via font family choice - not including a
        // ligature font (e.g. Fira Code features) is sufficient for shell output safety.
      });

      fitAddon = new fitModule.FitAddon();
      term.loadAddon(fitAddon);

      try {
        webglAddon = new webglModule.WebglAddon();
        term.loadAddon(webglAddon);
      } catch {
        // WebGL not available (headless, some VMs) - fall back to canvas renderer silently
      }

      term.open(containerRef.current!);
      fitAddon.fit();

      termRef.current = term;
      fitAddonRef.current = fitAddon;
      webglAddonRef.current = webglAddon;
      setIsTermReady(true);

      // Wire resize to the parent callback
      term.onResize(({ cols, rows }) => {
        onResize?.(cols, rows);
      });

      // Debounced ResizeObserver - xterm docs explicitly recommend debouncing
      // resize calls so the pty can respond before the next resize event fires.
      const observer = new ResizeObserver(() => {
        if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
        resizeDebounceRef.current = setTimeout(() => {
          if (
            fitAddonRef.current &&
            termRef.current &&
            containerRef.current &&
            containerRef.current.clientWidth > 100
          ) {
            try {
              fitAddonRef.current.fit();
            } catch {
              /* ignore */
            }
          }
        }, 50);
      });
      observer.observe(containerRef.current!);
      resizeObserverRef.current = observer;

      // Show status lines if provided (provisioning skeleton state)
      if (statusLines?.length) {
        statusLines.forEach((line) => term.writeln(line));
      }
    }

    init().catch(console.error);

    return () => {
      if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
      if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
      if (webglAddonRef.current) {
        try {
          webglAddonRef.current.dispose();
        } catch {
          /* ignore */
        }
      }
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
      fitAddonRef.current = null;
      setIsTermReady(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Wire / rewire WebSocket ───────────────────────────────────────────────
  useEffect(() => {
    const term = termRef.current;
    if (!isTermReady || !term || !socket) return;

    socketRef.current = socket;
    socket.binaryType = "arraybuffer";

    // PTY → xterm: incoming binary frames are raw terminal output
    const onMessage = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(event.data));
      } else if (typeof event.data === "string") {
        // Text frames are control messages (pong etc.) - not terminal output
        return;
      } else {
        // Blob (some browsers)
        event.data.arrayBuffer().then((buf: ArrayBuffer) => term.write(new Uint8Array(buf)));
      }
    };

    // xterm → PTY: keystrokes are binary frames
    const dataDisposable = term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(new TextEncoder().encode(data));
      }
    });

    socket.addEventListener("message", onMessage);

    // Send initial resize & focus so server knows our dimensions and keyboard is active
    setTimeout(() => {
      if (fitAddonRef.current && containerRef.current && containerRef.current.clientWidth > 100) {
        try {
          fitAddonRef.current.fit();
        } catch {
          /* ignore */
        }
      }
      term.focus();
    }, 60);

    return () => {
      socket.removeEventListener("message", onMessage);
      dataDisposable.dispose();
    };
  }, [socket, isTermReady]);

  // ── Send resize events to server ──────────────────────────────────────────
  const sendResize = useCallback((cols: number, rows: number) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    // Guard against corrupting PTY layout with 0/1 column resizes before DOM layout stabilizes
    if (cols < 10 || rows < 5) return;
    ws.send(JSON.stringify({ type: "resize", cols, rows }));
  }, []);

  // Wire resize callback
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const d = term.onResize(({ cols, rows }) => sendResize(cols, rows));
    return () => d.dispose();
  }, [sendResize]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        opacity: dimmed ? 0.5 : 1,
        transition: "opacity 0.2s ease",
        // Padding via container, not xterm's internal options (more reliable)
        padding: "8px",
        boxSizing: "border-box",
        backgroundColor: XTERM_THEME.background,
      }}
    />
  );
}

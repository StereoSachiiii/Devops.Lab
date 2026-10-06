"use client";

import React from "react";

interface CommandHighlightProps {
  code: string;
  language?: "bash" | "promql" | "k8s";
  showPrompt?: boolean;
}

export function CommandHighlight({
  code,
  language = "bash",
  showPrompt = false,
}: CommandHighlightProps) {
  const tokenize = (line: string): React.ReactNode[] => {
    // If it's a comment
    if (line.trim().startsWith("#") || line.trim().startsWith("//")) {
      return [<span key="comment" className="token-comment">{line}</span>];
    }

    const tokens: React.ReactNode[] = [];
    // Tokenize bash/CLI commands or promql expressions
    const regex = /(["'].*?["']|\b[A-Za-z_][A-Za-z0-9_]*(?=\()|\$[A-Za-z0-9_{}]+|--?[A-Za-z0-9_-]+(?:=[^\s]+)?|&&|\|\||[|;><]|sum|rate|avg|count|by|pod|namespace|http_requests_total|container_cpu_usage_seconds_total|sandbox_active_containers|\b\d+\b|\b(?:kubectl|docker|helm|kind|powershell|npm|git|curl|bash|node|cat|grep|sed|awk|systemctl|journalctl)\b|[^\s]+|\s+)/g;

    let match;
    let idx = 0;
    let isFirstWord = true;

    while ((match = regex.exec(line)) !== null) {
      const token = match[0];
      const key = `tok-${idx++}`;

      if (/^\s+$/.test(token)) {
        tokens.push(token);
        continue;
      }

      if (/^["'].*?["']$/.test(token)) {
        tokens.push(<span key={key} className="token-string">{token}</span>);
      } else if (/^--?[A-Za-z0-9_-]/.test(token)) {
        tokens.push(<span key={key} className="token-flag">{token}</span>);
      } else if (/^\$[A-Za-z0-9_{}]+/.test(token)) {
        tokens.push(<span key={key} className="token-var">{token}</span>);
      } else if (/^(?:&&|\|\||[|;><])$/.test(token)) {
        tokens.push(<span key={key} className="token-op">{token}</span>);
        isFirstWord = true;
      } else if (/^(?:kubectl|docker|helm|kind|powershell|npm|git|curl|bash|node|cat|grep|sed|awk|systemctl|journalctl)$/.test(token)) {
        tokens.push(<span key={key} className="token-cmd">{token}</span>);
        isFirstWord = false;
      } else if (/^(?:sum|rate|avg|count|by)$/.test(token)) {
        tokens.push(<span key={key} className="token-func">{token}</span>);
      } else if (/^\d+$/.test(token)) {
        tokens.push(<span key={key} className="token-number">{token}</span>);
      } else if (isFirstWord && /^[A-Za-z0-9_.-]+$/.test(token)) {
        tokens.push(<span key={key} className="token-cmd">{token}</span>);
        isFirstWord = false;
      } else if (/^(?:apply|create|delete|get|describe|logs|exec|port-forward|rollout|run|build|push|pull|status|restart)$/.test(token)) {
        tokens.push(<span key={key} className="token-subcmd">{token}</span>);
      } else {
        tokens.push(<span key={key} className="token-arg">{token}</span>);
      }
    }

    return tokens;
  };

  const lines = code.split("\n");

  return (
    <pre className="cmd-code">
      <code>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "flex", gap: "8px" }}>
            {showPrompt && <span className="token-prompt">$</span>}
            <span>{tokenize(l)}</span>
          </div>
        ))}
      </code>
    </pre>
  );
}

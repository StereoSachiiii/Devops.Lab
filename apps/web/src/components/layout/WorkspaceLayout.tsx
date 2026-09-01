// import React from "react";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";

export function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-bg">
      <div className="flex-1 flex flex-col w-full px-8 box-border">{children}</div>
      <AssistantWidget />
    </div>
  );
}

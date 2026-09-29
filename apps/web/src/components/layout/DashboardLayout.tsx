// import React from "react";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col bg-bg w-full">
      <div className="flex-1 w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-10 py-6">
        {children}
      </div>
      <AssistantWidget />
    </div>
  );
}

// import React from "react";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col bg-bg w-full">
      <div className="flex-1 w-full max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </div>
      <AssistantWidget />
    </div>
  );
}

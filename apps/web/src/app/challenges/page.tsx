"use client";

import { Suspense } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { CatalogContent } from "@/components/dashboard/CatalogContent";

export default function ChallengesPage() {
  return (
    <DashboardLayout>
      <Suspense
        fallback={<div className="p-10 text-center text-panel-muted">Loading catalog...</div>}
      >
        <CatalogContent />
      </Suspense>
    </DashboardLayout>
  );
}

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { RoadmapsContent } from "@/components/dashboard/RoadmapsContent";

export default function RoadmapsPage(props: any) {
  return (
    <DashboardLayout>
      <RoadmapsContent {...props} />
    </DashboardLayout>
  );
}

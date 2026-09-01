import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { LeaderboardContent } from "@/components/dashboard/LeaderboardContent";

export default function LeaderboardPage(props: any) {
  return (
    <DashboardLayout>
      <LeaderboardContent {...props} />
    </DashboardLayout>
  );
}

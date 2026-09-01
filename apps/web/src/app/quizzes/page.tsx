import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { QuizzesContent } from "@/components/dashboard/QuizzesContent";

export default function QuizzesPage(props: any) {
  return (
    <DashboardLayout>
      <QuizzesContent {...props} />
    </DashboardLayout>
  );
}

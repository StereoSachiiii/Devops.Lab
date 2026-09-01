import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SettingsContent } from "@/components/dashboard/SettingsContent";

export default function SettingsPage(props: any) {
  return (
    <DashboardLayout>
      <SettingsContent {...props} />
    </DashboardLayout>
  );
}

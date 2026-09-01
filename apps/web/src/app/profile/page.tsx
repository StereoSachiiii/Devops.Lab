import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProfileContent } from "@/components/profile/ProfileContent";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile | DevOps.lab",
  description: "View your progress and global history.",
};

export default function ProfilePage() {
  return (
    <DashboardLayout>
      <ProfileContent />
    </DashboardLayout>
  );
}

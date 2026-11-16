import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";
import { PageHeader } from "@/components/ui/kit";

export const metadata = { title: "Profile & settings" };

export default function ProfilePage() {
  return (
    <main className="flex flex-col gap-4">
      <PageHeader title="Profile" back="/more" />
      <ProfileForm />
      <PasswordForm />
    </main>
  );
}

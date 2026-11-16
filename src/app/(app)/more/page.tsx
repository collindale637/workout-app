import { ProfileForm } from "./profile-form";

export const metadata = { title: "More" };

export default function MorePage() {
  return (
    <main className="mt-4 flex flex-col gap-4">
      <h1 className="display text-4xl font-extrabold">More</h1>
      <ProfileForm />
    </main>
  );
}

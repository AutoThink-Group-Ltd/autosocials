import { ProfileForm } from "@/features/profile/ProfileForm";

export default function AgencyProfilePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6 md:p-10">
      <header>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.02em] text-foreground">My profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your photo and name, shown across the agency area and client workspaces.</p>
      </header>
      <ProfileForm />
    </div>
  );
}

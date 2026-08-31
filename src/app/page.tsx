import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import LandingPage from "@/components/landing-page";
import AppShell from "@/components/app-shell";

export default async function Page() {
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    return (
      <AppShell
        user={{
          name: session.user.name ?? "Pengguna",
          email: session.user.email ?? "",
        }}
      />
    );
  }

  return <LandingPage />;
}

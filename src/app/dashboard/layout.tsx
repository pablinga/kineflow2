import { AuthSessionProvider } from "@/contexts/AuthSessionContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthSessionProvider>{children}</AuthSessionProvider>;
}

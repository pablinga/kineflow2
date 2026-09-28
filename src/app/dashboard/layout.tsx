import { AuthSessionProvider } from "@/contexts/AuthSessionContext";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { PwaServiceWorkerRegistration } from "@/components/PwaServiceWorkerRegistration";
import { RoleRouteGuard } from "@/components/layout/RoleRouteGuard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthSessionProvider>
      <RoleRouteGuard>{children}</RoleRouteGuard>
      <PwaServiceWorkerRegistration />
      <PwaInstallPrompt />
    </AuthSessionProvider>
  );
}

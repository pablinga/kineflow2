import { AuthSessionProvider } from "@/contexts/AuthSessionContext";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { PwaServiceWorkerRegistration } from "@/components/PwaServiceWorkerRegistration";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthSessionProvider>
      {children}
      <PwaServiceWorkerRegistration />
      <PwaInstallPrompt />
    </AuthSessionProvider>
  );
}

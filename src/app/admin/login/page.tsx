import { notFound, redirect } from "next/navigation";
import { hasAdminSession, isAdminPanelEnabled } from "@/lib/admin-auth";
import { AdminLoginForm } from "./AdminLoginForm";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (!isAdminPanelEnabled()) {
    notFound();
  }

  if (await hasAdminSession()) {
    redirect("/admin");
  }

  return <AdminLoginForm />;
}

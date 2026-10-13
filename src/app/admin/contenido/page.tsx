import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { hasAdminSession, isAdminPanelEnabled } from "@/lib/admin-auth";
import { getPublishMode, listContent, signImageUrls } from "@/lib/content/server";
import { AdminLogoutButton } from "../AdminLogoutButton";
import { ContentPanel, type PanelPost } from "./ContentPanel";

export const dynamic = "force-dynamic";

export default async function AdminContentPage() {
  if (!isAdminPanelEnabled()) {
    notFound();
  }

  if (!(await hasAdminSession())) {
    redirect("/admin/login");
  }

  let posts: PanelPost[] = [];
  let loadError = "";

  try {
    const rows = await listContent();
    const paths = [...new Set(rows.flatMap((row) => row.image_paths))];
    // URLs firmadas de 1 hora solo para la vista previa del panel.
    const signed = paths.length > 0 ? await signImageUrls(paths, 60 * 60) : [];
    const urlByPath = new Map(paths.map((path, index) => [path, signed[index]]));

    posts = rows.map((row) => ({
      approvedBy: row.approved_by,
      attempts: row.attempts,
      campaign: row.campaign,
      caption: row.caption,
      channel: row.channel,
      createdBy: row.created_by,
      error: row.error,
      format: row.format,
      groupId: row.group_id,
      hashtags: row.hashtags,
      id: row.id,
      imageUrls: row.image_paths.map((path) => urlByPath.get(path) ?? ""),
      linkUrl: row.link_url,
      permalink: row.permalink,
      publishedAt: row.published_at,
      scheduledAt: row.scheduled_at,
      size: (row.template_fields?.size as string) === "square" ? "square" : "feed",
      status: row.status,
    }));
  } catch (error) {
    console.error("[content] panel", error);
    loadError = "No pudimos cargar la cola de contenido.";
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex items-center justify-between gap-4">
        <Logo compact />
        <AdminLogoutButton />
      </header>
      <Link
        className="mt-6 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-ocean-700"
        href="/admin"
      >
        <ChevronLeft aria-hidden className="h-4 w-4" />
        Reporte semanal
      </Link>
      <ContentPanel loadError={loadError} mode={getPublishMode()} posts={posts} />
    </main>
  );
}

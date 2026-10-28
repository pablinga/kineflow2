import { getSupabaseServerClient } from "@/lib/supabase-server";

/** Id del usuario del header `Authorization: Bearer <token de Supabase>`. */
export async function getAuthenticatedUserId(request: Request) {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!accessToken) {
    return null;
  }

  const supabase = getSupabaseServerClient(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  return data.user.id;
}

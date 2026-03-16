import { createServerClient as createSSRClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@feedbackiq/supabase";

export async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createSSRClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Cookies can only be modified in a Server Action or Route Handler
          }
        },
      },
    }
  );
}

export async function getUser() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getOrganization() {
  const supabase = await createSupabaseServer();
  const user = await getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(*)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return null;

  return {
    ...(membership.organizations as Record<string, unknown>),
    role: membership.role,
  };
}

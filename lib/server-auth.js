import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function createAuthClient() {
  return createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export function createAdminClient() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export function hasServerKeys() {
  return Boolean(supabaseUrl && publishableKey && serviceRoleKey);
}

export async function getAuthenticatedUser(request) {
  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!accessToken) return { error: "ログインが必要です。" };

  const authClient = createAuthClient();
  const { data, error } = await authClient.auth.getUser(accessToken);

  if (error || !data?.user) return { error: "ログイン情報を確認できません。" };
  return { user: data.user };
}

export async function requireAdmin(request) {
  const authenticated = await getAuthenticatedUser(request);
  if (authenticated.error) return authenticated;

  const adminClient = createAdminClient();
  const { data: profile, error } = await adminClient
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", authenticated.user.id)
    .single();

  if (error || profile?.role !== "admin" || !profile?.is_active) {
    return { error: "管理者権限が必要です。" };
  }

  return { user: authenticated.user, profile, adminClient };
}

export function normalizeLoginId(value) {
  return String(value || "").trim();
}

export function internalEmail(loginId) {
  return `${loginId}@night-crm.invalid`;
}

export function generateTemporaryPassword(length = 12) {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%";
  const all = upper + lower + digits + symbols;

  const required = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    symbols[crypto.randomInt(symbols.length)]
  ];

  while (required.length < length) {
    required.push(all[crypto.randomInt(all.length)]);
  }

  for (let i = required.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [required[i], required[j]] = [required[j], required[i]];
  }

  return required.join("");
}

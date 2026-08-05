import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request) {
  try {
    if (!url || !publishableKey || !serviceRoleKey) {
      return NextResponse.json({ error: "サーバー側のSupabase設定が不足しています。" }, { status: 500 });
    }

    const authorization = request.headers.get("authorization") || "";
    const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!accessToken) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

    const authClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      return NextResponse.json({ error: "ログイン情報を確認できません。" }, { status: 401 });
    }

    const { data: requester } = await adminClient
      .from("profiles")
      .select("role,is_active")
      .eq("id", userData.user.id)
      .single();

    if (requester?.role !== "admin" || !requester?.is_active) {
      return NextResponse.json({ error: "管理者権限が必要です。" }, { status: 403 });
    }

    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const loginId = String(body.loginId || "").trim().toLowerCase();
    const displayName = String(body.displayName || "").trim();

    if (!email.includes("@")) return NextResponse.json({ error: "正しいメールアドレスを入力してください。" }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "パスワードは8文字以上にしてください。" }, { status: 400 });
    if (!/^[a-z0-9._-]{3,20}$/.test(loginId)) {
      return NextResponse.json({ error: "ログインIDは半角英小文字・数字・._-で3〜20文字にしてください。" }, { status: 400 });
    }
    if (!displayName) return NextResponse.json({ error: "キャスト名を入力してください。" }, { status: 400 });

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (createError || !created?.user) {
      return NextResponse.json({ error: createError?.message || "認証ユーザーを作成できませんでした。" }, { status: 400 });
    }

    const { error: profileError } = await adminClient.from("profiles").insert({
      id: created.user.id,
      login_id: loginId,
      display_name: displayName,
      role: "cast",
      is_active: true,
      must_change_password: true
    });

    if (profileError) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, cast: { id: created.user.id, display_name: displayName } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "予期しないエラーです。" }, { status: 500 });
  }
}

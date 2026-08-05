import { NextResponse } from "next/server";
import {
  generateTemporaryPassword,
  hasServerKeys,
  internalEmail,
  normalizeLoginId,
  requireAdmin
} from "../../../../lib/server-auth";

export async function POST(request) {
  try {
    if (!hasServerKeys()) {
      return NextResponse.json(
        { error: "サーバー側のSupabase設定が不足しています。" },
        { status: 500 }
      );
    }

    const admin = await requireAdmin(request);
    if (admin.error) {
      return NextResponse.json(
        { error: admin.error },
        { status: admin.error.includes("管理者") ? 403 : 401 }
      );
    }

    const body = await request.json();
    const loginId = normalizeLoginId(body.loginId);
    const displayName = String(body.displayName || "").trim();

    if (!/^\d{1,3}$/.test(loginId)) {
      return NextResponse.json(
        { error: "ログインIDは1〜3桁の数字で入力してください。" },
        { status: 400 }
      );
    }

    if (!displayName) {
      return NextResponse.json(
        { error: "キャスト名を入力してください。" },
        { status: 400 }
      );
    }

    const { data: duplicate } = await admin.adminClient
      .from("profiles")
      .select("id")
      .eq("login_id", loginId)
      .eq("is_active", true)
      .maybeSingle();

    if (duplicate) {
      return NextResponse.json(
        { error: `ログインID「${loginId}」はすでに使用されています。` },
        { status: 400 }
      );
    }

    const email = internalEmail(loginId);
    const temporaryPassword = generateTemporaryPassword();

    const { data: created, error: createError } =
      await admin.adminClient.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true
      });

    if (createError || !created?.user) {
      return NextResponse.json(
        { error: createError?.message || "認証ユーザーを作成できませんでした。" },
        { status: 400 }
      );
    }

    const { error: profileError } = await admin.adminClient.from("profiles").insert({
      id: created.user.id,
      login_id: loginId,
      display_name: displayName,
      role: "cast",
      is_active: true,
      must_change_password: true
    });

    if (profileError) {
      await admin.adminClient.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      cast: {
        id: created.user.id,
        login_id: loginId,
        display_name: displayName
      },
      temporaryPassword
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "予期しないエラーです。" },
      { status: 500 }
    );
  }
}

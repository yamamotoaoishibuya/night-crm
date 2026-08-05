import { NextResponse } from "next/server";
import {
  archivedInternalEmail,
  hasServerKeys,
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
    const userId = String(body.userId || "");

    const { data: target, error: targetError } = await admin.adminClient
      .from("profiles")
      .select("id, login_id, display_name, role, is_active")
      .eq("id", userId)
      .single();

    if (targetError || target?.role !== "cast") {
      return NextResponse.json(
        { error: "対象のキャストを確認できません。" },
        { status: 404 }
      );
    }

    if (!target.is_active) {
      return NextResponse.json({ ok: true, alreadyHidden: true });
    }

    const hiddenEmail = archivedInternalEmail(target.login_id, target.id);

    const { error: authError } =
      await admin.adminClient.auth.admin.updateUserById(target.id, {
        email: hiddenEmail,
        email_confirm: true
      });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const { error: profileError } = await admin.adminClient
      .from("profiles")
      .update({ is_active: false })
      .eq("id", target.id);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      displayName: target.display_name,
      loginId: target.login_id
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "予期しないエラーです。" },
      { status: 500 }
    );
  }
}

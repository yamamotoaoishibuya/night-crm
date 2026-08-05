import { NextResponse } from "next/server";
import {
  createAdminClient,
  getAuthenticatedUser,
  hasServerKeys
} from "../../../../lib/server-auth";

export async function POST(request) {
  try {
    if (!hasServerKeys()) {
      return NextResponse.json(
        { error: "サーバー側のSupabase設定が不足しています。" },
        { status: 500 }
      );
    }

    const authenticated = await getAuthenticatedUser(request);
    if (authenticated.error) {
      return NextResponse.json({ error: authenticated.error }, { status: 401 });
    }

    const body = await request.json();
    const newPassword = String(body.newPassword || "");

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "新しいパスワードは8文字以上にしてください。" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    const { error: passwordError } =
      await adminClient.auth.admin.updateUserById(authenticated.user.id, {
        password: newPassword
      });

    if (passwordError) {
      return NextResponse.json({ error: passwordError.message }, { status: 400 });
    }

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", authenticated.user.id);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "予期しないエラーです。" },
      { status: 500 }
    );
  }
}

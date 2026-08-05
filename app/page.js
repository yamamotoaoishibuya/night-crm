"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const emptyCustomer = {
  id: "",
  name: "",
  line_name: "",
  phone: "",
  job: "",
  birthday: "",
  rank: "通常",
  last_visit: "",
  spend: "",
  favorite_drink: "",
  memo: "",
  owner_id: ""
};

export default function Home() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadApp();
    else {
      setProfile(null);
      setProfiles([]);
      setCustomers([]);
    }
  }, [session]);

  async function loadApp() {
    setBusy(true);

    const { data: me, error: meError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if (meError || !me?.is_active) {
      setMessage("このアカウントは利用できません。");
      await supabase.auth.signOut();
      setBusy(false);
      return;
    }

    setProfile(me);

    const { data: people } = await supabase
      .from("profiles")
      .select("id, login_id, display_name, role, is_active")
      .order("display_name");

    setProfiles(people || []);
    await loadCustomers();
    setBusy(false);
  }

  async function loadCustomers() {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("last_visit", { ascending: false, nullsFirst: false });

    if (error) {
      setMessage("顧客データを取得できませんでした。");
      return;
    }
    setCustomers(data || []);
  }

  async function signIn(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const email = login.includes("@")
      ? login.trim()
      : `${login.trim().toLowerCase()}@night-crm.invalid`;

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) setMessage("ログイン情報が違います。");
    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const filteredCustomers = useMemo(() => {
    const word = query.trim().toLowerCase();

    return customers.filter((customer) => {
      if (ownerFilter && customer.owner_id !== ownerFilter) return false;
      if (!word) return true;

      return [
        customer.name,
        customer.line_name,
        customer.phone,
        customer.job,
        customer.rank,
        customer.favorite_drink,
        customer.memo
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(word);
    });
  }, [customers, ownerFilter, query]);

  function castName(id) {
    return profiles.find((item) => item.id === id)?.display_name || "未設定";
  }

  function openNewCustomer() {
    setEditing({
      ...emptyCustomer,
      owner_id:
        profile.role === "admin"
          ? profiles.find((item) => item.role === "cast" && item.is_active)?.id || profile.id
          : profile.id
    });
  }

  async function saveCustomer(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const payload = {
      name: editing.name.trim(),
      line_name: editing.line_name || null,
      phone: editing.phone || null,
      job: editing.job || null,
      birthday: editing.birthday || null,
      rank: editing.rank,
      last_visit: editing.last_visit || null,
      spend: Number(editing.spend || 0),
      favorite_drink: editing.favorite_drink || null,
      memo: editing.memo || null,
      owner_id: profile.role === "admin" ? editing.owner_id : profile.id,
      created_by: editing.id ? undefined : profile.id
    };

    if (!payload.name) {
      setMessage("顧客名を入力してください。");
      setBusy(false);
      return;
    }

    const cleanPayload = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined)
    );

    const result = editing.id
      ? await supabase.from("customers").update(cleanPayload).eq("id", editing.id)
      : await supabase.from("customers").insert(cleanPayload);

    if (result.error) {
      setMessage(`保存できませんでした：${result.error.message}`);
    } else {
      setEditing(null);
      setMessage("保存しました。");
      await loadCustomers();
    }
    setBusy(false);
  }

  async function deleteCustomer() {
    if (!editing?.id || profile.role !== "admin") return;
    if (!window.confirm("この顧客を削除しますか？")) return;

    setBusy(true);
    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", editing.id);

    if (error) setMessage("削除できませんでした。");
    else {
      setEditing(null);
      setMessage("削除しました。");
      await loadCustomers();
    }
    setBusy(false);
  }

  if (!session) {
    return (
      <main className="loginPage">
        <form className="loginCard" onSubmit={signIn}>
          <div className="logo">Night CRM</div>
          <p className="muted">店舗専用 顧客管理</p>

          <label>ログインIDまたは管理者メール</label>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            placeholder="admin またはメールアドレス"
          />

          <label>パスワード</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
          />

          <button className="primary full" disabled={busy}>
            {busy ? "確認中…" : "ログイン"}
          </button>

          {message && <p className="error">{message}</p>}
        </form>
      </main>
    );
  }

  return (
    <div>
      <header>
        <div>
          <h1>顧客一覧</h1>
          <div className="muted small">
            {profile?.display_name}・
            {profile?.role === "admin" ? "管理者" : "本人の顧客のみ"}
          </div>
        </div>
        <button className="secondary" onClick={signOut}>ログアウト</button>
      </header>

      <section className="searchBar">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前・LINE名・電話・職業・メモを検索"
        />

        {profile?.role === "admin" && (
          <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
            <option value="">全キャスト</option>
            {profiles
              .filter((item) => item.role === "cast")
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.display_name}
                </option>
              ))}
          </select>
        )}
      </section>

      <main className="content">
        <div className="toolbar">
          <span className="muted">{filteredCustomers.length}件表示</span>
          <button className="primary" onClick={openNewCustomer}>
            ＋ 顧客登録
          </button>
        </div>

        {message && <div className="notice">{message}</div>}

        <div className="list">
          {filteredCustomers.map((customer) => (
            <article className="customerCard" key={customer.id}>
              <div className="customerName">{customer.name}</div>
              <div className="meta">
                担当：{castName(customer.owner_id)}　
                最終来店：{customer.last_visit || "未登録"}
                <br />
                LINE：{customer.line_name || "未登録"}　
                電話：{customer.phone || "未登録"}
                <br />
                利用金額：¥{Number(customer.spend || 0).toLocaleString()}
              </div>

              <div className="tags">
                <span>{customer.rank}</span>
                {customer.job && <span>{customer.job}</span>}
                {customer.favorite_drink && <span>{customer.favorite_drink}</span>}
              </div>

              <button className="secondary editButton" onClick={() => setEditing({ ...customer })}>
                詳細・編集
              </button>
            </article>
          ))}

          {!busy && filteredCustomers.length === 0 && (
            <div className="empty">該当する顧客がありません。</div>
          )}
        </div>
      </main>

      {editing && (
        <div className="modalBackdrop" onMouseDown={() => setEditing(null)}>
          <form className="modal" onSubmit={saveCustomer} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h2>{editing.id ? "顧客詳細・編集" : "顧客登録"}</h2>
              <button type="button" className="secondary" onClick={() => setEditing(null)}>
                閉じる
              </button>
            </div>

            <div className="formGrid">
              <Field label="顧客名・ニックネーム">
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>

              <Field label="LINE名">
                <input value={editing.line_name || ""} onChange={(e) => setEditing({ ...editing, line_name: e.target.value })} />
              </Field>

              <Field label="電話番号">
                <input value={editing.phone || ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </Field>

              <Field label="職業・勤務先">
                <input value={editing.job || ""} onChange={(e) => setEditing({ ...editing, job: e.target.value })} />
              </Field>

              <Field label="誕生日">
                <input type="date" value={editing.birthday || ""} onChange={(e) => setEditing({ ...editing, birthday: e.target.value })} />
              </Field>

              <Field label="顧客ランク">
                <select value={editing.rank} onChange={(e) => setEditing({ ...editing, rank: e.target.value })}>
                  <option>通常</option>
                  <option>見込み</option>
                  <option>VIP</option>
                  <option>休眠</option>
                  <option>注意</option>
                </select>
              </Field>

              <Field label="最終来店日">
                <input type="date" value={editing.last_visit || ""} onChange={(e) => setEditing({ ...editing, last_visit: e.target.value })} />
              </Field>

              <Field label="利用金額">
                <input type="number" min="0" value={editing.spend || ""} onChange={(e) => setEditing({ ...editing, spend: e.target.value })} />
              </Field>

              {profile?.role === "admin" && (
                <Field label="担当キャスト">
                  <select value={editing.owner_id} onChange={(e) => setEditing({ ...editing, owner_id: e.target.value })}>
                    {profiles
                      .filter((item) => item.role === "cast" && item.is_active)
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.display_name}
                        </option>
                      ))}
                    <option value={profile.id}>管理者</option>
                  </select>
                </Field>
              )}

              <Field label="好きなお酒">
                <input value={editing.favorite_drink || ""} onChange={(e) => setEditing({ ...editing, favorite_drink: e.target.value })} />
              </Field>

              <div className="wide">
                <Field label="メモ・会話内容・注意事項">
                  <textarea value={editing.memo || ""} onChange={(e) => setEditing({ ...editing, memo: e.target.value })} />
                </Field>
              </div>
            </div>

            <div className="modalActions">
              {editing.id && profile?.role === "admin" ? (
                <button type="button" className="danger" onClick={deleteCustomer}>
                  削除
                </button>
              ) : <span />}

              <button className="primary" disabled={busy}>
                {busy ? "保存中…" : "保存"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

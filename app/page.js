"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const emptyCustomer = {
  id: "", name: "", line_name: "", phone: "", job: "", birthday: "",
  rank: "通常", last_visit: "", spend: "", favorite_drink: "", memo: "", owner_id: ""
};

const emptyCast = { displayName: "", loginId: "", email: "", password: "" };

export default function Home() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [globalQuery, setGlobalQuery] = useState("");
  const [castQuery, setCastQuery] = useState("");
  const [selectedCastId, setSelectedCastId] = useState("");
  const [editing, setEditing] = useState(null);
  const [castModal, setCastModal] = useState(false);
  const [newCast, setNewCast] = useState(emptyCast);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadApp();
    else {
      setProfile(null);
      setProfiles([]);
      setCustomers([]);
      setSelectedCastId("");
    }
  }, [session]);

  async function loadApp() {
    setBusy(true);
    const { data: me, error: meError } = await supabase
      .from("profiles").select("*").eq("id", session.user.id).single();

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
    if (me.role === "cast") setSelectedCastId(me.id);
    await loadCustomers();
    setBusy(false);
  }

  async function loadCustomers() {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("last_visit", { ascending: false, nullsFirst: false });

    if (error) setMessage("顧客データを取得できませんでした。");
    else setCustomers(data || []);
  }

  async function signIn(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const email = login.includes("@")
      ? login.trim()
      : `${login.trim().toLowerCase()}@night-crm.invalid`;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(`ログインできません：${error.message}`);
    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const isAdmin = profile?.role === "admin";
  const activeCasts = useMemo(
    () => profiles.filter((item) => item.role === "cast" && item.is_active),
    [profiles]
  );

  const castCounts = useMemo(() => {
    const counts = {};
    for (const customer of customers) counts[customer.owner_id] = (counts[customer.owner_id] || 0) + 1;
    return counts;
  }, [customers]);

  function castName(id) {
    return profiles.find((item) => item.id === id)?.display_name || "未設定";
  }

  const globalResults = useMemo(() => {
    const word = globalQuery.trim().toLowerCase();
    if (!word) return [];
    return customers.filter((customer) =>
      [customer.name, customer.line_name, customer.phone, customer.job, customer.rank,
       customer.favorite_drink, customer.memo, castName(customer.owner_id)]
        .filter(Boolean).join(" ").toLowerCase().includes(word)
    );
  }, [customers, globalQuery, profiles]);

  const selectedCast = profiles.find((item) => item.id === selectedCastId);

  const selectedCustomers = useMemo(() => {
    const word = castQuery.trim().toLowerCase();
    return customers.filter((customer) => {
      if (customer.owner_id !== selectedCastId) return false;
      if (!word) return true;
      return [customer.name, customer.line_name, customer.phone, customer.job,
        customer.rank, customer.favorite_drink, customer.memo]
        .filter(Boolean).join(" ").toLowerCase().includes(word);
    });
  }, [customers, selectedCastId, castQuery]);

  function openCast(id) {
    setSelectedCastId(id);
    setCastQuery("");
    setGlobalQuery("");
    setMessage("");
  }

  function openNewCustomer() {
    const ownerId = isAdmin ? selectedCastId : profile.id;
    if (!ownerId) {
      setMessage("先にキャストを選択してください。");
      return;
    }
    setEditing({ ...emptyCustomer, owner_id: ownerId });
  }

  async function createCast(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/create-cast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify(newCast)
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "キャストを追加できませんでした。");

      setCastModal(false);
      setNewCast(emptyCast);
      setMessage(`${result.cast.display_name}を追加しました。`);
      await loadApp();
      setSelectedCastId(result.cast.id);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
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
      owner_id: isAdmin ? editing.owner_id : profile.id,
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

    if (result.error) setMessage(`保存できませんでした：${result.error.message}`);
    else {
      setEditing(null);
      setMessage("保存しました。");
      await loadCustomers();
    }
    setBusy(false);
  }

  async function deleteCustomer() {
    if (!editing?.id || !isAdmin) return;
    if (!window.confirm("この顧客を削除しますか？")) return;
    setBusy(true);
    const { error } = await supabase.from("customers").delete().eq("id", editing.id);
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
          <label>メールアドレス</label>
          <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
          <label>パスワード</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)}
            type="password" autoComplete="current-password" />
          <button className="primary full" disabled={busy}>{busy ? "確認中…" : "ログイン"}</button>
          {message && <p className="error">{message}</p>}
        </form>
      </main>
    );
  }

  const showingGlobalResults = isAdmin && globalQuery.trim();

  return (
    <div>
      <header>
        <div>
          <h1>{isAdmin ? "キャスト別 顧客管理" : "自分の顧客"}</h1>
          <div className="muted small">{profile?.display_name}・{isAdmin ? "管理者" : "キャスト"}</div>
        </div>
        <button className="secondary" onClick={signOut}>ログアウト</button>
      </header>

      {isAdmin && (
        <section className="globalSearch">
          <input value={globalQuery} onChange={(e) => setGlobalQuery(e.target.value)}
            placeholder="全顧客を検索（名前・LINE・電話・メモ・担当キャスト）" />
        </section>
      )}

      <main className="content">
        {message && <div className="notice">{message}</div>}

        {showingGlobalResults ? (
          <>
            <div className="sectionTitle">
              <div><h2>全体検索結果</h2><span className="muted">{globalResults.length}件</span></div>
              <button className="secondary" onClick={() => setGlobalQuery("")}>閉じる</button>
            </div>
            <CustomerList customers={globalResults} castName={castName} showCast
              onEdit={(customer) => setEditing({ ...customer })} />
          </>
        ) : !selectedCastId && isAdmin ? (
          <>
            <div className="sectionTitle">
              <div><h2>キャスト一覧</h2><span className="muted">名前をタップすると顧客一覧が開きます</span></div>
              <button className="primary" onClick={() => setCastModal(true)}>＋ キャスト追加</button>
            </div>

            <div className="castGrid">
              {activeCasts.map((cast) => (
                <button className="castFolder" key={cast.id} onClick={() => openCast(cast.id)}>
                  <div className="folderIcon">▰</div>
                  <div className="castFolderText">
                    <strong>{cast.display_name}</strong>
                    <span>{castCounts[cast.id] || 0}名の顧客</span>
                    <small>ID：{cast.login_id}</small>
                  </div>
                  <div className="chevron">›</div>
                </button>
              ))}
            </div>

            {activeCasts.length === 0 && (
              <div className="empty">「＋ キャスト追加」から最初のキャストを登録してください。</div>
            )}
          </>
        ) : (
          <>
            <div className="castPageHeader">
              <div>
                {isAdmin && <button className="backButton" onClick={() => setSelectedCastId("")}>‹ キャスト一覧</button>}
                <h2>{selectedCast?.display_name || profile?.display_name}の顧客</h2>
                <span className="muted">{selectedCustomers.length}名</span>
              </div>
              <button className="primary" onClick={openNewCustomer}>＋ 顧客追加</button>
            </div>

            <div className="castSearch">
              <input value={castQuery} onChange={(e) => setCastQuery(e.target.value)}
                placeholder="このキャストの顧客を検索" />
            </div>

            <CustomerList customers={selectedCustomers} castName={castName} showCast={false}
              onEdit={(customer) => setEditing({ ...customer })} />
          </>
        )}
      </main>

      {castModal && (
        <div className="modalBackdrop" onMouseDown={() => setCastModal(false)}>
          <form className="modal smallModal" onSubmit={createCast} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h2>キャスト追加</h2>
              <button type="button" className="secondary" onClick={() => setCastModal(false)}>閉じる</button>
            </div>
            <Field label="キャスト名"><input value={newCast.displayName}
              onChange={(e) => setNewCast({ ...newCast, displayName: e.target.value })} /></Field>
            <Field label="ログインID"><input value={newCast.loginId}
              onChange={(e) => setNewCast({ ...newCast, loginId: e.target.value })} /></Field>
            <Field label="実在するメールアドレス"><input type="email" value={newCast.email}
              onChange={(e) => setNewCast({ ...newCast, email: e.target.value })} /></Field>
            <Field label="初期パスワード（8文字以上）"><input type="password" value={newCast.password}
              onChange={(e) => setNewCast({ ...newCast, password: e.target.value })} /></Field>
            <p className="hint">登録後、そのキャスト専用の顧客フォルダが自動で作成されます。</p>
            <button className="primary full" disabled={busy}>{busy ? "追加中…" : "キャストを追加"}</button>
          </form>
        </div>
      )}

      {editing && (
        <div className="modalBackdrop" onMouseDown={() => setEditing(null)}>
          <form className="modal" onSubmit={saveCustomer} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h2>{editing.id ? "顧客詳細・編集" : "顧客登録"}</h2>
              <button type="button" className="secondary" onClick={() => setEditing(null)}>閉じる</button>
            </div>
            <div className="formGrid">
              <Field label="顧客名・ニックネーム"><input value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
              <Field label="LINE名"><input value={editing.line_name || ""}
                onChange={(e) => setEditing({ ...editing, line_name: e.target.value })} /></Field>
              <Field label="電話番号"><input value={editing.phone || ""}
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
              <Field label="職業・勤務先"><input value={editing.job || ""}
                onChange={(e) => setEditing({ ...editing, job: e.target.value })} /></Field>
              <Field label="誕生日"><input type="date" value={editing.birthday || ""}
                onChange={(e) => setEditing({ ...editing, birthday: e.target.value })} /></Field>
              <Field label="顧客ランク"><select value={editing.rank}
                onChange={(e) => setEditing({ ...editing, rank: e.target.value })}>
                <option>通常</option><option>見込み</option><option>VIP</option><option>休眠</option><option>注意</option>
              </select></Field>
              <Field label="最終来店日"><input type="date" value={editing.last_visit || ""}
                onChange={(e) => setEditing({ ...editing, last_visit: e.target.value })} /></Field>
              <Field label="利用金額"><input type="number" min="0" value={editing.spend || ""}
                onChange={(e) => setEditing({ ...editing, spend: e.target.value })} /></Field>
              {isAdmin && <Field label="担当キャスト"><select value={editing.owner_id}
                onChange={(e) => setEditing({ ...editing, owner_id: e.target.value })}>
                {activeCasts.map((item) => <option value={item.id} key={item.id}>{item.display_name}</option>)}
              </select></Field>}
              <Field label="好きなお酒"><input value={editing.favorite_drink || ""}
                onChange={(e) => setEditing({ ...editing, favorite_drink: e.target.value })} /></Field>
              <div className="wide"><Field label="メモ・会話内容・注意事項"><textarea
                value={editing.memo || ""} onChange={(e) => setEditing({ ...editing, memo: e.target.value })} />
              </Field></div>
            </div>
            <div className="modalActions">
              {editing.id && isAdmin ? <button type="button" className="danger" onClick={deleteCustomer}>削除</button> : <span />}
              <button className="primary" disabled={busy}>{busy ? "保存中…" : "保存"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function CustomerList({ customers, castName, showCast, onEdit }) {
  if (customers.length === 0) return <div className="empty">該当する顧客がありません。</div>;
  return <div className="list">{customers.map((customer) => (
    <article className="customerCard" key={customer.id}>
      <div className="customerTop">
        <div>
          <div className="customerName">{customer.name}</div>
          {showCast && <div className="ownerBadge">担当：{castName(customer.owner_id)}</div>}
        </div>
        <button className="secondary" onClick={() => onEdit(customer)}>詳細・編集</button>
      </div>
      <div className="meta">
        最終来店：{customer.last_visit || "未登録"}　LINE：{customer.line_name || "未登録"}<br />
        電話：{customer.phone || "未登録"}　利用金額：¥{Number(customer.spend || 0).toLocaleString()}
      </div>
      <div className="tags"><span>{customer.rank}</span>
        {customer.job && <span>{customer.job}</span>}
        {customer.favorite_drink && <span>{customer.favorite_drink}</span>}
      </div>
    </article>
  ))}</div>;
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

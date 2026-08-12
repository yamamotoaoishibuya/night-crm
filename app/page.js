"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const emptyCustomer = {
  id: "", name: "", line_name: "", phone: "", job: "", birthday: "",
  rank: "通常", last_visit: "", spend: "", favorite_drink: "", memo: "", owner_id: ""
};

const emptyCast = { displayName: "", loginId: "" };

export default function Home() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [visits, setVisits] = useState([]);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [globalQuery, setGlobalQuery] = useState("");
  const [castQuery, setCastQuery] = useState("");
  const [customerSort, setCustomerSort] = useState("created");
  const [adminTab, setAdminTab] = useState("home");
  const [castActionTarget, setCastActionTarget] = useState(null);
  const [selectedCastId, setSelectedCastId] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [visitModal, setVisitModal] = useState(false);
  const [visitDraft, setVisitDraft] = useState({ visited_at: "", amount: "", memo: "", visit_type: "本指名" });
  const [castModal, setCastModal] = useState(false);
  const [newCast, setNewCast] = useState(emptyCast);
  const [credentialModal, setCredentialModal] = useState(null);
  const [passwordModal, setPasswordModal] = useState(false);
  const [hiddenModal, setHiddenModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function handlePopState(event) {
      const state = event.state || {};

      if (state.view === "history") {
        setSelectedCastId(state.castId || "");
        setSelectedCustomerId(state.customerId || "");
        setHistoryOpen(true);
        return;
      }

      if (state.view === "customer") {
        setSelectedCastId(state.castId || "");
        setSelectedCustomerId(state.customerId || "");
        setHistoryOpen(false);
        return;
      }

      if (state.view === "cast") {
        setSelectedCastId(state.castId || "");
        setSelectedCustomerId("");
        setHistoryOpen(false);
        return;
      }

      setSelectedCustomerId("");
      setHistoryOpen(false);

      if (profile?.role === "admin") {
        setSelectedCastId("");
      } else if (profile?.id) {
        setSelectedCastId(profile.id);
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [profile]);

  useEffect(() => {
    if (session) loadApp();
    else {
      setProfile(null);
      setProfiles([]);
      setCustomers([]);
      setVisits([]);
      setSelectedCastId("");
      setSelectedCustomerId("");
      setHistoryOpen(false);
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
      .select("id, login_id, display_name, role, is_active, must_change_password")
      .order("display_name");

    const sortedPeople = [...(people || [])].sort((a, b) => {
      const aNumber = Number.parseInt(a.login_id, 10);
      const bNumber = Number.parseInt(b.login_id, 10);

      if (Number.isNaN(aNumber) && Number.isNaN(bNumber)) {
        return String(a.display_name || "").localeCompare(String(b.display_name || ""), "ja");
      }
      if (Number.isNaN(aNumber)) return 1;
      if (Number.isNaN(bNumber)) return -1;
      if (aNumber !== bNumber) return aNumber - bNumber;

      return String(a.display_name || "").localeCompare(String(b.display_name || ""), "ja");
    });

    setProfiles(sortedPeople);
    if (me.role === "cast") setSelectedCastId(me.id);

    replaceBaseHistory(me);

    await Promise.all([loadCustomers(), loadVisits()]);
    setBusy(false);
  }

  async function loadCustomers() {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) setMessage("顧客データを取得できませんでした。");
    else setCustomers(data || []);
  }

  async function loadVisits() {
    const { data, error } = await supabase
      .from("visit_histories")
      .select("*")
      .order("visited_at", { ascending: false });

    if (error) setMessage("来店履歴を取得できませんでした。");
    else setVisits(data || []);
  }

  async function signIn(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const loginId = login.trim();
    const email = loginId.includes("@")
      ? loginId
      : `${loginId}@night-crm.invalid`;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage("ログインIDまたはパスワードが違います。");
    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const isAdmin = profile?.role === "admin";
  const activeCasts = useMemo(
    () =>
      profiles
        .filter((item) => item.role === "cast" && item.is_active)
        .sort((a, b) => {
          const aNumber = Number.parseInt(a.login_id, 10);
          const bNumber = Number.parseInt(b.login_id, 10);

          if (Number.isNaN(aNumber) && Number.isNaN(bNumber)) {
            return String(a.display_name || "").localeCompare(String(b.display_name || ""), "ja");
          }
          if (Number.isNaN(aNumber)) return 1;
          if (Number.isNaN(bNumber)) return -1;
          if (aNumber !== bNumber) return aNumber - bNumber;

          return String(a.display_name || "").localeCompare(String(b.display_name || ""), "ja");
        }),
    [profiles]
  );


  const hiddenCasts = useMemo(
    () =>
      profiles
        .filter((item) => item.role === "cast" && !item.is_active)
        .sort((a, b) => {
          const aNumber = Number.parseInt(a.login_id, 10);
          const bNumber = Number.parseInt(b.login_id, 10);

          if (Number.isNaN(aNumber) && Number.isNaN(bNumber)) {
            return String(a.display_name || "").localeCompare(String(b.display_name || ""), "ja");
          }
          if (Number.isNaN(aNumber)) return 1;
          if (Number.isNaN(bNumber)) return -1;
          if (aNumber !== bNumber) return aNumber - bNumber;

          return String(a.display_name || "").localeCompare(String(b.display_name || ""), "ja");
        }),
    [profiles]
  );

  const castCounts = useMemo(() => {
    const counts = {};
    for (const customer of customers) counts[customer.owner_id] = (counts[customer.owner_id] || 0) + 1;
    return counts;
  }, [customers]);

  const totalVisits = visits.length;
  const nominationVisits = visits.filter((visit) => visit.visit_type === "本指名").length;
  const inhouseVisits = visits.filter((visit) => visit.visit_type === "場内").length;

  function castName(id) {
    const item = profiles.find((profileItem) => profileItem.id === id);
    if (!item) return "未設定";
    return item.is_active ? item.display_name : `${item.display_name}（非表示）`;
  }

  function customerVisits(customerId) {
    return visits
      .filter((visit) => visit.customer_id === customerId)
      .sort((a, b) => new Date(b.visited_at) - new Date(a.visited_at));
  }

  function latestVisit(customerId) {
    return customerVisits(customerId)[0] || null;
  }

  function latestVisitByType(customerId, type) {
    return customerVisits(customerId).find((visit) => visit.visit_type === type) || null;
  }

  function visitTimestamp(visit) {
    if (!visit?.visited_at) return 0;
    const time = new Date(visit.visited_at).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  function sortCustomers(list) {
    const sorted = [...list];

    if (customerSort === "created") {
      return sorted.sort((a, b) => {
        const aTime = new Date(a.created_at || 0).getTime() || 0;
        const bTime = new Date(b.created_at || 0).getTime() || 0;
        return aTime - bTime;
      });
    }

    return sorted.sort((a, b) => {
      let aVisit = null;
      let bVisit = null;

      if (customerSort === "latest_nomination") {
        aVisit = latestVisitByType(a.id, "本指名");
        bVisit = latestVisitByType(b.id, "本指名");
      } else if (customerSort === "latest_inhouse") {
        aVisit = latestVisitByType(a.id, "場内");
        bVisit = latestVisitByType(b.id, "場内");
      } else {
        aVisit = latestVisit(a.id);
        bVisit = latestVisit(b.id);
      }

      const diff = visitTimestamp(bVisit) - visitTimestamp(aVisit);
      if (diff !== 0) return diff;

      return String(a.name || "").localeCompare(String(b.name || ""), "ja");
    });
  }

  function normalizeSearchDate(value) {
    return String(value || "").trim().replace(/[年月.\-]/g, "/").replace(/日/g, "");
  }

  function visitSearchText(customerId) {
    return customerVisits(customerId).map((visit) => {
      if (!visit.visited_at) return "";
      const date = new Date(visit.visited_at);
      if (Number.isNaN(date.getTime())) return String(visit.visited_at);
      const y = date.getFullYear();
      const m = date.getMonth() + 1;
      const d = date.getDate();
      return [
        `${y}/${m}/${d}`,
        `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`,
        `${m}/${d}`,
        `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`,
        `${y}年${m}月${d}日`,
        `${m}月${d}日`
      ].join(" ");
    }).join(" ");
  }

  function globalMatchInfo(customer, rawWord) {
    const word = rawWord.trim().toLowerCase();
    if (!word) return { matched: false, nameMatched: false };
    const nameMatched = String(customer.name || "").toLowerCase().includes(word);
    const baseText = [
      customer.line_name, customer.phone, customer.job, customer.rank,
      customer.favorite_drink, customer.memo, castName(customer.owner_id),
      profiles.find((item) => item.id === customer.owner_id)?.login_id
    ].filter(Boolean).join(" ").toLowerCase();
    const normalizedWord = normalizeSearchDate(word);
    const visitsText = normalizeSearchDate(visitSearchText(customer.id).toLowerCase());
    return {
      matched: nameMatched || baseText.includes(word) ||
        (normalizedWord && visitsText.includes(normalizedWord)),
      nameMatched
    };
  }

  const globalResults = useMemo(() => {
    const word = globalQuery.trim().toLowerCase();
    if (!word) return [];
    return sortCustomers(customers.filter((customer) => globalMatchInfo(customer, word).matched));
  }, [customers, globalQuery, profiles, visits, customerSort]);

  const selectedCast = profiles.find((item) => item.id === selectedCastId);
  const selectedCustomer = customers.find((item) => item.id === selectedCustomerId);

  function replaceBaseHistory(me) {
    const state =
      me.role === "admin"
        ? { view: "casts" }
        : { view: "cast", castId: me.id };

    window.history.replaceState(state, "", window.location.pathname);
  }

  function pushHistory(state) {
    window.history.pushState(state, "", window.location.pathname);
  }

  const selectedCustomers = useMemo(() => {
    const word = castQuery.trim().toLowerCase();

    const filtered = customers.filter((customer) => {
      if (customer.owner_id !== selectedCastId) return false;
      if (!word) return true;

      return [customer.name, customer.line_name, customer.phone, customer.job,
        customer.rank, customer.favorite_drink, customer.memo]
        .filter(Boolean).join(" ").toLowerCase().includes(word);
    });

    return sortCustomers(filtered);
  }, [customers, selectedCastId, castQuery, visits, customerSort]);

  function openCast(id) {
    setSelectedCastId(id);
    setSelectedCustomerId("");
    setHistoryOpen(false);
    setCastQuery("");
    setGlobalQuery("");
    setMessage("");
    pushHistory({ view: "cast", castId: id });
  }

  function openCustomer(id) {
    setSelectedCustomerId(id);
    setHistoryOpen(false);
    setGlobalQuery("");
    setMessage("");
    pushHistory({ view: "customer", castId: selectedCastId, customerId: id });
  }

  function goBack() {
    window.history.back();
  }

  function openNewCustomer() {
    const ownerId = isAdmin ? selectedCastId : profile.id;
    if (!ownerId) {
      setMessage("先にキャストを選択してください。");
      return;
    }
    setEditing({ ...emptyCustomer, owner_id: ownerId });
  }

  async function addVisit(event) {
    event.preventDefault();

    if (!selectedCustomer) return;
    if (!visitDraft.visited_at) {
      setMessage("来店日を入力してください。");
      return;
    }

    setBusy(true);
    setMessage("");

    const visitedAt = new Date(`${visitDraft.visited_at}T12:00:00`).toISOString();

    const payload = {
      customer_id: selectedCustomer.id,
      owner_id: selectedCustomer.owner_id,
      visited_at: visitedAt,
      amount: Number(visitDraft.amount || 0),
      visit_type: visitDraft.visit_type || "通常",
      memo: visitDraft.memo || null,
      created_by: profile.id
    };

    const { error } = await supabase.from("visit_histories").insert(payload);

    if (error) {
      setMessage(`来店履歴を保存できませんでした：${error.message}`);
    } else {
      setVisitModal(false);
      setVisitDraft({ visited_at: "", amount: "", memo: "", visit_type: "本指名" });
      setMessage("来店記録を追加しました。");
      await loadVisits();
    }

    setBusy(false);
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
      setCredentialModal({
        title: `${result.cast.display_name}を追加しました`,
        loginId: result.cast.login_id,
        password: result.temporaryPassword
      });
      await loadApp();
      setSelectedCastId(result.cast.id);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetCastPassword(cast) {
    if (!window.confirm(`${cast.display_name}のパスワードを再発行しますか？`)) return;

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ userId: cast.id })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "再発行できませんでした。");

      setCredentialModal({
        title: `${result.displayName}のパスワードを再発行しました`,
        loginId: cast.login_id,
        password: result.temporaryPassword
      });
      await loadApp();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function hideCast(cast) {
    if (!window.confirm(
      `${cast.display_name}を非表示にしますか？\n顧客情報は残り、このログインIDは新規登録で再利用できます。`
    )) return;

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/hide-cast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ userId: cast.id })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "非表示にできませんでした。");

      setSelectedCastId("");
      setMessage(`${result.displayName || cast.display_name}を非表示にしました。`);
      await loadApp();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function restoreCast(cast) {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/restore-cast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ userId: cast.id })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "再表示できませんでした。");

      setHiddenModal(false);
      setMessage(`${result.displayName || cast.display_name}を再表示しました。`);
      await loadApp();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setMessage("");

    if (newPassword.length < 8) {
      setMessage("パスワードは8文字以上にしてください。");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("確認用パスワードが一致しません。");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/account/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ newPassword })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "変更できませんでした。");

      setPasswordModal(false);
      setNewPassword("");
      setConfirmPassword("");
      setMessage("パスワードを変更しました。");
      await loadApp();
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
          <label>ログインIDまたは管理者メール</label>
          <input
            value={login}
            onChange={(e) => {
              const value = e.target.value;
              setLogin(value.includes("@") ? value : value.replace(/\D/g, "").slice(0, 3));
            }}
            inputMode="text"
            autoComplete="username"
            placeholder="キャスト：1〜3桁 / 管理者：メールアドレス"
          />
          <label>パスワード</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
          />
          <button className="primary full" disabled={busy}>{busy ? "確認中…" : "ログイン"}</button>
          {message && <p className="error">{message}</p>}
        </form>
      </main>
    );
  }

  if (profile?.must_change_password) {
    return (
      <PasswordChangeScreen
        displayName={profile.display_name}
        newPassword={newPassword}
        confirmPassword={confirmPassword}
        setNewPassword={setNewPassword}
        setConfirmPassword={setConfirmPassword}
        onSubmit={changePassword}
        busy={busy}
        message={message}
        onSignOut={signOut}
      />
    );
  }

  const showingGlobalResults = isAdmin && adminTab === "search" && globalQuery.trim();

  return (
    <div>
      <header className="appHeader">
        <div>
          <div className="appBrand">Night CRM</div>
          <div className="headerContext">
            {selectedCustomer
              ? selectedCustomer.name
              : selectedCastId
                ? `${selectedCast?.display_name || profile?.display_name}の顧客`
                : isAdmin
                  ? adminTab === "home"
                    ? "ホーム"
                    : adminTab === "search"
                      ? "全顧客検索"
                      : adminTab === "casts"
                        ? "キャスト"
                        : "設定"
                  : "自分の顧客"}
          </div>
        </div>
        <div className="headerUser">
          <strong>{profile?.display_name}</strong>
          <span>{isAdmin ? "管理者" : `ID ${profile?.login_id || ""}`}</span>
        </div>
      </header>

      <main className="content">
        {message && <div className="notice">{message}</div>}

        {historyOpen && selectedCustomer ? (
          <HistoryView
            customer={selectedCustomer}
            visits={customerVisits(selectedCustomer.id)}
            onBack={goBack}
          />
        ) : selectedCustomer ? (
          <CustomerOverview
            customer={selectedCustomer}
            latest={latestVisit(selectedCustomer.id)}
            visits={customerVisits(selectedCustomer.id)}
            castName={castName}
            onBack={goBack}
            onAddVisit={() => {
              setVisitDraft({
                visited_at: new Date().toISOString().slice(0, 10),
                amount: "",
                memo: "",
                visit_type: "本指名"
              });
              setVisitModal(true);
            }}
            onHistory={() => {
              setHistoryOpen(true);
              pushHistory({
                view: "history",
                castId: selectedCastId,
                customerId: selectedCustomer.id
              });
            }}
            onEdit={() => setEditing({ ...selectedCustomer })}
          />
        ) : selectedCastId ? (
          <>
            <div className="pageHero compactHero">
              <div>
                {isAdmin && <button className="backButton" onClick={goBack}>‹ キャスト一覧へ</button>}
                <div className="eyebrow">顧客フォルダ</div>
                <h2>{selectedCast?.display_name || profile?.display_name}</h2>
                <p>{selectedCustomers.length}名の顧客</p>
              </div>
              <button className="primary heroAction" onClick={openNewCustomer}>＋ 顧客追加</button>
            </div>

            <div className="toolbarCard">
              <div className="searchFieldWithIcon">
                <span>⌕</span>
                <input
                  value={castQuery}
                  onChange={(e) => setCastQuery(e.target.value)}
                  placeholder="名前・LINE・電話・メモから検索"
                />
              </div>
              <label className="sortControl">
                <span>並び順</span>
                <select value={customerSort} onChange={(e) => setCustomerSort(e.target.value)}>
                  <option value="created">登録順</option>
                  <option value="latest_visit">最終来店日順</option>
                  <option value="latest_nomination">最終本指名日順</option>
                  <option value="latest_inhouse">最終場内日順</option>
                </select>
              </label>
            </div>

            <CustomerFolderList
              customers={selectedCustomers}
              latestVisit={latestVisit}
              latestVisitByType={latestVisitByType}
              castName={castName}
              showCast={false}
              onOpen={(customer) => openCustomer(customer.id)}
            />
          </>
        ) : isAdmin && adminTab === "home" ? (
          <>
            <section className="homeHero">
              <div className="eyebrow">管理者ホーム</div>
              <h2>今日もここから</h2>
              <p>よく使う操作だけを大きくまとめています。</p>
            </section>

            <div className="quickGrid">
              <button className="quickCard" onClick={() => setAdminTab("search")}>
                <span className="quickIcon">⌕</span>
                <strong>全顧客を探す</strong>
                <small>名前・担当・来店日などから検索</small>
              </button>
              <button className="quickCard" onClick={() => setAdminTab("casts")}>
                <span className="quickIcon">♙</span>
                <strong>キャストから探す</strong>
                <small>キャスト → 顧客フォルダ</small>
              </button>
            </div>

            <section className="dashboardStats">
              <div><span>表示中キャスト</span><strong>{activeCasts.length}</strong></div>
              <div><span>全顧客</span><strong>{customers.length}</strong></div>
              <div><span>来店履歴</span><strong>{totalVisits}</strong></div>
              <div><span>本指名 / 場内</span><strong>{nominationVisits} / {inhouseVisits}</strong></div>
            </section>

            <section className="homeSection">
              <div className="sectionHeading">
                <div>
                  <div className="eyebrow">キャスト</div>
                  <h3>すぐ開く</h3>
                </div>
                <button className="textButton" onClick={() => setAdminTab("casts")}>すべて見る ›</button>
              </div>
              <div className="miniCastRow">
                {activeCasts.slice(0, 6).map((cast) => (
                  <button key={cast.id} className="miniCast" onClick={() => openCast(cast.id)}>
                    <span>No.{cast.login_id}</span>
                    <strong>{cast.display_name}</strong>
                    <small>{castCounts[cast.id] || 0}名</small>
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : isAdmin && adminTab === "search" ? (
          <>
            <div className="pageHero compactHero">
              <div>
                <div className="eyebrow">全顧客</div>
                <h2>検索</h2>
                <p>顧客名・LINE・電話・メモ・担当キャスト・ログインID・来店日を横断検索。</p>
              </div>
            </div>

            <div className="searchPanel">
              <div className="searchFieldWithIcon largeSearch">
                <span>⌕</span>
                <input
                  autoFocus
                  value={globalQuery}
                  onChange={(e) => setGlobalQuery(e.target.value)}
                  placeholder="例：山田 / yuuki / 8/12"
                />
                {globalQuery && (
                  <button className="clearSearch" onClick={() => setGlobalQuery("")}>×</button>
                )}
              </div>
              <label className="sortControl">
                <span>並び順</span>
                <select value={customerSort} onChange={(e) => setCustomerSort(e.target.value)}>
                  <option value="created">登録順</option>
                  <option value="latest_visit">最終来店日順</option>
                  <option value="latest_nomination">最終本指名日順</option>
                  <option value="latest_inhouse">最終場内日順</option>
                </select>
              </label>
            </div>

            {!globalQuery.trim() ? (
              <div className="searchEmptyState">
                <span>⌕</span>
                <strong>検索ワードを入力</strong>
                <small>来店日は「8/12」「2026/8/12」でも検索できます。</small>
              </div>
            ) : (
              <>
                <div className="resultCount">{globalResults.length}件見つかりました</div>
                <CustomerFolderList
                  customers={globalResults}
                  latestVisit={latestVisit}
                  latestVisitByType={latestVisitByType}
                  castName={castName}
                  showCast
                  showCastOnlyWhenNameMiss
                  query={globalQuery}
                  matchInfo={globalMatchInfo}
                  onOpen={(customer) => openCustomer(customer.id)}
                />
              </>
            )}
          </>
        ) : isAdmin && adminTab === "casts" ? (
          <>
            <div className="pageHero compactHero">
              <div>
                <div className="eyebrow">キャスト</div>
                <h2>キャスト一覧</h2>
                <p>ログインIDの小さい順。カードをタップすると顧客一覧へ。</p>
              </div>
              <button className="primary heroAction" onClick={() => setCastModal(true)}>＋ キャスト追加</button>
            </div>

            <div className="castGrid cleanCastGrid">
              {activeCasts.map((cast) => (
                <article className="castFolder cleanCastCard" key={cast.id}>
                  <button className="folderOpen cleanFolderOpen" onClick={() => openCast(cast.id)}>
                    <div className="castNumberBadge">
                      <span>No.</span>
                      <strong>{cast.login_id}</strong>
                    </div>
                    <div className="castFolderText">
                      <strong>{cast.display_name}</strong>
                      <span>{castCounts[cast.id] || 0}名の顧客</span>
                      <small className={cast.must_change_password ? "statusPending" : "statusDone"}>
                        {cast.must_change_password ? "初回ログイン待ち" : "利用中"}
                      </small>
                    </div>
                    <div className="chevron">›</div>
                  </button>
                  <button
                    className="castMoreButton"
                    aria-label={`${cast.display_name}の管理メニュー`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setCastActionTarget(cast);
                    }}
                  >•••</button>
                </article>
              ))}
            </div>

            {activeCasts.length === 0 && (
              <div className="empty">「＋ キャスト追加」から最初のキャストを登録してください。</div>
            )}
          </>
        ) : isAdmin ? (
          <>
            <div className="pageHero compactHero">
              <div>
                <div className="eyebrow">管理</div>
                <h2>設定</h2>
                <p>普段使わない管理操作をここにまとめています。</p>
              </div>
            </div>

            <div className="settingsList">
              <button onClick={() => setHiddenModal(true)}>
                <div>
                  <strong>非表示キャスト</strong>
                  <span>顧客情報を残したまま非表示にしたキャスト</span>
                </div>
                <b>{hiddenCasts.length} ›</b>
              </button>
              <div className="settingsInfo">
                <div><strong>ログイン中</strong><span>{profile?.display_name}</span></div>
                <div><strong>アプリ</strong><span>Night CRM v1.5.0</span></div>
              </div>
              <button className="logoutSetting" onClick={signOut}>
                <div>
                  <strong>ログアウト</strong>
                  <span>この端末のセッションを終了</span>
                </div>
                <b>›</b>
              </button>
            </div>
          </>
        ) : null}
      </main>



      {isAdmin && !selectedCastId && !selectedCustomerId && !historyOpen && (
        <nav className="bottomNav" aria-label="管理者ナビゲーション">
          <button className={adminTab === "home" ? "active" : ""} onClick={() => setAdminTab("home")}>
            <span>⌂</span><small>ホーム</small>
          </button>
          <button className={adminTab === "search" ? "active" : ""} onClick={() => setAdminTab("search")}>
            <span>⌕</span><small>全顧客</small>
          </button>
          <button className={adminTab === "casts" ? "active" : ""} onClick={() => setAdminTab("casts")}>
            <span>♙</span><small>キャスト</small>
          </button>
          <button className={adminTab === "settings" ? "active" : ""} onClick={() => setAdminTab("settings")}>
            <span>⚙</span><small>設定</small>
          </button>
        </nav>
      )}

      {visitModal && selectedCustomer && (
        <div className="modalBackdrop" onMouseDown={() => setVisitModal(false)}>
          <form className="modal smallModal" onSubmit={addVisit} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h2>来店記録を追加</h2>
              <button type="button" className="secondary" onClick={() => setVisitModal(false)}>
                閉じる
              </button>
            </div>

            <p className="muted">{selectedCustomer.name}</p>

            <Field label="指名種別">
              <select
                value={visitDraft.visit_type}
                onChange={(e) => setVisitDraft({ ...visitDraft, visit_type: e.target.value })}
              >
                <option>本指名</option>
                <option>場内</option>
                <option>通常</option>
              </select>
            </Field>

            <Field label="来店日">
              <input
                type="date"
                value={visitDraft.visited_at}
                onChange={(e) => setVisitDraft({ ...visitDraft, visited_at: e.target.value })}
              />
            </Field>

            <Field label="その日の使用金額">
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={visitDraft.amount}
                onChange={(e) => setVisitDraft({ ...visitDraft, amount: e.target.value })}
                placeholder="例：80000"
              />
            </Field>

            <Field label="その日の備考">
              <textarea
                value={visitDraft.memo}
                onChange={(e) => setVisitDraft({ ...visitDraft, memo: e.target.value })}
                placeholder="例：同僚2名と来店。次回は月末予定。"
              />
            </Field>

            <button className="primary full" disabled={busy}>
              {busy ? "保存中…" : "来店記録を保存"}
            </button>
          </form>
        </div>
      )}

      {castActionTarget && (
        <div className="modalBackdrop" onMouseDown={() => setCastActionTarget(null)}>
          <div className="modal actionSheet" onMouseDown={(e) => e.stopPropagation()}>
            <div className="actionSheetHandle" />
            <div className="actionSheetTitle">
              <div className="castNumberBadge smallBadge">
                <span>No.</span><strong>{castActionTarget.login_id}</strong>
              </div>
              <div>
                <h2>{castActionTarget.display_name}</h2>
                <p className="muted small">管理操作</p>
              </div>
            </div>
            <button
              className="sheetAction"
              onClick={() => {
                const cast = castActionTarget;
                setCastActionTarget(null);
                resetCastPassword(cast);
              }}
            >
              <span>↻</span>
              <div><strong>パスワード再発行</strong><small>新しい初期パスワードを発行</small></div>
            </button>
            <button
              className="sheetAction dangerSheetAction"
              onClick={() => {
                const cast = castActionTarget;
                setCastActionTarget(null);
                hideCast(cast);
              }}
            >
              <span>◌</span>
              <div><strong>非表示にする</strong><small>顧客情報は残り、IDは再利用可能</small></div>
            </button>
            <button className="secondary full" onClick={() => setCastActionTarget(null)}>閉じる</button>
          </div>
        </div>
      )}

      {hiddenModal && (
        <div className="modalBackdrop" onMouseDown={() => setHiddenModal(false)}>
          <div className="modal hiddenCastModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <h2>非表示キャスト</h2>
                <p className="muted small">
                  顧客情報は残っています。ログインIDは新しいキャストに再利用できます。
                </p>
              </div>
              <button type="button" className="secondary" onClick={() => setHiddenModal(false)}>
                閉じる
              </button>
            </div>

            {hiddenCasts.length === 0 ? (
              <div className="empty">非表示のキャストはいません。</div>
            ) : (
              <div className="hiddenCastList">
                {hiddenCasts.map((cast) => (
                  <article className="hiddenCastItem" key={cast.id}>
                    <div className="castNumberBadge">
                      <span>No.</span>
                      <strong>{cast.login_id}</strong>
                    </div>
                    <div className="hiddenCastInfo">
                      <strong>{cast.display_name}</strong>
                      <span>{castCounts[cast.id] || 0}名の顧客情報を保持中</span>
                      <small>ログインID：{cast.login_id}</small>
                    </div>
                    <button className="primary" onClick={() => restoreCast(cast)} disabled={busy}>
                      再表示
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {castModal && (
        <div className="modalBackdrop" onMouseDown={() => setCastModal(false)}>
          <form className="modal smallModal" onSubmit={createCast} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h2>キャスト追加</h2>
              <button type="button" className="secondary" onClick={() => setCastModal(false)}>閉じる</button>
            </div>
            <Field label="キャスト名">
              <input value={newCast.displayName}
                onChange={(e) => setNewCast({ ...newCast, displayName: e.target.value })}
                placeholder="例：あおい" />
            </Field>
            <Field label="ログインID（1〜3桁）">
              <input value={newCast.loginId}
                onChange={(e) => setNewCast({ ...newCast, loginId: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                inputMode="numeric"
                placeholder="例：25" />
            </Field>
            <p className="hint">
              初期パスワードは安全なランダム文字列で自動発行されます。
              キャスト本人のメールアドレス登録は不要です。
            </p>
            <button className="primary full" disabled={busy}>{busy ? "追加中…" : "キャストを追加"}</button>
          </form>
        </div>
      )}

      {credentialModal && (
        <div className="modalBackdrop">
          <div className="modal credentialModal">
            <h2>{credentialModal.title}</h2>
            <p className="warningText">この初期パスワードは、画面を閉じると再表示できません。</p>
            <CredentialRow label="ログインID" value={credentialModal.loginId} />
            <CredentialRow label="初期パスワード" value={credentialModal.password} />
            <button className="primary full" onClick={() => setCredentialModal(null)}>確認して閉じる</button>
          </div>
        </div>
      )}

      {passwordModal && (
        <div className="modalBackdrop" onMouseDown={() => setPasswordModal(false)}>
          <form className="modal smallModal" onSubmit={changePassword} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h2>パスワード変更</h2>
              <button type="button" className="secondary" onClick={() => setPasswordModal(false)}>閉じる</button>
            </div>
            <PasswordFields
              newPassword={newPassword}
              confirmPassword={confirmPassword}
              setNewPassword={setNewPassword}
              setConfirmPassword={setConfirmPassword}
            />
            <button className="primary full" disabled={busy}>{busy ? "変更中…" : "変更する"}</button>
          </form>
        </div>
      )}

      {editing && (
        <div className="modalBackdrop" onMouseDown={() => setEditing(null)}>
          <form className="modal" onSubmit={saveCustomer} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h2>{editing.id ? "基本情報を編集" : "顧客フォルダを作成"}</h2>
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

function PasswordChangeScreen(props) {
  return (
    <main className="loginPage">
      <form className="loginCard" onSubmit={props.onSubmit}>
        <div className="logo">初期パスワード変更</div>
        <p className="muted">{props.displayName}さん、好きなパスワードに変更してください。</p>
        <PasswordFields {...props} />
        <button className="primary full" disabled={props.busy}>{props.busy ? "変更中…" : "変更して開始"}</button>
        <button type="button" className="secondary full" onClick={props.onSignOut}>ログアウト</button>
        {props.message && <p className="error">{props.message}</p>}
      </form>
    </main>
  );
}

function PasswordFields({ newPassword, confirmPassword, setNewPassword, setConfirmPassword }) {
  return (
    <>
      <Field label="新しいパスワード（8文字以上）">
        <input type="password" value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password" />
      </Field>
      <Field label="新しいパスワード（確認）">
        <input type="password" value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password" />
      </Field>
    </>
  );
}

function CredentialRow({ label, value }) {
  async function copyValue() {
    await navigator.clipboard.writeText(value);
  }

  return (
    <div className="credentialRow">
      <div><span>{label}</span><strong>{value}</strong></div>
      <button className="secondary" onClick={copyValue}>コピー</button>
    </div>
  );
}

function CustomerFolderList({ customers, latestVisit, latestVisitByType, castName, showCast, showCastOnlyWhenNameMiss = false, query = "", matchInfo, onOpen }) {
  if (customers.length === 0) {
    return <div className="empty">該当する顧客がありません。</div>;
  }

  return (
    <div className="customerFolderGrid">
      {customers.map((customer) => {
        const latest = latestVisit(customer.id);
        const latestNomination = latestVisitByType(customer.id, "本指名");
        const latestInhouse = latestVisitByType(customer.id, "場内");
        const latestType =
          latest?.visit_type === "本指名"
            ? "本指名"
            : latest?.visit_type === "場内"
              ? "場内"
              : latest?.visit_type || "未登録";

        return (
          <button className="customerFolder" key={customer.id} onClick={() => onOpen(customer)}>
            <div className="customerFolderIcon">▰</div>
            <div className="customerFolderText">
              <strong>{customer.name}</strong>
              {showCast && (!showCastOnlyWhenNameMiss || !matchInfo?.(customer, query)?.nameMatched) && (
                <span>担当キャスト：{castName(customer.owner_id)}</span>
              )}
              <div className="latestVisitLine">
                <span className={`visitKind ${latestType === "本指名" ? "nomination" : latestType === "場内" ? "inhouse" : ""}`}>
                  {latestType}
                </span>
                <small>{latest ? formatDate(latest.visited_at) : "来店未登録"}</small>
              </div>
              <small className="subVisitInfo">
                本指名 {latestNomination ? formatDate(latestNomination.visited_at) : "なし"} ・
                場内 {latestInhouse ? formatDate(latestInhouse.visited_at) : "なし"}
              </small>
            </div>
            <div className="chevron">›</div>
          </button>
        );
      })}
    </div>
  );
}

function CustomerOverview({ customer, latest, visits, castName, onBack, onAddVisit, onHistory, onEdit }) {
  return (
    <>
      <button className="backButton" onClick={onBack}>‹ 顧客一覧</button>

      <div className="customerDetailHeader">
        <div>
          <h2>{customer.name}</h2>
          <span className="muted">担当：{castName(customer.owner_id)}</span>
        </div>
        <button className="secondary" onClick={onEdit}>基本情報を編集</button>
      </div>

      <section className="summaryCard">
        <div className="summaryItem">
          <span>最終来店日</span>
          <strong>{latest ? formatDate(latest.visited_at) : "未登録"}</strong>
        </div>

        <div className="summaryItem">
          <span>最終使用金額</span>
          <strong>{latest ? `¥${Number(latest.amount || 0).toLocaleString()}` : "未登録"}</strong>
        </div>

        <div className="summaryItem summaryMemo">
          <span>最終備考</span>
          <strong>{latest?.memo || "未登録"}</strong>
        </div>
      </section>

      <div className="customerActionGrid">
        <button className="primary" onClick={onAddVisit}>＋ 来店記録を追加</button>
        <button className="secondary" onClick={onHistory}>
          累計来店履歴を見る（{visits.length}件）
        </button>
      </div>

      <section className="basicInfoCard">
        <h3>基本情報</h3>
        <InfoRow label="LINE名" value={customer.line_name || "未登録"} />
        <InfoRow label="電話番号" value={customer.phone || "未登録"} />
        <InfoRow label="職業・勤務先" value={customer.job || "未登録"} />
        <InfoRow label="誕生日" value={customer.birthday || "未登録"} />
        <InfoRow label="好きなお酒" value={customer.favorite_drink || "未登録"} />
        <InfoRow label="ランク" value={customer.rank || "通常"} />
        <InfoRow label="基本メモ" value={customer.memo || "未登録"} />
      </section>
    </>
  );
}

function HistoryView({ customer, visits, onBack }) {
  return (
    <>
      <button className="backButton" onClick={onBack}>‹ {customer.name}</button>

      <div className="historyHeader">
        <div>
          <h2>{customer.name}｜累計来店履歴</h2>
          <span className="muted">{visits.length}件</span>
        </div>
      </div>

      {visits.length === 0 ? (
        <div className="empty">まだ来店履歴がありません。</div>
      ) : (
        <div className="historyList">
          {visits.map((visit) => (
            <article className="historyCard" key={visit.id}>
              <div className="historyTop">
                <div className="historyDateGroup">
                  <strong>{formatDate(visit.visited_at)}</strong>
                  <span className="visitTypeBadge">{visit.visit_type || "通常"}</span>
                </div>
                <span>¥{Number(visit.amount || 0).toLocaleString()}</span>
              </div>
              <p>{visit.memo || "備考なし"}</p>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="infoRow">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}


function formatDate(value) {
  if (!value) return "未登録";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ja-JP");
}

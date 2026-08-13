"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const emptyCustomer = {
  id: "", name: "", line_name: "", phone: "", job: "", birthday: "",
  rank: "通常", last_visit: "", spend: "", favorite_drink: "", memo: "", owner_id: "",
  initial_visit_date: "",
  initial_visit_type: "本指名",
  initial_visit_amount: "",
  initial_visit_memo: "",
  initial_visit_companions: []
};

const emptyCast = { displayName: "", loginId: "" };

async function runWithTimeout(promise, message, timeoutMs = 15000) {
  let timerId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timerId = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timerId) clearTimeout(timerId);
  }
}

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
  const [visitDraft, setVisitDraft] = useState({ visited_at: "", amount: "", memo: "", visit_type: "本指名", companions: [] });
  const [editingVisitId, setEditingVisitId] = useState("");
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

      setCastActionTarget(null);
      setCastModal(false);
      setHiddenModal(false);
      setCredentialModal(null);
      setVisitModal(false);
      setEditingVisitId("");
      setPasswordModal(false);
      setEditing(null);

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

      if (state.view === "admin-tab") {
        setAdminTab(state.tab || "home");
        setSelectedCastId("");
        setSelectedCustomerId("");
        setHistoryOpen(false);
        return;
      }

      setSelectedCustomerId("");
      setHistoryOpen(false);

      if (profile?.role === "admin") {
        setAdminTab("home");
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

    if (me.role === "admin") setAdminTab("home");
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

  async function copyAppUrl() {
    try {
      const url = window.location.origin;
      await navigator.clipboard.writeText(url);
      setMessage("アプリURLをコピーしました。");
    } catch {
      setMessage("URLをコピーできませんでした。ブラウザのアドレスバーからコピーしてください。");
    }
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

  function getFirstVisitRecord(customerId) {
    const list = customerVisits(customerId);
    return list.length
      ? [...list].sort((a, b) => new Date(a.visited_at) - new Date(b.visited_at))[0]
      : null;
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
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[年月.\-]/g, "/")
      .replace(/日/g, "")
      .replace(/\s+/g, " ");
  }

  function formatSearchDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }

  function customerSearchMeta(customer, rawWord) {
    const word = String(rawWord || "").trim().toLowerCase();
    const normalizedWord = normalizeSearchDate(word);
    if (!word) return { matched: false, nameMatched: false, reasons: [] };

    const reasons = [];
    const customerName = String(customer.name || "");
    const nameMatched = customerName.toLowerCase().includes(word);

    function addReason(label, value, extra = {}) {
      if (!value) return;
      reasons.push({
        label,
        value: String(value),
        ...extra
      });
    }

    if (nameMatched) addReason("顧客名", customerName);

    const basicFields = [
      ["LINE名", customer.line_name],
      ["電話番号", customer.phone],
      ["職業・勤務先", customer.job],
      ["ランク", customer.rank],
      ["好きなお酒", customer.favorite_drink],
      ["基本メモ", customer.memo],
      ["ボトル番号", customer.bottle_number],
      ["ボトル名", customer.bottle_name],
      ["担当キャスト", castName(customer.owner_id)],
      ["担当ログインID", profiles.find((item) => item.id === customer.owner_id)?.login_id]
    ];

    for (const [label, value] of basicFields) {
      if (String(value || "").toLowerCase().includes(word)) {
        addReason(label, value);
      }
    }

    const relatedVisits = customerVisits(customer.id);

    for (const visit of relatedVisits) {
      const visitDateText = formatSearchDate(visit.visited_at);
      const visitDateNormalized = normalizeSearchDate(visitDateText);

      if (normalizedWord && visitDateNormalized.includes(normalizedWord)) {
        addReason("来店日", visitDateText, {
          visitId: visit.id,
          visitDate: visit.visited_at
        });
      }

      if (String(visit.visit_type || "").toLowerCase().includes(word)) {
        addReason("来店種別", visit.visit_type, {
          visitId: visit.id,
          visitDate: visit.visited_at
        });
      }

      if (String(visit.memo || "").toLowerCase().includes(word)) {
        addReason("来店備考", visit.memo, {
          visitId: visit.id,
          visitDate: visit.visited_at
        });
      }

      if (String(visit.amount ?? "").includes(word)) {
        addReason("使用金額", `¥${Number(visit.amount || 0).toLocaleString()}`, {
          visitId: visit.id,
          visitDate: visit.visited_at
        });
      }

      const companions = Array.isArray(visit.companions) ? visit.companions : [];

      for (const companion of companions) {
        if (String(companion.name || "").toLowerCase().includes(word)) {
          addReason("連れの名前", companion.name, {
            visitId: visit.id,
            visitDate: visit.visited_at,
            companionType: companion.type || "指名なし",
            companionCast: companion.cast_name || ""
          });
        }

        if (String(companion.type || "").toLowerCase().includes(word)) {
          addReason("連れの指名種別", `${companion.name || "連れ"}：${companion.type}`, {
            visitId: visit.id,
            visitDate: visit.visited_at,
            companionCast: companion.cast_name || ""
          });
        }

        if (String(companion.cast_name || "").toLowerCase().includes(word)) {
          addReason("連れの指名キャスト", `${companion.name || "連れ"} → ${companion.cast_name}`, {
            visitId: visit.id,
            visitDate: visit.visited_at,
            companionType: companion.type || ""
          });
        }
      }
    }

    return {
      matched: reasons.length > 0,
      nameMatched,
      reasons
    };
  }

  const globalResults = useMemo(() => {
    const word = globalQuery.trim();
    if (!word) return [];

    const matches = customers
      .map((customer) => ({
        customer,
        searchMeta: customerSearchMeta(customer, word)
      }))
      .filter((item) => item.searchMeta.matched);

    const sortedCustomers = sortCustomers(matches.map((item) => item.customer));

    return sortedCustomers.map((customer) =>
      matches.find((item) => item.customer.id === customer.id)
    );
  }, [customers, globalQuery, profiles, visits, customerSort]);

  const selectedCast = profiles.find((item) => item.id === selectedCastId);
  const selectedCustomer = customers.find((item) => item.id === selectedCustomerId);

  function replaceBaseHistory(me) {
    const state =
      me.role === "admin"
        ? { view: "admin-tab", tab: "home" }
        : { view: "cast", castId: me.id };

    window.history.replaceState(state, "", window.location.pathname);
  }

  function pushHistory(state) {
    window.history.pushState(state, "", window.location.pathname);
  }

  function navigateAdminTab(tab) {
    if (!isAdmin) return;
    setAdminTab(tab);
    setSelectedCastId("");
    setSelectedCustomerId("");
    setHistoryOpen(false);
    setGlobalQuery("");
    pushHistory({ view: "admin-tab", tab });
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
    setEditing({
      ...emptyCustomer,
      owner_id: ownerId,
      initial_visit_date: new Date().toISOString().slice(0, 10),
      initial_visit_type: "本指名"
    });
  }

  function addCompanionRow() {
    setVisitDraft({
      ...visitDraft,
      companions: [...(visitDraft.companions || []), { name: "", type: "指名なし", cast_name: "", linked_customer_id: "" }]
    });
  }

  function updateCompanionRow(index, field, value) {
    const next = [...(visitDraft.companions || [])];
    next[index] = { ...next[index], [field]: value };
    setVisitDraft({ ...visitDraft, companions: next });
  }

  function removeCompanionRow(index) {
    const next = [...(visitDraft.companions || [])];
    next.splice(index, 1);
    setVisitDraft({ ...visitDraft, companions: next });
  }

  function addInitialCompanionRow() {
    setEditing({
      ...editing,
      initial_visit_companions: [
        ...(editing.initial_visit_companions || []),
        { name: "", type: "指名なし", cast_name: "", linked_customer_id: "" }
      ]
    });
  }

  function updateInitialCompanionRow(index, field, value) {
    const next = [...(editing.initial_visit_companions || [])];
    next[index] = { ...next[index], [field]: value };
    setEditing({ ...editing, initial_visit_companions: next });
  }

  function removeInitialCompanionRow(index) {
    const next = [...(editing.initial_visit_companions || [])];
    next.splice(index, 1);
    setEditing({ ...editing, initial_visit_companions: next });
  }

  function selectVisitCompanionCustomer(index, customer) {
    const next = [...(visitDraft.companions || [])];
    next[index] = {
      ...next[index],
      name: customer.name,
      linked_customer_id: customer.id,
      cast_name:
        next[index]?.type === "本指名" || next[index]?.type === "場内"
          ? castName(customer.owner_id)
          : next[index]?.cast_name || ""
    };
    setVisitDraft({ ...visitDraft, companions: next });
  }

  function selectInitialCompanionCustomer(index, customer) {
    const next = [...(editing.initial_visit_companions || [])];
    next[index] = {
      ...next[index],
      name: customer.name,
      linked_customer_id: customer.id,
      cast_name:
        next[index]?.type === "本指名" || next[index]?.type === "場内"
          ? castName(customer.owner_id)
          : next[index]?.cast_name || ""
    };
    setEditing({ ...editing, initial_visit_companions: next });
  }

  function clearVisitCompanionLink(index) {
    const next = [...(visitDraft.companions || [])];
    next[index] = { ...next[index], linked_customer_id: "" };
    setVisitDraft({ ...visitDraft, companions: next });
  }

  function clearInitialCompanionLink(index) {
    const next = [...(editing.initial_visit_companions || [])];
    next[index] = { ...next[index], linked_customer_id: "" };
    setEditing({ ...editing, initial_visit_companions: next });
  }

  async function saveVisit(event) {
    event.preventDefault();

    if (!selectedCustomer) {
      setMessage("顧客情報を取得できませんでした。画面を再読み込みしてください。");
      return;
    }

    if (!visitDraft.visited_at) {
      setMessage("来店日を入力してください。");
      return;
    }

    if (visitDraft.visit_type !== "本指名" && visitDraft.visit_type !== "場内") {
      setMessage("指名種別を「本指名」か「場内」から選んでください。");
      return;
    }

    const companions = (visitDraft.companions || [])
      .map((item) => ({
        name: String(item.name || "").trim(),
        type: item.type || "指名なし",
        cast_name:
          item.type === "本指名" || item.type === "場内"
            ? String(item.cast_name || "").trim()
            : "",
        linked_customer_id: item.linked_customer_id || ""
      }))
      .filter((item) => item.name);

    const missingCastName = companions.find(
      (item) =>
        (item.type === "本指名" || item.type === "場内") &&
        !item.cast_name
    );

    if (missingCastName) {
      setMessage(`${missingCastName.name}さんの指名キャスト名を入力してください。`);
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const visitedAt = new Date(`${visitDraft.visited_at}T12:00:00`).toISOString();

      const payload = {
        customer_id: selectedCustomer.id,
        owner_id: selectedCustomer.owner_id,
        visited_at: visitedAt,
        amount: Number(visitDraft.amount || 0),
        visit_type: visitDraft.visit_type,
        memo: visitDraft.memo || null,
        companions
      };

      // created_by is only necessary on new rows.
      if (!editingVisitId) {
        payload.created_by = profile.id;
      }

      const queryPromise = editingVisitId
        ? supabase
            .from("visit_histories")
            .update(payload)
            .eq("id", editingVisitId)
            .select("id")
            .single()
        : supabase
            .from("visit_histories")
            .insert(payload)
            .select("id")
            .single();

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("保存処理がタイムアウトしました。通信状態を確認してもう一度お試しください。"));
        }, 15000);
      });

      const result = await Promise.race([queryPromise, timeoutPromise]);

      if (result?.error) {
        throw result.error;
      }

      const wasEditing = Boolean(editingVisitId);

      setVisitModal(false);
      setEditingVisitId("");
      setVisitDraft({
        visited_at: "",
        amount: "",
        memo: "",
        visit_type: "本指名",
        companions: []
      });

      await loadVisits();

      setMessage(
        wasEditing
          ? "来店履歴を更新しました。"
          : "来店記録を追加しました。"
      );
    } catch (error) {
      console.error("saveVisit failed", error);

      const detail =
        error?.message ||
        error?.details ||
        error?.hint ||
        "不明なエラー";

      setMessage(`来店履歴を保存できませんでした：${detail}`);
    } finally {
      setBusy(false);
    }
  }

  function openVisitEditor(visit) {
    setEditingVisitId(visit.id);
    setVisitDraft({
      visited_at: visit.visited_at
        ? new Date(visit.visited_at).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      amount: String(visit.amount ?? ""),
      memo: visit.memo || "",
      visit_type: visit.visit_type === "場内" ? "場内" : "本指名",
      companions: Array.isArray(visit.companions)
        ? visit.companions.map((item) => ({
            name: item.name || "",
            type: item.type || "指名なし",
            cast_name: item.cast_name || "",
            linked_customer_id: item.linked_customer_id || ""
          }))
        : []
    });
    setVisitModal(true);
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

    if (!editing) {
      setMessage("編集データを取得できませんでした。画面を再読み込みしてください。");
      return;
    }

    const isNewCustomer = !editing.id;

    const payload = {
      name: String(editing.name || "").trim(),
      line_name: editing.line_name || null,
      phone: editing.phone || null,
      job: editing.job || null,
      birthday: editing.birthday || null,
      rank: editing.rank,
      favorite_drink: editing.favorite_drink || null,
      memo: editing.memo || null,
      bottle_number: editing.bottle_number || null,
      bottle_name: editing.bottle_name || null,
      owner_id: isAdmin ? editing.owner_id : profile.id,
      created_by: isNewCustomer ? profile.id : undefined
    };

    if (!payload.name) {
      setMessage("顧客名を入力してください。");
      return;
    }

    if (isNewCustomer && !editing.initial_visit_date) {
      setMessage("初回来店日を入力してください。");
      return;
    }

    if (
      editing.initial_visit_type !== "本指名" &&
      editing.initial_visit_type !== "場内"
    ) {
      setMessage("初回の指名種別を「本指名」か「場内」から選んでください。");
      return;
    }

    const initialCompanions = (editing.initial_visit_companions || [])
      .map((item) => ({
        name: String(item.name || "").trim(),
        type: item.type || "指名なし",
        cast_name:
          item.type === "本指名" || item.type === "場内"
            ? String(item.cast_name || "").trim()
            : "",
        linked_customer_id: item.linked_customer_id || ""
      }))
      .filter((item) => item.name);

    const missingInitialCast = initialCompanions.find(
      (item) =>
        (item.type === "本指名" || item.type === "場内") &&
        !item.cast_name
    );

    if (missingInitialCast) {
      setMessage(`${missingInitialCast.name}さんの指名キャスト名を入力してください。`);
      return;
    }

    const cleanPayload = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined)
    );

    setBusy(true);
    setMessage("");

    let saveStage = "保存開始";

    try {
      if (!isNewCustomer) {
        saveStage = "顧客基本情報を更新";
        const customerResult = await runWithTimeout(
          supabase
            .from("customers")
            .update(cleanPayload)
            .eq("id", editing.id)
            .select("id")
            .single(),
          "顧客基本情報の保存がタイムアウトしました。通信状態を確認してもう一度お試しください。"
        );

        if (customerResult?.error) throw customerResult.error;

        saveStage = "初回来店データを取得";
        const earliestVisitRecord = getFirstVisitRecord(editing.id);

        if (earliestVisitRecord) {
          const firstPatch = {
            visit_type: editing.initial_visit_type,
            companions: initialCompanions
          };

          if (editing.initial_visit_date) {
            firstPatch.visited_at =
              new Date(`${editing.initial_visit_date}T12:00:00`).toISOString();
          }

          saveStage = "初回来店情報を更新";
          const firstResult = await runWithTimeout(
            supabase
              .from("visit_histories")
              .update(firstPatch)
              .eq("id", earliestVisitRecord.id)
              .select("id")
              .single(),
            "初回来店情報の保存がタイムアウトしました。通信状態を確認してもう一度お試しください。"
          );

          if (firstResult?.error) throw firstResult.error;
        }

        saveStage = "更新後データを再取得";
        setEditing(null);
        await Promise.all([loadCustomers(), loadVisits()]);
        setMessage("顧客基本情報と初回来店情報を更新しました。");
        return;
      }

      saveStage = "新規顧客を作成";
      const createdResult = await runWithTimeout(
        supabase
          .from("customers")
          .insert(cleanPayload)
          .select("id, owner_id")
          .single(),
        "顧客フォルダ作成がタイムアウトしました。通信状態を確認してもう一度お試しください。"
      );

      if (createdResult?.error) throw createdResult.error;

      const created = createdResult.data;
      if (!created?.id) {
        throw new Error("顧客フォルダを作成できませんでした。");
      }

      saveStage = "初回来店情報を作成";
      const firstVisitPayload = {
        customer_id: created.id,
        owner_id: created.owner_id,
        visited_at: new Date(`${editing.initial_visit_date}T12:00:00`).toISOString(),
        amount: Number(editing.initial_visit_amount || 0),
        visit_type: editing.initial_visit_type,
        memo: editing.initial_visit_memo || null,
        companions: initialCompanions,
        created_by: profile.id
      };

      saveStage = "初回来店情報を保存";
      const visitResult = await runWithTimeout(
        supabase
          .from("visit_histories")
          .insert(firstVisitPayload)
          .select("id")
          .single(),
        "初回来店情報の保存がタイムアウトしました。通信状態を確認してもう一度お試しください。"
      );

      if (visitResult?.error) {
        await supabase.from("customers").delete().eq("id", created.id);
        throw visitResult.error;
      }

      setEditing(null);
      setSelectedCustomerId(created.id);
      pushHistory({
        view: "customer",
        castId: created.owner_id,
        customerId: created.id
      });

      await Promise.all([loadCustomers(), loadVisits()]);
      setMessage("顧客フォルダと初回来店情報を登録しました。");
    } catch (error) {
      console.error("saveCustomer failed", error);

      const detail =
        error?.message ||
        error?.details ||
        error?.hint ||
        "不明なエラー";

      setMessage(`保存できませんでした（${saveStage}）：${detail}`);
    } finally {
      setBusy(false);
    }
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
          <div><div className="appBrand">Night CRM</div><div className="buildVersion">v1.6.8</div></div>
          <div className="headerContext">
            {selectedCustomer
              ? selectedCustomer.name
              : selectedCastId
                ? `${selectedCast?.display_name || profile?.display_name}の顧客`
                : isAdmin
                  ? adminTab === "home"
                    ? "ホーム"
                    : adminTab === "search"
                      ? "全データ検索"
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
            onEditVisit={openVisitEditor}
          />
        ) : selectedCustomer ? (
          <CustomerOverview
            customer={selectedCustomer}
            latest={latestVisit(selectedCustomer.id)}
            visits={customerVisits(selectedCustomer.id)}
            castName={castName}
            onBack={goBack}
            onAddVisit={() => {
              setEditingVisitId("");
              setMessage("");
              setVisitDraft({
                visited_at: new Date().toISOString().slice(0, 10),
                amount: "",
                memo: "",
                visit_type: "本指名",
                companions: []
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
            onEdit={() => {
              const earliest = getFirstVisitRecord(selectedCustomer.id);
              setEditing({
                ...selectedCustomer,
                initial_visit_date: earliest?.visited_at
                  ? new Date(earliest.visited_at).toISOString().slice(0, 10)
                  : "",
                initial_visit_type: earliest?.visit_type || "本指名",
                initial_visit_companions: Array.isArray(earliest?.companions)
                  ? earliest.companions.map((item) => ({
                      name: item.name || "",
                      type: item.type || "指名なし",
                      cast_name: item.cast_name || "",
                      linked_customer_id: item.linked_customer_id || ""
                    }))
                  : []
              });
            }}
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
              <h2>保存されているデータを検索</h2>
              <p>顧客・来店履歴・連れ・ボトル・備考まで、ここからまとめて探せます。</p>
            </section>

            <div className="homeUniversalSearch">
              <div className="searchFieldWithIcon largeSearch">
                <span>⌕</span>
                <input
                  value={globalQuery}
                  onChange={(e) => setGlobalQuery(e.target.value)}
                  placeholder="例：深澤 / 8/12 / ボトル番号 / nana"
                />
                {globalQuery && (
                  <button className="clearSearch" onClick={() => setGlobalQuery("")}>×</button>
                )}
              </div>
            </div>

            {globalQuery.trim() ? (
              <>
                <div className="resultCount">{globalResults.length}件見つかりました</div>
                <UniversalSearchResults
                  items={globalResults}
                  onOpenCustomer={(customer) => openCustomer(customer.id)}
                  castName={castName}
                />
              </>
            ) : (
              <>
                <section className="dashboardStats singleStat">
                  <div><span>表示中キャスト</span><strong>{activeCasts.length}</strong></div>
                </section>

                <section className="homeSection">
                  <div className="sectionHeading">
                    <div>
                      <div className="eyebrow">キャスト</div>
                      <h3>キャスト一覧</h3>
                    </div>
                    <button className="textButton" onClick={() => navigateAdminTab("casts")}>管理画面へ ›</button>
                  </div>
                  <div className="miniCastRow">
                    {activeCasts.map((cast) => (
                      <button key={cast.id} className="miniCast" onClick={() => openCast(cast.id)}>
                        <span>No.{cast.login_id}</span>
                        <strong>{cast.display_name}</strong>
                        <small>{castCounts[cast.id] || 0}名</small>
                      </button>
                    ))}
                  </div>
                </section>
              </>
            )}
          </>
        ) : isAdmin && adminTab === "search" ? (
          <>
            <div className="pageHero compactHero">
              <div>
                <div className="eyebrow">全データ検索</div>
                <h2>横断検索</h2>
                <p>顧客・来店履歴・連れ・ボトル・備考・指名キャストまで検索します。</p>
              </div>
            </div>

            <div className="searchPanel">
              <div className="searchFieldWithIcon largeSearch">
                <span>⌕</span>
                <input
                  autoFocus
                  value={globalQuery}
                  onChange={(e) => setGlobalQuery(e.target.value)}
                  placeholder="例：深澤 / 2026/8/13 / 場内 / nana"
                />
                {globalQuery && (
                  <button className="clearSearch" onClick={() => setGlobalQuery("")}>×</button>
                )}
              </div>
              <label className="sortControl">
                <span>顧客の並び順</span>
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
                <strong>保存済みデータを横断検索</strong>
                <small>顧客名、連れの名前、来店日、備考、ボトル番号など何でも検索できます。</small>
              </div>
            ) : (
              <>
                <div className="resultCount">{globalResults.length}件見つかりました</div>
                <UniversalSearchResults
                  items={globalResults}
                  onOpenCustomer={(customer) => openCustomer(customer.id)}
                  castName={castName}
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
                <div><strong>アプリ</strong><span>Night CRM v1.6.8</span></div>
              </div>
              <button onClick={copyAppUrl}>
                <div>
                  <strong>アプリURLをコピー</strong>
                  <span>LINEやメッセージで共有するURLをコピー</span>
                </div>
                <b>コピー</b>
              </button>
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
          <button className={adminTab === "home" ? "active" : ""} onClick={() => navigateAdminTab("home")}>
            <span>⌂</span><small>ホーム</small>
          </button>
          <button className={adminTab === "search" ? "active" : ""} onClick={() => navigateAdminTab("search")}>
            <span>⌕</span><small>検索</small>
          </button>
          <button className={adminTab === "casts" ? "active" : ""} onClick={() => navigateAdminTab("casts")}>
            <span>♙</span><small>キャスト</small>
          </button>
          <button className={adminTab === "settings" ? "active" : ""} onClick={() => navigateAdminTab("settings")}>
            <span>⚙</span><small>設定</small>
          </button>
        </nav>
      )}

      {visitModal && selectedCustomer && (
        <div className="modalBackdrop" onMouseDown={() => { setVisitModal(false); setEditingVisitId(""); setBusy(false); }}>
          <form className="modal smallModal" onSubmit={saveVisit} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h2>{editingVisitId ? "来店履歴を編集" : "来店記録を追加"}</h2>
              <button type="button" className="secondary" onClick={() => { setVisitModal(false); setEditingVisitId(""); setBusy(false); }}>
                閉じる
              </button>
            </div>

            <p className="muted">{selectedCustomer.name}</p>
            <p className="visitModalHint">
              過去の日付も登録できます。本指名・場内を選んで来店履歴として追加してください。
            </p>

            <Field label="指名種別">
              <select
                value={visitDraft.visit_type}
                onChange={(e) => setVisitDraft({ ...visitDraft, visit_type: e.target.value })}
              >
                <option value="本指名">本指名</option>
                <option value="場内">場内</option>
              </select>
            </Field>

            <Field label="来店日">
              <DateScroller
                value={visitDraft.visited_at}
                onChange={(value) => setVisitDraft({ ...visitDraft, visited_at: value })}
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
            <CompanionEditor
              companions={visitDraft.companions || []}
              customers={customers}
              excludeCustomerId={selectedCustomer?.id || ""}
              castName={castName}
              onAdd={addCompanionRow}
              onUpdate={updateCompanionRow}
              onRemove={removeCompanionRow}
              onSelectCustomer={selectVisitCompanionCustomer}
              onClearLink={clearVisitCompanionLink}
            />

            <button className="primary full" disabled={busy}>
              {busy ? "保存中…" : editingVisitId ? "変更を保存" : "来店記録を保存"}
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
        <div className="modalBackdrop" onMouseDown={() => { setEditing(null); setBusy(false); }}>
          <form className="modal" onSubmit={saveCustomer} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h2>{editing.id ? "基本情報を編集" : "顧客フォルダを作成"}</h2>
              <button type="button" className="secondary" onClick={() => { setEditing(null); setBusy(false); }}>閉じる</button>
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
              <Field label="誕生日"><DateScroller value={editing.birthday || ""}
                onChange={(value) => setEditing({ ...editing, birthday: value })} allowEmpty /></Field>
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
              <Field label="ボトル番号"><input value={editing.bottle_number || ""}
                onChange={(e) => setEditing({ ...editing, bottle_number: e.target.value })}
                placeholder="例：B-123" /></Field>
              <Field label="ボトル名"><input value={editing.bottle_name || ""}
                onChange={(e) => setEditing({ ...editing, bottle_name: e.target.value })}
                placeholder="例：響" /></Field>
              <div className="wide"><Field label="メモ・会話内容・注意事項"><textarea
                value={editing.memo || ""} onChange={(e) => setEditing({ ...editing, memo: e.target.value })} />
              </Field></div>


              <div className="wide initialVisitSection">
                  <div className="subFormTitle">
                    <div>
                      <strong>{editing.id ? "初回来店情報を修正" : "初回来店情報"}</strong>
                      <span>{editing.id
                        ? "最初の来店履歴の日付と本指名・場内を修正できます"
                        : "顧客フォルダ作成と同時に1件目の来店履歴として保存されます"}</span>
                    </div>
                  </div>

                  <div className="formGrid nestedGrid">
                    <Field label="初回来店日">
                      <DateScroller
                        value={editing.initial_visit_date || ""}
                        onChange={(value) => setEditing({
                          ...editing,
                          initial_visit_date: value
                        })}
                      />
                    </Field>

                    <Field label="指名種別">
                      <select
                        value={editing.initial_visit_type || "本指名"}
                        onChange={(e) => setEditing({
                          ...editing,
                          initial_visit_type: e.target.value
                        })}
                      >
                        <option value="本指名">本指名</option>
                        <option value="場内">場内</option>
                      </select>
                    </Field>

                                        {editing.id && (
                      <div className="wide">
                        <CompanionEditor
                          companions={editing.initial_visit_companions || []}
                          customers={customers}
                          excludeCustomerId={editing.id || ""}
                          castName={castName}
                          onAdd={addInitialCompanionRow}
                          onUpdate={updateInitialCompanionRow}
                          onRemove={removeInitialCompanionRow}
                          onSelectCustomer={selectInitialCompanionCustomer}
                          onClearLink={clearInitialCompanionLink}
                        />
                      </div>
                    )}

{!editing.id && (
                      <>
                    <Field label="その日の使用金額">
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={editing.initial_visit_amount || ""}
                        onChange={(e) => setEditing({
                          ...editing,
                          initial_visit_amount: e.target.value
                        })}
                        placeholder="例：80000"
                      />
                    </Field>

                    <div className="wide">
                      <Field label="その日の備考">
                        <textarea
                          value={editing.initial_visit_memo || ""}
                          onChange={(e) => setEditing({
                            ...editing,
                            initial_visit_memo: e.target.value
                          })}
                          placeholder="例：初回来店。会社の同僚と来店。"
                        />
                      </Field>
                    </div>
                        <div className="wide">
                          <CompanionEditor
                            companions={editing.initial_visit_companions || []}
                            customers={customers}
                            excludeCustomerId={editing.id || ""}
                            castName={castName}
                            onAdd={addInitialCompanionRow}
                            onUpdate={updateInitialCompanionRow}
                            onRemove={removeInitialCompanionRow}
                            onSelectCustomer={selectInitialCompanionCustomer}
                            onClearLink={clearInitialCompanionLink}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
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

function CompanionEditor({
  companions,
  customers,
  excludeCustomerId,
  castName,
  onAdd,
  onUpdate,
  onRemove,
  onSelectCustomer,
  onClearLink
}) {
  function candidatesFor(companion) {
    const word = String(companion.name || "").trim().toLowerCase();
    if (!word || companion.linked_customer_id) return [];

    return customers
      .filter((customer) => {
        if (customer.id === excludeCustomerId) return false;
        return String(customer.name || "").toLowerCase().includes(word);
      })
      .slice(0, 8);
  }

  function linkedCustomer(companion) {
    if (!companion.linked_customer_id) return null;
    return customers.find((customer) => customer.id === companion.linked_customer_id) || null;
  }

  return (
    <div className="companionSection">
      <div className="companionHeader">
        <div>
          <strong>一緒に来た人</strong>
          <span>登録済み顧客なら候補から本人を選べます。該当しなければ名前のまま保存できます。</span>
        </div>
        <button type="button" className="secondary" onClick={onAdd}>＋ 連れを追加</button>
      </div>

      {companions.length === 0 ? (
        <div className="companionEmpty">連れの登録なし</div>
      ) : (
        <div className="companionList">
          {companions.map((companion, index) => {
            const candidates = candidatesFor(companion);
            const linked = linkedCustomer(companion);

            return (
              <div className="companionEntry" key={index}>
                <div className="companionRow">
                  <div className="companionNameField">
                    <input
                      value={companion.name}
                      onChange={(e) => {
                        onClearLink(index);
                        onUpdate(index, "name", e.target.value);
                      }}
                      placeholder="名前・苗字・ニックネーム"
                    />
                    {linked && (
                      <div className="linkedCustomerBadge">
                        登録済み顧客：{linked.name} / 担当 {castName(linked.owner_id)}
                      </div>
                    )}
                  </div>

                  <select
                    value={companion.type}
                    onChange={(e) => {
                      const nextType = e.target.value;
                      onUpdate(index, "type", nextType);
                      if (nextType === "指名なし") {
                        onUpdate(index, "cast_name", "");
                      } else if (linked) {
                        onUpdate(index, "cast_name", castName(linked.owner_id));
                      }
                    }}
                  >
                    <option value="本指名">本指名</option>
                    <option value="場内">場内</option>
                    <option value="指名なし">指名なし</option>
                  </select>

                  {(companion.type === "本指名" || companion.type === "場内") && (
                    <input
                      value={companion.cast_name || ""}
                      onChange={(e) => onUpdate(index, "cast_name", e.target.value)}
                      placeholder="誰を指名？ キャスト名"
                    />
                  )}

                  <button type="button" className="removeCompanion" onClick={() => onRemove(index)}>×</button>
                </div>

                {candidates.length > 0 && (
                  <div className="companionCandidates">
                    <div className="candidateHeading">登録済み顧客の候補</div>
                    {candidates.map((customer) => (
                      <button
                        type="button"
                        key={customer.id}
                        className="companionCandidate"
                        onClick={() => onSelectCustomer(index, customer)}
                      >
                        <div className="candidateTop">
                          <strong>{customer.name}</strong>
                          <span>担当：{castName(customer.owner_id)}</span>
                        </div>
                        <div className="candidateDetails">
                          {customer.line_name && <span>LINE：{customer.line_name}</span>}
                          {customer.memo && <span>備考：{customer.memo}</span>}
                          {customer.bottle_number && <span>ボトル番号：{customer.bottle_number}</span>}
                          {customer.bottle_name && <span>ボトル名：{customer.bottle_name}</span>}
                        </div>
                      </button>
                    ))}
                    <div className="candidateFoot">
                      該当する人がいなければ候補を選ばず、そのまま保存できます。
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UniversalSearchResults({ items, onOpenCustomer, castName }) {
  if (items.length === 0) {
    return <div className="empty">該当するデータがありません。</div>;
  }

  return (
    <div className="universalResults">
      {items.map(({ customer, searchMeta }) => {
        const primaryReasons = (searchMeta.reasons || []).slice(0, 4);

        return (
          <button
            className="universalResultCard"
            key={customer.id}
            onClick={() => onOpenCustomer(customer)}
          >
            <div className="resultCustomerTop">
              <div>
                <strong>{customer.name}</strong>
                <span>担当：{castName(customer.owner_id)}</span>
              </div>
              <div className="chevron">›</div>
            </div>

            <div className="hitReasonList">
              {primaryReasons.map((reason, index) => (
                <div className="hitReason" key={`${reason.label}-${index}`}>
                  <span className="hitLabel">{reason.label}</span>
                  <div className="hitValueWrap">
                    <strong>{reason.value}</strong>
                    {reason.visitDate && (
                      <small>来店日：{formatDate(reason.visitDate)}</small>
                    )}
                    {reason.companionType && (
                      <small>
                        {reason.companionType}
                        {reason.companionCast ? `：${reason.companionCast}` : ""}
                      </small>
                    )}
                  </div>
                </div>
              ))}

              {(searchMeta.reasons || []).length > 4 && (
                <small className="moreHits">
                  他 {(searchMeta.reasons || []).length - 4} 件ヒット
                </small>
              )}
            </div>
          </button>
        );
      })}
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
        <InfoRow label="ボトル番号" value={customer.bottle_number || "未登録"} />
        <InfoRow label="ボトル名" value={customer.bottle_name || "未登録"} />
        <InfoRow label="ランク" value={customer.rank || "通常"} />
        <InfoRow label="基本メモ" value={customer.memo || "未登録"} />
      </section>
    </>
  );
}

function HistoryView({ customer, visits, onBack, onEditVisit }) {
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
                <div className="historyRight">
                  <span>¥{Number(visit.amount || 0).toLocaleString()}</span>
                  <button className="historyEditButton" onClick={() => onEditVisit(visit)}>
                    編集
                  </button>
                </div>
              </div>
              {Array.isArray(visit.companions) && visit.companions.length > 0 && (
                <div className="historyCompanions">
                  <strong>一緒に来た人</strong>
                  <div>
                    {visit.companions.map((companion, index) => (
                      <span key={index}>
                        {companion.name}（{companion.type || "指名なし"}
                        {(companion.type === "本指名" || companion.type === "場内") && companion.cast_name
                          ? `：${companion.cast_name}`
                          : ""}
                        {companion.linked_customer_id ? "・登録済み" : ""}）
                      </span>
                    ))}
                  </div>
                </div>
              )}
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

function DateScroller({ value, onChange, allowEmpty = false }) {
  const now = new Date();
  const parsed = value ? new Date(`${value}T12:00:00`) : null;
  const valid = parsed && !Number.isNaN(parsed.getTime());
  const year = valid ? parsed.getFullYear() : now.getFullYear();
  const month = valid ? parsed.getMonth() + 1 : now.getMonth() + 1;
  const day = valid ? parsed.getDate() : now.getDate();

  const years = Array.from({ length: now.getFullYear() - 1919 + 6 }, (_, i) => now.getFullYear() + 5 - i);
  const maxDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(day, maxDay);

  function emit(y, m, d) {
    const last = new Date(y, m, 0).getDate();
    const dd = Math.min(d, last);
    onChange(`${y}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`);
  }

  if (allowEmpty && !value) {
    return <button type="button" className="secondary full" onClick={() => emit(now.getFullYear(), now.getMonth() + 1, now.getDate())}>日付を設定</button>;
  }

  return (
    <div className="dateScroller">
      <label><span>年</span><select value={year} onChange={(e) => emit(Number(e.target.value), month, safeDay)}>
        {years.map((y) => <option key={y} value={y}>{y}年</option>)}
      </select></label>
      <label><span>月</span><select value={month} onChange={(e) => emit(year, Number(e.target.value), safeDay)}>
        {Array.from({length:12},(_,i)=>i+1).map((m)=><option key={m} value={m}>{m}月</option>)}
      </select></label>
      <label><span>日</span><select value={safeDay} onChange={(e) => emit(year, month, Number(e.target.value))}>
        {Array.from({length:maxDay},(_,i)=>i+1).map((d)=><option key={d} value={d}>{d}日</option>)}
      </select></label>
      {allowEmpty && <button type="button" className="dateClear" onClick={() => onChange("")}>クリア</button>}
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

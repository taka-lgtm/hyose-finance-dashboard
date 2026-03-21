import { useState, useCallback, useEffect } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import Overview from "./pages/Overview";
import Performance from "./pages/Performance";
import Financials from "./pages/Financials";
import CashFlow from "./pages/CashFlow";
import Debt from "./pages/Debt";
import Actions from "./pages/Actions";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import { INITIAL_LOANS, PL as DEFAULT_PL, BS as DEFAULT_BS, CF as DEFAULT_CF } from "./data";
import { fetchLoans, addLoanDoc, updateLoanDoc, deleteLoanDoc, seedLoansIfEmpty, fetchFinancialData, saveFinancialData, saveBudget as saveBudgetDoc, saveMonthlyPL as saveMonthlyPLDoc, addLoanLog } from "./lib/firestore";

// ページアクセス権限チェック用のページID一覧
const RESTRICTED_PAGES = ["overview", "performance", "cashflow", "debt", "financials", "actions"];

function Dashboard() {
  const { user, userDoc, loading: authLoading } = useAuth();
  const [page, setPage] = useState("overview");

  // ── Loans state (Firestore-backed) ──
  const [loans, setLoans] = useState([]);
  const [loansLoading, setLoansLoading] = useState(true);

  // ── Financial data state (Firestoreから取得、未取得時はnull) ──
  const [plData, setPlData] = useState(null);
  const [bsData, setBsData] = useState(null);
  const [bmData, setBmData] = useState(null);
  const [monthlyPLData, setMonthlyPLData] = useState(null);
  const [cfData, setCfData] = useState(DEFAULT_CF);
  const [finLoading, setFinLoading] = useState(true);

  // Load loans from Firestore on mount
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const data = await seedLoansIfEmpty(INITIAL_LOANS);
        setLoans(data);
      } catch (e) {
        console.error("Failed to load loans:", e);
        setLoans(INITIAL_LOANS);
      }
      setLoansLoading(false);
    })();
  }, [user]);

  // Load financial data from Firestore on mount
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const all = await fetchFinancialData();
        if (all?.pl?.data) setPlData(all.pl.data);
        if (all?.bs?.data) setBsData(all.bs.data);
        if (all?.budget?.data) setBmData(all.budget.data);
        if (all?.monthlyPL?.data) setMonthlyPLData(all.monthlyPL.data);
        if (all?.cf?.data) setCfData(all.cf.data);
      } catch (e) {
        console.error("Failed to load financial data:", e);
      }
      setFinLoading(false);
    })();
  }, [user]);

  const userName = user?.displayName || user?.email || "不明";

  const addLoan = useCallback(async (loan) => {
    try {
      const saved = await addLoanDoc(loan);
      setLoans((prev) => [saved, ...prev]);
      addLoanLog({ action: "追加", user: userName, target: `${loan.bank} / ${loan.name}`, details: "" }).catch(() => {});
    } catch (e) {
      console.error("Failed to add loan:", e);
      setLoans((prev) => [{ id: Date.now().toString(), ...loan }, ...prev]);
    }
  }, [userName]);

  const updateLoan = useCallback(async (id, data) => {
    try {
      const prev = loans.find((l) => l.id === id);
      await updateLoanDoc(id, data);
      setLoans((p) => p.map((l) => l.id === id ? { ...l, ...data } : l));
      // 変更箇所をログに記録
      const changes = prev ? Object.keys(data).filter((k) => k !== "updatedAt" && String(data[k]) !== String(prev[k])).map((k) => `${k}: ${prev[k]} → ${data[k]}`).join(", ") : "";
      addLoanLog({ action: "編集", user: userName, target: `${data.bank || prev?.bank} / ${data.name || prev?.name}`, details: changes }).catch(() => {});
    } catch (e) {
      console.error("Failed to update loan:", e);
    }
  }, [userName, loans]);

  const removeLoan = useCallback(async (id) => {
    try {
      const target = loans.find((l) => l.id === id);
      await deleteLoanDoc(id);
      setLoans((prev) => prev.filter((l) => l.id !== id));
      if (target) addLoanLog({ action: "削除", user: userName, target: `${target.bank} / ${target.name}`, details: "" }).catch(() => {});
    } catch (e) {
      console.error("Failed to delete loan:", e);
    }
  }, [userName, loans]);

  // 既存データとマージ（同じ年度は上書き、異なる年度は保持）
  const savePL = useCallback(async (incoming) => {
    setPlData((prev) => {
      const map = new Map(prev.map((d) => [d.y, d]));
      incoming.forEach((d) => map.set(d.y, d));
      const merged = [...map.values()].sort((a, b) => a.y.localeCompare(b.y));
      saveFinancialData("pl", { data: merged }).catch(console.error);
      return merged;
    });
  }, []);

  const saveBS = useCallback(async (incoming) => {
    setBsData((prev) => {
      const map = new Map(prev.map((d) => [d.y, d]));
      incoming.forEach((d) => map.set(d.y, d));
      const merged = [...map.values()].sort((a, b) => a.y.localeCompare(b.y));
      saveFinancialData("bs", { data: merged }).catch(console.error);
      return merged;
    });
  }, []);

  const saveCF = useCallback(async (incoming) => {
    setCfData(incoming);
    saveFinancialData("cf", { data: incoming }).catch(console.error);
  }, []);

  const saveBudget = useCallback(async (incoming) => {
    setBmData(incoming);
    saveBudgetDoc(incoming).catch(console.error);
  }, []);

  const saveMonthlyPL = useCallback(async (incoming) => {
    setMonthlyPLData(incoming);
    saveMonthlyPLDoc(incoming).catch(console.error);
  }, []);

  const navigate = useCallback((id) => {
    setPage(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (authLoading) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-spinner" />
          <p style={{ color: "var(--tx3)", marginTop: 16, fontSize: 12 }}>認証を確認中...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  const dataLoading = loansLoading || finLoading;

  // 権限チェック: adminは全権限、それ以外はuserDocのpermission/allowedPagesに従う
  const isAdmin = userDoc?.role === "admin";
  const canEdit = isAdmin || userDoc?.permission !== "閲覧";
  const allowedPages = isAdmin ? null : (userDoc?.allowedPages || RESTRICTED_PAGES);

  // アクセス不可のページに遷移しようとした場合、最初の許可ページにリダイレクト
  const activePage = (!isAdmin && allowedPages && RESTRICTED_PAGES.includes(page) && !allowedPages.includes(page))
    ? (allowedPages[0] || "overview")
    : page;

  const pages = {
    overview: <Overview loans={loans} navigate={navigate} plData={plData} bsData={bsData} cfData={cfData} loading={dataLoading} />,
    performance: <Performance bmData={bmData} monthlyPLData={monthlyPLData} saveBudget={canEdit ? saveBudget : null} saveMonthlyPL={canEdit ? saveMonthlyPL : null} canEdit={canEdit} />,
    financials: <Financials plData={plData} bsData={bsData} loans={loans} savePL={canEdit ? savePL : null} saveBS={canEdit ? saveBS : null} canEdit={canEdit} />,
    cashflow: <CashFlow cfData={cfData} saveCF={canEdit ? saveCF : null} canEdit={canEdit} />,
    debt: <Debt loans={loans} addLoan={canEdit ? addLoan : null} updateLoan={canEdit ? updateLoan : null} removeLoan={canEdit ? removeLoan : null} loading={loansLoading} plData={plData} canEdit={canEdit} />,
    actions: <Actions />,
    users: <Users />,
    settings: <Settings />,
  };

  return (
    <Layout page={activePage} navigate={navigate} loans={loans} plData={plData}>
      {dataLoading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0", fontSize: 12, color: "var(--tx3)" }}>
          <div className="login-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
          データを読み込み中...
        </div>
      )}
      {pages[activePage] || pages.overview}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <Dashboard />
      </SettingsProvider>
    </AuthProvider>
  );
}

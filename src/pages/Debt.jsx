import { useState, useRef, useEffect } from "react";
import { Chart, registerables } from "chart.js";
import { MY, calcLoanDerived, exportBalanceCSV, exportBalanceXLSX, exportSummaryCSV, chartFont, chartGrid, chartLegend, getChartTheme } from "../data";
import { BANK_COLORS, getBankColor } from "../data/banks";
import { calcAllProjections } from "../lib/loanCalc";
import { fetchLoanLogs } from "../lib/firestore";
import { useSettings } from "../contexts/SettingsContext";
import LoanModal from "../components/LoanModal";

Chart.register(...registerables);

const VIEWS = { balance: "残高推移", table: "一覧", schedule: "スケジュール", analysis: "分析", logs: "ログ" };
const CATEGORIES = ["長期", "短期", "当座貸越"];
const PERIOD_FILTERS = { all: "全期間", thisPeriod: "今期", last2: "直近2期", last3: "直近3期" };

// 期間フィルタのロジック
// 「今月」は残高ベース、それ以外は融資開始日(start)がフィルタ起点以降かで判定
function filterLoansByPeriod(loans, period, fiscalMonth) {
  if (!loans || !loans.length) return loans;

  const now = new Date();

  // 期首月を算出（3月決算なら4月が期首）
  const startMonth = (fiscalMonth % 12) + 1;

  // 当期の期首日を算出
  let fyStartYear = now.getFullYear();
  if (now.getMonth() + 1 < startMonth) fyStartYear--;
  const thisPeriodStart = new Date(fyStartYear, startMonth - 1, 1);

  // 全期間: フィルタなし（残高ゼロの完済済み融資も含む）
  if (period === "all") {
    return loans;
  }

  // フィルタの起点日を決定
  let filterStart;
  switch (period) {
    case "thisPeriod":
      filterStart = thisPeriodStart;
      break;
    case "last2":
      filterStart = new Date(thisPeriodStart);
      filterStart.setFullYear(filterStart.getFullYear() - 1);
      break;
    case "last3":
      filterStart = new Date(thisPeriodStart);
      filterStart.setFullYear(filterStart.getFullYear() - 2);
      break;
    default:
      filterStart = thisPeriodStart;
  }

  return loans.filter(l => {
    const loanStart = l.start ? new Date(l.start) : null;

    // 開始日がない融資（当座貸越等）: 残高ありなら常に表示
    if (!loanStart) return l.balance > 0;

    // 融資開始日がフィルタ起点日以降かで判定
    return loanStart >= filterStart;
  });
}

export default function Debt({ loans, addLoan, updateLoan, removeLoan, loading, plData, canEdit = true }) {
  const { settings } = useSettings();
  const [view, setView] = useState("balance");
  const [bankFilter, setBankFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState(null);

  const periodFiltered = filterLoansByPeriod(loans, periodFilter, settings.fiscalMonth);
  const banks = [...new Set(periodFiltered.map((l) => l.bank))];
  const catFiltered = catFilter === "all" ? periodFiltered : periodFiltered.filter((l) => l.category === catFilter);
  const fl = bankFilter === "all" ? catFiltered : catFiltered.filter((l) => l.bank === bankFilter);

  // KPIはフィルタ後のデータで計算
  const { tBal, tMon, wRate } = calcLoanDerived(fl);
  const intCost = fl.map((l) => ({ ...l, annualInt: Math.round(l.balance * l.rate / 100) }));
  const totalInt = intCost.reduce((s, l) => s + l.annualInt, 0);
  const fixedBal = fl.filter((l) => l.rt === "固定").reduce((s, l) => s + l.balance, 0);
  const varBal = fl.filter((l) => l.rt === "変動").reduce((s, l) => s + l.balance, 0);
  const sorted = [...fl].sort((a, b) => b.rate - a.rate);
  const refiTarget = sorted.filter((l) => l.rate >= 1.5);
  const refiSavings = refiTarget.reduce((s, l) => s + Math.round(l.balance * (l.rate - 1.0) / 100), 0);

  // 分析用（期間フィルタ後のデータで計算）
  const allBanks = [...new Set(periodFiltered.map((l) => l.bank))];
  const bSum = allBanks.map((b) => { const ls = periodFiltered.filter((l) => l.bank === b); return { bank: b, bal: ls.reduce((s, l) => s + l.balance, 0), mon: ls.reduce((s, l) => s + l.monthly, 0), cnt: ls.length }; });
  const allBankInt = allBanks.map((b) => ({ bank: b, int: periodFiltered.filter((l) => l.bank === b).reduce((s, l) => s + Math.round(l.balance * l.rate / 100), 0) })).sort((a, b) => b.int - a.int);
  const allTotalInt = periodFiltered.reduce((s, l) => s + Math.round(l.balance * l.rate / 100), 0);
  const allFixedBal = periodFiltered.filter((l) => l.rt === "固定").reduce((s, l) => s + l.balance, 0);
  const allVarBal = periodFiltered.filter((l) => l.rt === "変動").reduce((s, l) => s + l.balance, 0);

  const proj = calcAllProjections(fl);

  const openNew = () => { setEditingLoan(null); setModalOpen(true); };
  const openEdit = (loan) => { setEditingLoan(loan); setModalOpen(true); };

  return (
    <div className="page"><div className="g">
      <div className="ph">
        <div><h2>融資管理</h2><p>融資ポートフォリオの全体像。返済管理から借換え戦略まで。</p></div>
        <div className="ph-actions">
          <select className="sel" value={bankFilter} onChange={(e) => setBankFilter(e.target.value)}>
            <option value="all">全銀行</option>
            {banks.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="sel" value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}>
            {Object.entries(PERIOD_FILTERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {canEdit && <button className="btn pr" onClick={openNew}>＋ 新規登録</button>}
        </div>
      </div>

      <div className="ph-tabs">
        {Object.entries(VIEWS).map(([k, v]) => (
          <button key={k} className={`chip ${view === k ? "on" : ""}`} onClick={() => setView(k)}>{v}</button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {["all", ...CATEGORIES].map((c) => (
            <button key={c} className={`chip ${catFilter === c ? "on" : ""}`} style={{ fontSize: 10, padding: "3px 8px" }} onClick={() => setCatFilter(c)}>{c === "all" ? "全区分" : c}</button>
          ))}
        </div>
      </div>

      {loans.length === 0 && (
        <div className="c">
          <div className="cb" style={{ padding: "28px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "var(--tx)", fontWeight: 600, marginBottom: 8 }}>融資データを登録してください</div>
            <div style={{ fontSize: 13, color: "var(--tx3)", marginBottom: 16 }}>「新規登録」ボタンから1件ずつ追加できます。</div>
            {canEdit && <button className="btn pr" onClick={openNew}>＋ 新規登録</button>}
          </div>
        </div>
      )}

      <div className="g4">
        <div className="k hero"><div className="k-label">借入残高 合計</div><div className="k-val">{MY(tBal)}</div><div className="k-ctx">{fl.length}本 / 返済月数 {tMon > 0 ? Math.round(tBal / tMon) : "-"}ヶ月</div><div className="k-foot"><span>年間利息 {MY(totalInt)}</span></div></div>
        <div className="k"><div className="k-label">月間返済 合計</div><div className="k-val">{MY(tMon)}</div><div className="k-ctx">年間 {MY(tMon * 12)}</div><div className="k-foot"><span>{plData && plData.length > 0 ? `売上比 ${(tMon / 10000 * 12 / plData[plData.length - 1].売上高 * 100).toFixed(1)}%` : "売上比 -"}</span></div></div>
        <div className="k"><div className="k-label">平均金利</div><div className="k-val">{wRate}%</div><div className="k-ctx">固定 {MY(fixedBal)} / 変動 {MY(varBal)}</div></div>
        <div className="k"><div className="k-label">借換え削減余地</div><div className="k-val" style={{ color: "var(--ac)" }}>▼{MY(refiSavings)}/年</div><div className="k-ctx">{refiTarget.length}件を1.0%に借換えた場合</div></div>
      </div>

      {view === "balance" && <BalanceView proj={proj} wRate={wRate} tMon={tMon} loans={loans} bankFilter={bankFilter} onEdit={canEdit ? openEdit : null} />}
      {view === "table" && <ListView loans={fl} onEdit={canEdit ? openEdit : null} />}
      {view === "schedule" && <ScheduleView loans={fl} />}
      {view === "analysis" && <AnalysisView bSum={bSum} bankInt={allBankInt} totalInt={allTotalInt} fixedBal={allFixedBal} varBal={allVarBal} loans={periodFiltered} sorted={sorted} refiTarget={refiTarget} refiSavings={refiSavings} />}
      {view === "logs" && <LogView />}

      {canEdit && <LoanModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingLoan(null); }} onSubmit={addLoan} onUpdate={updateLoan} onDelete={removeLoan} editing={editingLoan} loans={loans} />}
    </div></div>
  );
}

/* ══════════════════════════════════
   残高推移ビュー
   ══════════════════════════════════ */

function BalanceBlock({ title, badge, data, projLabels, onEdit, isFirst }) {
  if (!data.length) return null;
  const sub = data.reduce((s, l) => s + l.balance, 0);
  const subTotals = projLabels.map((_, i) => data.reduce((s, l) => s + l.balances[i], 0));
  const subMon = data.reduce((s, l) => s + l.monthly, 0);
  const colCount = 5 + projLabels.length;
  return (
    <>
      {/* ブロック間のスペーサー（最初のブロック以外） */}
      {!isFirst && <tr className="cat-spacer-row"><td colSpan={colCount} /></tr>}
      <tr className="cat-header-row">
        <td className="bold sticky sticky-0" colSpan={2}>
          <span className={`p ${badge}`} style={{ fontSize: 9, marginRight: 6 }}>{title}</span>
          {data.length}件
        </td>
        <td className="num" /><td className="num">{Math.round(subMon / 10000).toLocaleString()}</td>
        <td className="num" style={{ background: "var(--acB)" }}>{Math.round(sub / 10000).toLocaleString()}</td>
        {subTotals.map((v, i) => <td key={i} className="num">{Math.round(v / 10000).toLocaleString()}</td>)}
      </tr>
      {data.map((l, i) => {
        const rc = l.rate >= 1.8 ? "var(--rd)" : l.rate >= 1.5 ? "var(--am)" : "var(--ac)";
        return (
          <tr key={i} style={{ cursor: "pointer" }} onClick={() => onEdit && onEdit(l)} title="クリックで編集">
            <td className="sticky sticky-0" style={{ paddingLeft: 20 }}>{l.bank}</td>
            <td className="sticky sticky-1">{l.name}</td>
            <td className="num" style={{ color: rc }}>{l.rate}%</td>
            <td className="num">{Math.round(l.monthly / 10000).toLocaleString()}</td>
            <td className="num" style={{ background: "var(--acB)", color: "var(--tx)" }}>{Math.round(l.balance / 10000).toLocaleString()}</td>
            {l.balances.map((v, j) => <td key={j} className="num" style={v === 0 ? { color: "var(--tx3)", opacity: 0.5 } : {}}>{v === 0 ? "—" : Math.round(v / 10000).toLocaleString()}</td>)}
          </tr>
        );
      })}
    </>
  );
}

function BalanceView({ proj, wRate, tMon, loans, bankFilter, onEdit }) {
  const { settings } = useSettings();
  const ct = getChartTheme(settings.theme);
  const themedGrid = { color: ct.gridColor };
  const { labels: projLabels, loanData: projData, totals: projTotals, bankData: projBankData } = proj;
  const loanChartRef = useRef(null), bankChartRef = useRef(null), totalChartRef = useRef(null);
  const loanChart = useRef(null), bankChart = useRef(null), totalChart = useRef(null);
  const scrollRef = useRef(null), wrapRef = useRef(null);

  const longTerm = projData.filter((l) => l.category === "長期");
  const shortTerm = projData.filter((l) => l.category === "短期");
  const overdraft = projData.filter((l) => l.category === "当座貸越");
  const curTotal = projData.reduce((s, l) => s + l.balance, 0);
  const endTotal = projTotals[projTotals.length - 1] || 0;

  const getCategoryStyle = (cat) => {
    if (cat === "短期") return { borderDash: [6, 3], borderColor: "#e5a83a" };
    if (cat === "当座貸越") return { borderDash: [3, 3], borderColor: "rgba(128,128,128,.4)" };
    return { borderDash: [], borderColor: null };
  };

  useEffect(() => { Chart.defaults.color = ct.textColor; Chart.defaults.borderColor = ct.gridColor; totalChart.current?.destroy(); if (!totalChartRef.current || !projTotals.length) return; totalChart.current = new Chart(totalChartRef.current, { type: "line", data: { labels: projLabels, datasets: [{ label: "借入残高 合計", data: projTotals, borderColor: "#22c994", backgroundColor: "rgba(34,201,148,.08)", fill: true, tension: 0.3, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: "#22c994" }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: (v) => Math.round(v / 10000).toLocaleString() + "万", font: chartFont }, grid: themedGrid }, x: { grid: { display: false }, ticks: { font: chartFont } } } } }); return () => totalChart.current?.destroy(); }, [projTotals, projLabels, ct]);
  useEffect(() => { loanChart.current?.destroy(); if (!loanChartRef.current || !projData.length) return; loanChart.current = new Chart(loanChartRef.current, { type: "line", data: { labels: projLabels, datasets: projData.map((l) => { const cs = getCategoryStyle(l.category); const color = cs.borderColor || getBankColor(l.bank); return { label: l.bank + " " + l.name, data: l.balances, borderColor: color, backgroundColor: color + "18", fill: true, tension: 0.3, borderWidth: 1.5, pointRadius: 2, borderDash: cs.borderDash }; }) }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: chartLegend }, scales: { y: { stacked: true, ticks: { callback: (v) => Math.round(v / 10000) + "万", font: chartFont }, grid: themedGrid }, x: { grid: { display: false }, ticks: { font: chartFont } } } } }); return () => loanChart.current?.destroy(); }, [projData, projLabels, ct]);
  useEffect(() => { bankChart.current?.destroy(); if (!bankChartRef.current || !projBankData.length) return; bankChart.current = new Chart(bankChartRef.current, { type: "line", data: { labels: projLabels, datasets: projBankData.map((b) => ({ label: b.bank, data: b.balances, borderColor: getBankColor(b.bank), fill: false, tension: 0.3, borderWidth: 2, pointRadius: 3 })) }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: chartLegend }, scales: { y: { ticks: { callback: (v) => Math.round(v / 10000) + "万", font: chartFont }, grid: themedGrid }, x: { grid: { display: false }, ticks: { font: chartFont } } } } }); return () => bankChart.current?.destroy(); }, [projBankData, projLabels, ct]);
  useEffect(() => { const scr = scrollRef.current, wrap = wrapRef.current; if (!scr || !wrap) return; const check = () => wrap.classList.toggle("scrolled-end", scr.scrollLeft + scr.clientWidth >= scr.scrollWidth - 4); scr.addEventListener("scroll", check); check(); return () => scr.removeEventListener("scroll", check); }, [projData]);

  return (<>
    <div className="c">
      <div className="ch">
        <div><div className="ct">返済残高推移表<span className="unit-badge">単位: 万円</span></div><div className="cs">据置中は残高が水平推移 / 区分別に表示</div></div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn-export" onClick={() => exportBalanceXLSX(loans, projData, projLabels)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Excel
          </button>
          <button className="btn-export" onClick={() => exportBalanceCSV(loans, bankFilter)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            CSV
          </button>
        </div>
      </div>
      <div className="cb" style={{ padding: 0 }}>
        <div className="scroll-table-wrap" ref={wrapRef}>
          <div className="scroll-table-inner" ref={scrollRef}>
            <table className="bal-tbl">
              <thead><tr><th className="sticky sticky-0">銀行</th><th className="sticky sticky-1">融資名</th><th className="num-head">金利</th><th className="num-head">月返済</th><th className="num-head" style={{ background: "var(--acB)" }}>現在</th>{projLabels.map((m) => <th key={m} className="num-head">{m}</th>)}</tr></thead>
              <tbody>
                <BalanceBlock title="長期借入金" badge="bu" data={longTerm} projLabels={projLabels} onEdit={onEdit} isFirst={true} />
                <BalanceBlock title="短期借入金" badge="wr" data={shortTerm} projLabels={projLabels} onEdit={onEdit} isFirst={!longTerm.length} />
                <BalanceBlock title="当座貸越" badge="mt" data={overdraft} projLabels={projLabels} onEdit={onEdit} isFirst={!longTerm.length && !shortTerm.length} />
                <tr className="total-row">
                  <td className="bold sticky sticky-0">総合計</td><td className="sticky sticky-1" />
                  <td className="num">{wRate}%</td><td className="num">{Math.round(tMon / 10000).toLocaleString()}</td>
                  <td className="num" style={{ background: "var(--acB)" }}>{Math.round(curTotal / 10000).toLocaleString()}</td>
                  {projTotals.map((v, i) => <td key={i} className="num">{Math.round(v / 10000).toLocaleString()}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="scroll-hint" style={{ padding: "8px 18px 14px" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
          横スクロールで全月の残高を確認できます
        </div>
      </div>
    </div>
    <div className="c"><div className="ch"><div><div className="ct">借入残高 合計推移</div></div></div><div className="cb"><div className="chart"><canvas ref={totalChartRef} /></div></div></div>
    <div className="g2">
      <div className="c"><div className="ch"><div><div className="ct">融資別 残高推移</div><div className="cs">長期=実線 / 短期=破線 / 当座貸越=点線</div></div></div><div className="cb"><div className="chart tall"><canvas ref={loanChartRef} /></div></div></div>
      <div className="c"><div className="ch"><div><div className="ct">銀行別 残高推移</div></div></div><div className="cb"><div className="chart tall"><canvas ref={bankChartRef} /></div></div></div>
    </div>
    <div className="g2">
      <div className="c"><div className="ch"><div><div className="ct">12ヶ月後 借入残高予測</div></div></div>
        <div className="cb"><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ textAlign: "center", padding: 16, borderRadius: "var(--rs)", background: "var(--stripe)", border: "1px solid var(--bd)" }}><div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--tx3)", fontWeight: 600 }}>現在残高</div><div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontVariantNumeric: "tabular-nums", fontSize: 24, fontWeight: 700, marginTop: 6 }}>{MY(curTotal)}</div></div>
          <div style={{ textAlign: "center", padding: 16, borderRadius: "var(--rs)", background: "var(--acB)", border: "1px solid rgba(34,201,148,.12)" }}><div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--tx3)", fontWeight: 600 }}>12ヶ月後 予測</div><div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontVariantNumeric: "tabular-nums", fontSize: 24, fontWeight: 700, color: "var(--ac)", marginTop: 6 }}>{MY(endTotal)}</div><div style={{ fontSize: 10, color: "var(--ac)", marginTop: 4 }}>▼{MY(curTotal - endTotal)} 減少</div></div>
        </div></div></div>
      <div className="c"><div className="ch"><div><div className="ct">エクスポート</div></div></div>
        <div className="cb"><div style={{ display: "grid", gap: 10 }}>
          <button className="btn-export" style={{ width: "100%", justifyContent: "center", padding: 12 }} onClick={() => exportBalanceXLSX(loans, projData, projLabels)}>返済残高推移表（Excel）</button>
          <button className="btn-export" style={{ width: "100%", justifyContent: "center", padding: 12 }} onClick={() => exportBalanceCSV(loans, bankFilter)}>返済残高推移表（CSV）</button>
          <button className="btn-export" style={{ width: "100%", justifyContent: "center", padding: 12 }} onClick={() => exportSummaryCSV(loans)}>融資一覧サマリー（CSV）</button>
        </div></div></div>
    </div>
  </>);
}

/* ══════════════════════════════════
   一覧ビュー
   ══════════════════════════════════ */

function ListView({ loans, onEdit }) {
  const [sortKey, setSortKey] = useState("balance");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = [...loans].sort((a, b) => {
    const av = a[sortKey] ?? "", bv = b[sortKey] ?? "";
    if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av;
    return sortAsc ? String(av).localeCompare(String(bv), "ja") : String(bv).localeCompare(String(av), "ja");
  });

  const toggleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc); else { setSortKey(key); setSortAsc(false); }
  };

  const SH = ({ k, children, cls }) => (
    <th className={cls || ""} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }} onClick={() => toggleSort(k)}>
      {children}{sortKey === k ? (sortAsc ? " ↑" : " ↓") : ""}
    </th>
  );

  return (
    <div className="c">
      <div className="ch">
        <div><div className="ct">融資一覧</div></div>
        <span className="p bu">{sorted.length}件</span>
      </div>
      <div className="cb tw">
        <table>
          <thead><tr>
            <SH k="num">No.</SH>
            <SH k="category">区分</SH>
            <SH k="bank">銀行</SH>
            <SH k="name">融資名</SH>
            <SH k="balance" cls="tr">残高</SH>
            <SH k="monthly" cls="tr">月返済</SH>
            <SH k="rate" cls="tr">金利</SH>
            <SH k="rt">種別</SH>
            <SH k="condition">条件</SH>
            <SH k="endDate" cls="tr">最終期限</SH>
            {onEdit && <th></th>}
          </tr></thead>
          <tbody>
            {sorted.map((l, i) => {
              const rc = l.rate >= 1.8 ? "var(--rd)" : l.rate >= 1.5 ? "var(--am)" : "var(--ac)";
              return (
                <tr key={l.id || i}>
                  <td className="mono" style={{ fontSize: 10, color: "var(--tx3)" }}>{l.num || "-"}</td>
                  <td><span className={`p ${l.category === "長期" ? "bu" : l.category === "短期" ? "wr" : "mt"}`} style={{ fontSize: 9 }}>{l.category}</span></td>
                  <td className="bold">{l.bank}</td>
                  <td>{l.name}</td>
                  <td className="tr mono">{MY(l.balance)}</td>
                  <td className="tr mono">{MY(l.monthly)}</td>
                  <td className="tr mono" style={{ color: rc }}>{l.rate}%</td>
                  <td><span className={`p ${l.rt === "変動" ? "wr" : "mt"}`} style={{ fontSize: 9 }}>{l.rt}</span></td>
                  <td style={{ fontSize: 10 }}>{l.condition === "P" ? "プロパー" : l.condition === "保" ? "保証付き" : "-"}</td>
                  <td className="tr mono" style={{ fontSize: 10 }}>{l.endDate || "-"}</td>
                  {onEdit && <td>
                    <button onClick={() => onEdit(l)} style={{ background: "none", border: "1px solid var(--bd)", cursor: "pointer", color: "var(--tx2)", fontSize: 10, padding: "3px 10px", borderRadius: 4 }} onMouseOver={(e) => { e.target.style.borderColor = "var(--ac)"; e.target.style.color = "var(--ac)"; }} onMouseOut={(e) => { e.target.style.borderColor = "var(--bd)"; e.target.style.color = "var(--tx2)"; }}>
                      編集
                    </button>
                  </td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════
   スケジュールビュー
   ══════════════════════════════════ */

function ScheduleView({ loans }) {
  const ref = useRef(null), ch = useRef(null);
  useEffect(() => {
    ch.current?.destroy();
    if (!ref.current) return;
    const items = loans.filter((l) => l.monthly > 0).map((l) => ({ name: l.bank + " " + l.name, months: Math.ceil(l.balance / l.monthly) })).sort((a, b) => b.months - a.months);
    ch.current = new Chart(ref.current, { type: "bar", data: { labels: items.map((i) => i.name), datasets: [{ data: items.map((i) => i.months), backgroundColor: items.map((i) => BANK_COLORS[i.name.split(" ")[0]] || "rgba(91,141,239,.5)"), borderRadius: 4 }] }, options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { callback: (v) => v + "ヶ月", font: chartFont }, grid: chartGrid }, y: { ticks: { font: { ...chartFont, size: 9 } }, grid: { display: false } } } } });
    return () => ch.current?.destroy();
  }, [loans]);

  return (<>
    <div className="c"><div className="ch"><div><div className="ct">返済スケジュール</div></div></div>
      <div className="cb tw"><table>
        <thead><tr><th>融資名</th><th>銀行</th><th className="tr">月返済</th><th className="tr">残回数</th><th className="tr">残期間</th><th>方式</th><th className="tr">借入日</th><th className="tr">完済予定</th><th className="tr">年間利息</th></tr></thead>
        <tbody>{loans.map((l, i) => { const r = l.monthly > 0 ? Math.ceil(l.balance / l.monthly) : 0; const e = l.start ? new Date(l.start) : null; if (e) e.setMonth(e.getMonth() + l.term); return (
          <tr key={i}><td className="bold">{l.name}</td><td>{l.bank}</td><td className="tr mono">{MY(l.monthly)}</td><td className="tr mono">{r > 0 ? r + "回" : "-"}</td><td className="tr mono">{r > 0 ? Math.floor(r / 12) + "年" + (r % 12) + "ヶ月" : "-"}</td><td>{l.method}</td><td className="tr mono">{l.start || "-"}</td><td className="tr mono">{e ? e.toISOString().slice(0, 10) : "-"}</td><td className="tr mono">{MY(Math.round(l.balance * l.rate / 100))}</td></tr>
        ); })}</tbody></table></div></div>
    <div className="c"><div className="ch"><div><div className="ct">完済タイムライン</div></div></div><div className="cb"><div className="chart tall"><canvas ref={ref} /></div></div></div>
  </>);
}

/* ══════════════════════════════════
   分析ビュー
   ══════════════════════════════════ */

function AnalysisView({ bSum, bankInt, totalInt, fixedBal, varBal, loans, sorted, refiTarget, refiSavings }) {
  const tBal = loans.reduce((s, l) => s + l.balance, 0);
  const proparBal = loans.filter((l) => l.condition === "P").reduce((s, l) => s + l.balance, 0);
  const guarBal = loans.filter((l) => l.condition === "保").reduce((s, l) => s + l.balance, 0);
  const r1 = useRef(null), r2 = useRef(null), r3 = useRef(null), c1 = useRef(null), c2 = useRef(null), c3 = useRef(null);

  useEffect(() => { c1.current?.destroy(); if (!r1.current) return; c1.current = new Chart(r1.current, { type: "doughnut", data: { labels: ["固定金利", "変動金利"], datasets: [{ data: [fixedBal, varBal], backgroundColor: ["rgba(34,201,148,.6)", "rgba(229,168,58,.6)"], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "65%", plugins: { legend: chartLegend } } }); return () => c1.current?.destroy(); }, [fixedBal, varBal]);
  useEffect(() => { c2.current?.destroy(); if (!r2.current) return; c2.current = new Chart(r2.current, { type: "doughnut", data: { labels: ["プロパー", "保証付き"], datasets: [{ data: [proparBal, guarBal], backgroundColor: ["rgba(91,141,239,.6)", "rgba(155,124,246,.6)"], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "65%", plugins: { legend: chartLegend } } }); return () => c2.current?.destroy(); }, [proparBal, guarBal]);
  useEffect(() => { c3.current?.destroy(); if (!r3.current) return; const rateBands = [{ label: "〜1.0%", min: 0, max: 1.0 }, { label: "1.0〜1.5%", min: 1.0, max: 1.5 }, { label: "1.5〜2.0%", min: 1.5, max: 2.0 }, { label: "2.0%〜", min: 2.0, max: 99 }]; c3.current = new Chart(r3.current, { type: "bar", data: { labels: rateBands.map((b) => b.label), datasets: [{ data: rateBands.map((b) => loans.filter((l) => l.rate >= b.min && l.rate < b.max).reduce((s, l) => s + l.balance, 0)), backgroundColor: ["rgba(34,201,148,.6)", "rgba(91,141,239,.5)", "rgba(229,168,58,.5)", "rgba(229,91,91,.5)"], borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: (v) => Math.round(v / 10000) + "万", font: chartFont }, grid: chartGrid }, x: { grid: { display: false }, ticks: { font: chartFont } } } } }); return () => c3.current?.destroy(); }, [loans]);

  // バーチャートのレンダー用ヘルパー
  const BarList = ({ items, total, valFmt }) => (
    <div>
      {items.map((b, i) => { const pv = total > 0 ? (b.val / total * 100).toFixed(1) : 0; return (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}><span className="bold">{b.label}</span><span className="mono">{valFmt(b.val)} ({pv}%)</span></div>
          <div className="int-bar"><div className="ib-fill" style={{ width: pv + "%", background: b.color }} /></div>
        </div>
      ); })}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--bd)", display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700 }}><span>合計</span><span className="mono">{valFmt(total)}</span></div>
    </div>
  );

  return (<>
    {/* 1段目: 銀行別融資残高 + 年間利息コスト */}
    <div className="g2">
      <div className="c"><div className="ch"><div><div className="ct">銀行別融資残高</div></div></div>
        <div className="cb">
          <BarList items={[...bSum].sort((a, b) => b.bal - a.bal).map((b) => ({ label: b.bank, val: b.bal, color: BANK_COLORS[b.bank] || "#5b8def" }))} total={tBal} valFmt={(v) => MY(v)} />
        </div>
      </div>
      <div className="c"><div className="ch"><div><div className="ct">年間利息コスト</div></div></div>
        <div className="cb">
          <BarList items={bankInt.map((b) => ({ label: b.bank, val: b.int, color: BANK_COLORS[b.bank] || "#5b8def" }))} total={totalInt} valFmt={(v) => MY(v) + "/年"} />
        </div>
      </div>
    </div>

    {/* 2段目: 固定vs変動 + プロパーvs保証 + 金利帯別 */}
    <div className="g3">
      <div className="c"><div className="ch"><div><div className="ct">固定 vs 変動</div></div></div>
        <div className="cb">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ textAlign: "center", padding: 12, borderRadius: "var(--rs)", background: "var(--acB)", border: "1px solid var(--ac)" }}><div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--tx3)", fontWeight: 600 }}>固定</div><div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 700, color: "var(--ac)", marginTop: 4 }}>{tBal > 0 ? (fixedBal / tBal * 100).toFixed(1) : 0}%</div></div>
            <div style={{ textAlign: "center", padding: 12, borderRadius: "var(--rs)", background: "var(--amB)", border: "1px solid var(--am)" }}><div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--tx3)", fontWeight: 600 }}>変動</div><div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 700, color: "var(--am)", marginTop: 4 }}>{tBal > 0 ? (varBal / tBal * 100).toFixed(1) : 0}%</div></div>
          </div>
          <div className="chart"><canvas ref={r1} /></div>
        </div>
      </div>
      <div className="c"><div className="ch"><div><div className="ct">プロパー vs 保証付き</div></div></div>
        <div className="cb">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ textAlign: "center", padding: 12, borderRadius: "var(--rs)", background: "var(--blB)", border: "1px solid var(--bl)" }}><div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--tx3)", fontWeight: 600 }}>プロパー</div><div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 700, color: "var(--bl)", marginTop: 4 }}>{tBal > 0 ? (proparBal / tBal * 100).toFixed(1) : 0}%</div></div>
            <div style={{ textAlign: "center", padding: 12, borderRadius: "var(--rs)", background: "var(--puB)", border: "1px solid var(--pu)" }}><div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--tx3)", fontWeight: 600 }}>保証付き</div><div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 700, color: "var(--pu)", marginTop: 4 }}>{tBal > 0 ? (guarBal / tBal * 100).toFixed(1) : 0}%</div></div>
          </div>
          <div className="chart"><canvas ref={r2} /></div>
        </div>
      </div>
      <div className="c"><div className="ch"><div><div className="ct">金利帯別残高分布</div></div></div><div className="cb"><div className="chart"><canvas ref={r3} /></div></div></div>
    </div>

    {refiTarget.length > 0 && (
      <div className="c"><div className="ch"><div><div className="ct">借換えシミュレーション</div></div><span className="p gd">▼{MY(refiSavings)}/年</span></div>
        <div className="cb tw"><table>
          <thead><tr><th>融資名</th><th>銀行</th><th className="tr">残高</th><th className="tr">現行金利</th><th className="tr">現行利息/年</th><th className="tr">借換後</th><th className="tr">借換後利息</th><th className="tr">節約額</th></tr></thead>
          <tbody>{refiTarget.map((l, i) => { const cur = Math.round(l.balance * l.rate / 100), nw = Math.round(l.balance * 1.0 / 100); return (
            <tr key={i}><td className="bold">{l.name}</td><td>{l.bank}</td><td className="tr mono">{MY(l.balance)}</td><td className="tr mono" style={{ color: "var(--rd)" }}>{l.rate}%</td><td className="tr mono">{MY(cur)}</td><td className="tr mono" style={{ color: "var(--ac)" }}>1.0%</td><td className="tr mono">{MY(nw)}</td><td className="tr mono" style={{ color: "var(--ac)" }}>▼{MY(cur - nw)}</td></tr>
          ); })}</tbody></table></div></div>
    )}
  </>);
}

/* ══════════════════════════════════
   ログビュー
   ══════════════════════════════════ */

function LogView() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchLoanLogs(200);
        setLogs(data);
      } catch (e) {
        console.error("Failed to fetch logs:", e);
      }
      setLoading(false);
    })();
  }, []);

  const fmtDate = (ts) => {
    if (!ts?.seconds) return "-";
    return new Date(ts.seconds * 1000).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  const actionBadge = (a) => {
    if (a === "追加") return "gd";
    if (a === "編集") return "bu";
    if (a === "削除") return "bd";
    return "mt";
  };

  return (
    <div className="c">
      <div className="ch">
        <div><div className="ct">変更ログ</div><div className="cs">融資データの追加・編集・削除の履歴</div></div>
        <span className="p bu">{logs.length}件</span>
      </div>
      <div className="cb tw">
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--tx3)" }}>読み込み中...</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--tx3)" }}>ログがありません</div>
        ) : (
          <table>
            <thead><tr><th>日時</th><th>操作</th><th>対象</th><th>ユーザー</th><th>変更内容</th></tr></thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={log.id || i}>
                  <td className="mono" style={{ fontSize: 10, whiteSpace: "nowrap" }}>{fmtDate(log.createdAt)}</td>
                  <td><span className={`p ${actionBadge(log.action)}`} style={{ fontSize: 9 }}>{log.action}</span></td>
                  <td className="bold" style={{ fontSize: 11 }}>{log.target}</td>
                  <td style={{ fontSize: 11, color: "var(--tx2)" }}>{log.user}</td>
                  <td style={{ fontSize: 10, color: "var(--tx3)", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.details}>{log.details || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

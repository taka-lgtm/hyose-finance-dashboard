import { useState, useRef, useEffect } from "react";
import { Chart, registerables } from "chart.js";
import { MY, lastPL, calcLoanDerived, exportBalanceCSV, exportSummaryCSV, chartFont, chartGrid, chartLegend } from "../data";
import { BANK_COLORS, getBankColor } from "../data/banks";
import { calcAllProjections } from "../lib/loanCalc";
import LoanModal from "../components/LoanModal";

Chart.register(...registerables);

const VIEWS = { balance: "残高推移", table: "一覧", schedule: "スケジュール", analysis: "分析" };
const CATEGORIES = ["長期", "短期", "当座貸越"];

export default function Debt({ loans, addLoan, removeLoan, loading }) {
  const [view, setView] = useState("balance");
  const [bankFilter, setBankFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);

  const banks = [...new Set(loans.map((l) => l.bank))];
  const catFiltered = catFilter === "all" ? loans : loans.filter((l) => l.category === catFilter);
  const fl = bankFilter === "all" ? catFiltered : catFiltered.filter((l) => l.bank === bankFilter);
  const { tBal, tMon, wRate } = calcLoanDerived(loans);
  const bSum = banks.map((b) => { const ls = loans.filter((l) => l.bank === b); return { bank: b, bal: ls.reduce((s, l) => s + l.balance, 0), mon: ls.reduce((s, l) => s + l.monthly, 0), cnt: ls.length }; });
  const intCost = loans.map((l) => ({ ...l, annualInt: Math.round(l.balance * l.rate / 100) }));
  const totalInt = intCost.reduce((s, l) => s + l.annualInt, 0);
  const bankInt = banks.map((b) => ({ bank: b, int: intCost.filter((l) => l.bank === b).reduce((s, l) => s + l.annualInt, 0) })).sort((a, b) => b.int - a.int);
  const fixedBal = loans.filter((l) => l.rt === "固定").reduce((s, l) => s + l.balance, 0);
  const varBal = loans.filter((l) => l.rt === "変動").reduce((s, l) => s + l.balance, 0);
  const sorted = [...fl].sort((a, b) => b.rate - a.rate);
  const refiTarget = sorted.filter((l) => l.rate >= 1.5);
  const refiSavings = refiTarget.reduce((s, l) => s + Math.round(l.balance * (l.rate - 1.0) / 100), 0);

  // 借入条件から月別残高を自動計算
  const proj = calcAllProjections(fl);

  return (
    <div className="page"><div className="g">
      <div className="ph">
        <div><h2>融資管理</h2><p>融資ポートフォリオの全体像。返済管理から借換え戦略まで。</p></div>
        <div className="pa"><button className="btn pr" onClick={() => setModalOpen(true)}>＋ 新規登録</button></div>
      </div>

      <div className="debt-toolbar">
        <div className="debt-tabs">
          {Object.entries(VIEWS).map(([k, v]) => (
            <button key={k} className={`chip ${view === k ? "on" : ""}`} onClick={() => setView(k)}>{v}</button>
          ))}
        </div>
        <div className="debt-filter">
          <div style={{ display: "flex", gap: 4, marginRight: 8 }}>
            {["all", ...CATEGORIES].map((c) => (
              <button key={c} className={`chip ${catFilter === c ? "on" : ""}`} style={{ fontSize: 10, padding: "3px 8px" }} onClick={() => setCatFilter(c)}>{c === "all" ? "全区分" : c}</button>
            ))}
          </div>
          <select className="sel" value={bankFilter} onChange={(e) => setBankFilter(e.target.value)}>
            <option value="all">全銀行</option>
            {banks.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      <div className="g4">
        <div className="k hero"><div className="k-label">借入残高 合計</div><div className="k-val">{MY(tBal)}</div><div className="k-ctx">{loans.length}本 / 返済月数 {tMon > 0 ? Math.round(tBal / tMon) : "-"}ヶ月</div><div className="k-foot"><span>年間利息 {MY(totalInt)}</span></div></div>
        <div className="k"><div className="k-label">月間返済 合計</div><div className="k-val">{MY(tMon)}</div><div className="k-ctx">年間 {MY(tMon * 12)}</div><div className="k-foot"><span>売上比 {(tMon / 10000 * 12 / lastPL.売上高 * 100).toFixed(1)}%</span></div></div>
        <div className="k"><div className="k-label">平均金利</div><div className="k-val">{wRate}%</div><div className="k-ctx">固定 {MY(fixedBal)} / 変動 {MY(varBal)}</div></div>
        <div className="k"><div className="k-label">借換え削減余地</div><div className="k-val" style={{ color: "var(--ac)" }}>▼{MY(refiSavings)}/年</div><div className="k-ctx">{refiTarget.length}件を1.0%に借換えた場合</div></div>
      </div>

      {view === "balance" && <BalanceView proj={proj} wRate={wRate} tMon={tMon} loans={loans} bankFilter={bankFilter} />}
      {view === "table" && <ListView loans={fl} removeLoan={removeLoan} />}
      {view === "schedule" && <ScheduleView loans={loans} />}
      {view === "analysis" && <AnalysisView bSum={bSum} bankInt={bankInt} totalInt={totalInt} fixedBal={fixedBal} varBal={varBal} loans={loans} sorted={sorted} refiTarget={refiTarget} refiSavings={refiSavings} />}

      <LoanModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={addLoan} loans={loans} />
    </div></div>
  );
}

/* ══════════════════════════════════
   残高推移ビュー
   ══════════════════════════════════ */

// 区分別の残高推移テーブルブロック
function BalanceBlock({ title, badge, data, projLabels }) {
  if (!data.length) return null;
  const sub = data.reduce((s, l) => s + l.balance, 0);
  const subTotals = projLabels.map((_, i) => data.reduce((s, l) => s + l.balances[i], 0));
  const subMon = data.reduce((s, l) => s + l.monthly, 0);
  return (
    <>
      <tr className="cat-header-row">
        <td className="bold sticky sticky-0" colSpan={2}>
          <span className={`p ${badge}`} style={{ fontSize: 9, marginRight: 6 }}>{title}</span>
          {data.length}件
        </td>
        <td className="num" /><td className="num">{Math.round(subMon / 10000).toLocaleString()}</td>
        <td className="num" style={{ background: "rgba(34,201,148,.04)" }}>{Math.round(sub / 10000).toLocaleString()}</td>
        {subTotals.map((v, i) => <td key={i} className="num">{Math.round(v / 10000).toLocaleString()}</td>)}
      </tr>
      {data.map((l, i) => {
        const rc = l.rate >= 1.8 ? "var(--rd)" : l.rate >= 1.5 ? "var(--am)" : "var(--ac)";
        return (
          <tr key={i}>
            <td className="sticky sticky-0" style={{ paddingLeft: 20 }}>{l.bank}</td>
            <td className="sticky sticky-1">{l.name}</td>
            <td className="num" style={{ color: rc }}>{l.rate}%</td>
            <td className="num">{Math.round(l.monthly / 10000).toLocaleString()}</td>
            <td className="num" style={{ background: "rgba(34,201,148,.04)", color: "var(--tx)" }}>{Math.round(l.balance / 10000).toLocaleString()}</td>
            {l.balances.map((v, j) => <td key={j} className="num" style={v === 0 ? { color: "var(--tx3)", opacity: 0.5 } : {}}>{v === 0 ? "—" : Math.round(v / 10000).toLocaleString()}</td>)}
          </tr>
        );
      })}
    </>
  );
}

function BalanceView({ proj, wRate, tMon, loans, bankFilter }) {
  const { labels: projLabels, loanData: projData, totals: projTotals, bankData: projBankData } = proj;
  const loanChartRef = useRef(null), bankChartRef = useRef(null), totalChartRef = useRef(null);
  const loanChart = useRef(null), bankChart = useRef(null), totalChart = useRef(null);
  const scrollRef = useRef(null), wrapRef = useRef(null);

  const longTerm = projData.filter((l) => l.category === "長期");
  const shortTerm = projData.filter((l) => l.category === "短期");
  const overdraft = projData.filter((l) => l.category === "当座貸越");
  const curTotal = projData.reduce((s, l) => s + l.balance, 0);
  const endTotal = projTotals[projTotals.length - 1] || 0;

  // 区分別スタイル
  const getCategoryStyle = (cat) => {
    if (cat === "短期") return { borderDash: [6, 3], borderColor: "#e5a83a" };
    if (cat === "当座貸越") return { borderDash: [3, 3], borderColor: "rgba(255,255,255,.3)" };
    return { borderDash: [], borderColor: null };
  };

  // 合計残高推移
  useEffect(() => {
    totalChart.current?.destroy();
    if (!totalChartRef.current || !projTotals.length) return;
    totalChart.current = new Chart(totalChartRef.current, {
      type: "line",
      data: { labels: projLabels, datasets: [{ label: "借入残高 合計", data: projTotals, borderColor: "#22c994", backgroundColor: "rgba(34,201,148,.08)", fill: true, tension: 0.3, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: "#22c994" }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: (v) => Math.round(v / 10000).toLocaleString() + "万", font: chartFont }, grid: chartGrid }, x: { grid: { display: false }, ticks: { font: chartFont } } } },
    });
    return () => totalChart.current?.destroy();
  }, [projTotals, projLabels]);

  // 融資別チャート
  useEffect(() => {
    loanChart.current?.destroy();
    if (!loanChartRef.current || !projData.length) return;
    loanChart.current = new Chart(loanChartRef.current, {
      type: "line",
      data: { labels: projLabels, datasets: projData.map((l) => { const cs = getCategoryStyle(l.category); const color = cs.borderColor || getBankColor(l.bank); return { label: l.bank + " " + l.name, data: l.balances, borderColor: color, backgroundColor: color + "18", fill: true, tension: 0.3, borderWidth: 1.5, pointRadius: 2, borderDash: cs.borderDash }; }) },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: chartLegend }, scales: { y: { stacked: true, ticks: { callback: (v) => Math.round(v / 10000) + "万", font: chartFont }, grid: chartGrid }, x: { grid: { display: false }, ticks: { font: chartFont } } } },
    });
    return () => loanChart.current?.destroy();
  }, [projData, projLabels]);

  // 銀行別チャート
  useEffect(() => {
    bankChart.current?.destroy();
    if (!bankChartRef.current || !projBankData.length) return;
    bankChart.current = new Chart(bankChartRef.current, {
      type: "line",
      data: { labels: projLabels, datasets: projBankData.map((b) => ({ label: b.bank, data: b.balances, borderColor: getBankColor(b.bank), fill: false, tension: 0.3, borderWidth: 2, pointRadius: 3 })) },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: chartLegend }, scales: { y: { ticks: { callback: (v) => Math.round(v / 10000) + "万", font: chartFont }, grid: chartGrid }, x: { grid: { display: false }, ticks: { font: chartFont } } } },
    });
    return () => bankChart.current?.destroy();
  }, [projBankData, projLabels]);

  useEffect(() => {
    const scr = scrollRef.current, wrap = wrapRef.current;
    if (!scr || !wrap) return;
    const check = () => wrap.classList.toggle("scrolled-end", scr.scrollLeft + scr.clientWidth >= scr.scrollWidth - 4);
    scr.addEventListener("scroll", check);
    check();
    return () => scr.removeEventListener("scroll", check);
  }, [projData]);

  return (<>
    {/* 残高推移表（区分別3ブロック） */}
    <div className="c">
      <div className="ch">
        <div><div className="ct">返済残高推移表<span className="unit-badge">単位: 万円</span></div><div className="cs">据置中は残高が水平推移 / 区分別に表示</div></div>
        <button className="btn-export" onClick={() => exportBalanceCSV(loans, bankFilter)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          銀行提出用CSV
        </button>
      </div>
      <div className="cb" style={{ padding: 0 }}>
        <div className="scroll-table-wrap" ref={wrapRef}>
          <div className="scroll-table-inner" ref={scrollRef}>
            <table className="bal-tbl">
              <thead><tr>
                <th className="sticky sticky-0">銀行</th><th className="sticky sticky-1">融資名</th>
                <th className="num-head">金利</th><th className="num-head">月返済</th>
                <th className="num-head" style={{ background: "rgba(34,201,148,.06)" }}>現在</th>
                {projLabels.map((m) => <th key={m} className="num-head">{m}</th>)}
              </tr></thead>
              <tbody>
                <BalanceBlock title="長期" badge="bu" data={longTerm} projLabels={projLabels} />
                <BalanceBlock title="短期" badge="wr" data={shortTerm} projLabels={projLabels} />
                <BalanceBlock title="当座貸越" badge="mt" data={overdraft} projLabels={projLabels} />
                <tr className="total-row">
                  <td className="bold sticky sticky-0">総合計</td><td className="sticky sticky-1" />
                  <td className="num">{wRate}%</td><td className="num">{Math.round(tMon / 10000).toLocaleString()}</td>
                  <td className="num" style={{ background: "rgba(34,201,148,.04)" }}>{Math.round(curTotal / 10000).toLocaleString()}</td>
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

    {/* チャート（表の下に配置） */}
    <div className="c">
      <div className="ch"><div><div className="ct">借入残高 合計推移</div><div className="cs">12ヶ月先まで自動計算</div></div></div>
      <div className="cb"><div className="chart"><canvas ref={totalChartRef} /></div></div>
    </div>
    <div className="g2">
      <div className="c"><div className="ch"><div><div className="ct">融資別 残高推移</div><div className="cs">長期=実線 / 短期=破線(橙) / 当座貸越=点線(灰)</div></div></div><div className="cb"><div className="chart tall"><canvas ref={loanChartRef} /></div></div></div>
      <div className="c"><div className="ch"><div><div className="ct">銀行別 残高推移</div><div className="cs">銀行ごとの合算残高</div></div></div><div className="cb"><div className="chart tall"><canvas ref={bankChartRef} /></div></div></div>
    </div>
    <div className="g2">
      <div className="c"><div className="ch"><div><div className="ct">12ヶ月後 借入残高予測</div></div></div>
        <div className="cb"><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ textAlign: "center", padding: 16, borderRadius: "var(--rs)", background: "rgba(255,255,255,.02)", border: "1px solid var(--bd)" }}>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--tx3)", fontWeight: 600 }}>現在残高</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 24, fontWeight: 700, marginTop: 6 }}>{MY(curTotal)}</div>
          </div>
          <div style={{ textAlign: "center", padding: 16, borderRadius: "var(--rs)", background: "rgba(34,201,148,.04)", border: "1px solid rgba(34,201,148,.12)" }}>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--tx3)", fontWeight: 600 }}>12ヶ月後 予測</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 24, fontWeight: 700, color: "var(--ac)", marginTop: 6 }}>{MY(endTotal)}</div>
            <div style={{ fontSize: 10, color: "var(--ac)", marginTop: 4 }}>▼{MY(curTotal - endTotal)} 減少</div>
          </div>
        </div></div></div>
      <div className="c"><div className="ch"><div><div className="ct">銀行提出用エクスポート</div></div></div>
        <div className="cb"><div style={{ display: "grid", gap: 10 }}>
          <button className="btn-export" style={{ width: "100%", justifyContent: "center", padding: 12 }} onClick={() => exportBalanceCSV(loans, bankFilter)}>返済残高推移表（CSV）</button>
          <button className="btn-export" style={{ width: "100%", justifyContent: "center", padding: 12 }} onClick={() => exportSummaryCSV(loans)}>融資一覧サマリー（CSV）</button>
          <div style={{ fontSize: 10, color: "var(--tx3)", lineHeight: 1.5, marginTop: 4 }}>※ BOM付きCSV形式。Excelでそのまま開けます。</div>
        </div></div></div>
    </div>
  </>);
}

/* ══════════════════════════════════
   一覧ビュー（ソート＋区分フィルタ）
   ══════════════════════════════════ */

const LIST_COLS = [
  { key: "category", label: "区分", align: "" },
  { key: "purpose", label: "使途", align: "" },
  { key: "bank", label: "銀行名", align: "" },
  { key: "name", label: "融資名", align: "" },
  { key: "balance", label: "残高", align: "tr", fmt: (v) => MY(v) },
  { key: "monthly", label: "月返済額", align: "tr", fmt: (v) => MY(v) },
  { key: "rate", label: "実効金利", align: "tr", fmt: (v) => v + "%" },
  { key: "baseRate", label: "基本金利", align: "tr", fmt: (v) => v + "%" },
  { key: "guaranteeFee", label: "保証料", align: "tr", fmt: (v) => v ? v + "%" : "-" },
  { key: "endDate", label: "最終期限", align: "tr", fmt: (v) => v || "-" },
  { key: "condition", label: "保証条件", align: "", fmt: (v) => v === "P" ? "プロパー" : v === "保" ? "保証付き" : v || "-" },
  { key: "guaranteePlan", label: "保証制度", align: "", fmt: (v) => v || "-" },
  { key: "notes", label: "備考", align: "", fmt: (v) => v || "-" },
];

function ListView({ loans, removeLoan }) {
  const [sortKey, setSortKey] = useState("balance");
  const [sortAsc, setSortAsc] = useState(false);
  const [catFilter, setCatFilter] = useState("all");

  const filtered = catFilter === "all" ? loans : loans.filter((l) => l.category === catFilter);
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? "", bv = b[sortKey] ?? "";
    if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av;
    return sortAsc ? String(av).localeCompare(String(bv), "ja") : String(bv).localeCompare(String(av), "ja");
  });

  const toggleSort = (key) => {
    if (sortKey === key) { setSortAsc(!sortAsc); } else { setSortKey(key); setSortAsc(false); }
  };

  return (
    <div className="c">
      <div className="ch">
        <div><div className="ct">融資一覧</div></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {["all", ...CATEGORIES].map((c) => (
              <button key={c} className={`chip ${catFilter === c ? "on" : ""}`} style={{ fontSize: 10, padding: "3px 8px" }} onClick={() => setCatFilter(c)}>{c === "all" ? "全て" : c}</button>
            ))}
          </div>
          <span className="p bu">{sorted.length}件</span>
        </div>
      </div>
      <div className="cb tw">
        <table>
          <thead><tr>
            {LIST_COLS.map((col) => (
              <th key={col.key} className={col.align} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }} onClick={() => toggleSort(col.key)}>
                {col.label}{sortKey === col.key ? (sortAsc ? " ↑" : " ↓") : ""}
              </th>
            ))}
            <th></th>
          </tr></thead>
          <tbody>
            {sorted.map((l, i) => (
              <tr key={l.id || i}>
                {LIST_COLS.map((col) => {
                  const raw = l[col.key];
                  const display = col.fmt ? col.fmt(raw) : (raw ?? "-");
                  const cls = col.align ? `${col.align} mono` : "";
                  if (col.key === "category") return <td key={col.key}><span className={`p ${l.category === "長期" ? "bu" : l.category === "短期" ? "wr" : "mt"}`} style={{ fontSize: 9 }}>{display}</span></td>;
                  if (col.key === "bank") return <td key={col.key} className="bold">{display}</td>;
                  if (col.key === "rate") return <td key={col.key} className={cls} style={{ color: l.rate >= 1.8 ? "var(--rd)" : l.rate >= 1.5 ? "var(--am)" : "var(--ac)" }}>{display}</td>;
                  return <td key={col.key} className={cls}>{display}</td>;
                })}
                <td><button onClick={() => { if (confirm(`「${l.name}」を削除しますか？`)) removeLoan(l.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tx3)", fontSize: 10 }} onMouseOver={(e) => e.target.style.color = "var(--rd)"} onMouseOut={(e) => e.target.style.color = "var(--tx3)"}>削除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════
   スケジュールビュー（変更なし）
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
   分析ビュー（変更なし）
   ══════════════════════════════════ */

function AnalysisView({ bSum, bankInt, totalInt, fixedBal, varBal, loans, sorted, refiTarget, refiSavings }) {
  const tBal = loans.reduce((s, l) => s + l.balance, 0);
  const proparBal = loans.filter((l) => l.condition === "P").reduce((s, l) => s + l.balance, 0);
  const guarBal = loans.filter((l) => l.condition === "保").reduce((s, l) => s + l.balance, 0);
  const r1 = useRef(null), r2 = useRef(null), r3 = useRef(null), c1 = useRef(null), c2 = useRef(null), c3 = useRef(null);

  // 固定vs変動ドーナツ
  useEffect(() => {
    c1.current?.destroy();
    if (!r1.current) return;
    c1.current = new Chart(r1.current, { type: "doughnut", data: { labels: ["固定金利", "変動金利"], datasets: [{ data: [fixedBal, varBal], backgroundColor: ["rgba(34,201,148,.6)", "rgba(229,168,58,.6)"], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "65%", plugins: { legend: chartLegend } } });
    return () => c1.current?.destroy();
  }, [fixedBal, varBal]);

  // プロパーvs保証付きドーナツ
  useEffect(() => {
    c2.current?.destroy();
    if (!r2.current) return;
    c2.current = new Chart(r2.current, { type: "doughnut", data: { labels: ["プロパー", "保証付き"], datasets: [{ data: [proparBal, guarBal], backgroundColor: ["rgba(91,141,239,.6)", "rgba(155,124,246,.6)"], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "65%", plugins: { legend: chartLegend } } });
    return () => c2.current?.destroy();
  }, [proparBal, guarBal]);

  // 金利帯別
  useEffect(() => {
    c3.current?.destroy();
    if (!r3.current) return;
    const rateBands = [{ label: "〜1.0%", min: 0, max: 1.0 }, { label: "1.0〜1.5%", min: 1.0, max: 1.5 }, { label: "1.5〜2.0%", min: 1.5, max: 2.0 }, { label: "2.0%〜", min: 2.0, max: 99 }];
    c3.current = new Chart(r3.current, { type: "bar", data: { labels: rateBands.map((b) => b.label), datasets: [{ data: rateBands.map((b) => loans.filter((l) => l.rate >= b.min && l.rate < b.max).reduce((s, l) => s + l.balance, 0)), backgroundColor: ["rgba(34,201,148,.6)", "rgba(91,141,239,.5)", "rgba(229,168,58,.5)", "rgba(229,91,91,.5)"], borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: (v) => Math.round(v / 10000) + "万", font: chartFont }, grid: chartGrid }, x: { grid: { display: false }, ticks: { font: chartFont } } } } });
    return () => c3.current?.destroy();
  }, [loans]);

  return (<>
    {/* 1段目: 銀行別融資残高（バー形式） */}
    <div className="c">
      <div className="ch"><div><div className="ct">銀行別融資残高</div></div></div>
      <div className="cb">
        {bSum.sort((a, b) => b.bal - a.bal).map((b, i) => {
          const pv = tBal > 0 ? (b.bal / tBal * 100).toFixed(1) : 0;
          return (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                <span className="bold">{b.bank}</span>
                <span className="mono">{MY(b.bal)} ({pv}%)</span>
              </div>
              <div className="int-bar"><div className="ib-fill" style={{ width: pv + "%", background: BANK_COLORS[b.bank] || "#5b8def" }} /></div>
            </div>
          );
        })}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.05)", display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
          <span>合計</span><span className="mono">{MY(tBal)}</span>
        </div>
      </div>
    </div>

    {/* 2段目: 3ブロック並列 */}
    <div className="g3">
      {/* 固定 vs 変動 */}
      <div className="c"><div className="ch"><div><div className="ct">固定 vs 変動</div></div></div>
        <div className="cb">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ textAlign: "center", padding: 12, borderRadius: "var(--rs)", background: "rgba(34,201,148,.05)", border: "1px solid rgba(34,201,148,.15)" }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--tx3)", fontWeight: 600 }}>固定</div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, fontWeight: 700, color: "var(--ac)", marginTop: 4 }}>{tBal > 0 ? (fixedBal / tBal * 100).toFixed(1) : 0}%</div>
            </div>
            <div style={{ textAlign: "center", padding: 12, borderRadius: "var(--rs)", background: "rgba(229,168,58,.05)", border: "1px solid rgba(229,168,58,.15)" }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--tx3)", fontWeight: 600 }}>変動</div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, fontWeight: 700, color: "var(--am)", marginTop: 4 }}>{tBal > 0 ? (varBal / tBal * 100).toFixed(1) : 0}%</div>
            </div>
          </div>
          <div className="chart"><canvas ref={r1} /></div>
        </div>
      </div>

      {/* プロパー vs 保証付き */}
      <div className="c"><div className="ch"><div><div className="ct">プロパー vs 保証付き</div></div></div>
        <div className="cb">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ textAlign: "center", padding: 12, borderRadius: "var(--rs)", background: "rgba(91,141,239,.05)", border: "1px solid rgba(91,141,239,.15)" }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--tx3)", fontWeight: 600 }}>プロパー</div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, fontWeight: 700, color: "var(--bl)", marginTop: 4 }}>{tBal > 0 ? (proparBal / tBal * 100).toFixed(1) : 0}%</div>
            </div>
            <div style={{ textAlign: "center", padding: 12, borderRadius: "var(--rs)", background: "rgba(155,124,246,.05)", border: "1px solid rgba(155,124,246,.15)" }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--tx3)", fontWeight: 600 }}>保証付き</div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, fontWeight: 700, color: "var(--pu)", marginTop: 4 }}>{tBal > 0 ? (guarBal / tBal * 100).toFixed(1) : 0}%</div>
            </div>
          </div>
          <div className="chart"><canvas ref={r2} /></div>
        </div>
      </div>

      {/* 銀行別年間利息コスト */}
      <div className="c"><div className="ch"><div><div className="ct">年間利息コスト</div></div></div>
        <div className="cb">
          {bankInt.map((b, i) => { const pv = totalInt > 0 ? (b.int / totalInt * 100).toFixed(1) : 0; return (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 3 }}><span className="bold">{b.bank}</span><span className="mono">{MY(b.int)}/年</span></div>
              <div className="int-bar"><div className="ib-fill" style={{ width: pv + "%", background: BANK_COLORS[b.bank] || "#5b8def" }} /></div>
            </div>
          ); })}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.05)", display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700 }}><span>合計</span><span className="mono">{MY(totalInt)}/年</span></div>
        </div>
      </div>
    </div>

    {/* 3段目: 金利帯別 */}
    <div className="c"><div className="ch"><div><div className="ct">金利帯別残高分布</div></div></div><div className="cb"><div className="chart"><canvas ref={r3} /></div></div></div>

    {/* 借換えシミュレーション */}
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

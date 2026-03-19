import { useState, useRef, useEffect, useCallback } from "react";
import { Chart, registerables } from "chart.js";
import { MONTHS, M, MY, lastPL, calcLoanDerived, exportBalanceCSV, exportSummaryCSV, chartFont, chartGrid, chartLegend } from "../data";
import { BANK_COLORS } from "../data/banks";
import LoanModal from "../components/LoanModal";

Chart.register(...registerables);

const VIEWS = { cards: "カード", table: "一覧", schedule: "スケジュール", balance: "残高推移", analysis: "分析" };

export default function Debt({ loans, addLoan, removeLoan, loading }) {
  const [view, setView] = useState("cards");
  const [bankFilter, setBankFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);

  const banks = [...new Set(loans.map((l) => l.bank))];
  const fl = bankFilter === "all" ? loans : loans.filter((l) => l.bank === bankFilter);
  const sorted = [...fl].sort((a, b) => b.rate - a.rate);
  const { tBal, tMon, wRate } = calcLoanDerived(loans);
  const bSum = banks.map((b) => { const ls = loans.filter((l) => l.bank === b); return { bank: b, bal: ls.reduce((s, l) => s + l.balance, 0), mon: ls.reduce((s, l) => s + l.monthly, 0), cnt: ls.length }; });
  const intCost = loans.map((l) => ({ ...l, annualInt: Math.round(l.balance * l.rate / 100) }));
  const totalInt = intCost.reduce((s, l) => s + l.annualInt, 0);
  const bankInt = banks.map((b) => ({ bank: b, int: intCost.filter((l) => l.bank === b).reduce((s, l) => s + l.annualInt, 0) })).sort((a, b) => b.int - a.int);
  const fixedBal = loans.filter((l) => l.rt === "固定").reduce((s, l) => s + l.balance, 0);
  const varBal = loans.filter((l) => l.rt === "変動").reduce((s, l) => s + l.balance, 0);
  const refiTarget = sorted.filter((l) => l.rate >= 1.5);
  const refiSavings = refiTarget.reduce((s, l) => s + Math.round(l.balance * (l.rate - 1.0) / 100), 0);

  const projData = fl.map((l) => { const months = []; let bal = l.balance; for (let i = 0; i < 12; i++) { bal = Math.max(0, bal - l.monthly); months.push(bal); } return { ...l, months }; });
  const projTotals = MONTHS.map((_, i) => projData.reduce((s, l) => s + l.months[i], 0));

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
          <span className="df-label">絞り込み</span>
          <select className="sel" value={bankFilter} onChange={(e) => setBankFilter(e.target.value)}>
            <option value="all">全銀行</option>
            {banks.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      <div className="g4">
        <div className="k hero"><div className="k-label">借入残高 合計</div><div className="k-val">{M(tBal)}</div><div className="k-ctx">{loans.length}本 / 加重平均 {wRate}%</div><div className="k-foot"><span>年間利息 {M(totalInt)}</span></div></div>
        <div className="k"><div className="k-label">月間返済 合計</div><div className="k-val">{M(tMon)}</div><div className="k-ctx">年間 {M(tMon * 12)}</div><div className="k-foot"><span>売上比 {(tMon * 12 / lastPL.売上高 * 100).toFixed(1)}%</span></div></div>
        <div className="k"><div className="k-label">金利リスク</div><div className="k-val" style={{ color: "var(--am)" }}>{tBal > 0 ? (varBal / tBal * 100).toFixed(1) : 0}%</div><div className="k-ctx">変動 {M(varBal)} / 固定 {M(fixedBal)}</div></div>
        <div className="k"><div className="k-label">借換え削減余地</div><div className="k-val" style={{ color: "var(--ac)" }}>▼{M(refiSavings)}/年</div><div className="k-ctx">{refiTarget.length}件を1.0%に借換えた場合</div></div>
      </div>

      {view === "cards" && <CardsView sorted={sorted} bSum={bSum} bankInt={bankInt} tBal={tBal} removeLoan={removeLoan} />}
      {view === "table" && <TableView sorted={sorted} fl={fl} removeLoan={removeLoan} />}
      {view === "schedule" && <ScheduleView loans={loans} />}
      {view === "balance" && <BalanceView fl={fl} projData={projData} projTotals={projTotals} wRate={wRate} tMon={tMon} loans={loans} bankFilter={bankFilter} />}
      {view === "analysis" && <AnalysisView bSum={bSum} bankInt={bankInt} totalInt={totalInt} fixedBal={fixedBal} varBal={varBal} loans={loans} sorted={sorted} refiTarget={refiTarget} refiSavings={refiSavings} />}

      <LoanModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={addLoan} loans={loans} />
    </div></div>
  );
}

/* ── Sub-views ── */
function CardsView({ sorted, bSum, bankInt, tBal, removeLoan }) {
  const handleDelete = (loan) => {
    if (confirm(`「${loan.bank} / ${loan.name}」を削除しますか？この操作は取り消せません。`)) {
      removeLoan(loan.id);
    }
  };
  return (<>
    <div className="g3">
      {sorted.map((l, i) => {
        const rem = Math.ceil(l.balance / l.monthly);
        const repaid = ((l.principal - l.balance) / l.principal * 100).toFixed(0);
        const end = new Date(l.start); end.setMonth(end.getMonth() + l.term);
        const rc = l.rate >= 1.8 ? "var(--rd)" : l.rate >= 1.5 ? "var(--am)" : "var(--ac)";
        return (
          <div key={l.id || i} className="loan-card">
            <div className="lc-head">
              <div><div className="lc-bank">{l.bank} <span className={`p ${l.rt === "変動" ? "wr" : "mt"}`} style={{ marginLeft: 4 }}>{l.rt}</span></div><div className="lc-name">{l.name}</div></div>
              <div className="lc-rate" style={{ color: rc }}>{l.rate}%</div>
            </div>
            <div className="lc-grid">
              <div className="lc-item"><div className="lci-label">残高</div><div className="lci-val">{M(l.balance)}</div></div>
              <div className="lc-item"><div className="lci-label">月返済</div><div className="lci-val">{M(l.monthly)}</div></div>
              <div className="lc-item"><div className="lci-label">残期間</div><div className="lci-val">{Math.floor(rem / 12)}年{rem % 12}ヶ月</div></div>
            </div>
            <div className="lc-progress">
              <div className="lcp-label"><span>返済進捗</span><span>{repaid}%</span></div>
              <div className="lcp-bar"><span style={{ width: repaid + "%", background: rc }} /></div>
            </div>
            <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--tx3)" }}>
              <span>{l.method} / {l.collateral}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>完済 {end.toISOString().slice(0, 7)}</span>
                <button onClick={() => handleDelete(l)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tx3)", fontSize: 10, padding: "2px 4px", borderRadius: 4, transition: ".15s" }} onMouseOver={(e) => e.target.style.color = "var(--rd)"} onMouseOut={(e) => e.target.style.color = "var(--tx3)"} title="削除">✕</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
    <div className="g2">
      <div className="c"><div className="ch"><div><div className="ct">銀行別サマリー</div></div></div>
        <div className="cb tw"><table>
          <thead><tr><th>銀行</th><th className="tr">件数</th><th className="tr">残高</th><th className="tr">月返済</th><th className="tr">年間利息</th><th className="tr">シェア</th></tr></thead>
          <tbody>{bSum.map((b, i) => { const bi = bankInt.find((x) => x.bank === b.bank); return (
            <tr key={i}><td className="bold">{b.bank}</td><td className="tr mono">{b.cnt}</td><td className="tr mono">{M(b.bal)}</td><td className="tr mono">{M(b.mon)}</td><td className="tr mono">{M(bi?.int || 0)}</td><td className="tr mono">{tBal > 0 ? (b.bal / tBal * 100).toFixed(1) : 0}%</td></tr>
          ); })}</tbody></table></div></div>
      <div className="c"><div className="ch"><div><div className="ct">借換え優先順位</div></div></div>
        <div className="cb"><div className="fl">{sorted.slice(0, 4).map((l, i) => { const sv = Math.round(l.balance * (l.rate - 1.0) / 100); const rc = l.rate >= 1.8 ? "var(--rd)" : l.rate >= 1.5 ? "var(--am)" : "var(--ac)"; return (
          <div key={i} className="fl-r"><div><strong>{l.bank} / {l.name}</strong><span>残高 {M(l.balance)} / {l.rt} / 借換え→年▼{M(sv)}</span></div><div className="fl-v" style={{ color: rc }}>{l.rate}%</div></div>
        ); })}</div></div></div>
    </div>
  </>);
}

function TableView({ sorted, fl, removeLoan }) {
  return (
    <div className="c"><div className="ch"><div><div className="ct">融資一覧</div></div><span className="p bu">{fl.length}件</span></div>
      <div className="cb tw"><table>
        <thead><tr><th>管理番号</th><th>融資名</th><th>銀行</th><th className="tr">当初借入</th><th className="tr">残高</th><th className="tr">金利</th><th>種別</th><th className="tr">月返済</th><th>方式</th><th>担保</th><th className="tr">据置</th><th></th></tr></thead>
        <tbody>{sorted.map((l, i) => (
          <tr key={l.id || i}><td className="mono">{l.num}</td><td className="bold">{l.name}</td><td>{l.bank}</td><td className="tr mono">{M(l.principal)}</td><td className="tr mono">{M(l.balance)}</td><td className="tr mono" style={{ color: l.rate >= 1.8 ? "var(--rd)" : l.rate >= 1.5 ? "var(--am)" : "var(--ac)" }}>{l.rate}%</td><td><span className={`p ${l.rt === "変動" ? "wr" : "mt"}`}>{l.rt}</span></td><td className="tr mono">{M(l.monthly)}</td><td>{l.method}</td><td>{l.collateral}</td><td className="tr mono">{l.grace}ヶ月</td>
          <td><button onClick={() => { if (confirm(`「${l.name}」を削除しますか？`)) removeLoan(l.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tx3)", fontSize: 10 }} onMouseOver={(e) => e.target.style.color = "var(--rd)"} onMouseOut={(e) => e.target.style.color = "var(--tx3)"}>削除</button></td>
          </tr>
        ))}</tbody></table></div></div>
  );
}

function ScheduleView({ loans }) {
  const ref = useRef(null), ch = useRef(null);
  useEffect(() => {
    ch.current?.destroy();
    if (!ref.current) return;
    const items = loans.map((l) => ({ name: l.bank + " " + l.name, months: Math.ceil(l.balance / l.monthly) })).sort((a, b) => b.months - a.months);
    ch.current = new Chart(ref.current, { type: "bar", data: { labels: items.map((i) => i.name), datasets: [{ data: items.map((i) => i.months), backgroundColor: items.map((i) => BANK_COLORS[i.name.split(" ")[0]] || "rgba(91,141,239,.5)"), borderRadius: 4 }] }, options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { callback: (v) => v + "ヶ月", font: chartFont }, grid: chartGrid }, y: { ticks: { font: { ...chartFont, size: 9 } }, grid: { display: false } } } } });
    return () => ch.current?.destroy();
  }, [loans]);

  return (<>
    <div className="c"><div className="ch"><div><div className="ct">返済スケジュール</div></div></div>
      <div className="cb tw"><table>
        <thead><tr><th>融資名</th><th>銀行</th><th className="tr">月返済</th><th className="tr">残回数</th><th className="tr">残期間</th><th>方式</th><th className="tr">借入日</th><th className="tr">完済予定</th><th className="tr">年間利息</th></tr></thead>
        <tbody>{loans.map((l, i) => { const r = Math.ceil(l.balance / l.monthly); const e = new Date(l.start); e.setMonth(e.getMonth() + l.term); return (
          <tr key={i}><td className="bold">{l.name}</td><td>{l.bank}</td><td className="tr mono">{M(l.monthly)}</td><td className="tr mono">{r}回</td><td className="tr mono">{Math.floor(r / 12)}年{r % 12}ヶ月</td><td>{l.method}</td><td className="tr mono">{l.start}</td><td className="tr mono">{e.toISOString().slice(0, 10)}</td><td className="tr mono">{M(Math.round(l.balance * l.rate / 100))}</td></tr>
        ); })}</tbody></table></div></div>
    <div className="c"><div className="ch"><div><div className="ct">完済タイムライン</div></div></div><div className="cb"><div className="chart tall"><canvas ref={ref} /></div></div></div>
  </>);
}

function BalanceView({ fl, projData, projTotals, wRate, tMon, loans, bankFilter }) {
  const ref = useRef(null), ch = useRef(null), scrollRef = useRef(null), wrapRef = useRef(null);
  const colors = ["#22c994", "#5b8def", "#e5a83a", "#9b7cf6", "#e55b5b", "#ff8c69", "#69d2e7"];

  useEffect(() => {
    ch.current?.destroy();
    if (!ref.current) return;
    ch.current = new Chart(ref.current, { type: "line", data: { labels: MONTHS, datasets: projData.map((l, i) => ({ label: l.bank + " " + l.name, data: l.months, borderColor: colors[i % colors.length], backgroundColor: colors[i % colors.length] + "18", fill: true, tension: 0.3, borderWidth: 1.5, pointRadius: 2 })) }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: chartLegend }, scales: { y: { stacked: true, ticks: { callback: (v) => v + "万", font: chartFont }, grid: chartGrid }, x: { grid: { display: false }, ticks: { font: chartFont } } } } });
    return () => ch.current?.destroy();
  }, [projData]);

  useEffect(() => {
    const scr = scrollRef.current, wrap = wrapRef.current;
    if (!scr || !wrap) return;
    const check = () => wrap.classList.toggle("scrolled-end", scr.scrollLeft + scr.clientWidth >= scr.scrollWidth - 4);
    scr.addEventListener("scroll", check);
    check();
    return () => scr.removeEventListener("scroll", check);
  }, [projData]);

  const curTotal = fl.reduce((s, l) => s + l.balance, 0);
  const endTotal = projTotals[projTotals.length - 1];

  return (<>
    <div className="c">
      <div className="ch">
        <div><div className="ct">返済残高推移表<span className="unit-badge">単位: 万円</span></div><div className="cs">左2列固定、横スクロールで全月を確認（FY2026 見込み）</div></div>
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
                <th className="sticky sticky-0">融資名</th><th className="sticky sticky-1">銀行</th>
                <th className="num-head">金利</th><th className="num-head">月返済</th>
                <th className="num-head" style={{ background: "rgba(34,201,148,.06)" }}>現在</th>
                {MONTHS.map((m) => <th key={m} className="num-head">{m}</th>)}
              </tr></thead>
              <tbody>
                {projData.map((l, i) => {
                  const rc = l.rate >= 1.8 ? "var(--rd)" : l.rate >= 1.5 ? "var(--am)" : "var(--ac)";
                  return (
                    <tr key={i}>
                      <td className="bold sticky sticky-0">{l.name}</td>
                      <td className="sticky sticky-1" style={{ color: "var(--tx2)" }}>{l.bank}</td>
                      <td className="num" style={{ color: rc }}>{l.rate}%</td>
                      <td className="num">{l.monthly.toLocaleString()}</td>
                      <td className="num" style={{ background: "rgba(34,201,148,.04)", color: "var(--tx)" }}>{l.balance.toLocaleString()}</td>
                      {l.months.map((v, j) => <td key={j} className="num" style={v === 0 ? { color: "var(--tx3)", opacity: 0.5 } : {}}>{v === 0 ? "—" : v.toLocaleString()}</td>)}
                    </tr>
                  );
                })}
                <tr className="total-row">
                  <td className="bold sticky sticky-0">合計</td><td className="sticky sticky-1" />
                  <td className="num">{wRate}%</td><td className="num">{tMon.toLocaleString()}</td>
                  <td className="num" style={{ background: "rgba(34,201,148,.04)" }}>{curTotal.toLocaleString()}</td>
                  {projTotals.map((v, i) => <td key={i} className="num">{v.toLocaleString()}</td>)}
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
    <div className="c"><div className="ch"><div><div className="ct">残高推移グラフ</div></div></div><div className="cb"><div className="chart tall"><canvas ref={ref} /></div></div></div>
    <div className="g2">
      <div className="c"><div className="ch"><div><div className="ct">年度末 借入残高予測</div></div></div>
        <div className="cb"><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ textAlign: "center", padding: 16, borderRadius: "var(--rs)", background: "rgba(255,255,255,.02)", border: "1px solid var(--bd)" }}>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--tx3)", fontWeight: 600 }}>現在残高</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 24, fontWeight: 700, marginTop: 6 }}>{M(curTotal)}</div>
          </div>
          <div style={{ textAlign: "center", padding: 16, borderRadius: "var(--rs)", background: "rgba(34,201,148,.04)", border: "1px solid rgba(34,201,148,.12)" }}>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--tx3)", fontWeight: 600 }}>12ヶ月後 予測</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 24, fontWeight: 700, color: "var(--ac)", marginTop: 6 }}>{M(endTotal)}</div>
            <div style={{ fontSize: 10, color: "var(--ac)", marginTop: 4 }}>▼{M(curTotal - endTotal)} 減少</div>
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

function AnalysisView({ bSum, bankInt, totalInt, fixedBal, varBal, loans, sorted, refiTarget, refiSavings }) {
  const tBal = loans.reduce((s, l) => s + l.balance, 0);
  const r1 = useRef(null), r2 = useRef(null), r3 = useRef(null), c1 = useRef(null), c2 = useRef(null), c3 = useRef(null);

  useEffect(() => {
    [c1, c2, c3].forEach((c) => c.current?.destroy());
    if (r1.current) c1.current = new Chart(r1.current, { type: "doughnut", data: { labels: ["固定金利", "変動金利"], datasets: [{ data: [fixedBal, varBal], backgroundColor: ["rgba(34,201,148,.6)", "rgba(229,168,58,.6)"], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "65%", plugins: { legend: chartLegend } } });
    if (r2.current) c2.current = new Chart(r2.current, { type: "doughnut", data: { labels: bSum.map((v) => v.bank), datasets: [{ data: bSum.map((v) => v.bal), backgroundColor: bSum.map((v) => BANK_COLORS[v.bank] || "#5b8def"), borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "65%", plugins: { legend: chartLegend } } });
    const rateBands = [{ label: "〜1.0%", min: 0, max: 1.0 }, { label: "1.0〜1.5%", min: 1.0, max: 1.5 }, { label: "1.5〜2.0%", min: 1.5, max: 2.0 }, { label: "2.0%〜", min: 2.0, max: 99 }];
    if (r3.current) c3.current = new Chart(r3.current, { type: "bar", data: { labels: rateBands.map((b) => b.label), datasets: [{ data: rateBands.map((b) => loans.filter((l) => l.rate >= b.min && l.rate < b.max).reduce((s, l) => s + l.balance, 0)), backgroundColor: ["rgba(34,201,148,.6)", "rgba(91,141,239,.5)", "rgba(229,168,58,.5)", "rgba(229,91,91,.5)"], borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: (v) => v + "万", font: chartFont }, grid: chartGrid }, x: { grid: { display: false }, ticks: { font: chartFont } } } } });
    return () => [c1, c2, c3].forEach((c) => c.current?.destroy());
  }, [loans, fixedBal, varBal, bSum]);

  return (<>
    <div className="g2">
      <div className="c"><div className="ch"><div><div className="ct">固定 vs 変動</div></div></div>
        <div className="cb">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div style={{ textAlign: "center", padding: 16, borderRadius: "var(--rs)", background: "rgba(34,201,148,.05)", border: "1px solid rgba(34,201,148,.15)" }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--tx3)", fontWeight: 600 }}>固定金利</div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 28, fontWeight: 700, color: "var(--ac)", marginTop: 6 }}>{tBal > 0 ? (fixedBal / tBal * 100).toFixed(1) : 0}%</div>
            </div>
            <div style={{ textAlign: "center", padding: 16, borderRadius: "var(--rs)", background: "rgba(229,168,58,.05)", border: "1px solid rgba(229,168,58,.15)" }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--tx3)", fontWeight: 600 }}>変動金利</div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 28, fontWeight: 700, color: "var(--am)", marginTop: 6 }}>{tBal > 0 ? (varBal / tBal * 100).toFixed(1) : 0}%</div>
            </div>
          </div>
          <div className="chart"><canvas ref={r1} /></div>
        </div></div>
      <div className="c"><div className="ch"><div><div className="ct">銀行別年間利息コスト</div></div></div>
        <div className="cb">
          {bankInt.map((b, i) => { const pv = totalInt > 0 ? (b.int / totalInt * 100).toFixed(1) : 0; return (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}><span className="bold">{b.bank}</span><span className="mono">{M(b.int)}/年 ({pv}%)</span></div>
              <div className="int-bar"><div className="ib-fill" style={{ width: pv + "%", background: BANK_COLORS[b.bank] || "#5b8def" }} /></div>
            </div>
          ); })}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.05)", display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}><span>合計</span><span className="mono">{M(totalInt)}/年</span></div>
        </div></div>
    </div>
    <div className="g2">
      <div className="c"><div className="ch"><div><div className="ct">銀行依存度</div></div></div><div className="cb"><div className="chart"><canvas ref={r2} /></div></div></div>
      <div className="c"><div className="ch"><div><div className="ct">金利帯別残高分布</div></div></div><div className="cb"><div className="chart"><canvas ref={r3} /></div></div></div>
    </div>
    {refiTarget.length > 0 && (
      <div className="c"><div className="ch"><div><div className="ct">借換えシミュレーション</div></div><span className="p gd">▼{M(refiSavings)}/年</span></div>
        <div className="cb tw"><table>
          <thead><tr><th>融資名</th><th>銀行</th><th className="tr">残高</th><th className="tr">現行金利</th><th className="tr">現行利息/年</th><th className="tr">借換後</th><th className="tr">借換後利息</th><th className="tr">節約額</th></tr></thead>
          <tbody>{refiTarget.map((l, i) => { const cur = Math.round(l.balance * l.rate / 100), nw = Math.round(l.balance * 1.0 / 100); return (
            <tr key={i}><td className="bold">{l.name}</td><td>{l.bank}</td><td className="tr mono">{M(l.balance)}</td><td className="tr mono" style={{ color: "var(--rd)" }}>{l.rate}%</td><td className="tr mono">{M(cur)}</td><td className="tr mono" style={{ color: "var(--ac)" }}>1.0%</td><td className="tr mono">{M(nw)}</td><td className="tr mono" style={{ color: "var(--ac)" }}>▼{M(cur - nw)}</td></tr>
          ); })}</tbody></table></div></div>
    )}
  </>);
}

import { useState, useRef, useEffect, useCallback } from "react";
import { Chart, registerables } from "chart.js";
import { MY, lastPL, calcLoanDerived, exportBalanceCSV, exportSummaryCSV, chartFont, chartGrid, chartLegend } from "../data";
import { BANK_COLORS, getBankColor } from "../data/banks";
import { calcAllProjections } from "../lib/loanCalc";
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

  // 借入条件から月別残高を自動計算
  const { labels: projLabels, loanData: projData, totals: projTotals, bankData: projBankData } = calcAllProjections(fl);

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
        <div className="k hero"><div className="k-label">借入残高 合計</div><div className="k-val">{MY(tBal)}</div><div className="k-ctx">{loans.length}本 / 加重平均 {wRate}%</div><div className="k-foot"><span>年間利息 {MY(totalInt)}</span></div></div>
        <div className="k"><div className="k-label">月間返済 合計</div><div className="k-val">{MY(tMon)}</div><div className="k-ctx">年間 {MY(tMon * 12)}</div><div className="k-foot"><span>売上比 {(tMon / 10000 * 12 / lastPL.売上高 * 100).toFixed(1)}%</span></div></div>
        <div className="k"><div className="k-label">金利リスク</div><div className="k-val" style={{ color: "var(--am)" }}>{tBal > 0 ? (varBal / tBal * 100).toFixed(1) : 0}%</div><div className="k-ctx">変動 {MY(varBal)} / 固定 {MY(fixedBal)}</div></div>
        <div className="k"><div className="k-label">借換え削減余地</div><div className="k-val" style={{ color: "var(--ac)" }}>▼{MY(refiSavings)}/年</div><div className="k-ctx">{refiTarget.length}件を1.0%に借換えた場合</div></div>
      </div>

      {view === "cards" && <CardsView sorted={sorted} bSum={bSum} bankInt={bankInt} tBal={tBal} removeLoan={removeLoan} />}
      {view === "table" && <TableView sorted={sorted} fl={fl} removeLoan={removeLoan} />}
      {view === "schedule" && <ScheduleView loans={loans} />}
      {view === "balance" && <BalanceView projData={projData} projLabels={projLabels} projTotals={projTotals} projBankData={projBankData} wRate={wRate} tMon={tMon} loans={loans} bankFilter={bankFilter} />}
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
        const rem = l.monthly > 0 ? Math.ceil(l.balance / l.monthly) : 0;
        const repaid = l.principal > 0 ? ((l.principal - l.balance) / l.principal * 100).toFixed(0) : "0";
        const end = l.start ? new Date(l.start) : null;
        if (end) end.setMonth(end.getMonth() + l.term);
        const rc = l.rate >= 1.8 ? "var(--rd)" : l.rate >= 1.5 ? "var(--am)" : "var(--ac)";
        return (
          <div key={l.id || i} className="loan-card">
            <div className="lc-head">
              <div><div className="lc-bank">{l.bank} <span className={`p ${l.rt === "変動" ? "wr" : "mt"}`} style={{ marginLeft: 4 }}>{l.rt}</span></div><div className="lc-name">{l.name}</div></div>
              <div className="lc-rate" style={{ color: rc }}>{l.rate}%</div>
            </div>
            <div className="lc-grid">
              <div className="lc-item"><div className="lci-label">残高</div><div className="lci-val">{MY(l.balance)}</div></div>
              <div className="lc-item"><div className="lci-label">月返済</div><div className="lci-val">{MY(l.monthly)}</div></div>
              <div className="lc-item"><div className="lci-label">残期間</div><div className="lci-val">{Math.floor(rem / 12)}年{rem % 12}ヶ月</div></div>
            </div>
            <div className="lc-progress">
              <div className="lcp-label"><span>返済進捗</span><span>{repaid}%</span></div>
              <div className="lcp-bar"><span style={{ width: repaid + "%", background: rc }} /></div>
            </div>
            <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--tx3)" }}>
              <span>{l.method} / {l.collateral}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>{end ? `完済 ${end.toISOString().slice(0, 7)}` : ""}</span>
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
            <tr key={i}><td className="bold">{b.bank}</td><td className="tr mono">{b.cnt}</td><td className="tr mono">{MY(b.bal)}</td><td className="tr mono">{MY(b.mon)}</td><td className="tr mono">{MY(bi?.int || 0)}</td><td className="tr mono">{tBal > 0 ? (b.bal / tBal * 100).toFixed(1) : 0}%</td></tr>
          ); })}</tbody></table></div></div>
      <div className="c"><div className="ch"><div><div className="ct">借換え優先順位</div></div></div>
        <div className="cb"><div className="fl">{sorted.slice(0, 4).map((l, i) => { const sv = Math.round(l.balance * (l.rate - 1.0) / 100); const rc = l.rate >= 1.8 ? "var(--rd)" : l.rate >= 1.5 ? "var(--am)" : "var(--ac)"; return (
          <div key={i} className="fl-r"><div><strong>{l.bank} / {l.name}</strong><span>残高 {MY(l.balance)} / {l.rt} / 借換え→年▼{MY(sv)}</span></div><div className="fl-v" style={{ color: rc }}>{l.rate}%</div></div>
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
          <tr key={l.id || i}><td className="mono">{l.num}</td><td className="bold">{l.name}</td><td>{l.bank}</td><td className="tr mono">{MY(l.principal)}</td><td className="tr mono">{MY(l.balance)}</td><td className="tr mono" style={{ color: l.rate >= 1.8 ? "var(--rd)" : l.rate >= 1.5 ? "var(--am)" : "var(--ac)" }}>{l.rate}%</td><td><span className={`p ${l.rt === "変動" ? "wr" : "mt"}`}>{l.rt}</span></td><td className="tr mono">{MY(l.monthly)}</td><td>{l.method}</td><td>{l.collateral}</td><td className="tr mono">{l.grace}ヶ月</td>
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

function BalanceView({ projData, projLabels, projTotals, projBankData, wRate, tMon, loans, bankFilter }) {
  const loanChartRef = useRef(null), bankChartRef = useRef(null), totalChartRef = useRef(null);
  const loanChart = useRef(null), bankChart = useRef(null), totalChart = useRef(null);
  const scrollRef = useRef(null), wrapRef = useRef(null);

  // 区分別のスタイル
  const getCategoryStyle = (cat) => {
    if (cat === "短期") return { borderDash: [6, 3], borderColor: "#e5a83a" };
    if (cat === "当座貸越") return { borderDash: [3, 3], borderColor: "rgba(255,255,255,.3)" };
    return { borderDash: [], borderColor: null };
  };

  // 融資別 残高推移チャート（区分で色分け）
  useEffect(() => {
    loanChart.current?.destroy();
    if (!loanChartRef.current || !projData.length) return;
    loanChart.current = new Chart(loanChartRef.current, {
      type: "line",
      data: {
        labels: projLabels,
        datasets: projData.map((l) => {
          const cs = getCategoryStyle(l.category);
          const color = cs.borderColor || getBankColor(l.bank);
          return {
            label: l.bank + " " + l.name,
            data: l.balances,
            borderColor: color,
            backgroundColor: color + "18",
            fill: true, tension: 0.3, borderWidth: 1.5, pointRadius: 2,
            borderDash: cs.borderDash,
          };
        }),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: chartLegend },
        scales: {
          y: { stacked: true, ticks: { callback: (v) => Math.round(v / 10000) + "万", font: chartFont }, grid: chartGrid },
          x: { grid: { display: false }, ticks: { font: chartFont } },
        },
      },
    });
    return () => loanChart.current?.destroy();
  }, [projData, projLabels]);

  // 銀行別 残高推移チャート
  useEffect(() => {
    bankChart.current?.destroy();
    if (!bankChartRef.current || !projBankData.length) return;
    bankChart.current = new Chart(bankChartRef.current, {
      type: "line",
      data: {
        labels: projLabels,
        datasets: projBankData.map((b) => ({
          label: b.bank,
          data: b.balances,
          borderColor: getBankColor(b.bank),
          fill: false, tension: 0.3, borderWidth: 2, pointRadius: 3,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: chartLegend },
        scales: {
          y: { ticks: { callback: (v) => Math.round(v / 10000) + "万", font: chartFont }, grid: chartGrid },
          x: { grid: { display: false }, ticks: { font: chartFont } },
        },
      },
    });
    return () => bankChart.current?.destroy();
  }, [projBankData, projLabels]);

  // 合計残高推移チャート
  useEffect(() => {
    totalChart.current?.destroy();
    if (!totalChartRef.current || !projTotals.length) return;
    totalChart.current = new Chart(totalChartRef.current, {
      type: "line",
      data: {
        labels: projLabels,
        datasets: [{
          label: "借入残高 合計",
          data: projTotals,
          borderColor: "#22c994",
          backgroundColor: "rgba(34,201,148,.08)",
          fill: true, tension: 0.3, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: "#22c994",
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { callback: (v) => Math.round(v / 10000).toLocaleString() + "万", font: chartFont }, grid: chartGrid },
          x: { grid: { display: false }, ticks: { font: chartFont } },
        },
      },
    });
    return () => totalChart.current?.destroy();
  }, [projTotals, projLabels]);

  useEffect(() => {
    const scr = scrollRef.current, wrap = wrapRef.current;
    if (!scr || !wrap) return;
    const check = () => wrap.classList.toggle("scrolled-end", scr.scrollLeft + scr.clientWidth >= scr.scrollWidth - 4);
    scr.addEventListener("scroll", check);
    check();
    return () => scr.removeEventListener("scroll", check);
  }, [projData]);

  const curTotal = projData.reduce((s, l) => s + l.balance, 0);
  const endTotal = projTotals[projTotals.length - 1] || 0;

  return (<>
    {/* 合計残高推移 */}
    <div className="c">
      <div className="ch"><div><div className="ct">借入残高 合計推移</div><div className="cs">全融資の合計残高（12ヶ月先まで自動計算）</div></div></div>
      <div className="cb"><div className="chart"><canvas ref={totalChartRef} /></div></div>
    </div>

    {/* 残高推移表 */}
    <div className="c">
      <div className="ch">
        <div><div className="ct">返済残高推移表<span className="unit-badge">単位: 万円</span></div><div className="cs">据置中の融資は残高が水平推移</div></div>
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
                <th className="num-head">区分</th><th className="num-head">金利</th><th className="num-head">月返済</th>
                <th className="num-head" style={{ background: "rgba(34,201,148,.06)" }}>現在</th>
                {projLabels.map((m) => <th key={m} className="num-head">{m}</th>)}
              </tr></thead>
              <tbody>
                {projData.map((l, i) => {
                  const rc = l.rate >= 1.8 ? "var(--rd)" : l.rate >= 1.5 ? "var(--am)" : "var(--ac)";
                  return (
                    <tr key={i}>
                      <td className="bold sticky sticky-0">{l.name}</td>
                      <td className="sticky sticky-1" style={{ color: "var(--tx2)" }}>{l.bank}</td>
                      <td className="num"><span className={`p ${l.category === "長期" ? "bu" : l.category === "短期" ? "wr" : "mt"}`} style={{ fontSize: 9 }}>{l.category}</span></td>
                      <td className="num" style={{ color: rc }}>{l.rate}%</td>
                      <td className="num">{Math.round(l.monthly / 10000).toLocaleString()}</td>
                      <td className="num" style={{ background: "rgba(34,201,148,.04)", color: "var(--tx)" }}>{Math.round(l.balance / 10000).toLocaleString()}</td>
                      {l.balances.map((v, j) => <td key={j} className="num" style={v === 0 ? { color: "var(--tx3)", opacity: 0.5 } : {}}>{v === 0 ? "—" : Math.round(v / 10000).toLocaleString()}</td>)}
                    </tr>
                  );
                })}
                <tr className="total-row">
                  <td className="bold sticky sticky-0">合計</td><td className="sticky sticky-1" /><td className="num" />
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

    {/* チャート */}
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

function AnalysisView({ bSum, bankInt, totalInt, fixedBal, varBal, loans, sorted, refiTarget, refiSavings }) {
  const tBal = loans.reduce((s, l) => s + l.balance, 0);
  const r1 = useRef(null), r2 = useRef(null), r3 = useRef(null), c1 = useRef(null), c2 = useRef(null), c3 = useRef(null);

  useEffect(() => {
    [c1, c2, c3].forEach((c) => c.current?.destroy());
    if (r1.current) c1.current = new Chart(r1.current, { type: "doughnut", data: { labels: ["固定金利", "変動金利"], datasets: [{ data: [fixedBal, varBal], backgroundColor: ["rgba(34,201,148,.6)", "rgba(229,168,58,.6)"], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "65%", plugins: { legend: chartLegend } } });
    if (r2.current) c2.current = new Chart(r2.current, { type: "doughnut", data: { labels: bSum.map((v) => v.bank), datasets: [{ data: bSum.map((v) => v.bal), backgroundColor: bSum.map((v) => BANK_COLORS[v.bank] || "#5b8def"), borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "65%", plugins: { legend: chartLegend } } });
    const rateBands = [{ label: "〜1.0%", min: 0, max: 1.0 }, { label: "1.0〜1.5%", min: 1.0, max: 1.5 }, { label: "1.5〜2.0%", min: 1.5, max: 2.0 }, { label: "2.0%〜", min: 2.0, max: 99 }];
    if (r3.current) c3.current = new Chart(r3.current, { type: "bar", data: { labels: rateBands.map((b) => b.label), datasets: [{ data: rateBands.map((b) => loans.filter((l) => l.rate >= b.min && l.rate < b.max).reduce((s, l) => s + l.balance, 0)), backgroundColor: ["rgba(34,201,148,.6)", "rgba(91,141,239,.5)", "rgba(229,168,58,.5)", "rgba(229,91,91,.5)"], borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: (v) => Math.round(v / 10000) + "万", font: chartFont }, grid: chartGrid }, x: { grid: { display: false }, ticks: { font: chartFont } } } } });
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
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}><span className="bold">{b.bank}</span><span className="mono">{MY(b.int)}/年 ({pv}%)</span></div>
              <div className="int-bar"><div className="ib-fill" style={{ width: pv + "%", background: BANK_COLORS[b.bank] || "#5b8def" }} /></div>
            </div>
          ); })}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.05)", display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}><span>合計</span><span className="mono">{MY(totalInt)}/年</span></div>
        </div></div>
    </div>
    <div className="g2">
      <div className="c"><div className="ch"><div><div className="ct">銀行依存度</div></div></div><div className="cb"><div className="chart"><canvas ref={r2} /></div></div></div>
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

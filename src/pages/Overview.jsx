import { useRef, useEffect } from "react";
import { Chart, registerables } from "chart.js";
import { M, MY, pct, sgn, calcHealth, calcLoanDerived, chartFont, chartGrid, chartLegend, getChartTheme } from "../data";
import Sparkline from "../components/Sparkline";
import { useSettings, getFiscalYear, getFiscalYearLabel } from "../contexts/SettingsContext";

Chart.register(...registerables);

// 意思決定キューのアラートを実データから自動生成
function generateAlerts(lastPL, prevPL, lastBS, prevBS, loans, settings) {
  const alerts = [];

  // キャッシュ残月数チェック
  if (lastBS && lastPL) {
    const { tMon } = calcLoanDerived(loans);
    const monthlyFixed = tMon / 10000 + (lastPL.販管費 || 0) / 12;
    const cashMonths = monthlyFixed > 0 ? lastBS.現預金 / monthlyFixed : 99;
    if (cashMonths < 4) {
      alerts.push({
        lv: cashMonths < 2 ? "bad" : "warn",
        title: `資金余力低下 残${cashMonths.toFixed(1)}ヶ月`,
        detail: `現預金 ${M(lastBS.現預金)} / 月次固定支出 ${M(Math.round(monthlyFixed))}`,
        impact: Math.round(monthlyFixed * (4 - cashMonths)),
      });
    }
  }

  // 在庫増加チェック
  if (lastBS && prevBS && lastBS.棚卸資産 && prevBS.棚卸資産) {
    const invChange = (lastBS.棚卸資産 - prevBS.棚卸資産) / prevBS.棚卸資産 * 100;
    if (invChange >= 10) {
      alerts.push({
        lv: "warn",
        title: `在庫増加 → キャッシュ圧迫 -${M(lastBS.棚卸資産 - prevBS.棚卸資産)}`,
        detail: `棚卸資産 ${M(lastBS.棚卸資産)}（前期比 +${invChange.toFixed(0)}%）`,
        impact: lastBS.棚卸資産 - prevBS.棚卸資産,
      });
    }
  }

  // 変動金利リスク
  const varLoans = loans.filter((l) => l.rt === "変動" && l.balance > 0);
  if (varLoans.length > 0) {
    const varBal = varLoans.reduce((s, l) => s + l.balance, 0);
    alerts.push({
      lv: "info",
      title: `変動金利${varLoans.length}件 残高${MY(varBal)}`,
      detail: `金利上昇0.5%で年間利息+${MY(Math.round(varBal * 0.005))}`,
      impact: Math.round(varBal * 0.005 / 10000),
    });
  }

  // 売上減少チェック（前年比）
  if (lastPL && prevPL && prevPL.売上高 > 0) {
    const salesChange = pct(lastPL.売上高, prevPL.売上高);
    if (salesChange <= -10) {
      alerts.push({
        lv: "bad",
        title: `売上前年比${salesChange.toFixed(0)}% 影響額${M(Math.abs(lastPL.売上高 - prevPL.売上高))}`,
        detail: `売上高 ${M(lastPL.売上高)} ← 前年 ${M(prevPL.売上高)}`,
        impact: Math.abs(lastPL.売上高 - prevPL.売上高),
      });
    }
  }

  // 借換え提案
  const highRateLoans = loans.filter((l) => l.rate >= 2.0 && l.balance > 0);
  if (highRateLoans.length > 0) {
    const savings = highRateLoans.reduce((s, l) => s + Math.round(l.balance * (l.rate - 1.0) / 100), 0);
    alerts.push({
      lv: "info",
      title: `借換え候補${highRateLoans.length}件 利息削減見込${MY(savings)}/年`,
      detail: `金利2%以上の融資を1%に借換えた場合`,
      impact: Math.round(savings / 10000),
    });
  }

  // 緊急度でソート（bad → warn → info）
  const order = { bad: 0, warn: 1, info: 2 };
  alerts.sort((a, b) => order[a.lv] - order[b.lv]);
  return alerts;
}

export default function Overview({ loans, navigate, plData, bsData, cfData, monthlyPLData }) {
  const { settings, fiscalMonths } = useSettings();
  const safetyLine = settings.safetyLine;
  const fiscalMonth = settings.fiscalMonth;
  const fiscalYear = getFiscalYear(fiscalMonth);

  // 年次データ
  const PLd = plData && plData.length > 0 ? plData : null;
  const BSd = bsData && bsData.length > 0 ? bsData : null;
  const hasPL = !!PLd;
  const hasBS = !!BSd;
  const hasFinancials = hasPL && hasBS;
  const lastPL = hasPL ? PLd[PLd.length - 1] : null;
  const prevPL = hasPL && PLd.length >= 2 ? PLd[PLd.length - 2] : null;
  const lastBS = hasBS ? BSd[BSd.length - 1] : null;
  const prevBS = hasBS && BSd.length >= 2 ? BSd[BSd.length - 2] : null;

  // 月次PL（直近年度）
  const currentFYKey = String(fiscalYear);
  const prevFYKey = String(fiscalYear - 1);
  const monthlyActuals = monthlyPLData?.[currentFYKey] || null;
  const prevYearActuals = monthlyPLData?.[prevFYKey] || null;
  const hasMonthly = monthlyActuals && monthlyActuals.length > 0;
  // 直近月の実績
  const latestMonth = hasMonthly ? monthlyActuals[monthlyActuals.length - 1] : null;
  const prevMonth = hasMonthly && monthlyActuals.length >= 2 ? monthlyActuals[monthlyActuals.length - 2] : null;

  // 前年同月を探す
  const findPrevYearMonth = (m) => prevYearActuals?.find((a) => a.m === m) || null;
  const prevYearSame = latestMonth ? findPrevYearMonth(latestMonth.m) : null;

  // 融資集計
  const { tBal, tMon, wRate } = calcLoanDerived(loans);
  const tMonMan = tMon / 10000;

  // 経営健全度
  const h = calcHealth(loans, PLd, BSd);

  // === 最上段: キャッシュ予測 ===
  const cashBalance = hasBS ? lastBS.現預金 : null;
  const monthlySGA = latestMonth ? latestMonth.sgaExpenses : (lastPL ? Math.round(lastPL.販管費 / 12) : null);
  const monthlyFixedCost = tMonMan + (monthlySGA || 0);
  const cashMonths = cashBalance && monthlyFixedCost > 0 ? cashBalance / monthlyFixedCost : null;
  // 月次営業CF = 売上 - 原価 - 販管費
  const monthlyOpCF = latestMonth ? latestMonth.operatingProfit : (lastPL ? Math.round(lastPL.営業利益 / 12) : null);
  const cashForecast3m = cashBalance != null && monthlyOpCF != null
    ? cashBalance + (monthlyOpCF * 3) - (tMonMan * 3)
    : null;
  const cashColor = cashMonths == null ? "var(--tx2)" : cashMonths >= 6 ? "var(--ac)" : cashMonths >= 3 ? "var(--am)" : "var(--rd)";

  // === 意思決定キュー ===
  const alerts = generateAlerts(lastPL, prevPL, lastBS, prevBS, loans, settings);

  // === 中段1: レバレッジ指標 ===
  const inventory = lastBS?.棚卸資産 ?? null;
  const prevInventory = prevBS?.棚卸資産 ?? null;
  const monthlySales = latestMonth?.sales ?? (lastPL ? Math.round(lastPL.売上高 / 12) : null);
  const invTurnDays = inventory && monthlySales ? Math.round(inventory / monthlySales * 30) : null;
  const grossMargin = latestMonth ? (latestMonth.grossProfit / latestMonth.sales * 100) : (lastPL ? (lastPL.売上総利益 / lastPL.売上高 * 100) : null);
  const grossProfit = latestMonth?.grossProfit ?? (lastPL ? Math.round(lastPL.売上総利益 / 12) : null);
  const fixedCostCover = grossProfit && monthlySGA ? grossProfit / monthlySGA : null;
  const breakEvenSales = grossMargin && grossMargin > 0 && monthlySGA ? Math.round(monthlySGA / (grossMargin / 100)) : null;

  // === 中段2: YoY指標 ===
  const calcYoY = (current, prev) => {
    if (current == null || prev == null || prev === 0) return { rate: null, diff: null };
    return { rate: ((current - prev) / Math.abs(prev)) * 100, diff: current - prev };
  };
  const salesYoY = prevYearSame ? calcYoY(latestMonth?.sales, prevYearSame.sales) : { rate: null, diff: null };
  const grossYoY = prevYearSame ? calcYoY(latestMonth?.grossProfit, prevYearSame.grossProfit) : { rate: null, diff: null };
  const opYoY = prevYearSame ? calcYoY(latestMonth?.operatingProfit, prevYearSame.operatingProfit) : { rate: null, diff: null };

  // スパークラインデータ（月次PL配列から）
  const sparkSales = hasMonthly ? monthlyActuals.map((a) => a.sales) : (hasPL ? PLd.map((p) => p.売上高) : []);
  const sparkGross = hasMonthly ? monthlyActuals.map((a) => a.grossProfit) : [];
  const sparkOp = hasMonthly ? monthlyActuals.map((a) => a.operatingProfit) : (hasPL ? PLd.map((p) => p.営業利益) : []);

  // === 中段3: 安全性指標 ===
  const equityRatio = lastBS ? (lastBS.純資産 / lastBS.資産合計 * 100) : null;
  const annualOpCF = monthlyOpCF != null ? monthlyOpCF * 12 : (lastPL ? lastPL.営業利益 : null);
  const debtRepayYears = tBal > 0 && annualOpCF && annualOpCF > 0 ? (tBal / 10000) / annualOpCF : null;
  // 売掛金・買掛金はBSにない場合がある。流動資産−現預金−棚卸資産で近似
  const receivables = lastBS ? Math.max(0, lastBS.流動資産 - lastBS.現預金 - (lastBS.棚卸資産 || 0)) : null;
  const workingCapital = inventory != null && receivables != null ? inventory + receivables : null;
  const capitalEfficiency = lastPL && workingCapital ? (lastPL.営業利益 / workingCapital * 100) : null;

  // === FY進捗 ===
  const now = new Date();
  const startMonth = (fiscalMonth % 12) + 1;
  let currentMonthNum = now.getMonth() + 1;
  let monthsElapsed = currentMonthNum >= startMonth
    ? currentMonthNum - startMonth + 1
    : 12 - startMonth + currentMonthNum + 1;
  const fyProgress = Math.min(100, Math.round(monthsElapsed / 12 * 100));

  // === トレンドグラフ ===
  const trendRef = useRef(null);
  const chartInstRef = useRef(null);
  const cashRef = useRef(null);
  const cashChartRef = useRef(null);

  useEffect(() => {
    chartInstRef.current?.destroy();
    if (!trendRef.current || !hasMonthly) return;
    const ct = getChartTheme(settings.theme);
    Chart.defaults.color = ct.textColor;
    Chart.defaults.borderColor = ct.gridColor;

    const labels = monthlyActuals.map((a) => a.m);
    chartInstRef.current = new Chart(trendRef.current, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "売上", data: monthlyActuals.map((a) => a.sales), borderColor: "#5b8def", tension: 0.3, borderWidth: 2, pointRadius: 3 },
          { label: "粗利", data: monthlyActuals.map((a) => a.grossProfit), borderColor: "#22c994", tension: 0.3, borderWidth: 2, pointRadius: 3 },
          { label: "営業利益", data: monthlyActuals.map((a) => a.operatingProfit), borderColor: "#9b7cf6", tension: 0.3, borderWidth: 2, pointRadius: 3 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: chartLegend },
        scales: {
          y: { ticks: { callback: (v) => v + "万", font: chartFont }, grid: { color: ct.gridColor } },
          x: { grid: { display: false }, ticks: { font: chartFont } },
        },
      },
    });
    return () => { chartInstRef.current?.destroy(); };
  }, [monthlyActuals, hasMonthly, settings.theme]);

  // 現預金推移（BSまたはCFデータ）
  useEffect(() => {
    cashChartRef.current?.destroy();
    if (!cashRef.current) return;
    const hasCashData = cfData && cfData.length > 0 && cfData[0].残高;
    const hasBSData = BSd && BSd.length > 0;
    if (!hasCashData && !hasBSData) return;

    const labels = hasCashData ? cfData.map((c) => c.m) : BSd.map((b) => b.y);
    const data = hasCashData ? cfData.map((c) => c.残高) : BSd.map((b) => b.現預金);

    cashChartRef.current = new Chart(cashRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "現預金",
          data,
          backgroundColor: "rgba(78,222,163,.7)",
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { callback: (v) => v + "万", font: chartFont }, grid: { color: getChartTheme(settings.theme).gridColor } },
          x: { grid: { display: false }, ticks: { font: chartFont } },
        },
      },
    });
    return () => { cashChartRef.current?.destroy(); };
  }, [cfData, BSd]);

  // ヘルパー
  const fmtYoY = (v) => v == null ? "-" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  const yoyColor = (v) => v == null ? "var(--tx3)" : v >= 0 ? "var(--ac)" : "var(--rd)";

  // ツールチップ
  const healthTooltips = (() => {
    if (!hasFinancials) return {};
    const opMargin = lastPL.営業利益 / lastPL.売上高 * 100;
    const eqRatio = lastBS.純資産 / lastBS.資産合計 * 100;
    const growthRate = prevPL ? pct(lastPL.売上高, prevPL.売上高) : 0;
    const cm = monthlyFixedCost > 0 ? cashBalance / monthlyFixedCost : 0;
    return {
      "収益性": `営業利益率 ${opMargin.toFixed(1)}% → スコア ${h.dims[0].val}`,
      "安全性": `自己資本比率 ${eqRatio.toFixed(1)}% → スコア ${h.dims[1].val}`,
      "成長性": `売上成長率 ${growthRate >= 0 ? "+" : ""}${growthRate.toFixed(1)}% → スコア ${h.dims[2].val}`,
      "資金力": `${cm.toFixed(1)}ヶ月分 → スコア ${h.dims[3].val}`,
    };
  })();

  return (
    <div className="page"><div className="g">
      <div className="ph">
        <div><h2>経営概況</h2><p>経営の現在地を3秒で把握し、次の一手を決める。</p></div>
        <div className="pa">
          <button className="btn pr" onClick={() => navigate("performance")}>予実管理 →</button>
          <button className="btn" onClick={() => navigate("debt")}>融資管理 →</button>
        </div>
      </div>

      {/* FY進捗 */}
      <div className="fy">
        <div className="fyl">{getFiscalYearLabel(fiscalMonth, fiscalYear)} 進捗</div>
        <div className="fyt"><div className="fyf" style={{ width: fyProgress + "%" }} /></div>
        <div className="fyp">{fyProgress}%</div>
      </div>

      {/* データなし案内 */}
      {!hasFinancials && !hasMonthly && (
        <div className="c">
          <div className="cb" style={{ padding: "28px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "var(--tx)", fontWeight: 600, marginBottom: 8 }}>まずはデータを登録してください</div>
            <div style={{ fontSize: 13, color: "var(--tx3)", marginBottom: 16, lineHeight: 1.6 }}>決算書PDFまたはマネフォCSVをアップロードすると、経営指標が自動表示されます。</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn pr" onClick={() => navigate("financials")}>決算書を登録</button>
              <button className="btn" onClick={() => navigate("cashflow")}>月次CSVを取り込む</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ 最上段: 意思決定レイヤー ══ */}
      <div className="g2">
        {/* 3ヶ月キャッシュ予測 */}
        <div className="k hero">
          <div className="k-label">3ヶ月キャッシュ予測</div>
          <div className="k-val" style={{ color: cashColor }}>
            {cashForecast3m != null ? M(cashForecast3m) : "-"}
          </div>
          <div className="k-ctx">
            現預金 {cashBalance != null ? M(cashBalance) : "-"}
            {cashMonths != null && <> / 残 <strong style={{ color: cashColor }}>{cashMonths.toFixed(1)}ヶ月</strong></>}
          </div>
          <div className="k-foot">
            <span>月次営業CF {monthlyOpCF != null ? M(monthlyOpCF) : "-"}</span>
            <span>月次返済 {M(Math.round(tMonMan))}</span>
          </div>
        </div>

        {/* 意思決定キュー */}
        <div className="c">
          <div className="ch">
            <div><div className="ct">意思決定キュー</div></div>
            <span className={`p ${alerts.some((a) => a.lv === "bad") ? "bd" : "bu"}`}>
              {alerts.filter((a) => a.lv === "bad").length > 0 ? `${alerts.filter((a) => a.lv === "bad").length} Critical` : "正常"}
            </span>
          </div>
          <div className="cb">
            {alerts.length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center", color: "var(--tx3)", fontSize: 12 }}>
                重要な異常は検出されていません
              </div>
            ) : alerts.map((a, i) => (
              <div key={i} className="dq">
                <div className={`dqi ${a.lv === "bad" ? "cr" : a.lv === "warn" ? "wr" : "in"}`}>
                  {a.lv === "bad" ? "!" : a.lv === "warn" ? "△" : "i"}
                </div>
                <div className="dqb">
                  <h4>{a.title}</h4>
                  <p>{a.detail}</p>
                </div>
                {a.impact > 0 && <div className="dqm"><div className="dqo">{M(a.impact)}</div><div className="dqd">{a.lv === "bad" ? "高" : a.lv === "warn" ? "中" : "低"}</div></div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ 中段1: レバレッジ指標 ══ */}
      <div className="g3">
        {/* 在庫 */}
        <div className="k">
          <div className="k-label">在庫（棚卸資産）</div>
          <div className="k-val">{inventory != null ? M(inventory) : "-"}</div>
          <div className="k-ctx">
            回転日数 {invTurnDays != null ? `${invTurnDays}日` : "-"}
            {prevInventory != null && inventory != null && (
              <span style={{ color: inventory > prevInventory ? "var(--rd)" : "var(--ac)", marginLeft: 8 }}>
                {inventory > prevInventory ? "▲" : "▼"}{M(Math.abs(inventory - prevInventory))}
              </span>
            )}
          </div>
          <div className="k-foot"><span>在庫 = 拘束された現金</span></div>
        </div>

        {/* 粗利構造 */}
        <div className="k">
          <div className="k-row">
            <div>
              <div className="k-label">粗利構造</div>
              <div className="k-val">{grossMargin != null ? grossMargin.toFixed(1) + "%" : "-"}</div>
              <div className="k-ctx">粗利額 {grossProfit != null ? M(grossProfit) + "/月" : "-"}</div>
            </div>
            {sparkGross.length > 0 && <Sparkline data={sparkGross} color="#22c994" />}
          </div>
        </div>

        {/* 固定費負担 */}
        <div className="k">
          <div className="k-label">固定費カバー率</div>
          <div className="k-val" style={{ color: fixedCostCover != null ? (fixedCostCover >= 1.0 ? "var(--ac)" : "var(--rd)") : "" }}>
            {fixedCostCover != null ? fixedCostCover.toFixed(2) + "倍" : "-"}
          </div>
          <div className="k-ctx">
            {fixedCostCover != null && (fixedCostCover >= 1.0 ? "黒字圏" : "赤字圏")}
            {breakEvenSales != null && <> / 損益分岐 {M(breakEvenSales)}</>}
          </div>
          <div className="k-foot"><span>販管費 {monthlySGA != null ? M(monthlySGA) + "/月" : "-"}</span></div>
        </div>
      </div>

      {/* ══ 中段2: 成長指標（YoY） ══ */}
      <div className="g3">
        <div className="k">
          <div className="k-row">
            <div>
              <div className="k-label">売上 YoY{latestMonth ? `（${latestMonth.m}）` : ""}</div>
              <div className="k-val" style={{ color: yoyColor(salesYoY.rate) }}>{fmtYoY(salesYoY.rate)}</div>
              <div className="k-ctx">{salesYoY.diff != null ? `${salesYoY.diff >= 0 ? "+" : ""}${salesYoY.diff}万` : "前年データなし"}</div>
            </div>
            {sparkSales.length > 0 && <Sparkline data={sparkSales} color="#5b8def" />}
          </div>
        </div>
        <div className="k">
          <div className="k-row">
            <div>
              <div className="k-label">粗利 YoY{latestMonth ? `（${latestMonth.m}）` : ""}</div>
              <div className="k-val" style={{ color: yoyColor(grossYoY.rate) }}>{fmtYoY(grossYoY.rate)}</div>
              <div className="k-ctx">{grossYoY.diff != null ? `${grossYoY.diff >= 0 ? "+" : ""}${grossYoY.diff}万` : "前年データなし"}</div>
            </div>
            {sparkGross.length > 0 && <Sparkline data={sparkGross} color="#22c994" />}
          </div>
        </div>
        <div className="k">
          <div className="k-row">
            <div>
              <div className="k-label">営業利益 YoY{latestMonth ? `（${latestMonth.m}）` : ""}</div>
              <div className="k-val" style={{ color: yoyColor(opYoY.rate) }}>{fmtYoY(opYoY.rate)}</div>
              <div className="k-ctx">{opYoY.diff != null ? `${opYoY.diff >= 0 ? "+" : ""}${opYoY.diff}万` : "前年データなし"}</div>
            </div>
            {sparkOp.length > 0 && <Sparkline data={sparkOp} color="#9b7cf6" />}
          </div>
        </div>
      </div>

      {/* ══ 中段3: 財務健全性 ══ */}
      {/* 借入関連 */}
      <div className="g3">
        <div className="k">
          <div className="k-label">総借入残高</div>
          <div className="k-val">{MY(tBal)}</div>
          <div className="k-ctx">{loans.filter((l) => l.balance > 0).length}本</div>
        </div>
        <div className="k">
          <div className="k-label">月次返済額合計</div>
          <div className="k-val">{MY(tMon)}</div>
          <div className="k-ctx">年間 {MY(tMon * 12)}</div>
        </div>
        <div className="k">
          <div className="k-label">加重平均金利</div>
          <div className="k-val">{wRate}%</div>
          <div className="k-ctx">固定 {loans.filter((l) => l.rt === "固定" && l.balance > 0).length}件 / 変動 {loans.filter((l) => l.rt === "変動" && l.balance > 0).length}件</div>
        </div>
      </div>
      {/* 安全性指標 */}
      <div className="g3">
        <div className="k">
          <div className="k-label">自己資本比率</div>
          <div className="k-val" style={{ color: equityRatio != null ? (equityRatio >= 30 ? "var(--ac)" : "var(--am)") : "" }}>
            {equityRatio != null ? equityRatio.toFixed(1) + "%" : "-"}
          </div>
          <div className="k-ctx">{lastBS ? `純資産 ${M(lastBS.純資産)} / 総資産 ${M(lastBS.資産合計)}` : ""}</div>
        </div>
        <div className="k">
          <div className="k-label">債務償還年数</div>
          <div className="k-val" style={{ color: debtRepayYears != null ? (debtRepayYears <= 10 ? "var(--ac)" : "var(--rd)") : "" }}>
            {debtRepayYears != null ? debtRepayYears.toFixed(1) + "年" : "-"}
          </div>
          <div className="k-ctx">{debtRepayYears != null ? (debtRepayYears <= 10 ? "許容範囲" : "要改善") : "データ不足"}</div>
        </div>
        <div className="k">
          <div className="k-label">資本効率（営利/運転資本）</div>
          <div className="k-val">{capitalEfficiency != null ? capitalEfficiency.toFixed(1) + "%" : "-"}</div>
          <div className="k-ctx">{workingCapital != null ? `運転資本 ${M(workingCapital)}` : ""}</div>
        </div>
      </div>

      {/* ══ 最下段: 経営健全度 + トレンド ══ */}
      <div className="g2">
        {/* 経営健全度 */}
        <div className="hh">
          <div className="hs">
            <div className="hl">経営健全度</div>
            <div className="hn">{h.total != null ? h.total : "-"}</div>
            <div className="hg">Grade {h.grade}</div>
          </div>
          <div className="hd">
            {h.dims.map((d) => (
              <div key={d.label} className="hr tooltip-wrap">
                <div className="hrl">{d.label}</div>
                <div className="hrb"><span style={{ width: d.val + "%", background: d.color }} /></div>
                <div className="hrv" style={{ color: d.color }}>{d.val}</div>
                {healthTooltips[d.label] && <div className="tooltip-box">{healthTooltips[d.label]}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* トレンドグラフ */}
        <div className="g" style={{ gap: 14 }}>
          <div className="c">
            <div className="ch"><div><div className="ct">売上・粗利・営利 月次推移</div></div></div>
            <div className="cb">
              {hasMonthly
                ? <div className="chart"><canvas ref={trendRef} /></div>
                : <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--tx3)", fontSize: 12 }}>月次PLデータを取り込むとトレンドが表示されます</div>
              }
            </div>
          </div>
          <div className="c">
            <div className="ch"><div><div className="ct">現預金推移</div></div></div>
            <div className="cb"><div className="chart"><canvas ref={cashRef} /></div></div>
          </div>
        </div>
      </div>
    </div></div>
  );
}

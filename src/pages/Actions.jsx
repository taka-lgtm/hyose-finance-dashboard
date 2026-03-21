import { useState, useEffect, useCallback, useRef } from "react";
import { Chart, registerables } from "chart.js";
import { M, calcLoanDerived, chartFont, chartGrid } from "../data";
import { useSettings } from "../contexts/SettingsContext";
import { getFiscalYear } from "../contexts/SettingsContext";
import { fetchActions, addActionDoc, updateActionDoc, deleteActionDoc } from "../lib/firestore";

Chart.register(...registerables);

// ステータス定義
const STATUS = { todo: "未着手", reviewing: "検討中", inProgress: "実行中", done: "完了" };
const STATUS_COLORS = { todo: "var(--tx3)", reviewing: "var(--am)", inProgress: "var(--bl)", done: "var(--ac)" };
const TYPE_LABELS = { profit: "利益改善", cost: "コスト削減", cash: "キャッシュ改善", risk: "リスク対応" };
const TYPE_BADGE = { profit: "gd", cost: "wr", cash: "bu", risk: "bd" };
const URGENCY = { high: "高", medium: "中", low: "低" };

// ── 自動生成ルール ──
function generateAutoActions(loans, plData, bsData, monthlyPLData, fiscalMonth) {
  const actions = [];
  const lastPL = plData?.length > 0 ? plData[plData.length - 1] : null;
  const lastBS = bsData?.length > 0 ? bsData[bsData.length - 1] : null;
  const { tBal, tMon } = calcLoanDerived(loans || []);
  const currentFY = String(getFiscalYear(fiscalMonth));
  const prevFY = String(Number(currentFY) - 1);
  const monthlyActuals = monthlyPLData?.[currentFY] || [];
  const prevYearActuals = monthlyPLData?.[prevFY] || [];
  const latestMonth = monthlyActuals.length > 0 ? monthlyActuals[monthlyActuals.length - 1] : null;
  const monthlySales = latestMonth?.sales || (lastPL ? Math.round(lastPL.売上高 / 12) : 0);
  const monthlySGA = latestMonth?.sgaExpenses || (lastPL ? Math.round(lastPL.販管費 / 12) : 0);

  // tMon/tBalは円単位なので万円に変換
  const tMonMan = Math.round(tMon / 10000);
  const tBalMan = Math.round(tBal / 10000);

  // 1. 在庫圧縮（BS値は万円単位で格納済み）
  if (lastBS?.棚卸資産 && monthlySales > 0) {
    const inventory = lastBS.棚卸資産;
    const turnDays = Math.round(inventory / monthlySales * 30);
    const proper = monthlySales; // 適正在庫 = 月商 × 30日分（万円）
    if (turnDays >= 45 && inventory > proper) {
      actions.push({
        title: "在庫圧縮",
        impact: inventory - proper,
        impactType: "cash",
        impactPeriod: "onetime",
        urgency: "medium",
        sourceRule: "inventory",
        detail: `在庫回転日数 ${turnDays}日（適正30日）`,
      });
    }
  }

  // 2. 借換え
  const refiTargets = (loans || []).filter((l) => l.rate >= 2.0 && l.balance > 0);
  if (refiTargets.length > 0) {
    const savings = refiTargets.reduce((s, l) => s + Math.round(l.balance * (l.rate - 1.0) / 100 / 10000), 0);
    actions.push({
      title: `借換え検討（${refiTargets.length}件）`,
      impact: savings,
      impactType: "cost",
      impactPeriod: "yearly",
      urgency: "medium",
      sourceRule: "refinance",
      detail: `金利2.0%以上の融資${refiTargets.length}件を1.0%に借換えた場合`,
    });
  }

  // 3. 資金調達（BS値は万円単位で格納済み）
  if (lastBS?.現預金 && monthlySGA > 0) {
    const cashBalance = lastBS.現預金;
    const monthlyFixed = tMonMan + monthlySGA;
    const cashMonths = monthlyFixed > 0 ? cashBalance / monthlyFixed : 99;
    if (cashMonths < 4) {
      const safeLevel = monthlyFixed * 6;
      const shortage = safeLevel - cashBalance;
      actions.push({
        title: "資金調達",
        impact: -shortage,
        impactType: "cash",
        impactPeriod: "onetime",
        urgency: "high",
        sourceRule: "funding",
        detail: `キャッシュ残月数 ${cashMonths.toFixed(1)}ヶ月（安全水準6ヶ月まで不足）`,
      });
    }
  }

  // 4. 粗利改善
  if (latestMonth && prevYearActuals.length > 0) {
    const prevSame = prevYearActuals.find((a) => a.m === latestMonth.m);
    if (prevSame && prevSame.sales > 0 && latestMonth.sales > 0) {
      const currentGM = latestMonth.grossProfit / latestMonth.sales * 100;
      const prevGM = prevSame.grossProfit / prevSame.sales * 100;
      if (prevGM - currentGM >= 2) {
        const annualSales = monthlySales * 12;
        const impactPer1pct = Math.round(annualSales * 0.01);
        actions.push({
          title: "粗利率改善",
          impact: impactPer1pct,
          impactType: "profit",
          impactPeriod: "yearly",
          urgency: "medium",
          sourceRule: "grossMargin",
          detail: `粗利率 ${currentGM.toFixed(1)}%（前年同月 ${prevGM.toFixed(1)}%）→ 1%改善時`,
        });
      }
    }
  }

  // 5. 固定費削減
  if (latestMonth && latestMonth.grossProfit > 0 && monthlySGA > 0) {
    const cover = latestMonth.grossProfit / monthlySGA;
    if (cover < 1.2) {
      const targetSGA = Math.round(latestMonth.grossProfit / 1.5);
      const reduction = monthlySGA - targetSGA;
      if (reduction > 0) {
        actions.push({
          title: "固定費削減",
          impact: reduction * 12,
          impactType: "cost",
          impactPeriod: "yearly",
          urgency: cover < 1.0 ? "high" : "medium",
          sourceRule: "fixedCost",
          detail: `固定費カバー率 ${cover.toFixed(2)}（目標1.5）→ 月間 -${reduction}万`,
        });
      }
    }
  }

  // 6. 売上回復
  if (latestMonth && prevYearActuals.length > 0) {
    const prevSame = prevYearActuals.find((a) => a.m === latestMonth.m);
    if (prevSame && prevSame.sales > 0) {
      const diff = latestMonth.sales - prevSame.sales;
      const pct = diff / prevSame.sales * 100;
      if (pct <= -10) {
        actions.push({
          title: "売上回復施策",
          impact: diff,
          impactType: "profit",
          impactPeriod: "monthly",
          urgency: "high",
          sourceRule: "salesRecovery",
          detail: `前年同月比 ${pct.toFixed(1)}%（${latestMonth.m}）`,
        });
      }
    }
  }

  return actions;
}

// ── リスク検出 ──
function detectRisks(loans, plData, bsData, monthlyPLData, fiscalMonth) {
  const risks = [];
  const lastPL = plData?.length > 0 ? plData[plData.length - 1] : null;
  const prevPL = plData?.length > 1 ? plData[plData.length - 2] : null;
  const lastBS = bsData?.length > 0 ? bsData[bsData.length - 1] : null;
  const prevBS = bsData?.length > 1 ? bsData[bsData.length - 2] : null;
  const { tMon } = calcLoanDerived(loans || []);
  const monthlySGA = lastPL ? Math.round(lastPL.販管費 / 12) : 0;

  // BS値は万円単位、loansは円単位
  if (lastBS?.現預金) {
    const cash = lastBS.現預金;
    const fixed = Math.round(tMon / 10000) + monthlySGA;
    const months = fixed > 0 ? cash / fixed : 99;
    if (months < 4) {
      risks.push({ name: "資金余力低下", impact: cash, urgency: months < 2 ? "high" : "medium", condition: `キャッシュ残月数が${months.toFixed(1)}ヶ月`, rule: "funding" });
    }
  }
  if (lastBS?.棚卸資産 && prevBS?.棚卸資産 && prevBS.棚卸資産 > 0) {
    const change = (lastBS.棚卸資産 - prevBS.棚卸資産) / prevBS.棚卸資産 * 100;
    if (change >= 10) {
      risks.push({ name: "在庫増加", impact: lastBS.棚卸資産 - prevBS.棚卸資産, urgency: "medium", condition: `前期比 +${change.toFixed(0)}% 増加`, rule: "inventory" });
    }
  }
  const varLoans = (loans || []).filter((l) => l.rt === "変動" && l.balance > 0);
  if (varLoans.length > 0) {
    const varBal = Math.round(varLoans.reduce((s, l) => s + l.balance, 0) / 10000);
    risks.push({ name: "変動金利リスク", impact: varBal, urgency: "low", condition: `変動金利 ${varLoans.length}件（残高 ${M(varBal)}）`, rule: "refinance" });
  }
  if (lastPL && prevPL && prevPL.売上高 > 0) {
    const pct = (lastPL.売上高 - prevPL.売上高) / prevPL.売上高 * 100;
    if (pct <= -10) {
      risks.push({ name: "売上減少", impact: prevPL.売上高 - lastPL.売上高, urgency: "high", condition: `前年比 ${pct.toFixed(0)}% 減少`, rule: "salesRecovery" });
    }
  }
  return risks;
}

// ── メインコンポーネント ──
export default function Actions({ loans, plData, bsData, monthlyPLData, canEdit = true }) {
  const { settings } = useSettings();
  const fiscalMonth = settings.fiscalMonth;
  const [savedActions, setSavedActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const rankRef = useRef(null);
  const rankChart = useRef(null);

  // Firestoreからアクション読み込み
  useEffect(() => {
    (async () => {
      try { setSavedActions(await fetchActions()); } catch (_) {}
      setLoading(false);
    })();
  }, []);

  // 自動生成アクション
  const autoActions = generateAutoActions(loans, plData, bsData, monthlyPLData, fiscalMonth);

  // 重複排除: Firestoreに同じsourceRuleで未完了のものがあれば自動生成をスキップ
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const filteredAuto = autoActions.filter((a) => {
    const existing = savedActions.find((s) => s.sourceRule === a.sourceRule && s.status !== "done");
    if (existing) return false;
    // 完了済みでも30日以内なら再生成しない
    const doneRecent = savedActions.find((s) => s.sourceRule === a.sourceRule && s.status === "done" && s.completedAt?.toDate?.() > thirtyDaysAgo);
    return !doneRecent;
  });

  // 全アクション（自動 + 手動）をインパクト順にソート
  const allActions = [
    ...filteredAuto.map((a) => ({ ...a, isAutoGenerated: true, status: "auto" })),
    ...savedActions,
  ].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  // 自動→手動化（「対応する」クリック）
  const adoptAction = useCallback(async (autoAction) => {
    const saved = await addActionDoc({ ...autoAction, status: "todo", isAutoGenerated: true });
    setSavedActions((p) => [saved, ...p]);
  }, []);

  // ステータス変更
  const changeStatus = useCallback(async (id, newStatus) => {
    const updates = { status: newStatus };
    if (newStatus === "done") updates.completedAt = new Date();
    await updateActionDoc(id, updates);
    setSavedActions((p) => p.map((a) => a.id === id ? { ...a, ...updates } : a));
  }, []);

  // 削除
  const removeAction = useCallback(async (id) => {
    await deleteActionDoc(id);
    setSavedActions((p) => p.filter((a) => a.id !== id));
  }, []);

  // 集計
  const active = allActions.filter((a) => a.status !== "done" && a.status !== "auto");
  const activeImpact = active.reduce((s, a) => s + Math.abs(a.impact), 0);
  const todoCount = allActions.filter((a) => a.status === "todo" || a.status === "auto").length;
  const inProgressCount = allActions.filter((a) => a.status === "inProgress" || a.status === "reviewing").length;
  const doneCount = savedActions.filter((a) => a.status === "done").length;
  const totalManaged = savedActions.length;
  const completionRate = totalManaged > 0 ? Math.round(doneCount / totalManaged * 100) : 0;
  const overdue = savedActions.filter((a) => a.deadline && a.status !== "done" && new Date(a.deadline) < new Date());

  // リスク検出
  const risks = detectRisks(loans, plData, bsData, monthlyPLData, fiscalMonth);

  // インパクトランキングチャート
  const rankData = allActions.filter((a) => a.impact !== 0).slice(0, 8);
  useEffect(() => {
    rankChart.current?.destroy();
    if (!rankRef.current || !rankData.length) return;
    rankChart.current = new Chart(rankRef.current, {
      type: "bar",
      data: {
        labels: rankData.map((a) => a.title),
        datasets: [{
          data: rankData.map((a) => Math.abs(a.impact)),
          backgroundColor: rankData.map((a) => a.status === "done" ? "rgba(255,255,255,.08)" : a.impact >= 0 ? "rgba(34,201,148,.5)" : "rgba(229,91,91,.5)"),
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { callback: (v) => v.toLocaleString() + "万", font: chartFont }, grid: chartGrid },
          y: { grid: { display: false }, ticks: { font: { ...chartFont, size: 11 } } },
        },
      },
    });
    return () => rankChart.current?.destroy();
  }, [rankData]);

  const fmtImpact = (v, period) => {
    const prefix = v >= 0 ? "+" : "";
    const suffix = period === "yearly" ? "/年" : period === "monthly" ? "/月" : "";
    return `${prefix}${M(v)}${suffix}`;
  };

  return (
    <div className="page"><div className="g">
      <div className="ph">
        <div><h2>アクション</h2><p>経営データから課題を自動検出し、インパクトの大きい順に表示する。</p></div>
      </div>

      {/* セクション1: 意思決定リスト */}
      {allActions.length === 0 && !loading && (
        <div className="c"><div className="cb" style={{ padding: "28px 20px", textAlign: "center", color: "var(--tx3)", fontSize: 13 }}>
          データを登録すると、経営課題が自動検出されます。
        </div></div>
      )}

      {allActions.length > 0 && (
        <div className="act-list">
          {allActions.map((a, i) => {
            const isAuto = a.status === "auto";
            const isDone = a.status === "done";
            return (
              <div key={a.id || `auto-${i}`} className={`act-card ${isDone ? "act-done" : ""}`}>
                <div className="act-top">
                  <span className={`p ${TYPE_BADGE[a.impactType] || "bu"}`}>{TYPE_LABELS[a.impactType] || a.impactType}</span>
                  <span className={`act-urgency act-urgency-${a.urgency}`}>{URGENCY[a.urgency]}</span>
                  {isAuto && <span className="act-auto-badge">自動検出</span>}
                  {a.isAutoGenerated && !isAuto && <span className="act-auto-badge">自動→対応中</span>}
                </div>
                <div className="act-main">
                  <div className="act-title" style={isDone ? { textDecoration: "line-through", opacity: 0.5 } : undefined}>{a.title}</div>
                  <div className={`act-impact ${a.impact >= 0 ? "act-impact-plus" : "act-impact-minus"}`}>
                    {fmtImpact(a.impact, a.impactPeriod)}
                  </div>
                </div>
                {a.detail && <div className="act-detail">{a.detail}</div>}
                <div className="act-bottom">
                  {isAuto ? (
                    canEdit && <button className="btn pr" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => adoptAction(a)}>対応する</button>
                  ) : (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {Object.entries(STATUS).map(([k, v]) => (
                        <button key={k} className={`chip ${a.status === k ? "on" : ""}`} style={{ fontSize: 10, padding: "2px 8px" }}
                          onClick={() => canEdit && changeStatus(a.id, k)}>{v}</button>
                      ))}
                    </div>
                  )}
                  <div className="act-meta">
                    {a.assignee && <span>{a.assignee}</span>}
                    {a.deadline && <span style={{ color: a.deadline && a.status !== "done" && new Date(a.deadline) < new Date() ? "var(--rd)" : "inherit" }}>{a.deadline}</span>}
                    {!isAuto && canEdit && <button className="act-del" onClick={() => removeAction(a.id)}>削除</button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* セクション2: インパクトランキング */}
      {rankData.length > 0 && (
        <div className="c">
          <div className="ch">
            <div><div className="ct">インパクトランキング</div><div className="cs">実行中の改善余地：{M(activeImpact)}</div></div>
          </div>
          <div className="cb"><div className="chart" style={{ height: Math.max(180, rankData.length * 36) }}><canvas ref={rankRef} /></div></div>
        </div>
      )}

      {/* セクション3: 実行状況ダッシュボード */}
      <div className="g3">
        <div className="k"><div className="k-label">未着手</div><div className="k-val">{todoCount}件</div></div>
        <div className="k"><div className="k-label">実行中</div><div className="k-val" style={{ color: "var(--bl)" }}>{inProgressCount}件</div></div>
        <div className="k"><div className="k-label">完了</div><div className="k-val" style={{ color: "var(--ac)" }}>{doneCount}件</div></div>
      </div>
      {totalManaged > 0 && (
        <div className="c">
          <div className="cb" style={{ padding: "12px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--tx2)", marginBottom: 6 }}>
              <span>進捗率</span><span>{completionRate}%</span>
            </div>
            <div style={{ height: 6, background: "var(--sf2)", borderRadius: 3 }}>
              <div style={{ height: "100%", width: completionRate + "%", background: "var(--ac)", borderRadius: 3, transition: "width .3s" }} />
            </div>
            {overdue.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--rd)" }}>
                {overdue.length}件が期限超過しています
              </div>
            )}
          </div>
        </div>
      )}

      {/* セクション4: リスクモニター */}
      {risks.length > 0 && (
        <div className="c">
          <div className="ch"><div><div className="ct">リスクモニター</div><div className="cs">ダッシュボードデータから自動検出</div></div></div>
          <div className="cb" style={{ padding: 0 }}>
            {risks.map((r, i) => (
              <div key={i} className="act-risk">
                <div className="act-risk-header">
                  <span className={`act-urgency act-urgency-${r.urgency}`}>{URGENCY[r.urgency]}</span>
                  <span className="act-risk-name">{r.name}</span>
                  <span className="act-risk-impact">{M(r.impact)}</span>
                </div>
                <div className="act-risk-cond">{r.condition}</div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div></div>
  );
}

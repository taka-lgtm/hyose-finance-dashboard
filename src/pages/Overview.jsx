import { useRef, useEffect, useState } from "react";
import { Chart, registerables } from "chart.js";
import { CF as DEFAULT_CF, ALERTS, M, MY, pct, sgn, lvl, calcHealth, calcLoanDerived, chartFont, chartGrid, chartLegend } from "../data";
import Sparkline from "../components/Sparkline";
import { useSettings, getFiscalYear } from "../contexts/SettingsContext";

Chart.register(...registerables);

export default function Overview({ loans, navigate, plData, bsData, cfData }) {
  const { settings } = useSettings();
  const safetyLine = settings.safetyLine;
  const fiscalYear = getFiscalYear(settings.fiscalMonth);
  const PLd = plData && plData.length > 0 ? plData : null;
  const BSd = bsData && bsData.length > 0 ? bsData : null;
  const CFd = cfData && cfData.length > 0 ? cfData : DEFAULT_CF;
  const hasPL = !!PLd;
  const hasBS = !!BSd;
  const hasFinancials = hasPL && hasBS;
  const lastPL = hasPL ? PLd[PLd.length - 1] : null;
  const prevPL = hasPL && PLd.length >= 2 ? PLd[PLd.length - 2] : lastPL;
  const lastBS = hasBS ? BSd[BSd.length - 1] : null;
  const prevBS = hasBS && BSd.length >= 2 ? BSd[BSd.length - 2] : lastBS;
  const h = calcHealth(loans, PLd, BSd);
  const { tBal, tMon, wRate } = calcLoanDerived(loans);

  // ツールチップ用の計算値
  const healthTooltips = (() => {
    if (!hasFinancials) return {};
    const tMonMan = tMon / 10000;
    const opMargin = lastPL.営業利益 / lastPL.売上高 * 100;
    const eqRatio = lastBS.純資産 / lastBS.資産合計 * 100;
    const growthRate = prevPL ? pct(lastPL.売上高, prevPL.売上高) : 0;
    const monthlyFixed = tMonMan + lastPL.販管費 / 12;
    const cashMonths = monthlyFixed > 0 ? lastBS.現預金 / monthlyFixed : 0;
    return {
      "収益性": `営業利益率（営業利益÷売上高）を15%基準で正規化。15%以上で100点\n現在値: 営業利益率 ${opMargin.toFixed(1)}% → スコア ${h.dims[0].val}`,
      "安全性": `自己資本比率（純資産÷総資産）を50%基準で正規化。50%以上で100点\n現在値: 自己資本比率 ${eqRatio.toFixed(1)}% → スコア ${h.dims[1].val}`,
      "成長性": `前年比売上成長率を-5%〜+10%の範囲で正規化。成長率10%以上で100点\n現在値: 売上成長率 ${growthRate >= 0 ? "+" : ""}${growthRate.toFixed(1)}% → スコア ${h.dims[2].val}`,
      "資金力": `手元資金÷月次固定支出（融資返済+販管費）を4ヶ月基準で正規化。4ヶ月以上で100点\n現在値: ${cashMonths.toFixed(1)}ヶ月分 → スコア ${h.dims[3].val}`,
    };
  })();
  const s = hasFinancials ? pct(lastPL.売上高, lastPL.予算売上) : 0;
  const o = hasFinancials ? pct(lastPL.営業利益, lastPL.予算営業利益) : 0;
  const gm = hasFinancials ? lastPL.売上総利益 / lastPL.売上高 * 100 : 0;
  const pgm = hasFinancials ? prevPL.売上総利益 / prevPL.売上高 * 100 : 0;
  const cr = hasFinancials ? lastBS.流動資産 / lastBS.流動負債 * 100 : 0;
  const dy = hasFinancials ? (lastBS.固定負債 + lastBS.流動負債 - lastBS.流動資産 * 0.3) / (lastPL.経常利益 + 300) : 0;
  const minCF = CFd.length > 0 ? Math.min(...CFd.map((v) => v.残高)) : 0;
  const topL = [...loans].sort((a, b) => b.rate - a.rate);
  const trendRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (chartRef.current) chartRef.current.destroy();
    if (!trendRef.current || !hasPL) return;
    Chart.defaults.color = "rgba(139,146,168,.7)";
    Chart.defaults.borderColor = "rgba(255,255,255,.04)";
    chartRef.current = new Chart(trendRef.current, {
      data: {
        labels: PLd.map(d => d.y),
        datasets: [
          { type: "bar", label: "売上高", data: PLd.map((v) => v.売上高), backgroundColor: "rgba(91,141,239,.45)", borderRadius: 6, barThickness: 30 },
          { type: "line", label: "営業利益", data: PLd.map((v) => v.営業利益), borderColor: "#22c994", pointBackgroundColor: "#22c994", pointRadius: 4, tension: 0.35, borderWidth: 2.5, yAxisID: "y1" },
          { type: "line", label: "売上予算", data: PLd.map((v) => v.予算売上), borderColor: "rgba(255,255,255,.15)", pointRadius: 0, tension: 0.25, borderDash: [5, 5] },
          { type: "line", label: "営利予算", data: PLd.map((v) => v.予算営業利益), borderColor: "rgba(229,168,58,.4)", pointRadius: 0, tension: 0.25, borderDash: [5, 5], yAxisID: "y1" },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: chartLegend },
        scales: {
          y: { ticks: { callback: (v) => v + "万", font: chartFont }, grid: chartGrid },
          y1: { position: "right", ticks: { callback: (v) => v + "万", font: chartFont }, grid: { display: false } },
          x: { grid: { display: false }, ticks: { font: chartFont } },
        },
      },
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [PLd, hasPL]);

  return (
    <div className="page"><div className="g">
      <div className="ph">
        <div><h2>経営概況</h2><p>経営の現在地を3秒で把握し、次の一手を決める。</p></div>
        <div className="pa">
          <button className="btn pr" onClick={() => navigate("actions")}>意思決定キュー →</button>
          <button className="btn" onClick={() => navigate("debt")}>銀行面談モード</button>
        </div>
      </div>

      <div className="fy">
        <div className="fyl">FY{fiscalYear} 進捗</div>
        <div className="fyt"><div className="fyf" style={{ width: "100%" }} /></div>
        <div className="fyp">100%</div>
      </div>

      <div className="g2">
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
                {healthTooltips[d.label] && (
                  <div className="tooltip-box">{healthTooltips[d.label]}</div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="dig">
          <div className="dl">Executive Digest</div>
          <div className="dt">
            {hasFinancials ? (<>
              売上高<strong className="up">{M(lastPL.売上高)}</strong>。営業利益率<strong>{(lastPL.営業利益 / lastPL.売上高 * 100).toFixed(1)}%</strong>。
              予算比では売上<strong className={s < 0 ? "dn" : "up"}>{sgn(s)}</strong>、営利<strong className={o < 0 ? "dn" : "up"}>{sgn(o)}</strong>。
              自己資本比率<strong className="up">{(lastBS.純資産 / lastBS.資産合計 * 100).toFixed(1)}%</strong>。
            </>) : (
              <span style={{ color: "var(--tx3)" }}>決算書データを取り込むと、ここに経営サマリーが表示されます。</span>
            )}
            <strong className="at">変動金利{loans.filter((l) => l.rt === "変動").length}件</strong>と<strong className="dn">資金余力</strong>（最低{M(minCF)}）が要注意。
          </div>
        </div>
      </div>

      <div className="g4">
        <div className="k hero">
          <div className="k-row">
            <div>
              <div className="k-label">現金残高</div>
              <div className="k-val">{hasBS ? M(lastBS.現預金) : "-"}</div>
              <div className="k-ctx">{hasBS ? `流動比率 ${cr.toFixed(0)}%` : ""} / 最低 {M(minCF)}</div>
            </div>
            {hasBS && <Sparkline data={BSd.map((b) => b.現預金)} color="#22c994" />}
          </div>
          <div className="k-foot"><span>安全水準 {M(safetyLine)}</span><span>{hasBS ? (cr >= 200 ? "安定圏" : "注意") : "-"}</span></div>
        </div>
        <div className="k">
          <div className="k-row">
            <div>
              <div className="k-label">売上高</div>
              <div className="k-val">{hasPL ? M(lastPL.売上高) : "-"}</div>
              <div className="k-ctx">{hasPL ? `前年 ${sgn(pct(lastPL.売上高, prevPL.売上高))} / 予算 ${sgn(s)}` : "データなし"}</div>
            </div>
            {hasPL && <Sparkline data={PLd.map((p) => p.売上高)} color="#5b8def" />}
          </div>
          <div className="k-foot"><span>{hasPL ? `予算 ${M(lastPL.予算売上)}` : ""}</span></div>
        </div>
        <div className="k">
          <div className="k-row">
            <div>
              <div className="k-label">営業利益</div>
              <div className="k-val">{hasPL ? M(lastPL.営業利益) : "-"}</div>
              <div className="k-ctx">{hasPL ? `前年 ${sgn(pct(lastPL.営業利益, prevPL.営業利益))} / 予算 ${sgn(o)}` : "データなし"}</div>
            </div>
            {hasPL && <Sparkline data={PLd.map((p) => p.営業利益)} color="#9b7cf6" />}
          </div>
          <div className="k-foot"><span>{hasPL ? `利益率 ${(lastPL.営業利益 / lastPL.売上高 * 100).toFixed(1)}%` : ""}</span></div>
        </div>
        <div className="k">
          <div className="k-row">
            <div>
              <div className="k-label">借入残高</div>
              <div className="k-val">{MY(tBal)}</div>
              <div className="k-ctx">加重平均 {wRate}% / 月返済 {MY(tMon)}</div>
            </div>
            <Sparkline data={[tBal * 1.08, tBal * 1.05, tBal * 1.02, tBal]} color="#e5a83a" />
          </div>
          <div className="k-foot"><span>変動{loans.filter((l) => l.rt === "変動").length}件</span><span>償還 {dy.toFixed(1)}年</span></div>
        </div>
      </div>

      <div className="gs">
        <div className="c">
          <div className="ch">
            <div><div className="ct">5年トレンド</div><div className="cs">売上高・営業利益・予算</div></div>
            <span className="p bu">重点</span>
          </div>
          <div className="cb">{hasPL ? <div className="chart tall"><canvas ref={trendRef} /></div> : <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--tx3)", fontSize: 12 }}>決算書データを取り込むとトレンドチャートが表示されます</div>}</div>
        </div>
        <div className="c">
          <div className="ch">
            <div><div className="ct">意思決定キュー</div></div>
            <span className="p bd">{ALERTS.filter((a) => a.lv === "bad").length} Critical</span>
          </div>
          <div className="cb">
            {ALERTS.map((a, i) => (
              <div key={i} className="dq">
                <div className={`dqi ${a.lv === "bad" ? "cr" : a.lv === "warn" ? "wr" : "in"}`}>
                  {a.lv === "bad" ? "!" : a.lv === "warn" ? "△" : "i"}
                </div>
                <div className="dqb"><h4>{a.title}</h4><p>{a.action}</p></div>
                <div className="dqm"><div className="dqo">{a.owner}</div><div className="dqd">{a.date}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="c">
        <div className="ch"><div><div className="ct">今月の論点</div></div></div>
        <div className="cb">
          <div className="ms">
            {hasFinancials ? (<>
              <div className="ms-r"><div className="ms-l">粗利率</div><div className="ms-v">{gm.toFixed(1)}%</div><div className={`ms-c ${gm >= pgm ? "up" : "dn"}`}>{gm - pgm >= 0 ? "+" : ""}{(gm - pgm).toFixed(1)}pt</div><div className="ms-n">在庫回転が鍵。棚卸 {M(lastBS.棚卸資産)}</div></div>
              <div className="ms-r"><div className="ms-l">自己資本比率</div><div className="ms-v">{(lastBS.純資産 / lastBS.資産合計 * 100).toFixed(1)}%</div><div className="ms-c up">{sgn((lastBS.純資産 / lastBS.資産合計 * 100) - (prevBS.純資産 / prevBS.資産合計 * 100))}</div><div className="ms-n">借入交渉の材料</div></div>
              <div className="ms-r"><div className="ms-l">債務償還年数</div><div className="ms-v">{dy.toFixed(1)}年</div><div className={`ms-c ${dy > 8 ? "dn" : "up"}`}>{dy > 8 ? "要注意" : "許容"}</div><div className="ms-n">10年以下を維持</div></div>
            </>) : (
              <div className="ms-r"><div className="ms-l" style={{ color: "var(--tx3)" }}>決算書データを取り込むとPL/BS指標が表示されます</div></div>
            )}
            <div className="ms-r"><div className="ms-l">借換え優先</div><div className="ms-v">{topL[0]?.rate}%</div><div className="ms-c dn">最高金利</div><div className="ms-n">{topL[0]?.bank} {topL[0]?.name}</div></div>
          </div>
        </div>
      </div>
    </div></div>
  );
}

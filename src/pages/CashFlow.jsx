import { useRef, useEffect } from "react";
import { Chart, registerables } from "chart.js";
import { CF as DEFAULT_CF, M, chartFont, chartGrid, chartLegend, getChartTheme } from "../data";
import { useSettings } from "../contexts/SettingsContext";

Chart.register(...registerables);

export default function CashFlow({ cfData, canEdit = true, openImportModal }) {
  const { settings, fiscalMonths } = useSettings();
  const safetyLine = settings.safetyLine;
  // 決算月の順序に並び替え
  const rawCF = cfData && cfData.length > 0 ? cfData : DEFAULT_CF;
  const CF = rawCF.length > 0
    ? [...rawCF].sort((a, b) => fiscalMonths.indexOf(a.m) - fiscalMonths.indexOf(b.m))
    : rawCF;
  const hasData = CF.length > 0;

  // 平均残高・月間増減を算出
  const enriched = CF.map((v, i) => {
    const prevBal = i > 0 ? CF[i - 1].残高 : v.残高;
    const 平均残高 = Math.round((prevBal + v.残高) / 2);
    const 月間増減 = v.残高 - prevBal;
    const 収支差額 = v.入金 - v.出金;
    return { ...v, 平均残高, 月間増減, 収支差額 };
  });

  // PLベース推計残高を算出（初月はBS残高、以降は前月推計+収支差額）
  const plEstimates = [];
  enriched.forEach((v, i) => {
    if (i === 0) plEstimates.push(v.残高);
    else plEstimates.push(plEstimates[i - 1] + v.収支差額);
  });

  const min = hasData ? Math.min(...CF.map((v) => v.残高)) : 0;
  const max = hasData ? Math.max(...CF.map((v) => v.残高)) : 0;
  const avgI = hasData ? Math.round(CF.reduce((s, v) => s + v.入金, 0) / CF.length) : 0;
  const avgO = hasData ? Math.round(CF.reduce((s, v) => s + v.出金, 0) / CF.length) : 0;
  const r1 = useRef(null), r2 = useRef(null), c1 = useRef(null), c2 = useRef(null);

  // チャート描画
  const theme = settings.theme || "dark";
  useEffect(() => {
    const ct = getChartTheme(theme);
    Chart.defaults.color = ct.textColor;
    Chart.defaults.borderColor = ct.gridColor;
    c1.current?.destroy(); c2.current?.destroy();
    if (!hasData) return;
    const labels = CF.map((v) => v.m);
    const tg = { color: ct.gridColor };
    const plLineColor = theme === "light" ? "rgba(0,0,0,.25)" : "rgba(255,255,255,.45)";
    if (r1.current) c1.current = new Chart(r1.current, { type: "line", data: { labels, datasets: [{ label: "BS月末残高", data: enriched.map((v) => v.残高), borderColor: "#22c994", backgroundColor: "rgba(34,201,148,.06)", fill: true, pointRadius: 3, tension: 0.3, borderWidth: 2 }, { label: "平均残高", data: enriched.map((v) => v.平均残高), borderColor: "#3b82f6", pointRadius: 3, tension: 0.3, borderWidth: 3 }, { label: "PLベース推計", data: plEstimates, borderColor: plLineColor, pointRadius: 0, tension: 0.3, borderDash: [5, 5], borderWidth: 1.5 }, { label: "安全水準", data: CF.map(() => safetyLine), borderColor: "rgba(229,91,91,.35)", pointRadius: 0, borderDash: [3, 3], borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: chartLegend }, scales: { y: { ticks: { callback: (v) => v.toLocaleString() + "万", font: chartFont }, grid: tg }, x: { grid: { display: false }, ticks: { font: chartFont } } } } });
    if (r2.current) c2.current = new Chart(r2.current, { type: "bar", data: { labels, datasets: [{ label: "入金", data: CF.map((v) => v.入金), backgroundColor: "rgba(34,201,148,.75)", borderRadius: 4 }, { label: "出金", data: CF.map((v) => -v.出金), backgroundColor: "rgba(229,91,91,.65)", borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: chartLegend }, scales: { y: { ticks: { callback: (v) => Math.abs(v).toLocaleString() + "万", font: chartFont }, grid: tg }, x: { grid: { display: false }, ticks: { font: chartFont } } } } });
    return () => { c1.current?.destroy(); c2.current?.destroy(); };
  }, [CF, enriched, plEstimates, hasData, safetyLine, theme]);

  return (
    <div className="page"><div className="g">
      <div className="ph">
        <div><h2>資金繰り</h2><p>資金繰りに特化。安全水準との距離感と先行きを管理する。</p></div>
      </div>

      {/* データがない場合の案内 */}
      {!hasData && (
        <div className="c">
          <div className="cb import-guide-msg">
            <p style={{ fontSize: 14 }}>資金繰りデータがありません</p>
            <p style={{ fontSize: 12 }}>
              {openImportModal ? (
                <>サイドバーの「<span className="import-guide-link" onClick={openImportModal}>データ取込</span>」からCSVを登録してください</>
              ) : (
                <>管理者にCSVデータの取込を依頼してください</>
              )}
            </p>
          </div>
        </div>
      )}

      {hasData && <>
        <div className="g4">
          <div className="k hero"><div className="k-label">最新月 現預金残高</div><div className="k-val">{M(CF[CF.length - 1]?.残高 || 0)}</div><div className="k-ctx">最低残高 {M(min)} / 安全水準 {M(safetyLine)}</div></div>
          <div className="k"><div className="k-label">年間最高残高</div><div className="k-val">{M(max)}</div><div className="k-ctx">余剰資金の活用検討</div></div>
          <div className="k"><div className="k-label">月平均入金</div><div className="k-val">{M(avgI)}</div><div className="k-ctx">入金サイクル安定性</div></div>
          <div className="k"><div className="k-label">月平均Net CF</div><div className="k-val" style={{ color: avgI - avgO >= 0 ? "var(--ac)" : "var(--rd)" }}>{avgI - avgO >= 0 ? "+" : ""}{M(avgI - avgO)}</div><div className="k-ctx">出金 {M(avgO)} / 月</div></div>
        </div>
        <div className="g2">
          <div className="c"><div className="ch"><div><div className="ct">残高推移</div><div className="cs">BS月末残高 vs 平均残高 vs PLベース推計</div></div></div><div className="cb"><div className="chart tall"><canvas ref={r1} /></div></div></div>
          <div className="c"><div className="ch"><div><div className="ct">入出金フロー</div></div></div><div className="cb"><div className="chart tall"><canvas ref={r2} /></div></div></div>
        </div>
        <div className="c">
          <div className="ch"><div><div className="ct">月次詳細</div></div></div>
          <div className="cb tw">
            <table>
              <thead><tr><th>月</th><th className="tr">入金(PL)</th><th className="tr">出金(PL)</th><th className="tr">収支差額</th><th className="tr">BS月末残高</th><th className="tr">平均残高</th><th className="tr">月間増減</th></tr></thead>
              <tbody>
                {enriched.map((v, i) => (
                  <tr key={i}>
                    <td className="bold">{v.m}</td>
                    <td className="tr mono">{M(v.入金)}</td><td className="tr mono">{M(v.出金)}</td>
                    <td className="tr mono" style={{ color: v.収支差額 >= 0 ? "var(--ac)" : "var(--rd)" }}>{v.収支差額 >= 0 ? "+" : ""}{v.収支差額.toLocaleString()}万</td>
                    <td className="tr mono">{M(v.残高)}</td>
                    <td className="tr mono">{M(v.平均残高)}</td>
                    <td className="tr mono" style={{ color: v.月間増減 >= 0 ? "var(--ac)" : "var(--rd)" }}>{v.月間増減 >= 0 ? "+" : ""}{v.月間増減.toLocaleString()}万</td>
                  </tr>
                ))}
              </tbody>
              {(() => {
                const totalIn = enriched.reduce((s, v) => s + v.入金, 0);
                const totalOut = enriched.reduce((s, v) => s + v.出金, 0);
                const totalNet = totalIn - totalOut;
                const lastBal = enriched[enriched.length - 1].残高;
                const lastAvg = enriched[enriched.length - 1].平均残高;
                const totalDelta = enriched.reduce((s, v) => s + v.月間増減, 0);
                return (
                  <tfoot>
                    <tr className="cf-total-row">
                      <td className="bold">合計</td>
                      <td className="tr mono">{M(totalIn)}</td><td className="tr mono">{M(totalOut)}</td>
                      <td className="tr mono" style={{ color: totalNet >= 0 ? "var(--ac)" : "var(--rd)" }}>{totalNet >= 0 ? "+" : ""}{totalNet.toLocaleString()}万</td>
                      <td className="tr mono">{M(lastBal)}</td>
                      <td className="tr mono">{M(lastAvg)}</td>
                      <td className="tr mono" style={{ color: totalDelta >= 0 ? "var(--ac)" : "var(--rd)" }}>{totalDelta >= 0 ? "+" : ""}{totalDelta.toLocaleString()}万</td>
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>
        </div>
      </>}
    </div></div>
  );
}

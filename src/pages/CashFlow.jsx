import { useRef, useEffect } from "react";
import { Chart, registerables } from "chart.js";
import { MONTHS, CF as DEFAULT_CF, M, chartFont, chartGrid, chartLegend } from "../data";

Chart.register(...registerables);

export default function CashFlow({ cfData }) {
  const CF = cfData || DEFAULT_CF;
  const min = Math.min(...CF.map((v) => v.残高)), max = Math.max(...CF.map((v) => v.残高));
  const avgI = Math.round(CF.reduce((s, v) => s + v.入金, 0) / 12);
  const avgO = Math.round(CF.reduce((s, v) => s + v.出金, 0) / 12);
  const r1 = useRef(null), r2 = useRef(null), c1 = useRef(null), c2 = useRef(null);

  useEffect(() => {
    Chart.defaults.color = "rgba(139,146,168,.7)";
    c1.current?.destroy(); c2.current?.destroy();
    if (r1.current) c1.current = new Chart(r1.current, { type: "line", data: { labels: MONTHS, datasets: [{ label: "残高", data: CF.map((v) => v.残高), borderColor: "#22c994", backgroundColor: "rgba(34,201,148,.06)", fill: true, pointRadius: 3, tension: 0.3, borderWidth: 2 }, { label: "予算", data: CF.map((v) => v.予算残高), borderColor: "rgba(255,255,255,.15)", pointRadius: 0, tension: 0.3, borderDash: [5, 5], borderWidth: 1.5 }, { label: "安全水準", data: CF.map(() => 4500), borderColor: "rgba(229,91,91,.35)", pointRadius: 0, borderDash: [3, 3], borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: chartLegend }, scales: { y: { ticks: { callback: (v) => v + "万", font: chartFont }, grid: chartGrid }, x: { grid: { display: false }, ticks: { font: chartFont } } } } });
    if (r2.current) c2.current = new Chart(r2.current, { type: "bar", data: { labels: MONTHS, datasets: [{ label: "入金", data: CF.map((v) => v.入金), backgroundColor: "rgba(34,201,148,.5)", borderRadius: 4 }, { label: "出金", data: CF.map((v) => -v.出金), backgroundColor: "rgba(229,91,91,.35)", borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: chartLegend }, scales: { y: { ticks: { callback: (v) => Math.abs(v) + "万", font: chartFont }, grid: chartGrid }, x: { grid: { display: false }, ticks: { font: chartFont } } } } });
    return () => { c1.current?.destroy(); c2.current?.destroy(); };
  }, []);

  return (
    <div className="page"><div className="g">
      <div className="ph"><div><h2>資金繰り</h2><p>資金繰りに特化。安全水準との距離感と先行きを管理する。</p></div></div>
      <div className="g4">
        <div className="k hero"><div className="k-label">年間最低残高</div><div className="k-val">{M(min)}</div><div className="k-ctx">安全水準4,500万との差 {M(min - 4500)}</div></div>
        <div className="k"><div className="k-label">年間最高残高</div><div className="k-val">{M(max)}</div><div className="k-ctx">余剰資金の活用検討</div></div>
        <div className="k"><div className="k-label">月平均入金</div><div className="k-val">{M(avgI)}</div><div className="k-ctx">入金サイクル安定性</div></div>
        <div className="k"><div className="k-label">月平均Net CF</div><div className="k-val" style={{ color: "var(--ac)" }}>+{M(avgI - avgO)}</div><div className="k-ctx">出金 {M(avgO)} / 月</div></div>
      </div>
      <div className="g2">
        <div className="c"><div className="ch"><div><div className="ct">残高推移</div><div className="cs">実績 vs 予算 vs 安全水準</div></div></div><div className="cb"><div className="chart tall"><canvas ref={r1} /></div></div></div>
        <div className="c"><div className="ch"><div><div className="ct">入出金フロー</div></div></div><div className="cb"><div className="chart tall"><canvas ref={r2} /></div></div></div>
      </div>
      <div className="c">
        <div className="ch"><div><div className="ct">月次詳細</div></div></div>
        <div className="cb tw">
          <table>
            <thead><tr><th>月</th><th className="tr">入金</th><th className="tr">出金</th><th className="tr">Net</th><th className="tr">残高</th><th className="tr">予算残高</th><th className="tr">差異</th></tr></thead>
            <tbody>
              {CF.map((v, i) => {
                const n = v.入金 - v.出金, d = v.残高 - v.予算残高;
                return (
                  <tr key={i}>
                    <td className="bold">{v.m}</td>
                    <td className="tr mono">{M(v.入金)}</td><td className="tr mono">{M(v.出金)}</td>
                    <td className="tr mono" style={{ color: n >= 0 ? "var(--ac)" : "var(--rd)" }}>{n >= 0 ? "+" : ""}{n}万</td>
                    <td className="tr mono">{M(v.残高)}</td><td className="tr mono">{M(v.予算残高)}</td>
                    <td className="tr mono" style={{ color: d >= 0 ? "var(--ac)" : "var(--rd)" }}>{d >= 0 ? "+" : ""}{d}万</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div></div>
  );
}

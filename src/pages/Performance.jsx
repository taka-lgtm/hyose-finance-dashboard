import { useRef, useEffect } from "react";
import { Chart, registerables } from "chart.js";
import { MONTHS, BUDGET_MONTHLY as DEFAULT_BM, M, pct, sgn, chartFont, chartGrid, chartLegend } from "../data";

Chart.register(...registerables);

export default function Performance({ bmData }) {
  const BM = bmData || DEFAULT_BM;
  const stb = BM.reduce((s, v) => s + v.sb, 0), sta = BM.reduce((s, v) => s + v.sa, 0);
  const gtb = BM.reduce((s, v) => s + v.gb, 0), gta = BM.reduce((s, v) => s + v.ga, 0);
  const otb = BM.reduce((s, v) => s + v.ob, 0), ota = BM.reduce((s, v) => s + v.oa, 0);
  const worst = [...BM].map((v) => ({ m: v.m, d: v.oa - v.ob })).sort((a, b) => a.d - b.d).slice(0, 3);
  const sRef = useRef(null), oRef = useRef(null);
  const c1 = useRef(null), c2 = useRef(null);

  useEffect(() => {
    Chart.defaults.color = "rgba(139,146,168,.7)";
    Chart.defaults.borderColor = "rgba(255,255,255,.04)";
    const opts = (color) => ({ type: "bar", options: { responsive: true, maintainAspectRatio: false, plugins: { legend: chartLegend }, scales: { y: { ticks: { callback: (v) => v + "万", font: chartFont }, grid: chartGrid }, x: { grid: { display: false }, ticks: { font: chartFont } } } } });
    if (c1.current) c1.current.destroy();
    if (c2.current) c2.current.destroy();
    if (sRef.current) c1.current = new Chart(sRef.current, { ...opts(), data: { labels: MONTHS, datasets: [{ label: "予算", data: BM.map((v) => v.sb), backgroundColor: "rgba(255,255,255,.06)", borderRadius: 4 }, { label: "実績", data: BM.map((v) => v.sa), backgroundColor: "rgba(91,141,239,.55)", borderRadius: 4 }] } });
    if (oRef.current) c2.current = new Chart(oRef.current, { ...opts(), data: { labels: MONTHS, datasets: [{ label: "予算", data: BM.map((v) => v.ob), backgroundColor: "rgba(255,255,255,.06)", borderRadius: 4 }, { label: "実績", data: BM.map((v) => v.oa), backgroundColor: "rgba(34,201,148,.55)", borderRadius: 4 }] } });
    return () => { c1.current?.destroy(); c2.current?.destroy(); };
  }, []);

  return (
    <div className="page"><div className="g">
      <div className="ph"><div><h2>予実管理</h2><p>月次予実に特化。どの月が未達で、何を巻き返すかを判断する。</p></div></div>
      <div className="g4">
        <div className="k hero"><div className="k-label">売上 予算達成率</div><div className="k-val">{sgn(pct(sta, stb))}</div><div className="k-ctx">実績 {M(sta)} / 予算 {M(stb)}</div></div>
        <div className="k"><div className="k-label">粗利 予算達成率</div><div className="k-val" style={{ color: pct(gta, gtb) < 0 ? "var(--rd)" : "var(--ac)" }}>{sgn(pct(gta, gtb))}</div><div className="k-ctx">実績 {M(gta)} / 予算 {M(gtb)}</div></div>
        <div className="k"><div className="k-label">営利 予算達成率</div><div className="k-val" style={{ color: pct(ota, otb) < 0 ? "var(--rd)" : "var(--ac)" }}>{sgn(pct(ota, otb))}</div><div className="k-ctx">実績 {M(ota)} / 予算 {M(otb)}</div></div>
        <div className="k"><div className="k-label">未達ワースト</div><div className="k-val" style={{ color: "var(--rd)" }}>{worst[0].m}</div><div className="k-ctx">営利差異 {worst[0].d >= 0 ? "+" : ""}{worst[0].d}万</div></div>
      </div>
      <div className="g2">
        <div className="c"><div className="ch"><div><div className="ct">売上 予実推移</div></div></div><div className="cb"><div className="chart tall"><canvas ref={sRef} /></div></div></div>
        <div className="c"><div className="ch"><div><div className="ct">営業利益 予実推移</div></div></div><div className="cb"><div className="chart tall"><canvas ref={oRef} /></div></div></div>
      </div>
      <div className="c">
        <div className="ch"><div><div className="ct">月次予実 詳細</div></div></div>
        <div className="cb tw">
          <table>
            <thead><tr><th>月</th><th className="tr">売上予算</th><th className="tr">売上実績</th><th className="tr">差異</th><th className="tr">粗利予算</th><th className="tr">粗利実績</th><th className="tr">営利予算</th><th className="tr">営利実績</th><th className="tr">営利差異</th></tr></thead>
            <tbody>
              {BM.map((v, i) => {
                const sd = v.sa - v.sb, od = v.oa - v.ob;
                return (
                  <tr key={i}>
                    <td className="bold">{v.m}</td>
                    <td className="tr mono">{M(v.sb)}</td><td className="tr mono">{M(v.sa)}</td>
                    <td className="tr mono" style={{ color: sd >= 0 ? "var(--ac)" : "var(--rd)" }}>{sd >= 0 ? "+" : ""}{sd}万</td>
                    <td className="tr mono">{M(v.gb)}</td><td className="tr mono">{M(v.ga)}</td>
                    <td className="tr mono">{M(v.ob)}</td><td className="tr mono">{M(v.oa)}</td>
                    <td className="tr mono" style={{ color: od >= 0 ? "var(--ac)" : "var(--rd)" }}>{od >= 0 ? "+" : ""}{od}万</td>
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

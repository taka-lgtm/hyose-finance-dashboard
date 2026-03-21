import { useRef, useEffect, useState, useCallback } from "react";
import { Chart, registerables } from "chart.js";
import { CF as DEFAULT_CF, M, chartFont, chartGrid, chartLegend } from "../data";
import { generateCashFlowData, generateMonthlyPLData, readFileAsArrayBuffer } from "../lib/csvParser";
import { useSettings } from "../contexts/SettingsContext";
import { getFiscalYear } from "../contexts/SettingsContext";

Chart.register(...registerables);

export default function CashFlow({ cfData, saveCF, saveMonthlyPL, monthlyPLData, canEdit = true }) {
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
    // PLベース推計残高：初月はBS残高、以降は前月推計+収支差額
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
  const bsFileRef = useRef(null), plFileRef = useRef(null);

  // アップロード状態
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const [bsFile, setBsFile] = useState(null);
  const [plFile, setPlFile] = useState(null);

  // CSVアップロード処理
  const handleUpload = useCallback(async () => {
    if (!bsFile || !plFile) {
      setUploadMsg({ type: "error", text: "貸借対照表CSVと損益計算書CSVの両方を選択してください" });
      return;
    }
    setUploading(true);
    setUploadMsg({ type: "info", text: "CSVを解析中..." });
    try {
      const [bsBuffer, plBuffer] = await Promise.all([
        readFileAsArrayBuffer(bsFile),
        readFileAsArrayBuffer(plFile),
      ]);
      const cfResult = generateCashFlowData(bsBuffer, plBuffer, settings.fiscalMonth);
      if (!cfResult.length) throw new Error("データを抽出できませんでした");
      await saveCF(cfResult);
      // 月次PL実績も同時に生成・保存（予実管理用）
      let plMsg = "";
      if (saveMonthlyPL) {
        try {
          const plBuffer2 = await readFileAsArrayBuffer(plFile);
          const monthlyResult = generateMonthlyPLData(plBuffer2, settings.fiscalMonth);
          if (monthlyResult.length > 0) {
            const fy = String(getFiscalYear(settings.fiscalMonth));
            const newData = { ...(monthlyPLData || {}), [fy]: monthlyResult };
            await saveMonthlyPL(newData);
            plMsg = ` + 予実管理の実績データも更新`;
          }
        } catch (_) { /* 月次PL生成失敗は無視（資金繰りは成功） */ }
      }
      setUploadMsg({ type: "success", text: `${cfResult.length}ヶ月分の資金繰りデータを登録しました${plMsg}` });
      setBsFile(null);
      setPlFile(null);
    } catch (e) {
      setUploadMsg({ type: "error", text: typeof e === "string" ? e : e.message || "CSVの解析に失敗しました" });
    }
    setUploading(false);
  }, [bsFile, plFile, saveCF, saveMonthlyPL, monthlyPLData, settings.fiscalMonth]);

  // チャート描画
  useEffect(() => {
    Chart.defaults.color = "rgba(139,146,168,.7)";
    c1.current?.destroy(); c2.current?.destroy();
    if (!hasData) return;
    const labels = CF.map((v) => v.m);
    if (r1.current) c1.current = new Chart(r1.current, { type: "line", data: { labels, datasets: [{ label: "BS月末残高", data: enriched.map((v) => v.残高), borderColor: "#22c994", backgroundColor: "rgba(34,201,148,.06)", fill: true, pointRadius: 3, tension: 0.3, borderWidth: 2 }, { label: "平均残高", data: enriched.map((v) => v.平均残高), borderColor: "#3b82f6", pointRadius: 3, tension: 0.3, borderWidth: 3 }, { label: "PLベース推計", data: plEstimates, borderColor: "rgba(255,255,255,.45)", pointRadius: 0, tension: 0.3, borderDash: [5, 5], borderWidth: 1.5 }, { label: "安全水準", data: CF.map(() => safetyLine), borderColor: "rgba(229,91,91,.35)", pointRadius: 0, borderDash: [3, 3], borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: chartLegend }, scales: { y: { ticks: { callback: (v) => v.toLocaleString() + "万", font: chartFont }, grid: chartGrid }, x: { grid: { display: false }, ticks: { font: chartFont } } } } });
    if (r2.current) c2.current = new Chart(r2.current, { type: "bar", data: { labels, datasets: [{ label: "入金", data: CF.map((v) => v.入金), backgroundColor: "rgba(34,201,148,.5)", borderRadius: 4 }, { label: "出金", data: CF.map((v) => -v.出金), backgroundColor: "rgba(229,91,91,.35)", borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: chartLegend }, scales: { y: { ticks: { callback: (v) => Math.abs(v).toLocaleString() + "万", font: chartFont }, grid: chartGrid }, x: { grid: { display: false }, ticks: { font: chartFont } } } } });
    return () => { c1.current?.destroy(); c2.current?.destroy(); };
  }, [CF, enriched, plEstimates, hasData, safetyLine]);

  return (
    <div className="page"><div className="g">
      <div className="ph">
        <div><h2>資金繰り</h2><p>資金繰りに特化。安全水準との距離感と先行きを管理する。</p></div>
        {canEdit && <div className="ph-actions">
          {/* BS CSV選択 */}
          <button className="btn upload-compact-btn" onClick={() => bsFileRef.current?.click()} disabled={uploading}>
            <input ref={bsFileRef} type="file" accept=".csv" style={{ display: "none" }}
              onChange={(e) => { setBsFile(e.target.files[0] || null); e.target.value = ""; }} />
            <span>{bsFile ? `BS: ${bsFile.name.slice(0, 15)}...` : "BS CSV"}</span>
          </button>
          {/* PL CSV選択 */}
          <button className="btn upload-compact-btn" onClick={() => plFileRef.current?.click()} disabled={uploading}>
            <input ref={plFileRef} type="file" accept=".csv" style={{ display: "none" }}
              onChange={(e) => { setPlFile(e.target.files[0] || null); e.target.value = ""; }} />
            <span>{plFile ? `PL: ${plFile.name.slice(0, 15)}...` : "PL CSV"}</span>
          </button>
          {/* アップロード実行 */}
          <button className="btn pr upload-compact-btn" onClick={handleUpload} disabled={uploading || !bsFile || !plFile}>
            {uploading ? (
              <><div className="login-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /><span>解析中...</span></>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><span>取り込み</span></>
            )}
          </button>
        </div>}
      </div>

      {/* アップロードメッセージ */}
      {uploadMsg && (
        <div className={`upload-msg upload-msg-${uploadMsg.type}`}>
          {uploadMsg.type === "info" && <div className="login-spinner" style={{ width: 14, height: 14, borderWidth: 2, flexShrink: 0 }} />}
          {uploadMsg.type === "success" && <span style={{ fontSize: 16 }}>✓</span>}
          {uploadMsg.type === "error" && <span style={{ fontSize: 16 }}>✕</span>}
          <span>{uploadMsg.text}</span>
          <button className="upload-msg-close" onClick={() => setUploadMsg(null)}>&times;</button>
        </div>
      )}

      {/* データがない場合の案内 */}
      {!hasData && (
        <div className="c">
          <div className="cb" style={{ padding: "40px 20px", textAlign: "center", color: "var(--tx3)" }}>
            <p style={{ fontSize: 14, marginBottom: 8 }}>資金繰りデータがありません</p>
            <p style={{ fontSize: 12 }}>マネーフォワードの「貸借対照表_月次推移」と「損益計算書_月次推移」のCSVをアップロードしてください</p>
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

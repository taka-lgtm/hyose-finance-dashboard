import { useRef, useEffect, useState, useCallback } from "react";
import { Chart, registerables } from "chart.js";
import { M, chartFont, chartGrid, chartLegend } from "../data";
import { useSettings } from "../contexts/SettingsContext";
import { getFiscalYear, getFiscalYearLabel } from "../contexts/SettingsContext";
import { generateMonthlyPLData, readFileAsArrayBuffer } from "../lib/csvParser";

Chart.register(...registerables);

export default function Performance({ bmData, monthlyPLData, saveBudget, saveMonthlyPL, canEdit = true }) {
  const { settings, fiscalMonths } = useSettings();
  const fiscalMonth = settings.fiscalMonth;

  // 年度切り替え
  const currentFY = getFiscalYear(fiscalMonth);
  const [selectedFY, setSelectedFY] = useState(currentFY);
  // 利用可能な年度リスト（月次PL・予算データのキー + 前後年度を含む）
  const dataYears = new Set([
    ...(monthlyPLData ? Object.keys(monthlyPLData).map(Number) : []),
    ...(bmData ? Object.keys(bmData).map(Number) : []),
  ]);
  dataYears.add(currentFY);
  dataYears.add(currentFY - 1);
  const fyOptions = [...dataYears].filter(Boolean).sort();

  // 選択年度のデータを取得
  const fyKey = String(selectedFY);
  const actuals = monthlyPLData?.[fyKey] || null;
  const budget = bmData?.[fyKey] || null;

  const hasActuals = actuals && actuals.length > 0;
  const hasBudget = budget && budget.length > 0;
  const hasData = hasActuals || hasBudget;

  // 成長率（予算自動生成用）
  const [growthRate, setGrowthRate] = useState(5);
  const [showGrowthInput, setShowGrowthInput] = useState(false);

  // CSVアップロード
  const plFileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);

  // テーブル表示モード（単月 / 累積）
  const [tableMode, setTableMode] = useState("monthly");

  // インライン編集
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  // チャート（4つ: 売上、販管費、粗利、営業利益）
  const salesRef = useRef(null), sgaRef = useRef(null);
  const grossRef = useRef(null), opRef = useRef(null);
  const c1 = useRef(null), c2 = useRef(null), c3 = useRef(null), c4 = useRef(null);

  // 月次データを統合（fiscalMonths順に並べる）
  const mergedData = fiscalMonths.map((m) => {
    const act = actuals?.find((a) => a.m === m);
    const bud = budget?.find((b) => b.m === m);
    return {
      m,
      sa: act?.sales ?? null,
      ca: act?.cogs ?? null,
      ga: act?.grossProfit ?? null,
      sga: act?.sgaExpenses ?? null,
      oa: act?.operatingProfit ?? null,
      sb: bud?.sb ?? null,
      gb: bud?.gb ?? null,
      ob: bud?.ob ?? null,
    };
  });

  // 当月を判定（実績データがある最後の月）
  const currentMonthIdx = (() => {
    for (let i = mergedData.length - 1; i >= 0; i--) {
      if (mergedData[i].sa !== null) return i;
    }
    return -1;
  })();

  // 累積データを計算（各月までのYTD）
  const cumulativeData = mergedData.map((_, i) => {
    const cum = { sa: 0, ga: 0, oa: 0, sb: 0, gb: 0, ob: 0 };
    for (let j = 0; j <= i; j++) {
      const v = mergedData[j];
      if (v.sa !== null) cum.sa += v.sa;
      if (v.ga !== null) cum.ga += v.ga;
      if (v.oa !== null) cum.oa += v.oa;
      cum.sb += v.sb || 0;
      cum.gb += v.gb || 0;
      cum.ob += v.ob || 0;
    }
    return cum;
  });

  // YTD集計（実績がある月まで）
  const ytd = mergedData.reduce((acc, v, i) => {
    if (i <= currentMonthIdx && v.sa !== null) {
      acc.sa += v.sa;
      acc.ga += v.ga || 0;
      acc.oa += v.oa || 0;
      acc.sb += v.sb || 0;
      acc.gb += v.gb || 0;
      acc.ob += v.ob || 0;
    }
    return acc;
  }, { sa: 0, ga: 0, oa: 0, sb: 0, gb: 0, ob: 0 });

  // 着地見込み = 実績累計 + 残月予算
  const remaining = mergedData.reduce((acc, v, i) => {
    if (i > currentMonthIdx) {
      acc.sb += v.sb || 0;
      acc.gb += v.gb || 0;
      acc.ob += v.ob || 0;
    }
    return acc;
  }, { sb: 0, gb: 0, ob: 0 });

  const forecast = {
    sales: ytd.sa + remaining.sb,
    gross: ytd.ga + remaining.gb,
    op: ytd.oa + remaining.ob,
  };

  const totalBudget = {
    sales: mergedData.reduce((s, v) => s + (v.sb || 0), 0),
    gross: mergedData.reduce((s, v) => s + (v.gb || 0), 0),
    op: mergedData.reduce((s, v) => s + (v.ob || 0), 0),
  };

  // 達成率計算
  const achieveRate = (actual, budget) => budget ? (actual / budget * 100) : null;
  const fmtRate = (rate) => rate == null ? "-" : rate.toFixed(1) + "%";
  const rateColor = (rate) => rate == null ? "" : rate >= 100 ? "var(--ac)" : "var(--rd)";

  // CSVアップロード処理
  const handleUpload = useCallback(async (file) => {
    if (!file || !saveMonthlyPL) return;
    setUploading(true);
    setUploadMsg({ type: "info", text: "CSVを解析中..." });
    try {
      const buffer = await readFileAsArrayBuffer(file);
      const result = generateMonthlyPLData(buffer, fiscalMonth);
      if (!result.length) throw new Error("データを抽出できませんでした");

      const targetFY = String(selectedFY);
      const newData = { ...(monthlyPLData || {}), [targetFY]: result };
      await saveMonthlyPL(newData);
      setUploadMsg({ type: "success", text: `${result.length}ヶ月分のPL実績データを${getFiscalYearLabel(fiscalMonth, selectedFY)}に登録しました` });
    } catch (e) {
      setUploadMsg({ type: "error", text: e.message || "CSVの解析に失敗しました" });
    }
    setUploading(false);
  }, [saveMonthlyPL, fiscalMonth, monthlyPLData, selectedFY]);

  // 予算セル編集
  const startEdit = (mi, field) => {
    if (!saveBudget) return;
    const row = budget?.find((b) => b.m === mergedData[mi].m);
    const val = row?.[field] ?? "";
    setEditing(`${mi}-${field}`);
    setEditVal(val === "" ? "" : String(val));
  };

  const commitEdit = (mi, field) => {
    if (!editing) return;
    const num = Number(editVal);
    if (isNaN(num)) { setEditing(null); return; }
    const m = mergedData[mi].m;
    const currentBudget = budget ? [...budget] : fiscalMonths.map((fm) => ({ m: fm, sb: 0, gb: 0, ob: 0 }));
    const idx = currentBudget.findIndex((b) => b.m === m);
    if (idx >= 0) {
      currentBudget[idx] = { ...currentBudget[idx], [field]: num };
    } else {
      currentBudget.push({ m, sb: 0, gb: 0, ob: 0, [field]: num });
    }
    const newBmData = { ...(bmData || {}), [fyKey]: currentBudget };
    saveBudget(newBmData);
    setEditing(null);
  };

  // 選択中の年度データを別の年度に移動する
  const moveDataToFY = useCallback(async (targetFY) => {
    if (!saveMonthlyPL || !saveBudget) return;
    const srcKey = String(selectedFY);
    const dstKey = String(targetFY);
    if (srcKey === dstKey) return;

    // 実績データの移動
    const newPL = { ...(monthlyPLData || {}) };
    if (newPL[srcKey]) {
      newPL[dstKey] = newPL[srcKey];
      delete newPL[srcKey];
      await saveMonthlyPL(newPL);
    }

    // 予算データの移動
    const newBM = { ...(bmData || {}) };
    if (newBM[srcKey]) {
      newBM[dstKey] = newBM[srcKey];
      delete newBM[srcKey];
      await saveBudget(newBM);
    }

    setSelectedFY(targetFY);
    setUploadMsg({ type: "success", text: `${getFiscalYearLabel(fiscalMonth, selectedFY)}のデータを${getFiscalYearLabel(fiscalMonth, targetFY)}に移動しました` });
  }, [selectedFY, monthlyPLData, bmData, saveMonthlyPL, saveBudget, fiscalMonth]);

  // 前年実績から予算自動生成
  const generateFromPrevYear = useCallback(() => {
    if (!saveMonthlyPL) return;
    const prevFY = String(selectedFY - 1);
    const prevActuals = monthlyPLData?.[prevFY];
    if (!prevActuals || prevActuals.length === 0) {
      setUploadMsg({ type: "error", text: `${getFiscalYearLabel(fiscalMonth, selectedFY - 1)}の実績データがありません` });
      return;
    }
    const rate = 1 + growthRate / 100;
    const generated = prevActuals.map((a) => ({
      m: a.m,
      sb: Math.round(a.sales * rate),
      gb: Math.round(a.grossProfit * rate),
      ob: Math.round(a.operatingProfit * rate),
    }));
    const newBmData = { ...(bmData || {}), [fyKey]: generated };
    saveBudget(newBmData);
    setShowGrowthInput(false);
    setUploadMsg({ type: "success", text: `${getFiscalYearLabel(fiscalMonth, selectedFY - 1)}実績 × ${growthRate}% で予算を生成しました` });
  }, [selectedFY, monthlyPLData, growthRate, bmData, fyKey, saveBudget, saveMonthlyPL]);

  // チャート描画（4チャート同時）
  useEffect(() => {
    Chart.defaults.color = "rgba(139,146,168,.7)";
    Chart.defaults.borderColor = "rgba(255,255,255,.04)";
    c1.current?.destroy(); c2.current?.destroy(); c3.current?.destroy(); c4.current?.destroy();
    if (!hasData) return;

    const labels = fiscalMonths;
    const barOpts = (legend = true) => ({
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: legend ? chartLegend : { display: false } },
      scales: {
        y: { ticks: { callback: (v) => v + "万", font: chartFont }, grid: chartGrid },
        x: { grid: { display: false }, ticks: { font: chartFont } },
      },
    });

    // 売上推移
    if (salesRef.current) {
      c1.current = new Chart(salesRef.current, {
        type: "bar", data: { labels, datasets: [
          { label: "予算", data: mergedData.map((v) => v.sb), backgroundColor: "rgba(255,255,255,.06)", borderRadius: 4 },
          { label: "実績", data: mergedData.map((v) => v.sa), backgroundColor: "rgba(91,141,239,.55)", borderRadius: 4 },
        ]}, options: barOpts(),
      });
    }
    // 販管費推移
    if (sgaRef.current) {
      c2.current = new Chart(sgaRef.current, {
        type: "bar", data: { labels, datasets: [
          { label: "販管費", data: mergedData.map((v) => v.sga), backgroundColor: "rgba(229,168,58,.55)", borderRadius: 4 },
        ]}, options: barOpts(false),
      });
    }
    // 粗利推移
    if (grossRef.current) {
      c3.current = new Chart(grossRef.current, {
        type: "bar", data: { labels, datasets: [
          { label: "予算", data: mergedData.map((v) => v.gb), backgroundColor: "rgba(255,255,255,.06)", borderRadius: 4 },
          { label: "実績", data: mergedData.map((v) => v.ga), backgroundColor: "rgba(34,201,148,.55)", borderRadius: 4 },
        ]}, options: barOpts(),
      });
    }
    // 営業利益推移
    if (opRef.current) {
      c4.current = new Chart(opRef.current, {
        type: "bar", data: { labels, datasets: [
          { label: "予算", data: mergedData.map((v) => v.ob), backgroundColor: "rgba(255,255,255,.06)", borderRadius: 4 },
          { label: "実績", data: mergedData.map((v) => v.oa), backgroundColor: "rgba(201,34,148,.55)", borderRadius: 4 },
        ]}, options: barOpts(),
      });
    }

    return () => { c1.current?.destroy(); c2.current?.destroy(); c3.current?.destroy(); c4.current?.destroy(); };
  }, [mergedData, hasData, fiscalMonths]);

  // 未達ワースト3
  const worst = mergedData
    .filter((v) => v.oa !== null && v.ob !== null)
    .map((v) => ({ m: v.m, d: v.oa - v.ob }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);

  // YTD達成率
  const ytdSalesRate = achieveRate(ytd.sa, ytd.sb);
  const ytdGrossRate = achieveRate(ytd.ga, ytd.gb);
  const ytdOpRate = achieveRate(ytd.oa, ytd.ob);

  // 編集可能セルのレンダラー
  const EditableCell = ({ mi, field, value }) => (
    <td className="tr mono">
      {editing === `${mi}-${field}` ? (
        <input ref={inputRef} type="number" className="cell-edit-input" value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={() => commitEdit(mi, field)}
          onKeyDown={(e) => { if (e.key === "Enter") commitEdit(mi, field); if (e.key === "Escape") setEditing(null); }}
        />
      ) : (
        <span className={canEdit && saveBudget ? "cell-editable" : ""} onClick={() => startEdit(mi, field)}>
          {value !== null ? M(value) : "-"}
        </span>
      )}
    </td>
  );

  return (
    <div className="page"><div className="g">
      <div className="ph">
        <div>
          <h2>予実管理</h2>
          <p>月次予算と実績を比較し、差異分析と着地見込みを確認する。</p>
        </div>
        <div className="ph-actions">
          {/* 年度切り替え */}
          <select className="fy-select" value={selectedFY} onChange={(e) => setSelectedFY(Number(e.target.value))}>
            {fyOptions.map((y) => (
              <option key={y} value={y}>{getFiscalYearLabel(fiscalMonth, y)}</option>
            ))}
          </select>
          {canEdit && <>
            <button className="btn upload-compact-btn" onClick={() => plFileRef.current?.click()} disabled={uploading}>
              <input ref={plFileRef} type="file" accept=".csv" style={{ display: "none" }}
                onChange={(e) => { handleUpload(e.target.files[0]); e.target.value = ""; }} />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span>{uploading ? "解析中..." : "PL CSV取り込み"}</span>
            </button>
            <button className="btn upload-compact-btn" onClick={() => setShowGrowthInput(!showGrowthInput)}>
              <span>前年実績から予算生成</span>
            </button>
            {hasData && (
              <button className="btn upload-compact-btn" onClick={() => {
                const target = prompt(`「${getFiscalYearLabel(fiscalMonth, selectedFY)}」のデータを移動する先の年度を入力してください（例: ${selectedFY - 1}）`);
                if (target && !isNaN(Number(target))) moveDataToFY(Number(target));
              }}>
                <span>年度修正</span>
              </button>
            )}
          </>}
        </div>
      </div>

      {/* 成長率入力パネル */}
      {showGrowthInput && (
        <div className="c" style={{ padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--tx2)" }}>成長率:</span>
            <input type="number" value={growthRate} onChange={(e) => setGrowthRate(Number(e.target.value) || 0)}
              style={{ width: 60, padding: "4px 8px", background: "var(--bg3)", border: "1px solid var(--br)", borderRadius: 4, color: "var(--tx1)", fontSize: 13, textAlign: "right" }} />
            <span style={{ fontSize: 13, color: "var(--tx2)" }}>%</span>
            <button className="btn pr" onClick={generateFromPrevYear} style={{ fontSize: 12, padding: "4px 12px" }}>
              {getFiscalYearLabel(fiscalMonth, selectedFY - 1)}実績 × {growthRate}% で生成
            </button>
            <button className="btn" onClick={() => setShowGrowthInput(false)} style={{ fontSize: 12, padding: "4px 12px" }}>
              キャンセル
            </button>
          </div>
        </div>
      )}

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

      {/* データがない場合 */}
      {!hasData && (
        <div className="c">
          <div className="cb" style={{ padding: "40px 20px", textAlign: "center", color: "var(--tx3)" }}>
            <p style={{ fontSize: 14, marginBottom: 8 }}>予実データがありません</p>
            <p style={{ fontSize: 12 }}>マネーフォワードの「損益計算書_月次推移」CSVをアップロードしてください</p>
          </div>
        </div>
      )}

      {hasData && <>
        {/* KPIカード */}
        <div className="g4">
          <div className="k hero">
            <div className="k-label">売上 YTD達成率</div>
            <div className="k-val" style={{ color: rateColor(ytdSalesRate) }}>{fmtRate(ytdSalesRate)}</div>
            <div className="k-ctx">実績 {M(ytd.sa)} / 予算 {M(ytd.sb)}</div>
          </div>
          <div className="k">
            <div className="k-label">粗利 YTD達成率</div>
            <div className="k-val" style={{ color: rateColor(ytdGrossRate) }}>{fmtRate(ytdGrossRate)}</div>
            <div className="k-ctx">実績 {M(ytd.ga)} / 予算 {M(ytd.gb)}</div>
          </div>
          <div className="k">
            <div className="k-label">営利 YTD達成率</div>
            <div className="k-val" style={{ color: rateColor(ytdOpRate) }}>{fmtRate(ytdOpRate)}</div>
            <div className="k-ctx">実績 {M(ytd.oa)} / 予算 {M(ytd.ob)}</div>
          </div>
          <div className="k">
            <div className="k-label">未達ワースト</div>
            <div className="k-val" style={{ color: "var(--rd)" }}>{worst.length > 0 ? worst[0].m : "-"}</div>
            <div className="k-ctx">{worst.length > 0 ? `営利差異 ${worst[0].d >= 0 ? "+" : ""}${worst[0].d}万` : "-"}</div>
          </div>
        </div>

        {/* 着地見込み */}
        {hasActuals && hasBudget && (
          <div className="g3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <div className="k">
              <div className="k-label">売上 着地見込み</div>
              <div className="k-val">{M(forecast.sales)}</div>
              <div className="k-ctx">予算比 {fmtRate(achieveRate(forecast.sales, totalBudget.sales))}</div>
            </div>
            <div className="k">
              <div className="k-label">粗利 着地見込み</div>
              <div className="k-val">{M(forecast.gross)}</div>
              <div className="k-ctx">予算比 {fmtRate(achieveRate(forecast.gross, totalBudget.gross))}</div>
            </div>
            <div className="k">
              <div className="k-label">営利 着地見込み</div>
              <div className="k-val">{M(forecast.op)}</div>
              <div className="k-ctx">予算比 {fmtRate(achieveRate(forecast.op, totalBudget.op))}</div>
            </div>
          </div>
        )}

        {/* チャート 2×2グリッド */}
        <div className="g2">
          {/* 左列: 売上 + 販管費 */}
          <div className="g" style={{ gap: 14 }}>
            <div className="c"><div className="ch"><div><div className="ct">売上推移</div></div></div><div className="cb"><div className="chart"><canvas ref={salesRef} /></div></div></div>
            <div className="c"><div className="ch"><div><div className="ct">販管費推移</div></div></div><div className="cb"><div className="chart"><canvas ref={sgaRef} /></div></div></div>
          </div>
          {/* 右列: 粗利 + 営業利益 */}
          <div className="g" style={{ gap: 14 }}>
            <div className="c"><div className="ch"><div><div className="ct">粗利推移</div></div></div><div className="cb"><div className="chart"><canvas ref={grossRef} /></div></div></div>
            <div className="c"><div className="ch"><div><div className="ct">営業利益推移</div></div></div><div className="cb"><div className="chart"><canvas ref={opRef} /></div></div></div>
          </div>
        </div>

        {/* 月次予実テーブル */}
        <div className="c">
          <div className="ch">
            <div>
              <div className="ct">月次予実 詳細</div>
              <div className="cs">{getFiscalYearLabel(fiscalMonth, selectedFY)} — 予算セルはクリックで編集可能</div>
            </div>
            <div className="perf-table-tabs">
              <button className={`chip ${tableMode === "monthly" ? "on" : ""}`} onClick={() => setTableMode("monthly")}>単月</button>
              <button className={`chip ${tableMode === "cumulative" ? "on" : ""}`} onClick={() => setTableMode("cumulative")}>累積</button>
            </div>
          </div>
          <div className="cb tw">
            {tableMode === "monthly" ? (
              /* 単月テーブル */
              <table>
                <thead>
                  <tr>
                    <th>月</th>
                    <th className="tr">売上予算</th><th className="tr">売上実績</th><th className="tr">売上差異</th><th className="tr">達成率</th>
                    <th className="tr">粗利予算</th><th className="tr">粗利実績</th>
                    <th className="tr">営利予算</th><th className="tr">営利実績</th><th className="tr">営利差異</th>
                  </tr>
                </thead>
                <tbody>
                  {mergedData.map((v, i) => {
                    const sd = v.sa !== null && v.sb !== null ? v.sa - v.sb : null;
                    const od = v.oa !== null && v.ob !== null ? v.oa - v.ob : null;
                    const sRate = achieveRate(v.sa, v.sb);

                    return (
                      <tr key={i} style={i === currentMonthIdx ? { borderLeft: "2px solid var(--ac)" } : undefined}>
                        <td className="bold">{v.m}</td>
                        <EditableCell mi={i} field="sb" value={v.sb} />
                        <td className="tr mono">{v.sa !== null ? M(v.sa) : <span style={{ color: "var(--tx4)" }}>-</span>}</td>
                        <td className="tr mono" style={{ color: sd !== null ? (sd >= 0 ? "var(--ac)" : "var(--rd)") : "" }}>
                          {sd !== null ? `${sd >= 0 ? "+" : ""}${sd}万` : "-"}
                        </td>
                        <td className="tr mono" style={{ color: rateColor(sRate) }}>{fmtRate(sRate)}</td>
                        <EditableCell mi={i} field="gb" value={v.gb} />
                        <td className="tr mono">{v.ga !== null ? M(v.ga) : <span style={{ color: "var(--tx4)" }}>-</span>}</td>
                        <EditableCell mi={i} field="ob" value={v.ob} />
                        <td className="tr mono">{v.oa !== null ? M(v.oa) : <span style={{ color: "var(--tx4)" }}>-</span>}</td>
                        <td className="tr mono" style={{ color: od !== null ? (od >= 0 ? "var(--ac)" : "var(--rd)") : "" }}>
                          {od !== null ? `${od >= 0 ? "+" : ""}${od}万` : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {hasActuals && (
                  <tfoot>
                    <tr className="cf-total-row">
                      <td className="bold">YTD合計</td>
                      <td className="tr mono">{M(ytd.sb)}</td>
                      <td className="tr mono">{M(ytd.sa)}</td>
                      <td className="tr mono" style={{ color: ytd.sa - ytd.sb >= 0 ? "var(--ac)" : "var(--rd)" }}>
                        {ytd.sa - ytd.sb >= 0 ? "+" : ""}{ytd.sa - ytd.sb}万
                      </td>
                      <td className="tr mono" style={{ color: rateColor(ytdSalesRate) }}>{fmtRate(ytdSalesRate)}</td>
                      <td className="tr mono">{M(ytd.gb)}</td>
                      <td className="tr mono">{M(ytd.ga)}</td>
                      <td className="tr mono">{M(ytd.ob)}</td>
                      <td className="tr mono">{M(ytd.oa)}</td>
                      <td className="tr mono" style={{ color: ytd.oa - ytd.ob >= 0 ? "var(--ac)" : "var(--rd)" }}>
                        {ytd.oa - ytd.ob >= 0 ? "+" : ""}{ytd.oa - ytd.ob}万
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            ) : (
              /* 累積テーブル */
              <table>
                <thead>
                  <tr>
                    <th>月</th>
                    <th className="tr">売上累計予算</th><th className="tr">売上累計実績</th><th className="tr">達成率</th>
                    <th className="tr">粗利累計予算</th><th className="tr">粗利累計実績</th><th className="tr">達成率</th>
                    <th className="tr">営利累計予算</th><th className="tr">営利累計実績</th><th className="tr">達成率</th>
                  </tr>
                </thead>
                <tbody>
                  {mergedData.map((v, i) => {
                    const cum = cumulativeData[i];
                    const hasAct = v.sa !== null;
                    const sr = hasAct ? achieveRate(cum.sa, cum.sb) : null;
                    const gr = hasAct ? achieveRate(cum.ga, cum.gb) : null;
                    const or = hasAct ? achieveRate(cum.oa, cum.ob) : null;

                    return (
                      <tr key={i} style={i === currentMonthIdx ? { borderLeft: "2px solid var(--ac)" } : undefined}>
                        <td className="bold">{v.m}</td>
                        <td className="tr mono">{M(cum.sb)}</td>
                        <td className="tr mono">{hasAct ? M(cum.sa) : <span style={{ color: "var(--tx4)" }}>-</span>}</td>
                        <td className="tr mono" style={{ color: rateColor(sr) }}>{fmtRate(sr)}</td>
                        <td className="tr mono">{M(cum.gb)}</td>
                        <td className="tr mono">{hasAct ? M(cum.ga) : <span style={{ color: "var(--tx4)" }}>-</span>}</td>
                        <td className="tr mono" style={{ color: rateColor(gr) }}>{fmtRate(gr)}</td>
                        <td className="tr mono">{M(cum.ob)}</td>
                        <td className="tr mono">{hasAct ? M(cum.oa) : <span style={{ color: "var(--tx4)" }}>-</span>}</td>
                        <td className="tr mono" style={{ color: rateColor(or) }}>{fmtRate(or)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </>}
    </div></div>
  );
}

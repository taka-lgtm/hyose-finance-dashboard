import { useRef, useEffect, useState, useCallback } from "react";
import { Chart, registerables } from "chart.js";
import { M, chartFont, chartGrid, chartLegend } from "../data";
import { useSettings } from "../contexts/SettingsContext";
import { getFiscalYear } from "../contexts/SettingsContext";
import { generateMonthlyPLData, readFileAsArrayBuffer } from "../lib/csvParser";

Chart.register(...registerables);

export default function Performance({ bmData, monthlyPLData, saveBudget, saveMonthlyPL, canEdit = true }) {
  const { settings, fiscalMonths } = useSettings();
  const fiscalMonth = settings.fiscalMonth;

  // 年度切り替え
  const currentFY = getFiscalYear(fiscalMonth);
  const [selectedFY, setSelectedFY] = useState(currentFY);
  // 利用可能な年度リスト（月次PL実績のデータからキーを抽出）
  const availableYears = monthlyPLData ? [...new Set(Object.keys(monthlyPLData))].sort() : [];
  const fyOptions = availableYears.length > 0 ? availableYears.map(Number) : [currentFY];

  // 選択年度のデータを取得
  const fyKey = String(selectedFY);
  const actuals = monthlyPLData?.[fyKey] || null; // [{m, sales, cogs, grossProfit, sgaExpenses, operatingProfit}]
  const budget = bmData?.[fyKey] || null; // [{m, sb, gb, ob}]

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

  // インライン編集
  const [editing, setEditing] = useState(null); // "row-col"
  const [editVal, setEditVal] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  // チャート
  const sRef = useRef(null), oRef = useRef(null);
  const c1 = useRef(null), c2 = useRef(null);

  // 月次データを統合（fiscalMonths順に並べる）
  const mergedData = fiscalMonths.map((m) => {
    const act = actuals?.find((a) => a.m === m);
    const bud = budget?.find((b) => b.m === m);
    return {
      m,
      // 実績
      sa: act?.sales ?? null,
      ga: act?.grossProfit ?? null,
      oa: act?.operatingProfit ?? null,
      // 予算
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

      // 年度を推定（CSVの月データから）
      // CSVのデータは1年度分なので、選択中の年度に保存
      const newData = { ...(monthlyPLData || {}), [fyKey]: result };
      await saveMonthlyPL(newData);
      setUploadMsg({ type: "success", text: `${result.length}ヶ月分のPL実績データを登録しました（${selectedFY}年度）` });
    } catch (e) {
      setUploadMsg({ type: "error", text: e.message || "CSVの解析に失敗しました" });
    }
    setUploading(false);
  }, [saveMonthlyPL, fiscalMonth, fyKey, monthlyPLData, selectedFY]);

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

  // 前年実績から予算自動生成
  const generateFromPrevYear = useCallback(() => {
    if (!saveMonthlyPL) return;
    const prevFY = String(selectedFY - 1);
    const prevActuals = monthlyPLData?.[prevFY];
    if (!prevActuals || prevActuals.length === 0) {
      setUploadMsg({ type: "error", text: `${selectedFY - 1}年度の実績データがありません` });
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
    setUploadMsg({ type: "success", text: `${selectedFY - 1}年度実績 × ${growthRate}% で予算を生成しました` });
  }, [selectedFY, monthlyPLData, growthRate, bmData, fyKey, saveBudget, saveMonthlyPL]);

  // チャート描画
  useEffect(() => {
    Chart.defaults.color = "rgba(139,146,168,.7)";
    Chart.defaults.borderColor = "rgba(255,255,255,.04)";
    c1.current?.destroy(); c2.current?.destroy();
    if (!hasData) return;

    const labels = fiscalMonths;
    const opts = { type: "bar", options: { responsive: true, maintainAspectRatio: false, plugins: { legend: chartLegend }, scales: { y: { ticks: { callback: (v) => v + "万", font: chartFont }, grid: chartGrid }, x: { grid: { display: false }, ticks: { font: chartFont } } } } };

    if (sRef.current) {
      c1.current = new Chart(sRef.current, {
        ...opts,
        data: {
          labels,
          datasets: [
            { label: "売上予算", data: mergedData.map((v) => v.sb), backgroundColor: "rgba(255,255,255,.06)", borderRadius: 4 },
            { label: "売上実績", data: mergedData.map((v) => v.sa), backgroundColor: "rgba(91,141,239,.55)", borderRadius: 4 },
          ],
        },
      });
    }
    if (oRef.current) {
      c2.current = new Chart(oRef.current, {
        ...opts,
        data: {
          labels,
          datasets: [
            { label: "営利予算", data: mergedData.map((v) => v.ob), backgroundColor: "rgba(255,255,255,.06)", borderRadius: 4 },
            { label: "営利実績", data: mergedData.map((v) => v.oa), backgroundColor: "rgba(34,201,148,.55)", borderRadius: 4 },
          ],
        },
      });
    }
    return () => { c1.current?.destroy(); c2.current?.destroy(); };
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
              <option key={y} value={y}>{y}年度</option>
            ))}
          </select>
          {canEdit && <>
            {/* PL CSVアップロード */}
            <button className="btn upload-compact-btn" onClick={() => plFileRef.current?.click()} disabled={uploading}>
              <input ref={plFileRef} type="file" accept=".csv" style={{ display: "none" }}
                onChange={(e) => { handleUpload(e.target.files[0]); e.target.value = ""; }} />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span>{uploading ? "解析中..." : "PL CSV取り込み"}</span>
            </button>
            {/* 前年実績から予算生成 */}
            <button className="btn upload-compact-btn" onClick={() => setShowGrowthInput(!showGrowthInput)}>
              <span>前年実績から予算生成</span>
            </button>
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
              {selectedFY - 1}年度実績 × {growthRate}% で生成
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

        {/* チャート */}
        <div className="g2">
          <div className="c"><div className="ch"><div><div className="ct">売上 予実推移</div></div></div><div className="cb"><div className="chart tall"><canvas ref={sRef} /></div></div></div>
          <div className="c"><div className="ch"><div><div className="ct">営業利益 予実推移</div></div></div><div className="cb"><div className="chart tall"><canvas ref={oRef} /></div></div></div>
        </div>

        {/* 月次予実テーブル */}
        <div className="c">
          <div className="ch"><div><div className="ct">月次予実 詳細</div><div className="cs">{selectedFY}年度（{(fiscalMonth % 12) + 1}月〜{fiscalMonth}月）— 予算セルはクリックで編集可能</div></div></div>
          <div className="cb tw">
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
                  const isCurrentOrPast = i <= currentMonthIdx;

                  return (
                    <tr key={i} style={i === currentMonthIdx ? { borderLeft: "2px solid var(--ac)" } : undefined}>
                      <td className="bold">{v.m}</td>

                      {/* 売上予算（編集可能） */}
                      <td className="tr mono">
                        {editing === `${i}-sb` ? (
                          <input ref={inputRef} type="number" className="cell-edit-input" value={editVal}
                            onChange={(e) => setEditVal(e.target.value)}
                            onBlur={() => commitEdit(i, "sb")}
                            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(i, "sb"); if (e.key === "Escape") setEditing(null); }}
                          />
                        ) : (
                          <span className={canEdit && saveBudget ? "cell-editable" : ""} onClick={() => startEdit(i, "sb")}>
                            {v.sb !== null ? M(v.sb) : "-"}
                          </span>
                        )}
                      </td>
                      <td className="tr mono">{v.sa !== null ? M(v.sa) : <span style={{ color: "var(--tx4)" }}>-</span>}</td>
                      <td className="tr mono" style={{ color: sd !== null ? (sd >= 0 ? "var(--ac)" : "var(--rd)") : "" }}>
                        {sd !== null ? `${sd >= 0 ? "+" : ""}${sd}万` : "-"}
                      </td>
                      <td className="tr mono" style={{ color: rateColor(sRate) }}>
                        {fmtRate(sRate)}
                      </td>

                      {/* 粗利予算（編集可能） */}
                      <td className="tr mono">
                        {editing === `${i}-gb` ? (
                          <input ref={inputRef} type="number" className="cell-edit-input" value={editVal}
                            onChange={(e) => setEditVal(e.target.value)}
                            onBlur={() => commitEdit(i, "gb")}
                            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(i, "gb"); if (e.key === "Escape") setEditing(null); }}
                          />
                        ) : (
                          <span className={canEdit && saveBudget ? "cell-editable" : ""} onClick={() => startEdit(i, "gb")}>
                            {v.gb !== null ? M(v.gb) : "-"}
                          </span>
                        )}
                      </td>
                      <td className="tr mono">{v.ga !== null ? M(v.ga) : <span style={{ color: "var(--tx4)" }}>-</span>}</td>

                      {/* 営利予算（編集可能） */}
                      <td className="tr mono">
                        {editing === `${i}-ob` ? (
                          <input ref={inputRef} type="number" className="cell-edit-input" value={editVal}
                            onChange={(e) => setEditVal(e.target.value)}
                            onBlur={() => commitEdit(i, "ob")}
                            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(i, "ob"); if (e.key === "Escape") setEditing(null); }}
                          />
                        ) : (
                          <span className={canEdit && saveBudget ? "cell-editable" : ""} onClick={() => startEdit(i, "ob")}>
                            {v.ob !== null ? M(v.ob) : "-"}
                          </span>
                        )}
                      </td>
                      <td className="tr mono">{v.oa !== null ? M(v.oa) : <span style={{ color: "var(--tx4)" }}>-</span>}</td>
                      <td className="tr mono" style={{ color: od !== null ? (od >= 0 ? "var(--ac)" : "var(--rd)") : "" }}>
                        {od !== null ? `${od >= 0 ? "+" : ""}${od}万` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* 合計行 */}
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
          </div>
        </div>
      </>}
    </div></div>
  );
}

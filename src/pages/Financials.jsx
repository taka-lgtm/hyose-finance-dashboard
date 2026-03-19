import React, { useRef, useEffect, useState, useCallback } from "react";
import { Chart, registerables } from "chart.js";
import { YEARS, M, pct, sgn, chartFont, chartGrid, chartLegend } from "../data";
import { useAuth } from "../contexts/AuthContext";
import { addLoanLog } from "../lib/firestore";
import * as XLSX from "xlsx";

Chart.register(...registerables);

// ── Column mapping ──
const PL_MAP = {
  "売上高":"売上高","売上":"売上高","revenue":"売上高","sales":"売上高",
  "売上原価":"売上原価","原価":"売上原価","cogs":"売上原価",
  "減価償却費":"減価償却費","償却費":"減価償却費","depreciation":"減価償却費",
  "支払利息":"支払利息","利息":"支払利息","interest":"支払利息",
  "売上総利益":"売上総利益","粗利":"売上総利益","粗利益":"売上総利益",
  "販管費":"販管費","販売費及び一般管理費":"販管費",
  "営業利益":"営業利益","経常利益":"経常利益",
  "当期純利益":"当期純利益","純利益":"当期純利益",
  "予算売上":"予算売上","売上予算":"予算売上",
  "予算営業利益":"予算営業利益","営業利益予算":"予算営業利益",
};
const BS_MAP = {
  "流動資産":"流動資産","固定資産":"固定資産",
  "資産合計":"資産合計","総資産":"資産合計",
  "流動負債":"流動負債","固定負債":"固定負債",
  "短期借入金":"短期借入金",
  "純資産":"純資産","棚卸資産":"棚卸資産","在庫":"棚卸資産",
  "現預金":"現預金","現金及び預金":"現預金","現金":"現預金",
};

function parseExcel(file, mapDef) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: 0 });
        if (!json.length) return reject("データが空です");
        const headers = Object.keys(json[0]);
        const yearKey = headers.find((h) => /年度|year|期/i.test(h)) || headers[0];
        const result = json.map((row) => {
          const mapped = { y: String(row[yearKey]).replace(/年度?/, "") };
          for (const [header, value] of Object.entries(row)) {
            if (header === yearKey) continue;
            const norm = header.trim().toLowerCase();
            const key = mapDef[header.trim()] || mapDef[norm] ||
              Object.entries(mapDef).find(([k]) => norm.includes(k.toLowerCase()))?.[1];
            if (key) mapped[key] = Number(value) || 0;
          }
          return mapped;
        });
        resolve(result);
      } catch (err) { reject("ファイル解析に失敗: " + err.message); }
    };
    reader.onerror = () => reject("ファイル読み込みに失敗");
    reader.readAsArrayBuffer(file);
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject("ファイル読み込みに失敗");
    reader.readAsDataURL(file);
  });
}

function CompTable({ rows, dataset, header = "項目", yoy = true, years, editable, onCellEdit, editedCells }) {
  const displayYears = years || dataset.map((d) => d.y);
  const [editing, setEditing] = useState(null); // "row-col"
  const [editVal, setEditVal] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const startEdit = (ri, ci, key, val) => {
    if (!editable || !key) return;
    setEditing(`${ri}-${ci}`);
    setEditVal(val == null ? "" : String(val));
  };

  const commitEdit = (ri, ci, key, year) => {
    if (!editing) return;
    const num = Number(editVal);
    if (!isNaN(num) && onCellEdit) onCellEdit(ci, key, num, year);
    setEditing(null);
  };

  const cancelEdit = () => setEditing(null);

  return (
    <table className="ct-tbl">
      <thead><tr><th>{header}</th>{displayYears.map((y) => <th key={y}>{y}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>
            <td className="bold">{r.label}</td>
            {dataset.map((item, i) => {
              const v = r.fn ? r.fn(item, i) : item[r.key];
              const prev = i === 0 ? null : (r.fn ? r.fn(dataset[i-1], i-1) : dataset[i-1][r.key]);
              const disp = r.fmt ? r.fmt(v) : M(v);
              const ch = prev == null ? null : pct(v, prev);
              const cellKey = `${ri}-${i}`;
              const isEditing = editing === cellKey;
              const isEdited = editedCells?.has(`${item.y}-${r.key}`);
              const canEdit = editable && r.key;
              return (
                <td key={i} className={isEdited ? "cell-edited" : ""}>
                  {isEditing ? (
                    <input ref={inputRef} type="number" className="cell-edit-input" value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                      onBlur={() => commitEdit(ri, i, r.key, item.y)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitEdit(ri, i, r.key, item.y); if (e.key === "Escape") cancelEdit(); }}
                    />
                  ) : (
                    <div className={`ctc ${canEdit ? "cell-editable" : ""}`}
                      onClick={canEdit ? () => startEdit(ri, i, r.key, v) : undefined}>
                      <div className="ctv">{disp}</div>
                      {yoy && <div className={`cty ${ch==null?"":ch<0?"dn":"up"}`}>{ch==null?"-":sgn(ch)}</div>}
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 指標の改善方向を判定するヘルパー（up=値が大きいほど良い、down=小さいほど良い）
function ratioColor(cur, prev, direction = "up") {
  if (cur == null || prev == null || isNaN(cur) || isNaN(prev)) return "";
  const diff = cur - prev;
  if (Math.abs(diff) < 0.01) return "";
  if (direction === "up") return diff > 0 ? "rat-good" : "rat-bad";
  return diff < 0 ? "rat-good" : "rat-bad";
}

// グループ付き指標テーブル
function RatioTable({ groups, dataset, years }) {
  const displayYears = years || dataset.map((d) => d.y);
  return (
    <table className="ct-tbl rat-tbl">
      <thead><tr><th>指標</th>{displayYears.map((y) => <th key={y}>{y}</th>)}</tr></thead>
      <tbody>
        {groups.map((g, gi) => (
          <React.Fragment key={gi}>
            <tr className="rat-group-row"><td colSpan={displayYears.length + 1}>{g.label}</td></tr>
            {g.rows.map((r, ri) => (
              <tr key={ri}>
                <td className="bold">{r.label}{r.note && <span className="rat-note">※</span>}</td>
                {dataset.map((item, i) => {
                  const v = r.fn(item, i);
                  const prev = i === 0 ? null : r.fn(dataset[i - 1], i - 1);
                  const disp = r.fmt(v);
                  const color = ratioColor(v, prev, r.dir || "up");
                  return (
                    <td key={i}>
                      <div className={`ctc`}>
                        <div className={`ctv ${color}`}>{disp}</div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
}

export default function Financials({ plData, bsData, loans = [], savePL, saveBS }) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const [taxRate, setTaxRate] = useState(30);
  const [editedCells, setEditedCells] = useState(new Set());
  const pdfRef = useRef(null);
  const plExcelRef = useRef(null);
  const bsExcelRef = useRef(null);
  const plChartRef = useRef(null), bsChartRef = useRef(null);
  const c1 = useRef(null), c2 = useRef(null);
  const years = plData.map((d) => d.y);

  // セル編集ハンドラ（PL）
  const handlePLEdit = useCallback((colIdx, key, value, year) => {
    const oldVal = plData[colIdx]?.[key];
    if (oldVal === value) return;
    const updated = plData.map((d, i) => i === colIdx ? { ...d, [key]: value } : d);
    savePL(updated);
    setEditedCells((prev) => new Set(prev).add(`${year}-${key}`));
    const userName = user?.displayName || user?.email || "不明";
    addLoanLog({
      action: "PL編集", user: userName,
      target: `${year} / ${key}`,
      details: `${oldVal ?? "-"} → ${value}`,
    }).catch(() => {});
  }, [plData, savePL, user]);

  // セル編集ハンドラ（BS）
  const handleBSEdit = useCallback((colIdx, key, value, year) => {
    const oldVal = bsData[colIdx]?.[key];
    if (oldVal === value) return;
    const updated = bsData.map((d, i) => i === colIdx ? { ...d, [key]: value } : d);
    saveBS(updated);
    setEditedCells((prev) => new Set(prev).add(`${year}-${key}`));
    const userName = user?.displayName || user?.email || "不明";
    addLoanLog({
      action: "BS編集", user: userName,
      target: `${year} / ${key}`,
      details: `${oldVal ?? "-"} → ${value}`,
    }).catch(() => {});
  }, [bsData, saveBS, user]);

  // 有利子負債: BS固定負債 + 短期借入金（あれば）で近似
  const getDebt = (i) => {
    const bs = bsData[i];
    if (!bs) return null;
    return (bs.固定負債 || 0) + (bs.短期借入金 || 0);
  };

  // EBITDA計算（減価償却費がPLにある場合のみ）
  const getEBITDA = (r) => {
    if (r.減価償却費 == null) return null;
    return r.営業利益 + r.減価償却費;
  };

  // 簡易FCF: 当期純利益 - Δ固定資産（減価償却費が相殺されるため）
  const getFCF = (r, i) => {
    if (i === 0 || !bsData[i] || !bsData[i - 1]) return null;
    return r.当期純利益 - (bsData[i].固定資産 - bsData[i - 1].固定資産);
  };

  const fmtPct = (v) => (v == null || isNaN(v) ? "-" : v.toFixed(1) + "%");
  const fmtTimes = (v) => (v == null || isNaN(v) ? "-" : v.toFixed(2) + "倍");
  const fmtDays = (v) => (v == null || isNaN(v) ? "-" : v.toFixed(0) + "日");
  const fmtMonths = (v) => (v == null || isNaN(v) ? "-" : v.toFixed(1) + "ヶ月");
  const fmtYears = (v) => (v == null || isNaN(v) || !isFinite(v) ? "-" : v.toFixed(1) + "年");
  const fmtTurn = (v) => (v == null || isNaN(v) ? "-" : v.toFixed(2) + "回");

  // 減価償却費の有無を判定（1つでもあれば注記不要）
  const hasDepreciation = plData.some((r) => r.減価償却費 != null);
  const hasInterest = plData.some((r) => r.支払利息 != null);

  // 4グループの指標定義
  const ratioGroups = [
    {
      label: "収益力",
      rows: [
        { label: "売上成長率", fn: (r, i) => i === 0 ? null : pct(r.売上高, plData[i - 1]?.売上高), fmt: v => v == null ? "-" : sgn(v), dir: "up" },
        { label: "売上総利益率", fn: r => r.売上総利益 / r.売上高 * 100, fmt: fmtPct, dir: "up" },
        { label: "営業利益率", fn: r => r.営業利益 / r.売上高 * 100, fmt: fmtPct, dir: "up" },
        { label: "EBITDA", fn: r => getEBITDA(r), fmt: v => v == null ? "-" : M(v), dir: "up", note: !hasDepreciation },
        { label: "EBITDAマージン", fn: r => { const e = getEBITDA(r); return e == null ? null : e / r.売上高 * 100; }, fmt: fmtPct, dir: "up", note: !hasDepreciation },
      ],
    },
    {
      label: "効率性",
      rows: [
        { label: "総資産回転率", fn: (r, i) => bsData[i] ? r.売上高 / bsData[i].資産合計 : null, fmt: fmtTurn, dir: "up" },
        { label: "在庫回転期間", fn: (r, i) => bsData[i]?.棚卸資産 ? bsData[i].棚卸資産 / r.売上原価 * 365 : null, fmt: fmtDays, dir: "down" },
        { label: "ROE", fn: (r, i) => i === 0 || !bsData[i] || !bsData[i - 1] ? null : r.当期純利益 / ((bsData[i].純資産 + bsData[i - 1].純資産) / 2) * 100, fmt: fmtPct, dir: "up" },
        { label: "ROA", fn: (r, i) => i === 0 || !bsData[i] || !bsData[i - 1] ? null : r.当期純利益 / ((bsData[i].資産合計 + bsData[i - 1].資産合計) / 2) * 100, fmt: fmtPct, dir: "up" },
        { label: "ROIC", fn: (r, i) => {
          const debt = getDebt(i);
          if (debt == null || !bsData[i]) return null;
          const ic = bsData[i].純資産 + debt;
          return ic === 0 ? null : r.営業利益 * (1 - taxRate / 100) / ic * 100;
        }, fmt: fmtPct, dir: "up" },
      ],
    },
    {
      label: "キャッシュ",
      rows: [
        { label: "現金残高", fn: (r, i) => bsData[i]?.現預金 ?? null, fmt: v => v == null ? "-" : M(v), dir: "up" },
        { label: "月商倍率", fn: (r, i) => bsData[i]?.現預金 ? bsData[i].現預金 / (r.売上高 / 12) : null, fmt: fmtMonths, dir: "up" },
        { label: "フリーCF（簡易）", fn: (r, i) => getFCF(r, i), fmt: v => v == null ? "-" : M(v), dir: "up" },
      ],
    },
    {
      label: "安全性",
      rows: [
        { label: "自己資本比率", fn: (r, i) => bsData[i] ? bsData[i].純資産 / bsData[i].資産合計 * 100 : null, fmt: fmtPct, dir: "up" },
        { label: "流動比率", fn: (r, i) => bsData[i] ? bsData[i].流動資産 / bsData[i].流動負債 * 100 : null, fmt: v => v == null ? "-" : v.toFixed(0) + "%", dir: "up" },
        { label: "D/Eレシオ", fn: (r, i) => {
          const debt = getDebt(i);
          return debt == null || !bsData[i]?.純資産 ? null : debt / bsData[i].純資産;
        }, fmt: fmtTimes, dir: "down" },
        { label: "ICR", fn: (r, i) => {
          const pl = plData[i];
          if (!pl?.支払利息) return null;
          return pl.営業利益 / pl.支払利息;
        }, fmt: v => v == null ? "-" : v.toFixed(1) + "倍", dir: "up", note: !hasInterest },
        { label: "債務償還年数", fn: (r, i) => {
          const debt = getDebt(i);
          const ebitda = getEBITDA(r);
          if (debt == null || ebitda == null || ebitda <= 0) return null;
          return debt / ebitda;
        }, fmt: fmtYears, dir: "down", note: !hasDepreciation },
      ],
    },
  ];

  const plRows = [
    {label:"売上高",key:"売上高"},{label:"売上原価",key:"売上原価"},
    {label:"売上総利益",key:"売上総利益"},{label:"販管費",key:"販管費"},
    {label:"営業利益",key:"営業利益"},{label:"経常利益",key:"経常利益"},
    {label:"当期純利益",key:"当期純利益"},
  ];
  const bsRows = [
    {label:"流動資産",key:"流動資産"},{label:"固定資産",key:"固定資産"},
    {label:"資産合計",key:"資産合計"},{label:"流動負債",key:"流動負債"},
    {label:"固定負債",key:"固定負債"},{label:"純資産",key:"純資産"},
    {label:"現預金",key:"現預金"},{label:"棚卸資産",key:"棚卸資産"},
  ];

  // ── PDF Upload (PL+BS unified) ──
  const handlePdfUpload = useCallback(async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadMsg({ type: "info", text: "PDFをAIで解析中... PL・BSを自動抽出します（15〜30秒）" });
    try {
      const base64 = await fileToBase64(file);
      const resp = await fetch("/api/parse-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64: base64, type: "both" }),
      });
      const result = await resp.json();
      if (!resp.ok) throw result.error || "PDF解析に失敗しました";

      const msgs = [];
      if (result.pl?.length) { await savePL(result.pl); msgs.push(`PL ${result.pl.length}年度分`); }
      if (result.bs?.length) { await saveBS(result.bs); msgs.push(`BS ${result.bs.length}年度分`); }

      if (msgs.length === 0) throw "PL/BSのデータを抽出できませんでした";
      setUploadMsg({ type: "success", text: `${msgs.join(" + ")} を登録しました。` });
    } catch (e) {
      setUploadMsg({ type: "error", text: typeof e === "string" ? e : e.message || "アップロードに失敗しました" });
    }
    setUploading(false);
  }, [savePL, saveBS]);

  // ── Excel Upload (PL or BS individual) ──
  const handleExcelUpload = useCallback(async (type, file) => {
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const parsed = await parseExcel(file, type === "pl" ? PL_MAP : BS_MAP);
      if (!parsed.length) throw "データが見つかりません";
      const keys = type === "pl" ? ["売上高","営業利益"] : ["資産合計","純資産"];
      if (!keys.some(k => parsed[0][k] !== undefined)) throw `${type==="pl"?"PL":"BS"}の項目が見つかりません`;
      if (type === "pl") await savePL(parsed); else await saveBS(parsed);
      setUploadMsg({ type: "success", text: `${type==="pl"?"損益計算書":"貸借対照表"}を${parsed.length}年度分登録しました。` });
    } catch (e) {
      setUploadMsg({ type: "error", text: typeof e === "string" ? e : e.message });
    }
    setUploading(false);
  }, [savePL, saveBS]);

  // Charts
  useEffect(() => {
    Chart.defaults.color = "rgba(139,146,168,.7)";
    Chart.defaults.borderColor = "rgba(255,255,255,.04)";
    c1.current?.destroy(); c2.current?.destroy();
    if (plChartRef.current && plData.length) {
      c1.current = new Chart(plChartRef.current, { data: { labels: years, datasets: [{type:"bar",label:"売上高",data:plData.map(v=>v.売上高),backgroundColor:"rgba(91,141,239,.45)",borderRadius:6},{type:"line",label:"営業利益",data:plData.map(v=>v.営業利益),borderColor:"#22c994",pointRadius:3,tension:.25,borderWidth:2,yAxisID:"y1"},{type:"line",label:"経常利益",data:plData.map(v=>v.経常利益),borderColor:"#e5a83a",pointRadius:3,tension:.25,borderWidth:2,yAxisID:"y1"}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:chartLegend},scales:{y:{ticks:{callback:v=>v+"万",font:chartFont},grid:chartGrid},y1:{position:"right",ticks:{callback:v=>v+"万",font:chartFont},grid:{display:false}},x:{grid:{display:false},ticks:{font:chartFont}}}} });
    }
    if (bsChartRef.current && bsData.length) {
      c2.current = new Chart(bsChartRef.current, {type:"bar", data:{labels:bsData.map(d=>d.y),datasets:[{label:"流動資産",data:bsData.map(v=>v.流動資産),backgroundColor:"rgba(91,141,239,.35)",stack:"a",borderRadius:5},{label:"固定資産",data:bsData.map(v=>v.固定資産),backgroundColor:"rgba(91,141,239,.6)",stack:"a",borderRadius:5},{label:"負債",data:bsData.map(v=>(v.流動負債||0)+(v.固定負債||0)),backgroundColor:"rgba(229,91,91,.35)",stack:"b",borderRadius:5},{label:"純資産",data:bsData.map(v=>v.純資産),backgroundColor:"rgba(34,201,148,.45)",stack:"b",borderRadius:5}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:chartLegend},scales:{x:{stacked:true,grid:{display:false},ticks:{font:chartFont}},y:{stacked:true,grid:chartGrid,ticks:{callback:v=>v+"万",font:chartFont}}}} });
    }
    return () => { c1.current?.destroy(); c2.current?.destroy(); };
  }, [plData, bsData, years]);

  return (
    <div className="page"><div className="g">
      <div className="ph">
        <div><h2>決算書</h2><p>PL/BS/指標を一元管理。PDF1枚でPL・BSを自動抽出。</p></div>
        <div className="ph-actions">
          {/* PDF取り込みボタン */}
          <button className="btn pr upload-compact-btn" onClick={() => !uploading && pdfRef.current?.click()} disabled={uploading}>
            <input ref={pdfRef} type="file" accept=".pdf" style={{ display: "none" }}
              onChange={(e) => { handlePdfUpload(e.target.files[0]); e.target.value = ""; }} />
            {uploading ? (
              <><div className="login-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /><span>AI解析中...</span></>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/></svg><span>PDF取り込み</span></>
            )}
          </button>
          {/* Excel/CSV取り込みボタン */}
          <button className="btn upload-compact-btn" onClick={() => plExcelRef.current?.click()} disabled={uploading}>
            <input ref={plExcelRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
              onChange={(e) => { handleExcelUpload("pl", e.target.files[0]); e.target.value = ""; }} />
            <span>PL Excel</span>
          </button>
          <button className="btn upload-compact-btn" onClick={() => bsExcelRef.current?.click()} disabled={uploading}>
            <input ref={bsExcelRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
              onChange={(e) => { handleExcelUpload("bs", e.target.files[0]); e.target.value = ""; }} />
            <span>BS Excel</span>
          </button>
        </div>
      </div>

      {/* ── Upload message ── */}
      {uploadMsg && (
        <div className={`upload-msg upload-msg-${uploadMsg.type}`}>
          {uploadMsg.type === "info" && <div className="login-spinner" style={{ width: 14, height: 14, borderWidth: 2, flexShrink: 0 }} />}
          {uploadMsg.type === "success" && <span style={{ fontSize: 16 }}>✓</span>}
          {uploadMsg.type === "error" && <span style={{ fontSize: 16 }}>✕</span>}
          <span>{uploadMsg.text}</span>
          <button className="upload-msg-close" onClick={() => setUploadMsg(null)}>&times;</button>
        </div>
      )}

      {/* ── Data Tables ── */}
      <div className="c"><div className="ch"><div><div className="sec-label">Profit & Loss</div><div className="ct">損益計算書</div></div><span className="p bu">PL</span></div><div className="cb tw"><CompTable rows={plRows} dataset={plData} years={years} editable onCellEdit={handlePLEdit} editedCells={editedCells} /></div></div>
      <div className="c"><div className="ch"><div><div className="sec-label">Balance Sheet</div><div className="ct">貸借対照表</div></div><span className="p gd">BS</span></div><div className="cb tw"><CompTable rows={bsRows} dataset={bsData} years={bsData.map(d=>d.y)} editable onCellEdit={handleBSEdit} editedCells={editedCells} /></div></div>
      <div className="c">
        <div className="ch">
          <div><div className="sec-label">Key Ratios</div><div className="ct">主要経営指標</div></div>
          <div className="rat-tax-setting">
            <label>実効税率</label>
            <input type="number" value={taxRate} min={0} max={100} step={1}
              onChange={(e) => setTaxRate(Number(e.target.value) || 0)} />
            <span>%</span>
          </div>
          <span className="p wr">指標</span>
        </div>
        <div className="cb tw">
          <RatioTable groups={ratioGroups} dataset={plData} years={years} />
          {(!hasDepreciation || !hasInterest) && (
            <div className="rat-footnote">
              ※ 減価償却費・支払利息がPLデータに含まれていないため、一部指標が算出できません。PDF/Excelで取り込むと自動計算されます。
            </div>
          )}
        </div>
      </div>
      <div className="g2">
        <div className="c"><div className="ch"><div><div className="ct">売上・利益推移</div></div></div><div className="cb"><div className="chart"><canvas ref={plChartRef} /></div></div></div>
        <div className="c"><div className="ch"><div><div className="ct">資産構成推移</div></div></div><div className="cb"><div className="chart"><canvas ref={bsChartRef} /></div></div></div>
      </div>
    </div></div>
  );
}

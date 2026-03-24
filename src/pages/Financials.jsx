import React, { useRef, useEffect, useState, useCallback } from "react";
import { Chart, registerables } from "chart.js";
import { YEARS, M, pct, sgn, chartFont, chartGrid, chartLegend, getChartTheme } from "../data";
import { useSettings } from "../contexts/SettingsContext";
import { useAuth } from "../contexts/AuthContext";
import { addLoanLog } from "../lib/firestore";
import { useIsMobile } from "../lib/useIsMobile";

Chart.register(...registerables);


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
                <td className="bold tooltip-wrap">{r.label}{r.note && <span className="rat-note">※</span>}{r.tip && <div className="tooltip-box">{r.tip}</div>}</td>
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

export default function Financials({ plData, bsData, loans = [], savePL, saveBS, canEdit = true, openImportModal }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const isMobile = useIsMobile();
  const [taxRate, setTaxRate] = useState(30);
  const [editedCells, setEditedCells] = useState(new Set());
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
        { label: "売上成長率", tip: "前年売上高との比較。売上の伸び率を示す", fn: (r, i) => i === 0 ? null : pct(r.売上高, plData[i - 1]?.売上高), fmt: v => v == null ? "-" : sgn(v), dir: "up" },
        { label: "売上総利益率", tip: "売上総利益 ÷ 売上高。原価管理の効率性を示す", fn: r => r.売上総利益 / r.売上高 * 100, fmt: fmtPct, dir: "up" },
        { label: "営業利益率", tip: "営業利益 ÷ 売上高。本業の収益力を示す", fn: r => r.営業利益 / r.売上高 * 100, fmt: fmtPct, dir: "up" },
        { label: "EBITDA", tip: "営業利益 + 減価償却費。本業の実質的な稼ぐ力を示す", fn: r => getEBITDA(r), fmt: v => v == null ? "-" : M(v), dir: "up", note: !hasDepreciation },
        { label: "EBITDAマージン", tip: "EBITDA ÷ 売上高。設備投資の影響を除いた収益力", fn: r => { const e = getEBITDA(r); return e == null ? null : e / r.売上高 * 100; }, fmt: fmtPct, dir: "up", note: !hasDepreciation },
      ],
    },
    {
      label: "効率性",
      rows: [
        { label: "総資産回転率", tip: "売上高 ÷ 総資産。資産をどれだけ効率的に活用しているか", fn: (r, i) => bsData[i] ? r.売上高 / bsData[i].資産合計 : null, fmt: fmtTurn, dir: "up" },
        { label: "在庫回転期間", tip: "棚卸資産 ÷ 売上原価 × 365日。在庫が売れるまでの日数", fn: (r, i) => bsData[i]?.棚卸資産 ? bsData[i].棚卸資産 / r.売上原価 * 365 : null, fmt: fmtDays, dir: "down" },
        { label: "ROE", tip: "当期純利益 ÷ 平均自己資本。株主資本に対する利益率", fn: (r, i) => i === 0 || !bsData[i] || !bsData[i - 1] ? null : r.当期純利益 / ((bsData[i].純資産 + bsData[i - 1].純資産) / 2) * 100, fmt: fmtPct, dir: "up" },
        { label: "ROA", tip: "当期純利益 ÷ 平均総資産。総資産に対する利益率", fn: (r, i) => i === 0 || !bsData[i] || !bsData[i - 1] ? null : r.当期純利益 / ((bsData[i].資産合計 + bsData[i - 1].資産合計) / 2) * 100, fmt: fmtPct, dir: "up" },
        { label: "ROIC", tip: "税引後営業利益 ÷ 投下資本。事業に投じた資本のリターン", fn: (r, i) => {
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
        { label: "現金残高", tip: "BS上の現預金。手元流動性の絶対額", fn: (r, i) => bsData[i]?.現預金 ?? null, fmt: v => v == null ? "-" : M(v), dir: "up" },
        { label: "月商倍率", tip: "現預金 ÷ 月商。手元資金が月商の何ヶ月分あるか。2ヶ月以上が目安", fn: (r, i) => bsData[i]?.現預金 ? bsData[i].現預金 / (r.売上高 / 12) : null, fmt: fmtMonths, dir: "up" },
        { label: "フリーCF（簡易）", tip: "当期純利益 − 固定資産増減。事業が生む自由なキャッシュ", fn: (r, i) => getFCF(r, i), fmt: v => v == null ? "-" : M(v), dir: "up" },
      ],
    },
    {
      label: "安全性",
      rows: [
        { label: "自己資本比率", tip: "純資産 ÷ 総資産。財務の安定性を示す。30%以上が目安", fn: (r, i) => bsData[i] ? bsData[i].純資産 / bsData[i].資産合計 * 100 : null, fmt: fmtPct, dir: "up" },
        { label: "流動比率", tip: "流動資産 ÷ 流動負債。短期的な支払能力。200%以上が安定", fn: (r, i) => bsData[i] ? bsData[i].流動資産 / bsData[i].流動負債 * 100 : null, fmt: v => v == null ? "-" : v.toFixed(0) + "%", dir: "up" },
        { label: "D/Eレシオ", tip: "有利子負債 ÷ 自己資本。1.0以下が健全の目安", fn: (r, i) => {
          const debt = getDebt(i);
          return debt == null || !bsData[i]?.純資産 ? null : debt / bsData[i].純資産;
        }, fmt: fmtTimes, dir: "down" },
        { label: "ICR", tip: "営業利益 ÷ 支払利息。利息の支払余力。2.0倍以上が目安", fn: (r, i) => {
          const pl = plData[i];
          if (!pl?.支払利息) return null;
          return pl.営業利益 / pl.支払利息;
        }, fmt: v => v == null ? "-" : v.toFixed(1) + "倍", dir: "up", note: !hasInterest },
        { label: "債務償還年数", tip: "有利子負債 ÷ EBITDA。借入金を返済するのに必要な年数。10年以下が目安", fn: (r, i) => {
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


  // Charts
  useEffect(() => {
    const ct = getChartTheme(settings.theme);
    Chart.defaults.color = ct.textColor;
    Chart.defaults.borderColor = ct.gridColor;
    c1.current?.destroy(); c2.current?.destroy();
    const fmtTick = (v) => v.toLocaleString() + "万";
    const tg = { color: ct.gridColor };
    if (plChartRef.current && plData.length) {
      c1.current = new Chart(plChartRef.current, { data: { labels: years, datasets: [{type:"bar",label:"売上高",data:plData.map(v=>v.売上高),backgroundColor:"rgba(91,141,239,.75)",borderRadius:6},{type:"line",label:"営業利益",data:plData.map(v=>v.営業利益),borderColor:"#22c994",pointRadius:3,tension:.25,borderWidth:2,yAxisID:"y1"},{type:"line",label:"経常利益",data:plData.map(v=>v.経常利益),borderColor:"#e5a83a",pointRadius:3,tension:.25,borderWidth:2,yAxisID:"y1"}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:chartLegend},scales:{y:{ticks:{callback:fmtTick,font:chartFont},grid:tg},y1:{position:"right",ticks:{callback:fmtTick,font:chartFont},grid:{display:false}},x:{grid:{display:false},ticks:{font:chartFont}}}} });
    }
    if (bsChartRef.current && bsData.length) {
      // スタック順: Chart.jsは下から積み上げるため、上に表示したい項目を後に定義
      c2.current = new Chart(bsChartRef.current, {type:"bar", data:{labels:bsData.map(d=>d.y),datasets:[{label:"固定資産",data:bsData.map(v=>v.固定資産),backgroundColor:"rgba(91,141,239,.8)",stack:"a",borderRadius:5},{label:"流動資産",data:bsData.map(v=>v.流動資産),backgroundColor:"rgba(91,141,239,.5)",stack:"a",borderRadius:5},{label:"純資産",data:bsData.map(v=>v.純資産),backgroundColor:"rgba(34,201,148,.7)",stack:"b",borderRadius:5},{label:"負債",data:bsData.map(v=>(v.流動負債||0)+(v.固定負債||0)),backgroundColor:"rgba(229,91,91,.65)",stack:"b",borderRadius:5}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:chartLegend},scales:{x:{stacked:true,grid:{display:false},ticks:{font:chartFont}},y:{stacked:true,grid:tg,ticks:{callback:fmtTick,font:chartFont}}}} });
    }
    return () => { c1.current?.destroy(); c2.current?.destroy(); };
  }, [plData, bsData, years, settings.theme]);

  return (
    <div className="page"><div className="g">
      <div className="ph">
        <div><h2>決算書</h2><p>PL/BS/指標を一元管理。PDF1枚でPL・BSを自動抽出。</p></div>
        {canEdit && openImportModal && <div className="ph-actions">
          <button className="btn upload-compact-btn" onClick={openImportModal}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span>データ取込</span>
          </button>
        </div>}
      </div>

      {/* ── Charts ── */}
      <div className="g2">
        <div className="c"><div className="ch"><div><div className="ct">売上・利益推移</div></div></div><div className="cb"><div className="chart"><canvas ref={plChartRef} /></div></div></div>
        <div className="c"><div className="ch"><div><div className="ct">資産構成推移</div></div></div><div className="cb"><div className="chart"><canvas ref={bsChartRef} /></div></div></div>
      </div>

      {/* ── Data Tables ── */}
      <div className="c"><div className="ch"><div><div className="sec-label">Profit & Loss</div><div className="ct">損益計算書</div></div><span className="p bu">PL</span></div><div className="cb tw"><CompTable rows={plRows} dataset={plData} years={years} editable={canEdit} onCellEdit={handlePLEdit} editedCells={editedCells} /></div></div>
      <div className="c"><div className="ch"><div><div className="sec-label">Balance Sheet</div><div className="ct">貸借対照表</div></div><span className="p gd">BS</span></div><div className="cb tw"><CompTable rows={bsRows} dataset={bsData} years={bsData.map(d=>d.y)} editable={canEdit} onCellEdit={handleBSEdit} editedCells={editedCells} /></div></div>
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
        <div className={isMobile ? "cb" : "cb tw"}>
          {isMobile ? (
            /* スマホ: カード表示 */
            <div className="mob-cards">
              {ratioGroups.map((g, gi) => (
                <div className="ratio-mc" key={gi}>
                  <div className="ratio-mc-title">{g.label}</div>
                  {g.rows.map((r, ri) => (
                    <div className="ratio-mc-row" key={ri}>
                      <span className="mc-label">{r.label}</span>
                      <div className="mc-vals">
                        {plData.map((item, i) => (
                          <span className="mc-yr" key={i}>{r.fmt(r.fn(item, i))}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <RatioTable groups={ratioGroups} dataset={plData} years={years} />
          )}
          {(!hasDepreciation || !hasInterest) && (
            <div className="rat-footnote">
              ※ 減価償却費・支払利息がPLデータに含まれていないため、一部指標が算出できません。PDF/Excelで取り込むと自動計算されます。
            </div>
          )}
        </div>
      </div>
    </div></div>
  );
}

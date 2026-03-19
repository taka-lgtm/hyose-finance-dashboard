import { useRef, useEffect, useState, useCallback } from "react";
import { Chart, registerables } from "chart.js";
import { YEARS, M, pct, sgn, chartFont, chartGrid, chartLegend } from "../data";
import * as XLSX from "xlsx";

Chart.register(...registerables);

// ── Column mapping ──
const PL_MAP = {
  "売上高":"売上高","売上":"売上高","revenue":"売上高","sales":"売上高",
  "売上原価":"売上原価","原価":"売上原価","cogs":"売上原価",
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

function CompTable({ rows, dataset, header = "項目", yoy = true, years }) {
  const displayYears = years || dataset.map((d) => d.y);
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
              return (<td key={i}><div className="ctc"><div className="ctv">{disp}</div>
                {yoy && <div className={`cty ${ch==null?"":ch<0?"dn":"up"}`}>{ch==null?"-":sgn(ch)}</div>}
              </div></td>);
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Financials({ plData, bsData, savePL, saveBS }) {
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const pdfRef = useRef(null);
  const plExcelRef = useRef(null);
  const bsExcelRef = useRef(null);
  const plChartRef = useRef(null), bsChartRef = useRef(null);
  const c1 = useRef(null), c2 = useRef(null);
  const years = plData.map((d) => d.y);

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
  const ratRows = [
    {label:"売上成長率",fn:(r,i)=>i===0?null:pct(r.売上高,plData[i-1]?.売上高),fmt:v=>v==null?"-":sgn(v)},
    {label:"売上総利益率",fn:r=>r.売上総利益/r.売上高*100,fmt:v=>isNaN(v)?"-":v.toFixed(1)+"%"},
    {label:"営業利益率",fn:r=>r.営業利益/r.売上高*100,fmt:v=>isNaN(v)?"-":v.toFixed(1)+"%"},
    {label:"自己資本比率",fn:(r,i)=>bsData[i]?bsData[i].純資産/bsData[i].資産合計*100:null,fmt:v=>v==null?"-":v.toFixed(1)+"%"},
    {label:"流動比率",fn:(r,i)=>bsData[i]?bsData[i].流動資産/bsData[i].流動負債*100:null,fmt:v=>v==null?"-":v.toFixed(0)+"%"},
    {label:"ROE",fn:(r,i)=>i===0||!bsData[i]||!bsData[i-1]?null:r.当期純利益/((bsData[i].純資産+bsData[i-1].純資産)/2)*100,fmt:v=>v==null?"-":v.toFixed(1)+"%"},
    {label:"ROA",fn:(r,i)=>i===0||!bsData[i]||!bsData[i-1]?null:r.当期純利益/((bsData[i].資産合計+bsData[i-1].資産合計)/2)*100,fmt:v=>v==null?"-":v.toFixed(1)+"%"},
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
      </div>

      {/* ── Main PDF Upload ── */}
      <div className="upload-hero" onClick={() => !uploading && pdfRef.current?.click()}>
        <input ref={pdfRef} type="file" accept=".pdf" style={{ display: "none" }}
          onChange={(e) => { handlePdfUpload(e.target.files[0]); e.target.value = ""; }} />
        {uploading ? (
          <div className="upload-hero-loading">
            <div className="login-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
            <div className="upload-hero-text">
              <div className="u-title">AI解析中...</div>
              <div className="u-desc">PDFからPL・BSを自動抽出しています</div>
            </div>
          </div>
        ) : (
          <>
            <div className="upload-hero-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <polyline points="9 15 12 12 15 15"/>
              </svg>
            </div>
            <div className="upload-hero-text">
              <div className="u-title">決算書PDFをアップロード</div>
              <div className="u-desc">1つのPDFからPL（損益計算書）とBS（貸借対照表）をAIが自動抽出します</div>
            </div>
            <div className="upload-hero-formats">
              <span className="upload-format-tag">PDF</span>
              <span className="upload-format-tag">AI自動読取</span>
              <span className="upload-format-tag">PL+BS同時</span>
            </div>
          </>
        )}
      </div>

      {/* ── Sub: Excel/CSV individual ── */}
      <div className="upload-sub-row">
        <button className="upload-sub" onClick={() => plExcelRef.current?.click()} disabled={uploading}>
          <span className="upload-sub-icon">📊</span>
          <span className="upload-sub-text">PL（Excel/CSV）</span>
          <input ref={plExcelRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
            onChange={(e) => { handleExcelUpload("pl", e.target.files[0]); e.target.value = ""; }} />
        </button>
        <button className="upload-sub" onClick={() => bsExcelRef.current?.click()} disabled={uploading}>
          <span className="upload-sub-icon">📋</span>
          <span className="upload-sub-text">BS（Excel/CSV）</span>
          <input ref={bsExcelRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
            onChange={(e) => { handleExcelUpload("bs", e.target.files[0]); e.target.value = ""; }} />
        </button>
      </div>

      {/* ── Upload message ── */}
      {uploadMsg && (
        <div className={`upload-msg upload-msg-${uploadMsg.type}`}>
          {uploadMsg.type === "info" && <div className="login-spinner" style={{ width: 14, height: 14, borderWidth: 2, flexShrink: 0 }} />}
          {uploadMsg.type === "success" && <span style={{ fontSize: 16 }}>✓</span>}
          {uploadMsg.type === "error" && <span style={{ fontSize: 16 }}>✕</span>}
          <span>{uploadMsg.text}</span>
        </div>
      )}

      {/* ── Data Tables ── */}
      <div className="c"><div className="ch"><div><div className="sec-label">Profit & Loss</div><div className="ct">損益計算書</div></div><span className="p bu">PL</span></div><div className="cb tw"><CompTable rows={plRows} dataset={plData} years={years} /></div></div>
      <div className="c"><div className="ch"><div><div className="sec-label">Balance Sheet</div><div className="ct">貸借対照表</div></div><span className="p gd">BS</span></div><div className="cb tw"><CompTable rows={bsRows} dataset={bsData} years={bsData.map(d=>d.y)} /></div></div>
      <div className="c"><div className="ch"><div><div className="sec-label">Key Ratios</div><div className="ct">主要経営指標</div></div><span className="p wr">指標</span></div><div className="cb tw"><CompTable rows={ratRows} dataset={plData} header="指標" yoy={false} years={years} /></div></div>
      <div className="g2">
        <div className="c"><div className="ch"><div><div className="ct">売上・利益推移</div></div></div><div className="cb"><div className="chart"><canvas ref={plChartRef} /></div></div></div>
        <div className="c"><div className="ch"><div><div className="ct">資産構成推移</div></div></div><div className="cb"><div className="chart"><canvas ref={bsChartRef} /></div></div></div>
      </div>
    </div></div>
  );
}

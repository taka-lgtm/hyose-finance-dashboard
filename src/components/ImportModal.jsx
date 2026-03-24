import { useState, useRef, useCallback, useEffect } from "react";
import { generateCashFlowData, generateMonthlyPLData, readFileAsArrayBuffer } from "../lib/csvParser";
import { getFiscalYear, getFiscalMonths } from "../contexts/SettingsContext";
import { uploadTrialBalancePDF, fetchTrialBalancePDFs, deleteTrialBalancePDF } from "../lib/firestore";
import * as XLSX from "xlsx";

// ── 決算書Excel/CSV カラムマッピング ──
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

// 反映先ページ一覧
const AFFECTED_PAGES = [
  { label: "経営概況（KPI・スコア・アラート）", tab: "csv" },
  { label: "予実管理（月次実績）", tab: "csv" },
  { label: "資金繰り（入出金・残高推移）", tab: "csv" },
  { label: "決算推移（主要経営指標）", tab: "pdf" },
];

export default function ImportModal({
  open, onClose, settings,
  saveCF, saveMonthlyPL, savePL, saveBS,
  monthlyPLData, onImportComplete,
}) {
  const [tab, setTab] = useState("csv"); // "csv" | "pdf" | "tb"
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);

  // 月次データ（CSV）タブ
  const [bsFile, setBsFile] = useState(null);
  const [plFile, setPlFile] = useState(null);
  const bsRef = useRef(null);
  const plRef = useRef(null);

  // 決算書タブ
  const [pdfFile, setPdfFile] = useState(null);
  const pdfRef = useRef(null);
  const plExcelRef = useRef(null);
  const bsExcelRef = useRef(null);

  // 試算表PDFタブ
  const [tbPdfs, setTbPdfs] = useState(null);
  const [tbUploading, setTbUploading] = useState(null); // アップロード中の月名
  const tbRef = useRef(null);
  const [tbTargetMonth, setTbTargetMonth] = useState(null);
  const fiscalMonths = getFiscalMonths(settings.fiscalMonth);
  const tbFY = String(getFiscalYear(settings.fiscalMonth));
  const fyPdfs = tbPdfs?.[tbFY] || {};

  // 試算表PDFメタデータ読み込み
  useEffect(() => {
    if (open) fetchTrialBalancePDFs().then(setTbPdfs).catch(console.error);
  }, [open]);

  // モーダルを閉じるときにリセット
  const handleClose = useCallback(() => {
    if (uploading) return;
    setUploadMsg(null);
    setBsFile(null);
    setPlFile(null);
    setPdfFile(null);
    onClose();
  }, [uploading, onClose]);

  // ── 月次CSVアップロード ──
  const handleCSVUpload = useCallback(async () => {
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
            const dateMatch = plFile.name.match(/(\d{4})(\d{2})(\d{2})/);
            let fy;
            if (dateMatch) {
              const fileDate = new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]));
              fy = String(getFiscalYear(settings.fiscalMonth, fileDate));
            } else {
              fy = String(getFiscalYear(settings.fiscalMonth));
            }
            const newData = { ...(monthlyPLData || {}), [fy]: monthlyResult };
            await saveMonthlyPL(newData);
            plMsg = ` + 予実管理（${fy}年度）も更新`;
          }
        } catch (_) { /* 月次PL生成失敗は無視 */ }
      }
      setUploadMsg({ type: "success", text: `${cfResult.length}ヶ月分のデータを取り込みました${plMsg}` });
      setBsFile(null);
      setPlFile(null);
      if (onImportComplete) onImportComplete();
    } catch (e) {
      setUploadMsg({ type: "error", text: typeof e === "string" ? e : e.message || "CSVの解析に失敗しました" });
    }
    setUploading(false);
  }, [bsFile, plFile, saveCF, saveMonthlyPL, monthlyPLData, settings.fiscalMonth, onImportComplete]);

  // ── PDF決算書アップロード ──
  const handlePdfUpload = useCallback(async () => {
    if (!pdfFile) return;
    setUploading(true);
    setUploadMsg({ type: "info", text: "PDFをAIで解析中... PL・BSを自動抽出します（15〜30秒）" });
    try {
      const base64 = await fileToBase64(pdfFile);
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
      setPdfFile(null);
      if (onImportComplete) onImportComplete();
    } catch (e) {
      setUploadMsg({ type: "error", text: typeof e === "string" ? e : e.message || "アップロードに失敗しました" });
    }
    setUploading(false);
  }, [pdfFile, savePL, saveBS, onImportComplete]);

  // ── 試算表PDFアップロード ──
  const handleTbUpload = useCallback(async (month, file) => {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) return;
    setTbUploading(month);
    setUploadMsg(null);
    try {
      const meta = await uploadTrialBalancePDF(tbFY, month, file);
      setTbPdfs((prev) => ({ ...prev, [tbFY]: { ...(prev?.[tbFY] || {}), [month]: meta } }));
      setUploadMsg({ type: "success", text: `${month}の試算表PDFを登録しました` });
    } catch (e) {
      setUploadMsg({ type: "error", text: "アップロードに失敗しました: " + (e.message || e) });
    }
    setTbUploading(null);
  }, [tbFY]);

  const handleTbDelete = useCallback(async (month) => {
    try {
      await deleteTrialBalancePDF(tbFY, month);
      setTbPdfs((prev) => {
        const updated = { ...prev };
        if (updated[tbFY]) delete updated[tbFY][month];
        return updated;
      });
      setUploadMsg({ type: "success", text: `${month}の試算表PDFを削除しました` });
    } catch (e) {
      setUploadMsg({ type: "error", text: "削除に失敗しました" });
    }
  }, [tbFY]);

  // ── Excel決算書アップロード ──
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
      if (onImportComplete) onImportComplete();
    } catch (e) {
      setUploadMsg({ type: "error", text: typeof e === "string" ? e : e.message });
    }
    setUploading(false);
  }, [savePL, saveBS, onImportComplete]);

  return (
    <div className={`modal-overlay ${open ? "open" : ""}`} onClick={handleClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className="modal-head">
          <div>
            <h3>会計データ取込</h3>
            <p>データを取り込むと各ページに自動反映されます</p>
          </div>
          <button className="modal-close" onClick={handleClose}>&times;</button>
        </div>

        {/* タブ切り替え */}
        <div className="import-tabs">
          <button className={`import-tab ${tab === "csv" ? "on" : ""}`} onClick={() => !uploading && setTab("csv")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            月次データ
          </button>
          <button className={`import-tab ${tab === "pdf" ? "on" : ""}`} onClick={() => !uploading && setTab("pdf")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            決算書
          </button>
          <button className={`import-tab ${tab === "tb" ? "on" : ""}`} onClick={() => !uploading && setTab("tb")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            試算表
          </button>
        </div>

        {/* ボディ */}
        <div className="modal-body">
          {/* メッセージ */}
          {uploadMsg && (
            <div className={`upload-msg upload-msg-${uploadMsg.type}`} style={{ marginBottom: 16 }}>
              {uploadMsg.type === "info" && <div className="login-spinner" style={{ width: 14, height: 14, borderWidth: 2, flexShrink: 0 }} />}
              {uploadMsg.type === "success" && <span style={{ fontSize: 16 }}>✓</span>}
              {uploadMsg.type === "error" && <span style={{ fontSize: 16 }}>✕</span>}
              <span>{uploadMsg.text}</span>
              <button className="upload-msg-close" onClick={() => setUploadMsg(null)}>&times;</button>
            </div>
          )}

          {tab === "tb" ? (
            /* ── 試算表PDFタブ ── */
            <div className="import-tab-content">
              <div className="import-desc">
                毎月の試算表PDFをアップロードします。予実管理ページから月別に閲覧できます。
              </div>
              <div className="import-fy-info" style={{ marginBottom: 8 }}>対象年度: {tbFY}年度</div>

              {/* 非表示ファイル入力 */}
              <input ref={tbRef} type="file" accept=".pdf" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files[0]; if (f && tbTargetMonth) handleTbUpload(tbTargetMonth, f); e.target.value = ""; }} />

              {/* 月別一覧 */}
              <div className="tb-month-list">
                {fiscalMonths.map((m) => {
                  const pdf = fyPdfs[m];
                  const isUploading = tbUploading === m;
                  return (
                    <div className="tb-month-row" key={m}>
                      <span className="tb-month-name">{m}</span>
                      {isUploading ? (
                        <div className="login-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                      ) : pdf ? (
                        <div className="tb-month-actions">
                          <a href={pdf.url} target="_blank" rel="noopener noreferrer" className="tb-pdf-btn tb-pdf-has" title={pdf.fileName}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                            {pdf.fileName.length > 20 ? pdf.fileName.slice(0, 20) + "..." : pdf.fileName}
                          </a>
                          <button className="tb-pdf-btn" style={{ color: "var(--rd)", fontSize: 11 }} onClick={() => handleTbDelete(m)}>削除</button>
                        </div>
                      ) : (
                        <button className="tb-pdf-btn tb-pdf-upload" onClick={() => { setTbTargetMonth(m); tbRef.current?.click(); }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                          PDF登録
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : tab === "csv" ? (
            /* ── 月次データタブ ── */
            <div className="import-tab-content">
              <div className="import-desc">
                マネーフォワードの月次推移CSVを取り込みます。取込むと以下のページが自動更新されます：
              </div>
              <div className="import-affected">
                {AFFECTED_PAGES.filter(p => p.tab === "csv").map((p, i) => (
                  <div key={i} className="import-affected-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="import-check"><polyline points="20 6 9 17 4 12"/></svg>
                    {p.label}
                  </div>
                ))}
              </div>

              {/* BSファイル選択 */}
              <div className="import-file-area" onClick={() => !uploading && bsRef.current?.click()}>
                <input ref={bsRef} type="file" accept=".csv" style={{ display: "none" }}
                  onChange={(e) => { setBsFile(e.target.files[0] || null); e.target.value = ""; }} />
                <div className="import-file-label">貸借対照表（BS）CSV</div>
                <div className="import-file-status">
                  {bsFile ? (
                    <><span className="import-file-name">{bsFile.name}</span><button className="import-file-clear" onClick={(e) => { e.stopPropagation(); setBsFile(null); }}>&times;</button></>
                  ) : (
                    <span className="import-file-placeholder">ファイルを選択</span>
                  )}
                </div>
              </div>

              {/* PLファイル選択 */}
              <div className="import-file-area" onClick={() => !uploading && plRef.current?.click()}>
                <input ref={plRef} type="file" accept=".csv" style={{ display: "none" }}
                  onChange={(e) => { setPlFile(e.target.files[0] || null); e.target.value = ""; }} />
                <div className="import-file-label">損益計算書（PL）CSV</div>
                <div className="import-file-status">
                  {plFile ? (
                    <><span className="import-file-name">{plFile.name}</span><button className="import-file-clear" onClick={(e) => { e.stopPropagation(); setPlFile(null); }}>&times;</button></>
                  ) : (
                    <span className="import-file-placeholder">ファイルを選択</span>
                  )}
                </div>
              </div>

              {/* 年度自動判定 */}
              {plFile && (() => {
                const dateMatch = plFile.name.match(/(\d{4})(\d{2})(\d{2})/);
                if (dateMatch) {
                  const fileDate = new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]));
                  const fy = getFiscalYear(settings.fiscalMonth, fileDate);
                  return <div className="import-fy-info">年度: 自動判定（{fy}年度）</div>;
                }
                return null;
              })()}

              {/* ヒント */}
              <div className="import-hint">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                <div>
                  <strong>手順:</strong> マネーフォワード → 会計帳簿 → 残高試算表 → 月次推移 → CSV出力<br/>
                  BS・PLそれぞれ出力してください
                </div>
              </div>
            </div>
          ) : (
            /* ── 決算書タブ ── */
            <div className="import-tab-content">
              <div className="import-desc">
                決算書PDF（PL・BS）をAIで自動解析、またはExcel/CSVで取り込みます。
              </div>
              <div className="import-affected">
                {AFFECTED_PAGES.filter(p => p.tab === "pdf").map((p, i) => (
                  <div key={i} className="import-affected-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="import-check"><polyline points="20 6 9 17 4 12"/></svg>
                    {p.label}
                  </div>
                ))}
              </div>

              {/* PDFファイル選択 */}
              <div className="import-section-label">PDF取込（AI自動解析）</div>
              <div className="import-file-area" onClick={() => !uploading && pdfRef.current?.click()}>
                <input ref={pdfRef} type="file" accept=".pdf" style={{ display: "none" }}
                  onChange={(e) => { setPdfFile(e.target.files[0] || null); e.target.value = ""; }} />
                <div className="import-file-label">決算書PDF（PL・BSを1ファイルで自動抽出）</div>
                <div className="import-file-status">
                  {pdfFile ? (
                    <><span className="import-file-name">{pdfFile.name}</span><button className="import-file-clear" onClick={(e) => { e.stopPropagation(); setPdfFile(null); }}>&times;</button></>
                  ) : (
                    <span className="import-file-placeholder">ファイルを選択</span>
                  )}
                </div>
              </div>
              {pdfFile && (
                <button className="btn pr import-action-btn" onClick={handlePdfUpload} disabled={uploading}>
                  {uploading ? <><div className="login-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /><span>AI解析中...</span></> : "PDF取込実行"}
                </button>
              )}

              {/* Excel/CSV取込 */}
              <div className="import-section-label" style={{ marginTop: 20 }}>Excel / CSV取込</div>
              <div className="import-excel-row">
                <button className="btn upload-compact-btn" onClick={() => !uploading && plExcelRef.current?.click()} disabled={uploading}>
                  <input ref={plExcelRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                    onChange={(e) => { handleExcelUpload("pl", e.target.files[0]); e.target.value = ""; }} />
                  <span>PL Excel/CSV</span>
                </button>
                <button className="btn upload-compact-btn" onClick={() => !uploading && bsExcelRef.current?.click()} disabled={uploading}>
                  <input ref={bsExcelRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                    onChange={(e) => { handleExcelUpload("bs", e.target.files[0]); e.target.value = ""; }} />
                  <span>BS Excel/CSV</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* フッター（CSVタブのみ取込ボタン表示） */}
        {tab === "csv" && (
          <div className="modal-foot">
            <button className="btn" onClick={handleClose} disabled={uploading}>キャンセル</button>
            <button className="btn pr" onClick={handleCSVUpload} disabled={uploading || !bsFile || !plFile}>
              {uploading ? (
                <><div className="login-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /><span>解析中...</span></>
              ) : "取込実行"}
            </button>
          </div>
        )}
        {(tab === "pdf" || tab === "tb") && (
          <div className="modal-foot">
            <button className="btn" onClick={handleClose} disabled={uploading}>閉じる</button>
          </div>
        )}
      </div>
    </div>
  );
}

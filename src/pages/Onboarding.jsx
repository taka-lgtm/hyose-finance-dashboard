import { useState, useRef, useCallback } from "react";
import { useSettings } from "../contexts/SettingsContext";
import { getFiscalPeriodLabel, getFiscalYear, getFiscalYearLabel } from "../contexts/SettingsContext";
import { readFileAsArrayBuffer, generateMonthlyPLData, generateCashFlowData } from "../lib/csvParser";
import { saveFinancialData, saveBudget as saveBudgetDoc, saveMonthlyPL as saveMonthlyPLDoc, fetchFinancialData } from "../lib/firestore";

const STEPS = [
  "会社情報",
  "決算書データ",
  "月次データ",
  "融資データ",
  "予算設定",
  "セットアップ完了",
];

// ── Step 1: 会社情報 ──
function StepCompany({ form, setForm }) {
  const handleChange = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const period = getFiscalPeriodLabel(form.fiscalMonth || 3);

  return (
    <div className="ob-step">
      <h3 className="ob-step-title">会社情報の設定</h3>
      <p className="ob-step-desc">基本的な会社情報を入力してください。</p>
      <div className="ob-form">
        <label className="ob-label">
          <span>会社名</span>
          <input type="text" className="ob-input" value={form.companyName || ""} onChange={(e) => handleChange("companyName", e.target.value)} placeholder="例: 株式会社ヒョーセ" />
        </label>
        <label className="ob-label">
          <span>何月が期末ですか？（決算月）</span>
          <select className="ob-input" value={form.fiscalMonth || 3} onChange={(e) => handleChange("fiscalMonth", Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}月</option>)}
          </select>
          <span className="ob-hint">会計期間: {period}</span>
        </label>
        <label className="ob-label">
          <span>社員のメールアドレスの@以降を入力してください（許可ドメイン）</span>
          <input type="text" className="ob-input" value={form.allowedDomain || ""} onChange={(e) => handleChange("allowedDomain", e.target.value)} placeholder="例: hyose.co.jp" />
        </label>
        <label className="ob-label">
          <span>ロゴ画像URL（任意）</span>
          <input type="text" className="ob-input" value={form.logoUrl || ""} onChange={(e) => handleChange("logoUrl", e.target.value)} placeholder="https://..." />
          {form.logoUrl && <img src={form.logoUrl} alt="ロゴ" style={{ maxHeight: 40, marginTop: 8 }} />}
        </label>
      </div>
    </div>
  );
}

// ── Step 2: 決算書PDF ──
function StepFinancials({ uploadState, setUploadState }) {
  const fileRef = useRef(null);

  const handlePdf = useCallback(async (file) => {
    if (!file) return;
    setUploadState({ status: "loading", text: "PDFを解析中..." });
    try {
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const resp = await fetch("/api/parse-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64: base64, type: "both" }),
      });
      if (!resp.ok) throw new Error("PDF解析APIエラー");
      const result = await resp.json();
      if (result.pl) await saveFinancialData("pl", result.pl);
      if (result.bs) await saveFinancialData("bs", result.bs);
      setUploadState({ status: "success", text: `PL ${result.pl?.length || 0}年分 / BS ${result.bs?.length || 0}年分を登録しました`, pl: result.pl?.length || 0, bs: result.bs?.length || 0 });
    } catch (e) {
      setUploadState({ status: "error", text: e.message || "PDF解析に失敗しました" });
    }
  }, [setUploadState]);

  return (
    <div className="ob-step">
      <h3 className="ob-step-title">決算書データの登録</h3>
      <p className="ob-step-desc">過去の決算書PDFをアップロードしてください。複数年分あると、成長率や前年比が表示されます。</p>
      <div className="ob-upload-area" onClick={() => fileRef.current?.click()}>
        <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => { handlePdf(e.target.files[0]); e.target.value = ""; }} />
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <div style={{ marginTop: 8, fontSize: 14, color: "var(--tx2)" }}>クリックしてPDFを選択</div>
      </div>
      {uploadState.status && (
        <div className={`ob-msg ob-msg-${uploadState.status}`}>
          {uploadState.status === "loading" && <div className="login-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
          {uploadState.status === "success" && <span>✓</span>}
          {uploadState.status === "error" && <span>✕</span>}
          <span>{uploadState.text}</span>
        </div>
      )}
    </div>
  );
}

// ── Step 3: 月次CSVデータ ──
function StepMonthly({ csvState, setCsvState, fiscalMonth }) {
  const bsRef = useRef(null);
  const plRef = useRef(null);
  const [bsFile, setBsFile] = useState(null);
  const [plFile, setPlFile] = useState(null);

  const handleUpload = useCallback(async () => {
    if (!bsFile || !plFile) return;
    setCsvState({ status: "loading", text: "CSVを解析中..." });
    try {
      const bsBuf = await readFileAsArrayBuffer(bsFile);
      const plBuf = await readFileAsArrayBuffer(plFile);
      // 資金繰りデータ
      const cfResult = generateCashFlowData(bsBuf, plBuf, fiscalMonth);
      await saveFinancialData("cf", cfResult);
      // 月次PL実績（予実管理用）
      const plBuf2 = await readFileAsArrayBuffer(plFile);
      const monthlyResult = generateMonthlyPLData(plBuf2, fiscalMonth);
      const fy = String(getFiscalYear(fiscalMonth));
      const existing = await fetchFinancialData("monthlyPL");
      const newData = { ...(existing?.data || {}), [fy]: monthlyResult };
      await saveMonthlyPLDoc(newData);
      setCsvState({ status: "success", text: `${cfResult.length}ヶ月分の資金繰り + 月次PL実績を登録しました` });
    } catch (e) {
      setCsvState({ status: "error", text: e.message || "CSV解析に失敗しました" });
    }
  }, [bsFile, plFile, fiscalMonth, setCsvState]);

  return (
    <div className="ob-step">
      <h3 className="ob-step-title">月次データの登録（マネーフォワード）</h3>
      <p className="ob-step-desc">マネーフォワードクラウド会計から月次データを取り込みます。</p>
      <div className="ob-mf-steps">
        <div className="ob-mf-step"><span className="ob-mf-num">1</span>マネーフォワードにログイン</div>
        <div className="ob-mf-step"><span className="ob-mf-num">2</span>会計帳簿 → 残高試算表 → 月次推移</div>
        <div className="ob-mf-step"><span className="ob-mf-num">3</span>貸借対照表と損益計算書をそれぞれCSV出力</div>
      </div>
      <div className="ob-form" style={{ marginTop: 16 }}>
        <label className="ob-label">
          <span>貸借対照表（BS）CSV</span>
          <div className="ob-file-row">
            <button className="btn" onClick={() => bsRef.current?.click()}>{bsFile ? bsFile.name : "ファイルを選択"}</button>
            <input ref={bsRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => setBsFile(e.target.files[0])} />
          </div>
        </label>
        <label className="ob-label">
          <span>損益計算書（PL）CSV</span>
          <div className="ob-file-row">
            <button className="btn" onClick={() => plRef.current?.click()}>{plFile ? plFile.name : "ファイルを選択"}</button>
            <input ref={plRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => setPlFile(e.target.files[0])} />
          </div>
        </label>
        {bsFile && plFile && (
          <button className="btn pr" onClick={handleUpload}>取り込み実行</button>
        )}
      </div>
      {csvState.status && (
        <div className={`ob-msg ob-msg-${csvState.status}`}>
          {csvState.status === "loading" && <div className="login-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
          {csvState.status === "success" && <span>✓</span>}
          {csvState.status === "error" && <span>✕</span>}
          <span>{csvState.text}</span>
        </div>
      )}
      <p className="ob-note">※ 現在はマネーフォワードのCSV形式のみ対応しています</p>
    </div>
  );
}

// ── Step 4: 融資データ ──
function StepLoans({ navigate, onSkip }) {
  return (
    <div className="ob-step">
      <h3 className="ob-step-title">融資データの登録</h3>
      <p className="ob-step-desc">銀行借入のデータを登録します。</p>
      <div className="ob-options">
        <div className="ob-option" onClick={() => { navigate("debt"); }}>
          <div className="ob-option-title">1件ずつ手動で登録する</div>
          <div className="ob-option-desc">融資管理ページに移動して、「新規追加」から登録します。</div>
        </div>
      </div>
      <button className="btn" onClick={onSkip} style={{ marginTop: 12 }}>融資がない場合はスキップ</button>
    </div>
  );
}

// ── Step 5: 予算設定 ──
function StepBudget({ fiscalMonth, budgetState, setBudgetState }) {
  const [annualSales, setAnnualSales] = useState("");
  const [annualGross, setAnnualGross] = useState("");
  const [annualOp, setAnnualOp] = useState("");

  const handleGenerate = useCallback(async () => {
    const sales = Number(annualSales) || 0;
    const gross = Number(annualGross) || 0;
    const op = Number(annualOp) || 0;
    if (!sales && !gross && !op) return;

    setBudgetState({ status: "loading", text: "予算を生成中..." });
    try {
      const startMonth = (fiscalMonth % 12) + 1;
      const months = Array.from({ length: 12 }, (_, i) => {
        const m = ((startMonth - 1 + i) % 12) + 1;
        return `${m}月`;
      });
      const generated = months.map((m) => ({
        m,
        sb: Math.round(sales / 12),
        gb: Math.round(gross / 12),
        ob: Math.round(op / 12),
      }));
      const fy = String(getFiscalYear(fiscalMonth));
      const existing = await fetchFinancialData("budget");
      const newData = { ...(existing?.data || {}), [fy]: generated };
      await saveBudgetDoc(newData);
      setBudgetState({ status: "success", text: `${getFiscalYearLabel(fiscalMonth, Number(fy))}の予算を設定しました` });
    } catch (e) {
      setBudgetState({ status: "error", text: e.message || "予算の保存に失敗しました" });
    }
  }, [annualSales, annualGross, annualOp, fiscalMonth, setBudgetState]);

  return (
    <div className="ob-step">
      <h3 className="ob-step-title">予算の設定</h3>
      <p className="ob-step-desc">今年度の売上・利益目標を設定します。年間金額を入力すると12ヶ月に均等配分されます。</p>
      <div className="ob-form">
        <label className="ob-label">
          <span>年間売上予算（万円）</span>
          <input type="number" className="ob-input" value={annualSales} onChange={(e) => setAnnualSales(e.target.value)} placeholder="例: 50000" />
        </label>
        <label className="ob-label">
          <span>年間粗利予算（万円）</span>
          <input type="number" className="ob-input" value={annualGross} onChange={(e) => setAnnualGross(e.target.value)} placeholder="例: 15000" />
        </label>
        <label className="ob-label">
          <span>年間営業利益予算（万円）</span>
          <input type="number" className="ob-input" value={annualOp} onChange={(e) => setAnnualOp(e.target.value)} placeholder="例: 5000" />
        </label>
        <button className="btn pr" onClick={handleGenerate}>予算を設定</button>
      </div>
      {budgetState.status && (
        <div className={`ob-msg ob-msg-${budgetState.status}`}>
          {budgetState.status === "success" && <span>✓</span>}
          {budgetState.status === "error" && <span>✕</span>}
          <span>{budgetState.text}</span>
        </div>
      )}
    </div>
  );
}

// ── Step 6: 完了 ──
function StepComplete({ summary, navigate, onComplete }) {
  const items = [
    { key: "company", label: "会社情報", done: summary.company },
    { key: "financials", label: "決算書", done: summary.financials, detail: summary.financials ? `${summary.plCount}年分` : null },
    { key: "monthly", label: "月次データ", done: summary.monthly },
    { key: "loans", label: "融資データ", done: summary.loans, detail: summary.loans ? `${summary.loanCount}件` : null },
    { key: "budget", label: "予算", done: summary.budget },
  ];
  const pageMap = { financials: "financials", monthly: "cashflow", loans: "debt", budget: "performance" };

  return (
    <div className="ob-step">
      <h3 className="ob-step-title">セットアップが完了しました！</h3>
      <p className="ob-step-desc">登録状況を確認してください。未完了の項目は各ページからいつでも登録できます。</p>
      <div className="ob-summary">
        {items.map((it) => (
          <div key={it.key} className="ob-summary-item">
            <span className={`ob-summary-icon ${it.done ? "done" : ""}`}>{it.done ? "✓" : "!"}</span>
            <span className="ob-summary-label">{it.label}</span>
            {it.done ? (
              <span className="ob-summary-status done">{it.detail || "設定済み"}</span>
            ) : (
              <button className="ob-summary-link" onClick={() => navigate(pageMap[it.key])}>今すぐ登録</button>
            )}
          </div>
        ))}
      </div>
      <button className="btn pr" onClick={onComplete} style={{ marginTop: 20, width: "100%" }}>ダッシュボードを見る</button>
    </div>
  );
}

// ── メインウィザード ──
export default function Onboarding({ navigate, onComplete, loans, plData, bsData, monthlyPLData, bmData }) {
  const { settings, saveSettings } = useSettings();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    companyName: settings.companyName || "",
    fiscalMonth: settings.fiscalMonth || 3,
    allowedDomain: settings.allowedDomain || "",
    logoUrl: settings.logoUrl || "",
  });
  const [pdfState, setPdfState] = useState({});
  const [csvState, setCsvState] = useState({});
  const [budgetState, setBudgetState] = useState({});

  const currentFY = getFiscalYear(form.fiscalMonth || 3);

  // Step 1 保存
  const saveCompany = useCallback(async () => {
    await saveSettings(form);
  }, [form, saveSettings]);

  const handleNext = async () => {
    if (step === 0) await saveCompany();
    if (step < STEPS.length - 1) setStep(step + 1);
  };

  const handlePrev = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSkip = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
  };

  const handleComplete = async () => {
    await saveSettings({ ...form, onboardingCompleted: true });
    onComplete();
  };

  // 完了サマリー
  const summary = {
    company: !!(form.companyName && form.companyName !== "株式会社ヒョーセ"),
    financials: plData && plData.length > 0,
    plCount: plData?.length || 0,
    monthly: monthlyPLData && Object.keys(monthlyPLData).length > 0,
    loans: loans && loans.length > 0,
    loanCount: loans?.length || 0,
    budget: bmData && Object.keys(bmData).length > 0,
  };

  return (
    <div className="ob-overlay">
      <div className="ob-container">
        {/* プログレスバー */}
        <div className="ob-progress">
          {STEPS.map((s, i) => (
            <div key={i} className={`ob-progress-step ${i < step ? "done" : ""} ${i === step ? "active" : ""}`}>
              <div className="ob-progress-dot">{i < step ? "✓" : i + 1}</div>
              <div className="ob-progress-label">{s}</div>
            </div>
          ))}
          <div className="ob-progress-line">
            <div className="ob-progress-fill" style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} />
          </div>
        </div>

        {/* ステップ内容 */}
        <div className="ob-body">
          {step === 0 && <StepCompany form={form} setForm={setForm} />}
          {step === 1 && <StepFinancials uploadState={pdfState} setUploadState={setPdfState} />}
          {step === 2 && <StepMonthly csvState={csvState} setCsvState={setCsvState} fiscalMonth={form.fiscalMonth || 3} />}
          {step === 3 && <StepLoans navigate={navigate} onSkip={handleSkip} />}
          {step === 4 && <StepBudget fiscalMonth={form.fiscalMonth || 3} budgetState={budgetState} setBudgetState={setBudgetState} />}
          {step === 5 && <StepComplete summary={summary} navigate={navigate} onComplete={handleComplete} />}
        </div>

        {/* ナビゲーション */}
        {step < 5 && (
          <div className="ob-nav">
            <button className="btn" onClick={handlePrev} disabled={step === 0}>戻る</button>
            <div style={{ display: "flex", gap: 8 }}>
              {step > 0 && step < 5 && <button className="btn" onClick={handleSkip}>後で設定する</button>}
              <button className="btn pr" onClick={handleNext}>{step === 0 ? "次へ" : "次へ進む"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

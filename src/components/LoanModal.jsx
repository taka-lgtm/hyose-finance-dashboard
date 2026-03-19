import { useState, useEffect, useRef } from "react";

const EMPTY = {
  name: "", num: "", bank: "", start: "2026-04-01",
  principal: "", balance: "", rate: "", rt: "固定",
  monthly: "", method: "元金均等", term: "", grace: "0",
  collateral: "無担保",
};

const EXISTING_BANKS = ["三井住友銀行", "みなと銀行", "日本政策金融公庫", "但馬銀行"];

export default function LoanModal({ open, onClose, onSubmit, loans }) {
  const [form, setForm] = useState(EMPTY);
  const overlayRef = useRef(null);

  // Collect all unique banks including dynamically added ones
  const allBanks = [...new Set([...EXISTING_BANKS, ...loans.map((l) => l.bank)])];

  useEffect(() => {
    if (open) setForm(EMPTY);
  }, [open]);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === "Escape" && open) onClose(); };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  const set = (key, val) => {
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      // Auto-fill balance when principal changes
      if (key === "principal" && (!prev.balance || prev.balance === prev.principal)) {
        next.balance = val;
      }
      return next;
    });
  };

  const submit = () => {
    if (!form.name) return alert("融資名を入力してください");
    if (!form.bank) return alert("銀行名を入力してください");
    if (!form.principal) return alert("借入金額を入力してください");
    if (!form.rate) return alert("金利を入力してください");
    if (!form.monthly) return alert("月返済額を入力してください");

    const balance = Number(form.balance) || Number(form.principal);
    const monthly = Number(form.monthly);
    onSubmit({
      bank: form.bank,
      name: form.name,
      num: form.num || `NEW-${Date.now().toString(36).toUpperCase().slice(-6)}`,
      principal: Number(form.principal),
      rate: parseFloat(form.rate),
      rt: form.rt,
      method: form.method,
      term: Number(form.term) || Math.ceil(balance / monthly),
      grace: Number(form.grace) || 0,
      start: form.start || new Date().toISOString().slice(0, 10),
      collateral: form.collateral,
      balance,
      monthly,
    });
    onClose();
  };

  return (
    <div
      ref={overlayRef}
      className={`modal-overlay ${open ? "open" : ""}`}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="modal">
        <div className="modal-head">
          <div>
            <h3>融資 新規登録</h3>
            <p>新しい融資情報を登録します。登録後は融資管理ページに即時反映されます。</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-section-label">基本情報</div>
            <Field label="融資名" req value={form.name} onChange={(v) => set("name", v)} placeholder="例: 設備資金③" />
            <Field label="管理番号" value={form.num} onChange={(v) => set("num", v)} placeholder="例: SM-2026-003" />
            <div className="form-group">
              <label className="form-label">銀行名<span className="req">*</span></label>
              <input className="form-input" list="bankList" value={form.bank} onChange={(e) => set("bank", e.target.value)} placeholder="銀行名を入力または選択" />
              <datalist id="bankList">
                {allBanks.map((b) => <option key={b} value={b} />)}
              </datalist>
            </div>
            <Field label="借入日" req type="date" value={form.start} onChange={(v) => set("start", v)} />

            <div className="form-divider" />
            <div className="form-section-label">金額・金利</div>
            <Field label="借入金額（万円）" req type="number" value={form.principal} onChange={(v) => set("principal", v)} placeholder="例: 3000" />
            <Field label="現在残高（万円）" req type="number" value={form.balance} onChange={(v) => set("balance", v)} placeholder="借入金額と同額が初期値" />
            <Field label="金利（%）" req type="number" step="0.1" value={form.rate} onChange={(v) => set("rate", v)} placeholder="例: 1.2" />
            <Select label="金利種別" req value={form.rt} onChange={(v) => set("rt", v)} options={["固定", "変動"]} />

            <div className="form-divider" />
            <div className="form-section-label">返済条件</div>
            <Field label="月返済額（万円）" req type="number" value={form.monthly} onChange={(v) => set("monthly", v)} placeholder="例: 42" />
            <Select label="返済方式" value={form.method} onChange={(v) => set("method", v)} options={["元金均等", "元利均等"]} />
            <Field label="返済期間（ヶ月）" type="number" value={form.term} onChange={(v) => set("term", v)} placeholder="例: 60" />
            <Field label="据置期間（ヶ月）" type="number" value={form.grace} onChange={(v) => set("grace", v)} placeholder="0" />

            <div className="form-divider" />
            <div className="form-section-label">担保・保証</div>
            <div className="form-group full">
              <Select label="担保区分" value={form.collateral} onChange={(v) => set("collateral", v)} options={["無担保", "保証協会", "不動産担保", "その他"]} />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>キャンセル</button>
          <button className="btn pr" onClick={submit}>登録する</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, req, type = "text", value, onChange, placeholder, step }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}{req && <span className="req">*</span>}</label>
      <input className="form-input" type={type} step={step} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function Select({ label, req, value, onChange, options }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}{req && <span className="req">*</span>}</label>
      <select className="form-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

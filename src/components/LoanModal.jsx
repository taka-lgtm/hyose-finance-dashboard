import { useState, useEffect, useRef } from "react";
import { BANK_COLORS } from "../data/banks";

// 新規登録時のデフォルト値（金額は円単位）
const EMPTY = {
  category: "長期", purpose: "運転", name: "", num: "",
  bank: "", bankSeq: "", start: "2026-04-01", endDate: "",
  debitDay: "", principal: "", balance: "", rate: "", rt: "固定",
  baseRate: "", guaranteeFee: "0", monthly: "", method: "元金均等",
  term: "", grace: "0",
  condition: "P", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "", guaranteePlan: "",
  collateral: "プロパー", notes: "",
};

// editing: null（新規）または既存ローンオブジェクト（編集）
export default function LoanModal({ open, onClose, onSubmit, onUpdate, onDelete, editing, loans }) {
  const [form, setForm] = useState(EMPTY);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const overlayRef = useRef(null);
  const isEdit = !!editing;

  const allBanks = [...new Set([...Object.keys(BANK_COLORS), ...loans.map((l) => l.bank)])];

  useEffect(() => {
    if (!open) { setDeleteConfirm(false); return; }
    if (editing) {
      // 編集モード: 既存データでフォームを初期化
      const e = editing;
      setForm({
        category: e.category || "長期", purpose: e.purpose || "", name: e.name || "", num: e.num || "",
        bank: e.bank || "", bankSeq: e.bankSeq ?? "", start: e.start || "", endDate: e.endDate || "",
        debitDay: e.debitDay ?? "", principal: e.principal ?? "", balance: e.balance ?? "",
        rate: e.rate ?? "", rt: e.rt || "固定", baseRate: e.baseRate ?? "", guaranteeFee: e.guaranteeFee ?? "0",
        monthly: e.monthly ?? "", method: e.method || "", term: e.term ?? "", grace: e.grace ?? "0",
        condition: e.condition || "P", guaranteeOrg: e.guaranteeOrg || "", guaranteeType: e.guaranteeType || "",
        guaranteeSec: e.guaranteeSec || "", guaranteePlan: e.guaranteePlan || "",
        collateral: e.collateral || "", notes: e.notes || "",
      });
    } else {
      setForm(EMPTY);
    }
    setDeleteConfirm(false);
  }, [open, editing]);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === "Escape" && open) onClose(); };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  const set = (key, val) => {
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      if (key === "principal" && !isEdit && (!prev.balance || prev.balance === prev.principal)) {
        next.balance = val;
      }
      return next;
    });
  };

  const buildPayload = () => {
    const balance = Number(form.balance) || Number(form.principal);
    const monthly = Number(form.monthly) || 0;
    const baseRate = parseFloat(form.baseRate) || parseFloat(form.rate);
    const guaranteeFee = parseFloat(form.guaranteeFee) || 0;
    return {
      category: form.category, purpose: form.purpose, bank: form.bank,
      bankSeq: Number(form.bankSeq) || 0, name: form.name,
      num: form.num || (isEdit ? "" : `NEW-${Date.now().toString(36).toUpperCase().slice(-6)}`),
      start: form.start || "", endDate: form.endDate || "",
      debitDay: Number(form.debitDay) || null, principal: Number(form.principal),
      rate: parseFloat(form.rate), baseRate, guaranteeFee, rt: form.rt,
      method: form.method, term: Number(form.term) || (monthly > 0 ? Math.ceil(balance / monthly) : 0),
      grace: Number(form.grace) || 0, condition: form.condition,
      guaranteeOrg: form.guaranteeOrg, guaranteeType: form.guaranteeType,
      guaranteeSec: form.guaranteeSec, guaranteePlan: form.guaranteePlan,
      collateral: form.collateral, balance, monthly, notes: form.notes,
    };
  };

  const submit = () => {
    if (!form.name) return alert("融資名を入力してください");
    if (!form.bank) return alert("銀行名を入力してください");
    if (!form.principal) return alert("借入金額を入力してください");
    if (!form.rate) return alert("金利を入力してください");
    if (form.category !== "当座貸越" && !form.monthly) return alert("月返済額を入力してください");

    const payload = buildPayload();
    if (isEdit && onUpdate) {
      onUpdate(editing.id, payload);
    } else {
      onSubmit(payload);
    }
    onClose();
  };

  const handleDelete = () => {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    if (onDelete) onDelete(editing.id);
    onClose();
  };

  return (
    <div ref={overlayRef} className={`modal-overlay ${open ? "open" : ""}`}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <h3>{isEdit ? "融資 編集" : "融資 新規登録"}</h3>
            <p>{isEdit ? `${editing.bank} / ${editing.name} の情報を編集します。` : "新しい融資情報を登録します。"}</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-section-label">基本情報</div>
            <Select label="融資区分" req value={form.category} onChange={(v) => set("category", v)} options={["長期", "短期", "当座貸越"]} />
            <Select label="資金使途" value={form.purpose} onChange={(v) => set("purpose", v)} options={["運転", "設備", ""]} />
            <Field label="融資名" req value={form.name} onChange={(v) => set("name", v)} placeholder="例: 運転資金①" />
            <Field label="管理番号" value={form.num} onChange={(v) => set("num", v)} placeholder="例: 103155" />
            <div className="form-group">
              <label className="form-label">銀行名<span className="req">*</span></label>
              <input className="form-input" list="bankList" value={form.bank} onChange={(e) => set("bank", e.target.value)} placeholder="銀行名を入力または選択" />
              <datalist id="bankList">{allBanks.map((b) => <option key={b} value={b} />)}</datalist>
            </div>
            <Field label="借入日" type="date" value={form.start} onChange={(v) => set("start", v)} />
            <Field label="最終期限" type="date" value={form.endDate} onChange={(v) => set("endDate", v)} />
            <Field label="引落日" type="number" value={form.debitDay} onChange={(v) => set("debitDay", v)} placeholder="例: 15" />

            <div className="form-divider" />
            <div className="form-section-label">金額・金利</div>
            <Field label="借入金額（円）" req type="number" value={form.principal} onChange={(v) => set("principal", v)} placeholder="例: 30000000" />
            <Field label="現在残高（円）" req type="number" value={form.balance} onChange={(v) => set("balance", v)} placeholder="借入金額と同額が初期値" />
            <Field label="実効金利（%）" req type="number" step="0.01" value={form.rate} onChange={(v) => set("rate", v)} placeholder="例: 1.25" />
            <Field label="基本金利（%）" type="number" step="0.01" value={form.baseRate} onChange={(v) => set("baseRate", v)} placeholder="実効金利と同じなら空欄可" />
            <Field label="保証料率（%）" type="number" step="0.01" value={form.guaranteeFee} onChange={(v) => set("guaranteeFee", v)} placeholder="0" />
            <Select label="金利種別" req value={form.rt} onChange={(v) => set("rt", v)} options={["固定", "変動"]} />

            <div className="form-divider" />
            <div className="form-section-label">返済条件</div>
            <Field label="月返済額（円）" req={form.category !== "当座貸越"} type="number" value={form.monthly} onChange={(v) => set("monthly", v)} placeholder="例: 500000" />
            <Select label="返済方式" value={form.method} onChange={(v) => set("method", v)} options={["元金均等", "元利均等", "一括返済", ""]} />
            <Field label="返済期間（ヶ月）" type="number" value={form.term} onChange={(v) => set("term", v)} placeholder="例: 60" />
            <Field label="据置期間（ヶ月）" type="number" value={form.grace} onChange={(v) => set("grace", v)} placeholder="0" />

            <div className="form-divider" />
            <div className="form-section-label">担保・保証</div>
            <Select label="条件" value={form.condition} onChange={(v) => set("condition", v)} options={["P", "保"]} />
            <Select label="担保区分" value={form.collateral} onChange={(v) => set("collateral", v)} options={["プロパー", "保証協会", "土地担保", "不動産担保", "無担保"]} />
            <Field label="保証協会" value={form.guaranteeOrg} onChange={(v) => set("guaranteeOrg", v)} placeholder="例: 国、県" />
            <Field label="保証枠/種類" value={form.guaranteeType} onChange={(v) => set("guaranteeType", v)} placeholder="例: 一般、セーフティ" />
            <Field label="保証枠/担保" value={form.guaranteeSec} onChange={(v) => set("guaranteeSec", v)} placeholder="例: 無担保、有担保" />
            <Field label="保証制度" value={form.guaranteePlan} onChange={(v) => set("guaranteePlan", v)} placeholder="例: 伴走特別一般" />

            <div className="form-divider" />
            <div className="form-section-label">備考</div>
            <div className="form-group full">
              <Field label="備考" value={form.notes} onChange={(v) => set("notes", v)} placeholder="特記事項があれば入力" />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          {isEdit && (
            <button className="btn" style={{ borderColor: deleteConfirm ? "var(--rd)" : "var(--bd)", color: deleteConfirm ? "#fff" : "var(--rd)", background: deleteConfirm ? "var(--rd)" : "transparent", marginRight: "auto" }} onClick={handleDelete}>
              {deleteConfirm ? "本当に削除する" : "この融資を削除"}
            </button>
          )}
          <button className="btn" onClick={onClose}>キャンセル</button>
          <button className="btn pr" onClick={submit}>{isEdit ? "保存する" : "登録する"}</button>
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

import { useState, useEffect } from "react";
import { useSettings, getFiscalPeriodLabel } from "../contexts/SettingsContext";
import { useAuth } from "../contexts/AuthContext";

export default function Settings() {
  const { settings, saveSettings } = useSettings();
  const { userDoc } = useAuth();
  const isAdmin = userDoc?.role === "admin";

  // フォーム状態
  const [form, setForm] = useState({ ...settings });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  // 設定が読み込まれたらフォームに反映
  useEffect(() => {
    setForm({ ...settings });
  }, [settings]);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    const ok = await saveSettings(form);
    setMsg(ok ? { type: "success", text: "設定を保存しました" } : { type: "error", text: "保存に失敗しました" });
    setSaving(false);
    if (ok) setTimeout(() => setMsg(null), 3000);
  };

  if (!isAdmin) {
    return (
      <div className="page"><div className="g">
        <div className="ph"><div><h2>設定</h2><p>管理者のみ設定を変更できます。</p></div></div>
        <div className="c"><div className="cb" style={{ padding: "40px 20px", textAlign: "center", color: "var(--tx3)" }}>
          <p>この機能は管理者専用です。</p>
        </div></div>
      </div></div>
    );
  }

  return (
    <div className="page"><div className="g">
      <div className="ph">
        <div><h2>設定</h2><p>会社情報と表示設定を管理する。</p></div>
        <div className="pa">
          <button className="btn pr" onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      {/* 保存メッセージ */}
      {msg && (
        <div className={`upload-msg upload-msg-${msg.type}`}>
          {msg.type === "success" && <span style={{ fontSize: 16 }}>✓</span>}
          {msg.type === "error" && <span style={{ fontSize: 16 }}>✕</span>}
          <span>{msg.text}</span>
          <button className="upload-msg-close" onClick={() => setMsg(null)}>&times;</button>
        </div>
      )}

      {/* 会社基本情報 */}
      <div className="c">
        <div className="ch"><div><div className="ct">会社基本情報</div></div></div>
        <div className="cb">
          <div className="settings-grid">
            <div className="settings-field">
              <label className="settings-label">会社名</label>
              <input
                type="text"
                className="settings-input"
                value={form.companyName}
                onChange={(e) => handleChange("companyName", e.target.value)}
              />
            </div>
            <div className="settings-field">
              <label className="settings-label">決算月</label>
              <div className="settings-row">
                <select
                  className="settings-select"
                  value={form.fiscalMonth}
                  onChange={(e) => handleChange("fiscalMonth", Number(e.target.value))}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{m}月</option>
                  ))}
                </select>
                <span className="settings-hint">
                  会計期間: {getFiscalPeriodLabel(form.fiscalMonth)}
                </span>
              </div>
            </div>
            <div className="settings-field">
              <label className="settings-label">許可ドメイン</label>
              <input
                type="text"
                className="settings-input"
                value={form.allowedDomain}
                onChange={(e) => handleChange("allowedDomain", e.target.value)}
                placeholder="例: hyose.co.jp"
              />
              <span className="settings-hint">Google Workspace認証で許可するドメイン（空欄なら.envの値を使用）</span>
            </div>
            <div className="settings-field">
              <label className="settings-label">ロゴ画像URL</label>
              <input
                type="text"
                className="settings-input"
                value={form.logoUrl}
                onChange={(e) => handleChange("logoUrl", e.target.value)}
                placeholder="https://example.com/logo.png"
              />
              <span className="settings-hint">ヘッダーに表示するロゴ画像のURL</span>
              {form.logoUrl && (
                <div className="settings-logo-preview">
                  <img src={form.logoUrl} alt="ロゴプレビュー" onError={(e) => { e.target.style.display = "none"; }} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 表示設定 */}
      <div className="c">
        <div className="ch"><div><div className="ct">表示設定</div></div></div>
        <div className="cb">
          <div className="settings-grid">
            <div className="settings-field">
              <label className="settings-label">金額単位</label>
              <div className="settings-radio-group">
                {["万円", "千円", "円"].map((unit) => (
                  <label key={unit} className={`settings-radio ${form.amountUnit === unit ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="amountUnit"
                      value={unit}
                      checked={form.amountUnit === unit}
                      onChange={() => handleChange("amountUnit", unit)}
                    />
                    {unit}
                  </label>
                ))}
              </div>
            </div>
            <div className="settings-field">
              <label className="settings-label">安全水準ライン</label>
              <div className="settings-row">
                <input
                  type="number"
                  className="settings-input settings-input-short"
                  value={form.safetyLine}
                  onChange={(e) => handleChange("safetyLine", Number(e.target.value))}
                />
                <span className="settings-unit">万円</span>
              </div>
              <span className="settings-hint">資金繰りグラフに表示する警告ライン</span>
            </div>
            <div className="settings-field">
              <label className="settings-label">法人実効税率</label>
              <div className="settings-row">
                <input
                  type="number"
                  className="settings-input settings-input-short"
                  value={form.taxRate}
                  min={0}
                  max={100}
                  step={0.1}
                  onChange={(e) => handleChange("taxRate", Number(e.target.value))}
                />
                <span className="settings-unit">%</span>
              </div>
              <span className="settings-hint">主要経営指標の計算に使用</span>
            </div>
          </div>
        </div>
      </div>
      {/* セットアップウィザード再実行 */}
      {isAdmin && (
        <div className="c">
          <div className="ch"><div><div className="ct">セットアップ</div><div className="cs">初回セットアップウィザードを再実行できます</div></div></div>
          <div className="cb">
            <button className="btn" onClick={async () => {
              await saveSettings({ onboardingCompleted: false });
              window.location.reload();
            }}>
              セットアップウィザードを再実行
            </button>
          </div>
        </div>
      )}
    </div></div>
  );
}

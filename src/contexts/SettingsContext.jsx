import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { fetchSettings, saveSettings as saveSettingsDoc } from "../lib/firestore";
import { useAuth } from "./AuthContext";

const SettingsContext = createContext(null);
export const useSettings = () => useContext(SettingsContext);

// デフォルト設定値
export const DEFAULT_SETTINGS = {
  companyName: "株式会社ヒョーセ",
  fiscalMonth: 3,          // 決算月（3月決算）
  allowedDomain: "",        // 空ならfirebase.jsのフォールバック使用
  logoUrl: "",              // ロゴ画像URL
  amountUnit: "万円",       // "万円" | "千円" | "円"
  safetyLine: 4500,         // 安全水準ライン（万円）
  taxRate: 30,              // 法人実効税率（%）
  theme: "dark",            // "dark" | "light"
};

/**
 * 決算月から会計期間の月順を生成する
 * 例: fiscalMonth=3 → ["4月","5月",...,"2月","3月"]
 * 例: fiscalMonth=12 → ["1月","2月",...,"11月","12月"]
 */
export function getFiscalMonths(fiscalMonth) {
  const start = (fiscalMonth % 12) + 1; // 期首月（決算月の翌月）
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((start - 1 + i) % 12) + 1;
    return `${m}月`;
  });
}

/**
 * 決算月から会計期間の表示文字列を生成する
 * 例: fiscalMonth=3 → "4月〜3月"
 */
export function getFiscalPeriodLabel(fiscalMonth) {
  const startMonth = (fiscalMonth % 12) + 1;
  return `${startMonth}月〜${fiscalMonth}月`;
}

/**
 * 決算月と日付から年度を判定する
 * ルール: 期末月が属する年 - 1 = 年度
 * 例: fiscalMonth=3（3月決算）
 *   2025-04-01 → 2025年度（2026年3月期）
 *   2026-02-15 → 2025年度（2026年3月期）
 *   2026-03-31 → 2025年度（2026年3月期）
 *   2026-04-01 → 2026年度（2027年3月期）
 */
export function getFiscalYear(fiscalMonth, date = new Date()) {
  const d = typeof date === "string" ? new Date(date) : date;
  const month = d.getMonth() + 1; // 1-12
  const year = d.getFullYear();
  // 期首月（決算月の翌月）以降なら当年度、それ以前なら前年度
  const startMonth = (fiscalMonth % 12) + 1;
  if (startMonth === 1) return year; // 12月決算 → 1月始まり
  return month >= startMonth ? year : year - 1;
}

/**
 * 年度の表示ラベルを生成する
 * 例: getFiscalYearLabel(3, 2025) → "2025年度（2026年3月期）"
 */
export function getFiscalYearLabel(fiscalMonth, fy) {
  const endYear = fiscalMonth <= 3 ? fy + 1 : fy; // 1-3月決算は翌年
  return `${fy}年度（${endYear}年${fiscalMonth}月期）`;
}

export function SettingsProvider({ children }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);

  // Firestoreから設定を読み込む
  useEffect(() => {
    if (!user) {
      setSettingsLoading(false);
      return;
    }
    (async () => {
      try {
        const data = await fetchSettings();
        if (data) {
          setSettings((prev) => ({ ...prev, ...data }));
        }
      } catch (e) {
        console.error("設定の読み込みに失敗:", e);
      }
      setSettingsLoading(false);
    })();
  }, [user]);

  // 設定を保存する
  const saveSettings = useCallback(async (newSettings) => {
    const merged = { ...settings, ...newSettings };
    // updatedAtはfirestore側で付与するので除外
    const { updatedAt, ...toSave } = merged;
    try {
      await saveSettingsDoc(toSave);
      setSettings(merged);
      return true;
    } catch (e) {
      console.error("設定の保存に失敗:", e);
      return false;
    }
  }, [settings]);

  // 決算月に基づく月順
  const fiscalMonths = getFiscalMonths(settings.fiscalMonth);

  return (
    <SettingsContext.Provider value={{ settings, settingsLoading, saveSettings, fiscalMonths }}>
      {children}
    </SettingsContext.Provider>
  );
}

// 銀行名マッピングテーブル
// CSV略称 → 正式名称、表示カラー

export const BANK_MAP = {
  "みなと":   "みなと銀行",
  "公庫明石": "日本政策金融公庫 明石支店",
  "公庫中小": "日本政策金融公庫 中小企業事業",
  "但馬":     "但馬銀行",
  "尼信":     "尼崎信用金庫",
  "日新":     "日新信用金庫",
  "姫信":     "姫路信用金庫",
  "兵信":     "兵庫信用金庫",
  "播信":     "播州信用金庫",
  "中国":     "中国銀行",
  "合同銀行": "山陰合同銀行",
  "山陰合同": "山陰合同銀行",
};

// 正式名称 → 表示カラー
export const BANK_COLORS = {
  "みなと銀行":                  "#5b8def",
  "日本政策金融公庫 明石支店":     "#9b7cf6",
  "日本政策金融公庫 中小企業事業": "#9b7cf6",
  "但馬銀行":                    "#e5a83a",
  "尼崎信用金庫":                "#e55b5b",
  "日新信用金庫":                "#ff8c69",
  "姫路信用金庫":                "#22c994",
  "兵庫信用金庫":                "#69d2e7",
  "播州信用金庫":                "#f0c674",
  "中国銀行":                    "#c397e6",
  "山陰合同銀行":                "#4ecdc4",
};

/**
 * CSV略称から正式銀行名を取得する
 * マッピングに存在しない場合は略称をそのまま返す
 */
export function resolveBankName(shortName) {
  if (!shortName) return "";
  const trimmed = shortName.trim();
  return BANK_MAP[trimmed] || trimmed;
}

/**
 * 銀行名から表示カラーを取得する
 * 正式名でもCSV略称でも取得可能
 */
export function getBankColor(name) {
  if (!name) return "#5b8def";
  const resolved = BANK_MAP[name] || name;
  return BANK_COLORS[resolved] || "#5b8def";
}

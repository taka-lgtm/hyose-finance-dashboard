// 和暦→西暦変換ユーティリティ

// 元号の基準年（元号の年数 + offset = 西暦）
const ERA_OFFSETS = {
  R: 2018, // 令和: R1 = 2019
  H: 1988, // 平成: H1 = 1989
  S: 1925, // 昭和: S1 = 1926
  T: 1911, // 大正: T1 = 1912
};

/**
 * 和暦文字列を西暦 "YYYY-MM-DD" に変換する
 * 対応フォーマット:
 *   "R6.2.29"    → "2024-02-29"
 *   "R7.4.28"    → "2025-04-28"
 *   "R22.12.17"  → "2040-12-17"
 *   "令和6年2月29日" → "2024-02-29"
 * 変換不能な場合は元の文字列をそのまま返す
 */
export function warekiToSeireki(str) {
  if (!str || typeof str !== "string") return "";
  const s = str.trim().replace(/～$/, "");

  // パターン1: "R6.2.29" 形式（アルファベット元号 + ドット区切り）
  const m1 = s.match(/^([RHST])(\d{1,2})\.(\d{1,2})\.(\d{1,2})$/);
  if (m1) {
    const offset = ERA_OFFSETS[m1[1]];
    if (offset == null) return str;
    const y = offset + Number(m1[2]);
    return `${y}-${m1[3].padStart(2, "0")}-${m1[4].padStart(2, "0")}`;
  }

  // パターン2: "令和6年2月29日" 形式（漢字元号）
  const eraMap = { "令和": "R", "平成": "H", "昭和": "S", "大正": "T" };
  const m2 = s.match(/^(令和|平成|昭和|大正)(\d{1,2})年(\d{1,2})月(\d{1,2})日$/);
  if (m2) {
    const offset = ERA_OFFSETS[eraMap[m2[1]]];
    if (offset == null) return str;
    const y = offset + Number(m2[2]);
    return `${y}-${m2[3].padStart(2, "0")}-${m2[4].padStart(2, "0")}`;
  }

  // 変換不能 → 元の文字列を返す
  return str;
}

/**
 * 引落日文字列から日（数値）を抽出する
 * 対応フォーマット:
 *   "31日"        → 31
 *   "15日"        → 15
 *   "R7.1.15～"   → 15  （日付部分の日を抽出）
 *   "R4.10.17～"  → 17
 *   "R7.1.15"     → 15
 * 抽出不能な場合は null を返す
 */
export function parseDebitDay(str) {
  if (!str || typeof str !== "string") return null;
  const s = str.trim().replace(/～$/, "");

  // パターン1: "31日" / "15日"
  const m1 = s.match(/^(\d{1,2})日$/);
  if (m1) return Number(m1[1]);

  // パターン2: 和暦日付 → 日の部分を抽出
  const m2 = s.match(/[RHST]\d{1,2}\.\d{1,2}\.(\d{1,2})$/);
  if (m2) return Number(m2[1]);

  return null;
}

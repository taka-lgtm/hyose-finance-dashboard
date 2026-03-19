// ── マネーフォワード月次推移CSV パーサー ──
// Shift-JIS エンコードの CSV をブラウザ上でパースし、資金繰りデータを生成する

// 月ヘッダーの順序（3月決算: 4月〜3月）
const MONTH_ORDER = ["4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "1月", "2月", "3月"];

/**
 * Shift-JIS の CSV ファイルを UTF-8 テキストとしてデコードする
 */
function decodeShiftJIS(arrayBuffer) {
  const decoder = new TextDecoder("shift_jis");
  return decoder.decode(arrayBuffer);
}

/**
 * CSV行をパースする（ダブルクォート対応）
 */
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

/**
 * CSV テキストを行の配列にパースする
 */
function parseCSVRows(text) {
  return text.split(/\r?\n/).filter((l) => l.trim()).map(parseCSVLine);
}

/**
 * ヘッダー行から月カラムのインデックスマッピングを取得する
 */
function getMonthColumns(headerRow) {
  const map = {};
  headerRow.forEach((cell, idx) => {
    const trimmed = cell.trim();
    if (MONTH_ORDER.includes(trimmed)) {
      map[trimmed] = idx;
    }
  });
  return map;
}

/**
 * セルの値を数値に変換する（カンマ除去、空文字→0）
 */
function toNum(val) {
  if (!val || val.trim() === "") return 0;
  return Number(val.replace(/,/g, "")) || 0;
}

/**
 * 行から月別データを抽出する
 */
function extractMonthlyValues(row, monthCols) {
  const values = {};
  for (const [month, idx] of Object.entries(monthCols)) {
    values[month] = toNum(row[idx]);
  }
  return values;
}

/**
 * BS月次推移CSVから月末現金残高（現金+普通預金+定期預金）を抽出する
 * @param {ArrayBuffer} buffer - Shift-JIS CSV ファイルのバッファ
 * @returns {{ months: string[], cashBalances: number[] }} 月別の現金残高（円単位）
 */
export function parseBSMonthly(buffer) {
  const text = decodeShiftJIS(buffer);
  const rows = parseCSVRows(text);
  if (rows.length < 2) throw new Error("BSデータが不足しています");

  const header = rows[0];
  const monthCols = getMonthColumns(header);

  // 現金・普通預金・定期預金の小計行を探す
  // CSVの構造: col[0]=セクション名, col[1]=勘定科目, col[2]=補助科目
  // 小計行: col[0]="", col[1]="現金"等, col[2]=""
  const targets = ["現金", "普通預金", "定期預金"];
  const found = {};

  for (const row of rows) {
    const col0 = (row[0] || "").trim();
    const col1 = (row[1] || "").trim();
    const col2 = (row[2] || "").trim();

    if (col0 === "" && targets.includes(col1) && col2 === "") {
      found[col1] = extractMonthlyValues(row, monthCols);
    }
  }

  const months = MONTH_ORDER.filter((m) => monthCols[m] !== undefined);
  const cashBalances = months.map((m) =>
    targets.reduce((sum, t) => sum + (found[t]?.[m] || 0), 0)
  );

  return { months, cashBalances };
}

/**
 * PL月次推移CSVから売上高合計・売上原価合計・販管費合計を抽出する
 * 販管費合計行がないため、販管費セクションの個別科目行を合算する
 * @param {ArrayBuffer} buffer - Shift-JIS CSV ファイルのバッファ
 * @returns {{ months: string[], sales: number[], cogs: number[], sgaExpenses: number[] }}
 */
export function parsePLMonthly(buffer) {
  const text = decodeShiftJIS(buffer);
  const rows = parseCSVRows(text);
  if (rows.length < 2) throw new Error("PLデータが不足しています");

  const header = rows[0];
  const monthCols = getMonthColumns(header);

  // 合計行の抽出
  let salesData = null;
  let cogsData = null;

  // 販管費セクションの個別科目を合算するためのフラグ
  let inSGA = false;
  const sgaMonthly = {};
  for (const m of MONTH_ORDER) {
    if (monthCols[m] !== undefined) sgaMonthly[m] = 0;
  }

  for (const row of rows) {
    const col0 = (row[0] || "").trim();
    const col1 = (row[1] || "").trim();
    const col2 = (row[2] || "").trim();

    // セクションヘッダー検出
    if (col0 === "売上高合計") {
      salesData = extractMonthlyValues(row, monthCols);
      continue;
    }
    if (col0 === "売上原価合計") {
      cogsData = extractMonthlyValues(row, monthCols);
      continue;
    }

    // 「販売費及び一般管理費」セクションの開始
    if (col0 === "販売費及び一般管理費") {
      inSGA = true;
      continue;
    }

    // 販管費セクション終了（次のセクションヘッダーが来たら）
    // col0 が空でない行（セクションヘッダーや合計行）が来たら販管費セクション終了
    if (inSGA && col0 !== "") {
      inSGA = false;
      continue;
    }

    // 販管費セクション内の勘定科目行（col[1]が科目名、col[2]が空 = 小計行）を合算
    if (inSGA && col1 !== "" && col2 === "") {
      for (const [month, idx] of Object.entries(monthCols)) {
        sgaMonthly[month] += toNum(row[idx]);
      }
    }
  }

  if (!salesData) throw new Error("売上高合計が見つかりません");
  if (!cogsData) throw new Error("売上原価合計が見つかりません");

  const months = MONTH_ORDER.filter((m) => monthCols[m] !== undefined);
  const sales = months.map((m) => salesData[m] || 0);
  const cogs = months.map((m) => cogsData[m] || 0);
  const sgaExpenses = months.map((m) => sgaMonthly[m] || 0);

  return { months, sales, cogs, sgaExpenses };
}

/**
 * BS・PLの月次推移CSVから資金繰りデータを生成する
 * @param {ArrayBuffer} bsBuffer - BS CSV
 * @param {ArrayBuffer} plBuffer - PL CSV
 * @returns {Array<{m: string, 入金: number, 出金: number, 残高: number, 予算残高: number}>}
 *   金額は万円単位
 */
export function generateCashFlowData(bsBuffer, plBuffer) {
  const bs = parseBSMonthly(bsBuffer);
  const pl = parsePLMonthly(plBuffer);

  // 両方に共通する月のみ使用
  const months = MONTH_ORDER.filter(
    (m) => bs.months.includes(m) && pl.months.includes(m)
  );

  return months.map((m) => {
    const bsIdx = bs.months.indexOf(m);
    const plIdx = pl.months.indexOf(m);

    // 万円単位に変換（四捨五入）
    const 残高 = Math.round(bs.cashBalances[bsIdx] / 10000);
    const 入金 = Math.round(pl.sales[plIdx] / 10000);
    // 出金 = 売上原価合計 + 販売費及び一般管理費合計
    const 出金 = Math.round((pl.cogs[plIdx] + pl.sgaExpenses[plIdx]) / 10000);

    return { m, 入金, 出金, 残高, 予算残高: 残高 };
  });
}

/**
 * ファイルを ArrayBuffer として読み込む
 */
export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("ファイル読み込みに失敗しました"));
    reader.readAsArrayBuffer(file);
  });
}

// 融資の月別残高を借入条件から自動計算するユーティリティ

/**
 * 投影月ラベルを生成（翌月から numMonths ヶ月分）
 * 例: 現在2026-03 → ["2026/04", "2026/05", ..., "2027/03"]
 */
export function getProjectionLabels(numMonths = 12) {
  const now = new Date();
  const labels = [];
  for (let i = 1; i <= numMonths; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    labels.push(`${y}/${m}`);
  }
  return labels;
}

/**
 * 据置期間の終了年月を算出（"YYYY/MM" 形式）
 * 据置なしまたはstart未設定の場合は null
 */
function getGraceEndYM(loan) {
  if (!loan.grace || !loan.start) return null;
  const start = new Date(loan.start);
  if (isNaN(start.getTime())) return null;
  start.setMonth(start.getMonth() + loan.grace);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  return `${y}/${m}`;
}

/**
 * endDate を "YYYY/MM" 形式に変換
 */
function toYM(dateStr) {
  if (!dateStr) return "";
  return dateStr.slice(0, 7).replace("-", "/");
}

/**
 * 1件の融資の月別残高を計算
 * @param {Object} loan - ローンオブジェクト
 * @param {string[]} labels - 投影月ラベル配列 ["2026/04", ...]
 * @returns {number[]} 月別残高配列（円単位）
 */
export function calcMonthlyProjections(loan, labels) {
  const bal0 = loan.balance || 0;

  // 当座貸越: 返済スケジュールなし → 残高一定
  if (loan.category === "当座貸越") {
    return labels.map(() => bal0);
  }

  // 短期（一括返済）: 期限月まで残高一定、翌月から0
  if (loan.category === "短期" || loan.method === "一括返済") {
    const endYM = toYM(loan.endDate);
    return labels.map((label) => (endYM && label > endYM) ? 0 : bal0);
  }

  // 長期: 据置判定 + 月返済額で逓減
  const graceEnd = getGraceEndYM(loan);
  const monthly = loan.monthly || 0;
  const balances = [];
  let bal = bal0;

  for (const label of labels) {
    if (graceEnd && label < graceEnd) {
      // 据置中 → 残高変動なし
      balances.push(bal);
    } else {
      // 返済月 → 月返済額を差し引く
      bal = Math.max(0, bal - monthly);
      balances.push(bal);
    }
  }

  return balances;
}

/**
 * 全融資の月別残高を一括計算
 * @param {Object[]} loans - ローン配列
 * @param {number} numMonths - 投影月数（デフォルト12）
 * @returns {{ labels, loanData, totals, bankData }}
 */
export function calcAllProjections(loans, numMonths = 12) {
  const labels = getProjectionLabels(numMonths);

  const loanData = loans.map((l) => ({
    ...l,
    balances: calcMonthlyProjections(l, labels),
  }));

  // 全融資合計
  const totals = labels.map((_, i) =>
    loanData.reduce((s, l) => s + l.balances[i], 0)
  );

  // 銀行別合計
  const bankNames = [...new Set(loans.map((l) => l.bank))];
  const bankData = bankNames.map((bank) => {
    const bankLoans = loanData.filter((l) => l.bank === bank);
    const balances = labels.map((_, i) =>
      bankLoans.reduce((s, l) => s + l.balances[i], 0)
    );
    return { bank, balances };
  });

  return { labels, loanData, totals, bankData };
}

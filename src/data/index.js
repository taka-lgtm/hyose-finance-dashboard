// ── Financial Data ──
export const YEARS = ["2021", "2022", "2023", "2024", "2025"];
export const MONTHS = ["4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "1月", "2月", "3月"];

export const PL = [
  { y: "2021", 売上高: 14200, 売上原価: 11000, 売上総利益: 3200, 販管費: 1800, 営業利益: 1400, 経常利益: 1250, 当期純利益: 800, 予算売上: 14600, 予算営業利益: 1450 },
  { y: "2022", 売上高: 15800, 売上原価: 12100, 売上総利益: 3700, 販管費: 1950, 営業利益: 1750, 経常利益: 1600, 当期純利益: 1050, 予算売上: 16000, 予算営業利益: 1720 },
  { y: "2023", 売上高: 17100, 売上原価: 13000, 売上総利益: 4100, 販管費: 2100, 営業利益: 2000, 経常利益: 1850, 当期純利益: 1250, 予算売上: 17500, 予算営業利益: 1980 },
  { y: "2024", 売上高: 18300, 売上原価: 13800, 売上総利益: 4500, 販管費: 2250, 営業利益: 2250, 経常利益: 2100, 当期純利益: 1450, 予算売上: 19000, 予算営業利益: 2300 },
  { y: "2025", 売上高: 19600, 売上原価: 14700, 売上総利益: 4900, 販管費: 2400, 営業利益: 2500, 経常利益: 2350, 当期純利益: 1650, 予算売上: 20500, 予算営業利益: 2700 },
];

export const BS = [
  { y: "2021", 流動資産: 18000, 固定資産: 32000, 資産合計: 50000, 流動負債: 12000, 固定負債: 22000, 純資産: 16000, 棚卸資産: 6400, 現預金: 4200 },
  { y: "2022", 流動資産: 20500, 固定資産: 31000, 資産合計: 51500, 流動負債: 11500, 固定負債: 21000, 純資産: 19000, 棚卸資産: 7200, 現預金: 4700 },
  { y: "2023", 流動資産: 23000, 固定資産: 30000, 資産合計: 53000, 流動負債: 11000, 固定負債: 20000, 純資産: 22000, 棚卸資産: 8100, 現預金: 5200 },
  { y: "2024", 流動資産: 25500, 固定資産: 29000, 資産合計: 54500, 流動負債: 10500, 固定負債: 19000, 純資産: 25000, 棚卸資産: 8600, 現預金: 5900 },
  { y: "2025", 流動資産: 28000, 固定資産: 28500, 資産合計: 56500, 流動負債: 10000, 固定負債: 18000, 純資産: 28500, 棚卸資産: 9100, 現預金: 6400 },
];

export const CF = MONTHS.map((m, i) => ({
  m,
  入金: 1800 + ((i * 37 + 53) % 400),
  出金: 1500 + ((i * 29 + 71) % 300),
  残高: 5000 + i * 120 + ((i * 43) % 200),
  予算残高: 5400 + i * 90,
}));

export const BUDGET_MONTHLY = MONTHS.map((m, i) => {
  const sb = 1540 + (i * 32) + (i % 3) * 18;
  const sa = sb + ((i % 4) - 1) * 55 + (i > 7 ? 35 : 0);
  const gb = Math.round(sb * 0.25);
  const ga = Math.round(sa * (0.245 + (i % 3) * 0.004));
  const ob = Math.round(sb * 0.13);
  const oa = Math.round(sa * (0.118 + ((i + 1) % 4) * 0.004));
  return { m, sb, sa, gb, ga, ob, oa };
});

export const INITIAL_LOANS = [
  { bank: "三井住友銀行", name: "設備資金", num: "SM-2023-001", principal: 5000, rate: 1.2, rt: "固定", method: "元金均等", term: 84, grace: 6, start: "2023-04-01", collateral: "不動産担保", balance: 3850, monthly: 62 },
  { bank: "三井住友銀行", name: "運転資金", num: "SM-2024-002", principal: 3000, rate: 1.5, rt: "固定", method: "元利均等", term: 60, grace: 0, start: "2024-01-15", collateral: "保証協会", balance: 2420, monthly: 53 },
  { bank: "みなと銀行", name: "車両購入資金", num: "MN-2022-005", principal: 8000, rate: 1.8, rt: "変動", method: "元金均等", term: 120, grace: 0, start: "2022-07-01", collateral: "不動産担保", balance: 5400, monthly: 78 },
  { bank: "みなと銀行", name: "設備資金②", num: "MN-2024-008", principal: 2000, rate: 1.6, rt: "固定", method: "元金均等", term: 60, grace: 3, start: "2024-06-01", collateral: "保証協会", balance: 1680, monthly: 35 },
  { bank: "日本政策金融公庫", name: "コロナ特別貸付", num: "JFC-2021-003", principal: 4000, rate: 0.9, rt: "固定", method: "元利均等", term: 120, grace: 24, start: "2021-03-01", collateral: "無担保", balance: 2850, monthly: 38 },
  { bank: "日本政策金融公庫", name: "新事業展開資金", num: "JFC-2023-007", principal: 2500, rate: 1.1, rt: "固定", method: "元金均等", term: 84, grace: 12, start: "2023-09-01", collateral: "無担保", balance: 2000, monthly: 31 },
  { bank: "但馬銀行", name: "運転資金", num: "TJ-2024-001", principal: 1500, rate: 2.0, rt: "変動", method: "元利均等", term: 48, grace: 0, start: "2024-04-01", collateral: "保証協会", balance: 1120, monthly: 34 },
];

export const BANK_COLORS = {
  "三井住友銀行": "#22c994",
  "みなと銀行": "#5b8def",
  "日本政策金融公庫": "#9b7cf6",
  "但馬銀行": "#e5a83a",
};

export const ALERTS = [
  { lv: "bad", title: "3ヶ月後の資金余力が安全水準を下回る可能性", action: "入金前倒し交渉と短期借換え案の比較を今週中に確認", date: "03-18", owner: "経理/社長" },
  { lv: "warn", title: "みなと銀行の変動金利案件が再見直しタイミング", action: "固定化打診か、他行借換えの試算を作成", date: "03-15", owner: "社長" },
  { lv: "warn", title: "在庫回転が鈍化し粗利率の改善幅が縮小", action: "滞留車両上位10台の値付け見直し", date: "03-12", owner: "営業責任者" },
  { lv: "info", title: "銀行提出用パッケージを更新済み", action: "次回面談前に数値コメントを追記", date: "03-10", owner: "経理" },
];

export const REPORTS = [
  { group: "社内会議", title: "月次経営レビュー", desc: "売上、粗利、営業利益、現金残高を1画面で確認。", tag: "定例", status: "最新" },
  { group: "社内会議", title: "予実差異レポート", desc: "予算差異と着地見込みを中心に整理。", tag: "予実", status: "更新済" },
  { group: "銀行対応", title: "金融機関提出パック", desc: "融資残高、返済実績、CF、計画の提出用。", tag: "銀行", status: "出力可" },
  { group: "銀行対応", title: "借換え比較シート", desc: "金利、期間、月返済、担保条件を横断比較。", tag: "借換", status: "要確認" },
  { group: "資金繰り", title: "12ヶ月資金シナリオ", desc: "ベース / 弱気 / 強気ケースの残高推移。", tag: "CF", status: "更新済" },
  { group: "資金繰り", title: "資金ショート対策メモ", desc: "運転資金不足時の打ち手と影響額を整理。", tag: "判断", status: "下書き" },
];

// ── Derived Values ──
export const lastPL = PL[PL.length - 1];
export const prevPL = PL[PL.length - 2];
export const lastBS = BS[BS.length - 1];
export const prevBS = BS[BS.length - 2];

// ── Helper Functions ──
export const M = (n) => (n == null ? "-" : n.toLocaleString() + "万");
export const pct = (a, b) => (b ? ((a - b) / b) * 100 : 0);
export const sgn = (v) => { const n = Number(v); return (n >= 0 ? "+" : "") + n.toFixed(1) + "%"; };
export const lvl = (v, w = -3) => (v < w ? "bd" : v < 0 ? "wr" : "gd");

export function calcLoanDerived(loans) {
  const tBal = loans.reduce((s, l) => s + l.balance, 0);
  const tMon = loans.reduce((s, l) => s + l.monthly, 0);
  const wRate = tBal > 0 ? (loans.reduce((s, l) => s + l.rate * l.balance, 0) / tBal).toFixed(2) : "0.00";
  return { tBal, tMon, wRate };
}

export function calcHealth(loans) {
  const { tMon } = calcLoanDerived(loans);
  const L = lastPL, B = lastBS, P = prevPL;
  const pS = Math.min(100, Math.max(0, (L.営業利益 / L.売上高 * 100) / 15 * 100));
  const sS = Math.min(100, Math.max(0, (B.純資産 / B.資産合計 * 100) / 50 * 100));
  const gS = Math.min(100, Math.max(0, (pct(L.売上高, P.売上高) + 5) / 15 * 100));
  const cS = Math.min(100, Math.max(0, (B.現預金 / (tMon + L.販管費 / 12)) / 4 * 100));
  const t = Math.round(pS * 0.3 + sS * 0.25 + gS * 0.25 + cS * 0.2);
  const grade = t >= 80 ? "A" : t >= 65 ? "B+" : t >= 50 ? "B" : "C";
  return {
    total: t, grade,
    dims: [
      { label: "収益性", val: Math.round(pS), color: "var(--ac)" },
      { label: "安全性", val: Math.round(sS), color: "var(--bl)" },
      { label: "成長性", val: Math.round(gS), color: "var(--pu)" },
      { label: "資金力", val: Math.round(cS), color: "var(--am)" },
    ],
  };
}

// ── Chart Defaults ──
export const chartFont = { family: "'IBM Plex Mono','DM Sans',monospace", size: 10 };
export const chartGrid = { color: "rgba(255,255,255,.04)" };
export const chartLegend = { position: "bottom", labels: { font: chartFont, usePointStyle: true, boxWidth: 7, padding: 14 } };

// ── CSV Export ──
export function exportBalanceCSV(loans, bankFilter) {
  const fl = bankFilter === "all" ? loans : loans.filter((l) => l.bank === bankFilter);
  const projData = fl.map((l) => {
    const months = []; let bal = l.balance;
    for (let i = 0; i < 12; i++) { bal = Math.max(0, bal - l.monthly); months.push(bal); }
    return { ...l, months };
  });
  const projTotals = MONTHS.map((_, i) => projData.reduce((s, l) => s + l.months[i], 0));
  let csv = "\uFEFF融資名,銀行,金利(%),月返済(万円),現在残高(万円)," + MONTHS.join(",") + "\n";
  projData.forEach((l) => { csv += `${l.name},${l.bank},${l.rate},${l.monthly},${l.balance},${l.months.join(",")}\n`; });
  csv += `合計,,,,${fl.reduce((s, l) => s + l.balance, 0)},${projTotals.join(",")}\n`;
  downloadCSV(csv, `返済残高推移表_${new Date().toISOString().slice(0, 10)}.csv`);
}

export function exportSummaryCSV(loans) {
  let csv = "\uFEFF管理番号,融資名,銀行,当初借入(万円),残高(万円),金利(%),金利種別,月返済(万円),返済方式,担保,据置(ヶ月),借入日\n";
  loans.forEach((l) => { csv += `${l.num},${l.name},${l.bank},${l.principal},${l.balance},${l.rate},${l.rt},${l.monthly},${l.method},${l.collateral},${l.grace},${l.start}\n`; });
  downloadCSV(csv, `融資一覧_${new Date().toISOString().slice(0, 10)}.csv`);
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

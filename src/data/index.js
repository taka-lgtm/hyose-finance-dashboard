// ── Financial Data (PL/BS: 万円単位) ──
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

// ── 融資データ（円単位・CSVベースの実データ） ──
// 月別残高推移の月ラベル（長期）
export const PROJ_MONTHS = ["2026/01", "2026/02", "2026/03", "2026/04", "2026/05", "2026/06", "2026/07", "2026/08", "2026/09", "2026/10", "2026/11", "2026/12"];
// 月別残高推移の月ラベル（短期・当座貸越）
export const PROJ_MONTHS_SHORT = ["2025/03", "2025/04", "2025/05", "2025/06", "2025/07", "2025/08", "2025/09", "2025/10", "2025/11", "2025/12", "2026/01", "2026/02"];

export const INITIAL_LOANS = [
  // ── 長期借入 23件 ──
  {
    category: "長期", purpose: "運転", num: "14920-450", name: "運転資金",
    bank: "みなと銀行", bankSeq: 3, start: "2024-02-29", endDate: "2029-02-28", debitDay: 31,
    term: 60, principal: 50000000, balance: 31674000, monthly: 833000,
    rt: "変動", baseRate: 1.25, guaranteeFee: 0, rate: 1.25,
    condition: "P", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "", guaranteePlan: "",
    collateral: "プロパー", method: "元金均等", grace: 0,
    projections: [30841000, 30008000, 29175000, 28342000, 27509000, 26676000, 25843000, 25010000, 24177000, 23344000, 22511000, 21678000],
    notes: "",
  },
  {
    category: "長期", purpose: "運転", num: "19-34565", name: "運転資金",
    bank: "日本政策金融公庫 明石支店", bankSeq: 1, start: "2020-03-31", endDate: "2030-03-15", debitDay: 15,
    term: 120, principal: 30000000, balance: 13965000, monthly: 285000,
    rt: "固定", baseRate: 0.46, guaranteeFee: 1.36, rate: 1.82,
    condition: "P", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "", guaranteePlan: "",
    collateral: "プロパー", method: "元金均等", grace: 0,
    projections: [13680000, 13395000, 13110000, 12825000, 12540000, 12255000, 11970000, 11685000, 11400000, 11115000, 10830000, 10545000],
    notes: "当初3年0.46％、以降1.36％",
  },
  {
    category: "長期", purpose: "運転", num: "511289", name: "運転資金①",
    bank: "日本政策金融公庫 中小企業事業", bankSeq: 1, start: "2022-08-08", endDate: "2037-08-10", debitDay: 10,
    term: 180, principal: 90000000, balance: 70500000, monthly: 500000,
    rt: "固定", baseRate: 0.45, guaranteeFee: 1.35, rate: 1.80,
    condition: "P", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "", guaranteePlan: "",
    collateral: "プロパー", method: "元金均等", grace: 0,
    projections: [70000000, 69500000, 69000000, 68500000, 68000000, 67500000, 67000000, 66500000, 66000000, 65500000, 65000000, 64500000],
    notes: "当初3年0.45％、以降1.35％",
  },
  {
    category: "長期", purpose: "運転", num: "521641", name: "運転資金②",
    bank: "日本政策金融公庫 中小企業事業", bankSeq: 2, start: "2024-04-09", endDate: "2031-04-10", debitDay: 10,
    term: 84, principal: 40000000, balance: 30880000, monthly: 480000,
    rt: "固定", baseRate: 0.30, guaranteeFee: 0, rate: 0.30,
    condition: "P", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "", guaranteePlan: "",
    collateral: "プロパー", method: "元金均等", grace: 0,
    projections: [30400000, 29920000, 29440000, 28960000, 28480000, 28000000, 27520000, 27040000, 26560000, 26080000, 25600000, 25120000],
    notes: "",
  },
  {
    category: "長期", purpose: "運転", num: "528158", name: "運転資金③",
    bank: "日本政策金融公庫 中小企業事業", bankSeq: 3, start: "2025-04-30", endDate: "2032-05-10", debitDay: 10,
    term: 84, principal: 50000000, balance: 46400000, monthly: 480000,
    rt: "固定", baseRate: 0.70, guaranteeFee: 0, rate: 0.70,
    condition: "P", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "", guaranteePlan: "",
    collateral: "プロパー", method: "元金均等", grace: 0,
    projections: [45920000, 45440000, 44960000, 44480000, 44000000, 43520000, 43040000, 42560000, 42080000, 41600000, 41120000, 40640000],
    notes: "",
  },
  {
    category: "長期", purpose: "運転", num: "994299", name: "運転資金",
    bank: "但馬銀行", bankSeq: 2, start: "2025-06-30", endDate: "2030-06-15", debitDay: 15,
    term: 60, principal: 30000000, balance: 27000000, monthly: 119000,
    rt: "固定", baseRate: 1.06, guaranteeFee: 0, rate: 1.06,
    condition: "P", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "", guaranteePlan: "",
    collateral: "プロパー", method: "元金均等", grace: 0,
    projections: [26881000, 26762000, 26643000, 26524000, 26405000, 26286000, 26167000, 26048000, 25929000, 25810000, 25691000, 25572000],
    notes: "2019.12.16～返済",
  },
  {
    category: "長期", purpose: "運転", num: "12", name: "運転資金",
    bank: "尼崎信用金庫", bankSeq: 1, start: "2025-01-09", endDate: "2029-12-15", debitDay: 15,
    term: 60, principal: 20000000, balance: 15992000, monthly: 334000,
    rt: "変動", baseRate: 1.25, guaranteeFee: 0, rate: 1.25,
    condition: "P", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "", guaranteePlan: "",
    collateral: "プロパー", method: "元金均等", grace: 0,
    projections: [15658000, 15324000, 14990000, 14656000, 14322000, 13988000, 13654000, 13320000, 12986000, 12652000, 12318000, 11984000],
    notes: "",
  },
  {
    category: "長期", purpose: "運転", num: "11073", name: "運転資金①",
    bank: "日新信用金庫", bankSeq: 1, start: "2021-06-25", endDate: "2026-06-15", debitDay: 15,
    term: 60, principal: 20000000, balance: 1964000, monthly: 334000,
    rt: "変動", baseRate: 1.00, guaranteeFee: 0, rate: 1.00,
    condition: "P", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "", guaranteePlan: "",
    collateral: "プロパー", method: "元金均等", grace: 0,
    projections: [1630000, 1296000, 962000, 628000, 294000, -40000, -374000, -708000, -1042000, -1376000, -1710000, -2044000],
    notes: "2017.4.17～返済開始",
  },
  {
    category: "長期", purpose: "運転", num: "11172", name: "運転資金②",
    bank: "日新信用金庫", bankSeq: 2, start: "2022-04-06", endDate: "2032-03-15", debitDay: 15,
    term: 120, principal: 31000000, balance: 19345000, monthly: 259000,
    rt: "変動", baseRate: 0.80, guaranteeFee: 0, rate: 0.80,
    condition: "保", guaranteeOrg: "国", guaranteeType: "一般", guaranteeSec: "無担保", guaranteePlan: "伴走特別一般",
    collateral: "保証協会", method: "元金均等", grace: 0,
    projections: [19086000, 18827000, 18568000, 18309000, 18050000, 17791000, 17532000, 17273000, 17014000, 16755000, 16496000, 16237000],
    notes: "",
  },
  {
    category: "長期", purpose: "運転", num: "11173", name: "運転資金③",
    bank: "日新信用金庫", bankSeq: 3, start: "2022-04-06", endDate: "2032-03-15", debitDay: 15,
    term: 120, principal: 9000000, balance: 5625000, monthly: 75000,
    rt: "変動", baseRate: 0.80, guaranteeFee: 0, rate: 0.80,
    condition: "保", guaranteeOrg: "国", guaranteeType: "セーフティ", guaranteeSec: "無担保", guaranteePlan: "伴走特別",
    collateral: "保証協会", method: "元金均等", grace: 0,
    projections: [5550000, 5475000, 5400000, 5325000, 5250000, 5175000, 5100000, 5025000, 4950000, 4875000, 4800000, 4725000],
    notes: "プロパー",
  },
  {
    category: "長期", purpose: "運転", num: "103155", name: "運転資金①",
    bank: "姫路信用金庫", bankSeq: 1, start: "2020-09-30", endDate: "2030-09-15", debitDay: 17,
    term: 120, principal: 20000000, balance: 11810000, monthly: 210000,
    rt: "固定", baseRate: 0.70, guaranteeFee: 0, rate: 0.70,
    condition: "保", guaranteeOrg: "県", guaranteeType: "コロナ", guaranteeSec: "無担保", guaranteePlan: "県経滑保証料応",
    collateral: "保証協会", method: "元金均等", grace: 24,
    projections: [11600000, 11390000, 11180000, 10970000, 10760000, 10550000, 10340000, 10130000, 9920000, 9710000, 9500000, 9290000],
    notes: "返済R4.10.17～ コロナ-利息のみR2.10.15～支払、R4.10.15～21万円返済",
  },
  {
    category: "長期", purpose: "運転", num: "103313", name: "運転資金②",
    bank: "姫路信用金庫", bankSeq: 2, start: "2021-03-25", endDate: "2031-01-15", debitDay: 17,
    term: 95, principal: 30000000, balance: 19440000, monthly: 320000,
    rt: "固定", baseRate: 0.70, guaranteeFee: 0, rate: 0.70,
    condition: "保", guaranteeOrg: "県", guaranteeType: "セーフティ", guaranteeSec: "無担保", guaranteePlan: "県経滑保証料応",
    collateral: "保証協会", method: "元金均等", grace: 25,
    projections: [19120000, 18800000, 18480000, 18160000, 17840000, 17520000, 17200000, 16880000, 16560000, 16240000, 15920000, 15600000],
    notes: "返済R5.4.17～ コロナ3年間利子補給、25ヶ月～117ヶ月32万、118ヶ月～24万円返済",
  },
  {
    category: "長期", purpose: "運転", num: "103312", name: "運転資金③",
    bank: "姫路信用金庫", bankSeq: 3, start: "2021-03-25", endDate: "2031-03-15", debitDay: 15,
    term: 84, principal: 60000000, balance: 44880000, monthly: 720000,
    rt: "固定", baseRate: 0.70, guaranteeFee: 0, rate: 0.70,
    condition: "保", guaranteeOrg: "国", guaranteeType: "コロナ", guaranteeSec: "無担保", guaranteePlan: "県コロナ対応全額",
    collateral: "保証協会", method: "元金均等", grace: 36,
    projections: [44160000, 43440000, 42720000, 42000000, 41280000, 40560000, 39840000, 39120000, 38400000, 37680000, 36960000, 36240000],
    notes: "県コロナ対応全額 保証料￥0 37ヶ月～119ヶ月72万円、120ヶ月目24万円",
  },
  {
    category: "長期", purpose: "運転", num: "103693", name: "運転資金⑤",
    bank: "姫路信用金庫", bankSeq: 5, start: "2022-07-26", endDate: "2032-07-15", debitDay: 15,
    term: 120, principal: 66000000, balance: 43450000, monthly: 550000,
    rt: "変動", baseRate: 0.90, guaranteeFee: 0.48, rate: 1.38,
    condition: "保", guaranteeOrg: "", guaranteeType: "一般", guaranteeSec: "有担保", guaranteePlan: "リードα",
    collateral: "保証協会", method: "元金均等", grace: 0,
    projections: [42900000, 42350000, 41800000, 41250000, 40700000, 40150000, 39600000, 39050000, 38500000, 37950000, 37400000, 36850000],
    notes: "保証料 1,742,400",
  },
  {
    category: "長期", purpose: "運転", num: "104268", name: "運転資金⑥",
    bank: "姫路信用金庫", bankSeq: 6, start: "2024-10-31", endDate: "2034-10-15", debitDay: 15,
    term: 120, principal: 50000000, balance: 44120000, monthly: 420000,
    rt: "変動", baseRate: 0, guaranteeFee: 0, rate: 1.28,
    condition: "保", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "", guaranteePlan: "",
    collateral: "保証協会", method: "元金均等", grace: 0,
    projections: [43700000, 43280000, 42860000, 42440000, 42020000, 41600000, 41180000, 40760000, 40340000, 39920000, 39500000, 39080000],
    notes: "保証料 897,600",
  },
  {
    category: "長期", purpose: "運転", num: "104320", name: "運転資金⑦",
    bank: "姫路信用金庫", bankSeq: 7, start: "2025-02-20", endDate: "2030-02-15", debitDay: 15,
    term: 60, principal: 30000000, balance: 25000000, monthly: 500000,
    rt: "変動", baseRate: 1.62, guaranteeFee: 0, rate: 1.62,
    condition: "P", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "", guaranteePlan: "",
    collateral: "プロパー", method: "元金均等", grace: 0,
    projections: [24500000, 24000000, 23500000, 23000000, 22500000, 22000000, 21500000, 21000000, 20500000, 20000000, 19500000, 19000000],
    notes: "",
  },
  {
    category: "長期", purpose: "運転", num: "600218", name: "運転資金①",
    bank: "兵庫信用金庫", bankSeq: 1, start: "2025-04-01", endDate: "2030-03-15", debitDay: 15,
    term: 60, principal: 30000000, balance: 26000000, monthly: 500000,
    rt: "変動", baseRate: 1.20, guaranteeFee: 0, rate: 1.20,
    condition: "P", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "", guaranteePlan: "",
    collateral: "プロパー", method: "元金均等", grace: 0,
    projections: [25500000, 30000000, 29500000, 29000000, 28500000, 28000000, 27500000, 27000000, 26500000, 26000000, 25500000, 25000000],
    notes: "",
  },
  {
    category: "長期", purpose: "運転", num: "600226", name: "運転資金②",
    bank: "兵庫信用金庫", bankSeq: 2, start: "2025-04-28", endDate: "2035-04-15", debitDay: 15,
    term: 120, principal: 20000000, balance: 20000000, monthly: 239000,
    rt: "変動", baseRate: 1.45, guaranteeFee: 0, rate: 1.45,
    condition: "保", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "", guaranteePlan: "",
    collateral: "保証協会", method: "元金均等", grace: 36,
    projections: [20000000, 20000000, 20000000, 20000000, 20000000, 20000000, 20000000, 20000000, 20000000, 20000000, 20000000, 20000000],
    notes: "返済3年据置",
  },
  {
    category: "長期", purpose: "運転", num: "600227", name: "運転資金③",
    bank: "兵庫信用金庫", bankSeq: 3, start: "2025-04-28", endDate: "2035-04-15", debitDay: 15,
    term: 120, principal: 10000000, balance: 10000000, monthly: 120000,
    rt: "変動", baseRate: 1.45, guaranteeFee: 0, rate: 1.45,
    condition: "保", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "", guaranteePlan: "",
    collateral: "保証協会", method: "元金均等", grace: 36,
    projections: [10000000, 10000000, 10000000, 10000000, 10000000, 10000000, 10000000, 10000000, 10000000, 10000000, 10000000, 10000000],
    notes: "返済3年据置",
  },
  {
    category: "長期", purpose: "運転", num: "600311", name: "運転資金④",
    bank: "兵庫信用金庫", bankSeq: 4, start: "2025-11-10", endDate: "2035-10-15", debitDay: 15,
    term: 120, principal: 50000000, balance: 49166000, monthly: 417000,
    rt: "変動", baseRate: 1.45, guaranteeFee: 0, rate: 1.45,
    condition: "保", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "", guaranteePlan: "",
    collateral: "保証協会", method: "元金均等", grace: 0,
    projections: [48749000, 48332000, 47915000, 47498000, 47081000, 46664000, 46247000, 45830000, 45413000, 44996000, 44579000, 44162000],
    notes: "",
  },
  {
    category: "長期", purpose: "運転", num: "", name: "運転資金",
    bank: "播州信用金庫", bankSeq: 1, start: "2025-04-28", endDate: "2035-04-15", debitDay: 15,
    term: 120, principal: 30000000, balance: 30000000, monthly: 358000,
    rt: "変動", baseRate: 1.45, guaranteeFee: 0, rate: 1.45,
    condition: "保", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "", guaranteePlan: "",
    collateral: "保証協会", method: "元金均等", grace: 36,
    projections: [30000000, 30000000, 30000000, 30000000, 30000000, 30000000, 30000000, 30000000, 30000000, 30000000, 30000000, 30000000],
    notes: "返済3年据置",
  },
  {
    category: "長期", purpose: "運転", num: "71819", name: "運転資金",
    bank: "中国銀行", bankSeq: 1, start: "2025-04-25", endDate: "2030-04-15", debitDay: 15,
    term: 60, principal: 50000000, balance: 43328000, monthly: 834000,
    rt: "変動", baseRate: 1.20, guaranteeFee: 0, rate: 1.20,
    condition: "P", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "", guaranteePlan: "",
    collateral: "プロパー", method: "元金均等", grace: 0,
    projections: [42494000, 50000000, 49166000, 48332000, 47498000, 46664000, 45830000, 44996000, 44162000, 43328000, 42494000, 41660000],
    notes: "",
  },
  {
    category: "長期", purpose: "設備", num: "", name: "設備資金",
    bank: "山陰合同銀行", bankSeq: 1, start: "2025-12-19", endDate: "2040-12-17", debitDay: 15,
    term: 180, principal: 30000000, balance: 30000000, monthly: 167000,
    rt: "変動", baseRate: 1.80, guaranteeFee: 0, rate: 1.80,
    condition: "P", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "土地担保", guaranteePlan: "",
    collateral: "土地担保", method: "元金均等", grace: 0,
    projections: [29833000, 29666000, 29499000, 29332000, 29165000, 28998000, 28831000, 28664000, 28497000, 28330000, 28163000, 27996000],
    notes: "",
  },
  // ── 短期借入 1件 ──
  {
    category: "短期", purpose: "運転", num: "089", name: "短期運転資金",
    bank: "播州信用金庫", bankSeq: 2, start: "2025-09-30", endDate: "2026-03-31", debitDay: 31,
    term: 6, principal: 20000000, balance: 20000000, monthly: 0,
    rt: "変動", baseRate: 1.65, guaranteeFee: 0, rate: 1.65,
    condition: "P", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "", guaranteePlan: "",
    collateral: "プロパー", method: "一括返済", grace: 0,
    projections: [20000000, 20000000, 20000000, 20000000, 20000000, 20000000, 20000000, 20000000, 0, 0, 0, 0],
    notes: "",
  },
  // ── 当座貸越 2枠 ──
  {
    category: "当座貸越", purpose: "", num: "", name: "当座貸越",
    bank: "姫路信用金庫", bankSeq: 0, start: "", endDate: "", debitDay: null,
    term: 0, principal: 20000000, balance: 20000000, monthly: 0,
    rt: "変動", baseRate: 1.437, guaranteeFee: 0, rate: 1.44,
    condition: "P", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "", guaranteePlan: "",
    collateral: "プロパー", method: "", grace: 0,
    projections: [20000000, 20000000, 20000000, 20000000, 20000000, 0, 0, 0, 0, 0, 0, 0],
    notes: "",
  },
  {
    category: "当座貸越", purpose: "", num: "", name: "当座貸越枠",
    bank: "山陰合同銀行", bankSeq: 0, start: "", endDate: "", debitDay: null,
    term: 0, principal: 30000000, balance: 0, monthly: 0,
    rt: "固定", baseRate: 0, guaranteeFee: 0, rate: 0,
    condition: "", guaranteeOrg: "", guaranteeType: "", guaranteeSec: "", guaranteePlan: "",
    collateral: "", method: "", grace: 0,
    projections: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    notes: "",
  },
];

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
// PL/BS用（万円入力）
export const M = (n) => (n == null ? "-" : n.toLocaleString() + "万");
// 融資用（円入力→万円表示）
export const MY = (n) => (n == null ? "-" : Math.round(n / 10000).toLocaleString() + "万");
export const pct = (a, b) => (b ? ((a - b) / b) * 100 : 0);
export const sgn = (v) => { const n = Number(v); return (n >= 0 ? "+" : "") + n.toFixed(1) + "%"; };
export const lvl = (v, w = -3) => (v < w ? "bd" : v < 0 ? "wr" : "gd");

// 融資の集計（円単位）
export function calcLoanDerived(loans) {
  const tBal = loans.reduce((s, l) => s + l.balance, 0);
  const tMon = loans.reduce((s, l) => s + l.monthly, 0);
  const wRate = tBal > 0 ? (loans.reduce((s, l) => s + l.rate * l.balance, 0) / tBal).toFixed(2) : "0.00";
  return { tBal, tMon, wRate };
}

// 経営ヘルススコア（PL/BSは万円、融資は円）
export function calcHealth(loans) {
  const { tMon } = calcLoanDerived(loans);
  const tMonMan = tMon / 10000; // 円→万円
  const L = lastPL, B = lastBS, P = prevPL;
  const pS = Math.min(100, Math.max(0, (L.営業利益 / L.売上高 * 100) / 15 * 100));
  const sS = Math.min(100, Math.max(0, (B.純資産 / B.資産合計 * 100) / 50 * 100));
  const gS = Math.min(100, Math.max(0, (pct(L.売上高, P.売上高) + 5) / 15 * 100));
  const cS = Math.min(100, Math.max(0, (B.現預金 / (tMonMan + L.販管費 / 12)) / 4 * 100));
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

// ── CSV Export（融資データは円単位） ──
export function exportBalanceCSV(loans, bankFilter) {
  const fl = bankFilter === "all" ? loans : loans.filter((l) => l.bank === bankFilter);
  const projData = fl.map((l) => {
    const months = []; let bal = l.balance;
    for (let i = 0; i < 12; i++) { bal = Math.max(0, bal - l.monthly); months.push(bal); }
    return { ...l, months };
  });
  const projTotals = MONTHS.map((_, i) => projData.reduce((s, l) => s + l.months[i], 0));
  let csv = "\uFEFF融資名,銀行,金利(%),月返済(円),現在残高(円)," + MONTHS.join(",") + "\n";
  projData.forEach((l) => { csv += `${l.name},${l.bank},${l.rate},${l.monthly},${l.balance},${l.months.join(",")}\n`; });
  csv += `合計,,,,${fl.reduce((s, l) => s + l.balance, 0)},${projTotals.join(",")}\n`;
  downloadCSV(csv, `返済残高推移表_${new Date().toISOString().slice(0, 10)}.csv`);
}

export function exportSummaryCSV(loans) {
  let csv = "\uFEFF管理番号,融資名,銀行,当初借入(円),残高(円),金利(%),金利種別,月返済(円),返済方式,担保,据置(ヶ月),借入日\n";
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

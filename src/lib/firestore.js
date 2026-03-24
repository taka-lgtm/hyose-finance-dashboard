import { collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "./firebase";

// ═══════════════════════════════
// LOANS
// ═══════════════════════════════

const LOANS_COL = "loans";

export async function fetchLoans() {
  const snap = await getDocs(query(collection(db, LOANS_COL), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addLoanDoc(loan) {
  const docRef = await addDoc(collection(db, LOANS_COL), {
    ...loan,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: docRef.id, ...loan };
}

export async function updateLoanDoc(id, data) {
  await updateDoc(doc(db, LOANS_COL, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteLoanDoc(id) {
  await deleteDoc(doc(db, LOANS_COL, id));
}

// ═══════════════════════════════
// FINANCIAL DATA (PL / BS)
// ═══════════════════════════════

const FIN_COL = "financials";

// Financial data is stored as a single document per type:
//   financials/pl  → { years: [...], data: [...] }
//   financials/bs  → { years: [...], data: [...] }
//   financials/budget → { months: [...], data: [...] }
//   financials/cf  → { months: [...], data: [...] }

export async function fetchFinancialData(type) {
  const snap = await getDocs(collection(db, FIN_COL));
  const result = {};
  snap.docs.forEach((d) => { result[d.id] = d.data(); });
  return type ? result[type] : result;
}

export async function saveFinancialData(type, payload) {
  await setDoc(doc(db, FIN_COL, type), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
}

// ═══════════════════════════════
// LOAN LOGS
// ═══════════════════════════════

const LOGS_COL = "loanLogs";

export async function addLoanLog(entry) {
  await addDoc(collection(db, LOGS_COL), {
    ...entry,
    createdAt: serverTimestamp(),
  });
}

export async function fetchLoanLogs(limit = 100) {
  const snap = await getDocs(query(collection(db, LOGS_COL), orderBy("createdAt", "desc")));
  return snap.docs.slice(0, limit).map((d) => ({ id: d.id, ...d.data() }));
}

// ═══════════════════════════════
// SETTINGS（会社設定）
// ═══════════════════════════════

const SETTINGS_DOC = "settings";
const SETTINGS_ID = "general";

export async function fetchSettings() {
  const snap = await getDocs(collection(db, SETTINGS_DOC));
  const result = {};
  snap.docs.forEach((d) => { result[d.id] = d.data(); });
  return result[SETTINGS_ID] || null;
}

export async function saveSettings(data) {
  await setDoc(doc(db, SETTINGS_DOC, SETTINGS_ID), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// ═══════════════════════════════
// BUDGET / MONTHLY PL（予実管理用）
// ═══════════════════════════════

// 月次予算の保存
export async function saveBudget(data) {
  await saveFinancialData("budget", { data });
}

// 月次PL実績の保存
export async function saveMonthlyPL(data) {
  await saveFinancialData("monthlyPL", { data });
}

// ═══════════════════════════════
// ACTIONS（意思決定エンジン用）
// ═══════════════════════════════

const ACTIONS_COL = "actions";

export async function fetchActions() {
  const q = query(collection(db, ACTIONS_COL), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addActionDoc(action) {
  const ref = await addDoc(collection(db, ACTIONS_COL), { ...action, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return { id: ref.id, ...action };
}

export async function updateActionDoc(id, data) {
  await updateDoc(doc(db, ACTIONS_COL, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteActionDoc(id) {
  await deleteDoc(doc(db, ACTIONS_COL, id));
}

// ═══════════════════════════════
// SEED: Initialize Firestore with default data
// ═══════════════════════════════

export async function seedLoansIfEmpty(defaultLoans) {
  const existing = await fetchLoans();
  if (existing.length > 0) return existing;

  // Firestoreにデータがなければデフォルトで初期化
  const seeded = [];
  for (const loan of defaultLoans) {
    const saved = await addLoanDoc(loan);
    seeded.push(saved);
  }
  return seeded;
}

// ═══════════════════════════════
// 試算表PDF（月次）
// ═══════════════════════════════

const TB_PDF_DOC = "trialBalancePDFs";

/**
 * 試算表PDFをアップロードし、メタデータをFirestoreに保存する
 * @param {string} fy - 年度（例: "2025"）
 * @param {string} month - 月名（例: "4月"）
 * @param {File} file - PDFファイル
 * @returns {{ url: string, fileName: string, uploadedAt: string }}
 */
export async function uploadTrialBalancePDF(fy, month, file) {
  // Firebase Storageにアップロード
  const path = `trialBalancePDFs/${fy}/${month}.pdf`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  // Firestoreにメタデータを保存
  const docRef = doc(db, FIN_COL, TB_PDF_DOC);
  const snap = await getDoc(docRef);
  const existing = snap.exists() ? snap.data() : {};
  const fyData = existing[fy] || {};
  fyData[month] = { url, fileName: file.name, uploadedAt: new Date().toISOString() };
  await setDoc(docRef, { ...existing, [fy]: fyData, updatedAt: serverTimestamp() });

  return fyData[month];
}

/**
 * 試算表PDFのメタデータを取得する
 * @returns {object|null} { "2025": { "4月": { url, fileName, uploadedAt }, ... }, ... }
 */
export async function fetchTrialBalancePDFs() {
  const docRef = doc(db, FIN_COL, TB_PDF_DOC);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  const { updatedAt, ...data } = snap.data();
  return data;
}

/**
 * 試算表PDFを削除する
 * @param {string} fy - 年度
 * @param {string} month - 月名
 */
export async function deleteTrialBalancePDF(fy, month) {
  // Storageから削除
  try {
    const path = `trialBalancePDFs/${fy}/${month}.pdf`;
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  } catch (_) { /* ファイルが存在しない場合は無視 */ }

  // Firestoreメタデータを更新
  const docRef = doc(db, FIN_COL, TB_PDF_DOC);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return;
  const data = snap.data();
  if (data[fy]) {
    delete data[fy][month];
    await setDoc(docRef, { ...data, updatedAt: serverTimestamp() });
  }
}

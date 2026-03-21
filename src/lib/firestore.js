import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";

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

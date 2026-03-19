import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { signInWithPopup, signOut, onAuthStateChanged, browserLocalPersistence, setPersistence } from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, googleProvider, ALLOWED_DOMAIN, SESSION_MAX_AGE } from "../lib/firebase";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const LOGIN_TS_KEY = "hyose_login_ts";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);        // Firebase user
  const [userDoc, setUserDoc] = useState(null);   // Firestore user doc
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Listen to auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Check session age
        const loginTs = localStorage.getItem(LOGIN_TS_KEY);
        if (loginTs && Date.now() - Number(loginTs) > SESSION_MAX_AGE) {
          await signOut(auth);
          localStorage.removeItem(LOGIN_TS_KEY);
          setUser(null);
          setUserDoc(null);
          setLoading(false);
          return;
        }

        // Check domain
        const email = firebaseUser.email || "";
        const domain = email.split("@")[1];
        if (domain !== ALLOWED_DOMAIN) {
          await signOut(auth);
          setError(`@${ALLOWED_DOMAIN} のアカウントのみログインできます。\n現在のアカウント: ${email}`);
          setUser(null);
          setUserDoc(null);
          setLoading(false);
          return;
        }

        // Fetch or create user doc in Firestore
        try {
          const userRef = doc(db, "users", firebaseUser.uid);
          const snap = await getDoc(userRef);

          if (snap.exists()) {
            const data = snap.data();
            // Check if user is disabled by admin
            if (data.disabled) {
              await signOut(auth);
              setError("このアカウントは無効化されています。管理者に連絡してください。");
              setUser(null);
              setUserDoc(null);
              setLoading(false);
              return;
            }
            // Update last login
            await updateDoc(userRef, { lastLogin: serverTimestamp(), displayName: firebaseUser.displayName, photoURL: firebaseUser.photoURL });
            setUserDoc({ id: firebaseUser.uid, ...data, displayName: firebaseUser.displayName, photoURL: firebaseUser.photoURL });
          } else {
            // First user becomes admin, rest are regular users
            const usersSnap = await getDocs(collection(db, "users"));
            const isFirstUser = usersSnap.empty;
            const newDoc = {
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              role: isFirstUser ? "admin" : "member",
              disabled: false,
              createdAt: serverTimestamp(),
              lastLogin: serverTimestamp(),
            };
            await setDoc(userRef, newDoc);
            setUserDoc({ id: firebaseUser.uid, ...newDoc });
          }

          setUser(firebaseUser);
          setError(null);
        } catch (e) {
          console.error("Firestore error:", e);
          // If Firestore fails (e.g. no setup yet), still allow login with basic info
          setUser(firebaseUser);
          setUserDoc({ id: firebaseUser.uid, email: firebaseUser.email, displayName: firebaseUser.displayName, role: "admin", disabled: false });
          setError(null);
        }
      } else {
        setUser(null);
        setUserDoc(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const login = useCallback(async () => {
    try {
      setError(null);
      await setPersistence(auth, browserLocalPersistence);
      // Restrict to specific domain in Google popup
      googleProvider.setCustomParameters({ hd: ALLOWED_DOMAIN });
      await signInWithPopup(auth, googleProvider);
      localStorage.setItem(LOGIN_TS_KEY, String(Date.now()));
    } catch (e) {
      if (e.code === "auth/popup-closed-by-user") return;
      setError("ログインに失敗しました: " + e.message);
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    localStorage.removeItem(LOGIN_TS_KEY);
    setUser(null);
    setUserDoc(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, userDoc, loading, error, login, logout, ALLOWED_DOMAIN }}>
      {children}
    </AuthContext.Provider>
  );
}

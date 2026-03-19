import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { reseedLoans } from "../lib/firestore";
import { INITIAL_LOANS } from "../data";

// TODO: 再シード完了後にこのコンポーネントごと削除
function ReseedButton() {
  const [status, setStatus] = useState("idle"); // idle | confirm | running | done | error
  const [msg, setMsg] = useState("");

  const handleClick = async () => {
    if (status === "idle") {
      setStatus("confirm");
      return;
    }
    if (status === "confirm") {
      setStatus("running");
      setMsg("削除中 → 再シード中...");
      try {
        const result = await reseedLoans(INITIAL_LOANS);
        setStatus("done");
        setMsg(`完了: ${result.length}件を登録しました。ページをリロードしてください。`);
      } catch (e) {
        setStatus("error");
        setMsg("エラー: " + e.message);
      }
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <button
        className="btn"
        style={{
          padding: "8px 20px",
          borderColor: "var(--rd)", color: status === "confirm" ? "#fff" : "var(--rd)",
          background: status === "confirm" ? "var(--rd)" : "transparent",
          fontSize: 12,
        }}
        onClick={handleClick}
        disabled={status === "running" || status === "done"}
      >
        {status === "idle" && "融資データを再シード"}
        {status === "confirm" && "本当に実行する（クリックで確定）"}
        {status === "running" && "実行中..."}
        {status === "done" && "完了"}
        {status === "error" && "エラー（再試行可）"}
      </button>
      {msg && <span style={{ fontSize: 11, color: status === "error" ? "var(--rd)" : "var(--ac)" }}>{msg}</span>}
    </div>
  );
}

export default function Users() {
  const { userDoc } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = userDoc?.role === "admin";

  const fetchUsers = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, "users"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Sort: admin first, then by last login
      list.sort((a, b) => {
        if (a.role === "admin" && b.role !== "admin") return -1;
        if (b.role === "admin" && a.role !== "admin") return 1;
        const aTime = a.lastLogin?.seconds || 0;
        const bTime = b.lastLogin?.seconds || 0;
        return bTime - aTime;
      });
      setUsers(list);
    } catch (e) {
      console.error("Failed to fetch users:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const toggleUser = async (userId, currentDisabled) => {
    if (!isAdmin) return;
    if (userId === userDoc.id) return alert("自分自身は無効化できません");
    try {
      await updateDoc(doc(db, "users", userId), { disabled: !currentDisabled });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, disabled: !currentDisabled } : u));
    } catch (e) {
      alert("更新に失敗しました: " + e.message);
    }
  };

  const toggleRole = async (userId, currentRole) => {
    if (!isAdmin) return;
    if (userId === userDoc.id) return alert("自分自身のロールは変更できません");
    const newRole = currentRole === "admin" ? "member" : "admin";
    try {
      await updateDoc(doc(db, "users", userId), { role: newRole });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
    } catch (e) {
      alert("更新に失敗しました: " + e.message);
    }
  };

  const formatDate = (ts) => {
    if (!ts?.seconds) return "-";
    return new Date(ts.seconds * 1000).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="page"><div className="g">
      <div className="ph">
        <div><h2>ユーザー管理</h2><p>Google Workspaceアカウントでログインしたユーザーの一覧と権限管理。</p></div>
        <div className="pa">
          <button className="btn" onClick={fetchUsers}>更新</button>
        </div>
      </div>

      <div className="g3">
        <div className="k hero">
          <div className="k-label">登録ユーザー数</div>
          <div className="k-val">{users.length}</div>
          <div className="k-ctx">Google Workspaceでログインした全ユーザー</div>
        </div>
        <div className="k">
          <div className="k-label">管理者</div>
          <div className="k-val">{users.filter((u) => u.role === "admin").length}名</div>
          <div className="k-ctx">ユーザー管理の権限あり</div>
        </div>
        <div className="k">
          <div className="k-label">有効 / 無効</div>
          <div className="k-val">{users.filter((u) => !u.disabled).length} / {users.filter((u) => u.disabled).length}</div>
          <div className="k-ctx">無効化されたユーザーはログイン不可</div>
        </div>
      </div>

      {!isAdmin && (
        <div className="c">
          <div className="cb" style={{ textAlign: "center", padding: "40px 20px", color: "var(--tx3)" }}>
            ユーザー管理は管理者権限が必要です。<br />現在のロール: {userDoc?.role || "member"}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="c">
          <div className="ch">
            <div><div className="ct">ユーザー一覧</div><div className="cs">最初にログインしたユーザーが管理者になります。管理者は他のユーザーの権限を変更できます。</div></div>
            <span className="p bu">{users.length}名</span>
          </div>
          <div className="cb tw">
            {loading ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--tx3)" }}>読み込み中...</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>ユーザー</th>
                    <th>メールアドレス</th>
                    <th>ロール</th>
                    <th>ステータス</th>
                    <th>最終ログイン</th>
                    <th>登録日</th>
                    {isAdmin && <th>操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} style={u.disabled ? { opacity: 0.5 } : {}}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {u.photoURL ? (
                            <img src={u.photoURL} alt="" style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--bd)" }} />
                          ) : (
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--acB)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color: "var(--ac)" }}>
                              {(u.displayName || u.email || "?")[0]}
                            </div>
                          )}
                          <span className="bold">{u.displayName || "-"}</span>
                        </div>
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>{u.email}</td>
                      <td>
                        <span className={`p ${u.role === "admin" ? "pp" : "mt"}`}>
                          {u.role === "admin" ? "管理者" : "メンバー"}
                        </span>
                      </td>
                      <td>
                        <span className={`p ${u.disabled ? "bd" : "gd"}`}>
                          {u.disabled ? "無効" : "有効"}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>{formatDate(u.lastLogin)}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{formatDate(u.createdAt)}</td>
                      {isAdmin && (
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              className="btn"
                              style={{ padding: "4px 10px", fontSize: 10 }}
                              onClick={() => toggleRole(u.id, u.role)}
                              disabled={u.id === userDoc.id}
                            >
                              {u.role === "admin" ? "→ メンバー" : "→ 管理者"}
                            </button>
                            <button
                              className="btn"
                              style={{ padding: "4px 10px", fontSize: 10, borderColor: u.disabled ? "var(--ac)" : "var(--rd)", color: u.disabled ? "var(--ac)" : "var(--rd)" }}
                              onClick={() => toggleUser(u.id, u.disabled)}
                              disabled={u.id === userDoc.id}
                            >
                              {u.disabled ? "有効化" : "無効化"}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── TODO: 再シード完了後にこのブロックごと削除 ── */}
      {isAdmin && (
        <div className="c" style={{ border: "1px solid var(--rd)", background: "rgba(229,91,91,.05)" }}>
          <div className="ch"><div><div className="ct" style={{ color: "var(--rd)" }}>融資データ再シード（ワンタイム）</div></div></div>
          <div className="cb">
            <p style={{ fontSize: 12, color: "var(--tx2)", marginBottom: 12, lineHeight: 1.6 }}>
              Firestoreの loans コレクションを全件削除し、INITIAL_LOANS（CSVベース26件）で再登録します。<br />
              <strong style={{ color: "var(--rd)" }}>この操作は取り消せません。</strong>実行は1回だけ行ってください。
            </p>
            <ReseedButton />
          </div>
        </div>
      )}

      <div className="c">
        <div className="ch"><div><div className="ct">マルチテナント設定</div></div></div>
        <div className="cb">
          <div className="set-item">
            <div>
              <div className="set-k">許可ドメイン</div>
              <div className="set-v">現在の設定: @{userDoc?.email?.split("@")[1] || "hyose.co.jp"}</div>
            </div>
            <span className="p gd">有効</span>
          </div>
          <div className="set-item">
            <div>
              <div className="set-k">セッション有効期間</div>
              <div className="set-v">30日間（自動ログイン）</div>
            </div>
            <span className="p bu">設定済</span>
          </div>
          <div className="set-item">
            <div>
              <div className="set-k">他社での利用</div>
              <div className="set-v">Vercelの環境変数 VITE_ALLOWED_DOMAIN を変更するだけ</div>
            </div>
            <span className="p mt">Multi-tenant</span>
          </div>
        </div>
      </div>
    </div></div>
  );
}

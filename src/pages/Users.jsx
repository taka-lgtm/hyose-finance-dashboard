import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";

// アクセス可能なページの選択肢
const PAGE_OPTIONS = [
  { id: "overview", label: "経営概況" },
  { id: "performance", label: "予実管理" },
  { id: "cashflow", label: "資金繰り" },
  { id: "debt", label: "融資管理" },
  { id: "financials", label: "決算推移" },
  { id: "actions", label: "アクション" },
];

const ALL_PAGE_IDS = PAGE_OPTIONS.map((p) => p.id);

export default function Users() {
  const { userDoc } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPerms, setEditingPerms] = useState(null); // 権限編集中のユーザーID
  const isAdmin = userDoc?.role === "admin";

  const fetchUsers = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, "users"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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

  // 権限レベルを更新する
  const updatePermission = async (userId, permission) => {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, "users", userId), { permission });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, permission } : u));
    } catch (e) {
      alert("更新に失敗しました: " + e.message);
    }
  };

  // アクセス可能ページを更新する
  const togglePageAccess = async (userId, pageId, currentPages) => {
    if (!isAdmin) return;
    const pages = currentPages || ALL_PAGE_IDS;
    const newPages = pages.includes(pageId)
      ? pages.filter((p) => p !== pageId)
      : [...pages, pageId];
    try {
      await updateDoc(doc(db, "users", userId), { allowedPages: newPages });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, allowedPages: newPages } : u));
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
                    <th>権限</th>
                    <th>ステータス</th>
                    <th>最終ログイン</th>
                    {isAdmin && <th>操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isAdminUser = u.role === "admin";
                    const userPermission = isAdminUser ? "編集" : (u.permission || "編集");
                    const userPages = isAdminUser ? ALL_PAGE_IDS : (u.allowedPages || ALL_PAGE_IDS);
                    const isExpanded = editingPerms === u.id;

                    return (
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
                          <span className={`p ${isAdminUser ? "pp" : "mt"}`}>
                            {isAdminUser ? "管理者" : "メンバー"}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span className={`p ${userPermission === "編集" ? "gd" : "wr"}`} style={{ fontSize: 9 }}>
                              {userPermission}
                            </span>
                            {!isAdminUser && (
                              <span style={{ fontSize: 9, color: "var(--tx3)" }}>
                                {userPages.length === ALL_PAGE_IDS.length ? "全ページ" : `${userPages.length}ページ`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`p ${u.disabled ? "bd" : "gd"}`}>
                            {u.disabled ? "無効" : "有効"}
                          </span>
                        </td>
                        <td className="mono" style={{ fontSize: 11 }}>{formatDate(u.lastLogin)}</td>
                        {isAdmin && (
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  className="btn"
                                  style={{ padding: "4px 10px", fontSize: 10 }}
                                  onClick={() => toggleRole(u.id, u.role)}
                                  disabled={u.id === userDoc.id}
                                >
                                  {isAdminUser ? "→ メンバー" : "→ 管理者"}
                                </button>
                                <button
                                  className="btn"
                                  style={{ padding: "4px 10px", fontSize: 10, borderColor: u.disabled ? "var(--ac)" : "var(--rd)", color: u.disabled ? "var(--ac)" : "var(--rd)" }}
                                  onClick={() => toggleUser(u.id, u.disabled)}
                                  disabled={u.id === userDoc.id}
                                >
                                  {u.disabled ? "有効化" : "無効化"}
                                </button>
                                {!isAdminUser && (
                                  <button
                                    className="btn"
                                    style={{ padding: "4px 10px", fontSize: 10, borderColor: "var(--bl)", color: "var(--bl)" }}
                                    onClick={() => setEditingPerms(isExpanded ? null : u.id)}
                                  >
                                    {isExpanded ? "閉じる" : "権限設定"}
                                  </button>
                                )}
                              </div>
                              {/* 権限設定の展開エリア */}
                              {isExpanded && !isAdminUser && (
                                <div style={{ padding: "10px 0 4px", borderTop: "1px solid var(--bd)", display: "flex", flexDirection: "column", gap: 10 }}>
                                  <div>
                                    <div style={{ fontSize: 10, color: "var(--tx3)", marginBottom: 4, fontWeight: 600 }}>権限レベル</div>
                                    <div style={{ display: "flex", gap: 4 }}>
                                      {["編集", "閲覧"].map((perm) => (
                                        <button
                                          key={perm}
                                          className={`chip ${userPermission === perm ? "on" : ""}`}
                                          style={{ fontSize: 10, padding: "3px 10px" }}
                                          onClick={() => updatePermission(u.id, perm)}
                                        >
                                          {perm}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 10, color: "var(--tx3)", marginBottom: 4, fontWeight: 600 }}>アクセス可能ページ</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                      {PAGE_OPTIONS.map((pg) => {
                                        const checked = userPages.includes(pg.id);
                                        return (
                                          <label key={pg.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "3px 8px", borderRadius: 4, border: "1px solid var(--bd)", cursor: "pointer", background: checked ? "var(--acB)" : "transparent", color: checked ? "var(--ac)" : "var(--tx3)" }}>
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={() => togglePageAccess(u.id, pg.id, userPages)}
                                              style={{ width: 12, height: 12, accentColor: "var(--ac)" }}
                                            />
                                            {pg.label}
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
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

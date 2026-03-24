import { useState, useEffect } from "react";
import { pct, sgn } from "../data";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";

const NAV = [
  { id: "overview", label: "経営概況", shortLabel: "概況", icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z|M9 22V12h6v10", bottom: true },
  { id: "performance", label: "予実管理", shortLabel: "予実", icon: "M18 20V10|M12 20V4|M6 20V14", bottom: true },
  { id: "cashflow", label: "資金繰り", shortLabel: "資金", badge: "!", icon: "M12 2v20|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", bottom: true },
  { id: "debt", label: "融資管理", shortLabel: "融資", badgeFn: true, icon: "M2 5h20v14H2z|M2 10h20", bottom: true },
  { id: "financials", label: "決算推移", icon: "M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z|M14 2v6h6|M16 13H8|M16 17H8" },
  { id: "actions", label: "アクション", icon: "M10.268 21a2 2 0 0 0 3.464 0|M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" },
  { id: "users", label: "ユーザー管理", icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75" },
  { id: "settings", label: "設定", icon: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" },
  { id: "guide", label: "ガイド", icon: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z|M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3|M12 17h.01" },
];

// 「その他」メニュー用アイコン
const MORE_ICON = "M12 5v.01|M12 12v.01|M12 19v.01";

function NavIcon({ d }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {d.split("|").map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

// 最終取込日のアラート判定（月初5日以降で前月未取込なら警告）
function isImportStale(lastImportDate) {
  if (!lastImportDate) return true;
  const now = new Date();
  const parts = lastImportDate.split("/");
  if (parts.length < 3) return true;
  const lastDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  // 今月5日以降で、最終取込が先月以前なら警告
  if (now.getDate() >= 5) {
    const thisMonth = now.getFullYear() * 12 + now.getMonth();
    const lastMonth = lastDate.getFullYear() * 12 + lastDate.getMonth();
    return thisMonth > lastMonth;
  }
  return false;
}

// 最終取込日の短縮表示（○/○）
function formatImportDate(lastImportDate) {
  if (!lastImportDate) return null;
  const parts = lastImportDate.split("/");
  if (parts.length < 3) return lastImportDate;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

// データ取込アイコン
function ImportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

export default function Layout({ page, navigate, loans, plData, children, onOpenImport }) {
  const { userDoc, logout } = useAuth();
  const { settings } = useSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const lastPL = plData && plData.length > 0 ? plData[plData.length - 1] : null;
  const sg = lastPL ? pct(lastPL.売上高, lastPL.予算売上) : 0;
  const og = lastPL ? pct(lastPL.営業利益, lastPL.予算営業利益) : 0;

  // Close menu on page change
  useEffect(() => { setMenuOpen(false); }, [page]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const handleNav = (id) => { navigate(id); setMenuOpen(false); };

  // データ取込状態
  const stale = isImportStale(settings.lastImportDate);
  const importDateShort = formatImportDate(settings.lastImportDate);

  // ページアクセス制限: adminは全ページ表示、それ以外はallowedPagesに従う
  const isAdmin = userDoc?.role === "admin";
  const allowedPages = userDoc?.allowedPages;
  const RESTRICTED_IDS = ["overview", "performance", "cashflow", "debt", "financials", "actions"];
  const filteredNav = NAV.filter((n) => {
    if (isAdmin || !RESTRICTED_IDS.includes(n.id)) return true;
    if (!allowedPages) return true;
    return allowedPages.includes(n.id);
  });

  // ボトムナビに表示するアイテム（bottom: true のもの）
  const bottomNavItems = filteredNav.filter((n) => n.bottom);
  // 「その他」メニューでボトムナビ以外のページがアクティブか判定
  const isOtherActive = !bottomNavItems.some((n) => n.id === page);

  return (
    <div className="shell">
      {/* ── Desktop Sidebar ── */}
      <aside className="nav nav-desktop">
        <div className="nb">
          <div className="nb-row">
            {settings.logoUrl
              ? <img src={settings.logoUrl} alt="" className="nb-logo-img" />
              : <div className="nb-logo">{(settings.companyName || "H")[0]}</div>}
            <div className="nb-text">{settings.companyName || "HYOSE"}<small>Command Center</small></div>
          </div>
        </div>
        <div className="nh">
          <div className="nh-i"><div className="nl">売上予算比</div><div className={`nv ${sg<0?"dn":"up"}`}>{sgn(sg)}</div></div>
          <div className="nh-i"><div className="nl">営利予算比</div><div className={`nv ${og<0?"dn":"up"}`}>{sgn(og)}</div></div>
        </div>
        <div className="nl-wrap">
          <div className="ng">メニュー</div>
          {filteredNav.map((n) => {
            const badge = n.badgeFn ? String(loans.length) : (n.id === "settings" && !settings.onboardingCompleted ? "!" : n.badge);
            return (
              <div key={n.id} className={`ni ${page===n.id?"on":""}`} onClick={() => handleNav(n.id)}>
                <NavIcon d={n.icon} /><span className="nil">{n.label}</span>
                {badge && <span className="nib">{badge}</span>}
              </div>
            );
          })}
        </div>
        {onOpenImport && (
          <div className="nav-import">
            <button className="nav-import-btn" onClick={onOpenImport}>
              <ImportIcon />
              <div className="nav-import-info">
                <div className="nav-import-label">データ取込</div>
                <div className={`nav-import-date ${stale ? "stale" : ""}`}>
                  {stale && !importDateShort && "未取込"}
                  {stale && importDateShort && `未更新 最終: ${importDateShort}`}
                  {!stale && importDateShort && `最終: ${importDateShort}`}
                </div>
              </div>
            </button>
          </div>
        )}
        <div className="nav-user">
          <div className="nav-user-info">
            {userDoc?.photoURL
              ? <img src={userDoc.photoURL} alt="" className="nav-user-avatar" />
              : <div className="nav-user-avatar nav-user-avatar-fallback">{(userDoc?.displayName||"?")[0]}</div>}
            <div className="nav-user-text">
              <div className="nav-user-name">{userDoc?.displayName||"ユーザー"}</div>
              <div className="nav-user-role">{userDoc?.role==="admin"?"管理者":"メンバー"}</div>
            </div>
          </div>
          <button className="nav-logout" onClick={logout} title="ログアウト">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </aside>

      {/* ── Mobile Header ── */}
      <header className="mob-header">
        <div className="mob-header-brand">
          {settings.logoUrl
            ? <img src={settings.logoUrl} alt="" className="mob-logo-img" />
            : <div className="mob-logo">{(settings.companyName || "H")[0]}</div>}
          <span className="mob-brand-text">{settings.companyName || "HYOSE"}</span>
        </div>
        <div className="mob-header-right">
          {userDoc?.photoURL
            ? <img src={userDoc.photoURL} alt="" className="mob-avatar" onClick={() => handleNav("users")} />
            : <div className="mob-avatar mob-avatar-fallback" onClick={() => handleNav("users")}>{(userDoc?.displayName||"?")[0]}</div>}
        </div>
      </header>

      {/* ── Mobile Drawer（その他メニューから開く） ── */}
      <div className={`mob-overlay ${menuOpen?"open":""}`} onClick={() => setMenuOpen(false)} />
      <nav className={`mob-drawer ${menuOpen?"open":""}`}>
        <div className="mob-drawer-head">
          <div className="mob-drawer-brand">
            {settings.logoUrl
              ? <img src={settings.logoUrl} alt="" className="nb-logo-img" />
              : <div className="nb-logo">{(settings.companyName || "H")[0]}</div>}
            <div className="nb-text">{settings.companyName || "HYOSE"}<small>Command Center</small></div>
          </div>
        </div>
        <div className="mob-drawer-health">
          <div className="nh-i"><div className="nl">売上予算比</div><div className={`nv ${sg<0?"dn":"up"}`}>{sgn(sg)}</div></div>
          <div className="nh-i"><div className="nl">営利予算比</div><div className={`nv ${og<0?"dn":"up"}`}>{sgn(og)}</div></div>
        </div>
        <div className="mob-drawer-nav">
          {filteredNav.map((n) => {
            const badge = n.badgeFn ? String(loans.length) : (n.id === "settings" && !settings.onboardingCompleted ? "!" : n.badge);
            return (
              <div key={n.id} className={`mob-nav-item ${page===n.id?"on":""}`} onClick={() => handleNav(n.id)}>
                <NavIcon d={n.icon} /><span>{n.label}</span>
                {badge && <span className="mob-nav-badge">{badge}</span>}
              </div>
            );
          })}
        </div>
        {onOpenImport && (
          <div className="mob-drawer-import">
            <button className="mob-import-btn" onClick={() => { setMenuOpen(false); onOpenImport(); }}>
              <ImportIcon />
              <span>データ取込</span>
              {stale && <span style={{ fontSize: 9, color: "var(--rd)", fontWeight: 600, marginLeft: "auto" }}>
                {importDateShort ? `未更新 ${importDateShort}` : "未取込"}
              </span>}
              {!stale && importDateShort && <span style={{ fontSize: 9, color: "var(--tx3)", marginLeft: "auto" }}>
                最終: {importDateShort}
              </span>}
            </button>
          </div>
        )}
        <div className="mob-drawer-foot">
          <div className="mob-drawer-user">
            {userDoc?.photoURL
              ? <img src={userDoc.photoURL} alt="" className="nav-user-avatar" />
              : <div className="nav-user-avatar nav-user-avatar-fallback">{(userDoc?.displayName||"?")[0]}</div>}
            <div className="nav-user-text">
              <div className="nav-user-name">{userDoc?.displayName||"ユーザー"}</div>
              <div className="nav-user-role">{userDoc?.role==="admin"?"管理者":"メンバー"}</div>
            </div>
          </div>
          <button className="mob-logout-btn" onClick={logout}>ログアウト</button>
        </div>
      </nav>

      <main className="main">
        {children}
      </main>

      {/* ── Bottom Navigation（モバイルのみ表示） ── */}
      <nav className="bottom-nav">
        {bottomNavItems.map((n) => (
          <button key={n.id} className={`bottom-nav-item ${page===n.id?"on":""}`} onClick={() => handleNav(n.id)}>
            <NavIcon d={n.icon} />
            <span>{n.shortLabel}</span>
          </button>
        ))}
        {onOpenImport && (
          <button className="bottom-nav-import" onClick={onOpenImport} style={{ position: "relative" }}>
            <ImportIcon />
            <span>取込</span>
            {stale && <span className="nav-import-dot" />}
          </button>
        )}
        <button className={`bottom-nav-item ${isOtherActive?"on":""}`} onClick={() => setMenuOpen(true)}>
          <NavIcon d={MORE_ICON} />
          <span>その他</span>
        </button>
      </nav>
    </div>
  );
}

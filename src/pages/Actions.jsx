import { ALERTS, REPORTS } from "../data";

export default function Actions() {
  const cr = ALERTS.filter((a) => a.lv === "bad"), wr = ALERTS.filter((a) => a.lv === "warn"), inf = ALERTS.filter((a) => a.lv === "info");
  const groups = [...new Set(REPORTS.map((r) => r.group))];

  return (
    <div className="page"><div className="g">
      <div className="ph"><div><h2>アクション</h2><p>アラートと意思決定事項を統合。次のアクションを明確にする。</p></div></div>
      <div className="g3">
        <div className="k" style={{ borderLeft: "3px solid var(--rd)" }}><div className="k-label">Critical</div><div className="k-val" style={{ color: "var(--rd)" }}>{cr.length}件</div><div className="k-ctx">即時対応</div></div>
        <div className="k" style={{ borderLeft: "3px solid var(--am)" }}><div className="k-label">Warning</div><div className="k-val" style={{ color: "var(--am)" }}>{wr.length}件</div><div className="k-ctx">今月中に対応</div></div>
        <div className="k" style={{ borderLeft: "3px solid var(--bl)" }}><div className="k-label">Info</div><div className="k-val" style={{ color: "var(--bl)" }}>{inf.length}件</div><div className="k-ctx">共有・記録</div></div>
      </div>
      <div className="g3">
        {[["Critical", cr, "bad"], ["Warning", wr, "warn"], ["Info", inf, "info"]].map(([lbl, items, cls]) => (
          <div key={lbl} className="c">
            <div className="ch"><div><div className="ct">{lbl}</div></div><span className={`p ${cls === "info" ? "bu" : cls === "bad" ? "bd" : "wr"}`}>{items.length}件</span></div>
            <div className="cb">
              {items.map((a, i) => (
                <div key={i} className={`al ${a.lv === "bad" ? "bad" : a.lv === "warn" ? "warn" : "info"}`}>
                  <div className="al-icon">{a.lv === "bad" ? "!" : a.lv === "warn" ? "△" : "i"}</div>
                  <div><h4>{a.title}</h4><p>{a.action}</p></div>
                  <div className="aside">{a.date}<div className="al-owner">{a.owner}</div></div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div>
        <div className="sec-label" style={{ marginBottom: 12 }}>Reports</div>
        {groups.map((g) => (
          <div key={g} style={{ marginBottom: 16 }}>
            <div className="sec-title" style={{ marginBottom: 10 }}>{g}</div>
            <div className="rpt-grid">
              {REPORTS.filter((r) => r.group === g).map((r, i) => (
                <div key={i} className="rpt">
                  <div className="rpt-type">{r.group}</div>
                  <h4>{r.title}</h4><p>{r.desc}</p>
                  <div className="rpt-foot">
                    <span className="p bu">{r.tag}</span>
                    <span className={`p ${r.status === "要確認" ? "wr" : r.status === "下書き" ? "bd" : "gd"}`}>{r.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="g2">
        <div className="c"><div className="ch"><div><div className="ct">会社情報</div></div></div>
          <div className="cb">
            {[["会社名", "株式会社ヒョーセ"], ["所在地", "兵庫県三木市別所町花尻412-28"], ["事業", "中古トラック買取・再販・輸出"], ["体制", "役員3名 / 従業員18名"], ["決算月", "3月"]].map(([k, v], i) => (
              <div key={i} className="set-item"><div><div className="set-k">{k}</div><div className="set-v">{v}</div></div><span className="p bu">管理</span></div>
            ))}
          </div></div>
        <div className="c"><div className="ch"><div><div className="ct">通知設定</div></div></div>
          <div className="cb">
            {[["返済日リマインダー", "7日前 / 3日前 / 前日"], ["資金ショートアラート", "安全水準 4,500万円"], ["月次レポート", "毎月5営業日後"], ["異常値検知", "予算差異5%以上"]].map(([k, v], i) => (
              <div key={i} className="set-item"><div><div className="set-k">{k}</div><div className="set-v">{v}</div></div><span className="p gd">有効</span></div>
            ))}
          </div></div>
      </div>
    </div></div>
  );
}

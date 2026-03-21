import { useState } from "react";

// アコーディオンコンポーネント
function Accordion({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="guide-accordion">
      <button className="guide-accordion-header" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform .2s var(--e)" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="guide-accordion-body">{children}</div>}
    </div>
  );
}

export default function Guide() {
  return (
    <div className="page"><div className="g">
      <div className="ph">
        <div>
          <h2>ガイド</h2>
          <p>HYOSEダッシュボードの使い方と運用方法をまとめています。</p>
        </div>
      </div>

      {/* セクション1: 毎月のルーティン */}
      <div className="c">
        <div className="ch"><div><div className="ct">毎月やること（所要時間：約2分）</div><div className="cs">月次データを最新に保つための手順です</div></div></div>
        <div className="cb">
          <div className="guide-steps">
            <div className="guide-step">
              <div className="guide-step-num">1</div>
              <div className="guide-step-content">
                <div className="guide-step-title">マネーフォワードからCSVを出力</div>
                <ol className="guide-ol">
                  <li>マネーフォワードにログイン</li>
                  <li>会計帳簿 → 推移表を選択</li>
                  <li>「貸借対照表」のCSVをダウンロード</li>
                  <li>「損益計算書」のCSVをダウンロード</li>
                </ol>
              </div>
            </div>
            <div className="guide-step">
              <div className="guide-step-num">2</div>
              <div className="guide-step-content">
                <div className="guide-step-title">ダッシュボードにアップロード</div>
                <ol className="guide-ol">
                  <li>資金繰りページを開く</li>
                  <li>「CSV取込」ボタンをクリック</li>
                  <li>BS（貸借対照表）とPL（損益計算書）のCSVを選択</li>
                  <li>完了！</li>
                </ol>
              </div>
            </div>
          </div>
          <div className="guide-result">
            <div className="guide-result-title">これだけで以下が自動更新されます：</div>
            <ul className="guide-ul">
              <li>経営概況の全指標</li>
              <li>資金繰りの入出金・残高</li>
              <li>予実管理の実績データ</li>
              <li>決算推移の主要経営指標</li>
            </ul>
          </div>
        </div>
      </div>

      {/* セクション2: 変更があったときだけやること */}
      <div className="c">
        <div className="ch"><div><div className="ct">変更があったときだけやること</div><div className="cs">以下のイベントが発生した場合のみ対応してください</div></div></div>
        <div className="cb">
          <div className="guide-events">
            <div className="guide-event">
              <div className="guide-event-icon">🏦</div>
              <div>
                <div className="guide-event-title">融資に変更があったとき</div>
                <ul className="guide-ul">
                  <li>新規借入 → 融資管理ページで「新規追加」</li>
                  <li>完済 → 該当融資を編集して残高を0に</li>
                  <li>借換え → 旧融資の残高を0に + 新規追加</li>
                </ul>
              </div>
            </div>
            <div className="guide-event">
              <div className="guide-event-icon">📋</div>
              <div>
                <div className="guide-event-title">決算書が出たとき（年1回）</div>
                <ul className="guide-ul">
                  <li>決算推移ページでPDFをアップロード</li>
                  <li>複数年分あると前年比較ができる</li>
                </ul>
              </div>
            </div>
            <div className="guide-event">
              <div className="guide-event-icon">🎯</div>
              <div>
                <div className="guide-event-title">予算を見直したいとき</div>
                <ul className="guide-ul">
                  <li>予実管理ページでセルを直接編集</li>
                  <li>または「前年実績から再生成」ボタン</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* セクション3: 各ページの使い方 */}
      <div className="c">
        <div className="ch"><div><div className="ct">各ページの使い方</div></div></div>
        <div className="cb" style={{ padding: 0 }}>
          <Accordion title="経営概況" defaultOpen>
            <p className="guide-desc">経営の現在地を3秒で把握するページです。</p>
            <ul className="guide-ul">
              <li>上段のキャッシュ予測で資金の安全性を確認</li>
              <li>意思決定キューで今すぐ対応すべきことを確認</li>
              <li>経営健全度スコアで総合評価を確認</li>
            </ul>
          </Accordion>
          <Accordion title="予実管理">
            <p className="guide-desc">計画と実績のギャップを毎月チェックするページです。</p>
            <ul className="guide-ul">
              <li>予算は手動入力または前年実績から自動生成</li>
              <li>マネフォCSVをアップすると実績が自動反映</li>
              <li>累積タブで年度通期の進捗を確認</li>
            </ul>
          </Accordion>
          <Accordion title="資金繰り">
            <p className="guide-desc">キャッシュの流れを可視化するページです。</p>
            <ul className="guide-ul">
              <li>PLベース（発生主義）とBS残高（実残高）の両方を表示</li>
              <li>平均残高で月末のタイミングブレを緩和</li>
            </ul>
          </Accordion>
          <Accordion title="融資管理">
            <p className="guide-desc">全借入の状況を一元管理するページです。</p>
            <ul className="guide-ul">
              <li>残高推移タブで今後12ヶ月の返済計画を確認</li>
              <li>一覧タブでソート・フィルタして分析</li>
              <li>分析タブで金利構成や銀行別残高を可視化</li>
            </ul>
          </Accordion>
          <Accordion title="決算推移">
            <p className="guide-desc">過去の決算書を並べて傾向を読むページです。</p>
            <ul className="guide-ul">
              <li>PDFアップロードでAIが自動読取</li>
              <li>読取ミスはセルクリックで修正可能</li>
              <li>主要経営指標は4グループに分類して表示</li>
            </ul>
          </Accordion>
          <Accordion title="アクション">
            <p className="guide-desc">経営課題と対応タスクを管理するページです。</p>
          </Accordion>
          <Accordion title="ユーザー管理（管理者のみ）">
            <p className="guide-desc">社員のアクセス権限を管理するページです。</p>
            <ul className="guide-ul">
              <li>編集権限と閲覧権限を設定可能</li>
              <li>ページ単位でアクセスを制御可能</li>
            </ul>
          </Accordion>
        </div>
      </div>

      {/* セクション4: データ更新タイミング早見表 */}
      <div className="c">
        <div className="ch"><div><div className="ct">データ更新タイミング早見表</div></div></div>
        <div className="cb tw">
          <table>
            <thead>
              <tr>
                <th>やること</th>
                <th>頻度</th>
                <th>所要時間</th>
                <th>対象ページ</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>マネフォCSVアップ</td><td>毎月</td><td>2分</td><td>資金繰り</td></tr>
              <tr><td>融資データ更新</td><td>変更時のみ</td><td>5分</td><td>融資管理</td></tr>
              <tr><td>決算書PDFアップ</td><td>年1回</td><td>3分</td><td>決算推移</td></tr>
              <tr><td>予算入力・修正</td><td>期初＋随時</td><td>15分</td><td>予実管理</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* セクション5: よくある質問 */}
      <div className="c">
        <div className="ch"><div><div className="ct">よくある質問</div></div></div>
        <div className="cb" style={{ padding: 0 }}>
          <Accordion title="数値が古いままです">
            <p className="guide-desc">マネフォCSVを最新月まで含めて再アップロードしてください。資金繰りページの「CSV取込」から行えます。</p>
          </Accordion>
          <Accordion title="経営概況のスコアが低いです">
            <p className="guide-desc">スコアの計算式はマウスオーバーで確認できます。各指標（収益性・安全性・成長性・資金力）の改善が必要です。</p>
          </Accordion>
          <Accordion title="決算書の読取結果が間違っています">
            <p className="guide-desc">決算推移ページのテーブルでセルをクリックして直接修正できます。</p>
          </Accordion>
          <Accordion title="新しい社員にアクセスさせたい">
            <p className="guide-desc">許可ドメインのGoogleアカウントでログインすれば自動登録されます。権限はユーザー管理ページで設定してください。</p>
          </Accordion>
          <Accordion title="スマホから見れますか？">
            <p className="guide-desc">はい。すべてのページがスマホ対応しています。</p>
          </Accordion>
        </div>
      </div>

    </div></div>
  );
}

# CLAUDE.md — HYOSE Dashboard v5

## プロジェクト概要

HYOSE（ヒョウセ）は、中小企業向けの経営ダッシュボードWebアプリケーション。
損益計算書(PL)・貸借対照表(BS)・資金繰り・融資管理・予実管理などの経営指標を一画面で可視化する「Executive Command Center」。

- Google Workspace ドメイン認証によるマルチテナント対応
- Firestore によるリアルタイムデータ永続化
- Claude API を利用した決算書PDF自動読み取り機能
- ロールベースのユーザー管理（admin / member）

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フロントエンド | React 18 + Vite 5 |
| 言語 | JavaScript (JSX) |
| 認証 | Firebase Authentication (Google OAuth) |
| データベース | Cloud Firestore |
| チャート | Chart.js + react-chartjs-2 |
| Excel出力 | xlsx (SheetJS) |
| PDF解析API | Anthropic Claude API (Vercel Serverless Function) |
| ホスティング | Vercel |
| フォント | DM Sans / Noto Sans JP / IBM Plex Mono |

## ファイル構成

```
hyose-dashboard-v5/
├── api/
│   └── parse-pdf.js          # Vercel Serverless Function（Claude APIでPDF→PL/BS抽出）
├── src/
│   ├── main.jsx               # エントリポイント
│   ├── App.jsx                # ルートコンポーネント（状態管理・ページルーティング）
│   ├── index.css              # グローバルCSS
│   ├── components/
│   │   ├── Layout.jsx         # サイドバー・モバイルドロワー・ナビゲーション
│   │   ├── LoanModal.jsx      # 融資追加モーダル
│   │   └── Sparkline.jsx      # ミニチャートコンポーネント
│   ├── contexts/
│   │   └── AuthContext.jsx    # Firebase認証コンテキスト（ドメイン制限・セッション管理）
│   ├── data/
│   │   └── index.js           # デフォルトデータ（PL/BS/CF/予算）・ユーティリティ関数
│   ├── lib/
│   │   ├── firebase.js        # Firebase初期化・設定
│   │   └── firestore.js       # Firestore CRUD操作（loans, financials）
│   └── pages/
│       ├── Overview.jsx       # 経営概況ページ
│       ├── Performance.jsx    # 予実管理ページ
│       ├── Financials.jsx     # 決算書ページ（PDF取り込み対応）
│       ├── CashFlow.jsx       # 資金繰りページ
│       ├── Debt.jsx           # 融資管理ページ
│       ├── Actions.jsx        # アクション管理ページ
│       └── Users.jsx          # ユーザー管理ページ（admin専用）
├── public/                    # 静的ファイル
├── index.html                 # HTMLテンプレート（lang="ja"）
├── vite.config.js             # Vite設定
├── vercel.json                # Vercel設定（SPA rewrites + API routes）
├── package.json
├── .env.example               # 環境変数テンプレート
└── .gitignore
```

## コーディングルール

- **コメントは日本語で記述する**
- **TypeScriptへの移行を推奨** — 新規ファイルは `.tsx` / `.ts` で作成すること（既存は `.jsx` / `.js`）
- UIテキスト・ラベルは日本語
- CSS はグローバル `index.css` に集約（CSS-in-JS は使用しない）
- CSS変数を使用したダークテーマベース（`--bg1`, `--tx1`, `--ac1` 等）
- コンポーネントは関数コンポーネント + Hooks で統一
- 状態管理は React Context + useState（Redux等は不使用）
- ページルーティングは `App.jsx` 内の手動切り替え（react-router不使用）
- Firestore コレクション名: `loans`, `financials`, `users`

## 開発コマンド

```bash
# 依存パッケージのインストール
npm install

# 開発サーバー起動（http://localhost:5173）
npm run dev

# プロダクションビルド
npm run build

# ビルドプレビュー
npm run preview
```

## デプロイ方法（GitHub → Vercel）

1. GitHubリポジトリにコードをpush
2. Vercelでリポジトリをインポート（またはgit pushで自動デプロイ）
3. Vercelの環境変数に以下を設定:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_ALLOWED_DOMAIN`（許可するGoogle Workspaceドメイン）
   - `ANTHROPIC_API_KEY`（PDF解析用、サーバーサイドのみ）
4. `vercel.json` により SPA リライトと `/api/*` のサーバーレス関数ルーティングが自動設定される

## 注意事項

### 環境変数 (.env)
- `.env.local` は `.gitignore` に含まれており、**絶対にコミットしないこと**
- `.env.example` をコピーして `.env.local` を作成する
- `VITE_` プレフィックス付きの変数はクライアント側に公開される（秘密情報を含めないこと）
- `ANTHROPIC_API_KEY` はサーバーサイド専用（`VITE_` プレフィックスなし）— Vercelの環境変数として設定

### Firebase設定
- Firebase Authentication で Google プロバイダを有効化する必要あり
- Firestore のセキュリティルールを適切に設定すること
- `VITE_ALLOWED_DOMAIN` で指定したドメインのGoogleアカウントのみログイン可能
- 最初にログインしたユーザーが自動的に `admin` ロールになる

### API (Serverless Functions)
- `api/parse-pdf.js` は Vercel Serverless Function として動作（ローカルでは `vercel dev` が必要）
- Claude API (`claude-sonnet-4-20250514`) を使用してPDFから財務データを抽出
- `maxDuration: 60` 秒に設定済み

### セッション
- ログインセッションは30日間有効（`SESSION_MAX_AGE`）
- セッション期限切れ時は自動ログアウト

## 変更時の原則

- 変更は最小限の範囲にとどめること。依頼された箇所以外は変更しない
- UIデザインの変更時は、変更対象外のコンポーネントのスタイルを維持すること
- 複数の変更がある場合は、1つずつ個別のコミットに分けること
- コミットメッセージは日本語で書くこと

## プロジェクトオーナー情報

- 株式会社ヒョーセ（中古トラック買取・再販・輸出）
- 兵庫県三木市、役員3名・従業員18名
- 3月決算
- 許可ドメイン: @hyose.co.jp

## マルチテナント対応設計（将来課題）

### Firestoreデータ構造
- テナント（会社）ごとにサブコレクションで分離する方式を採用予定
  - `tenants/{tenantId}/loans`
  - `tenants/{tenantId}/financials`
  - `tenants/{tenantId}/users`
  - `tenants/{tenantId}/settings`
  - `tenants/{tenantId}/loanLogs`
- `tenantId` は会社のドメイン名（例: `hyose-co-jp`）またはUUIDで生成
- 既存データのマイグレーション: ルート直下の既存コレクションを `tenants/{defaultTenantId}/` 配下に移行するスクリプトを作成

### URL方式
- サブドメイン方式を推奨: `{company}.hyose-dashboard.com`
  - 例: `hyose.hyose-dashboard.com`, `client-a.hyose-dashboard.com`
- Vercelのカスタムドメイン機能で各テナントのサブドメインを設定
- 代替案としてパス方式（`hyose-dashboard.com/{company}/`）も検討可能

### 認証の分離
- テナントごとに `allowedDomain` を設定で管理（settings コレクション）
- Firebase AuthenticationのカスタムクレームにテナントIDを付与
- Firestoreセキュリティルールでテナントをまたぐアクセスを制限

### 将来課題（未実装）
- 料金体系の設計
- テナント管理用のスーパーアドミン画面
- テナント間のデータ完全分離の検証
- バックアップ・リストア戦略のテナント別対応

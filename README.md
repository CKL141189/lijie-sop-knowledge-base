# 立傑內部知識庫資料收集台

這是一個伺服器版的資料收集工具，給秘書或內部窗口上傳訪談資料、SOP、產品文件、維修表、報價規則等內容，先分類整理成未來 AI 知識庫可用的資料。

## 啟動

```powershell
npm install
npm start
```

啟動後打開：

```text
http://localhost:3000
```

## 功能

- 依資料來源分類上傳：
  - 產品說明書、安裝手冊
  - 維修表、報修單、維修總表
  - 客服/工程/維修人員經驗
  - 保固卡、報價表、收費規則
  - ERP、大二、Google Sheet 欄位
  - 公司內部 SOP、表單
- 填寫部門、職位、受訪者、摘要、原始內容、標籤、狀態與備註。
- 上傳多個附件。
- 搜尋與篩選資料。
- 匯出 CSV 或 JSON。

## 資料位置與資料庫

本機沒有設定 `DATABASE_URL` 時，系統會使用 JSON 檔案：

```text
data/records.json
data/custom-tasks.json
data/task-templates.json
data/uploads/
```

`data/` 已加入 `.gitignore`，不會被提交到 git。

Render 上設定 `DATABASE_URL` 後，系統會自動改用 PostgreSQL，並建立：

```text
task_templates
records
custom_tasks
```

## Render 部署

Web Service 設定：

```text
Build Command: npm install
Start Command: npm start
```

Environment Variables：

```text
DATABASE_URL=Render PostgreSQL 的 Internal Database URL
IMPORT_TOKEN=自行設定一組匯入用密碼
NODE_ENV=production
```

`DATABASE_URL` 和 `IMPORT_TOKEN` 只放在 Render Environment，不要提交到 GitHub。

## 匯入本機 JSON 到 Render DB

先在 Render 的 Web Service 設定好 `IMPORT_TOKEN`，再於本機 PowerShell 執行：

```powershell
$env:IMPORT_URL="https://lijie-sop-knowledge-base.onrender.com"
$env:IMPORT_TOKEN="和 Render Environment 相同的匯入密碼"
npm run import:render
```

匯入內容：

```text
data/task-templates.json
data/records.json
data/custom-tasks.json
```

## 部署提醒

目前已支援 Render PostgreSQL。若要正式長期使用，建議下一步補：

- 帳號登入
- 管理後台密碼或管理員手機白名單
- 上傳附件改放 Cloudflare R2 / S3
- 備份機制
- 權限分級
- 定期匯入 AI 知識庫的審核流程

# 徑賽系統（MVP / GitHub Pages）

目標：先把「名單匯入 + 1/2 年級分流 + A2+B2 順序分線 + 看板同步」跑起來（零依賴）。

## 1) 專案結構
- `index.html`：管理端（匯入名單、建立組次、分線、指定看板顯示）
- `board.html`：大螢幕看板（顯示目前組次 + 下一組預告）
- `assets/`：前端程式
- `data/participants.sample.csv`：由你上傳的名單轉出的範例 CSV

## 2) 本機測試（建議）
因為有 `fetch()` 讀取 `data/*.csv`，請用本機靜態伺服器：
- Python：`python -m http.server 8000`
- 開啟：`http://localhost:8000`

## 3) GitHub Pages 部署
1. 建立 repo，將本專案檔案放在 repo 根目錄
2. Settings → Pages → Source 選 `Deploy from a branch`，Branch 選 `main` / `/ (root)`
3. 完成後用提供的網址開啟 `index.html`

## 4) CSV 欄位
`id,class,no,name,present`

- `id` 建議唯一（本範例：`1A-01-王小明`）
- `class`：1A/1B/2A/2B
- `present`：1/0 或 true/false

## 5) 已實作規則
- **年級分流**：1 年級只能對 1 年級；2 年級只能對 2 年級
- **順序分線**：Lane1→4 = A1、A2、B1、B2
- **不足 2 人**：可選
  - `由另一班補足`（把已勾選的人往前填滿 Lane）
  - `保留空道`
- **同步**：同一台電腦不同分頁（管理端/看板）用 BroadcastChannel 即時同步

下一步（你確認後我會接著做）：成績登錄（秒 + DNF/DQ/DNS）與即時排名。


## 新增功能（v3）
- 組次總覽表：一次顯示所有分組 Lane1–4
- 匯出全部組次手寫計分表（單一 Excel）：含「總覽」+ 每組一張工作表


## 新增：計分員輸入
- `score.html`：選組次輸入 Lane1–4 成績（秒 / DNS / DNF / DQ），自動同步看板排行榜。

## 新增：總分表（單一工作表）
- 管理端可設定三個類別名稱並匯出 `總分表_YYYYMMDD.xlsx`（只有一張工作表）。

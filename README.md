# 工具庫

## 資料夾結構

```
tools-hub/
├── index.html          ← 列表頁（顯示名稱＋上傳日期，點進去開工具）
├── manifest.json        ← 列表資料，由 generate-manifest.js 自動產生，不要手動亂改
├── generate-manifest.js ← 掃描 tools/ 底下的工具，重新產生 manifest.json
└── tools/
    └── example-tool/
        ├── index.html   ← 工具本體
        └── meta.json    ← 選填，自訂顯示名稱用
```

## 新增一個工具

1. 在 `tools/` 底下新增一個資料夾（資料夾名稱隨意，例如 `bg-remover`）
2. 把工具的 `index.html`（以及它需要的其他檔案）放進去
3. （選填）在同一個資料夾放一個 `meta.json`：
   ```json
   { "name": "去背工具" }
   ```
   沒有放的話，列表上就會直接顯示資料夾名稱。
4. `git add` + `git commit` 進去（日期是抓 git 第一次 commit 的時間，所以記得先 commit 再產生 manifest）
5. 執行：
   ```
   node generate-manifest.js
   ```
   這會重新掃描 tools/ 底下所有資料夾，寫出新的 manifest.json
6. 把 manifest.json 也 commit + push 上去

## 開啟列表頁

`index.html` 是用 `fetch("manifest.json")` 讀資料，用瀏覽器直接雙擊打開（`file://`）會被擋掉。
兩個方法都可以：

- 丟去 GitHub Pages，直接用網址開
- 本機測試的話，在 `tools-hub/` 資料夾下開一個簡單伺服器，例如：
  ```
  npx serve .
  ```
  或
  ```
  python -m http.server
  ```

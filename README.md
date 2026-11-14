# 繁簡自動切換 script

自動轉換網頁中的簡體中文與繁體中文的 userscript（Tampermonkey / Violentmonkey）。
2.0 起改用 [OpenCC](https://github.com/BYVoid/OpenCC)（[opencc-js](https://github.com/nk2028/opencc-js)）詞庫，以詞為單位轉換，
「后/後」「发/髮/發」「面/麵」等一對多的字會依上下文正確處理。

## 功能

- 依瀏覽器語言自動轉換：簡體系統 → 顯示簡體；其他 → 顯示繁體
- 每個網域可分別設定「停用 / 簡體 / 繁體」，會記住
- 繁體地區可選：台灣（含詞彙，如 软件→軟體、鼠标→滑鼠）、台灣（只轉字）、香港（香港字形，如 里面→裏面、峰会→峯會）
- 動態載入的內容、文字更新、`title` / `alt` / `placeholder` / `aria-label` 屬性也會轉換
- 不會動到 `script`、`style`、`pre`、`code`、輸入框與可編輯區
- **Ctrl+F8**
  - 焦點在頁面上：切換簡體 / 繁體
  - 焦點在輸入框、textarea、可編輯區：只轉換裡面的文字

## 選單

- 繁簡切換【Ctrl+F8】：循環切換 繁體 → 簡體 → 停用
- 繁體：台灣（含詞彙）／台灣（只轉字）／香港（目前使用中的會打 ✓）

## 2.0 變更

- 改用 OpenCC 詞庫（透過 `@require` 載入並以 sha256 鎖定版本）
- 修正 textarea 用 Ctrl+F8 轉換無效（改寫 `.value` 並觸發 `input` 事件，React / Vue 等框架也能感知）
- 修正 `@exclude` 擋不到 `github.com` 本身
- `@include *` → `@match`，`keyCode` → `key`
- 改用 TreeWalker，並跳過沒有中文的文字節點，大型頁面更快
- 沿用 1.x 的網域設定，升級後不會遺失

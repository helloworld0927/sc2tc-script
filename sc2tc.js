// ==UserScript==
// @name         繁簡自動切換
// @name:zh-TW   繁簡自動切換
// @name:zh-CN   繁简自动切换
// @name:en      Switch Traditional Chinese and Simplified Chinese
// @namespace    helloworld0927
// @author       helloworld0927
// @supportURL   https://github.com/helloworld0927/sc2tc-script
// @homepageURL  https://github.com/helloworld0927/sc2tc-script
// @version      2.0.0
// @description  任意轉換網頁中的簡體中文與繁體中文（默認簡體→繁體），使用 OpenCC 詞庫
// @description:zh-TW  任意轉換網頁中的簡體中文與繁體中文（默認簡體→繁體），使用 OpenCC 詞庫
// @description:zh-CN  任意转换网页中的简体中文与繁体中文（默认繁体→简体），使用 OpenCC 词库
// @description:en Convert web pages between Simplified and Traditional Chinese (OpenCC dictionaries)
// @match        *://*/*
// @exclude      *://github.com/*
// @exclude      *://*.github.com/*
// @require      https://cdn.jsdelivr.net/npm/opencc-js@1.4.2/dist/umd/full.js#sha256=95b04abf136d9c28263773bb7d357eac80b7954d101efd23c4d09c737d3d379e
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

/* global OpenCC */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // 設定
  // ---------------------------------------------------------------------------
  const AUTO = true; // 沒有網域設定時，是否自動轉成作業系統的預設語言
  const SHORTCUT = { key: "F8", ctrlKey: true }; // 快捷鍵 Ctrl+F8

  // 繁體地區：twp = 台灣（含詞彙轉換，如 软件→軟體）、tw = 台灣（只轉字）、hk = 香港
  const REGIONS = {
    twp: "台灣（含詞彙）",
    tw: "台灣（只轉字）",
    hk: "香港",
  };

  // 額外自訂詞（簡 → 繁），會在 OpenCC 轉換之後套用
  const CUSTOM_S2T = [["yyds", "永遠的神"]];

  const ACTION = { OFF: 1, SIMPLIFIED: 2, TRADITIONAL: 3 };

  // ---------------------------------------------------------------------------
  // 語言 / 狀態
  // ---------------------------------------------------------------------------
  const lang = (navigator.languages?.[0] || navigator.language || "").toLowerCase();
  const isSimple = /^zh-(cn|sg|my|hans)/.test(lang);
  const defaultRegion = /^zh-(hk|mo)/.test(lang) ? "hk" : "twp";

  // 沿用 1.x 的儲存鍵，舊的網域設定不會遺失
  const actionKey = "action_" + location.hostname.replace(/\./g, "_");
  const savedAction = GM_getValue(actionKey);
  let region = REGIONS[GM_getValue("region")] ? GM_getValue("region") : defaultRegion;

  let action = savedAction
    ? savedAction
    : isSimple
      ? (AUTO ? ACTION.SIMPLIFIED : ACTION.TRADITIONAL)
      : (AUTO ? ACTION.TRADITIONAL : ACTION.SIMPLIFIED);

  // ---------------------------------------------------------------------------
  // 轉換器
  // ---------------------------------------------------------------------------
  let toTrad, toSimp;
  function buildConverters() {
    toTrad = OpenCC.ConverterFactory(
      OpenCC.Locale.from.cn,
      OpenCC.Locale.to[region],
      [CUSTOM_S2T]
    );
    toSimp = OpenCC.Converter({ from: region, to: "cn" });
  }
  buildConverters();

  const CJK = /[㐀-鿿豈-﫿]/;
  function convert(text) {
    if (!text || !CJK.test(text)) return text;
    if (action === ACTION.SIMPLIFIED) return toSimp(text);
    if (action === ACTION.TRADITIONAL) return toTrad(text);
    return text;
  }

  // ---------------------------------------------------------------------------
  // DOM 走訪
  // ---------------------------------------------------------------------------
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "TEXTAREA", "CODE", "PRE",
    "KBD", "SAMP", "SVG", "MATH", "IFRAME", "CANVAS",
  ]);
  const SKIP_SELECTOR = [...SKIP_TAGS].join(",").toLowerCase();
  const ATTRS = ["title", "alt", "placeholder", "aria-label"];
  const BUTTON_INPUT_TYPES = new Set(["button", "submit", "reset"]);

  const EDITABLE_SELECTOR = '[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"]';
  function isEditable(el) {
    return Boolean(el.isContentEditable || el.closest?.(EDITABLE_SELECTOR));
  }

  function isSkippedElement(el) {
    return SKIP_TAGS.has(el.tagName.toUpperCase()) || isEditable(el);
  }

  // 節點是否位於應跳過的區塊（script、可編輯區等）之內
  function insideSkipped(node) {
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!el) return false;
    return el.closest(SKIP_SELECTOR) !== null || isEditable(el);
  }

  // 記住自己寫回去的值：observer 收到自己造成的變更時直接略過，避免來回觸發
  const writtenText = new WeakMap();
  const writtenAttr = new WeakMap();

  // fromObserver：只有 observer 觸發時才略過自己寫過的值；切換方向重轉整頁時要照轉
  function convertTextNode(node, fromObserver) {
    if (fromObserver && writtenText.get(node) === node.data) return;
    const next = convert(node.data);
    if (next !== node.data) {
      node.data = next;
      writtenText.set(node, next);
    }
  }

  function convertAttributes(el, fromObserver) {
    for (const name of ATTRS) {
      const value = el.getAttribute(name);
      if (!value) continue;
      const written = writtenAttr.get(el);
      if (fromObserver && written && written[name] === value) continue;
      const next = convert(value);
      if (next !== value) {
        el.setAttribute(name, next);
        writtenAttr.set(el, Object.assign(written || {}, { [name]: next }));
      }
    }
    if (el.tagName === "INPUT" && BUTTON_INPUT_TYPES.has(el.type) && el.value) {
      const next = convert(el.value);
      if (next !== el.value) el.value = next;
    }
  }

  function convertTree(root) {
    if (action === ACTION.OFF || !root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      if (!insideSkipped(root)) convertTextNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    if (insideSkipped(root)) return;

    convertAttributes(root);
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            return isSkippedElement(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
          }
          return CJK.test(node.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        },
      }
    );
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) convertTextNode(node);
      else convertAttributes(node);
    }
  }

  // ---------------------------------------------------------------------------
  // 動態內容
  // ---------------------------------------------------------------------------
  let observer = null;
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((records) => {
      if (action === ACTION.OFF) return;
      for (const record of records) {
        if (record.type === "childList") {
          record.addedNodes.forEach((n) => n.isConnected && convertTree(n));
        } else if (record.type === "characterData") {
          if (!insideSkipped(record.target)) convertTextNode(record.target, true);
        } else if (record.type === "attributes") {
          if (!insideSkipped(record.target)) convertAttributes(record.target, true);
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });
  }

  // ---------------------------------------------------------------------------
  // 切換
  // ---------------------------------------------------------------------------
  function notify(text) {
    try {
      GM_notification({ text, title: "繁簡自動切換", timeout: 2500 });
    } catch (e) {
      console.info("[sc2tc]", text);
    }
  }

  function applyAction() {
    GM_setValue(actionKey, action);
    switch (action) {
      case ACTION.OFF:
        notify("已於該網域停用繁簡切換");
        location.reload();
        return;
      case ACTION.SIMPLIFIED:
        notify("已切换至简体中文");
        break;
      case ACTION.TRADITIONAL:
        notify("已切換至繁體中文（" + REGIONS[region] + "）");
        break;
    }
    convertTree(document.documentElement);
    startObserver();
  }

  function cycleAction() {
    if (isSimple) action = action - 1 < 1 ? 3 : action - 1;
    else action = action + 1 > 3 ? 1 : action + 1;
    applyAction();
  }

  function cycleRegion() {
    const keys = Object.keys(REGIONS);
    region = keys[(keys.indexOf(region) + 1) % keys.length];
    GM_setValue("region", region);
    notify("繁體地區：" + REGIONS[region]);
    // 已轉過的文字無法無損轉回，重新載入最乾淨
    if (action === ACTION.TRADITIONAL) location.reload();
    else buildConverters();
  }

  // ---------------------------------------------------------------------------
  // 輸入框內轉換（Ctrl+F8 時焦點在輸入框內）
  // ---------------------------------------------------------------------------
  let fieldToTrad = isSimple;

  function setFieldValue(el, value) {
    // 用原生 setter 並觸發 input 事件，React / Vue 等框架才會感知到變更
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function convertField(el) {
    const fn = fieldToTrad ? toTrad : toSimp;
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      setFieldValue(el, fn(el.value));
    } else {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const next = fn(node.data);
        if (next !== node.data) node.data = next;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    fieldToTrad = !fieldToTrad;
  }

  function isEditableField(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") return !BUTTON_INPUT_TYPES.has(el.type);
    return isEditable(el);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== SHORTCUT.key || e.ctrlKey !== SHORTCUT.ctrlKey) return;
    e.preventDefault();
    const el = document.activeElement;
    if (isEditableField(el)) {
      convertField(el);
    } else {
      action = action === ACTION.SIMPLIFIED ? ACTION.TRADITIONAL : ACTION.SIMPLIFIED;
      applyAction();
    }
  });

  GM_registerMenuCommand("繁簡切換【Ctrl+F8】", cycleAction);
  GM_registerMenuCommand("切換繁體地區（台灣／香港）", cycleRegion);

  // ---------------------------------------------------------------------------
  // 啟動
  // ---------------------------------------------------------------------------
  if ((AUTO || savedAction) && action !== ACTION.OFF) {
    convertTree(document.documentElement);
    startObserver();
  }
})();

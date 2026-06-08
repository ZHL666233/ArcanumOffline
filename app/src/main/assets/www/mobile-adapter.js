/**
 * mobile-adapter.js — Arcanum 移动端 UI 适配
 * 
 * 将桌面三栏布局转换为移动端友好的抽屉 + 折叠栏模式：
 *   - 左栏（资源列表） → 保持 DOM 原位，CSS transform 变为左侧滑出抽屉 (60%宽)
 *   - 右栏（日志）     → 同上，右侧滑出
 *   - 右栏（状态条）   → 底部折叠栏 (默认收起，显示摘要行)
 *   - 中栏（主内容）   → 全宽显示，顶部增加抽屉触发按钮
 *
 * 关键设计：不移动/克隆 Vue 管理的 DOM 元素，保证 Vue 事件绑定不丢失。
 * 在 index.html 的 </body> 前引入：<script src="mobile-adapter.js"></script>
 */
(function () {
    'use strict';

    // ======================== 配置 ========================
    var DRAWER_WIDTH = '60vw';
    var OVERLAY_OPACITY = 0.4;
    var TRANSITION_MS = 280;
    var BREAKPOINT = 1024;

    // ======================== 状态 ========================
    var leftOpen = false;
    var rightOpen = false;
    var vitalsExpanded = false;
    var runningExpanded = false;
    var quickbarCollapsed = true;  // 快捷栏默认折叠（移动端省空间）
    var overlay = null;
    var leftDrawerOrigin = null;   // 原始 .res-list 元素
    var rightDrawerOrigin = null;  // 原始 log 元素

    // ======================== 工具 ========================
    function $1(sel) { return document.querySelector(sel); }

    // ======================== 注入样式 ========================
    function injectStyles() {
        var css = [
            /* 桌面端：隐藏所有移动端元素 */
            '.mobile-overlay,',
            '.mobile-vitals-bar,',
            '.mobile-drawer-trigger { display:none; }',
        ].join('\n');

        // 所有移动端样式集中在一个媒体查询内
        css += '\n@media (max-width:' + BREAKPOINT + 'px) {\n' + [
            /* === 遮罩层 === */
            '  .mobile-overlay {',
            '    display:block;',
            '    position:fixed;inset:0;',
            '    background:rgba(0,0,0,' + OVERLAY_OPACITY + ');',
            '    z-index:29999;opacity:0;pointer-events:none;',
            '    transition:opacity ' + TRANSITION_MS + 'ms ease;',
            '  }',
            '  .mobile-overlay.active { opacity:1;pointer-events:auto; }',

            /* === 隐藏原始元素占位 === */
            '  .res-list { display:none !important; }',
            '  .vitals[data-v-5ab57996] { display:none !important; }',

            /* === 左抽屉（复用 .res-list 元素） === */
            '  .mobile-as-drawer-left {',
            '    display:block !important;',
            '    position:fixed !important;',
            '    top:0 !important; left:0 !important;',
            '    width:' + DRAWER_WIDTH + ' !important;',
            '    height:100vh !important; max-height:100vh !important;',
            '    margin:0 !important; padding:0 !important;',
            '    border:none !important; border-radius:0 !important;',
            '    z-index:30000 !important;',
            '    background:var(--background-color,#fafafa) !important;',
            '    box-shadow:none !important;',
            '    overflow-y:auto !important; overflow-x:hidden !important;',
            '    transform:translateX(-100%);',
            '    visibility:hidden; pointer-events:none;',
            '    transition:transform ' + TRANSITION_MS + 'ms ease, visibility 0ms ' + TRANSITION_MS + 'ms;',
            '    -webkit-overflow-scrolling:touch;',
            '  }',
            '  .mobile-as-drawer-left.active {',
            '    transform:translateX(0) !important;',
            '    box-shadow:0 0 16px rgba(0,0,0,0.25) !important;',
            '    visibility:visible; pointer-events:auto;',
            '    transition:transform ' + TRANSITION_MS + 'ms ease, visibility 0ms 0ms;',
            '  }',

            /* === 右抽屉（复用 log 元素） === */
            '  .mobile-as-drawer-right {',
            '    display:block !important;',
            '    position:fixed !important;',
            '    top:0 !important; right:0 !important;',
            '    width:' + DRAWER_WIDTH + ' !important;',
            '    height:100vh !important; max-height:100vh !important;',
            '    margin:0 !important; padding:0 !important;',
            '    border:none !important; border-radius:0 !important;',
            '    z-index:30000 !important;',
            '    background:var(--background-color,#fafafa) !important;',
            '    box-shadow:none !important;',
            '    overflow-y:auto !important; overflow-x:hidden !important;',
            '    transform:translateX(100%);',
            '    visibility:hidden; pointer-events:none;',
            '    transition:transform ' + TRANSITION_MS + 'ms ease, visibility 0ms ' + TRANSITION_MS + 'ms;',
            '    -webkit-overflow-scrolling:touch;',
            '  }',
            '  .mobile-as-drawer-right.active {',
            '    transform:translateX(0) !important;',
            '    box-shadow:0 0 16px rgba(0,0,0,0.25) !important;',
            '    visibility:visible; pointer-events:auto;',
            '    transition:transform ' + TRANSITION_MS + 'ms ease, visibility 0ms 0ms;',
            '  }',
            /* 抽屉内部去边距 + 底部留白确保可滚动到底 */
            '  .mobile-as-drawer-left .res-container { margin-right:0 !important; }',
            '  .mobile-as-drawer-left,',
            '  .mobile-as-drawer-right {',
            '    padding:0 !important; padding-bottom:60px !important;',
            '  }',
            '  .mobile-as-drawer-left > *,',
            '  .mobile-as-drawer-right > * {',
            '    padding-left:0 !important; padding-right:0 !important;',
            '    margin-left:0 !important; margin-right:0 !important;',
            '    max-height:none !important; overflow:visible !important;',
            '  }',

            /* === 主内容全宽 === */
            '  div.full div.game-main {',
            '    flex-direction:column !important;',
            '    max-height:none !important;',
            '  }',
            '  div.full div.game-mid {',
            '    flex-basis:100% !important;',
            '    max-height:none !important;',
            '    border-left:none !important;',
            '    border-right:none !important;',
            '  }',
            '  div.full { min-width:100vw !important; }',

            /* 触发按钮 */
            '  .mobile-drawer-trigger {',
            '    display:inline-block;',
            '    background:var(--header-background-color,#eee);',
            '    border:1px solid var(--separator-color,#aaa);',
            '    border-radius:var(--sm-radius,4px);',
            '    padding:1px 7px; margin:0 3px;',
            '    font-size:0.85em; cursor:pointer;',
            '    color:var(--button-text-color,#000);',
            '    line-height:1.5;',
            '  }',
            '  .mobile-drawer-trigger:active {',
            '    background:var(--accent-color-active,#797979);',
            '  }',

            /* "更多" 下拉菜单 */
            '  .mobile-more-dropdown {',
            '    display:none;',
            '    position:fixed; top:50%; left:50%;',
            '    transform:translate(-50%,-50%);',
            '    z-index:30100;',
            '    background:var(--background-color,#fafafa);',
            '    border:2px solid var(--separator-color,#aaa);',
            '    border-radius:var(--md-radius,6px);',
            '    padding:var(--md-gap,0.65em);',
            '    min-width:60vw; max-width:85vw;',
            '    max-height:70vh; overflow-y:auto;',
            '    box-shadow:0 4px 20px rgba(0,0,0,0.3);',
            '  }',
            '  .mobile-more-dropdown.active { display:block; }',
            '  .mobile-more-dropdown .dd-item {',
            '    display:block;',
            '    padding:10px 16px;',
            '    font-size:1.1em;',
            '    text-align:center;',
            '    border-bottom:1px solid var(--separator-color,#ccc);',
            '    cursor:pointer;',
            '    text-transform:capitalize;',
            '    color:var(--button-text-color,#000);',
            '  }',
            '  .mobile-more-dropdown .dd-item:last-child { border-bottom:none; }',
            '  .mobile-more-dropdown .dd-item:active {',
            '    background:var(--accent-color-active,#797979);',
            '  }',
            '  body.darkmode .mobile-more-dropdown {',
            '    background:var(--background-color,#1a1a1a);',
            '    color:#d7dadc;',
            '  }',
            '  body.darkmode .mobile-more-dropdown .dd-item {',
            '    color:#d7dadc;',
            '  }',

            /* topbar 更多按钮 */
            '  .mobile-topbar-more {',
            '    display:inline-block;',
            '    background:var(--header-background-color,#eee);',
            '    border:1px solid var(--separator-color,#aaa);',
            '    border-radius:var(--sm-radius,4px);',
            '    padding:1px 8px; margin:0 2px;',
            '    font-size:0.85em; cursor:pointer;',
            '    color:var(--button-text-color,#000);',
            '    line-height:1.3; white-space:nowrap;',
            '  }',
            '  .mobile-topbar-more:active {',
            '    background:var(--accent-color-active,#797979);',
            '  }',
            '  .mobile-topbar-dropdown {',
            '    display:none;',
            '    position:fixed; top:50%; left:50%;',
            '    transform:translate(-50%,-50%);',
            '    z-index:30100;',
            '    background:var(--background-color,#fafafa);',
            '    border:2px solid var(--separator-color,#aaa);',
            '    border-radius:var(--md-radius,6px);',
            '    padding:var(--md-gap,0.65em);',
            '    min-width:55vw; max-width:88vw;',
            '    max-height:75vh; overflow-y:auto;',
            '    box-shadow:0 4px 20px rgba(0,0,0,0.3);',
            '  }',
            '  .mobile-topbar-dropdown.active { display:block; }',
            '  .mobile-topbar-dropdown .tb-item {',
            '    display:block;',
            '    padding:9px 14px;',
            '    font-size:1em;',
            '    text-align:center;',
            '    border-bottom:1px solid var(--separator-color,#ccc);',
            '    cursor:pointer;',
            '    color:var(--button-text-color,#000);',
            '  }',
            '  .mobile-topbar-dropdown .tb-item:last-child { border-bottom:none; }',
            '  .mobile-topbar-dropdown .tb-item:active {',
            '    background:var(--accent-color-active,#797979);',
            '  }',
            '  body.darkmode .mobile-topbar-dropdown {',
            '    background:var(--background-color,#1a1a1a);',
            '    color:#d7dadc;',
            '  }',
            '  body.darkmode .mobile-topbar-dropdown .tb-item {',
            '    color:#d7dadc;',
            '  }',

            /* 加载画面主题化 */
            '  span.load-message {',
            '    display:flex !important;',
            '    justify-content:center; align-items:center;',
            '    width:100vw; height:100vh;',
            '    font-size:1.5em; letter-spacing:0.15em;',
            '    color:#d4a855 !important;',
            '    background:linear-gradient(160deg, #0d0d1a 0%, #1a1030 40%, #0f1225 100%) !important;',
            '    text-shadow:0 0 12px rgba(180,140,60,0.4);',
            '    animation:mobile-loading-pulse 2s ease-in-out infinite;',
            '  }',
            '  @keyframes mobile-loading-pulse {',
            '    0%,100% { opacity:0.85; }',
            '    50% { opacity:1; }',
            '  }',
            '  body.darkmode span.load-message {',
            '    background:linear-gradient(160deg, #08081a 0%, #120828 40%, #0a0e1c 100%) !important;',
            '  }',
            '  span.load-error {',
            '    color:#e05555 !important;',
            '  }',

            /* 禁止文本选中和系统长按菜单 */
            '  body {',
            '    -webkit-user-select:none !important;',
            '    user-select:none !important;',
            '    -webkit-touch-callout:none !important;',
            '    -webkit-tap-highlight-color:transparent !important;',
            '  }',
            '  input, textarea {',
            '    -webkit-user-select:text !important;',
            '    user-select:text !important;',
            '  }',

            /* === 物品提示悬浮窗 === */
            '  .item-popup {',
            '    max-width:92vw !important;',
            '    max-height:85vh !important;',
            '    overflow-y:auto !important;',
            '    overflow-x:hidden !important;',
            '    box-sizing:border-box !important;',
            '  }',
            /* 弹窗全屏 */
            '  div.popup, .popup {',
            '    left:0 !important; top:0 !important; right:auto !important;',
            '    margin:0 !important; transform:none !important;',
            '    width:100vw !important; height:100vh !important;',
            '    max-width:100vw !important; max-height:100vh !important;',
            '    min-width:0 !important;',
            '    padding:20px !important;',
            '    box-sizing:border-box !important;',
            '    overflow-y:auto !important;',
            '  }',
            '  div.popup button {',
            '    white-space:nowrap; flex-shrink:0;',
            '    padding:12px 20px; margin:6px;',
            '    font-size:1.05em; min-width:80px;',
            '  }',
            '  div.popup > div:first-child {',
            '    font-size:1em; line-height:1.6;',
            '    margin-bottom:16px; word-break:break-word;',
            '    flex:1;',
            '  }',
            '  .popup-close {',
            '    font-size:1.3em; padding:8px 12px;',
            '    z-index:10;',
            '  }',
            '  .item-popup {',
            '    column-count:1 !important;',
            '    column-width:auto !important;',
            '    width:auto !important;',
            '    min-width:0 !important;',
            '  }',
            '  .popup[data-v-bb944c55] {',
            '    max-width:100vw !important; max-height:100vh !important;',
            '  }',
            /* 弹窗直接显示无动画/过渡 */
            '  .item-popup, div.popup, .popup,',
            '  .fade-in, [class*="fade"] {',
            '    animation:none !important; animation-duration:0s !important;',
            '    transition:none !important; transition-duration:0s !important;',
            '    opacity:1 !important;',
            '  }',

            /* topbar 移动端排版 */
            '  .top-bar {',
            '    overflow-x:auto !important;',
            '    overflow-y:hidden !important;',
            '    -webkit-overflow-scrolling:touch;',
            '    scrollbar-width:none;',
            '    height:auto !important;',
            '    min-height:36px;',
            '    flex-wrap:nowrap !important;',
            '  }',
            '  .top-bar::-webkit-scrollbar { display:none; }',
            '  .top-bar .load-opts {',
            '    flex-shrink:0; min-width:auto; width:auto; gap:1px;',
            '  }',
            '  .top-bar .load-opts button,',
            '  .top-bar .items button,',
            '  .top-bar button {',
            '    width:auto !important; padding:2px 5px !important; font-size:0.72em !important;',
            '    white-space:nowrap !important; margin:0 1px !important;',
            '  }',
            '  .top-bar .items {',
            '    flex:0 0 auto !important;',
            '    flex-shrink:0 !important; min-width:auto; width:auto !important;',
            '    margin-left:1px; margin-right:1px;',
            '  }',
            '  .top-bar .link-bar {',
            '    flex-shrink:0; min-width:auto; width:auto;',
            '    overflow-x:visible !important; gap:1px;',
            '  }',
            '  .top-bar .link-bar a {',
            '    font-size:0.7em; padding:0 2px; white-space:nowrap;',
            '  }',
            /* 隐藏 topbar 次要元素（只在更多下拉中显示） */
            '  .top-bar .link-bar a { display:none !important; }',
            '  .mobile-topbar-hidden { display:none !important; }',

            /* 确保 ⋯ 更多按钮始终可见（粘在右侧） */
            '  .mobile-topbar-more {',
            '    flex-shrink:0 !important;',
            '    position:sticky !important;',
            '    right:0 !important;',
            '    z-index:5;',
            '  }',

            /* 底部状态栏 */
            '  .mobile-vitals-bar {',
            '    display:block;',
            '    position:relative; z-index:50;',
            '    border-top:1px solid var(--separator-color,#aaa);',
            '    background:var(--background-color,#fafafa);',
            '  }',
            '  .mobile-vitals-summary {',
            '    display:flex; flex-wrap:wrap; align-items:center;',
            '    padding:4px 8px; font-size:0.82em;',
            '    cursor:pointer; user-select:none; gap:6px;',
            '    min-height:28px;',
            '    background:var(--header-background-color,#eee);',
            '  }',
            '  .mobile-vitals-summary::after {',
            '    content:"▸"; margin-left:auto; font-size:0.9em;',
            '    transition:transform ' + TRANSITION_MS + 'ms ease;',
            '    color:var(--quiet-text-color,#888);',
            '  }',
            '  .mobile-vitals-summary.expanded::after {',
            '    transform:rotate(90deg);',
            '  }',
            '  .mobile-vitals-stat {',
            '    display:inline-flex; align-items:center; gap:2px;',
            '    white-space:nowrap;',
            '  }',
            '  .mobile-vitals-stat .vicon {',
            '    width:10px; height:10px; border-radius:2px;',
            '    display:inline-block; flex-shrink:0;',
            '  }',
            '  .mobile-vitals-panel {',
            '    max-height:0; overflow:hidden;',
            '    transition:max-height ' + TRANSITION_MS + 'ms ease;',
            '  }',
            '  .mobile-vitals-panel.expanded {',
            '    max-height:45vh; overflow-y:auto;',
            '  }',
            /* quickbar 折叠 */
            '  .mobile-quickbar-toggle {',
            '    height:8px; cursor:pointer;',
            '    background:var(--header-background-color,#eee);',
            '    border-top:1px solid var(--separator-color,#aaa);',
            '    user-select:none; position:relative;',
            '  }',
            '  .mobile-quickbar-toggle::after {',
            '    content:"";',
            '    position:absolute; top:50%; left:50%;',
            '    transform:translate(-50%,-50%);',
            '    width:30px; height:3px;',
            '    border-radius:2px;',
            '    background:var(--quiet-text-color,#888);',
            '  }',
            '  .quickbar {',
            '    max-width:100vw !important;',
            '    overflow-x:auto !important; overflow-y:hidden !important;',
            '    -webkit-overflow-scrolling:touch;',
            '    scrollbar-width:none;',
            '    flex-wrap:nowrap !important;',
            '    flex-basis:auto !important;',
            '    padding:2px 0;',
            '  }',
            '  .quickbar::-webkit-scrollbar { display:none; }',
            '  .quickbar.mobile-quickbar-collapsed {',
            '    max-height:0 !important;',
            '    overflow:hidden !important;',
            '    padding-top:0 !important; padding-bottom:0 !important;',
            '    margin:0 !important;',
            '    border:none !important;',
            '    transition:max-height ' + TRANSITION_MS + 'ms ease;',
            '  }',
            '  .quickslot {',
            '    flex-shrink:0;',
            '    font-size:x-large !important;',
            '    min-width:2em; min-height:2em;',
            '    margin:2px 3px !important;',
            '  }',

            /* 运行任务折叠栏 */
            '  .mobile-running-bar {',
            '    display:block;',
            '    position:relative; z-index:50;',
            '    border-top:1px solid var(--separator-color,#aaa);',
            '    background:var(--background-color,#fafafa);',
            '  }',
            '  .mobile-running-summary {',
            '    display:flex; flex-wrap:wrap; align-items:center;',
            '    padding:3px 8px; font-size:0.78em;',
            '    cursor:pointer; user-select:none; gap:4px;',
            '    min-height:24px;',
            '    background:var(--header-background-color,#eee);',
            '    color:var(--light-text-color,#5d5d5d);',
            '  }',
            '  .mobile-running-summary::after {',
            '    content:"▸"; margin-left:auto; font-size:0.85em;',
            '    transition:transform ' + TRANSITION_MS + 'ms ease;',
            '    color:var(--quiet-text-color,#888);',
            '  }',
            '  .mobile-running-summary.expanded::after {',
            '    transform:rotate(90deg);',
            '  }',
            '  .mobile-running-panel {',
            '    max-height:0; overflow:hidden;',
            '    transition:max-height ' + TRANSITION_MS + 'ms ease;',
            '  }',
            '  .mobile-running-panel.expanded {',
            '    max-height:40vh; overflow-y:auto;',
            '    padding:var(--sm-gap,0.32em);',
            '  }',
            '  .mobile-running-panel .running {',
            '    display:flex; flex-flow:column nowrap;',
            '    font-size:0.85em;',
            '  }',
            '  .mobile-running-panel .separate-run {',
            '    display:flex; flex-flow:row nowrap; gap:3px;',
            '    justify-content:center; align-items:center;',
            '    padding:3px 2px;',
            '    border-bottom:1px solid var(--separator-color,#aaa);',
            '    margin-bottom:3px;',
            '  }',
            '  .mobile-running-panel .separate-run .btn-sm {',
            '    font-size:0.68em; padding:2px 5px;',
            '    margin:0; white-space:nowrap; flex-shrink:1;',
            '    min-width:0;',
            '  }',
            '  .mobile-running-panel .separate-run .btnMenu {',
            '    font-size:0.75em; padding:2px 6px;',
            '  }',
            '  .mobile-running-panel .relative {',
            '    display:flex; align-items:center;',
            '    padding:2px 4px;',
            '  }',
            '  body.darkmode .mobile-running-summary {',
            '    background:var(--header-background-color,#3a3a3a);',
            '  }',

            /* darkmode */
            '  body.darkmode .mobile-vitals-summary {',
            '    background:var(--header-background-color,#3a3a3a);',
            '  }',
            '  body.darkmode .mobile-drawer-trigger {',
            '    background:var(--header-background-color,#3a3a3a);',
            '    color:#d7dadc;',
            '  }',
            '  body.darkmode .mobile-as-drawer-left,',
            '  body.darkmode .mobile-as-drawer-right {',
            '    background:var(--background-color,#1a1a1a) !important;',
            '  }',
        ].join('\n') + '\n}';

        var styleEl = document.createElement('style');
        styleEl.id = 'mobile-adapter-css';
        styleEl.textContent = css;
        document.head.appendChild(styleEl);
    }

    // ======================== 创建遮罩 ========================
    function createOverlay() {
        var el = document.createElement('div');
        el.className = 'mobile-overlay';
        el.addEventListener('click', closeAllDrawers);
        document.body.appendChild(el);
        return el;
    }

    // ======================== 触发按钮 ========================
    function createTriggerButtons() {
        var container = document.createElement('span');
        container.style.cssText = 'display:inline-flex;align-items:center;gap:2px;';

        var leftBtn = document.createElement('span');
        leftBtn.className = 'mobile-drawer-trigger';
        leftBtn.id = 'mobile-trigger-left';
        leftBtn.textContent = '资源';
        leftBtn.title = '资源列表';
        leftBtn.addEventListener('click', toggleLeft);

        var rightBtn = document.createElement('span');
        rightBtn.className = 'mobile-drawer-trigger';
        rightBtn.id = 'mobile-trigger-right';
        rightBtn.textContent = '日志';
        rightBtn.title = '日志';
        rightBtn.addEventListener('click', toggleRight);

        container.appendChild(leftBtn);
        container.appendChild(rightBtn);
        return container;
    }

    // ======================== 底部状态栏 ========================
    function createVitalsBar() {
        var bar = document.createElement('div');
        bar.className = 'mobile-vitals-bar';
        bar.id = 'mobile-vitals-bar';

        var summary = document.createElement('div');
        summary.className = 'mobile-vitals-summary';
        summary.id = 'mobile-vitals-summary';
        summary.textContent = '状态';
        summary.addEventListener('click', toggleVitals);

        var panel = document.createElement('div');
        panel.className = 'mobile-vitals-panel';
        panel.id = 'mobile-vitals-panel';

        bar.appendChild(summary);
        bar.appendChild(panel);
        return bar;
    }

    // ======================== 运行任务折叠栏 ========================
    function createRunningBar() {
        var bar = document.createElement('div');
        bar.className = 'mobile-running-bar';
        bar.id = 'mobile-running-bar';

        var summary = document.createElement('div');
        summary.className = 'mobile-running-summary';
        summary.id = 'mobile-running-summary';
        summary.textContent = '运行中';
        summary.addEventListener('click', toggleRunning);

        var panel = document.createElement('div');
        panel.className = 'mobile-running-panel';
        panel.id = 'mobile-running-panel';

        bar.appendChild(summary);
        bar.appendChild(panel);
        return bar;
    }

    function toggleRunning() {
        runningExpanded = !runningExpanded;
        var summary = document.getElementById('mobile-running-summary');
        var panel = document.getElementById('mobile-running-panel');
        if (summary) summary.classList.toggle('expanded', runningExpanded);
        if (panel) panel.classList.toggle('expanded', runningExpanded);
        if (runningExpanded) syncRunningPanel();
    }

    var _runningSlotEls = null;
    function updateRunningSummary() {
        var runningEl = document.querySelector('.vitals[data-v-5ab57996] .running');
        var summary = document.getElementById('mobile-running-summary');
        if (!summary) return;

        if (!runningEl) {
            if (summary.textContent !== '运行中') summary.textContent = '运行中';
            _runningSlotEls = null;
            return;
        }

        var slots = runningEl.querySelectorAll('.relative');
        var count = slots.length;

        // 首次或数量变化时重建
        if (!_runningSlotEls || _runningSlotEls.length !== count) {
            summary.innerHTML = '';
            _runningSlotEls = [];
            for (var i = 0; i < count; i++) {
                var span = document.createElement('span');
                span.className = 'mobile-running-stat';
                if (i > 0) summary.appendChild(document.createTextNode(' · '));
                summary.appendChild(span);
                _runningSlotEls.push(span);
            }
            var tail2 = document.createElement('span');
            summary.appendChild(tail2);
        }

        // 仅当内容变化时更新
        for (var j = 0; j < count; j++) {
            var slot = slots[j];
            var stopBtn = slot.querySelector('.stop');
            var sp = slot.querySelector('span');
            var text = sp ? (sp.textContent || '').trim() : '空闲';
            var isRunning = stopBtn && !stopBtn.disabled;
            var el = _runningSlotEls[j];
            var newState = text + '|' + (isRunning ? '1' : '0');
            if (newState !== el._lastState) {
                el._lastState = newState;
                el.textContent = text;
                if (isRunning) {
                    el.style.color = 'var(--accent-color-hover,#dba659)';
                    el.style.fontWeight = 'bold';
                } else {
                    el.style.color = '';
                    el.style.fontWeight = '';
                }
            }
        }
    }

    var _runningPanelHash = '';
    function syncRunningPanel() {
        var vitalsEl = document.querySelector('.vitals[data-v-5ab57996]');
        var panel = document.getElementById('mobile-running-panel');
        if (!vitalsEl || !panel) return;

        // 快速哈希检测原始内容是否变化，避免不必要的重建
        var runningEl = vitalsEl.querySelector('.running');
        var actionsRow = vitalsEl.querySelector('.separate-run');
        var newHash = (runningEl ? runningEl.innerHTML.length : 0) + '|' + (actionsRow ? actionsRow.innerHTML.length : 0);
        if (newHash === _runningPanelHash && panel.children.length > 0) return;
        _runningPanelHash = newHash;

        panel.innerHTML = '';

        // 复制操作按钮行（全部停止/魔印/自动聚焦/菜单）
        var actionsRow = vitalsEl.querySelector('.separate-run');
        if (actionsRow) {
            var actionsClone = actionsRow.cloneNode(true);
            // 绑定点击事件：克隆按钮 → 触发原始按钮
            var origBtns = actionsRow.querySelectorAll('button');
            var cloneBtns = actionsClone.querySelectorAll('button');
            for (var b = 0; b < Math.min(origBtns.length, cloneBtns.length); b++) {
                (function (orig, cln) {
                    cln.addEventListener('click', function (e) {
                        e.stopPropagation();
                        orig.click();
                    });
                })(origBtns[b], cloneBtns[b]);
            }
            panel.appendChild(actionsClone);
        }

        // 复制运行中的任务槽
        var runningEl = vitalsEl.querySelector('.running');
        if (runningEl) {
            var clone = runningEl.cloneNode(true);
            // 绑定停止按钮事件
            var origStops = runningEl.querySelectorAll('.stop');
            var cloneStops = clone.querySelectorAll('.stop');
            for (var s = 0; s < Math.min(origStops.length, cloneStops.length); s++) {
                (function (orig, cln) {
                    cln.addEventListener('click', function (e) {
                        e.stopPropagation();
                        orig.click();
                    });
                })(origStops[s], cloneStops[s]);
            }
            panel.appendChild(clone);
        }
    }

    // ======================== topbar 更多按钮 ========================
    var _topbarMoreDone = false;
    function setupTopbarMore(topbarEl) {
        if (!topbarEl || _topbarMoreDone) return;
        _topbarMoreDone = true;

        // 创建下拉面板
        var dropdown = document.createElement('div');
        dropdown.className = 'mobile-topbar-dropdown';
        dropdown.id = 'mobile-topbar-dropdown';
        document.body.appendChild(dropdown);

        // 创建 ⋯ 按钮
        var moreBtn = document.createElement('span');
        moreBtn.className = 'mobile-topbar-more';
        moreBtn.textContent = '⋯';
        moreBtn.title = '更多操作';

        // 收集 topbar 内所有可交互元素（每次从 live DOM 查询）
        function collectButtons() {
            var liveTopbar = document.querySelector('.top-bar');
            if (!liveTopbar) liveTopbar = topbarEl;
            var items = [];
            var seen = {};
            // 遍历 load-opts, items, link-bar 三个区域
            var areas = liveTopbar.querySelectorAll('.load-opts, .items, .link-bar');
            for (var si = 0; si < areas.length; si++) {
                var kids = areas[si].querySelectorAll('button, a, .text-button, [onclick]');
                for (var ki = 0; ki < kids.length; ki++) {
                    var el = kids[ki];
                    var txt = (el.textContent || '').trim();
                    if (!txt) continue;
                    var key = txt + '|' + el.tagName;
                    if (seen[key]) continue;
                    seen[key] = true;
                    items.push({ el: el, text: txt, type: el.tagName === 'A' ? 'link' : 'button' });
                }
                // ⚙ 设置按钮
                var sps = areas[si].querySelectorAll('span');
                for (var sp = 0; sp < sps.length; sp++) {
                    if ((sps[sp].textContent || '').indexOf('⚙') >= 0 && sps[sp].parentElement.tagName !== 'BUTTON') {
                        if (!seen['设置|SPAN']) {
                            seen['设置|SPAN'] = true;
                            items.push({ el: sps[sp], text: '设置', type: 'button' });
                        }
                    }
                }
            }
            // 排序
            var ORDER = ['保存','加载','获取存档','大厅存档','加载存档','快进',
                         'discord','wiki','reddit','test site','设置','⚙',
                         'save','load','get save','hall save','load save'];
            items.sort(function (a, b) {
                var ai = ORDER.length, bi = ORDER.length;
                var at = a.text.toLowerCase(), bt = b.text.toLowerCase();
                for (var oi = 0; oi < ORDER.length; oi++) {
                    if (at.indexOf(ORDER[oi]) >= 0) ai = Math.min(ai, oi);
                    if (bt.indexOf(ORDER[oi]) >= 0) bi = Math.min(bi, oi);
                }
                return ai - bi;
            });
            return items;
        }

        function refreshDropdown() {
            var items = collectButtons();
            // 去重（避免同一按钮被多次收集）
            var seen = {};
            var unique = [];
            for (var ui = 0; ui < items.length; ui++) {
                var key = items[ui].text + '|' + items[ui].type;
                if (!seen[key]) {
                    seen[key] = true;
                    unique.push(items[ui]);
                }
            }
            items = unique;

            if (items.length === 0) {
                dropdown.innerHTML = '<div class="tb-item" style="color:var(--quiet-text-color)">(无操作)</div>';
                return;
            }
            var html = '';
            for (var i = 0; i < items.length; i++) {
                html += '<div class="tb-item" data-idx="' + i + '">' + escapeHtml(items[i].text) + '</div>';
            }
            dropdown.innerHTML = html;

            var ddItems = dropdown.querySelectorAll('.tb-item');
            for (var j = 0; j < ddItems.length; j++) {
                ddItems[j].addEventListener('click', function (e) {
                    e.stopPropagation();
                    var idx = parseInt(this.getAttribute('data-idx'));
                    var currentItems = collectButtons();
                    if (currentItems[idx]) {
                        var target = currentItems[idx].el;
                        if (target.tagName === 'A') {
                            window.open(target.href, '_blank');
                        } else {
                            target.click();
                        }
                    }
                    closeTopbarDropdown();
                });
            }
        }

        function openTopbarDropdown(e) {
            if (e) { e.stopPropagation(); e.preventDefault(); }
            refreshDropdown();
            dropdown.classList.add('active');
            // 显示透明遮罩（复用 drawer overlay）
            if (overlay) {
                overlay.classList.add('active');
                overlay._tbMenuOpen = true;
            }
        }

        function closeTopbarDropdown() {
            dropdown.classList.remove('active');
            if (overlay && overlay._tbMenuOpen) {
                overlay.classList.remove('active');
                overlay._tbMenuOpen = false;
            }
        }

        moreBtn.addEventListener('click', function (e) {
            if (dropdown.classList.contains('active')) {
                closeTopbarDropdown();
            } else {
                openTopbarDropdown(e);
            }
        });

        // 点遮罩关闭
        if (overlay) {
            overlay.addEventListener('click', function () {
                if (overlay._tbMenuOpen) closeTopbarDropdown();
            });
        }

        // 插入到 topbar 末尾
        topbarEl.appendChild(moreBtn);

        // 隐藏次要元素（从 live DOM）
        var liveTop = document.querySelector('.top-bar') || topbarEl;
        var linkBar = liveTop.querySelector('.link-bar');
        if (linkBar) {
            var links = linkBar.querySelectorAll('a');
            for (var li = 0; li < links.length; li++) {
                links[li].classList.add('mobile-topbar-hidden');
            }
            var allBtns = linkBar.querySelectorAll('button, span');
            for (var bi = 0; bi < allBtns.length; bi++) {
                if ((allBtns[bi].textContent || '').indexOf('⚙') >= 0) {
                    allBtns[bi].classList.add('mobile-topbar-hidden');
                }
            }
        }
        // 隐藏快进按钮
        var itemsEl = liveTop.querySelector('.items');
        if (itemsEl) {
            var ffBtn = itemsEl.querySelector('button');
            if (ffBtn) ffBtn.classList.add('mobile-topbar-hidden');
        }
        // 隐藏大厅存档（仅显示在更多菜单）
        var loadOpts = liveTop.querySelector('.load-opts');
        if (loadOpts) {
            var allLoadBtns = loadOpts.querySelectorAll('button, .text-button');
            for (var lb = 0; lb < allLoadBtns.length; lb++) {
                var txt = (allLoadBtns[lb].textContent || '').trim();
                if (txt === '大厅存档' || txt.toLowerCase().indexOf('hall save') >= 0) {
                    allLoadBtns[lb].classList.add('mobile-topbar-hidden');
                }
            }
        }

        // 存引用以便关闭
        moreBtn._dropdown = dropdown;
    }

    // ======================== 抽屉控制 ========================
    function toggleLeft(e) {
        if (e) { e.stopPropagation(); e.preventDefault(); }
        if (rightOpen) closeRight();
        leftOpen = !leftOpen;
        if (leftDrawerOrigin) {
            leftDrawerOrigin.classList.toggle('active', leftOpen);
        }
        overlay.classList.toggle('active', leftOpen || rightOpen);
    }

    function toggleRight(e) {
        if (e) { e.stopPropagation(); e.preventDefault(); }
        if (leftOpen) closeLeft();
        rightOpen = !rightOpen;
        if (rightDrawerOrigin) {
            rightDrawerOrigin.classList.toggle('active', rightOpen);
        }
        overlay.classList.toggle('active', leftOpen || rightOpen);
    }

    function closeLeft() {
        leftOpen = false;
        if (leftDrawerOrigin) leftDrawerOrigin.classList.remove('active');
        overlay.classList.toggle('active', rightOpen);
    }

    function closeRight() {
        rightOpen = false;
        if (rightDrawerOrigin) rightDrawerOrigin.classList.remove('active');
        overlay.classList.toggle('active', leftOpen);
    }

    function closeAllDrawers() {
        leftOpen = false;
        rightOpen = false;
        if (leftDrawerOrigin) leftDrawerOrigin.classList.remove('active');
        if (rightDrawerOrigin) rightDrawerOrigin.classList.remove('active');
        if (overlay) {
            overlay.classList.remove('active');
            overlay._moreMenuOpen = false;
        }
        dismissTouchHover();
        // 也关闭 "更多" 下拉和 topbar 下拉
        var moreDD = document.getElementById('mobile-more-dropdown');
        if (moreDD) moreDD.classList.remove('active');
        var tbDD = document.getElementById('mobile-topbar-dropdown');
        if (tbDD) tbDD.classList.remove('active');
        if (overlay) overlay._tbMenuOpen = false;
    }

    // ======================== "更多" 菜单（menu-items 过多时折叠） ========================
    function setupMoreMenu(menuItemsContainer) {
        var menuItems = menuItemsContainer.querySelectorAll('.menu-item');
        if (menuItems.length <= 5) return; // 5个以内不需要折叠

        // 创建下拉面板
        var dropdown = document.createElement('div');
        dropdown.className = 'mobile-more-dropdown';
        dropdown.id = 'mobile-more-dropdown';
        document.body.appendChild(dropdown);

        // 创建 "⋯" 按钮
        var moreBtn = document.createElement('span');
        moreBtn.className = 'mobile-drawer-trigger';
        moreBtn.textContent = '⋯';
        moreBtn.title = '更多';
        moreBtn.style.marginLeft = '2px';

        // 更新下拉面板内容
        function refreshDropdown() {
            var items = menuItemsContainer.querySelectorAll('.menu-item');
            var html = '';
            for (var i = 0; i < items.length; i++) {
                var text = (items[i].textContent || '').trim();
                html += '<div class="dd-item" data-idx="' + i + '">' + escapeHtml(text) + '</div>';
            }
            dropdown.innerHTML = html;

            // 绑定点击事件
            var ddItems = dropdown.querySelectorAll('.dd-item');
            for (var j = 0; j < ddItems.length; j++) {
                ddItems[j].addEventListener('click', function (e) {
                    e.stopPropagation();
                    var idx = parseInt(this.getAttribute('data-idx'));
                    var currentItems = menuItemsContainer.querySelectorAll('.menu-item');
                    if (currentItems[idx]) {
                        // 触发原始菜单项的 click
                        currentItems[idx].click();
                    }
                    closeMoreDropdown();
                });
            }
        }

        function openMoreDropdown(e) {
            if (e) { e.stopPropagation(); e.preventDefault(); }
            refreshDropdown();
            dropdown.classList.add('active');
            // 同时显示遮罩
            if (overlay) {
                overlay.classList.add('active');
                overlay._moreMenuOpen = true;
            }
        }

        function closeMoreDropdown() {
            dropdown.classList.remove('active');
            if (overlay && overlay._moreMenuOpen) {
                overlay.classList.remove('active');
                overlay._moreMenuOpen = false;
            }
        }

        moreBtn.addEventListener('click', function (e) {
            if (dropdown.classList.contains('active')) {
                closeMoreDropdown();
            } else {
                openMoreDropdown(e);
            }
        });

        // 点遮罩时也关闭下拉
        if (overlay) {
            var origClick = overlay.onclick;
            overlay.addEventListener('click', function () {
                closeMoreDropdown();
            });
        }

        // 插入 "⋯" 按钮到 menu-items 末尾
        menuItemsContainer.appendChild(moreBtn);
    }

    // ======================== quickbar 折叠 ========================
    function createQuickbarToggle(quickbar) {
        var toggle = document.createElement('div');
        toggle.className = 'mobile-quickbar-toggle';
        if (quickbarCollapsed) toggle.classList.add('collapsed');
        toggle.addEventListener('click', function () {
            quickbarCollapsed = !quickbarCollapsed;
            toggle.classList.toggle('collapsed', quickbarCollapsed);
            quickbar.classList.toggle('mobile-quickbar-collapsed', quickbarCollapsed);
        });
        return toggle;
    }

    // ======================== 底部状态栏控制 ========================
    function toggleVitals() {
        vitalsExpanded = !vitalsExpanded;
        var summary = document.getElementById('mobile-vitals-summary');
        var panel = document.getElementById('mobile-vitals-panel');
        if (summary) summary.classList.toggle('expanded', vitalsExpanded);
        if (panel) panel.classList.toggle('expanded', vitalsExpanded);
    }

    // ======================== 内容同步 ========================
    function findLogElement() {
        var gameMain = $1('.game-main');
        if (!gameMain) return null;
        var children = gameMain.children;
        // game-main 子元素顺序：resources, game-mid, vitals, log(或其他)
        for (var i = children.length - 1; i >= 0; i--) {
            var child = children[i];
            if (child.classList.contains('game-mid')) continue;
            if (child.classList.contains('res-list')) continue;
            if (child.classList.contains('vitals')) continue;
            if (child.querySelector && (child.querySelector('.vitals[data-v-5ab57996]'))) continue;
            // 剩余的就是 log
            if (child.querySelector && (child.querySelector('.log-item') || child.querySelector('.outlog') || child.querySelector('.log-title'))) {
                return child;
            }
        }
        return null;
    }

    var _vitalsStatEls = null;
    function updateVitalsSummary() {
        var vitalsEl = document.querySelector('.vitals[data-v-5ab57996]');
        var summary = document.getElementById('mobile-vitals-summary');
        if (!summary) return;

        if (!vitalsEl) {
            if (summary.textContent !== '状态') summary.textContent = '状态';
            _vitalsStatEls = null;
            return;
        }

        var statbars = vitalsEl.querySelectorAll('.statbar');
        var count = Math.min(statbars.length, 6);

        // 首次或数量变化时重建 DOM 骨架
        if (!_vitalsStatEls || _vitalsStatEls.length !== count) {
            summary.innerHTML = '';
            _vitalsStatEls = [];
            for (var i = 0; i < count; i++) {
                var span = document.createElement('span');
                span.className = 'mobile-vitals-stat';
                var icon = document.createElement('span');
                icon.className = 'vicon';
                span.appendChild(icon);
                span.appendChild(document.createTextNode(' '));
                summary.appendChild(span);
                // 存储上一次的值用于脏检查
                _vitalsStatEls.push({ el: span, icon: icon, txt: span.childNodes[1], lastText: '', lastColor: '' });
            }
            var tail = document.createElement('span');
            summary.appendChild(tail);
        }

        // 仅当数值变化时才更新（彻底消除闪烁）
        for (var j = 0; j < count; j++) {
            var bar = statbars[j];
            var nameEl = bar.querySelector('.name');
            var textEl = bar.querySelector('.bar-text');
            var fillEl = bar.querySelector('.barfill');
            if (!nameEl || !textEl) continue;

            var name = (nameEl.textContent || '').trim();
            var value = (textEl.textContent || '').trim();
            var newText = name + ' ' + value;

            var color = 'orange';
            if (fillEl) {
                try {
                    var bg = window.getComputedStyle(fillEl).backgroundColor;
                    // 规范化颜色字符串（统一格式避免误判）
                    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') color = bg;
                } catch (e) {}
            }

            var rec = _vitalsStatEls[j];
            if (newText !== rec.lastText) {
                rec.txt.textContent = newText;
                rec.lastText = newText;
            }
            if (color !== rec.lastColor) {
                rec.icon.style.background = color;
                rec.lastColor = color;
            }
        }
    }

    function syncVitalsPanel() {
        var vitalsEl = document.querySelector('.vitals[data-v-5ab57996]');
        var panel = document.getElementById('mobile-vitals-panel');
        if (!vitalsEl || !panel) return;
        var statbars = vitalsEl.querySelector('.statbars');
        if (statbars) {
            panel.innerHTML = '';
            var clone = statbars.cloneNode(true);
            panel.appendChild(clone);
        }
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // ======================== Hover → Touch 转换 ========================
    // 桌面端通过 mouseenter 弹出物品详情/提示。
    // 移动端无 hover，此模块用长按/短按区分：
    //   短按 (<500ms)  → 等同于鼠标单击，click 正常触发
    //   长按 (≥500ms)  → 派发 mouseenter 显示悬浮信息，阻止 click
    //   触摸其他位置    → 派发 mouseleave 关闭悬浮
    //   滑动/滚屏      → 自动关闭悬浮

    var hoveredEl = null;
    var longPressTimer = null;
    var longPressTarget = null;
    var longPressFired = false;
    var touchStartX = 0;
    var touchStartY = 0;
    var LONG_PRESS_MS = 500;
    var MOVE_THRESHOLD = 10;

    function dispatchMouseEnter(el) {
        var evt = new MouseEvent('mouseenter', {
            bubbles: false,
            cancelable: true,
            view: window,
            clientX: 0, clientY: 0
        });
        el.dispatchEvent(evt);
    }

    function dispatchMouseLeave(el) {
        var evt = new MouseEvent('mouseleave', {
            bubbles: false,
            cancelable: true,
            view: window,
            clientX: 0, clientY: 0
        });
        el.dispatchEvent(evt);
    }

    function clearLongPressTimer() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }

    function dismissTouchHover() {
        if (hoveredEl) {
            dispatchMouseLeave(hoveredEl);
            hoveredEl = null;
        }
        clearLongPressTimer();
        longPressTarget = null;
        longPressFired = false;
    }

    function setupTouchHover() {
        // touchstart：记录起始位置，启动长按计时器
        document.addEventListener('touchstart', function (e) {
            var touch = e.touches[0];
            if (!touch) return;
            var target = document.elementFromPoint(touch.clientX, touch.clientY);
            if (!target) return;

            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            longPressTarget = target;
            longPressFired = false;
            clearLongPressTimer();

            longPressTimer = setTimeout(function () {
                // 长按强制显示悬浮窗
                longPressFired = true;
                var el = longPressTarget;
                if (!el) return;
                dismissTouchHover();
                dispatchMouseEnter(el);
                hoveredEl = el;
                blockNextClick(el);
            }, LONG_PRESS_MS);
        }, { passive: false });

        // touchend：短按 → 手动触发 click
        document.addEventListener('touchend', function (e) {
            var wasLong = longPressFired;
            var el = longPressTarget;
            clearLongPressTimer();
            longPressFired = false;

            if (!wasLong && el) {
                if (hoveredEl && hoveredEl !== el) dismissTouchHover();
                e.preventDefault(); // 阻止浏览器合成 click（避免双击）
                el.click();
            }
            longPressTarget = null;
        }, { passive: false });

        // touchmove：移动超过阈值 → 取消长按；总是关闭 hover
        document.addEventListener('touchmove', function (e) {
            var touch = e.touches[0];
            if (touch && (Math.abs(touch.clientX - touchStartX) > MOVE_THRESHOLD ||
                          Math.abs(touch.clientY - touchStartY) > MOVE_THRESHOLD)) {
                clearLongPressTimer();
                longPressTarget = null;
                longPressFired = false;
            }
            dismissTouchHover();
        }, { passive: true });

        // 点击遮罩时关闭 hover
        document.addEventListener('click', function (e) {
            if (e.target.classList && e.target.classList.contains('mobile-overlay')) {
                dismissTouchHover();
            }
        });
    }

    function blockNextClick(el) {
        var cleaned = false;
        var cleanup = function () {
            if (cleaned) return;
            cleaned = true;
            el.removeEventListener('click', blocker, true);
        };
        var blocker = function (ev) {
            ev.stopPropagation();
            ev.preventDefault();
            cleanup();
        };
        el.addEventListener('click', blocker, true);
        setTimeout(cleanup, 500);
        return cleanup;
    }

    // ======================== 悬浮窗视口修正 ========================
    function constrainPopups() {
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        var margin = 8;

        // 扫描 body 下所有元素，找 fixed/absolute 且 z-index >= 500 的弹窗
        var all = document.body.querySelectorAll('div,span,section,aside');
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            var cs = window.getComputedStyle(el);
            if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            var zi = parseInt(cs.zIndex) || 0;
            if (zi < 500) continue;  // 只处理高 z-index 弹窗，避免干扰正常元素

            var rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;

            // 完全在视口内 → 跳过
            if (rect.left >= 0 && rect.right <= vw && rect.top >= 0 && rect.bottom <= vh) continue;

            // 仅约束超宽/超高，不动 left/top/right（避免破坏弹窗定位）
            if (rect.right > vw || rect.left < 0) {
                el.style.setProperty('max-width', (vw - margin * 2) + 'px', 'important');
                el.style.setProperty('overflow-x', 'auto', 'important');
            }
            if (rect.bottom > vh || rect.top < 0) {
                el.style.setProperty('max-height', (vh - margin * 2) + 'px', 'important');
                el.style.setProperty('overflow-y', 'auto', 'important');
            }
        }
    }

    // ======================== 激活抽屉样式 ========================
    function activateDrawers() {
        // 左抽屉：复用 .res-list
        leftDrawerOrigin = $1('.res-list');
        if (leftDrawerOrigin) {
            leftDrawerOrigin.classList.add('mobile-as-drawer-left');
        }

        // 右抽屉：复用 log
        rightDrawerOrigin = findLogElement();
        if (rightDrawerOrigin) {
            rightDrawerOrigin.classList.add('mobile-as-drawer-right');
        }
    }

    // ======================== 布局重组 ========================
    var _layoutDone = false;
    function setupLayout(gameMain, quickbar) {
        if (_layoutDone) return;
        _layoutDone = true;

        overlay = createOverlay();

        // 激活抽屉样式（给原始元素加 class）
        activateDrawers();

        // 启用 hover→touch 转换（让桌面 hover 悬浮窗在移动端可用）
        setupTouchHover();

        // 触发按钮：插入到 game-mid 的 menu-items 后面
        var menuItems = gameMain.querySelector('.game-mid .menu-items');
        if (menuItems) {
            menuItems.appendChild(createTriggerButtons());
            // 菜单项过多时，增加 "⋯" 更多按钮
            setupMoreMenu(menuItems);
        } else {
            var gameMid = gameMain.querySelector('.game-mid');
            if (gameMid) {
                var wrapper = document.createElement('div');
                wrapper.style.cssText = 'text-align:center;padding:4px 0;';
                wrapper.appendChild(createTriggerButtons());
                gameMid.insertBefore(wrapper, gameMid.firstChild);
            }
        }

        // quickbar 折叠切换（默认折叠，通过 ▲/▼ 小把手展开）
        if (quickbar && quickbar.parentNode) {
            var qbToggle = createQuickbarToggle(quickbar);
            quickbar.parentNode.insertBefore(qbToggle, quickbar);
            if (quickbarCollapsed) {
                quickbar.classList.add('mobile-quickbar-collapsed');
            }

            // 运行中任务折叠栏（插入在 quickbar 和 vitals 之间）
            var runningBar = createRunningBar();
            quickbar.parentNode.insertBefore(runningBar, quickbar.nextSibling);
        }

        // 底部状态栏（放在 runningBar 之后）
        var vitalsBar = createVitalsBar();
        if (quickbar && quickbar.parentNode) {
            quickbar.parentNode.insertBefore(vitalsBar, runningBar.nextSibling);
        } else {
            document.body.appendChild(vitalsBar);
        }

        // 首次同步（vitals 可能延迟渲染，重试几次）
        updateVitalsSummary();
        syncVitalsPanel();
        updateRunningSummary();
        var retryCount = 0;
        var retrySync = setInterval(function () {
            var ve = document.querySelector('.vitals[data-v-5ab57996]');
            if (ve && ve.querySelector('.running')) {
                updateRunningSummary();
                syncVitalsPanel();
                clearInterval(retrySync);
            }
            if (++retryCount > 20) clearInterval(retrySync);
        }, 500);

        // 定期刷新摘要 + 悬浮窗位置修正
        setInterval(function () {
            updateVitalsSummary();
            updateRunningSummary();
            constrainPopups();
        }, 1500);

        // 监听 vitals DOM 变化同步面板
        var vitalsEl = document.querySelector('.vitals[data-v-5ab57996]');
        if (vitalsEl) {
            var obs = new MutationObserver(function () {
                updateVitalsSummary();
                updateRunningSummary();
                if (vitalsExpanded) syncVitalsPanel();
                if (runningExpanded) syncRunningPanel();
                constrainPopups();
            });
            obs.observe(vitalsEl, { childList: true, subtree: true, characterData: true });
        }

        // 监听 log 变化（确保始终在抽屉中可见）
        var logEl = findLogElement();
        if (logEl) {
            var logObs = new MutationObserver(function () {});
            logObs.observe(logEl, { childList: true, subtree: true, characterData: true });
        }

        // 监听 body 新弹窗 → 立即修正位置
        var bodyPopObs = new MutationObserver(function (mutations) {
            for (var m2 = 0; m2 < mutations.length; m2++) {
                var added2 = mutations[m2].addedNodes;
                for (var a2 = 0; a2 < added2.length; a2++) {
                    if (added2[a2].nodeType === 1) {
                        var node = added2[a2];
                        if (node.classList && (node.classList.contains('popup') || node.classList.contains('item-popup'))) {
                            constrainPopups();
                            break;
                        }
                        if (node.querySelector && node.querySelector('.popup, .item-popup')) {
                            constrainPopups();
                            break;
                        }
                    }
                }
            }
        });
        bodyPopObs.observe(document.body, { childList: true, subtree: true });

        // topbar 更多按钮
        var topbarEl = document.querySelector('.top-bar');
        if (topbarEl) {
            setupTopbarMore(topbarEl);
        }

        console.log('[mobile-adapter] ✓ 左抽屉(资源) | 右抽屉(日志) | 底部状态栏 | topbar更多');

        // ======================== 存档加载后自动恢复 ========================
        // 定期检测（兜底 MutationObserver 漏掉的情况）
        var _healthCheck = setInterval(function () {
            var bar = document.getElementById('mobile-vitals-bar');
            var gm = document.querySelector('.game-main');
            if (!bar && gm) {
                // 注入元素丢失但 game-main 还在 → 重新适配
                _layoutDone = false;
                _topbarMoreDone = false;
                _vitalsStatEls = null;
                _runningSlotEls = null;
                _runningPanelHash = '';
                var qb = document.querySelector('.quickbar');
                if (qb) setupLayout(gm, qb);
            }
            if (bar && !document.body.contains(bar)) {
                // 元素脱离 DOM → 清理引用
                _layoutDone = false;
                _topbarMoreDone = false;
                _vitalsStatEls = null;
                _runningSlotEls = null;
                _runningPanelHash = '';
            }
        }, 3000);

        var vueRoot = document.getElementById('vueRoot');
        if (vueRoot) {
            var reloadWatcher = new MutationObserver(function (mutations) {
                for (var m = 0; m < mutations.length; m++) {
                    var added = mutations[m].addedNodes;
                    var removed = mutations[m].removedNodes;
                    for (var a = 0; a < added.length; a++) {
                        if (added[a].nodeType === 1 && (added[a].classList.contains('full') || added[a].querySelector('.game-main'))) {
                            // DOM 重建：game-main 重新出现
                            _layoutDone = false;
                            _topbarMoreDone = false;
                            _vitalsStatEls = null;
                            _runningSlotEls = null;
                            _runningPanelHash = '';
                            var gm = document.querySelector('.game-main');
                            var qb = document.querySelector('.quickbar');
                            if (gm && qb) {
                                // 延迟一点等 Vue 渲染完
                                setTimeout(function () { setupLayout(gm, qb); }, 300);
                            }
                            return;
                        }
                    }
                    for (var r = 0; r < removed.length; r++) {
                        if (removed[r].nodeType === 1 && (removed[r].classList.contains('full') || removed[r].querySelector('.game-main'))) {
                            // game-main 被移除（准备重建）
                            _layoutDone = false;
                            _topbarMoreDone = false;
                            _vitalsStatEls = null;
                            _runningSlotEls = null;
                            _runningPanelHash = '';
                            return;
                        }
                    }
                }
            });
            reloadWatcher.observe(vueRoot, { childList: true });
        }
    }

    // ======================== 启动 ========================
    function init() {
        injectStyles();

        var attempts = 0;
        var MAX = 50;

        function trySetup() {
            var gm = $1('.game-main');
            var qb = $1('.quickbar');
            if (gm && qb && gm.children.length >= 3) {
                setupLayout(gm, qb);
                return;
            }
            if (++attempts < MAX) {
                setTimeout(trySetup, 200);
            }
        }

        // MutationObserver 加速
        var earlyObs = new MutationObserver(function () {
            var gm = $1('.game-main');
            var qb = $1('.quickbar');
            if (gm && qb && gm.children.length >= 3) {
                earlyObs.disconnect();
                if (!document.getElementById('mobile-vitals-bar')) {
                    setupLayout(gm, qb);
                }
            }
        });
        earlyObs.observe(document.body, { childList: true, subtree: true });
        setTimeout(function () { earlyObs.disconnect(); }, 15000);

        // 轮询兜底
        setTimeout(function () {
            if (!document.getElementById('mobile-vitals-bar')) {
                trySetup();
            }
        }, 400);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

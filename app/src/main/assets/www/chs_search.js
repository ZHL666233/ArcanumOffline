/**
 * chs_search.js — 搜索框直接中文搜索 v4
 * 原理：修改游戏实体的 name getter，让 name 返回中文。
 * 游戏原有的搜索函数（检查 e.name）输入中文时能匹配到。
 */

(function () {
    'use strict';

    let patched = false;

    // ============================================================
    // 英文→中文 翻译
    // ============================================================
    function toCn(engText) {
        if (!engText || typeof engText !== 'string') return null;
        const clean = engText.replace(/^[^a-zA-Z0-9]+/, '').trim();
        if (!clean) return null;

        // translateNoun 是 core.js 提供的 O(1) 查询
        if (window.translateNoun) {
            const r = window.translateNoun(clean);
            if (r) return r;
        }
        // 直接查 cnResourceNames
        if (window.cnResourceNames) {
            if (window.cnResourceNames[clean]) return window.cnResourceNames[clean];
            const key = Object.keys(window.cnResourceNames).find(
                k => k.toLowerCase() === clean.toLowerCase()
            );
            if (key) return window.cnResourceNames[key];
        }
        // 查 _staticIndex
        if (window._staticIndex) {
            const nk = clean.toLowerCase();
            if (window._staticIndex[nk]) return window._staticIndex[nk];
        }
        return null;
    }

    // ============================================================
    // 补丁：修改 name getter
    // ============================================================
    function applyPatch() {
        if (patched) return;
        try {
            const g = window.game;
            if (!g || !g.state || !g.state.getData) return;

            const sample = g.state.getData('apprentice') || g.state.getData('lore');
            if (!sample) return;

            let proto = Object.getPrototypeOf(sample);
            let desc = null, target = null;
            while (proto && proto !== Object.prototype) {
                const d = Object.getOwnPropertyDescriptor(proto, 'name');
                if (d && d.get) { desc = d; target = proto; break; }
                proto = Object.getPrototypeOf(proto);
            }
            if (!target || !desc) { console.warn('[CN] 找不到 name getter'); return; }

            const origGet = desc.get;
            const origSet = desc.set;

            Object.defineProperty(target, 'name', {
                get: function () {
                    const en = origGet.call(this);
                    if (!en || typeof en !== 'string') return en;
                    // 已完全翻译为中文
                    if (/^[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+$/.test(en)) return en;
                    // 中英文混合（如 "精金Shell"），翻译其中的英文部分
                    if (/[\u4e00-\u9fff]/.test(en) && /[a-zA-Z]/.test(en)) {
                        const mixed = en;
                        // 查找所有连续的英文字段并翻译
                        const translated = mixed.replace(/[a-zA-Z]+/g, function (match) {
                            const c = toCn(match);
                            return c || match;
                        });
                        if (translated !== mixed) return translated;
                    }
                    // 纯英文，整体翻译
                    const cn = toCn(en);
                    if (cn) return cn;
                    return en;
                },
                set: function (v) {
                    if (origSet) origSet.call(this, v);
                    else if (this._name !== undefined) this._name = v;
                },
                configurable: true, enumerable: true
            });

            // cnItem 修补不再需要，name getter 只返回中文
            patched = true;
            console.log('[CN Search] 中文搜索已启用！直接在搜索框输入中文即可查找');
        } catch (e) {
            console.warn('[CN] 补丁失败:', e.message);
        }
    }

    // 等待游戏加载
    let tries = 0;
    function loop() {
        if (patched) return;
        applyPatch();
        if (!patched && ++tries < 120) setTimeout(loop, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(loop, 2000));
    } else {
        setTimeout(loop, 2000);
    }

    // ============================================================
    // 诊断工具
    // ============================================================
    window.CN_Search = {
        test: function () {
            console.log('=== CN Search 诊断 ===');
            console.log('补丁状态:', patched ? '已生效' : '未生效');
            console.log('translateNoun:', !!window.translateNoun);
            console.log('cnResourceNames 条目:', window.cnResourceNames ? Object.keys(window.cnResourceNames).length : 0);
            if (window.game && window.game.state) {
                for (let id of ['apprentice', 'lore', 'firelore', 'gold', 'arcana trickster']) {
                    const e = window.game.state.getData(id);
                    if (e) console.log(`  ${id}: name="${e.name}"`);
                }
            }
            console.log('=== 诊断结束 ===');
        }
    };

})();

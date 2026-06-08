// export_helper.js — Blob 导出存档修复
// 拦截游戏使用 Blob URL 的存档导出，转为 AndroidFileSaver 原生文件保存
(function () {
    if (typeof AndroidFileSaver === 'undefined' || !AndroidFileSaver.saveFile) {
        console.error('[ExportHelper] AndroidFileSaver 不可用');
        return;
    }
    if (window.__arcExportInjected) return;
    window.__arcExportInjected = true;

    // 核心：将 blob URL 转为 base64 调用原生保存
    function handleBlobUrl(blobUrl, filename) {
        filename = filename || 'Wizrobe.json';
        fetch(blobUrl)
            .then(function (res) { return res.blob(); })
            .then(function (blob) {
                var reader = new FileReader();
                reader.onload = function () {
                    var base64 = reader.result.split(',')[1];
                    AndroidFileSaver.saveFile(filename, base64);
                };
                reader.readAsDataURL(blob);
            })
            .catch(function (err) {
                console.error('[ExportHelper] 导出失败:', err);
            });
    }

    // 1. 拦截 <a> 标签点击（捕获阶段）
    document.addEventListener('click', function (e) {
        var a = e.target.closest('a');
        if (a && a.href && a.href.startsWith('blob:')) {
            e.preventDefault();
            e.stopPropagation();
            handleBlobUrl(a.href, a.download || 'Wizrobe.json');
        }
    }, true);

    // 2. 重写 HTMLAnchorElement.prototype.click
    var _origAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
        if (this.href && this.href.startsWith('blob:')) {
            handleBlobUrl(this.href, this.download || 'Wizrobe.json');
            return;
        }
        _origAnchorClick.call(this);
    };

    // 3. 重写 window.open
    var _origOpen = window.open;
    window.open = function (url) {
        if (typeof url === 'string' && url.startsWith('blob:')) {
            handleBlobUrl(url, 'Wizrobe.json');
            return null;
        }
        return _origOpen.apply(window, arguments);
    };

    // 4. 重写 location.assign / replace
    var _origAssign = location.assign.bind(location);
    var _origReplace = location.replace.bind(location);
    location.assign = function (url) {
        if (typeof url === 'string' && url.startsWith('blob:')) {
            handleBlobUrl(url, 'Wizrobe.json');
            return;
        }
        _origAssign(url);
    };
    location.replace = function (url) {
        if (typeof url === 'string' && url.startsWith('blob:')) {
            handleBlobUrl(url, 'Wizrobe.json');
            return;
        }
        _origReplace(url);
    };
})();

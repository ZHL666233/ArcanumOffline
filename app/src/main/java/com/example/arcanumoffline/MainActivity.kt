package com.example.arcanumoffline

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.util.Log
import android.webkit.*
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.OutputStream

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var scriptManager: ScriptManager

    // 文件上传回调
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private val REQUEST_FILE_CHOOSER = 1001

    // 待保存的 Blob 数据
    private var pendingFileData: Pair<String, String>? = null

    // 文件创建结果回调
    private val createFileLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == RESULT_OK) {
            result.data?.data?.let { uri ->
                pendingFileData?.let { (filename, base64Data) ->
                    saveBase64ToUri(uri, base64Data)
                    pendingFileData = null
                }
            }
        } else {
            pendingFileData = null
        }
    }

    // 虚拟域名，用于替代 file:// 协议加载本地资源，使 origin 合法
    companion object {
        private const val LOCAL_DOMAIN = "https://appassets.local"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        scriptManager = ScriptManager(this)
        scriptManager.loadDefaultScriptsFromAssets(this)

        webView = findViewById(R.id.webview)

        setupWebView()
    }

    private fun setupWebView() {
        val webSettings: WebSettings = webView.settings
        webSettings.javaScriptEnabled = true
        webSettings.domStorageEnabled = true
        webSettings.allowFileAccess = false
        webSettings.cacheMode = WebSettings.LOAD_CACHE_ELSE_NETWORK
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            webSettings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        webView.addJavascriptInterface(WebAppInterface(), "AndroidFileSaver")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback

                val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                }
                try {
                    startActivityForResult(intent, REQUEST_FILE_CHOOSER)
                } catch (e: Exception) {
                    this@MainActivity.filePathCallback?.onReceiveValue(null)
                    this@MainActivity.filePathCallback = null
                    return false
                }
                return true
            }
        }

        webView.setDownloadListener { url, userAgent, contentDisposition, mimetype, contentLength ->
            val downloadUrl = when {
                url.startsWith("blob:") -> {
                    // Blob URL → 通过 JS 接口获取 base64 数据后保存
                    Log.d("MainActivity", "Blob 下载触发: $url")
                    webView.evaluateJavascript(
                        "javascript:(function(){var x=new XMLHttpRequest();x.open('GET','$url',false);x.responseType='blob';" +
                        "x.send();var r=new FileReader();r.readAsDataURL(x.response);r.onload=function(){" +
                        "AndroidFileSaver.saveBlob(r.result.split(',')[1],'${URLUtil.guessFileName(url, contentDisposition, "save.json")}');};})()",
                        null
                    )
                    return@setDownloadListener
                }
                url.startsWith("data:") -> {
                    // data: URL → 提取 base64 保存
                    val comma = url.indexOf(',')
                    if (comma > 0) {
                        val b64 = url.substring(comma + 1)
                        val filename = URLUtil.guessFileName("save.json", contentDisposition, "application/json")
                        pendingFileData = filename to b64
                        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            type = "application/json"
                            putExtra(Intent.EXTRA_TITLE, filename)
                        }
                        createFileLauncher.launch(intent)
                    }
                    return@setDownloadListener
                }
                url.startsWith("http://") || url.startsWith("https://") -> url
                else -> {
                    Log.w("MainActivity", "不支持的下载链接: $url")
                    return@setDownloadListener
                }
            }
            try {
                val request = DownloadManager.Request(Uri.parse(downloadUrl))
                request.setMimeType(mimetype)
                request.addRequestHeader("User-Agent", userAgent)
                request.setDescription("正在下载文件...")
                request.setTitle(URLUtil.guessFileName(downloadUrl, contentDisposition, mimetype))
                request.allowScanningByMediaScanner()
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, URLUtil.guessFileName(downloadUrl, contentDisposition, mimetype))

                val downloadManager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                downloadManager.enqueue(request)
                Toast.makeText(this@MainActivity, "下载已开始，请查看通知栏", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                e.printStackTrace()
                Toast.makeText(this@MainActivity, "下载失败: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }

        // ★ 核心修复：shouldInterceptRequest 拦截虚拟域名请求，直接从 assets 读文件
        //   用 HTTPS 域名替代 file://，origin 合法 → ES Module / import() / fetch() 全部正常工作
        webView.webViewClient = object : WebViewClient() {

            // 阻止内部导航打开外部浏览器
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                // 本地资源 → WebView 内部处理
                if (url.startsWith(LOCAL_DOMAIN)) return false
                // 外部链接（Discord/Wiki/Reddit 等） → 让用户选择浏览器
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    try {
                        val chooser = Intent.createChooser(Intent(Intent.ACTION_VIEW, Uri.parse(url)), "选择浏览器")
                        startActivity(chooser)
                    } catch (e: Exception) {
                        Toast.makeText(this@MainActivity, "无法打开链接", Toast.LENGTH_SHORT).show()
                    }
                    return true
                }
                return false
            }

            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url ?: return null
                val urlStr = url.toString()

                // 1) 虚拟域名 → 从 assets 读取本地文件
                if (urlStr.startsWith(LOCAL_DOMAIN)) {
                    val assetPath = urlStr.removePrefix("$LOCAL_DOMAIN/")
                    return loadFromAssets(assetPath) ?: run {
                        // 2) 缺失的图标 → 返回占位 SVG
                        if (assetPath.contains("img/icons/")) {
                            Log.d("MainActivity", "🔇 图标占位: $assetPath")
                            val svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\" fill=\"gray\"/></svg>"
                            val stream = ByteArrayInputStream(svg.toByteArray(Charsets.UTF_8))
                            WebResourceResponse("image/svg+xml", "UTF-8", stream)
                        } else null
                    }
                }

                // 3) 拦截 GitHub API 请求（离线版不需要更新检查）
                if (urlStr.contains("api.github.com") || urlStr.contains("github.io")) {
                    Log.d("MainActivity", "🔇 拦截 GitHub: $urlStr")
                    val emptyJson = "{}"
                    val stream = ByteArrayInputStream(emptyJson.toByteArray(Charsets.UTF_8))
                    return WebResourceResponse("application/json", "UTF-8", stream)
                }

                return super.shouldInterceptRequest(view, request)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                webView.postDelayed({ injectAllScripts() }, 500)
            }
        }

        webView.loadUrl("$LOCAL_DOMAIN/www/index.html")
    }

    /** 从 assets 读取文件并返回 WebResourceResponse，自动推断 MIME 类型 */
    private fun loadFromAssets(assetPath: String): WebResourceResponse? {
        return try {
            val stream = assets.open(assetPath)
            val mime = guessMimeType(assetPath)
            WebResourceResponse(mime, "UTF-8", stream)
        } catch (e: Exception) {
            null
        }
    }

    private fun guessMimeType(path: String): String {
        return when {
            path.endsWith(".js")   -> "application/javascript"
            path.endsWith(".mjs")  -> "application/javascript"
            path.endsWith(".json") -> "application/json"
            path.endsWith(".css")  -> "text/css"
            path.endsWith(".html") -> "text/html"
            path.endsWith(".svg")  -> "image/svg+xml"
            path.endsWith(".png")  -> "image/png"
            path.endsWith(".jpg") || path.endsWith(".jpeg") -> "image/jpeg"
            path.endsWith(".gif")  -> "image/gif"
            path.endsWith(".webp") -> "image/webp"
            path.endsWith(".woff") -> "font/woff"
            path.endsWith(".woff2")-> "font/woff2"
            path.endsWith(".ttf")  -> "font/ttf"
            else -> "application/octet-stream"
        }
    }

    private fun injectAllScripts() {
        val enabledCodes = scriptManager.getEnabledScriptCodes()
        Log.d("MainActivity", "正在注入 ${enabledCodes.size} 个已启用的脚本")
        for (code in enabledCodes) {
            val escaped = escapeJavaScript(code)
            val js = "try{ new Function($escaped)(); }catch(e){ console.error('脚本执行错误:', e); }"
            webView.evaluateJavascript(js, null)
        }

        // ★ 始终注入脚本管理按钮到游戏设置面板
        injectScriptManagerButton()
        // ★ 注入存档导出修复（Blob → AndroidFileSaver）
        injectSaveFix()
    }

    /** 修复存档导出：拦截 Blob URL 创建，改用 Android 原生文件保存 */
    private fun injectSaveFix() {
        val js = """
(function() {
    if (window.__saveFixInjected) return;
    window.__saveFixInjected = true;
    
    var _origCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function(blob) {
        if (blob.type && blob.type.indexOf('json') >= 0) {
            var reader = new FileReader();
            reader.onload = function() {
                var b64 = reader.result.split(',')[1];
                if (window.AndroidFileSaver && window.AndroidFileSaver.saveBlob) {
                    window.AndroidFileSaver.saveBlob(b64, 'Wizrobe.json');
                }
            };
            reader.readAsDataURL(blob);
            return 'blob:handled';
        }
        return _origCreateObjectURL(blob);
    };
})();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    /** 注入 JS 代码，在游戏设置面板中添加「脚本管理」按钮 */
    private fun injectScriptManagerButton() {
        val js = """
(function() {
    if (window.__arcanumBtnInjected) return;
    window.__arcanumBtnInjected = true;

    var btnId = '__arcanum_script_btn__';

    function addButton() {
        if (document.getElementById(btnId)) return;

        // 查找设置弹窗: div.settings.popup
        var popup = document.querySelector('.settings.popup');
        if (!popup) return;

        // 找到 .menu-content（设置项容器），按钮放这里最显眼
        var content = popup.querySelector('.menu-content');
        if (!content) return;

        var btn = document.createElement('button');
        btn.id = btnId;
        btn.textContent = '📜 脚本管理';
        btn.style.cssText = 'display:block;width:100%;padding:10px 0;margin-top:10px;' +
            'background:#3a3a5c;color:#ccc;border:1px solid #555;border-radius:4px;' +
            'cursor:pointer;font-size:14px;text-align:center;';

        btn.onmouseenter = function() { btn.style.background='#4a4a7c'; btn.style.color='#fff'; };
        btn.onmouseleave = function() { btn.style.background='#3a3a5c'; btn.style.color='#ccc'; };
        btn.onclick = function(e) {
            e.preventDefault(); e.stopPropagation();
            try {
                if (window.AndroidFileSaver && window.AndroidFileSaver.openScriptManager) {
                    window.AndroidFileSaver.openScriptManager();
                }
            } catch(err) { console.error(err); }
        };

        content.appendChild(btn);
    }

    // 延迟尝试（设置面板是点击后才渲染的）
    setTimeout(addButton, 2000);
    setTimeout(addButton, 5000);

    // MutationObserver 监听 DOM 变化
    var observer = new MutationObserver(function() { addButton(); });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    private fun escapeJavaScript(code: String): String {
        return JSONObject.quote(code)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_FILE_CHOOSER) {
            filePathCallback?.let {
                val results = if (resultCode == RESULT_OK) {
                    data?.data?.let { arrayOf(it) } ?: arrayOf()
                } else {
                    null
                }
                it.onReceiveValue(results)
                filePathCallback = null
            }
        }
    }

    private fun saveBase64ToUri(uri: Uri, base64Data: String) {
        try {
            val bytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT)
            contentResolver.openOutputStream(uri)?.use { outputStream ->
                outputStream.write(bytes)
                runOnUiThread {
                    Toast.makeText(this, "存档已保存", Toast.LENGTH_LONG).show()
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
            runOnUiThread {
                Toast.makeText(this, "保存失败: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private inner class WebAppInterface {
        @JavascriptInterface
        fun saveFile(filename: String, base64Data: String) {
            runOnUiThread {
                pendingFileData = filename to base64Data
                val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_TITLE, filename)
                }
                createFileLauncher.launch(intent)
            }
        }

        @JavascriptInterface
        fun saveBlob(base64Data: String, filename: String) {
            runOnUiThread {
                pendingFileData = filename to base64Data
                val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "application/json"
                    putExtra(Intent.EXTRA_TITLE, filename)
                }
                createFileLauncher.launch(intent)
            }
        }

        @JavascriptInterface
        fun openScriptManager() {
            runOnUiThread {
                startActivity(Intent(this@MainActivity, ScriptListActivity::class.java))
            }
        }
    }

    override fun onPause() {
        super.onPause()
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            AlertDialog.Builder(this)
                .setTitle("退出游戏")
                .setMessage("确定要退出游戏吗？")
                .setPositiveButton("确定") { _, _ -> super.onBackPressed() }
                .setNegativeButton("取消", null)
                .show()
        }
    }
}
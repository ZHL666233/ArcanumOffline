package com.example.arcanumoffline

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.UUID


class ScriptManager(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("script_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()
    private val scriptsKey = "scripts"

    /**
     * 获取所有脚本
     */
    fun getAllScripts(): MutableList<ScriptItem> {
        val json = prefs.getString(scriptsKey, "") ?: ""
        if (json.isEmpty()) return mutableListOf()
        val type = object : TypeToken<MutableList<ScriptItem>>() {}.type
        return gson.fromJson(json, type)
    }

    /**
     * 保存所有脚本（私有）
     */
    private fun saveAllScripts(scripts: List<ScriptItem>) {
        val json = gson.toJson(scripts)
        prefs.edit().putString(scriptsKey, json).apply()
    }

    /**
     * 添加新脚本（可选择是否启用）
     */
    fun addScript(name: String, code: String, enabled: Boolean = false) {
        val scripts = getAllScripts().toMutableList()
        val id = UUID.randomUUID().toString()
        scripts.add(ScriptItem(id, name, code, enabled))
        saveAllScripts(scripts)
    }

    /**
     * 更新脚本
     */
    fun updateScript(id: String, name: String, code: String, enabled: Boolean) {
        val scripts = getAllScripts().toMutableList()
        val index = scripts.indexOfFirst { it.id == id }
        if (index != -1) {
            scripts[index] = ScriptItem(id, name, code, enabled)
            saveAllScripts(scripts)
        }
    }

    /**
     * 删除脚本
     */
    fun deleteScript(id: String) {
        val scripts = getAllScripts().toMutableList()
        scripts.removeAll { it.id == id }
        saveAllScripts(scripts)
    }

    /**
     * 获取所有已启用的脚本代码
     */
    fun getEnabledScriptCodes(): List<String> {
        return getAllScripts().filter { it.enabled }.map { it.code }
    }

    /**
     * 清空所有脚本
     */
    fun clearAllScripts() {
        saveAllScripts(emptyList())
    }

    /**
     * 从 assets/default_scripts 文件夹加载默认脚本（仅在脚本列表为空时加载）
     */
    fun loadDefaultScriptsFromAssets(context: Context) {
        // 如果已有脚本，跳过，避免覆盖用户修改
        if (getAllScripts().isNotEmpty()) return

        val assetManager = context.assets
        val folder = "default_scripts"
        try {
            val files = assetManager.list(folder) ?: return
            for (fileName in files) {
                if (fileName.endsWith(".js")) {
                    // 读取文件内容
                    val inputStream = assetManager.open("$folder/$fileName")
                    val reader = BufferedReader(InputStreamReader(inputStream))
                    val code = reader.readLines().joinToString("\n")
                    reader.close()
                    inputStream.close()

                    // 移除扩展名作为脚本名称
                    val scriptName = fileName.removeSuffix(".js")
                    // 默认启用脚本
                    addScript(scriptName, code, enabled = true)
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
package com.example.arcanumoffline

import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.io.BufferedReader
import java.io.InputStreamReader

class ScriptListActivity : AppCompatActivity() {

    private lateinit var recyclerView: RecyclerView
    private lateinit var adapter: ScriptAdapter
    private lateinit var scriptManager: ScriptManager
    private var scriptList: MutableList<ScriptItem> = mutableListOf()

    private val openDocumentLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { importScriptFromUri(it) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_script_list)

        scriptManager = ScriptManager(this)
        scriptList = scriptManager.getAllScripts().toMutableList()

        recyclerView = findViewById(R.id.recyclerView)
        recyclerView.layoutManager = LinearLayoutManager(this)

        adapter = ScriptAdapter(scriptList, object : ScriptAdapter.OnItemClickListener {
            override fun onCheckedChanged(item: ScriptItem, isChecked: Boolean) {
                scriptManager.updateScript(item.id, item.name, item.code, isChecked)
            }

            override fun onEditClick(item: ScriptItem) {
                val intent = Intent(this@ScriptListActivity, ScriptEditActivity::class.java).apply {
                    putExtra("script_id", item.id)
                    putExtra("script_name", item.name)
                    putExtra("script_code", item.code)
                    putExtra("script_enabled", item.enabled)
                }
                startActivity(intent)
            }

            override fun onDeleteClick(item: ScriptItem) {
                AlertDialog.Builder(this@ScriptListActivity)
                    .setTitle("删除脚本")
                    .setMessage("确定要删除脚本 \"${item.name}\" 吗？")
                    .setPositiveButton("删除") { _, _ ->
                        scriptManager.deleteScript(item.id)
                        refreshList()
                    }
                    .setNegativeButton("取消", null)
                    .show()
            }
        })
        recyclerView.adapter = adapter

        findViewById<Button>(R.id.btnAddScript).setOnClickListener {
            startActivity(Intent(this, ScriptEditActivity::class.java))
        }

        findViewById<Button>(R.id.btnImportScript).setOnClickListener {
            openDocumentLauncher.launch("*/*")
        }
    }

    override fun onResume() {
        super.onResume()
        refreshList()
    }

    private fun refreshList() {
        scriptList.clear()
        scriptList.addAll(scriptManager.getAllScripts())
        adapter.notifyDataSetChanged()
    }

    private fun importScriptFromUri(uri: Uri) {
        try {
            contentResolver.openInputStream(uri)?.use { inputStream ->
                val reader = BufferedReader(InputStreamReader(inputStream))
                val code = reader.readLines().joinToString("\n")
                reader.close()

                var fileName = uri.lastPathSegment ?: "imported.js"
                val lastSlash = fileName.lastIndexOf('/')
                if (lastSlash != -1) fileName = fileName.substring(lastSlash + 1)

                val inputEditText = android.widget.EditText(this).apply { setText(fileName) }
                AlertDialog.Builder(this)
                    .setTitle("导入脚本")
                    .setView(inputEditText)
                    .setPositiveButton("导入") { _, _ ->
                        val name = inputEditText.text.toString().trim().ifEmpty { fileName }
                        scriptManager.addScript(name, code)
                        refreshList()
                        Toast.makeText(this, "脚本已导入", Toast.LENGTH_SHORT).show()
                    }
                    .setNegativeButton("取消", null)
                    .show()
            }
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(this, "导入失败: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }
}
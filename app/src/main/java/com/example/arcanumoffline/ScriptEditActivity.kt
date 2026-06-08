package com.example.arcanumoffline

import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class ScriptEditActivity : AppCompatActivity() {

    private lateinit var editName: EditText
    private lateinit var editCode: EditText
    private var scriptId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_script_edit)

        editName = findViewById(R.id.editName)
        editCode = findViewById(R.id.editCode)
        val btnSave = findViewById<Button>(R.id.btnSave)
        val btnCancel = findViewById<Button>(R.id.btnCancel)
        val btnPaste = findViewById<Button>(R.id.btnPaste)

        // 获取传入数据
        intent?.let {
            scriptId = it.getStringExtra("script_id")
            editName.setText(it.getStringExtra("script_name"))
            editCode.setText(it.getStringExtra("script_code"))
        }

        btnSave.setOnClickListener { saveScript() }
        btnCancel.setOnClickListener { finish() }
        btnPaste.setOnClickListener { pasteFromClipboard() }
    }

    private fun saveScript() {
        val name = editName.text.toString().trim()
        val code = editCode.text.toString().trim()

        if (name.isEmpty()) {
            Toast.makeText(this, "请输入脚本名称", Toast.LENGTH_SHORT).show()
            return
        }
        if (code.isEmpty()) {
            Toast.makeText(this, "请输入脚本代码", Toast.LENGTH_SHORT).show()
            return
        }

        val manager = ScriptManager(this)
        if (scriptId == null) {
            manager.addScript(name, code)
            Toast.makeText(this, "脚本已添加", Toast.LENGTH_SHORT).show()
        } else {
            val enabled = intent.getBooleanExtra("script_enabled", false)
            manager.updateScript(scriptId!!, name, code, enabled)
            Toast.makeText(this, "脚本已更新", Toast.LENGTH_SHORT).show()
        }
        finish()
    }

    private fun pasteFromClipboard() {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.primaryClip?.getItemAt(0)?.text?.let { pasteData ->
            val current = editCode.text.toString()
            editCode.setText(if (current.isEmpty()) pasteData else "$current\n$pasteData")
            editCode.setSelection(editCode.length())
        } ?: Toast.makeText(this, "剪贴板无文本内容", Toast.LENGTH_SHORT).show()
    }
}
package com.example.arcanumoffline

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

class ScriptAdapter(
    private val scripts: MutableList<ScriptItem>,
    private val listener: OnItemClickListener
) : RecyclerView.Adapter<ScriptAdapter.ViewHolder>() {

    interface OnItemClickListener {
        fun onCheckedChanged(item: ScriptItem, isChecked: Boolean)
        fun onEditClick(item: ScriptItem)
        fun onDeleteClick(item: ScriptItem)
    }

    class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val checkEnabled: CheckBox = itemView.findViewById(R.id.checkEnabled)
        val tvName: TextView = itemView.findViewById(R.id.tvName)
        val btnEdit: ImageView = itemView.findViewById(R.id.btnEdit)
        val btnDelete: ImageView = itemView.findViewById(R.id.btnDelete)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_script, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = scripts[position]
        holder.tvName.text = item.name
        holder.checkEnabled.isChecked = item.enabled

        // 避免监听器循环
        holder.checkEnabled.setOnCheckedChangeListener(null)
        holder.checkEnabled.setOnCheckedChangeListener { _, isChecked ->
            item.enabled = isChecked
            listener.onCheckedChanged(item, isChecked)
        }

        holder.btnEdit.setOnClickListener {
            listener.onEditClick(item)
        }

        holder.btnDelete.setOnClickListener {
            listener.onDeleteClick(item)
        }
    }

    override fun getItemCount() = scripts.size
}
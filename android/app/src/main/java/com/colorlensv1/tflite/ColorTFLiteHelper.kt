package com.colorlensv1.tflite

import android.content.Context
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.io.IOException
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel
import org.json.JSONArray
import java.io.BufferedReader
import java.io.InputStreamReader

class ColorTFLiteHelper(private val context: Context) {
    var interpreter: Interpreter? = null

    @Throws(IOException::class)
    fun loadModel(modelPath: String = "color_model.tflite") {
        val fileDescriptor = context.assets.openFd(modelPath)
        val inputStream = FileInputStream(fileDescriptor.fileDescriptor)
        val fileChannel = inputStream.channel
        val startOffset = fileDescriptor.startOffset
        val declaredLength = fileDescriptor.declaredLength
        val mappedBuffer: MappedByteBuffer = fileChannel.map(FileChannel.MapMode.READ_ONLY, startOffset, declaredLength)
        interpreter = Interpreter(mappedBuffer)
    }

    fun close() {
        interpreter?.close()
        interpreter = null
    }

    fun getLabelCount(labelsAssetPath: String = "labels.json"): Int {
        try {
            context.assets.open(labelsAssetPath).use { input ->
                val reader = BufferedReader(InputStreamReader(input))
                val sb = StringBuilder()
                var line: String? = reader.readLine()
                while (line != null) {
                    sb.append(line)
                    line = reader.readLine()
                }
                val arr = JSONArray(sb.toString())
                return arr.length()
            }
        } catch (_: Exception) {
        }
        return 0
    }
}

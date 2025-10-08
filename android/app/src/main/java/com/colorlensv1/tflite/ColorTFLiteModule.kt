package com.colorlensv1.tflite

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

class ColorTFLiteModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val helper = ColorTFLiteHelper(reactContext.applicationContext)
    private var labelCount: Int = 0

    override fun getName(): String {
        return "ColorTFLite"
    }

    @ReactMethod
    fun loadModel(callback: Callback) {
        try {
            helper.loadModel()
            labelCount = helper.getLabelCount()
            callback.invoke(null, true)
        } catch (e: Exception) {
            callback.invoke(e.message, null)
        }
    }

    @ReactMethod
    fun predict(l: Double, a: Double, b: Double, callback: Callback) {
        val interp = helper.interpreter ?: run {
            callback.invoke("model_not_loaded", null)
            return
        }
        val input = arrayOf(floatArrayOf(l.toFloat(), a.toFloat(), b.toFloat()))
        val outSize = if (labelCount > 0) labelCount else 12
        val output = Array(1) { FloatArray(outSize) }
        interp.run(input, output)

        val probs = output[0]
        var maxIdx = 0
        var maxVal = probs[0]
        for (i in probs.indices) {
            if (probs[i] > maxVal) {
                maxVal = probs[i]
                maxIdx = i
            }
        }

        val result: WritableMap = Arguments.createMap()
        result.putInt("index", maxIdx)
        result.putDouble("score", maxVal.toDouble())
        callback.invoke(null, result)
    }

    @ReactMethod
    fun close(callback: Callback) {
        helper.close()
        callback.invoke(null, true)
    }
}

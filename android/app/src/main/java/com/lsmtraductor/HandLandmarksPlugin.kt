package com.lsmtraductor

import com.google.mediapipe.framework.image.MediaImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.ImageProcessingOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy
import com.mrousavy.camera.core.types.Orientation

class HandLandmarksPlugin(
    proxy: VisionCameraProxy,
    options: Map<String, Any>?
) : FrameProcessorPlugin() {

    private val landmarker: HandLandmarker
    private var lastTs = 0L

    init {
        landmarker = try {
            build(proxy, Delegate.GPU)
        } catch (e: Exception) {
            build(proxy, Delegate.CPU)
        }
    }

    private fun build(proxy: VisionCameraProxy, delegate: Delegate): HandLandmarker {
        val base = BaseOptions.builder()
            .setModelAssetPath("models/hand_landmarker.task")
            .setDelegate(delegate)
            .build()
        val opts = HandLandmarker.HandLandmarkerOptions.builder()
            .setBaseOptions(base)
            .setRunningMode(RunningMode.VIDEO)
            .setNumHands(2)
            .setMinHandDetectionConfidence(0.5f)
            .setMinHandPresenceConfidence(0.5f)
            .setMinTrackingConfidence(0.5f)
            .build()
        return HandLandmarker.createFromOptions(proxy.context, opts)
    }

    override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
    return try {
        val mpImage = MediaImageBuilder(frame.image).build()

        val rotation = when (frame.orientation) {
            Orientation.PORTRAIT -> 90
            Orientation.LANDSCAPE_LEFT -> 90
            Orientation.PORTRAIT_UPSIDE_DOWN -> 270
            Orientation.LANDSCAPE_RIGHT -> 180
        }

        val procOpts = ImageProcessingOptions.builder()
            .setRotationDegrees(rotation)
            .build()

        var ts = System.currentTimeMillis() 
        if (ts <= lastTs) ts = lastTs + 1
        lastTs = ts

        val result = landmarker.detectForVideo(mpImage, procOpts, ts)

        val hands = ArrayList<List<Double>>()
        for (hand in result.landmarks()) {
            val flat = ArrayList<Double>(63)
            for (p in hand) {
                flat.add(p.x().toDouble())
                flat.add(p.y().toDouble())
                flat.add(p.z().toDouble())
            }
            hands.add(flat)
        }
        hands
    } catch (e: Exception) {
        android.util.Log.e("HandLandmarksPlugin", "Error al procesar frame", e)
        null
    }
}
}
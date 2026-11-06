package com.lsmtraductor

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry

class HandLandmarksPackage : ReactPackage {
    companion object {
        init {
            FrameProcessorPluginRegistry.addFrameProcessorPlugin("handLandmarks") { proxy, options ->
                HandLandmarksPlugin(proxy, options)
            }
        }
    }

    override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> = emptyList()
    override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
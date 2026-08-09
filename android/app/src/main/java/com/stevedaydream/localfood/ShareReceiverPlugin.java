package com.stevedaydream.localfood;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 其他 App 分享進來的內容，MainActivity 先存到這裡，
 * Web 端（lib/native-share.ts）看到 ?share-native=1 / ?share-text=1 再來取走：
 * - 截圖 → base64
 * - 文字／連結（例如 Google 地圖的分享）→ 原始文字
 */
@CapacitorPlugin(name = "ShareReceiver")
public class ShareReceiverPlugin extends Plugin {

    static String pendingBase64 = null;
    static String pendingMimeType = null;
    static String pendingText = null;

    @PluginMethod
    public void getPendingImage(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("data", pendingBase64);
        ret.put("mimeType", pendingMimeType);
        pendingBase64 = null;
        pendingMimeType = null;
        call.resolve(ret);
    }

    @PluginMethod
    public void getPendingText(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("text", pendingText);
        pendingText = null;
        call.resolve(ret);
    }
}

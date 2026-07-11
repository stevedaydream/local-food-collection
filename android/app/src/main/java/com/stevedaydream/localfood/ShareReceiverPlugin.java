package com.stevedaydream.localfood;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 其他 App 分享截圖進來時，MainActivity 先把圖存到這裡（base64），
 * Web 端（lib/native-share.ts）看到 ?share-native=1 再來取走。
 */
@CapacitorPlugin(name = "ShareReceiver")
public class ShareReceiverPlugin extends Plugin {

    static String pendingBase64 = null;
    static String pendingMimeType = null;

    @PluginMethod
    public void getPendingImage(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("data", pendingBase64);
        ret.put("mimeType", pendingMimeType);
        pendingBase64 = null;
        pendingMimeType = null;
        call.resolve(ret);
    }
}

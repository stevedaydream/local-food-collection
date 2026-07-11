package com.stevedaydream.localfood;

import android.content.Intent;
import android.content.IntentSender;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.BridgeActivity;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class MainActivity extends BridgeActivity {

    /** Widget 點擊帶入：開啟後直接彈出「🎲 吃什麼」隨機推薦 */
    public static final String EXTRA_OPEN_RANDOM = "openRandom";

    /** GoogleAuthPlugin 用：原生 Google 授權畫面的 launcher */
    private ActivityResultLauncher<IntentSenderRequest> googleAuthLauncher;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetSyncPlugin.class);
        registerPlugin(ShareReceiverPlugin.class);
        registerPlugin(GoogleAuthPlugin.class);
        super.onCreate(savedInstanceState);
        googleAuthLauncher = registerForActivityResult(
                new ActivityResultContracts.StartIntentSenderForResult(),
                GoogleAuthPlugin::onAuthResult);
        maybeOpenRandom(getIntent());
        maybeHandleShare(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        maybeOpenRandom(intent);
        maybeHandleShare(intent);
    }

    void launchGoogleAuth(IntentSender intentSender) {
        googleAuthLauncher.launch(new IntentSenderRequest.Builder(intentSender).build());
    }

    private void maybeOpenRandom(Intent intent) {
        if (intent == null || !intent.getBooleanExtra(EXTRA_OPEN_RANDOM, false)) return;
        intent.removeExtra(EXTRA_OPEN_RANDOM);
        loadWithQuery("random=1");
    }

    /** 其他 App 分享截圖進來：讀圖 → 暫存給 ShareReceiverPlugin → 帶參數重載頁面 */
    private void maybeHandleShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String type = intent.getType();
        if (type == null || !type.startsWith("image/")) return;
        intent.setAction(null); // 避免旋轉/重建時重複處理
        Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri == null) return;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            ShareReceiverPlugin.pendingBase64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            ShareReceiverPlugin.pendingMimeType = type;
        } catch (Exception e) {
            return;
        }
        loadWithQuery("share-native=1");
    }

    private void loadWithQuery(String query) {
        String base = bridge.getServerUrl();
        if (base == null || base.isEmpty()) base = bridge.getAppUrl();
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        final String url = base + "/?" + query;
        bridge.getWebView().post(() -> bridge.getWebView().loadUrl(url));
    }
}

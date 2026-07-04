package com.stevedaydream.localfood;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Widget 點擊帶入：開啟後直接彈出「🎲 吃什麼」隨機推薦 */
    public static final String EXTRA_OPEN_RANDOM = "openRandom";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetSyncPlugin.class);
        super.onCreate(savedInstanceState);
        maybeOpenRandom(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        maybeOpenRandom(intent);
    }

    private void maybeOpenRandom(Intent intent) {
        if (intent == null || !intent.getBooleanExtra(EXTRA_OPEN_RANDOM, false)) return;
        intent.removeExtra(EXTRA_OPEN_RANDOM);
        String base = bridge.getServerUrl();
        if (base == null || base.isEmpty()) base = bridge.getAppUrl();
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        final String url = base + "/?random=1";
        bridge.getWebView().post(() -> bridge.getWebView().loadUrl(url));
    }
}

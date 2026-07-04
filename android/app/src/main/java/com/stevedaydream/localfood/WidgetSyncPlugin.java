package com.stevedaydream.localfood;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Web 端（lib/widget-sync.ts）把口袋名單 JSON 同步進來，供原生 widget 顯示 */
@CapacitorPlugin(name = "WidgetSync")
public class WidgetSyncPlugin extends Plugin {

    @PluginMethod
    public void syncRestaurants(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("missing json");
            return;
        }
        WidgetData.saveJson(getContext(), json);
        RandomFoodWidgetProvider.refreshAll(getContext());
        call.resolve();
    }
}

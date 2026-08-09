package com.stevedaydream.localfood;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Web 端（lib/widget-sync.ts）把資料同步進來，供原生 widget 顯示：
 * - syncRestaurants：口袋名單（已去掉縮圖、並補好 countryCode）
 * - syncLocation：目前位置，給 widget 的「📍 跟著我的位置」用
 */
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

    @PluginMethod
    public void syncLocation(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("missing json");
            return;
        }
        WidgetData.saveLocation(getContext(), json);
        RandomFoodWidgetProvider.refreshAll(getContext());
        call.resolve();
    }
}

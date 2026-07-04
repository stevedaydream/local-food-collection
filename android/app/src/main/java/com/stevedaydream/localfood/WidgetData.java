package com.stevedaydream.localfood;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Random;

/** Widget 資料存取：Web 端經 WidgetSyncPlugin 同步進 SharedPreferences 的口袋名單 */
public final class WidgetData {

    private static final String PREFS = "widget_data";
    private static final String KEY_JSON = "restaurants_json";
    private static final String KEY_CURRENT_ID = "current_restaurant_id";

    private WidgetData() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void saveJson(Context context, String json) {
        prefs(context).edit().putString(KEY_JSON, json).apply();
    }

    public static JSONArray getRestaurants(Context context) {
        String raw = prefs(context).getString(KEY_JSON, null);
        if (raw == null) return new JSONArray();
        try {
            return new JSONArray(raw);
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    /** 取得目前 widget 顯示的餐廳；id 失效（被刪除）或未設定時隨機挑一家並記住 */
    public static JSONObject getCurrent(Context context) {
        JSONArray list = getRestaurants(context);
        if (list.length() == 0) return null;
        String currentId = prefs(context).getString(KEY_CURRENT_ID, null);
        if (currentId != null) {
            for (int i = 0; i < list.length(); i++) {
                JSONObject r = list.optJSONObject(i);
                if (r != null && currentId.equals(r.optString("id"))) return r;
            }
        }
        return shuffle(context);
    }

    /** 隨機換一家（多於一家時避免連續抽到同一家），並記住結果 */
    public static JSONObject shuffle(Context context) {
        JSONArray list = getRestaurants(context);
        if (list.length() == 0) return null;
        String currentId = prefs(context).getString(KEY_CURRENT_ID, null);
        Random random = new Random();
        JSONObject picked = list.optJSONObject(random.nextInt(list.length()));
        if (list.length() > 1 && picked != null && picked.optString("id").equals(currentId)) {
            return shuffle(context);
        }
        if (picked != null) {
            prefs(context).edit().putString(KEY_CURRENT_ID, picked.optString("id")).apply();
        }
        return picked;
    }

    /** Google Maps 導航連結 — 有座標用座標，否則用店名+地址搜尋（與 lib/store.ts mapsUrl 邏輯一致） */
    public static String mapsUrl(JSONObject r) {
        if (!r.isNull("lat") && !r.isNull("lng")) {
            return "https://www.google.com/maps/search/?api=1&query="
                    + r.optDouble("lat") + "," + r.optDouble("lng");
        }
        String q = r.optString("name", "");
        String address = r.isNull("address") ? "" : r.optString("address", "");
        if (!address.isEmpty()) q += " " + address;
        return "https://www.google.com/maps/search/?api=1&query=" + android.net.Uri.encode(q);
    }
}

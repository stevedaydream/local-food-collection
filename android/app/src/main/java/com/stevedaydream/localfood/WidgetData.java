package com.stevedaydream.localfood;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;
import java.util.TreeSet;

/**
 * Widget 資料存取：Web 端經 WidgetSyncPlugin 同步進 SharedPreferences 的口袋名單。
 *
 * 每個放置的 widget 各自記住「要顯示哪個區域（縣市）」與「目前抽到哪一家」，
 * 所以同一支手機可以並排放台北、台中兩張卡片。區域選單在 WidgetConfigActivity。
 */
public final class WidgetData {

    private static final String PREFS = "widget_data";
    private static final String KEY_JSON = "restaurants_json";
    /** App 每次成功定位時推過來的位置（widget 自己抓 GPS 要背景定位權限，所以由 App 餵） */
    private static final String KEY_LOCATION = "location_json";
    /** 舊版（未分區）全域「目前這家」；升級後第一次讀還沿用，之後改存 per-widget */
    private static final String KEY_LEGACY_CURRENT_ID = "current_restaurant_id";
    private static final String PREFIX_CURRENT_ID = "current_restaurant_id_";
    private static final String PREFIX_REGION = "region_";

    /** 不限區域 */
    public static final String REGION_ALL = "";
    /**
     * 跟著 App 最後一次定位的位置：先試「目前的一級行政區」，
     * 那一級沒有收藏就放寬到「同國家」（見 inRegion）。
     */
    public static final String REGION_FOLLOW = "follow";

    private WidgetData() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void saveJson(Context context, String json) {
        prefs(context).edit().putString(KEY_JSON, json).apply();
    }

    /** Web 端（lib/widget-sync.ts）推來的目前位置；沒有就回 null */
    public static void saveLocation(Context context, String json) {
        prefs(context).edit().putString(KEY_LOCATION, json).apply();
    }

    public static JSONObject getLocation(Context context) {
        String raw = prefs(context).getString(KEY_LOCATION, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    private static String locField(Context context, String key) {
        JSONObject loc = getLocation(context);
        if (loc == null || loc.isNull(key)) return "";
        return loc.optString(key, "").trim();
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

    // ---- 區域設定（per widget） ----

    /** 名單裡出現過的縣市，排序後給設定畫面列選項 */
    public static List<String> regions(Context context) {
        JSONArray list = getRestaurants(context);
        TreeSet<String> set = new TreeSet<>();
        for (int i = 0; i < list.length(); i++) {
            String city = city(list.optJSONObject(i));
            if (!city.isEmpty()) set.add(city);
        }
        return new ArrayList<>(set);
    }

    public static String getRegion(Context context, int appWidgetId) {
        return prefs(context).getString(PREFIX_REGION + appWidgetId, REGION_ALL);
    }

    public static void setRegion(Context context, int appWidgetId, String region) {
        prefs(context).edit()
                .putString(PREFIX_REGION + appWidgetId, region == null ? REGION_ALL : region)
                // 換區域後原本那家可能不在區域內，清掉讓它重抽
                .remove(PREFIX_CURRENT_ID + appWidgetId)
                .apply();
    }

    /** widget 被移除時清掉它的設定，別讓 SharedPreferences 一直長大 */
    public static void clearWidget(Context context, int appWidgetId) {
        prefs(context).edit()
                .remove(PREFIX_REGION + appWidgetId)
                .remove(PREFIX_CURRENT_ID + appWidgetId)
                .apply();
    }

    private static String city(JSONObject r) {
        if (r == null || r.isNull("city")) return "";
        return r.optString("city", "").trim();
    }

    /**
     * 指定區域內的餐廳。
     * - 區域為空 → 全部
     * - REGION_FOLLOW → 目前一級行政區的收藏；那一級沒有就放寬到同國家
     * - 其他 → 該一級行政區（city 欄位）
     */
    public static List<JSONObject> inRegion(Context context, String region) {
        if (REGION_FOLLOW.equals(region)) {
            List<JSONObject> byCity = matching(context, city(context, null), null);
            if (!byCity.isEmpty()) return byCity;
            return matching(context, null, locField(context, "countryCode"));
        }
        return matching(context, region, null);
    }

    /** city 有值就比一級行政區，countryCode 有值就比國家；兩者都空＝全部 */
    private static List<JSONObject> matching(Context context, String city, String countryCode) {
        JSONArray list = getRestaurants(context);
        List<JSONObject> out = new ArrayList<>();
        boolean byCity = city != null && !city.isEmpty();
        boolean byCountry = countryCode != null && !countryCode.isEmpty();
        for (int i = 0; i < list.length(); i++) {
            JSONObject r = list.optJSONObject(i);
            if (r == null) continue;
            if (byCity && !city.equals(city(r))) continue;
            if (byCountry && !countryCode.equalsIgnoreCase(str(r, "countryCode"))) continue;
            out.add(r);
        }
        return out;
    }

    /** 目前位置的一級行政區（給 REGION_FOLLOW 用）；fallback 為呼叫端傳入的預設 */
    private static String city(Context context, String fallback) {
        String city = locField(context, "city");
        return city.isEmpty() ? (fallback == null ? "" : fallback) : city;
    }

    private static String str(JSONObject r, String key) {
        if (r == null || r.isNull(key)) return "";
        return r.optString(key, "").trim();
    }

    /** widget 上「📍 …」要顯示什麼：跟著位置時顯示實際跟到的層級 */
    public static String followLabel(Context context) {
        String city = locField(context, "city");
        if (!city.isEmpty() && !matching(context, city, null).isEmpty()) return city;
        String country = locField(context, "country");
        if (!country.isEmpty()) return country;
        return "";
    }

    /** 有沒有收到過位置（沒有的話「跟著我的位置」要提示先開 App 定位） */
    public static boolean hasLocation(Context context) {
        return getLocation(context) != null;
    }

    public static int countInRegion(Context context, String region) {
        return inRegion(context, region).size();
    }

    public static boolean isEmpty(Context context) {
        return getRestaurants(context).length() == 0;
    }

    // ---- 目前顯示的餐廳（per widget） ----

    /** 取得這個 widget 目前顯示的餐廳；id 失效（被刪除／已不在區域內）時隨機挑一家並記住 */
    public static JSONObject getCurrent(Context context, int appWidgetId) {
        List<JSONObject> pool = inRegion(context, getRegion(context, appWidgetId));
        if (pool.isEmpty()) return null;
        String currentId = prefs(context).getString(
                PREFIX_CURRENT_ID + appWidgetId,
                prefs(context).getString(KEY_LEGACY_CURRENT_ID, null));
        if (currentId != null) {
            for (JSONObject r : pool) {
                if (currentId.equals(r.optString("id"))) return r;
            }
        }
        return shuffle(context, appWidgetId);
    }

    /** 隨機換一家（該區域多於一家時避免連續抽到同一家），並記住結果 */
    public static JSONObject shuffle(Context context, int appWidgetId) {
        List<JSONObject> pool = inRegion(context, getRegion(context, appWidgetId));
        if (pool.isEmpty()) return null;
        String currentId = prefs(context).getString(PREFIX_CURRENT_ID + appWidgetId, null);
        if (pool.size() > 1 && currentId != null) {
            // 抽之前先把目前這家排除，比重抽遞迴穩定（不會運氣差抽很多次）
            List<JSONObject> others = new ArrayList<>(pool);
            for (int i = others.size() - 1; i >= 0; i--) {
                if (currentId.equals(others.get(i).optString("id"))) others.remove(i);
            }
            if (!others.isEmpty()) pool = others;
        }
        JSONObject picked = pool.get(new Random().nextInt(pool.size()));
        prefs(context).edit()
                .putString(PREFIX_CURRENT_ID + appWidgetId, picked.optString("id"))
                .apply();
        return picked;
    }

    /**
     * Google Maps 連結 — 存過店家連結就用它（會直接開店家頁），
     * 否則有座標用座標，最後退回店名+地址搜尋（與 lib/store.ts mapsUrl 邏輯一致）。
     */
    public static String mapsUrl(JSONObject r) {
        String saved = r.isNull("googleUrl") ? "" : r.optString("googleUrl", "");
        if (!saved.isEmpty()) return saved;
        if (!r.isNull("lat") && !r.isNull("lng")) {
            return "https://www.google.com/maps/search/?api=1&query="
                    + r.optDouble("lat") + "," + r.optDouble("lng");
        }
        String q = r.optString("name", "");
        String address = r.isNull("address") ? "" : r.optString("address", "");
        if (!address.isEmpty()) q += " " + address;
        return "https://www.google.com/maps/search/?api=1&query=" + android.net.Uri.encode(q);
    }

    /** 區域清單裡若已經沒有這個 widget 選的區域（例如那區的收藏都刪了），設定畫面仍要列出來 */
    public static List<String> regionsIncluding(Context context, String selected) {
        List<String> regions = regions(context);
        if (selected != null && !selected.isEmpty() && !regions.contains(selected)) {
            regions.add(selected);
            Collections.sort(regions);
        }
        return regions;
    }
}

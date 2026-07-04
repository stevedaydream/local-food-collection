package com.stevedaydream.localfood;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** 資訊型 widget：顯示一家隨機口袋餐廳，可「換一家」、開導航、點卡片開 App */
public class RandomFoodWidgetProvider extends AppWidgetProvider {

    private static final String ACTION_SHUFFLE = "com.stevedaydream.localfood.widget.SHUFFLE";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            manager.updateAppWidget(id, buildViews(context));
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_SHUFFLE.equals(intent.getAction())) {
            WidgetData.shuffle(context);
            refreshAll(context);
        }
    }

    /** 資料同步或換一家後，重繪所有已放置的 widget（WidgetSyncPlugin 也會呼叫） */
    public static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(
                new ComponentName(context, RandomFoodWidgetProvider.class));
        if (ids.length == 0) return;
        RemoteViews views = buildViews(context);
        for (int id : ids) {
            manager.updateAppWidget(id, views);
        }
    }

    private static RemoteViews buildViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_random_food);
        JSONObject r = WidgetData.getCurrent(context);

        // 點卡片本體 → 開 App
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        views.setOnClickPendingIntent(R.id.widget_food_root, PendingIntent.getActivity(
                context, 200, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        if (r == null) {
            views.setViewVisibility(R.id.widget_food_content, View.GONE);
            views.setViewVisibility(R.id.widget_food_empty, View.VISIBLE);
            return views;
        }
        views.setViewVisibility(R.id.widget_food_content, View.VISIBLE);
        views.setViewVisibility(R.id.widget_food_empty, View.GONE);

        views.setTextViewText(R.id.widget_food_name, r.optString("name", ""));
        views.setTextViewText(R.id.widget_food_meta, buildMeta(r));

        String address = r.isNull("address") ? "" : r.optString("address", "");
        views.setTextViewText(R.id.widget_food_address, address);
        views.setViewVisibility(R.id.widget_food_address, address.isEmpty() ? View.GONE : View.VISIBLE);

        // 🎲 換一家 → 廣播給自己
        Intent shuffle = new Intent(context, RandomFoodWidgetProvider.class);
        shuffle.setAction(ACTION_SHUFFLE);
        views.setOnClickPendingIntent(R.id.widget_food_shuffle, PendingIntent.getBroadcast(
                context, 201, shuffle,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        // 🧭 導航 → Google Maps
        Intent maps = new Intent(Intent.ACTION_VIEW, Uri.parse(WidgetData.mapsUrl(r)));
        maps.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        views.setOnClickPendingIntent(R.id.widget_food_maps, PendingIntent.getActivity(
                context, 202, maps,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        return views;
    }

    /** 「料理類型 · 城市 · 推薦菜」一行摘要 */
    private static String buildMeta(JSONObject r) {
        StringBuilder sb = new StringBuilder();
        String cuisine = r.isNull("cuisine") ? "" : r.optString("cuisine", "");
        String city = r.isNull("city") ? "" : r.optString("city", "");
        if (!cuisine.isEmpty()) sb.append(cuisine);
        if (!city.isEmpty()) {
            if (sb.length() > 0) sb.append(" · ");
            sb.append(city);
        }
        JSONArray dishes = r.optJSONArray("dishes");
        if (dishes != null && dishes.length() > 0) {
            if (sb.length() > 0) sb.append(" · ");
            sb.append(dishes.optString(0));
        }
        return sb.toString();
    }
}

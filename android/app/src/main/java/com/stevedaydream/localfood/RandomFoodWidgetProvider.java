package com.stevedaydream.localfood;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 資訊型 widget：顯示一家隨機口袋餐廳，可「換一家」、開導航、點卡片開 App。
 * 每張卡片可各自選區域（右上角 📍 標籤 → WidgetConfigActivity），設定與抽中的店家都 per widget。
 */
public class RandomFoodWidgetProvider extends AppWidgetProvider {

    private static final String ACTION_SHUFFLE = "com.stevedaydream.localfood.widget.SHUFFLE";
    /** 骰子在 widget 內滾動的時長 (ms)，與網頁版動畫一致 */
    private static final long ROLL_MS = 2000;
    /** 同一張 widget 的三個 PendingIntent（開 App / 換一家 / 導航 / 換區域）要各自不撞號 */
    private static final int REQ_OPEN = 0;
    private static final int REQ_SHUFFLE = 1;
    private static final int REQ_MAPS = 2;
    private static final int REQ_REGION = 3;
    private static final int REQ_SLOTS = 4;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            manager.updateAppWidget(id, buildViews(context, id));
        }
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            WidgetData.clearWidget(context, id);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (!ACTION_SHUFFLE.equals(intent.getAction())) return;
        final int appWidgetId = intent.getIntExtra(
                AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return;

        // 先切到骰子滾動畫面，2 秒後才揭曉新結果（只動被點的那張卡片）
        showRolling(context, appWidgetId);
        final PendingResult pending = goAsync();
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            WidgetData.shuffle(context, appWidgetId);
            refreshOne(context, appWidgetId);
            pending.finish();
        }, ROLL_MS);
    }

    /** 切到骰子滾動狀態（ViewFlipper 自動輪播骰面） */
    private static void showRolling(Context context, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_random_food);
        views.setViewVisibility(R.id.widget_food_main, View.GONE);
        views.setViewVisibility(R.id.widget_food_flipper, View.VISIBLE);
        AppWidgetManager.getInstance(context).updateAppWidget(appWidgetId, views);
    }

    /** 資料同步後重繪所有已放置的 widget（WidgetSyncPlugin 呼叫） */
    public static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(
                new ComponentName(context, RandomFoodWidgetProvider.class));
        for (int id : ids) {
            manager.updateAppWidget(id, buildViews(context, id));
        }
    }

    /** 重繪單一 widget（換一家、換區域後） */
    public static void refreshOne(Context context, int appWidgetId) {
        AppWidgetManager.getInstance(context)
                .updateAppWidget(appWidgetId, buildViews(context, appWidgetId));
    }

    /** 每張 widget 的 PendingIntent request code 要唯一，否則會互相覆蓋 */
    private static int req(int appWidgetId, int slot) {
        return appWidgetId * REQ_SLOTS + slot;
    }

    private static RemoteViews buildViews(Context context, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_random_food);
        views.setViewVisibility(R.id.widget_food_flipper, View.GONE);
        views.setViewVisibility(R.id.widget_food_main, View.VISIBLE);

        String region = WidgetData.getRegion(context, appWidgetId);
        views.setTextViewText(R.id.widget_food_region, regionLabel(context, region));

        // 點卡片本體 → 開 App
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        views.setOnClickPendingIntent(R.id.widget_food_root, PendingIntent.getActivity(
                context, req(appWidgetId, REQ_OPEN), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        // 點 📍 區域標籤 → 開設定畫面換區域（空狀態也能點，才換得回別區）
        Intent config = new Intent(context, WidgetConfigActivity.class);
        config.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        // 不加 CLEAR_TASK：設定畫面用自己的 task（manifest taskAffinity=""），不動到開著的 App
        config.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        // data 讓每張 widget 的 Intent 被視為不同（filterEquals 會比 data）
        config.setData(Uri.parse("localfood://widget/" + appWidgetId));
        views.setOnClickPendingIntent(R.id.widget_food_region, PendingIntent.getActivity(
                context, req(appWidgetId, REQ_REGION), config,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        JSONObject r = WidgetData.getCurrent(context, appWidgetId);
        if (r == null) {
            views.setViewVisibility(R.id.widget_food_content, View.GONE);
            views.setViewVisibility(R.id.widget_food_empty, View.VISIBLE);
            views.setTextViewText(R.id.widget_food_empty, context.getString(
                    WidgetData.isEmpty(context) || region.isEmpty()
                            ? R.string.widget_food_empty
                            : R.string.widget_food_empty_region));
            return views;
        }
        views.setViewVisibility(R.id.widget_food_content, View.VISIBLE);
        views.setViewVisibility(R.id.widget_food_empty, View.GONE);

        views.setTextViewText(R.id.widget_food_name, r.optString("name", ""));
        views.setTextViewText(R.id.widget_food_meta, buildMeta(r, region));

        String address = r.isNull("address") ? "" : r.optString("address", "");
        views.setTextViewText(R.id.widget_food_address, address);
        views.setViewVisibility(R.id.widget_food_address, address.isEmpty() ? View.GONE : View.VISIBLE);

        // 🎲 換一家 → 廣播給自己（帶 appWidgetId，只換這張）
        Intent shuffle = new Intent(context, RandomFoodWidgetProvider.class);
        shuffle.setAction(ACTION_SHUFFLE);
        shuffle.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        shuffle.setData(Uri.parse("localfood://widget/" + appWidgetId));
        views.setOnClickPendingIntent(R.id.widget_food_shuffle, PendingIntent.getBroadcast(
                context, req(appWidgetId, REQ_SHUFFLE), shuffle,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        // 🧭 導航 → Google Maps
        Intent maps = new Intent(Intent.ACTION_VIEW, Uri.parse(WidgetData.mapsUrl(r)));
        maps.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        views.setOnClickPendingIntent(R.id.widget_food_maps, PendingIntent.getActivity(
                context, req(appWidgetId, REQ_MAPS), maps,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        return views;
    }

    /** 右上角 📍 標籤：跟著位置時顯示實際跟到的層級並標「自動」 */
    private static String regionLabel(Context context, String region) {
        if (WidgetData.REGION_FOLLOW.equals(region)) {
            String followed = WidgetData.followLabel(context);
            return followed.isEmpty()
                    ? context.getString(R.string.widget_food_region_follow_empty)
                    : context.getString(R.string.widget_food_region_follow, followed);
        }
        return region.isEmpty()
                ? context.getString(R.string.widget_food_region_all)
                : context.getString(R.string.widget_food_region, region);
    }

    /** 「料理類型 · 城市 · 推薦菜」一行摘要；已用區域篩過就不重複顯示城市 */
    private static String buildMeta(JSONObject r, String region) {
        StringBuilder sb = new StringBuilder();
        String cuisine = r.isNull("cuisine") ? "" : r.optString("cuisine", "");
        String city = r.isNull("city") ? "" : r.optString("city", "");
        if (!cuisine.isEmpty()) sb.append(cuisine);
        if (!city.isEmpty() && region.isEmpty()) {
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

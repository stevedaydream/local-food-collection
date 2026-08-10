package com.stevedaydream.localfood;

import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;

import androidx.appcompat.app.AppCompatActivity;

import java.util.ArrayList;
import java.util.List;

/**
 * 餐廳卡片 widget 的設定畫面：選這張卡片要抽哪個區域（縣市）。
 *
 * 兩個進入點：
 * 1. 從桌面新增 widget 時，launcher 依 widget_random_food_info 的 android:configure 叫起來
 * 2. 已放置的 widget 上點右上角 📍 區域標籤（RandomFoodWidgetProvider 帶 appWidgetId 進來）
 *
 * 選了就立刻生效（不必按確定），所以用返回鍵離開也算數——
 * 區域一多時清單會很長，早期版本的「確定」按鈕會被清單頂出對話框外按不到。
 */
public class WidgetConfigActivity extends AppCompatActivity {

    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    /** 每顆 radio 對應的區域字串，index 與 RadioGroup 的子項一致；第 0 個是「全部」 */
    private final ArrayList<String> values = new ArrayList<>();
    private RadioGroup group;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent intent = getIntent();
        if (intent != null && intent.getExtras() != null) {
            appWidgetId = intent.getExtras().getInt(
                    AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        }
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }
        // 還沒選之前返回 → 視為取消（新增流程下 launcher 會把 widget 撤掉）
        setResult(RESULT_CANCELED, resultIntent());

        setContentView(R.layout.widget_config);
        group = findViewById(R.id.widget_config_regions);
        buildOptions();
        capListHeight();

        // 點選項就存，返回鍵離開也保留選擇
        group.setOnCheckedChangeListener((g, checkedId) -> save());
        findViewById(R.id.widget_config_ok).setOnClickListener(v -> finish());
    }

    private Intent resultIntent() {
        Intent result = new Intent();
        result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        return result;
    }

    private void buildOptions() {
        String selected = WidgetData.getRegion(this, appWidgetId);
        List<String> regions = WidgetData.regionsIncluding(this, selected);

        values.clear();
        group.removeAllViews();

        addFollowOption();
        addOption(WidgetData.REGION_ALL, getString(R.string.widget_config_all));
        for (String region : regions) addOption(region, region);

        int index = Math.max(0, values.indexOf(selected));
        View checked = group.getChildAt(index);
        if (checked instanceof RadioButton) ((RadioButton) checked).setChecked(true);
    }

    /** 「📍 跟著我的位置」：說明文字依有沒有收到過定位而不同 */
    private void addFollowOption() {
        String label = WidgetData.hasLocation(this)
                ? getString(R.string.widget_config_follow_at, WidgetData.followLabel(this))
                : getString(R.string.widget_config_follow_empty);
        RadioButton button = new RadioButton(this);
        button.setId(View.generateViewId());
        button.setText(label);
        style(button);
        group.addView(button);
        values.add(WidgetData.REGION_FOLLOW);
    }

    private void addOption(String value, String label) {
        RadioButton button = new RadioButton(this);
        button.setId(View.generateViewId());
        int count = WidgetData.countInRegion(this, value);
        button.setText(getString(R.string.widget_config_option, label, count));
        style(button);
        group.addView(button);
        values.add(value);
    }

    /** 清單最高佔螢幕 55%，剩下的空間留給「完成」，避免按鈕被頂出對話框 */
    private void capListHeight() {
        ScrollView scroll = findViewById(R.id.widget_config_scroll);
        int max = (int) (getResources().getDisplayMetrics().heightPixels * 0.55f);
        scroll.post(() -> {
            if (scroll.getHeight() > max) {
                ViewGroup.LayoutParams lp = scroll.getLayoutParams();
                lp.height = max;
                scroll.setLayoutParams(lp);
            }
        });
    }

    private void style(RadioButton button) {
        button.setTextSize(15f);
        button.setTextColor(getColor(R.color.ink));
        button.setPadding(button.getPaddingLeft(), 16, button.getPaddingRight(), 16);
    }

    /** 存下選擇並立刻重繪 widget；不關畫面，讓使用者看得到標籤變了 */
    private void save() {
        int index = group.indexOfChild(group.findViewById(group.getCheckedRadioButtonId()));
        if (index < 0 || index >= values.size()) return;
        WidgetData.setRegion(this, appWidgetId, values.get(index));
        RandomFoodWidgetProvider.refreshOne(this, appWidgetId);
        setResult(RESULT_OK, resultIntent());
    }
}

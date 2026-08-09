package com.stevedaydream.localfood;

import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.RadioButton;
import android.widget.RadioGroup;

import androidx.appcompat.app.AppCompatActivity;

import java.util.ArrayList;
import java.util.List;

/**
 * 餐廳卡片 widget 的設定畫面：選這張卡片要抽哪個區域（縣市）。
 *
 * 兩個進入點：
 * 1. 從桌面新增 widget 時，launcher 依 widget_random_food_info 的 android:configure 叫起來
 * 2. 已放置的 widget 上點右上角 📍 區域標籤（RandomFoodWidgetProvider 帶 appWidgetId 進來）
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
        // 使用者直接返回 → 視為取消（新增流程下 launcher 會把 widget 撤掉）
        setResult(RESULT_CANCELED, resultIntent());

        setContentView(R.layout.widget_config);
        group = findViewById(R.id.widget_config_regions);
        buildOptions();

        findViewById(R.id.widget_config_cancel).setOnClickListener(v -> finish());
        Button ok = findViewById(R.id.widget_config_ok);
        ok.setOnClickListener(v -> save());
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

        addOption(WidgetData.REGION_ALL, getString(R.string.widget_config_all));
        for (String region : regions) addOption(region, region);

        int index = Math.max(0, values.indexOf(selected));
        View checked = group.getChildAt(index);
        if (checked instanceof RadioButton) ((RadioButton) checked).setChecked(true);
    }

    private void addOption(String value, String label) {
        RadioButton button = new RadioButton(this);
        button.setId(View.generateViewId());
        int count = WidgetData.countInRegion(this, value);
        button.setText(getString(R.string.widget_config_option, label, count));
        button.setTextSize(15f);
        button.setPadding(button.getPaddingLeft(), 14, button.getPaddingRight(), 14);
        group.addView(button);
        values.add(value);
    }

    private void save() {
        int index = group.indexOfChild(group.findViewById(group.getCheckedRadioButtonId()));
        String region = index >= 0 && index < values.size() ? values.get(index) : WidgetData.REGION_ALL;
        WidgetData.setRegion(this, appWidgetId, region);
        RandomFoodWidgetProvider.refreshOne(this, appWidgetId);
        setResult(RESULT_OK, resultIntent());
        finish();
    }
}

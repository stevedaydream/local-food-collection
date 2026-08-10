package com.stevedaydream.localfood;

import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;

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
    /** 第一層每顆 radio 對應的值（REGION_FOLLOW / REGION_ALL / 縣市名），index 與子項一致 */
    private final ArrayList<String> values = new ArrayList<>();
    /** 第二層每顆 radio 對應的行政區名；第 0 個是「整個縣市」＝空字串 */
    private final ArrayList<String> districtValues = new ArrayList<>();
    private RadioGroup group;
    private RadioGroup districtGroup;
    private TextView districtLabel;
    /** 目前選到的縣市（第二層要掛在它底下） */
    private String selectedCity = "";

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
        districtGroup = findViewById(R.id.widget_config_districts);
        districtLabel = findViewById(R.id.widget_config_district_label);
        buildOptions();
        capListHeight();

        // 點選項就存，返回鍵離開也保留選擇
        group.setOnCheckedChangeListener((g, checkedId) -> {
            saveCity();
            buildDistricts();
        });
        districtGroup.setOnCheckedChangeListener((g, checkedId) -> saveDistrict());
        findViewById(R.id.widget_config_ok).setOnClickListener(v -> finish());
    }

    private Intent resultIntent() {
        Intent result = new Intent();
        result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        return result;
    }

    private void buildOptions() {
        String saved = WidgetData.getRegion(this, appWidgetId);
        String savedCity = WidgetData.cityOfRegion(saved);
        boolean follow = WidgetData.REGION_FOLLOW.equals(saved);
        List<String> regions = WidgetData.regionsIncluding(this, follow ? "" : savedCity);

        values.clear();
        group.removeAllViews();

        addFollowOption();
        addOption(WidgetData.REGION_ALL, getString(R.string.widget_config_all));
        for (String region : regions) addOption(region, region);

        selectedCity = follow ? "" : savedCity;
        int index = Math.max(0, values.indexOf(follow ? WidgetData.REGION_FOLLOW : selectedCity));
        View checked = group.getChildAt(index);
        if (checked instanceof RadioButton) ((RadioButton) checked).setChecked(true);
        buildDistricts();
    }

    /**
     * 第二層：選到的縣市底下有行政區才顯示。
     * 第一顆是「整個 ○○」，選它就等於只鎖一級。
     */
    private void buildDistricts() {
        districtValues.clear();
        districtGroup.setOnCheckedChangeListener(null);
        districtGroup.removeAllViews();

        List<String> districts = selectedCity.isEmpty()
                ? new ArrayList<>()
                : WidgetData.districts(this, selectedCity);
        if (districts.isEmpty()) {
            districtGroup.setVisibility(View.GONE);
            districtLabel.setVisibility(View.GONE);
            districtGroup.setOnCheckedChangeListener((g, id) -> saveDistrict());
            return;
        }

        districtLabel.setText(getString(R.string.widget_config_district_label, selectedCity));
        districtLabel.setVisibility(View.VISIBLE);
        districtGroup.setVisibility(View.VISIBLE);

        addDistrictOption("", getString(R.string.widget_config_district_all, selectedCity));
        for (String district : districts) addDistrictOption(district, district);

        String savedDistrict = WidgetData.districtOfRegion(WidgetData.getRegion(this, appWidgetId));
        int index = Math.max(0, districtValues.indexOf(savedDistrict));
        View checked = districtGroup.getChildAt(index);
        if (checked instanceof RadioButton) ((RadioButton) checked).setChecked(true);
        districtGroup.setOnCheckedChangeListener((g, id) -> saveDistrict());
    }

    private void addDistrictOption(String value, String label) {
        RadioButton button = new RadioButton(this);
        button.setId(View.generateViewId());
        int count = WidgetData.countInRegion(this, WidgetData.composeRegion(selectedCity, value));
        button.setText(getString(R.string.widget_config_option, label, count));
        style(button);
        districtGroup.addView(button);
        districtValues.add(value);
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

    /** 選了第一層：跟著位置／全部就直接存，選縣市則先存一級（第二層預設整個縣市） */
    private void saveCity() {
        int index = group.indexOfChild(group.findViewById(group.getCheckedRadioButtonId()));
        if (index < 0 || index >= values.size()) return;
        String value = values.get(index);
        selectedCity = WidgetData.REGION_FOLLOW.equals(value) ? "" : value;
        apply(value);
    }

    /** 選了第二層：組成「縣市|行政區」存回去 */
    private void saveDistrict() {
        int index = districtGroup.indexOfChild(districtGroup.findViewById(districtGroup.getCheckedRadioButtonId()));
        if (index < 0 || index >= districtValues.size() || selectedCity.isEmpty()) return;
        apply(WidgetData.composeRegion(selectedCity, districtValues.get(index)));
    }

    /** 存下選擇並立刻重繪 widget；不關畫面，讓使用者看得到標籤變了 */
    private void apply(String region) {
        WidgetData.setRegion(this, appWidgetId, region);
        RandomFoodWidgetProvider.refreshOne(this, appWidgetId);
        setResult(RESULT_OK, resultIntent());
    }
}

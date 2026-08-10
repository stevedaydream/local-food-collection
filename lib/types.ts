/** 一筆已儲存的餐廳收藏 */
export interface SavedRestaurant {
  id: string;
  name: string;
  address: string | null;
  /** 一級行政區：台北市 / 東京都 */
  city: string | null;
  /** 二級行政區：信義區 / 荒川區（後加欄位，舊資料為 undefined） */
  district?: string | null;
  /** 國家顯示名：台灣 / 日本 */
  country?: string | null;
  /** 國家代碼：TW / JP。推薦時的國家硬篩用；沒有時由座標經 countryOf() 推算 */
  countryCode?: string | null;
  cuisine: string | null;
  dishes: string[];
  priceRange: string | null;
  sourcePlatform: string | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  /** 縮圖 (data URL, 已壓縮) */
  thumb: string | null;
  /** 這家店的 Google 地圖連結（貼連結或自動查詢帶入；有的話導航優先用它，會直接開店家頁） */
  googleUrl?: string | null;
  createdAt: string;
  /** 雲端分享範圍；未設定視為 private（僅自己） */
  visibility?: 'private' | 'friends';
  /** 我的最愛 */
  favorite?: boolean;
}

/** AI 從截圖抽出的單一餐廳（尚未儲存） */
export interface ExtractedRestaurant {
  name: string;
  address: string | null;
  /** 一級行政區：台北市 / 東京都 */
  city: string | null;
  /** 二級行政區：信義區 / 荒川區 */
  district?: string | null;
  cuisine: string | null;
  dishes: string[];
  price_range: string | null;
  source_platform: string | null;
  notes: string | null;
  confidence: 'high' | 'medium' | 'low';
  /** 拍照模式：對應到「附近店家清單」第幾家（對不上為 null） */
  nearby_index?: number | null;
  /** 拍照模式：其他也可能的候選編號，依可能性排序 */
  alternate_indexes?: number[];
}

export interface AnalyzeResult {
  is_food_content: boolean;
  restaurants: ExtractedRestaurant[];
}

/** 附近搜尋回傳的餐廳候選（未儲存，隨機推薦用） */
export interface NearbyPlace {
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  cuisine: string | null;
}

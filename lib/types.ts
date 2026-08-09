/** 一筆已儲存的餐廳收藏 */
export interface SavedRestaurant {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
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
  city: string | null;
  cuisine: string | null;
  dishes: string[];
  price_range: string | null;
  source_platform: string | null;
  notes: string | null;
  confidence: 'high' | 'medium' | 'low';
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

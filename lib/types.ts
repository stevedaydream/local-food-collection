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
  createdAt: string;
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

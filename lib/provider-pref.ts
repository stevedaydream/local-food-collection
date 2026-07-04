const KEY = 'food-map:provider';

/** 使用者偏好的 AI provider；null = 交給伺服器預設 */
export function getPreferredProvider(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(KEY);
}

export function setPreferredProvider(id: string | null) {
  if (id) localStorage.setItem(KEY, id);
  else localStorage.removeItem(KEY);
}

/**
 * GitHub 自動更新（只在 Capacitor 殼內作用）：
 * 跟原生 AppUpdatePlugin 拿 APK 版本 → 查 GitHub Releases 最新 tag →
 * 有新版就問使用者、用系統瀏覽器開 APK 下載連結。
 * 瀏覽器 / PWA 沒有 plugin，直接 no-op（網頁本身跟著 Vercel 自動更新）。
 */

const GITHUB_REPO = 'stevedaydream/local-food-collection';
const CHECK_KEY = 'food-map:last-apk-update-check';
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 每天最多查一次

/** 比較 "v1.2" / "1.2" 格式版本，tag 較新回傳 true */
function isNewer(tag: string, current: string): boolean {
  const parse = (s: string) => s.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const a = parse(tag);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

export async function checkApkUpdate(): Promise<void> {
  try {
    const plugin = (window as any).Capacitor?.Plugins?.AppUpdate;
    if (!plugin) return;

    const last = Number(localStorage.getItem(CHECK_KEY) ?? 0);
    if (Date.now() - last < CHECK_INTERVAL) return;
    localStorage.setItem(CHECK_KEY, String(Date.now()));

    const { version } = await plugin.getVersion();
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    if (!res.ok) return; // 還沒有任何 release 或被 rate limit，安靜略過
    const release = (await res.json()) as {
      tag_name: string;
      html_url: string;
      assets?: { name: string; browser_download_url: string }[];
    };
    if (!version || !release.tag_name || !isNewer(release.tag_name, version)) return;

    const apk = release.assets?.find((a) => a.name.endsWith('.apk'));
    if (!confirm(`App 有新版本 ${release.tag_name}（目前 v${version}），要下載安裝嗎？`)) return;
    await plugin.openUrl({ url: apk?.browser_download_url ?? release.html_url });
  } catch {
    /* 更新檢查失敗不影響主流程 */
  }
}

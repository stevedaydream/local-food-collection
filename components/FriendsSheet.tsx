'use client';

import { useEffect, useState } from 'react';
import type { SavedRestaurant } from '@/lib/types';
import { getAccount, isAuthConfigured } from '@/lib/auth';
import { createInviteLink, fetchFriendRestaurants, listFriends, removeFriend, type Friend } from '@/lib/friends';
import { addRestaurants, loadRestaurants, mapsUrl } from '@/lib/store';

export default function FriendsSheet({
  onClose,
  onListChanged,
}: {
  onClose: () => void;
  /** 把朋友的收藏複製進自己名單後，回傳最新清單給主畫面 */
  onListChanged: (list: SavedRestaurant[]) => void;
}) {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  // 檢視某位朋友的分享清單
  const [viewing, setViewing] = useState<Friend | null>(null);
  const [friendList, setFriendList] = useState<SavedRestaurant[] | null>(null);
  const [ownIds, setOwnIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthConfigured()) {
      setLoggedIn(false);
      return;
    }
    getAccount()
      .then((acc) => {
        setLoggedIn(!!acc);
        if (acc) refreshFriends();
      })
      .catch(() => setLoggedIn(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshFriends = () => {
    listFriends()
      .then(setFriends)
      .catch((e) => {
        setFriends([]);
        setMsg({ text: e instanceof Error ? e.message : String(e), error: true });
      });
  };

  const handleInvite = async () => {
    setBusy(true);
    setMsg(null);
    try {
      setInviteLink(await createInviteLink());
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteLink) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: '加我為口袋美食地圖好友', url: inviteLink });
      } else {
        await navigator.clipboard.writeText(inviteLink);
        setMsg({ text: '✅ 已複製，傳給朋友吧（7 天內有效）' });
      }
    } catch {
      /* 使用者取消分享 */
    }
  };

  const handleView = async (f: Friend) => {
    setViewing(f);
    setFriendList(null);
    setMsg(null);
    // 用「店名+地址」比對自己已有的，避免重複收藏
    setOwnIds(new Set(loadRestaurants().map((r) => `${r.name}|${r.address ?? ''}`)));
    try {
      setFriendList(await fetchFriendRestaurants(f.id));
    } catch (e) {
      setFriendList([]);
      setMsg({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  };

  const handleRemove = async (f: Friend) => {
    if (!confirm(`確定要移除好友「${f.displayName ?? f.email ?? f.id}」？`)) return;
    try {
      await removeFriend(f.id);
      refreshFriends();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  };

  const handleCopyToMine = (r: SavedRestaurant) => {
    const copy: SavedRestaurant = {
      ...r,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      visibility: 'private',
      sourcePlatform: `朋友分享`,
    };
    onListChanged(addRestaurants([copy]));
    setOwnIds((prev) => new Set(prev).add(`${r.name}|${r.address ?? ''}`));
  };

  const friendName = (f: Friend) => f.displayName ?? f.email ?? '（未命名）';

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {viewing ? (
          <>
            <h2>👥 {friendName(viewing)} 的分享</h2>
            {friendList === null ? (
              <p className="meta">
                載入中 <span className="spinner" />
              </p>
            ) : friendList.length === 0 ? (
              <p className="meta">對方還沒有分享任何收藏。</p>
            ) : (
              friendList.map((r) => {
                const owned = ownIds.has(`${r.name}|${r.address ?? ''}`);
                return (
                  <div key={r.id} className="card" style={{ marginBottom: 10 }}>
                    <div className="body">
                      <h3>{r.name}</h3>
                      <div className="meta">
                        {r.address || r.city || '（沒有地址資訊）'}
                        {r.notes ? <div>📝 {r.notes}</div> : null}
                      </div>
                      <div className="chips">
                        {r.cuisine && <span className="chip accent">{r.cuisine}</span>}
                        {r.priceRange && <span className="chip">{r.priceRange}</span>}
                        {r.dishes.slice(0, 3).map((d) => (
                          <span className="chip" key={d}>
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="card-actions">
                      <a className="nav-link" href={mapsUrl(r)} target="_blank" rel="noreferrer">
                        📍 導航
                      </a>
                      <button className="mini-btn" disabled={owned} onClick={() => handleCopyToMine(r)}>
                        {owned ? '✅ 已收藏' : '➕ 收藏'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
            <div className="sheet-actions">
              <button className="btn secondary" onClick={() => setViewing(null)}>
                ← 返回好友清單
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>👥 朋友</h2>
            {loggedIn === null ? (
              <p className="meta">
                載入中 <span className="spinner" />
              </p>
            ) : !loggedIn ? (
              <p className="meta" style={{ fontSize: 12.5 }}>
                請先到 ⚙️ 設定用 Google 登入，才能加好友、互看分享的美食清單。
              </p>
            ) : (
              <>
                <p className="meta" style={{ fontSize: 12.5 }}>
                  產生邀請連結傳給朋友（7 天內有效），對方登入後點開即成為好友。
                  只有你標了「分享給朋友」的收藏對方才看得到。
                </p>
                <div className="sheet-actions" style={{ marginTop: 10 }}>
                  <button className="btn secondary" disabled={busy} onClick={handleInvite}>
                    {busy ? <span className="spinner" /> : '🔗 產生邀請連結'}
                  </button>
                  {inviteLink && (
                    <button className="btn primary" onClick={handleCopy}>
                      📤 分享 / 複製
                    </button>
                  )}
                </div>
                {inviteLink && (
                  <p className="meta" style={{ fontSize: 12, wordBreak: 'break-all', marginTop: 8 }}>
                    {inviteLink}
                  </p>
                )}

                <h2 style={{ marginTop: 22 }}>我的好友</h2>
                {friends === null ? (
                  <p className="meta">
                    載入中 <span className="spinner" />
                  </p>
                ) : friends.length === 0 ? (
                  <p className="meta" style={{ fontSize: 12.5 }}>
                    還沒有好友，把上面的邀請連結傳給朋友吧。
                  </p>
                ) : (
                  friends.map((f) => (
                    <div
                      key={f.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 4px' }}
                    >
                      <span style={{ flex: 1, fontSize: 15 }}>{friendName(f)}</span>
                      <button className="mini-btn" onClick={() => handleView(f)}>
                        📋 看清單
                      </button>
                      <button className="mini-btn" onClick={() => handleRemove(f)}>
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </>
            )}
            {msg && (
              <p className={msg.error ? 'error-text' : 'meta'} style={{ fontSize: 12.5, marginTop: 8 }}>
                {msg.text}
              </p>
            )}
            <div className="sheet-actions">
              <button className="btn secondary" onClick={onClose}>
                完成
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

(function () {
  "use strict";

  if (window.__IGUC_INITIALIZED__) {
    window.dispatchEvent(new CustomEvent("IGUC_FORCE_OPEN"));
    return;
  }
  window.__IGUC_INITIALIZED__ = true;

  const APP_ID    = "936619743392459";
  const PAGE_SIZE = 50;

  let panelEl   = null;
  let isRunning = false;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "OPEN_PANEL") openPanel();
  });

  window.addEventListener("IGUC_FORCE_OPEN", () => openPanel());

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function apiFetch(url, rateLimitCallback) {
    const res = await fetch(url, { headers: { "x-ig-app-id": APP_ID } });
    if (res.status === 429) { 
      if (rateLimitCallback) rateLimitCallback("Rate limit hit! Cooling down for 5s...");
      await sleep(5000); 
      return apiFetch(url, rateLimitCallback); 
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function resolveUserInfo(username) {
    const data = await apiFetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`
    );
    const user = data.data.user;
    return {
      id:             user.id,
      followingCount: user.edge_follow?.count      ?? user.following_count ?? 0,
      followerCount:  user.edge_followed_by?.count ?? user.follower_count  ?? 0,
    };
  }

  async function fetchList(userId, listType, onProgress, rateLimitCallback) {
    const users = [];
    let cursor  = null;

    while (true) {
      const params = new URLSearchParams({ count: PAGE_SIZE });
      if (cursor) params.set("max_id", cursor);

      const data = await apiFetch(
        `https://www.instagram.com/api/v1/friendships/${userId}/${listType}/?${params}`,
        rateLimitCallback
      );

      const batch = data.users ?? [];
      users.push(...batch.map(u => ({
        id:       u.pk,
        username: u.username,
        fullName: u.full_name,
        pic:      u.profile_pic_url,
      })));

      cursor = data.next_max_id ?? null;
      onProgress(users.length);
      if (!cursor) break;
      await sleep(350); 
    }

    return users;
  }

  async function unfollowUser(targetId) {
    const csrf = document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "";
    const res  = await fetch(
      `https://www.instagram.com/api/v1/friendships/destroy/${targetId}/`,
      {
        method:  "POST",
        headers: {
          "x-ig-app-id":  APP_ID,
          "content-type": "application/x-www-form-urlencoded",
          "x-csrftoken":  csrf,
        },
        body: `user_id=${targetId}`,
      }
    );
    return res.ok;
  }

  const STYLES = `
    #iguc-panel * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    #iguc-panel {
      position: fixed; top: 20px; right: 20px; z-index: 2147483647;
      width: 360px; max-height: 90vh;
      background: #fff; border-radius: 16px;
      box-shadow: 0 4px 32px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.08);
      display: flex; flex-direction: column; overflow: hidden;
    }
    #iguc-header {
      padding: 14px 16px; border-bottom: 1px solid #f0f0f0;
      display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
    }
    #iguc-title { font-size: 15px; font-weight: 700; color: #0a0a0a; }
    #iguc-close {
      width: 28px; height: 28px; border-radius: 50%; border: none;
      background: #f5f5f5; cursor: pointer; font-size: 15px; color: #737373;
      display: flex; align-items: center; justify-content: center;
    }
    #iguc-close:hover { background: #e5e5e5; color: #0a0a0a; }
    #iguc-body { padding: 14px 16px; overflow-y: auto; flex: 1; }

    #iguc-username-row { display: none; gap: 8px; margin-bottom: 12px; }
    #iguc-username-input {
      flex: 1; padding: 9px 12px; border: 1px solid #dbdbdb;
      border-radius: 10px; font-size: 13px; color: #0a0a0a; outline: none;
    }
    #iguc-username-input:focus { border-color: #0095f6; }
    #iguc-run-btn {
      padding: 9px 16px; border-radius: 10px; border: none;
      background: #0095f6; color: #fff; font-size: 13px; font-weight: 600;
      cursor: pointer; white-space: nowrap;
    }
    #iguc-run-btn:hover { background: #0080d6; }
    #iguc-run-btn:disabled { background: #b2dffc; cursor: default; }

    #iguc-progress { margin-bottom: 12px; display: none; }
    #iguc-progress-text { font-size: 12px; color: #737373; margin-bottom: 6px; }
    #iguc-progress-bar-wrap { height: 3px; background: #f0f0f0; border-radius: 2px; overflow: hidden; }
    #iguc-progress-bar { height: 100%; width: 0%; background: #0095f6; border-radius: 2px; transition: width 0.3s; }

    #iguc-stats { display: none; gap: 8px; margin-bottom: 12px; }
    .iguc-stat { flex: 1; background: #fafafa; border: 1px solid #f0f0f0; border-radius: 10px; padding: 10px; text-align: center; }
    .iguc-stat-num   { font-size: 20px; font-weight: 700; color: #0a0a0a; }
    .iguc-stat-label { font-size: 11px; color: #737373; margin-top: 2px; }

    #iguc-error {
      font-size: 12px; color: #ef4444; margin-bottom: 10px; display: none;
      padding: 8px 12px; background: #fef2f2; border-radius: 8px; border: 1px solid #fecaca;
    }
    #iguc-empty { text-align: center; padding: 24px 0; color: #737373; font-size: 13px; display: none; }

    #iguc-list { display: flex; flex-direction: column; gap: 6px; }
    .iguc-user-row {
      display: flex; align-items: center; gap: 10px; padding: 8px 10px;
      border-radius: 10px; border: 1px solid #f0f0f0; background: #fff;
      transition: border-color 0.15s, opacity 0.3s;
    }
    .iguc-user-row:hover { border-color: #dbdbdb; }
    .iguc-user-row.unfollowed { opacity: 0.4; }
    .iguc-avatar { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; background: #f0f0f0; flex-shrink: 0; }
    .iguc-info { flex: 1; min-width: 0; }
    .iguc-uname {
      display: block; font-size: 13px; font-weight: 600; color: #0a0a0a;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none;
    }
    .iguc-uname:hover { text-decoration: underline; }
    .iguc-fname { font-size: 11px; color: #737373; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
    .iguc-unfollow-btn {
      padding: 6px 13px; border-radius: 8px; border: 1px solid #dbdbdb;
      background: #fff; font-size: 12px; font-weight: 600; color: #0a0a0a;
      cursor: pointer; flex-shrink: 0; white-space: nowrap; transition: all 0.15s;
    }
  `;

  function injectStyles() {
    if (document.getElementById("iguc-styles")) return;
    const style = document.createElement("style");
    style.id = "iguc-styles";
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  function getDetectedUsername() {
    // Strategy 1: Look at the top navigation profile link or sidebar avatar tracking link
    const profileLinks = document.querySelectorAll('a[href^="/"]');
    const exclusions = ['explore', 'reels', 'direct', 'messages', 'notifications', 'create', 'settings', 'emails', 'developer', 'about', 'blog', 'jobs', 'help', 'api', 'privacy', 'terms', 'locations', 'instagram', 'threads', 'p', 'stories'];
    
    // Find targeted node maps representing human user profiles
    for (const el of profileLinks) {
      const path = el.getAttribute('href').replace(/\//g, '').split('?')[0].trim();
      if (path && path.length > 1 && !exclusions.includes(path) && !path.includes('/')) {
        // If it features your structural icon container or specific tracking strings, map it
        if (el.querySelector('img') && (el.innerHTML.includes('Profile') || el.outerHTML.includes('avatar') || el.getAttribute('role') === 'link')) {
          return path;
        }
      }
    }
    return null;
  }

  function openPanel() {
    if (panelEl) { panelEl.style.display = "flex"; startAutoCheck(); return; }

    injectStyles();

    panelEl = document.createElement("div");
    panelEl.id = "iguc-panel";
    panelEl.innerHTML = `
      <div id="iguc-header">
        <span id="iguc-title">IG Unfollow Check</span>
        <button id="iguc-close" title="Close">✕</button>
      </div>
      <div id="iguc-body">
        <div id="iguc-error"></div>
        <!-- Hidden by default, exposed only if auto-detection misses context -->
        <div id="iguc-username-row">
          <input id="iguc-username-input" type="text" placeholder="Enter handle manually" />
          <button id="iguc-run-btn">Check</button>
        </div>
        <div id="iguc-progress">
          <div id="iguc-progress-text">Starting…</div>
          <div id="iguc-progress-bar-wrap"><div id="iguc-progress-bar"></div></div>
        </div>
        <div id="iguc-stats">
          <div class="iguc-stat"><div class="iguc-stat-num" id="stat-following">–</div><div class="iguc-stat-label">Following</div></div>
          <div class="iguc-stat"><div class="iguc-stat-num" id="stat-followers">–</div><div class="iguc-stat-label">Followers</div></div>
          <div class="iguc-stat"><div class="iguc-stat-num" id="stat-nonfollowers">–</div><div class="iguc-stat-label">Not following back</div></div>
        </div>
        <div id="iguc-empty">🎉 Everyone follows you back!</div>
        <div id="iguc-list"></div>
      </div>
    `;
    document.body.appendChild(panelEl);

    document.getElementById("iguc-close").addEventListener("click", () => {
      panelEl.style.display = "none";
    });

    document.getElementById("iguc-run-btn").addEventListener("click", () => {
      const val = document.getElementById("iguc-username-input").value.trim().replace(/^@/, "");
      if (val) runCheck(val);
    });

    startAutoCheck();
  }

  function startAutoCheck() {
    const detected = getDetectedUsername();
    if (detected) {
      document.getElementById("iguc-username-row").style.display = "none";
      runCheck(detected);
    } else {
      // Expose fallback fields if navigation scanning flags are empty
      document.getElementById("iguc-username-row").style.display = "flex";
      showError("Could not auto-detect username. Please verify manually below.");
    }
  }

  async function runCheck(username) {
    if (isRunning) return;

    isRunning = true;
    showError("");
    setProgress(true, "Resolving secure validation variables…", 2);
    document.getElementById("iguc-stats").style.display = "none";
    document.getElementById("iguc-list").innerHTML      = "";
    document.getElementById("iguc-empty").style.display = "none";

    const updateStatusText = (msg) => {
      const textNode = document.getElementById("iguc-progress-text");
      if (textNode) textNode.textContent = msg;
    };

    try {
      const userInfo = await resolveUserInfo(username);
      const myUserId = userInfo.id;
      const targetSum = userInfo.followingCount + userInfo.followerCount;

      const following = await fetchList(myUserId, "following", (n) => {
        const currentPct = targetSum > 0 ? (n / targetSum) * 92 : 45;
        setProgress(true, `Reading accounts you follow… (${n} / ${userInfo.followingCount})`, 3 + currentPct);
      }, updateStatusText);

      const followers = await fetchList(myUserId, "followers", (n) => {
        const processedTotal = following.length + n;
        const currentPct = targetSum > 0 ? (processedTotal / targetSum) * 92 : 90;
        setProgress(true, `Reading accounts following you… (${n} / ${userInfo.followerCount})`, 3 + currentPct);
      }, updateStatusText);

      setProgress(true, "Structuring local matrix configurations…", 98);
      await sleep(200);

      const followerIds  = new Set(followers.map(u => u.id));
      const nonFollowers = following.filter(u => !followerIds.has(u.id));

      document.getElementById("stat-following").textContent    = following.length;
      document.getElementById("stat-followers").textContent    = followers.length;
      document.getElementById("stat-nonfollowers").textContent = nonFollowers.length;
      document.getElementById("iguc-stats").style.display      = "flex";
      setProgress(false);

      if (nonFollowers.length === 0) {
        document.getElementById("iguc-empty").style.display = "block";
      } else {
        renderList(nonFollowers);
      }

    } catch (err) {
      setProgress(false);
      document.getElementById("iguc-username-row").style.display = "flex";
      showError(`Initialization error: ${err.message}. Ensure you are logged in to an active session.`);
    } finally {
      isRunning = false;
    }
  }

  function renderList(users) {
    const list = document.getElementById("iguc-list");
    list.innerHTML = "";

    users.forEach(user => {
      const row = document.createElement("div");
      row.className = "iguc-user-row";
      row.innerHTML = `
        <img class="iguc-avatar" src="${user.pic}" alt="" onerror="this.style.visibility='hidden'" />
        <div class="iguc-info">
          <a class="iguc-uname" href="https://instagram.com/${user.username}" target="_blank">@${user.username}</a>
          <div class="iguc-fname">${user.fullName || ""}</div>
        </div>
        <button class="iguc-unfollow-btn" data-id="${user.id}">Unfollow</button>
      `;
      list.appendChild(row);

      row.querySelector(".iguc-unfollow-btn").addEventListener("click", () => {
        handleUnfollow(row, user);
      });
    });
  }

  async function handleUnfollow(row, user) {
    const btn = row.querySelector(".iguc-unfollow-btn");
    btn.textContent = "Unfollowing…";
    btn.className   = "iguc-unfollow-btn loading";
    btn.disabled    = true;

    try {
      const ok = await unfollowUser(user.id);
      if (ok) {
        btn.textContent = "Unfollowed";
        btn.className   = "iguc-unfollow-btn done";
        row.classList.add("unfollowed");
        const countEl = document.getElementById("stat-nonfollowers");
        countEl.textContent = Math.max(0, parseInt(countEl.textContent, 10) - 1);
      } else {
        resetButton(btn, row, user);
      }
    } catch {
      resetButton(btn, row, user);
    }
  }

  function resetButton(btn, row, user) {
    btn.textContent = "Retry";
    btn.className   = "iguc-unfollow-btn error";
    btn.disabled    = false;
    btn.addEventListener("click", () => handleUnfollow(row, user), { once: true });
  }

  function setProgress(visible, text = "", pct = 0) {
    const el  = document.getElementById("iguc-progress");
    const bar = document.getElementById("iguc-progress-bar");
    const txt = document.getElementById("iguc-progress-text");
    if (!el || !bar || !txt) return;
    el.style.display = visible ? "block" : "none";
    txt.textContent  = text;
    bar.style.width  = `${pct}%`;
  }

  function showError(msg) {
    const el = document.getElementById("iguc-error");
    if (!el) return;
    el.textContent   = msg;
    el.style.display = msg ? "block" : "none";
  }

})();
/**
 * AURORA TEAM - TELEGRAM MINI APP CONTROLLER
 * Real-time server sync via REST API + SSE + Native Telegram WebApp SDK
 */

// ==========================================
// TELEGRAM WEBAPP SDK INTEGRATION
// ==========================================
const tg = window.Telegram?.WebApp;

if (tg) {
  try {
    tg.ready();
    tg.expand();
    if (tg.setHeaderColor) tg.setHeaderColor('#000000');
    if (tg.setBackgroundColor) tg.setBackgroundColor('#000000');
    if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
  } catch (e) {
    console.log('Telegram WebApp init warning', e);
  }
}

// Haptic & Sound Feedback Helper
const haptic = {
  tap() {
    if (tg?.HapticFeedback) {
      try { tg.HapticFeedback.impactOccurred('light'); } catch (e) {}
    }
    sfx.tap();
  },
  success() {
    if (tg?.HapticFeedback) {
      try { tg.HapticFeedback.notificationOccurred('success'); } catch (e) {}
    }
    sfx.success();
  },
  error() {
    if (tg?.HapticFeedback) {
      try { tg.HapticFeedback.notificationOccurred('error'); } catch (e) {}
    }
    sfx.delete();
  },
  selection() {
    if (tg?.HapticFeedback) {
      try { tg.HapticFeedback.selectionChanged(); } catch (e) {}
    }
    sfx.tap();
  }
};

// Web Audio Fallback
class SoundFX {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  tap() {
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch (e) {}
  }

  success() {
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {}
  }

  delete() {
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.06);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.06);
    } catch (e) {}
  }
}

const sfx = new SoundFX();

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'normal') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = '⚡';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '⚠️';
  
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  if (type === 'success') haptic.success();
  else if (type === 'error') haptic.error();
  else haptic.tap();

  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 2500);
}

// ==========================================
// API CLIENT & REAL-TIME EVENT STREAM (SSE)
// ==========================================
class RealtimeStore {
  constructor() {
    this.state = {
      user: {
        username: 'name',
        userId: '620771081',
        tag: '#teg',
        logsCount: 48,
        daysInTeam: 24,
        tonWallet: '',
        tonBalance: 0,
        tonWithdrawn: 0
      },
      minions: ['8100791171', '8321020721', '8058235111', '5227767831'],
      stars: {
        postUrl: 'https://t.me/name/1',
        withdrawStars: true,
        howWithdraw: 'all'
      },
      config: {
        extraLog: true,
        apiId: '',
        apiHash: ''
      },
      logsChat: {
        chatId: '',
        threadId: ''
      },
      sessions: [],
      contest: null
    };

    // Override with Telegram user if available
    if (tg?.initDataUnsafe?.user) {
      const u = tg.initDataUnsafe.user;
      this.state.user.username = u.username || `${u.first_name} ${u.last_name || ''}`.trim();
      this.state.user.userId = String(u.id);
      
      if (u.photo_url) {
        this.state.user.photoUrl = u.photo_url;
      }
    }

    this.init();
  }

  // Новый метод для синхронизации личности из Telegram
  applyTelegramIdentity() {
    if (tg?.initDataUnsafe?.user) {
      const u = tg.initDataUnsafe.user;
      this.state.user.username = u.username || `${u.first_name} ${u.last_name || ''}`.trim();
      this.state.user.userId = String(u.id);
      if (u.photo_url) this.state.user.photoUrl = u.photo_url;
    }
  }

  async init() {
    await this.fetchInitialData();
    this.initSSE();
  }

  async fetchInitialData() {
    try {
      const res = await fetch('/api/data');
      if (res.ok) {
        const data = await res.json();
        this.state = { ...this.state, ...data };
        this.applyTelegramIdentity(); // Гарантируем приоритет данных TG
        if (window.app) window.app.renderAll();
      }
    } catch (e) {
      console.log('Server offline or local preview, using internal state');
    }
  }

  initSSE() {
    try {
      const es = new EventSource('/api/events');
      
      es.addEventListener('user_updated', (e) => {
        this.state.user = JSON.parse(e.data);
        this.applyTelegramIdentity(); // Применяем данные TG после обновления с сервера
        if (window.app) window.app.renderProfile();
      });

      es.addEventListener('minions_updated', (e) => {
        this.state.minions = JSON.parse(e.data);
        if (window.app) window.app.renderMinions();
      });

      es.addEventListener('stars_updated', (e) => {
        this.state.stars = JSON.parse(e.data);
        if (window.app) window.app.renderStars();
      });

      es.addEventListener('config_updated', (e) => {
        this.state.config = JSON.parse(e.data);
        if (window.app) window.app.renderConfig();
      });

      es.addEventListener('logs_chat_updated', (e) => {
        this.state.logsChat = JSON.parse(e.data);
        if (window.app) window.app.renderLogsSettings();
      });

      es.addEventListener('sessions_updated', (e) => {
        this.state.sessions = JSON.parse(e.data);
        if (window.app) window.app.renderSessions();
      });

      es.addEventListener('new_log', (e) => {
        const log = JSON.parse(e.data);
        showToast(`🔔 Лог от ${log.user} (${log.city})`, 'success');
        this.state.user.logsCount++;
        if (window.app) {
          window.app.renderProfile();
          window.app.renderLeaderboard();
        }
      });

      es.onerror = () => {
        // SSE reconnects automatically
      };
    } catch (e) {
      console.warn('SSE not available in this environment', e);
    }
  }

  // API Mutators
  async saveWallet(wallet) {
    this.state.user.tonWallet = wallet;
    try {
      await fetch('/api/user/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet })
      });
    } catch (e) {}
  }

  async saveTag(tag) {
    this.state.user.tag = tag;
    try {
      await fetch('/api/user/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag })
      });
    } catch (e) {}
  }

  async addMinion(id) {
    if (!this.state.minions.includes(id)) {
      this.state.minions.unshift(id);
      try {
        await fetch('/api/minions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
      } catch (e) {}
      return true;
    }
    return false;
  }

  async removeMinion(id) {
    this.state.minions = this.state.minions.filter(m => m !== id);
    try {
      await fetch(`/api/minions/${id}`, { method: 'DELETE' });
    } catch (e) {}
  }

  async saveStars(starsData) {
    this.state.stars = { ...this.state.stars, ...starsData };
    try {
      await fetch('/api/stars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.state.stars)
      });
    } catch (e) {}
  }

  async saveConfig(configData) {
    this.state.config = { ...this.state.config, ...configData };
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.state.config)
      });
    } catch (e) {}
  }

  async saveLogsChat(logsChatData) {
    this.state.logsChat = { ...this.state.logsChat, ...logsChatData };
    try {
      await fetch('/api/logs/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.state.logsChat)
      });
    } catch (e) {}
  }

  async triggerTestLog() {
    try {
      await fetch('/api/logs/test', { method: 'POST' });
    } catch (e) {}
  }
}

const store = new RealtimeStore();

// ==========================================
// NAVIGATION & ROUTING
// ==========================================
class AppRouter {
  constructor() {
    this.activeTab = 'viewProfile';
    this.activeSubView = null;
    this.subViewHistory = [];

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.tabButtons = document.querySelectorAll('.tab-btn');
    this.tabViews = document.querySelectorAll('.tab-view');
    this.subViews = document.querySelectorAll('.sub-view');
    this.backButtons = document.querySelectorAll('.btn-sub-back');
  }

  bindEvents() {
    // Tab switching
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        if (tabId) {
          haptic.selection();
          this.switchTab(tabId);
        }
      });
    });

    // Subview inline back buttons
    this.backButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        haptic.tap();
        this.popSubView();
      });
    });

    // Telegram Native BackButton Handler
    if (tg?.BackButton) {
      tg.BackButton.onClick(() => {
        if (this.activeSubView) {
          this.popSubView();
        }
      });
    }

    // Sub-view triggers from Settings
    document.getElementById('navSubLogs')?.addEventListener('click', () => {
      haptic.tap();
      this.pushSubView('subViewLogs');
    });

    document.getElementById('navSubConfig')?.addEventListener('click', () => {
      haptic.tap();
      this.pushSubView('subViewConfig');
    });

    document.getElementById('navSubStars')?.addEventListener('click', () => {
      haptic.tap();
      this.pushSubView('subViewStars');
    });

    document.getElementById('navSubInline')?.addEventListener('click', () => {
      haptic.tap();
      this.pushSubView('subViewInline');
    });

    // Sub-view triggers from Info
    document.getElementById('navSubRules')?.addEventListener('click', () => {
      haptic.tap();
      this.pushSubView('subViewRules');
    });
  }

  switchTab(tabId) {
    if (this.activeSubView) {
      this.closeAllSubViews();
    }

    this.activeTab = tabId;

    this.tabButtons.forEach(btn => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    this.tabViews.forEach(view => {
      if (view.id === tabId) {
        view.classList.add('active');
      } else {
        view.classList.remove('active');
      }
    });

    // Hide Native Telegram Back Button
    if (tg?.BackButton) {
      try { tg.BackButton.hide(); } catch (e) {}
    }

    if (tabId === 'viewSessions') {
      this.handleSessionsTabOpen();
    }
  }

  pushSubView(subViewId) {
    const subView = document.getElementById(subViewId);
    if (!subView) return;

    this.activeSubView = subViewId;
    this.subViewHistory.push({ id: subViewId });

    this.subViews.forEach(v => v.classList.remove('active'));
    subView.classList.add('active');

    // Show Native Telegram Back Button
    if (tg?.BackButton) {
      try { tg.BackButton.show(); } catch (e) {}
    }
  }

  popSubView() {
    if (this.subViewHistory.length > 0) {
      const current = this.subViewHistory.pop();
      const currentEl = document.getElementById(current.id);
      if (currentEl) currentEl.classList.remove('active');

      if (this.subViewHistory.length > 0) {
        const prev = this.subViewHistory[this.subViewHistory.length - 1];
        this.activeSubView = prev.id;
        const prevEl = document.getElementById(prev.id);
        if (prevEl) prevEl.classList.add('active');
      } else {
        this.activeSubView = null;
        if (tg?.BackButton) {
          try { tg.BackButton.hide(); } catch (e) {}
        }
      }
    } else {
      this.activeSubView = null;
      if (tg?.BackButton) {
        try { tg.BackButton.hide(); } catch (e) {}
      }
    }
  }

  closeAllSubViews() {
    this.subViews.forEach(v => v.classList.remove('active'));
    this.activeSubView = null;
    this.subViewHistory = [];
    if (tg?.BackButton) {
      try { tg.BackButton.hide(); } catch (e) {}
    }
  }

  handleSessionsTabOpen() {
    const spinner = document.querySelector('.sessions-status-block');
    const activePanel = document.getElementById('activeSessionsPanel');
    if (spinner && activePanel) {
      spinner.style.display = 'flex';
      activePanel.style.display = 'none';

      setTimeout(() => {
        spinner.style.display = 'none';
        activePanel.style.display = 'block';
      }, 1000);
    }
  }
}

// ==========================================
// MODAL CONTROLLER
// ==========================================
class ModalManager {
  constructor() {
    this.activeModal = null;
    this.bindEvents();
  }

  open(modalId) {
    haptic.tap();
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      this.activeModal = modal;
    }
  }

  close(modalId) {
    haptic.tap();
    const modal = modalId ? document.getElementById(modalId) : this.activeModal;
    if (modal) {
      modal.classList.remove('active');
      if (this.activeModal === modal) {
        this.activeModal = null;
      }
    }
  }

  bindEvents() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.close(overlay.id);
        }
      });
    });

    document.getElementById('btnCloseTonModal')?.addEventListener('click', () => this.close('modalTonWallet'));
    document.getElementById('btnCloseWithdrawModal')?.addEventListener('click', () => this.close('modalWithdraw'));
    document.getElementById('btnCloseTagModal')?.addEventListener('click', () => this.close('modalChangeTag'));
    document.getElementById('btnCloseMentors')?.addEventListener('click', () => this.close('modalMentors'));
    document.getElementById('btnCloseApiModal')?.addEventListener('click', () => this.close('modalApiConfig'));
    document.getElementById('btnCloseLogSettings')?.addEventListener('click', () => this.close('modalLogSettings'));
    document.getElementById('btnCancelLink')?.addEventListener('click', () => this.close('modalLinkConfirm'));
  }
}

const modals = new ModalManager();

// ==========================================
// UI & CONTROLLER
// ==========================================
class UIController {
  constructor() {
    this.router = new AppRouter();
    this.renderAll();
    this.bindActions();
    this.startCountdown();
  }

  renderAll() {
    this.renderProfile();
    this.renderMinions();
    this.renderStars();
    this.renderConfig();
    this.renderLogsSettings();
    this.renderSessions();
    this.renderLeaderboard();
  }

  renderProfile() {
    const { user } = store.state;
    document.getElementById('profileUsername').textContent = user.username;
    document.getElementById('profileUserId').textContent = `ID ${user.userId}`;
    document.getElementById('currentTagValue').textContent = user.tag;
    document.getElementById('metricLogs').textContent = user.logsCount;
    document.getElementById('metricDays').textContent = user.daysInTeam;

    const img = document.getElementById('avatarImg');
    if (img) {
      if (user.photoUrl) {
        img.src = user.photoUrl;
      } else if (tg?.initDataUnsafe?.user?.photo_url) {
        img.src = tg.initDataUnsafe.user.photo_url;
      }
      
      // Error handling for avatar load
      img.onerror = () => {
        img.src = 'assets/avatar.svg';
        img.onerror = null;
      };
    }

    const tonDisplay = document.getElementById('tonWalletDisplay');
    const tonBtn = document.getElementById('btnTonWalletAction');

    if (user.tonWallet && user.tonWallet.trim().length > 0) {
      const shortAddr = user.tonWallet.slice(0, 4) + '...' + user.tonWallet.slice(-4);
      tonDisplay.textContent = shortAddr;
      tonBtn.textContent = 'Изменить TON-кошелек';
    } else {
      tonDisplay.textContent = 'Не указан';
      tonBtn.textContent = 'Добавить TON-кошелек';
    }

    document.getElementById('tonBalanceDisplay').textContent = `${user.tonBalance} TON`;
    document.getElementById('tonWithdrawnDisplay').textContent = `${user.tonWithdrawn} TON`;
    
    // Sync Withdraw Modal if it's open/exists
    const availEl = document.getElementById('withdrawAvailable');
    const targetEl = document.getElementById('withdrawWalletTarget');
    if (availEl) availEl.textContent = `${user.tonBalance} TON`;
    if (targetEl) targetEl.textContent = user.tonWallet || 'Не указан';
  }

  renderMinions() {
    const container = document.getElementById('minionsContainer');
    if (!container) return;
    container.innerHTML = '';

    store.state.minions.forEach(id => {
      const item = document.createElement('div');
      item.className = 'minion-item';
      item.innerHTML = `
        <span class="minion-id">${id}</span>
        <button class="btn-delete-minion" data-id="${id}" title="Удалить">×</button>
      `;

      item.querySelector('.btn-delete-minion').addEventListener('click', (e) => {
        e.stopPropagation();
        haptic.error();
        store.removeMinion(id);
        this.renderMinions();
        showToast(`ID ${id} удален`, 'normal');
      });

      container.appendChild(item);
    });
  }

  renderStars() {
    const { stars } = store.state;
    const inputPost = document.getElementById('inputStarsPost');
    if (inputPost) inputPost.value = stars.postUrl;

    const segWithdraw = document.getElementById('segWithdrawStars');
    if (segWithdraw) {
      segWithdraw.querySelectorAll('.seg-btn').forEach(btn => {
        const val = btn.getAttribute('data-value') === 'true';
        if (val === stars.withdrawStars) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    const segHow = document.getElementById('segHowWithdraw');
    if (segHow) {
      segHow.querySelectorAll('.seg-btn').forEach(btn => {
        const val = btn.getAttribute('data-value');
        if (val === stars.howWithdraw) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    this.updateStarsHelpNote(stars.howWithdraw);
  }

  updateStarsHelpNote(mode) {
    const note = document.getElementById('starsHelpNote');
    if (!note) return;
    if (mode === 'all') {
      note.textContent = 'Снимать все: забираем все ⭐ реакциями на пост, ничего не оставляем.';
    } else {
      note.textContent = 'С остатком: на балансе аккаунта остаётся часть звёзд для маскировки.';
    }
  }

  renderConfig() {
    const switchExtra = document.getElementById('switchExtraLog');
    if (switchExtra) {
      switchExtra.checked = store.state.config.extraLog;
    }
    const inputApiId = document.getElementById('inputApiId');
    const inputApiHash = document.getElementById('inputApiHash');
    if (inputApiId) inputApiId.value = store.state.config.apiId;
    if (inputApiHash) inputApiHash.value = store.state.config.apiHash;
  }

  renderLogsSettings() {
    const inputChatId = document.getElementById('inputChatId');
    const inputThreadId = document.getElementById('inputThreadId');
    if (inputChatId) inputChatId.value = store.state.logsChat.chatId;
    if (inputThreadId) inputThreadId.value = store.state.logsChat.threadId;
  }

  renderSessions() {
    const container = document.getElementById('sessionsListContainer');
    const countEl = document.getElementById('activeBotsCount');
    if (!container) return;

    const sessions = store.state.sessions && store.state.sessions.length > 0
      ? store.state.sessions
      : [
          { bot: '@X9aurorabot', sessionName: 'Сессия #1', location: 'NL, Amsterdam', os: 'iOS 18.7', ip: '213.111.139.195', ping: 28 },
          { bot: '@alprozalameilfitness', sessionName: 'Сессия #2', location: 'US, Ashburn', os: 'iOS 18.7', ip: '195.181.173.212', ping: 44 },
          { bot: '@name_bot', sessionName: 'Сессия #3', location: 'DE, Frankfurt', os: 'Android 14', ip: '188.114.97.12', ping: 32 }
        ];

    if (countEl) countEl.textContent = sessions.length;

    container.innerHTML = sessions.map(s => `
      <div class="session-item-card">
        <div class="session-info-left">
          <div class="session-dot online"></div>
          <div>
            <div class="session-bot-name">${s.bot} (${s.sessionName})</div>
            <div class="session-meta">${s.location} • ${s.os} • ${s.ip}</div>
          </div>
        </div>
        <div class="session-ping">${s.ping} ms</div>
      </div>
    `).join('');
  }

  renderLeaderboard() {
    const container = document.getElementById('leaderboardContainer');
    if (!container) return;

    let list = store.state.contest?.leaderboard || [
      { rank: 1, name: '@cryptoking', logs: 342, prize: '$10,000', badge: 'gold' },
      { rank: 2, name: '@dark_venom', logs: 289, prize: '$6,000', badge: 'silver' },
      { rank: 3, name: '@aurora_boss', logs: 215, prize: '$3,500', badge: 'bronze' },
      { rank: 4, name: '@phantom_x', logs: 180, prize: '$2,000' },
      { rank: 5, name: '@cyber_ninja', logs: 134, prize: '$1,500' },
      { rank: 6, name: '@storm_worker', logs: 92, prize: '$1,000' },
      { rank: 7, name: `@${store.state.user.username} (Вы)`, logs: store.state.user.logsCount, prize: '$500', isSelf: true }
    ];

    // Sync "Self" logs with current user state
    list = list.map(item => {
      if (item.isSelf) {
        return { 
          ...item, 
          name: `@${store.state.user.username} (Вы)`, 
          logs: store.state.user.logsCount 
        };
      }
      return item;
    });

    container.innerHTML = list.map(item => `
      <div class="lb-item ${item.badge || ''} ${item.isSelf ? 'highlighted-self' : ''}">
        <div class="lb-rank">${item.rank === 1 ? '🥇 1' : item.rank === 2 ? '🥈 2' : item.rank === 3 ? '🥉 3' : item.rank}</div>
        <div class="lb-user-info">
          <span class="lb-name">${item.name}</span>
          <span class="lb-sub">${item.logs} логов</span>
        </div>
        <div class="lb-prize">${item.prize}</div>
      </div>
    `).join('');
    
    // Also sync the "Your Standing" card in the Contest view
    const selfEntry = list.find(i => i.isSelf);
    if (selfEntry) {
      const myRankEl = document.getElementById('myStandingRank');
      const myNameEl = document.getElementById('myStandingName');
      const myLogsEl = document.getElementById('myStandingLogs');
      
      if (myRankEl) myRankEl.textContent = `#${selfEntry.rank}`;
      if (myNameEl) myNameEl.textContent = selfEntry.name;
      if (myLogsEl) myLogsEl.textContent = `${selfEntry.logs} логов • Приз: ${selfEntry.prize}`;
    }
  }

  bindActions() {
    // Profile Actions
    document.getElementById('btnTonWalletAction')?.addEventListener('click', () => {
      const input = document.getElementById('inputTonAddress');
      if (input) input.value = store.state.user.tonWallet || '';
      modals.open('modalTonWallet');
    });

    document.getElementById('btnSaveTonAddress')?.addEventListener('click', async () => {
      const input = document.getElementById('inputTonAddress');
      const val = input.value.trim();
      if (val.length < 5) {
        showToast('Введите корректный адрес TON', 'error');
        return;
      }
      await store.saveWallet(val);
      this.renderProfile();
      modals.close('modalTonWallet');
      showToast('TON-кошелек успешно сохранен!', 'success');
    });

    document.getElementById('btnTonWithdrawAction')?.addEventListener('click', () => {
      const availEl = document.getElementById('withdrawAvailable');
      const targetEl = document.getElementById('withdrawWalletTarget');
      if (availEl) availEl.textContent = `${store.state.user.tonBalance} TON`;
      if (targetEl) targetEl.textContent = store.state.user.tonWallet || 'Не указан';
      modals.open('modalWithdraw');
    });

    document.getElementById('btnSubmitWithdraw')?.addEventListener('click', () => {
      if (!store.state.user.tonWallet) {
        showToast('Сначала укажите TON-кошелек', 'error');
        return;
      }
      if (store.state.user.tonBalance <= 0) {
        showToast('Недостаточно средств на балансе', 'error');
        return;
      }
      modals.close('modalWithdraw');
      showToast('Заявка на вывод создана', 'success');
    });

    // Tag change
    const openTagModal = () => {
      const input = document.getElementById('inputNewTag');
      if (input) input.value = store.state.user.tag;
      modals.open('modalChangeTag');
    };

    document.getElementById('btnChangeTag')?.addEventListener('click', openTagModal);
    document.getElementById('btnPillTag')?.addEventListener('click', openTagModal);

    document.getElementById('btnSaveNewTag')?.addEventListener('click', async () => {
      const input = document.getElementById('inputNewTag');
      let val = input.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (val.length <= 1) {
        showToast('Тэг не может быть пустым', 'error');
        return;
      }
      await store.saveTag(val);
      this.renderProfile();
      this.renderLeaderboard();
      modals.close('modalChangeTag');
      showToast(`Тэг изменен на ${val}`, 'success');
    });

    // Mentors modal
    document.getElementById('btnMentors')?.addEventListener('click', () => {
      modals.open('modalMentors');
    });

    // Minion ID Add
    document.getElementById('btnAddMinion')?.addEventListener('click', async () => {
      const input = document.getElementById('inputMinionId');
      const val = input.value.trim();
      if (!val || isNaN(val) || val.length < 5) {
        showToast('Введите корректный Telegram ID', 'error');
        return;
      }
      const added = await store.addMinion(val);
      if (added) {
        input.value = '';
        this.renderMinions();
        showToast(`Миньон ${val} добавлен!`, 'success');
      } else {
        showToast('Этот ID уже добавлен в список', 'error');
      }
    });

    // Stars Segmented controls
    const segWithdraw = document.getElementById('segWithdrawStars');
    if (segWithdraw) {
      segWithdraw.querySelectorAll('.seg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          haptic.selection();
          segWithdraw.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const isWithdraw = btn.getAttribute('data-value') === 'true';
          store.saveStars({ withdrawStars: isWithdraw });
        });
      });
    }

    const segHow = document.getElementById('segHowWithdraw');
    if (segHow) {
      segHow.querySelectorAll('.seg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          haptic.selection();
          segHow.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const mode = btn.getAttribute('data-value');
          store.saveStars({ howWithdraw: mode });
          this.updateStarsHelpNote(mode);
        });
      });
    }

    // Save Stars
    document.getElementById('btnSaveStars')?.addEventListener('click', async () => {
      const postUrl = document.getElementById('inputStarsPost').value.trim();
      await store.saveStars({ postUrl });
      showToast('Настройки звёзд сохранены!', 'success');
    });

    // Config Extra Log switch
    document.getElementById('switchExtraLog')?.addEventListener('change', async (e) => {
      haptic.selection();
      await store.saveConfig({ extraLog: e.target.checked });
      showToast(e.target.checked ? 'Дополнительный лог включен' : 'Дополнительный лог выключен');
    });

    // Config API Modal
    document.getElementById('btnOpenApiConfig')?.addEventListener('click', () => {
      modals.open('modalApiConfig');
    });

    document.getElementById('btnSaveApiConfig')?.addEventListener('click', async () => {
      const apiId = document.getElementById('inputApiId').value.trim();
      const apiHash = document.getElementById('inputApiHash').value.trim();
      await store.saveConfig({ apiId, apiHash });
      modals.close('modalApiConfig');
      showToast('Telegram API ключи сохранены', 'success');
    });

    // Log Chat Settings
    document.getElementById('btnManageLogs')?.addEventListener('click', () => {
      modals.open('modalLogSettings');
    });

    document.getElementById('btnSaveLogSettings')?.addEventListener('click', async () => {
      const chatId = document.getElementById('inputChatId').value.trim();
      const threadId = document.getElementById('inputThreadId').value.trim();
      await store.saveLogsChat({ chatId, threadId });
      modals.close('modalLogSettings');
      showToast('Настройки чата сохранены', 'success');
    });

    document.getElementById('btnTestLog')?.addEventListener('click', async () => {
      await store.triggerTestLog();
      showToast('🔔 Тестовый лог отправлен!', 'success');
    });

    // Info Tab Items
    document.getElementById('btnInfoLogs')?.addEventListener('click', () => {
      haptic.tap();
      showToast('Логи отстука подключены', 'normal');
    });

    document.getElementById('btnInfoManuals')?.addEventListener('click', () => {
      modals.open('modalLinkConfirm');
    });

    document.getElementById('btnConfirmLink')?.addEventListener('click', () => {
      modals.close('modalLinkConfirm');
      if (tg?.openLink) {
        tg.openLink('https://teletype.in/@aurora_manuals/fbi4Wst94Ko');
      } else {
        window.open('https://teletype.in/@aurora_manuals/fbi4Wst94Ko', '_blank');
      }
    });

    document.getElementById('btnInfoParser')?.addEventListener('click', () => {
      haptic.tap();
      showToast('Запуск парсера...', 'normal');
    });

    // Rules Accordion
    document.getElementById('rulesToggleHeader')?.addEventListener('click', () => {
      haptic.tap();
      const chevron = document.getElementById('rulesChevron');
      const content = document.getElementById('rulesListContainer');
      if (content.style.display === 'none') {
        content.style.display = 'flex';
        chevron.classList.remove('collapsed');
      } else {
        content.style.display = 'none';
        chevron.classList.add('collapsed');
      }
    });

    // Sessions Refresh
    document.getElementById('btnRefreshSessions')?.addEventListener('click', () => {
      haptic.tap();
      showToast('Сессии обновлены (3 активных бота)', 'success');
    });
  }

  startCountdown() {
    const cdDays = document.getElementById('cdDays');
    const cdHours = document.getElementById('cdHours');
    const cdMins = document.getElementById('cdMins');
    const cdSecs = document.getElementById('cdSecs');

    setInterval(() => {
      const endTime = store.state.contest?.endTime || (Date.now() + 400000000);
      let totalSeconds = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      
      const d = Math.floor(totalSeconds / 86400);
      const h = Math.floor((totalSeconds % 86400) / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;

      if (cdDays) cdDays.textContent = String(d).padStart(2, '0');
      if (cdHours) cdHours.textContent = String(h).padStart(2, '0');
      if (cdMins) cdMins.textContent = String(m).padStart(2, '0');
      if (cdSecs) cdSecs.textContent = String(s).padStart(2, '0');
    }, 1000);
  }
}

// Boot application
document.addEventListener('DOMContentLoaded', () => {
  window.app = new UIController();
});

// ============================================================
// 工具函数
// ============================================================

function escapeHtml(str) {
  if (str == null) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, (ch) => map[ch]);
}

function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function throttle(fn, delay = 300) {
  let last = 0;
  let timer = null;
  return function (...args) {
    const now = Date.now();
    const remaining = delay - (now - last);
    clearTimeout(timer);
    if (remaining <= 0) {
      last = now;
      fn.apply(this, args);
    } else {
      timer = setTimeout(() => {
        last = Date.now();
        fn.apply(this, args);
      }, remaining);
    }
  };
}

// ============================================================
// 本地存储工具（支持JSON序列化和过期时间）
// ============================================================

const Storage = {
  get(key, defaultValue) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.__expire && Date.now() > parsed.__expire) {
        localStorage.removeItem(key);
        return defaultValue;
      }
      return parsed && parsed.__expire !== undefined ? parsed.value : parsed;
    } catch {
      return defaultValue;
    }
  },

  set(key, value, ttlMs) {
    const payload = ttlMs
      ? { value, __expire: Date.now() + ttlMs }
      : value;
    localStorage.setItem(key, JSON.stringify(payload));
  },

  remove(key) {
    localStorage.removeItem(key);
  },

  has(key) {
    const raw = localStorage.getItem(key);
    if (raw === null) return false;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.__expire && Date.now() > parsed.__expire) {
        localStorage.removeItem(key);
        return false;
      }
      return true;
    } catch {
      return true;
    }
  }
};

// ============================================================
// API 请求
// ============================================================

const API = {
  config: null,
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),

  async request(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json();

    if (response.status === 401) {
      this.logout();
      if (!window.location.pathname.includes('login')) {
        window.location.href = '/login';
      }
      throw new Error(data.message || '未登录');
    }

    if (!data.success && !response.ok) {
      throw new Error(data.message || '请求失败');
    }

    return data;
  },

  get(url) {
    return this.request(url);
  },

  post(url, data) {
    return this.request(url, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  put(url, data) {
    return this.request(url, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  delete(url) {
    return this.request(url, {
      method: 'DELETE'
    });
  },

  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    const headers = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch('/api/upload', {
      method: 'POST',
      headers,
      body: formData
    });

    return response.json();
  },

  setAuth(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  },

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  isLoggedIn() {
    return !!this.token && !!this.user;
  },

  hasRole(...roles) {
    return this.user && roles.includes(this.user.role);
  },

  async loadConfig() {
    if (!this.config) {
      const data = await this.get('/api/config');
      this.config = data.data;
    }
    return this.config;
  }
};

// ============================================================
// Toast —— 去重 + 垂直堆叠
// ============================================================

const _toastState = {
  active: new Map(),
  container: null
};

function _getToastContainer() {
  if (!_toastState.container || !document.body.contains(_toastState.container)) {
    let c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      c.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10001;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
      document.body.appendChild(c);
    }
    _toastState.container = c;
  }
  return _toastState.container;
}

function showToast(message, type = 'info') {
  const key = `${type}::${message}`;
  if (_toastState.active.has(key)) return;

  const container = _getToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = message;
  toast.style.pointerEvents = 'auto';
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(-10px)';
  toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  _toastState.active.set(key, toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      toast.remove();
      _toastState.active.delete(key);
    }, 300);
  }, 3000);
}

// ============================================================
// Modal —— 基于回调的 Promise 实现
// ============================================================

function showModal(options) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    const headerBtn = options.showFooter === false
      ? `<button class="modal-close">&times;</button>`
      : `<button class="modal-close">&times;</button>`;

    const footerHtml = options.showFooter !== false ? `
      <div class="modal-footer">
        <button class="btn btn-outline" data-action="cancel">取消</button>
        <button class="btn btn-primary" data-action="confirm">确定</button>
      </div>
    ` : '';

    modal.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">${options.title || '提示'}</h3>
        ${headerBtn}
      </div>
      <div class="modal-body">
        ${options.content || ''}
      </div>
      ${footerHtml}
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelector('.modal-close').addEventListener('click', () => close(false));

    const cancelBtn = modal.querySelector('[data-action="cancel"]');
    if (cancelBtn) cancelBtn.addEventListener('click', () => close(false));

    const confirmBtn = modal.querySelector('[data-action="confirm"]');
    if (confirmBtn) confirmBtn.addEventListener('click', () => close(true));

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKeyDown);
        close(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);

    if (options.showFooter === false) resolve();
  });
}

// ============================================================
// 日期 / 时间 工具
// ============================================================

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateRange(start, end) {
  if (!start && !end) return '';
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;

  const fmt = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  if (s && e) {
    if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
      return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')} ~ ${String(e.getDate()).padStart(2, '0')}日`;
    }
    if (s.getFullYear() === e.getFullYear()) {
      return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')} ~ ${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
    }
    return `${fmt(s)} ~ ${fmt(e)}`;
  }
  return fmt(s || e);
}

function formatRelativeTime(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;
  if (diffWeek < 4) return `${diffWeek}周前`;
  if (diffMonth < 12) return `${diffMonth}个月前`;
  return `${diffYear}年前`;
}

// ============================================================
// 搜索 / 过滤工具
// ============================================================

function highlightText(text, keyword) {
  if (!text || !keyword) return escapeHtml(text || '');
  const escaped = escapeHtml(text);
  const kw = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(new RegExp(`(${kw})`, 'gi'), '<mark>$1</mark>');
}

// ============================================================
// 科目配色（20+ 种）
// ============================================================

function getSubjectColor(subjectName) {
  const colors = {
    '语文': '#E8463A',
    '数学': '#4B3FE3',
    '英语': '#22A5F7',
    '物理': '#1DC981',
    '化学': '#F87454',
    '生物': '#27D2BF',
    '政治': '#EFAA17',
    '历史': '#8B5CF6',
    '地理': '#06B6D4',
    '体育': '#84CC16',
    '音乐': '#EC4899',
    '美术': '#F97316',
    '信息技术': '#3B82F6',
    '信息': '#3B82F6',
    '劳技': '#10B981',
    '劳动技术': '#10B981',
    '科学': '#14B8A6',
    '道法': '#EAB308',
    '道德与法治': '#EAB308',
    '心理健康': '#F472B6',
    '心理': '#F472B6',
    '书法': '#A78BFA',
    '日语': '#6366F1',
    '法语': '#818CF8',
    '德语': '#A5B4FC',
    '西班牙语': '#C084FC',
    '综合': '#64748B',
    '通用技术': '#2DD4BF',
    '选修': '#94A3B8'
  };
  return colors[subjectName] || '#4B3FE3';
}

// ============================================================
// 主题 —— 深色模式改进（自动监听系统主题变化）
// ============================================================

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon();
}

function updateThemeIcon() {
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  updateThemeIcon();

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        updateThemeIcon();
      }
    });
  }
}

// ============================================================
// 骨架屏
// ============================================================

function showSkeleton(container, rows = 3) {
  if (!container) return;
  container.setAttribute('data-skeleton', 'true');
  let html = '';
  for (let i = 0; i < rows; i++) {
    const w = 70 + Math.floor(Math.random() * 30);
    html += `<div class="skeleton-line" style="width:${w}%;height:16px;background:var(--skeleton-bg,linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%));background-size:200% 100%;border-radius:4px;margin-bottom:12px;animation:skeleton-shimmer 1.5s infinite;"></div>`;
  }
  container.innerHTML = html;
}

function hideSkeleton(container) {
  if (!container) return;
  container.removeAttribute('data-skeleton');
  container.innerHTML = '';
}

// ============================================================
// WebSocket —— 指数退避重连 + 心跳
// ============================================================

function connectWebSocket(gradeId, classId, onMessage) {
  const MAX_RETRIES = 10;
  const BASE_DELAY = 1000;
  const MAX_DELAY = 30000;
  const PING_INTERVAL = 25000;
  const PONG_TIMEOUT = 10000;

  let retryCount = 0;
  let pingTimer = null;
  let pongTimer = null;
  let ws = null;
  let intentionalClose = false;

  function clearHeartbeat() {
    clearInterval(pingTimer);
    clearTimeout(pongTimer);
    pingTimer = null;
    pongTimer = null;
  }

  function startHeartbeat() {
    clearHeartbeat();
    pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'ping' })); } catch {}
        pongTimer = setTimeout(() => {
          if (ws) ws.close();
        }, PONG_TIMEOUT);
      }
    }, PING_INTERVAL);
  }

  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}?gradeId=${gradeId || ''}&classId=${classId || ''}`);

    ws.onopen = () => {
      retryCount = 0;
      startHeartbeat();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'pong') {
          clearTimeout(pongTimer);
          return;
        }
        if (onMessage) onMessage(data);
      } catch {}
    };

    ws.onclose = () => {
      clearHeartbeat();
      if (intentionalClose) return;
      if (retryCount >= MAX_RETRIES) return;
      const delay = Math.min(BASE_DELAY * Math.pow(2, retryCount), MAX_DELAY);
      retryCount++;
      setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };

    return ws;
  }

  ws = connect();

  ws._destroy = () => {
    intentionalClose = true;
    clearHeartbeat();
    if (ws) ws.close();
  };

  return ws;
}

// ============================================================
// Header / Navigation
// ============================================================

function initHeader(activeNav) {
  const header = document.getElementById('header');
  if (!header) return;

  const user = API.user;
  const roleName = {
    super_admin: '超级管理员',
    admin: '教务管理员',
    teacher: '教师',
    student: '学生',
    parent: '家长'
  };

  let navHtml = '';
  if (user) {
    if (user.role === 'super_admin' || user.role === 'admin') {
      navHtml = `
        <a href="/admin" class="nav-link ${activeNav === 'admin' ? 'active' : ''}">管理后台</a>
        <a href="/timetable" class="nav-link ${activeNav === 'timetable' ? 'active' : ''}">课程表</a>
        <a href="/stats" class="nav-link ${activeNav === 'stats' ? 'active' : ''}">数据统计</a>
      `;
    }
    if (user.role === 'teacher') {
      navHtml = `
        <a href="/teacher" class="nav-link ${activeNav === 'teacher' ? 'active' : ''}">作业管理</a>
        <a href="/timetable" class="nav-link ${activeNav === 'timetable' ? 'active' : ''}">课程表</a>
      `;
    }
    if (user.role === 'student' || user.role === 'parent') {
      navHtml = `
        <a href="/student" class="nav-link ${activeNav === 'student' ? 'active' : ''}">作业查看</a>
        <a href="/timetable" class="nav-link ${activeNav === 'timetable' ? 'active' : ''}">课程表</a>
      `;
    }
  } else {
    navHtml = `
      <a href="/timetable" class="nav-link ${activeNav === 'timetable' ? 'active' : ''}">课程表</a>
      <a href="/login" class="nav-link">登录</a>
    `;
  }

  header.innerHTML = `
    <div class="container header-content">
      <a href="/" class="logo">
        <div class="logo-icon">📚</div>
        <span>崇川初中作业站</span>
      </a>
      <nav class="header-nav" id="headerNav">
        <a href="/" class="nav-link ${activeNav === 'home' ? 'active' : ''}">首页</a>
        ${navHtml}
      </nav>
      <div class="header-user">
        <button class="btn btn-outline btn-sm" onclick="toggleTheme()" title="切换主题">
          <span id="themeIcon">🌙</span>
        </button>
        ${user ? `
          <div class="flex items-center gap-8">
            <div class="avatar">${escapeHtml(user.realName?.charAt(0) || 'U')}</div>
            <div style="display:none" class="text-sm">
              <div class="font-medium">${escapeHtml(user.realName)}</div>
              <div class="text-muted" style="font-size:12px">${escapeHtml(roleName[user.role] || '')}</div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="logout()">退出</button>
          </div>
        ` : ''}
        <button class="mobile-menu-btn" onclick="document.getElementById('headerNav').classList.toggle('show')">☰</button>
      </div>
    </div>
  `;
}

function logout() {
  API.logout();
  window.location.href = '/login';
}

// ============================================================
// 访问记录
// ============================================================

async function recordVisit(path) {
  try {
    await API.post('/api/stats/visit', { path: path || window.location.pathname });
  } catch (e) {}
}

// ============================================================
// 全局错误处理
// ============================================================

window.addEventListener('error', (event) => {
  console.error('[Global Error]', event.message, event.filename, event.lineno, event.colno, event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Rejection]', event.reason);
});

// ============================================================
// 页面切换过渡 —— 淡入效果
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  const style = document.createElement('style');
  style.textContent = `
    @keyframes skeleton-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .page-fade-in {
      animation: pageFadeIn 0.35s ease-out forwards;
    }
    @keyframes pageFadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);

  const main = document.querySelector('main') || document.querySelector('.main-content') || document.querySelector('.container');
  if (main) {
    main.classList.add('page-fade-in');
  }
});

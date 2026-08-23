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

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showModal(options) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    modal.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">${options.title || '提示'}</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body">
        ${options.content || ''}
      </div>
      ${options.showFooter !== false ? `
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove();window._modalResult=false">取消</button>
          <button class="btn btn-primary" onclick="window._modalResult=true;this.closest('.modal-overlay').remove()">确定</button>
        </div>
      ` : ''}
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    if (options.showFooter === false) {
      resolve();
    } else {
      const checkResult = setInterval(() => {
        if (!document.body.contains(overlay)) {
          clearInterval(checkResult);
          resolve(window._modalResult);
          delete window._modalResult;
        }
      }, 100);
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(false);
      }
    });
  });
}

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

function getSubjectColor(subjectName) {
  const colors = {
    '语文': '#E8463A', '数学': '#4B3FE3', '英语': '#22A5F7',
    '物理': '#1DC981', '化学': '#F87454', '生物': '#27D2BF',
    '政治': '#EFAA17', '历史': '#8B5CF6', '地理': '#06B6D4',
    '体育': '#84CC16', '音乐': '#EC4899', '美术': '#F97316'
  };
  return colors[subjectName] || '#4B3FE3';
}

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
}

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
        <a href="/stats" class="nav-link ${activeNav === 'stats' ? 'active' : ''}">数据统计</a>
      `;
    }
    if (user.role === 'teacher') {
      navHtml = `
        <a href="/teacher" class="nav-link ${activeNav === 'teacher' ? 'active' : ''}">作业管理</a>
      `;
    }
    if (user.role === 'student' || user.role === 'parent') {
      navHtml = `
        <a href="/student" class="nav-link ${activeNav === 'student' ? 'active' : ''}">作业查看</a>
      `;
    }
  } else {
    navHtml = `<a href="/login" class="nav-link">登录</a>`;
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
            <div class="avatar">${user.realName?.charAt(0) || 'U'}</div>
            <div style="display:none" class="text-sm">
              <div class="font-medium">${user.realName}</div>
              <div class="text-muted" style="font-size:12px">${roleName[user.role] || ''}</div>
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

function connectWebSocket(gradeId, classId, onMessage) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}?gradeId=${gradeId || ''}&classId=${classId || ''}`);
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (onMessage) onMessage(data);
  };

  ws.onclose = () => {
    setTimeout(() => connectWebSocket(gradeId, classId, onMessage), 3000);
  };

  return ws;
}

async function recordVisit(path) {
  try {
    await API.post('/api/stats/visit', { path: path || window.location.pathname });
  } catch (e) {}
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
});

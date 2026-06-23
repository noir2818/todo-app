// ==================== GLOBAL ERROR HANDLER ====================
window.onerror = function(msg, url, line, col, err) {
  var dbg = document.getElementById('_debugInfo');
  if (dbg) { dbg.textContent = 'JS错误: ' + msg + ' (行' + line + ')'; dbg.style.display = 'block'; }
  return false;
};
// ==================== AUTH ====================
// ==================== SUPABASE INIT ====================
const SUPABASE_URL = 'https://uyfltgtpttivdgzwfmbw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_VuQomluV0Wdj-iQnOs7kGA_-hZ2J2E8';
let supabaseClient = null;
let supabaseReady = false;
(function initSupabase() {
  var dbg = document.getElementById('_debugInfo');
  if (dbg) { dbg.textContent = 'IIFE started'; }
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      supabaseReady = true;
      if (dbg) dbg.textContent = 'Supabase 已就绪';
      console.log('Supabase 已就绪');
    } catch(e) {
      if (dbg) dbg.textContent = 'Supabase 初始化失败: ' + e.message;
      console.warn('Supabase 初始化失败:', e.message);
    }
  } else {
    if (dbg) dbg.textContent = 'Supabase SDK 未加载，使用离线模式';
    console.warn('Supabase SDK 未加载，将使用离线模式');
  }
  // 无论 Supabase 是否就绪，都继续初始化。延后一拍，确保脚本中的函数和状态已完成定义。
  window.setTimeout(_continueInit, 0);
})();

// ==================== AUTH ====================
let authMode = 'login';
let currentUser = null; // { username, email, id }
const LOCAL_ACCOUNTS_KEY = 'todoapp_local_accounts';
const LOCAL_SESSION_KEY = 'todoapp_local_session';
const USER_PREFS_KEY = 'todoapp_user_prefs';
const CLOUD_SYNC_TABLES = ['tasks', 'memos', 'plans', 'pomodoro'];
const CLOUD_SYNC_POLL_MS = 45000;

function normalizeUsername(username) {
  return username.trim().toLowerCase();
}

function normalizeLoginIdentifier(value) {
  return (value || '').trim().toLowerCase();
}

function isEmailIdentifier(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function deriveUsernameFromEmail(email) {
  const localPart = (email || '').split('@')[0] || 'cloud_user';
  return localPart.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'cloud_user';
}

function getCloudUserFromSession(session) {
  const user = session?.user;
  if (!user) return null;
  return {
    username: user.user_metadata?.username || deriveUsernameFromEmail(user.email || ''),
    email: user.email || '',
    id: user.id,
    role: 'cloud'
  };
}

function getUserDisplayName(user) {
  return user?.username || user?.email || '用户';
}

function getLocalAccounts() {
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch(e) {
    return {};
  }
}

function saveLocalAccounts(accounts) {
  try { localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts)); } catch(e) {}
}

function saveLocalSession(username) {
  try { localStorage.setItem(LOCAL_SESSION_KEY, username); } catch(e) {}
}

function clearLocalSession() {
  try { localStorage.removeItem(LOCAL_SESSION_KEY); } catch(e) {}
}

function restoreLocalSession() {
  try {
    const username = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!username) return null;
    const account = getLocalAccounts()[username];
    return account ? { id: account.id, username: account.username || username, role: 'local' } : null;
  } catch(e) {
    return null;
  }
}

function getUserPrefs() {
  try {
    const raw = localStorage.getItem(USER_PREFS_KEY);
    const prefs = raw ? JSON.parse(raw) : {};
    return prefs && typeof prefs === 'object' && !Array.isArray(prefs) ? prefs : {};
  } catch(e) {
    return {};
  }
}

function saveUserPrefs(prefs) {
  try { localStorage.setItem(USER_PREFS_KEY, JSON.stringify(prefs)); } catch(e) {}
}

function getCurrentUserPrefs() {
  const key = currentUser?.id || 'guest';
  const allPrefs = getUserPrefs();
  const savedPrefs = allPrefs[key] && typeof allPrefs[key] === 'object' ? allPrefs[key] : {};
  return {
    defaultModule: 'today',
    compactMode: false,
    notifications: (typeof Notification !== 'undefined' && Notification.permission === 'granted'),
    weekStart: 'monday',
    ...savedPrefs
  };
}

function saveCurrentUserPrefs(prefs) {
  const key = currentUser?.id || 'guest';
  const allPrefs = getUserPrefs();
  allPrefs[key] = { ...getCurrentUserPrefs(), ...prefs };
  saveUserPrefs(allPrefs);
  applyUserPreferences();
}

function getPreferredModule() {
  const allowedModules = new Set(['today', 'tasks', 'pomodoro', 'memos', 'plans', 'settings']);
  const preferred = getCurrentUserPrefs().defaultModule || 'today';
  return allowedModules.has(preferred) ? preferred : 'today';
}

function applyUserPreferences() {
  const prefs = getCurrentUserPrefs();
  if (document.body) document.body.classList.toggle('compact-mode', !!prefs.compactMode);
}

async function hashPassword(password) {
  if (window.crypto?.subtle && window.TextEncoder) {
    const bytes = new TextEncoder().encode(password);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return 'plain:' + btoa(unescape(encodeURIComponent(password)));
}

function toggleLoginMode() {
  if (authMode === 'login') {
    authMode = 'register';
    document.getElementById('loginSubmitBtn').textContent = '注 册';
    document.getElementById('loginSwitchText').textContent = '已有账号？';
    document.getElementById('loginSwitchLink').textContent = '立即登录';
    document.getElementById('confirmPasswordGroup').style.display = 'block';
  } else {
    authMode = 'login';
    document.getElementById('loginSubmitBtn').textContent = '登 录';
    document.getElementById('loginSwitchText').textContent = '还没有账号？';
    document.getElementById('loginSwitchLink').textContent = '立即注册';
    document.getElementById('confirmPasswordGroup').style.display = 'none';
  }
  document.getElementById('loginError').style.display = 'none';
}

function isLoggedInUser() {
  return !!(currentUser && currentUser.id && currentUser.role !== 'guest');
}

function isCloudUser() {
  return !!(currentUser && currentUser.id && currentUser.role === 'cloud');
}

function showAppShell() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';
  applyUserPreferences();
}

function resetLoginForm() {
  const usernameEl = document.getElementById('loginUsername');
  const passwordEl = document.getElementById('loginPassword');
  const confirmEl = document.getElementById('loginConfirmPassword');
  const errorEl = document.getElementById('loginError');
  if (usernameEl) usernameEl.value = '';
  if (passwordEl) passwordEl.value = '';
  if (confirmEl) confirmEl.value = '';
  if (errorEl) errorEl.style.display = 'none';
  if (authMode === 'register') toggleLoginMode();
}

function showLoginOverlay() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.style.display = 'flex';
  const usernameEl = document.getElementById('loginUsername');
  if (usernameEl) setTimeout(() => usernameEl.focus(), 0);
}

function closeLoginOverlay() {
  showAppShell();
}

async function enterLocalMode(module = 'today') {
  teardownCloudSync();
  currentUser = null;
  clearLocalSession();
  showAppShell();
  updateSidebarForLocal();
  await loadUserData();
  updateBadges();
  switchModule(module);
}

async function handleCloudAuth(email, password, errorEl) {
  if (!supabaseReady || !supabaseClient?.auth) {
    errorEl.textContent = '云端账号需要网络连接，请稍后重试或使用本地用户名登录';
    errorEl.style.display = 'block';
    return;
  }
  if (!isEmailIdentifier(email)) {
    errorEl.textContent = '请输入有效邮箱，或输入本地用户名使用离线账号';
    errorEl.style.display = 'block';
    return;
  }

  if (authMode === 'register') {
    const confirmPassword = document.getElementById('loginConfirmPassword').value;
    if (password !== confirmPassword) {
      errorEl.textContent = '两次输入的密码不一致';
      errorEl.style.display = 'block';
      return;
    }
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { username: deriveUsernameFromEmail(email) },
        emailRedirectTo: window.location.href
      }
    });
    if (error) throw error;
    if (data?.session) {
      currentUser = getCloudUserFromSession(data.session);
      clearLocalSession();
      enterApp();
      return;
    }
    if (authMode === 'register') toggleLoginMode();
    errorEl.textContent = '注册成功，请前往邮箱确认后再登录';
    errorEl.style.display = 'block';
    return;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data?.session) throw new Error('登录成功但没有拿到云端会话，请稍后重试');
  currentUser = getCloudUserFromSession(data.session);
  clearLocalSession();
  enterApp();
}

async function handleLogin() {
  var dbg = document.getElementById('_debugInfo');
  const loginId = normalizeLoginIdentifier(document.getElementById('loginUsername').value);
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  const usernamePattern = /^[a-z0-9_]{3,20}$/;
  errorEl.textContent = '';
  errorEl.style.display = 'none';

  if (!loginId) {
    errorEl.textContent = '请输入邮箱或本地用户名';
    errorEl.style.display = 'block'; return;
  }
  if (!password || password.length < 6) {
    errorEl.textContent = '密码不能为空，且至少6个字符';
    errorEl.style.display = 'block'; return;
  }

  if (loginId.includes('@')) {
    try {
      await handleCloudAuth(loginId, password, errorEl);
    } catch (err) {
      errorEl.textContent = authMode === 'register' ? '云端注册失败：' + err.message : '云端登录失败：' + err.message;
      errorEl.style.display = 'block';
    }
    return;
  }

  const username = normalizeUsername(loginId);
  if (!usernamePattern.test(username)) {
    errorEl.textContent = '本地用户名需为3-20位字母、数字或下划线';
    errorEl.style.display = 'block'; return;
  }

  try {
    const accounts = getLocalAccounts();
    if (authMode === 'register') {
      const confirmPassword = document.getElementById('loginConfirmPassword').value;
      if (password !== confirmPassword) {
        errorEl.textContent = '两次输入的密码不一致';
        errorEl.style.display = 'block'; return;
      }
      if (accounts[username]) {
        errorEl.textContent = '该用户名已被注册，请换一个用户名或直接登录';
        errorEl.style.display = 'block';
        return;
      }
      const account = {
        id: 'local_' + username,
        username,
        passwordHash: await hashPassword(password),
        createdAt: new Date().toISOString()
      };
      accounts[username] = account;
      saveLocalAccounts(accounts);
      currentUser = { id: account.id, username, role: 'local' };
      saveLocalSession(username);
      enterApp();
    } else {
      const account = accounts[username];
      if (!account || account.passwordHash !== await hashPassword(password)) {
        errorEl.textContent = '用户名或密码错误';
        errorEl.style.display = 'block';
        return;
      }
      currentUser = { id: account.id, username: account.username || username, role: 'local' };
      saveLocalSession(username);
      enterApp();
    }
  } catch (err) {
    errorEl.textContent = authMode === 'register' ? '注册失败：' + err.message : '登录失败：' + err.message;
    errorEl.style.display = 'block';
  }
}

function enterApp() {
  showAppShell();
  updateSidebarForUser();
  if (isCloudUser()) setupCloudSync();
  else teardownCloudSync();
  loadUserData().then(() => {
    updateBadges();
    switchModule(getPreferredModule());
  });
}

async function handleLogout() {
  teardownCloudSync();
  if (isCloudUser() && supabaseReady) { try { await supabaseClient.auth.signOut(); } catch(e) {} }
  clearLocalSession();
  resetLoginForm();
  enterLocalMode('today');
}

// ==================== GUEST MODE ====================
function getGuestWorkspace() {
  if (!currentUser || currentUser.role !== 'guest') return null;
  try {
    const raw = localStorage.getItem('guest_workspace_' + currentUser.id);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

function saveGuestWorkspace() {
  if (!currentUser || currentUser.role !== 'guest') return;
  const ws = {
    tasks: STORE.tasks, memos: STORE.memos, plans: STORE.plans,
    pomodoro: STORE.pomodoro,
  };
  try { localStorage.setItem('guest_workspace_' + currentUser.id, JSON.stringify(ws)); } catch(e) {}
}

function enterAsGuest() {
  enterLocalMode('today');
}

function updateSidebarForGuest() {
  updateSidebarForLocal();
}

function updateSidebarForLocal() {
  document.getElementById('sidebarUser').textContent = '未登录';
  document.getElementById('sidebarAvatar').textContent = '访';
  const btn = document.getElementById('sidebarLogoutBtn');
  btn.textContent = '登录/注册';
  btn.className = 'guest-login-btn';
  btn.onclick = showLoginOverlay;
}

function updateSidebarForUser() {
  if (!isLoggedInUser()) return;
  const displayName = getUserDisplayName(currentUser);
  document.getElementById('sidebarUser').textContent = displayName;
  document.getElementById('sidebarAvatar').textContent = displayName.charAt(0).toUpperCase();
  const btn = document.getElementById('sidebarLogoutBtn');
  btn.textContent = '退出';
  btn.className = 'logout-btn';
  btn.onclick = handleLogout;
}

async function updateCurrentUsername(newUsername) {
  const username = normalizeUsername(newUsername);
  if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new Error('用户名需为3-20位字母、数字或下划线');
  if (!isLoggedInUser()) throw new Error('请先登录');
  if (currentUser.role === 'cloud') {
    if (supabaseReady && supabaseClient?.auth?.updateUser) {
      await supabaseClient.auth.updateUser({ data: { username } });
    }
    currentUser.username = username;
    updateSidebarForUser();
    return;
  }
  if (currentUser.role !== 'local') throw new Error('当前账号暂不支持修改用户名');
  const accounts = getLocalAccounts();
  const oldUsername = normalizeUsername(currentUser.username || '');
  if (username !== oldUsername && accounts[username]) throw new Error('该用户名已被使用');
  const entry = Object.entries(accounts).find(([key, account]) => key === oldUsername || account.id === currentUser.id);
  if (!entry) throw new Error('未找到当前账号');
  const [oldKey, account] = entry;
  if (!account) throw new Error('未找到当前账号');
  const stableId = account.id || currentUser.id || ('local_' + username);
  delete accounts[oldKey];
  accounts[username] = { ...account, username, id: stableId, updatedAt: new Date().toISOString() };
  saveLocalAccounts(accounts);
  currentUser = { id: stableId, username, role: 'local' };
  saveLocalSession(username);
  updateSidebarForUser();
}

async function updateCurrentPassword(currentPassword, newPassword) {
  if (!isLoggedInUser()) throw new Error('请先登录');
  if (currentUser.role !== 'local') throw new Error('当前账号暂不支持在本地修改密码');
  if (!newPassword || newPassword.length < 6) throw new Error('新密码至少6个字符');
  const accounts = getLocalAccounts();
  const account = accounts[currentUser.username];
  if (!account || account.passwordHash !== await hashPassword(currentPassword)) throw new Error('当前密码不正确');
  account.passwordHash = await hashPassword(newPassword);
  account.updatedAt = new Date().toISOString();
  saveLocalAccounts(accounts);
}

function getWorkspaceSnapshot() {
  return {
    exportedAt: new Date().toISOString(),
    user: currentUser ? { id: currentUser.id, username: currentUser.username || '', role: currentUser.role || 'guest' } : null,
    tasks: STORE.tasks,
    memos: STORE.memos,
    plans: STORE.plans,
    pomodoro: STORE.pomodoro,
    preferences: getCurrentUserPrefs()
  };
}

function exportWorkspaceData() {
  const data = JSON.stringify(getWorkspaceSnapshot(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'todoapp-data-' + getTodayDateStr() + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function clearWorkspaceData() {
  if (!confirm('确定清空当前工作台数据吗？任务、备忘录、计划和番茄钟记录都会被删除。')) return;
  const shouldClearCloud = isCloudUser();
  STORE.tasks = [];
  STORE.memos = [];
  STORE.plans = [];
  STORE.pomodoro = { workMinutes: 25, breakMinutes: 5, todayCount: 0, todayDate: '' };
  saveStore();
  if (shouldClearCloud) await clearCloudWorkspace();
  updateBadges();
  renderSettings();
}

function handleGuestLogout() {
  showLoginOverlay();
}

// ==================== DATA STORE (Supabase + localStorage cache) ====================
const STORE = {
  tasks: [],
  memos: [],
  plans: [],
  pomodoro: { workMinutes: 25, breakMinutes: 5, todayCount: 0, todayDate: '' },
};

// localStorage cache key (per user)
function getCacheKey(table) { return 'todo_' + (currentUser ? currentUser.id : 'guest') + '_' + table; }

function saveLocalCache(table, data) {
  try { localStorage.setItem(getCacheKey(table), JSON.stringify(data)); } catch(e) {}
}
function loadLocalCache(table) {
  try { const raw = localStorage.getItem(getCacheKey(table)); return raw ? JSON.parse(raw) : null; } catch(e) { return null; }
}

function loadStore() {
  STORE.tasks = loadLocalCache('tasks') || [];
  STORE.memos = loadLocalCache('memos') || [];
  STORE.plans = loadLocalCache('plans') || [];
  STORE.pomodoro = loadLocalCache('pomodoro') || { workMinutes: 25, breakMinutes: 5, todayCount: 0, todayDate: '' };
}

async function loadUserData() {
  if (!isLoggedInUser()) {
    loadStore();
    return;
  }

  if (currentUser.role === 'local') {
    loadStore();
    return;
  }

  // Guest mode: load from guest workspace only
  if (currentUser.role === 'guest') {
    const ws = getGuestWorkspace();
    if (ws) {
      STORE.tasks = ws.tasks || [];
      STORE.memos = ws.memos || [];
      STORE.plans = ws.plans || [];
      STORE.pomodoro = ws.pomodoro || { workMinutes: 25, breakMinutes: 5, todayCount: 0, todayDate: '' };
    }
    return;
  }

  try {
    // Load from Supabase in parallel (only if ready)
    if (!supabaseReady) {
      loadStore();
      return;
    }
    const [tasksRes, memosRes, plansRes, pomoRes] = await Promise.all([
      supabaseClient.from('tasks').select('*').eq('user_id', currentUser.id),
      supabaseClient.from('memos').select('*').eq('user_id', currentUser.id),
      supabaseClient.from('plans').select('*').eq('user_id', currentUser.id),
      supabaseClient.from('pomodoro').select('*').eq('user_id', currentUser.id).eq('date', getTodayDateStr()).maybeSingle(),
    ]);

    if (tasksRes.data) {
      STORE.tasks = tasksRes.data.map(r => ({ ...r, dueDate: r.due_date || '', tags: r.tags || [], relatedTasks: r.related_tasks || [], attachments: r.attachments || [], remark: r.remark || '' }));
      saveLocalCache('tasks', STORE.tasks);
    } else { STORE.tasks = loadLocalCache('tasks') || []; }

    if (memosRes.data) {
      STORE.memos = memosRes.data.map(r => ({ ...r, createdAt: r.created_at, updatedAt: r.updated_at }));
      saveLocalCache('memos', STORE.memos);
    } else { STORE.memos = loadLocalCache('memos') || []; }

    if (plansRes.data) {
      STORE.plans = plansRes.data.map(r => ({ id: r.id, name: r.plan_name, createdAt: r.created_at, tasks: r.tasks_json || [], totalDays: r.total_days || 0 }));
      saveLocalCache('plans', STORE.plans);
    } else { STORE.plans = loadLocalCache('plans') || []; }

    if (pomoRes.data) {
      STORE.pomodoro = { workMinutes: pomoRes.data.work_minutes || 25, breakMinutes: pomoRes.data.break_minutes || 5, todayCount: pomoRes.data.today_count || 0, todayDate: pomoRes.data.date || '' };
      saveLocalCache('pomodoro', STORE.pomodoro);
    } else { STORE.pomodoro = loadLocalCache('pomodoro') || { workMinutes: 25, breakMinutes: 5, todayCount: 0, todayDate: '' }; }
  } catch (e) {
    // Fallback to localStorage cache
    STORE.tasks = loadLocalCache('tasks') || [];
    STORE.memos = loadLocalCache('memos') || [];
    STORE.plans = loadLocalCache('plans') || [];
    STORE.pomodoro = loadLocalCache('pomodoro') || { workMinutes: 25, breakMinutes: 5, todayCount: 0, todayDate: '' };
  }
}

function saveStore() {
  // Guest mode: save to guest workspace localStorage only
  if (currentUser && currentUser.role === 'guest') {
    saveGuestWorkspace();
    return;
  }
  // Write to localStorage cache (fire-and-forget Supabase sync via dedicated helpers)
  saveLocalCache('tasks', STORE.tasks);
  saveLocalCache('memos', STORE.memos);
  saveLocalCache('plans', STORE.plans);
  saveLocalCache('pomodoro', STORE.pomodoro);
}

// ==================== SUPABASE SYNC HELPERS ====================
async function syncTaskToCloud(task) {
  if (!isCloudUser() || !supabaseReady) return;
  try {
    await supabaseClient.from('tasks').upsert({
      id: task.id, user_id: currentUser.id, name: task.name, type: task.type,
      priority: task.priority, status: task.status, due_date: task.dueDate || null,
      remark: task.remark || '', created_at: task.createdAt, done_at: task.status === 'done' ? new Date().toISOString() : null,
      tags: task.tags || [], related_tasks: task.relatedTasks || [], attachments: task.attachments || []
    }, { onConflict: 'id' });
  } catch(e) { console.warn('syncTaskToCloud failed:', e); }
}

async function deleteTaskFromCloud(id) {
  if (!isCloudUser() || !supabaseReady) return;
  try { await supabaseClient.from('tasks').delete().eq('id', id).eq('user_id', currentUser.id); } catch(e) { console.warn('deleteTaskFromCloud failed:', e); }
}

async function syncMemoToCloud(memo) {
  if (!isCloudUser() || !supabaseReady) return;
  try {
    await supabaseClient.from('memos').upsert({
      id: memo.id, user_id: currentUser.id, title: memo.title, content: memo.content || '',
      tags: memo.tags || [], created_at: memo.createdAt, updated_at: memo.updatedAt || new Date().toISOString()
    }, { onConflict: 'id' });
  } catch(e) { console.warn('syncMemoToCloud failed:', e); }
}

async function deleteMemoFromCloud(id) {
  if (!isCloudUser() || !supabaseReady) return;
  try { await supabaseClient.from('memos').delete().eq('id', id).eq('user_id', currentUser.id); } catch(e) { console.warn('deleteMemoFromCloud failed:', e); }
}

async function syncPlanToCloud(plan) {
  if (!isCloudUser() || !supabaseReady) return;
  try {
    await supabaseClient.from('plans').upsert({
      id: plan.id, user_id: currentUser.id, plan_name: plan.name,
      tasks_json: plan.tasks || [], created_at: plan.createdAt, total_days: plan.totalDays || 0
    }, { onConflict: 'id' });
  } catch(e) { console.warn('syncPlanToCloud failed:', e); }
}

async function deletePlanFromCloud(id) {
  if (!isCloudUser() || !supabaseReady) return;
  try { await supabaseClient.from('plans').delete().eq('id', id).eq('user_id', currentUser.id); } catch(e) { console.warn('deletePlanFromCloud failed:', e); }
}

async function syncPomodoroToCloud() {
  if (!isCloudUser() || !supabaseReady) return;
  try {
    await supabaseClient.from('pomodoro').upsert({
      user_id: currentUser.id, today_count: STORE.pomodoro.todayCount,
      work_minutes: STORE.pomodoro.workMinutes, break_minutes: STORE.pomodoro.breakMinutes,
      date: getTodayDateStr()
    }, { onConflict: 'user_id,date' });
  } catch(e) { console.warn('syncPomodoroToCloud failed:', e); }
}

async function clearCloudWorkspace() {
  if (!isCloudUser() || !supabaseReady) return;
  try {
    await Promise.all([
      supabaseClient.from('tasks').delete().eq('user_id', currentUser.id),
      supabaseClient.from('memos').delete().eq('user_id', currentUser.id),
      supabaseClient.from('plans').delete().eq('user_id', currentUser.id),
      supabaseClient.from('pomodoro').delete().eq('user_id', currentUser.id)
    ]);
  } catch(e) {
    console.warn('clearCloudWorkspace failed:', e);
  }
}

let cloudSyncChannel = null;
let cloudSyncTimer = null;
let cloudRefreshTimer = null;
let cloudRefreshInFlight = false;

function handleCloudSyncFocus() {
  scheduleCloudRefresh(0);
}

function handleCloudSyncVisibility() {
  if (!document.hidden) scheduleCloudRefresh(0);
}

function teardownCloudSync() {
  if (cloudSyncChannel && supabaseClient) {
    try {
      if (supabaseClient.removeChannel) supabaseClient.removeChannel(cloudSyncChannel);
      else if (cloudSyncChannel.unsubscribe) cloudSyncChannel.unsubscribe();
    } catch(e) {
      console.warn('teardownCloudSync failed:', e);
    }
  }
  cloudSyncChannel = null;
  if (cloudSyncTimer) window.clearInterval(cloudSyncTimer);
  if (cloudRefreshTimer) window.clearTimeout(cloudRefreshTimer);
  cloudSyncTimer = null;
  cloudRefreshTimer = null;
  window.removeEventListener('focus', handleCloudSyncFocus);
  document.removeEventListener('visibilitychange', handleCloudSyncVisibility);
}

function setupCloudSync() {
  teardownCloudSync();
  if (!isCloudUser() || !supabaseReady || !supabaseClient?.channel) return;

  cloudSyncChannel = supabaseClient.channel('todo-workspace-' + currentUser.id);
  CLOUD_SYNC_TABLES.forEach(table => {
    cloudSyncChannel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: 'user_id=eq.' + currentUser.id },
      () => scheduleCloudRefresh()
    );
  });
  cloudSyncChannel.subscribe();

  cloudSyncTimer = window.setInterval(() => {
    if (!document.hidden) scheduleCloudRefresh(0);
  }, CLOUD_SYNC_POLL_MS);
  window.addEventListener('focus', handleCloudSyncFocus);
  document.addEventListener('visibilitychange', handleCloudSyncVisibility);
}

function scheduleCloudRefresh(delay = 700) {
  if (!isCloudUser()) return;
  if (cloudRefreshTimer) window.clearTimeout(cloudRefreshTimer);
  cloudRefreshTimer = window.setTimeout(refreshCloudWorkspace, delay);
}

async function refreshCloudWorkspace() {
  if (!isCloudUser() || cloudRefreshInFlight) return;
  cloudRefreshInFlight = true;
  try {
    await loadUserData();
    updateBadges();
    if (document.getElementById('contentArea')) switchModule(currentModule || getPreferredModule());
  } catch(e) {
    console.warn('refreshCloudWorkspace failed:', e);
  } finally {
    cloudRefreshInFlight = false;
  }
}

function genId() { return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }
function toDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function startOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function getDateAfterDays(dayOffset) {
  const d = startOfLocalDay(new Date());
  d.setDate(d.getDate() + dayOffset);
  return d;
}
function fmtDate(d) { if (!d) return '-'; const dt = new Date(d); return dt.toLocaleDateString('zh-CN'); }
function fmtDateTime(d) { if (!d) return '-'; const dt = new Date(d); return dt.toLocaleString('zh-CN'); }

loadStore();

// ==================== STATE ====================
let currentModule = 'tasks';
let taskFilter = { status: 'all', priority: 'all' };
let taskSort = { field: 'createdAt', order: 'desc' };
let taskSortFields = ['status', 'createdAt', 'dueDate'];
let editingTaskId = null;
let editingMemoId = null;

// ==================== RENDER ====================
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function updateBadges() {
  const taskBadge = $('#taskBadge');
  const memoBadge = $('#memoBadge');
  const todayBadge = $('#todayBadge');
  if (taskBadge) taskBadge.textContent = STORE.tasks.length;
  if (memoBadge) memoBadge.textContent = STORE.memos.length;
  if (todayBadge) todayBadge.textContent = getTodayTasks().length;
}

function switchModule(module) {
  const titles = { today: '☀️ 今日任务', tasks: '📝 任务管理', memos: '📌 备忘录', pomodoro: '⏱ 番茄钟', ai: '🤖 AI助手', plans: '📋 计划管理', settings: '⚙️ 个人设置' };
  const btnLabels = { today: '', tasks: '+ 新增任务', memos: '+ 新增备忘录', pomodoro: '', ai: '', plans: '', settings: '' };
  let navItem = $(`.nav-item[data-module="${module}"]`);
  if (!titles[module] || !navItem) {
    module = 'today';
    navItem = $(`.nav-item[data-module="${module}"]`);
  }

  currentModule = module;
  $$('.nav-item').forEach(el => el.classList.remove('active'));
  if (navItem) navItem.classList.add('active');
  editingTaskId = null;
  editingMemoId = null;

  $('#moduleTitle').textContent = titles[module];
  const addBtn = $('#headerAddBtn');
  addBtn.textContent = btnLabels[module];
  addBtn.style.display = (module === 'pomodoro' || module === 'today' || module === 'settings') ? 'none' : 'flex';
  addBtn.onclick = () => {
    if (module === 'tasks') openTaskModal();
    else if (module === 'memos') openMemoModal();
  };

  if (module === 'today') renderToday();
  else if (module === 'tasks') renderTasks();
  else if (module === 'memos') renderMemos();
  else if (module === 'pomodoro') renderPomodoro();
  else if (module === 'ai') renderAi();
  else if (module === 'plans') renderPlans();
  else if (module === 'settings') renderSettings();
}

// ==================== TASK MANAGEMENT ====================
function renderTasks() {
  const filtered = filterTasks();
  const sorted = sortTasks(filtered);

  let html = '';
  // Filter bar
  html += `<div class="filter-bar">
    <button class="filter-btn ${taskFilter.status === 'all' ? 'active' : ''}" data-filter="status" data-val="all">全部</button>
    <button class="filter-btn ${taskFilter.status === 'active' ? 'active' : ''}" data-filter="status" data-val="active">未完成</button>
    <button class="filter-btn ${taskFilter.status === 'done' ? 'active' : ''}" data-filter="status" data-val="done">已完成</button>
    <button class="filter-btn ${taskFilter.status === 'expiring' ? 'active' : ''}" data-filter="status" data-val="expiring">过期3天内</button>
    <select class="filter-select" id="priorityFilter" data-filter="priority">
      <option value="all" ${taskFilter.priority === 'all' ? 'selected' : ''}>全部优先级</option>
      <option value="P0">P0 红色</option>
      <option value="P1">P1 橙色</option>
      <option value="P2">P2 蓝色</option>
      <option value="P3">P3 灰色</option>
    </select>
    <span class="sort-label">排序：</span>`;

  taskSortFields.forEach(f => {
    const labels = { status: '状态', createdAt: '创建时间', dueDate: '截止日期' };
    const active = taskSort.field === f;
    const arrow = active ? (taskSort.order === 'asc' ? '▲' : '▼') : '';
    html += `<button class="sort-btn ${active ? 'active' : ''}" data-sort="${f}">${labels[f]} ${arrow}</button>`;
  });

  html += `</div>`;

  // Table
  html += `<table class="task-table"><thead><tr>
    <th style="width:36px"><input type="checkbox" id="selectAllTasks" onchange="toggleSelectAllTasks()" title="全选"></th>
    <th style="width:44px">#</th><th>任务名</th><th style="width:100px">截止日期</th>
    <th style="width:90px" class="sort-th" data-sort="status">状态 <span class="sort-arrow">${taskSort.field === 'status' ? (taskSort.order === 'asc' ? '▲' : '▼') : ''}</span></th>
    <th style="width:80px">优先级</th><th>备注</th><th style="width:90px">操作</th>
  </tr></thead><tbody>`;

  if (sorted.length === 0) {
    html += `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-secondary);">暂无任务，点击右上角"+ 新增任务"开始</td></tr>`;
  } else {
    sorted.forEach((t, i) => {
      const typeIcon = t.type === 'timed' ? '📅' : t.type === 'recurring' ? '🔁' : '📝';
      const statusClass = t.status === 'urgent' ? 'status-urgent' : t.status === 'important' ? 'status-important' : 'status-done';
      const statusLabel = t.status === 'urgent' ? '🔴紧急' : t.status === 'important' ? '🟠重要' : '🟢已完成';
      html += `<tr class="${t.status === 'done' ? 'status-done' : ''}" data-id="${t.id}">
        <td onclick="event.stopPropagation()"><input type="checkbox" class="task-checkbox" data-id="${t.id}" onchange="updateBatchBar()"></td>
        <td>${i + 1}</td>
        <td onclick="openTaskDetail('${t.id}')" style="cursor:pointer">${typeIcon} ${escHtml(t.name)}</td>
        <td>${fmtDate(t.dueDate)}</td>
        <td><span class="status-dot ${statusClass}">${statusLabel}</span></td>
        <td><span class="priority-dot ${t.priority.toLowerCase()}">${t.priority}</span></td>
        <td>${escHtml(t.remark || '-')}</td>
        <td onclick="event.stopPropagation()">
          <button class="action-btn edit" onclick="openTaskModal('${t.id}')">编辑</button>
          <button class="action-btn del" onclick="deleteTask('${t.id}')">删除</button>
        </td>
      </tr>`;
    });
  }

  html += `</tbody></table>
  <div class="batch-bar" id="batchBar" style="display:none">
    <span class="batch-count" id="batchCount">已选 0 项</span>
    <button class="batch-btn" onclick="batchMarkDone()">完成</button>
    <button class="batch-btn del" onclick="batchDeleteTasks()">删除</button>
    <select class="batch-priority" id="batchPriority" onchange="batchChangePriority()">
      <option value="">设置优先级</option>
      <option value="P0">P0</option>
      <option value="P1">P1</option>
      <option value="P2">P2</option>
      <option value="P3">P3</option>
    </select>
  </div>`;
  $('#contentArea').innerHTML = html;
  bindTaskEvents();
}

function escHtml(s) { if (!s) return ''; return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function filterTasks() {
  const now = new Date();
  const threeDaysLater = new Date(now.getTime() + 3 * 86400000);
  return STORE.tasks.filter(t => {
    if (taskFilter.status === 'active' && t.status === 'done') return false;
    if (taskFilter.status === 'done' && t.status !== 'done') return false;
    if (taskFilter.status === 'expiring') {
      if (t.status === 'done') return false;
      if (!t.dueDate) return false;
      const due = new Date(t.dueDate);
      if (due < now) return true; // overdue
      if (due <= threeDaysLater) return true; // within 3 days
      return false;
    }
    if (taskFilter.priority !== 'all' && t.priority !== taskFilter.priority) return false;
    return true;
  });
}

function sortTasks(tasks) {
  const f = taskSort.field, o = taskSort.order;
  return [...tasks].sort((a, b) => {
    let va, vb;
    if (f === 'status') { va = a.status; vb = b.status; }
    else if (f === 'createdAt') { va = a.createdAt || ''; vb = b.createdAt || ''; }
    else if (f === 'dueDate') { va = a.dueDate || '9999'; vb = b.dueDate || '9999'; }
    if (va < vb) return o === 'asc' ? -1 : 1;
    if (va > vb) return o === 'asc' ? 1 : -1;
    return 0;
  });
}

function bindTaskEvents() {
  $$('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = btn.dataset.filter, v = btn.dataset.val;
      if (f === 'status') taskFilter.status = v;
      else if (f === 'priority') taskFilter.priority = v;
      renderTasks();
    });
  });
  const pf = $('#priorityFilter');
  if (pf) pf.addEventListener('change', () => { taskFilter.priority = pf.value; renderTasks(); });
  $$('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = btn.dataset.sort;
      if (taskSort.field === f) taskSort.order = taskSort.order === 'asc' ? 'desc' : 'asc';
      else { taskSort.field = f; taskSort.order = 'asc'; }
      renderTasks();
    });
  });
}

function openTaskModal(id) {
  editingTaskId = id || null;
  const task = id ? STORE.tasks.find(t => t.id === id) : null;
  const title = task ? '编辑任务' : '新增任务';

  const html = `
    <div class="modal-overlay" id="taskModalOverlay">
      <div class="modal">
        <div class="modal-header">
          <h2>${title}</h2>
          <button class="modal-close" onclick="closeModal('taskModalOverlay')">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>任务名 *</label>
            <input type="text" id="taskName" value="${task ? escHtml(task.name) : ''}" placeholder="请输入任务名称">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>类型</label>
              <select id="taskType">
                <option value="normal" ${task && task.type === 'normal' ? 'selected' : ''}>📝 普通任务</option>
                <option value="timed" ${task && task.type === 'timed' ? 'selected' : ''}>📅 定时任务</option>
                <option value="recurring" ${task && task.type === 'recurring' ? 'selected' : ''}>🔁 循环任务</option>
              </select>
            </div>
            <div class="form-group">
              <label>状态</label>
              <select id="taskStatus">
                <option value="urgent" ${task && task.status === 'urgent' ? 'selected' : ''}>🔴 紧急</option>
                <option value="important" ${task && !task ? 'selected' : ''} ${task && task.status === 'important' ? 'selected' : ''}>🟠 重要</option>
                <option value="done" ${task && task.status === 'done' ? 'selected' : ''}>🟢 已完成</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>截止日期</label>
              <input type="date" id="taskDueDate" value="${task && task.dueDate ? task.dueDate : ''}">
            </div>
            <div class="form-group">
              <label>优先级</label>
              <select id="taskPriority">
                <option value="P0" ${task && task.priority === 'P0' ? 'selected' : ''}>P0 最高</option>
                <option value="P1" ${task && task.priority === 'P1' ? 'selected' : ''}>P1 高</option>
                <option value="P2" ${task && !task ? 'selected' : ''} ${task && task.priority === 'P2' ? 'selected' : ''}>P2 中</option>
                <option value="P3" ${task && task.priority === 'P3' ? 'selected' : ''}>P3 低</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>备注</label>
            <textarea id="taskRemark" placeholder="可选备注">${task ? escHtml(task.remark || '') : ''}</textarea>
          </div>
          <div class="form-group">
            <label>标签（用逗号分隔）</label>
            <input type="text" id="taskTags" value="${task && task.tags ? task.tags.join(',') : ''}" placeholder="如：工作,项目A">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('taskModalOverlay')">取消</button>
          <button class="btn btn-primary" onclick="saveTask()">保存</button>
        </div>
      </div>
    </div>`;
  $('#modalContainer').innerHTML = html;
  $('#taskModalOverlay').addEventListener('click', function(e) { if (e.target === this) closeModal('taskModalOverlay'); });
}

function saveTask() {
  const name = $('#taskName').value.trim();
  if (!name) return alert('请输入任务名称');
  const taskData = {
    name,
    type: $('#taskType').value,
    status: $('#taskStatus').value,
    dueDate: $('#taskDueDate').value,
    priority: $('#taskPriority').value,
    remark: $('#taskRemark').value.trim(),
    tags: $('#taskTags').value.split(',').map(s => s.trim()).filter(Boolean),
  };

  if (editingTaskId) {
    const idx = STORE.tasks.findIndex(t => t.id === editingTaskId);
    if (idx >= 0) { STORE.tasks[idx] = { ...STORE.tasks[idx], ...taskData }; }
  } else {
    STORE.tasks.push({ id: genId(), ...taskData, createdAt: new Date().toISOString(), relatedTasks: [], attachments: [] });
  }
  saveStore();
  // Sync to Supabase
  const savedTask = editingTaskId ? STORE.tasks.find(t => t.id === editingTaskId) : STORE.tasks[STORE.tasks.length - 1];
  if (savedTask) syncTaskToCloud(savedTask);
  closeModal('taskModalOverlay');
  renderTasks();
  updateBadges();
}

function deleteTask(id) {
  if (!confirm('确定删除此任务吗？')) return;
  STORE.tasks = STORE.tasks.filter(t => t.id !== id);
  saveStore();
  deleteTaskFromCloud(id);
  renderTasks();
  updateBadges();
}

function openTaskDetail(id) {
  const task = STORE.tasks.find(t => t.id === id);
  if (!task) return;

  const typeIcon = task.type === 'timed' ? '📅' : task.type === 'recurring' ? '🔁' : '📝';
  const statusLabel = task.status === 'urgent' ? '🔴紧急' : task.status === 'important' ? '🟠重要' : '🟢已完成';
  const relatedTasks = (task.relatedTasks || []).map(rid => {
    const rt = STORE.tasks.find(t => t.id === rid);
    return rt ? `${typeIcon} ${escHtml(rt.name)}` : rid;
  });

  const html = `
    <div class="modal-overlay" id="detailModalOverlay">
      <div class="modal">
        <div class="modal-header">
          <h2>${typeIcon} ${escHtml(task.name)}</h2>
          <button class="modal-close" onclick="closeModal('detailModalOverlay')">×</button>
        </div>
        <div class="modal-body">
          <div class="detail-section"><h4>任务概述</h4><p>${escHtml(task.remark || '暂无描述')}</p></div>
          <div class="detail-section"><h4>基本信息</h4><p>类型：${typeIcon} | 状态：${statusLabel} | 优先级：<span class="priority-dot ${task.priority.toLowerCase()}">${task.priority}</span> | 截止：${fmtDate(task.dueDate)}</p></div>
          ${task.tags && task.tags.length ? `<div class="detail-section"><h4>标签</h4><div class="tag-list">${task.tags.map(t => `<span class="tag-item">#${escHtml(t)}</span>`).join('')}</div></div>` : ''}
          <div class="detail-section"><h4>关联任务</h4><div class="tag-list">${relatedTasks.length ? relatedTasks.map(t => `<span class="tag-item">${t}</span>`).join('') : '<span style="font-size:13px;color:var(--text-secondary);">无关联任务</span>'}</div></div>
          <div class="detail-section"><h4>附件</h4><div class="tag-list">${(task.attachments || []).length ? task.attachments.map(a => `<span class="tag-item">📎 ${escHtml(a)}</span>`).join('') : '<span style="font-size:13px;color:var(--text-secondary);">无附件</span>'}</div></div>
          <div class="detail-section">
            <h4>备注区</h4>
            <textarea id="detailRemark" style="width:100%;min-height:60px;" placeholder="添加备注...">${escHtml(task.remark || '')}</textarea>
          </div>
        </div>
        <div class="modal-footer" style="justify-content:space-between;">
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="copyTask('${task.id}')">📋 复制</button>
            <button class="btn btn-secondary btn-sm" onclick="starTask('${task.id}')">⭐ 星标</button>
            <button class="btn btn-secondary btn-sm" onclick="shareTask('${task.id}')">📤 分享</button>
          </div>
          <button class="btn btn-danger btn-sm" onclick="deleteTaskFromDetail('${task.id}')">🗑️ 删除</button>
        </div>
      </div>
    </div>`;
  $('#modalContainer').innerHTML = html;
  const overlay = $('#detailModalOverlay');
  overlay.addEventListener('click', function(e) { if (e.target === this) closeModal('detailModalOverlay'); });

  // Save remark on change
  $('#detailRemark').addEventListener('change', function() {
    task.remark = this.value;
    saveStore();
    syncTaskToCloud(task);
  });
}

function copyTask(id) {
  const task = STORE.tasks.find(t => t.id === id);
  if (!task) return;
  const newTask = { ...task, id: genId(), name: task.name + ' (副本)', createdAt: new Date().toISOString() };
  STORE.tasks.push(newTask);
  saveStore();
  syncTaskToCloud(newTask);
  closeModal('detailModalOverlay');
  renderTasks();
  updateBadges();
}

function starTask(id) { alert('⭐ 已加入星标（功能预留）'); }
function shareTask(id) { alert('📤 分享功能暂未接入'); }
function deleteTaskFromDetail(id) {
  if (!confirm('确定删除此任务吗？')) return;
  STORE.tasks = STORE.tasks.filter(t => t.id !== id);
  saveStore();
  deleteTaskFromCloud(id);
  closeModal('detailModalOverlay');
  renderTasks();
  updateBadges();
}

// ==================== MEMO MANAGEMENT ====================
function renderMemos() {
  let html = '<div class="memo-grid">';
  if (STORE.memos.length === 0) {
    html = `<div class="empty-state"><div class="icon">📝</div><p>暂无备忘录，点击右上角"+ 新增备忘录"开始记录</p></div>`;
  } else {
    STORE.memos.forEach(m => {
      const tagsHtml = (m.tags || []).map(t => `<span class="memo-tag">#${escHtml(t)}</span>`).join('');
      html += `<div class="memo-card" onclick="openMemoDetail('${m.id}')">
        <div class="title">${escHtml(m.title)}</div>
        <div class="summary">${escHtml(m.content || '').substring(0, 120)}</div>
        <div class="meta">
          <div class="tags">${tagsHtml || '<span style="font-size:11px;color:var(--text-secondary);">无标签</span>'}</div>
          <span>${fmtDateTime(m.createdAt)}</span>
        </div>
        <div class="meta" style="margin-top:10px;">
          <span></span>
          <div class="actions" onclick="event.stopPropagation()">
            <button class="action-btn edit" onclick="openMemoModal('${m.id}')">编辑</button>
            <button class="action-btn del" onclick="deleteMemo('${m.id}')">删除</button>
          </div>
        </div>
      </div>`;
    });
    html += '</div>';
  }
  $('#contentArea').innerHTML = html;
}

function openMemoModal(id) {
  editingMemoId = id || null;
  const memo = id ? STORE.memos.find(m => m.id === id) : null;
  const title = memo ? '编辑备忘录' : '新增备忘录';

  const html = `
    <div class="modal-overlay" id="memoModalOverlay">
      <div class="modal">
        <div class="modal-header">
          <h2>${title}</h2>
          <button class="modal-close" onclick="closeModal('memoModalOverlay')">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>标题 *</label>
            <input type="text" id="memoTitle" value="${memo ? escHtml(memo.title) : ''}" placeholder="备忘录标题">
          </div>
          <div class="form-group">
            <label>内容</label>
            <textarea id="memoContent" style="min-height:140px;" placeholder="写点什么...">${memo ? escHtml(memo.content || '') : ''}</textarea>
          </div>
          <div class="form-group">
            <label>标签（用逗号分隔）</label>
            <input type="text" id="memoTags" value="${memo && memo.tags ? memo.tags.join(',') : ''}" placeholder="如：工作,读书,灵感">
          </div>
          <div class="form-group">
            <label>附件</label>
            <div class="ai-placeholder" onclick="alert('附件上传功能预留')">📎 点击上传附件（功能预留）</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('memoModalOverlay')">取消</button>
          <button class="btn btn-primary" onclick="saveMemo()">保存</button>
        </div>
      </div>
    </div>`;
  $('#modalContainer').innerHTML = html;
  $('#memoModalOverlay').addEventListener('click', function(e) { if (e.target === this) closeModal('memoModalOverlay'); });
}

function saveMemo() {
  const title = $('#memoTitle').value.trim();
  if (!title) return alert('请输入标题');
  const memoData = {
    title,
    content: $('#memoContent').value.trim(),
    tags: $('#memoTags').value.split(',').map(s => s.trim()).filter(Boolean),
  };

  if (editingMemoId) {
    const idx = STORE.memos.findIndex(m => m.id === editingMemoId);
    if (idx >= 0) { STORE.memos[idx] = { ...STORE.memos[idx], ...memoData, updatedAt: new Date().toISOString() }; }
  } else {
    STORE.memos.push({ id: genId(), ...memoData, createdAt: new Date().toISOString(), attachments: [], relatedTasks: [], remark: '' });
  }
  saveStore();
  const savedMemo = editingMemoId ? STORE.memos.find(m => m.id === editingMemoId) : STORE.memos[STORE.memos.length - 1];
  if (savedMemo) syncMemoToCloud(savedMemo);
  closeModal('memoModalOverlay');
  renderMemos();
  updateBadges();
}

function deleteMemo(id) {
  if (!confirm('确定删除此备忘录吗？')) return;
  STORE.memos = STORE.memos.filter(m => m.id !== id);
  saveStore();
  deleteMemoFromCloud(id);
  renderMemos();
  updateBadges();
}

function openMemoDetail(id) {
  const memo = STORE.memos.find(m => m.id === id);
  if (!memo) return;

  const html = `
    <div class="modal-overlay" id="detailMemoOverlay">
      <div class="modal">
        <div class="modal-header">
          <h2>📝 ${escHtml(memo.title)}</h2>
          <button class="modal-close" onclick="closeModal('detailMemoOverlay')">×</button>
        </div>
        <div class="modal-body">
          <div class="detail-section"><h4>内容</h4><p style="white-space:pre-wrap;">${escHtml(memo.content || '暂无内容')}</p></div>
          ${memo.tags && memo.tags.length ? `<div class="detail-section"><h4>标签</h4><div class="tag-list">${memo.tags.map(t => `<span class="tag-item">#${escHtml(t)}</span>`).join('')}</div></div>` : ''}
          <div class="detail-section"><h4>附件</h4><div class="tag-list">${(memo.attachments || []).length ? memo.attachments.map(a => `<span class="tag-item">📎 ${escHtml(a)}</span>`).join('') : '<span style="font-size:13px;color:var(--text-secondary);">无附件</span>'}</div></div>
          <div class="detail-section"><h4>创建时间</h4><p>${fmtDateTime(memo.createdAt)}</p></div>
          <div class="detail-section">
            <h4>备注</h4>
            <textarea id="detailMemoRemark" style="width:100%;min-height:60px;" placeholder="添加备注...">${escHtml(memo.remark || '')}</textarea>
          </div>
        </div>
        <div class="modal-footer" style="justify-content:space-between;">
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="copyMemoContent('${memo.id}')">📋 复制内容</button>
            <button class="btn btn-secondary btn-sm" onclick="starMemo('${memo.id}')">⭐ 星标</button>
            <button class="btn btn-secondary btn-sm" onclick="shareMemo('${memo.id}')">📤 分享</button>
          </div>
          <button class="btn btn-danger btn-sm" onclick="deleteMemoFromDetail('${memo.id}')">🗑️ 删除</button>
        </div>
      </div>
    </div>`;
  $('#modalContainer').innerHTML = html;
  $('#detailMemoOverlay').addEventListener('click', function(e) { if (e.target === this) closeModal('detailMemoOverlay'); });
  $('#detailMemoRemark').addEventListener('change', function() {
    memo.remark = this.value;
    saveStore();
    syncMemoToCloud(memo);
  });
}

function copyMemoContent(id) {
  const memo = STORE.memos.find(m => m.id === id);
  if (memo) { navigator.clipboard.writeText(memo.content || '').then(() => alert('内容已复制到剪贴板')); }
}
function starMemo(id) { alert('⭐ 已加入星标（功能预留）'); }
function shareMemo(id) { alert('📤 分享功能暂未接入'); }
function deleteMemoFromDetail(id) {
  if (!confirm('确定删除此备忘录吗？')) return;
  STORE.memos = STORE.memos.filter(m => m.id !== id);
  saveStore();
  deleteMemoFromCloud(id);
  closeModal('detailMemoOverlay');
  renderMemos();
  updateBadges();
}

// ==================== POMODORO ====================
let pomodoroTimer = null;
let pomodoroRunning = false;
let pomodoroPhase = 'work'; // 'work' | 'break'
let pomodoroTimeLeft = 0;

function renderPomodoro() {
  if (!pomodoroRunning) {
    pomodoroTimeLeft = pomodoroPhase === 'work' ? STORE.pomodoro.workMinutes * 60 : STORE.pomodoro.breakMinutes * 60;
  }
  const mins = Math.floor(pomodoroTimeLeft / 60);
  const secs = pomodoroTimeLeft % 60;
  const timeStr = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
  const phaseLabel = pomodoroPhase === 'work' ? '工作中' : '休息中';
  const circleClass = pomodoroPhase === 'work' ? 'work' : 'break';
  const playIcon = pomodoroRunning ? '⏸' : '▶';

  // Check today date
  const today = new Date().toDateString();
  if (STORE.pomodoro.todayDate !== today) {
    STORE.pomodoro.todayCount = 0;
    STORE.pomodoro.todayDate = today;
    saveStore();
    syncPomodoroToCloud();
  }

  const html = `
    <div class="pomodoro-container">
      <div class="timer-circle ${circleClass}">
        <div class="time">${timeStr}</div>
        <div class="phase">${phaseLabel}</div>
      </div>
      <div class="timer-controls">
        <button class="timer-btn reset" onclick="resetPomodoro()">↺</button>
        <button class="timer-btn play" onclick="togglePomodoro()">${playIcon}</button>
      </div>
      <div class="timer-settings">
        <label>工作时长(分)：<input type="number" id="workMinutes" value="${STORE.pomodoro.workMinutes}" min="1" max="120" onchange="updatePomodoroSettings()"></label>
        <label>休息时长(分)：<input type="number" id="breakMinutes" value="${STORE.pomodoro.breakMinutes}" min="1" max="60" onchange="updatePomodoroSettings()"></label>
      </div>
      <div class="tomato-stats">
        今日已完成番茄：<span class="count">${STORE.pomodoro.todayCount}</span> 个 🍅
      </div>
    </div>`;
  $('#contentArea').innerHTML = html;
}

function updatePomodoroSettings() {
  const wm = parseInt($('#workMinutes').value) || 25;
  const bm = parseInt($('#breakMinutes').value) || 5;
  STORE.pomodoro.workMinutes = Math.max(1, Math.min(120, wm));
  STORE.pomodoro.breakMinutes = Math.max(1, Math.min(60, bm));
  saveStore();
  syncPomodoroToCloud();
  if (!pomodoroRunning) {
    pomodoroTimeLeft = pomodoroPhase === 'work' ? STORE.pomodoro.workMinutes * 60 : STORE.pomodoro.breakMinutes * 60;
    renderPomodoro();
  }
}

function togglePomodoro() {
  if (pomodoroRunning) {
    clearInterval(pomodoroTimer);
    pomodoroRunning = false;
    renderPomodoro();
  } else {
    if (pomodoroTimeLeft <= 0) {
      pomodoroTimeLeft = pomodoroPhase === 'work' ? STORE.pomodoro.workMinutes * 60 : STORE.pomodoro.breakMinutes * 60;
    }
    pomodoroRunning = true;
    pomodoroTimer = setInterval(() => {
      pomodoroTimeLeft--;
      if (pomodoroTimeLeft <= 0) {
        clearInterval(pomodoroTimer);
        pomodoroRunning = false;
        // Notification
        if (Notification.permission === 'granted') {
          new Notification('番茄钟', { body: pomodoroPhase === 'work' ? '工作阶段结束！该休息了~' : '休息结束！继续工作吧~', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🍅</text></svg>' });
        }
        if (pomodoroPhase === 'work') {
          STORE.pomodoro.todayCount++;
          saveStore();
          syncPomodoroToCloud();
          pomodoroPhase = 'break';
        } else {
          pomodoroPhase = 'work';
        }
        renderPomodoro();
        return;
      }
      // Update display only
      const mins = Math.floor(pomodoroTimeLeft / 60);
      const secs = pomodoroTimeLeft % 60;
      const timeEl = document.querySelector('.timer-circle .time');
      if (timeEl) timeEl.textContent = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    }, 1000);
    renderPomodoro();
  }
}

function resetPomodoro() {
  clearInterval(pomodoroTimer);
  pomodoroRunning = false;
  pomodoroPhase = 'work';
  pomodoroTimeLeft = STORE.pomodoro.workMinutes * 60;
  renderPomodoro();
}

// ==================== AI ASSISTANT ====================
// API Key 已移至 Vercel 后端 /api/chat，前端不再存储

let aiMessages = [];
let aiLoading = false;
let aiAbortController = null;

const AI_CAPABILITIES = [
  { id: 'create_task', icon: '📝', name: '智能创建任务', desc: '描述需求，AI自动生成任务' },
  { id: 'weekly_report', icon: '📊', name: '周报总结', desc: '生成本周任务完成统计' },
  { id: 'priority_advice', icon: '🎯', name: '任务优先级建议', desc: '基于现有任务的优先级优化' },
  { id: 'schedule_advice', icon: '📅', name: '日程安排建议', desc: '智能规划每日任务时间' },
  { id: 'memo_organize', icon: '📝', name: '备忘录整理', desc: '归类与提炼备忘录要点' },
  { id: 'focus_report', icon: '🧠', name: '专注分析报告', desc: '番茄钟专注度分析' },
  { id: 'make_plan', icon: '🗓️', name: '制定计划', desc: '输入计划，AI拆解为每日/每周任务' },
];

const CAPABILITY_PROMPTS = {
  create_task: '用户想要创建一个新任务。请根据用户描述，以友好的语气帮用户规划一个任务，建议包含任务名、类型、优先级(P0-P3)、截止日期等。如果用户没有给出具体描述，请引导用户说明需求。回复简洁有价值。',
  weekly_report: `请根据以下用户当前任务数据生成周报总结：总任务数${STORE.tasks.length}个，已完成${STORE.tasks.filter(t=>t.status==='done').length}个，紧急待处理${STORE.tasks.filter(t=>t.status==='urgent').length}个，重要待处理${STORE.tasks.filter(t=>t.status==='important').length}个，今日番茄${STORE.pomodoro.todayCount}个。用表格形式展示，并给出简短建议。`,
  priority_advice: `用户有${STORE.tasks.length}个任务，其中未完成${STORE.tasks.filter(t=>t.status!=='done').length}个。请分析并给出优先级调整的具体建议。提醒每天最多3个P0，避免优先级通货膨胀。`,
  schedule_advice: '请根据用户的任务情况，给出今日或本周的时间块安排建议（如09:00-10:30处理紧急任务等）。每25分钟专注+5分钟休息的番茄节奏。',
  memo_organize: `用户有${STORE.memos.length}条备忘录。请给出分类整理建议，如按工作/学习/生活归类，建议使用#标签管理。`,
  focus_report: `用户今日完成了${STORE.pomodoro.todayCount}个番茄，工作时长${STORE.pomodoro.workMinutes}分钟/轮，休息${STORE.pomodoro.breakMinutes}分钟/轮。请给出专注度分析报告和优化建议。每天8-12个番茄为佳。`,
  make_plan: null, // handled specially
};

function initAiMessages() {
  aiMessages = [{
    role: 'ai',
    content: '你好！我是你的智能工作助手 🤖\n\n我已接入 DeepSeek，可以帮你管理任务、撰写周报、优化优先级、安排日程等。\n请点击右侧快捷卡片或直接输入问题开始～',
  }];
}

async function callDeepSeek(messages, isPlanMode = false, signal = null) {
  let systemPrompt = '你是 Todo 工作台的 AI 助手，帮助用户管理任务、笔记和时间。回答应简洁、结构化、有价值。';

  if (isPlanMode) {
    systemPrompt = `你是 Todo 工作台的 AI 助手。用户的计划需要拆解为每日/每周任务。
请在回复的最后，用一个 JSON 代码块输出结构化的任务列表，格式如下：
\`\`\`json
[{"name":"任务名","type":"normal|timed|recurring","priority":"P0|P1|P2|P3","dueDate":"YYYY-MM-DD","remark":"备注"},...]
\`\`\`
dueDate 根据计划时间线推算。每个任务的 priority 要合理分配。先给出自然语言的分析说明，再附上 JSON。`;
  }

  const allMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content })),
  ];

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: allMessages, isPlanMode }),
    signal: signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(`API 请求失败 (${response.status}): ${data.error || '未知错误'}`);
  }

  const data = await response.json();
  return data.content;
}

function stopAiGeneration() {
  if (aiAbortController) {
    aiAbortController.abort();
    aiAbortController = null;
  }
}

function cleanAiContent(text) {
  if (!text) return '';
  return text
    .trim()
    // Collapse 3+ consecutive newlines to 2
    .replace(/\n{3,}/g, '\n\n')
    // Remove leading empty lines
    .replace(/^\n+/, '')
    .replace(/^\s+/, '');
}

function renderMarkdown(text) {
  if (!text) return '';
  let html = text;
  // Escape any raw HTML to prevent injection (do this first)
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // ### Heading
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  // **bold text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // - list items: collect consecutive lines and wrap in <ul>
  html = html.replace(/(?:^- .+$\n?)+/gm, function(match) {
    const items = match.trim().split('\n').map(function(line) {
      return '<li>' + line.replace(/^- /, '') + '</li>';
    }).join('');
    return '<ul>' + items + '</ul>';
  });
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  return html;
}

function parseTaskJson(content) {
  console.log('[parseTaskJson] 开始解析，原始长度:', (content || '').length);

  let jsonStr = '';
  const blockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (blockMatch) {
    jsonStr = blockMatch[1].trim();
    console.log('[parseTaskJson] 从代码块提取，长度:', jsonStr.length);
  } else {
    // Fallback A: find JSON array in raw content (greedy, capture [ {...} ... to end)
    const arrMatch = content.match(/\[\s*\{[\s\S]*/);
    if (arrMatch) {
      jsonStr = arrMatch[0];
      console.log('[parseTaskJson] 从原始文本提取数组，长度:', jsonStr.length);
    } else {
      // Fallback B: find newline-delimited {..} objects without array brackets
      const objMatches = content.match(/\{[^{}]*\}/g);
      if (objMatches && objMatches.length > 1) {
        jsonStr = '[' + objMatches.join(',\n') + ']';
        console.log('[parseTaskJson] 从 {..} 对象重组数组，对象数:', objMatches.length);
      }
    }
  }
  if (!jsonStr) { console.log('[parseTaskJson] 未找到 JSON 数据'); return []; }

  // Phase 1: Clean comments and trailing commas
  let cleaned = jsonStr
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,(\s*[}\]])/g, '$1')
    .trim();

  // Phase 2: Try standard JSON.parse
  try {
    const result = JSON.parse(cleaned);
    console.log('[parseTaskJson] ✅ 标准解析成功，任务数:', result.length);
    return result;
  } catch (e1) {
    console.log('[parseTaskJson] 标准解析失败:', e1.message.substring(0, 80));
  }

  // Phase 3: Auto-complete missing closing bracket
  if (!cleaned.endsWith(']')) {
    console.log('[parseTaskJson] 尝试补全缺失的 ]');
    try {
      const result = JSON.parse(cleaned + ']');
      console.log('[parseTaskJson] ✅ 补全 ] 成功，任务数:', result.length);
      return result;
    } catch (e2) {
      console.log('[parseTaskJson] 补全 ] 仍失败:', e2.message.substring(0, 80));
    }

    // Maybe also missing last } before ]
    console.log('[parseTaskJson] 尝试补全缺失的 }]');
    try {
      const result = JSON.parse(cleaned + '}]');
      console.log('[parseTaskJson] ✅ 补全 }] 成功，任务数:', result.length);
      return result;
    } catch (e3) {
      console.log('[parseTaskJson] 补全 }] 仍失败');
    }
  }

  // Phase 4: Aggressive compression retry
  try {
    const compressed = cleaned
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ');
    const result = JSON.parse(compressed);
    console.log('[parseTaskJson] ✅ 压缩后解析成功，任务数:', result.length);
    return result;
  } catch (e4) {
    console.log('[parseTaskJson] 压缩后仍失败');
  }

  // Phase 5: Extract individual complete objects from broken JSON
  console.log('[parseTaskJson] 尝试逐个提取完整对象');
  const objPattern = /\{[^{}]*\}/g;
  const objMatches = cleaned.match(objPattern);
  if (objMatches && objMatches.length > 0) {
    const tasks = [];
    let failCount = 0;
    for (const objStr of objMatches) {
      try {
        const fixed = objStr.replace(/,\s*([}\]])/g, '$1').trim();
        tasks.push(JSON.parse(fixed));
      } catch (e5) {
        failCount++;
        console.log('[parseTaskJson] 单个对象解析失败:', objStr.substring(0, 60));
      }
    }
    if (tasks.length > 0) {
      console.log('[parseTaskJson] ✅ 单个提取成功:', tasks.length, '个任务，失败:', failCount);
      return tasks;
    }
  }

  console.log('[parseTaskJson] ❌ 所有策略均失败，返回空数组');
  return [];
}

function buildTaskCardsHtml(tasks) {
  return tasks.map((t, i) => {
    const typeIcon = t.type === 'timed' ? '📅' : t.type === 'recurring' ? '🔁' : '📝';
    const priorityColor = { P0: 'var(--p0)', P1: 'var(--p1)', P2: 'var(--p2)', P3: 'var(--p3)' }[t.priority] || 'var(--p2)';
    return `<div class="ai-task-card" id="aiTask_${i}">
      <div class="task-info">
        <div class="task-name">${typeIcon} ${escHtml(t.name)}</div>
        <div class="task-meta">
          <span style="display:inline-block;width:20px;height:16px;line-height:16px;border-radius:8px;text-align:center;font-size:10px;font-weight:700;color:#fff;background:${priorityColor};vertical-align:middle;">${t.priority}</span>
          &nbsp;截止：${t.dueDate || '待定'} &nbsp; ${escHtml(t.remark || '')}
        </div>
      </div>
      <button class="ai-add-task-btn" onclick="addTaskFromAI(${i}, this)" data-task="${encodeURIComponent(JSON.stringify(t))}">＋ 添加到任务</button>
    </div>`;
  }).join('');
}

function addTaskFromAI(idx, btn) {
  if (btn.classList.contains('added')) return;
  const taskData = JSON.parse(decodeURIComponent(btn.dataset.task));
  const newTask = {
    id: genId(),
    name: taskData.name,
    type: taskData.type || 'normal',
    status: 'important',
    dueDate: taskData.dueDate || '',
    priority: taskData.priority || 'P2',
    remark: taskData.remark || '',
    tags: taskData.tags || [],
    createdAt: new Date().toISOString(),
    relatedTasks: [],
    attachments: [],
  };
  STORE.tasks.push(newTask);
  saveStore();
  syncTaskToCloud(newTask);
  updateBadges();
  btn.textContent = '✓ 已添加';
  btn.classList.add('added');
}

function renderAi() {
  if (aiMessages.length === 0) initAiMessages();

  if (!isLoggedInUser()) {
    $('#contentArea').innerHTML = `
      <div class="ai-layout">
        <div class="ai-chat">
          <div class="ai-chat-header"><div class="ai-avatar">🤖</div><div class="info"><h3>AI 智能助手</h3><p>登录后可使用 DeepSeek 智能建议</p></div></div>
          <div class="guest-register-card" style="margin:20px;">
            <h4>登录后使用 AI 助手</h4>
            <p>你可以先在本地使用任务、备忘录和番茄钟；AI 对话、计划生成和智能建议需要登录账号。</p>
            <button class="register-cta-btn" onclick="showLoginOverlay()">登录 / 注册</button>
          </div>
          <div class="ai-input-bar"><input type="text" disabled placeholder="请先登录后使用 AI 助手"></div>
        </div>
        <div class="ai-panel"><h3>快捷能力</h3><div class="subtitle">登录后可用</div>
          ${AI_CAPABILITIES.map(cap => `
            <div class="ai-capability" style="pointer-events:none;opacity:0.55">
              <div class="cap-icon">${cap.icon}</div>
              <div class="cap-info"><div class="cap-name">${cap.name}</div><div class="cap-desc">${cap.desc}</div></div>
            </div>
          `).join('')}
        </div>
      </div>`;
    return;
  }

  let html = '<div class="ai-layout">';

  // Chat area
  html += '<div class="ai-chat">';
  html += '<div class="ai-chat-header"><div class="ai-avatar">🤖</div><div class="info"><h3>AI 智能助手</h3><p>DeepSeek · 基于任务数据提供智能建议</p></div></div>';

  html += '<div class="ai-messages" id="aiMessages">';

  aiMessages.forEach((msg, idx) => {
    const cls = msg.role === 'user' ? 'user' : 'ai';
    const avatar = msg.role === 'user' ? '👤' : '🤖';
    let extra = '';

    // Plan potential button (not yet generated, not loading)
    if (msg.role === 'ai' && msg.hasPlanPotential && !msg.planGenerated && !aiLoading) {
      extra += `<div class="plan-trigger-bar">
        <button class="plan-trigger-btn" onclick="generatePlanFromChat(${idx})">📋 为此计划生成每日任务</button>
      </div>`;
    }

    // Plan loading state
    if (msg.role === 'ai' && msg._planLoading) {
      extra += '<div class="plan-loading-bar"><div class="ai-loading"><span></span><span></span><span></span></div><span class="plan-loading-text">正在生成任务计划...</span></div>';
    }

    // Selectable task cards (plan generated, not yet confirmed)
    if (msg.role === 'ai' && msg.planGenerated && msg.planTasks && msg.planTasks.length > 0 && !msg.planConfirmed) {
      extra += buildSelectableTaskCardsHtml(msg.planTasks, idx);
    }

    // Confirmed state
    if (msg.role === 'ai' && msg.planTasks && msg.planTasks.length > 0 && msg.planConfirmed) {
      extra += '<div style="margin-top:10px;">' + buildTaskCardsHtml(msg.planTasks) + '</div>';
    }

    // Legacy: message with tasks from submitPlan
    let content = renderMarkdown(cleanAiContent(msg.content));
    if (msg.tasks && msg.tasks.length > 0) {
      content += '<div style="margin-top:10px;">' + buildTaskCardsHtml(msg.tasks) + '</div>';
    }

    html += `<div class="ai-msg ${cls}"><div class="msg-avatar">${avatar}</div><div class="bubble">${content}${extra}</div></div>`;
  });

  if (aiLoading) {
    html += '<div class="ai-loading"><span></span><span></span><span></span></div>';
  }

  html += '</div>';
  html += `<div class="ai-input-bar">
    <input type="text" id="aiInput" placeholder="${aiLoading ? 'AI 正在思考中...' : '输入消息，按 Enter 发送...'}" onkeydown="if(event.key==='Enter' && !aiLoading)sendAiMessage()" ${aiLoading ? 'disabled' : ''}>
    ${aiLoading
      ? `<button class="ai-stop-btn" onclick="stopAiGeneration()" title="停止生成">⏹</button>`
      : `<button class="ai-send-btn" onclick="sendAiMessage()">➤</button>`
    }
  </div>`;
  html += '</div>';

  // Capabilities panel
  html += '<div class="ai-panel"><h3>快捷能力</h3><div class="subtitle">点击卡片快速体验 AI 功能</div>';
  AI_CAPABILITIES.forEach(cap => {
    html += `<div class="ai-capability" data-cap="${cap.id}" onclick="triggerCapability('${cap.id}')" ${aiLoading ? 'style="pointer-events:none;opacity:0.6"' : ''}>
      <div class="cap-icon">${cap.icon}</div>
      <div class="cap-info"><div class="cap-name">${cap.name}</div><div class="cap-desc">${cap.desc}</div></div>
    </div>`;
  });
  html += '</div></div>';

  $('#contentArea').innerHTML = html;

  // Scroll to bottom
  setTimeout(() => {
    const msgEl = $('#aiMessages');
    if (msgEl) msgEl.scrollTop = msgEl.scrollHeight;
  }, 50);
}

async function sendAiMessage() {
  if (aiLoading) return;

  if (!isLoggedInUser()) {
    renderAi();
    return;
  }

  const input = $('#aiInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  aiMessages.push({ role: 'user', content: text });
  aiLoading = true;
  renderAi();

  try {
    aiAbortController = new AbortController();
    const reply = await callDeepSeek(aiMessages, false, aiAbortController.signal);
    const hasPlan = detectPlanIntent(aiMessages.map(m => m.content).join(' '));
    aiMessages.push({ role: 'ai', content: reply, hasPlanPotential: hasPlan, planGenerated: false });
  } catch (err) {
    if (err.name === 'AbortError') {
      aiMessages.push({ role: 'ai', content: '⏹ 已停止生成' });
    } else {
      aiMessages.push({ role: 'ai', content: '⚠️ 抱歉，AI 服务暂时不可用：' + err.message + '\n\n请稍后重试或检查网络连接。' });
    }
  } finally {
    aiAbortController = null;
    aiLoading = false;
    renderAi();
  }
}

function detectPlanIntent(text) {
  const keywords = ['计划', '目标', '学习', '安排', '每天', '每周', '学会', '掌握', '养成', '打卡', '坚持', '日程', '规划', '阶段', '里程碑', 'habit', 'plan', 'schedule', 'routine'];
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

async function triggerCapability(capId) {
  if (aiLoading) return;

  if (!isLoggedInUser()) {
    renderAi();
    return;
  }

  if (capId === 'make_plan') {
    openPlanModal();
    return;
  }

  const cap = AI_CAPABILITIES.find(c => c.id === capId);
  if (!cap) return;

  const prompt = CAPABILITY_PROMPTS[capId] || '请帮助用户解决问题。';
  aiMessages.push({ role: 'user', content: prompt });
  aiLoading = true;
  renderAi();

  try {
    aiAbortController = new AbortController();
    const reply = await callDeepSeek(aiMessages, false, aiAbortController.signal);
    const hasPlan = detectPlanIntent(aiMessages.map(m => m.content).join(' '));
    aiMessages.push({ role: 'ai', content: reply, hasPlanPotential: hasPlan, planGenerated: false });
  } catch (err) {
    if (err.name === 'AbortError') {
      aiMessages.push({ role: 'ai', content: '⏹ 已停止生成' });
    } else {
      aiMessages.push({ role: 'ai', content: '⚠️ 抱歉，AI 服务暂时不可用：' + err.message + '\n\n请稍后重试或检查网络连接。' });
    }
  } finally {
    aiAbortController = null;
    aiLoading = false;
    renderAi();
  }
}

// ==================== PLAN MODAL ====================
function openPlanModal() {
  const html = `
    <div class="modal-overlay" id="planModalOverlay">
      <div class="modal plan-modal">
        <div class="modal-header">
          <h2>🗓️ 制定计划</h2>
          <button class="modal-close" onclick="closeModal('planModalOverlay')">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>请描述你的计划目标</label>
            <textarea id="planDescription" placeholder="例如：我想在两周内学会 Python 基础，包括变量、循环、函数、文件操作和简单项目实战。每天可以投入 2 小时。"></textarea>
          </div>
          <p style="font-size:12px;color:var(--text-secondary);">AI 将帮你拆解为每日/每周任务，并自动生成任务列表。</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('planModalOverlay')">取消</button>
          <button class="btn btn-primary" onclick="submitPlan()">生成任务计划</button>
        </div>
      </div>
    </div>`;
  $('#modalContainer').innerHTML = html;
  const overlay = $('#planModalOverlay');
  overlay.addEventListener('click', function(e) { if (e.target === this) closeModal('planModalOverlay'); });
}

async function submitPlan() {
  const desc = $('#planDescription').value.trim();
  if (!desc) return alert('请输入计划描述');

  if (!isLoggedInUser()) {
    closeModal('planModalOverlay');
    renderAi();
    return;
  }

  closeModal('planModalOverlay');

  // Add user message
  const userMsg = '🗓️ 制定计划：' + desc;
  aiMessages.push({ role: 'user', content: userMsg });

  aiLoading = true;
  // Switch to AI tab content if we're on another module
  if (currentModule !== 'ai') {
    switchModule('ai');
  }
  renderAi();

  try {
    const planMessages = [
      { role: 'user', content: `请帮我把以下计划拆解为每日/每周任务：\n\n${desc}\n\n请给出详细的时间线规划和任务拆解，并在最后附上 JSON 任务列表。` },
    ];
    aiAbortController = new AbortController();
    const reply = await callDeepSeek(planMessages, true, aiAbortController.signal);

    // Parse tasks from JSON
    const tasks = parseTaskJson(reply);
    // Strip JSON from display content: code fence first, then raw array/objects
    let cleanReply = reply.replace(/```(?:json)?[\s\S]*?```/g, '');
    // Try to locate start of raw JSON: array bracket or sequence of objects
    let jsonStartIdx = cleanReply.search(/\n\s*\[/);
    if (jsonStartIdx < 0) {
      // Look for first { that starts a JSON object sequence (multiple {..} lines)
      jsonStartIdx = cleanReply.search(/\n\s*\{/);
    }
    if (jsonStartIdx >= 0) {
      cleanReply = cleanReply.substring(0, jsonStartIdx);
    }
    cleanReply = cleanReply.trim();

    aiMessages.push({ role: 'ai', content: cleanReply, tasks: tasks });
  } catch (err) {
    if (err.name === 'AbortError') {
      aiMessages.push({ role: 'ai', content: '⏹ 已停止生成' });
    } else {
      aiMessages.push({ role: 'ai', content: '⚠️ 抱歉，AI 服务暂时不可用：' + err.message + '\n\n请稍后重试或检查网络连接。' });
    }
  } finally {
    aiAbortController = null;
    aiLoading = false;
    renderAi();
  }
}

// ==================== SMART PLAN DETECTION ====================
async function generatePlanFromChat(msgIndex) {
  if (aiLoading) return;

  if (!isLoggedInUser()) {
    renderAi();
    return;
  }

  const msg = aiMessages[msgIndex];
  if (!msg) return;

  // Mark loading
  msg._planLoading = true;
  aiLoading = true;
  renderAi();

  try {
    // Gather context: all messages up to and including this one
    const contextMessages = aiMessages.slice(0, msgIndex + 1).map(m => ({
      role: m.role,
      content: m.content,
    }));
    const planStartDate = getTodayDate();
    const planStartDateCn = `${planStartDate.getFullYear()}年${planStartDate.getMonth() + 1}月${planStartDate.getDate()}日`;
    const planStartDateStr = toDateInputValue(planStartDate);

    const planPrompt = [...contextMessages, {
      role: 'user',
      content: `请将上述计划严格按天拆解为每日任务列表。要求：

【按天分组】
1. 从今天（${planStartDateCn}）开始作为 Day 1，之后依次 Day 2、Day 3……
2. 每天分配 2-4 个具体任务，严禁把所有任务堆在同一天
3. 每天的任务量应均衡，难易搭配

【任务字段】
每个任务包含：
- day：所属天数（数字，1代表第1天）
- name：任务名（简明扼要）
- type：normal（普通）/ timed（定时）/ recurring（循环）
- priority：P0（最高）/ P1（高）/ P2（中）/ P3（低），每天最多1个P0
- dueDate：YYYY-MM-DD格式，等于当天日期
- remark：详细备注（30-60字），必须包含：①具体做什么 ②怎么做/用什么方法 ③完成标准是什么。严禁写"完成XX学习"这种空泛描述！

【JSON 格式】
先写分析说明（100字以内），再输出 JSON 代码块：
\`\`\`json
[
  {"day":1,"name":"搭建Python开发环境","type":"normal","priority":"P1","dueDate":"${planStartDateStr}","remark":"下载Python 3.12安装包并完成安装，配置PATH环境变量，安装VS Code及Python扩展插件，验证：终端输入python --version能正确输出版本号"},
  {"day":1,"name":"编写第一个Hello World程序","type":"normal","priority":"P2","dueDate":"${planStartDateStr}","remark":"在VS Code中创建hello.py文件，使用print函数输出'Hello, Python!'，运行并确认控制台正常打印，理解print函数的基本用法"}
]
\`\`\``,
    }];

    aiAbortController = new AbortController();
    const reply = await callDeepSeek(planPrompt, true, aiAbortController.signal);
    const tasks = parseTaskJson(reply);
    // Strip JSON from display content: code fence first, then raw array/objects
    let cleanReply = reply.replace(/```(?:json)?[\s\S]*?```/g, '');
    // Try to locate start of raw JSON: array bracket or sequence of objects
    let jsonStartIdx = cleanReply.search(/\n\s*\[/);
    if (jsonStartIdx < 0) {
      // Look for first { that starts a JSON object sequence (multiple {..} lines)
      jsonStartIdx = cleanReply.search(/\n\s*\{/);
    }
    if (jsonStartIdx >= 0) {
      cleanReply = cleanReply.substring(0, jsonStartIdx);
    }
    cleanReply = cleanReply.trim();

    // Insert a new AI message for the plan generation result
    const fallbackText = tasks.length > 0
      ? '已根据你的计划生成以下任务，请选择要添加的任务：'
      : '任务拆解完成，但未能解析出结构化任务列表。请检查 AI 返回格式或重试。';
    aiMessages.push({
      role: 'ai',
      content: cleanReply || fallbackText,
      planGenerated: true,
      planTasks: tasks,
      planConfirmed: false,
      planQuery: contextMessages.filter(m => m.role === 'user').pop()?.content || 'AI 计划',
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      aiMessages.push({ role: 'ai', content: '⏹ 已停止生成' });
    } else {
      aiMessages.push({
        role: 'ai',
        content: '⚠️ 生成计划失败：' + err.message,
      });
    }
  } finally {
    aiAbortController = null;
    msg._planLoading = false;
    aiLoading = false;
    renderAi();
  }
}

function buildSelectableTaskCardsHtml(tasks, msgIndex) {
  if (!tasks || tasks.length === 0) return '';

  // Group tasks by day
  const grouped = {};
  tasks.forEach((t, i) => {
    const day = t.day || 1;
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push({ ...t, _origIndex: i });
  });

  const dayNums = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  const typeIcon = (type) => type === 'timed' ? '📅' : type === 'recurring' ? '🔁' : '📝';
  const priorityColor = (p) => ({ P0: 'var(--p0)', P1: 'var(--p1)', P2: 'var(--p2)', P3: 'var(--p3)' }[p] || 'var(--p2)');
  const typeLabel = (type) => type === 'timed' ? '定时' : type === 'recurring' ? '循环' : '普通';

  const groupsHtml = dayNums.map(day => {
    const dayTasks = grouped[day];
    const dayDate = getDayDate(day);
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekDay = weekDays[dayDate.getDay()];
    const dateStr = `${dayDate.getMonth() + 1}月${dayDate.getDate()}日（周${weekDay}）`;

    const cards = dayTasks.map(t => `<label class="plan-check-card" data-day="${day}">
      <input type="checkbox" class="plan-checkbox" data-task-index="${t._origIndex}" data-msg-index="${msgIndex}" data-day="${day}" checked onchange="updateDaySelectAll(${msgIndex}, ${day})">
      <div class="plan-check-body">
        <div class="task-name">${typeIcon(t.type)} ${escHtml(t.name)}</div>
        <div class="task-meta">
          <span class="plan-priority-badge" style="background:${priorityColor(t.priority)};">${t.priority}</span>
          <span class="plan-type-label">${typeLabel(t.type)}</span>
          ${t.remark ? `<span class="plan-remark">${escHtml(t.remark)}</span>` : ''}
        </div>
      </div>
    </label>`).join('');

    return `<div class="plan-day-group">
      <div class="plan-day-header">
        <span class="day-badge">📅 Day ${day}</span>
        <span class="day-date">${dateStr}</span>
        <span class="day-count">${dayTasks.length} 个任务</span>
        <label class="day-select-all">
          <input type="checkbox" class="day-select-all-cb" id="daySelectAll_${msgIndex}_${day}" data-day="${day}" checked onchange="toggleDayTasks(${msgIndex}, ${day}, this.checked)"> 全选
        </label>
      </div>
      <div class="plan-check-list" id="dayList_${msgIndex}_${day}">${cards}</div>
    </div>`;
  }).join('');

  const total = tasks.length;
  return `<div class="plan-selectable-wrap">
    <div class="plan-select-header">
      <label class="plan-select-all-label">
        <input type="checkbox" id="planSelectAll_${msgIndex}" checked onchange="toggleAllPlanTasks(${msgIndex}, this.checked)"> 全选（共 ${total} 个任务，${dayNums.length} 天）
      </label>
    </div>
    <div class="plan-select-list" id="planSelectList_${msgIndex}">${groupsHtml}</div>
    <div class="plan-select-footer">
      <button class="btn btn-secondary" onclick="cancelPlanTasks(${msgIndex})">取消</button>
      <button class="btn btn-primary" onclick="batchAddPlanTasks(${msgIndex})">全部添加</button>
    </div>
  </div>`;
}

function getDayDate(dayNum) {
  return getDateAfterDays(dayNum - 1);
}

function updateDaySelectAll(msgIndex, day) {
  const list = document.getElementById('dayList_' + msgIndex + '_' + day);
  if (!list) return;
  const cbs = list.querySelectorAll('.plan-checkbox');
  const allChecked = [...cbs].every(cb => cb.checked);
  const daySelectAll = document.getElementById('daySelectAll_' + msgIndex + '_' + day);
  if (daySelectAll) daySelectAll.checked = allChecked;
  updateGlobalSelectAll(msgIndex);
}

function updateGlobalSelectAll(msgIndex) {
  const wrap = document.getElementById('planSelectList_' + msgIndex);
  if (!wrap) return;
  const allCbs = wrap.querySelectorAll('.plan-checkbox');
  const allChecked = [...allCbs].every(cb => cb.checked);
  const globalCb = document.getElementById('planSelectAll_' + msgIndex);
  if (globalCb) globalCb.checked = allChecked;
}

function toggleDayTasks(msgIndex, day, checked) {
  const list = document.getElementById('dayList_' + msgIndex + '_' + day);
  if (!list) return;
  list.querySelectorAll('.plan-checkbox').forEach(cb => { cb.checked = checked; });
  updateGlobalSelectAll(msgIndex);
}

function toggleAllPlanTasks(msgIndex, checked) {
  const wrap = document.getElementById('planSelectList_' + msgIndex);
  if (!wrap) return;
  wrap.querySelectorAll('.plan-checkbox').forEach(cb => { cb.checked = checked; });
  wrap.querySelectorAll('.day-select-all-cb').forEach(cb => { cb.checked = checked; });
}

function cancelPlanTasks(msgIndex) {
  const msg = aiMessages.find((m, i) => i === msgIndex);
  if (msg) {
    msg.planGenerated = false;
    msg.planTasks = null;
    msg.planConfirmed = false;
    msg._planLoading = false;
  }
  renderAi();
}

function batchAddPlanTasks(msgIndex) {
  const list = document.getElementById('planSelectList_' + msgIndex);
  if (!list) return;

  const checkboxes = list.querySelectorAll('.plan-checkbox:checked');
  if (checkboxes.length === 0) return;

  const msg = aiMessages.find((m, i) => i === msgIndex);
  if (!msg || !msg.planTasks) return;

  let addedCount = 0;
  const addedTasks = [];
  checkboxes.forEach(cb => {
    const ti = parseInt(cb.dataset.taskIndex);
    const taskData = msg.planTasks[ti];
    if (!taskData) return;

    const newTask = {
      id: genId(),
      name: taskData.name,
      type: taskData.type || 'normal',
      status: 'important',
      dueDate: taskData.dueDate || '',
      priority: taskData.priority || 'P2',
      remark: taskData.remark || '',
      tags: taskData.tags || [],
      createdAt: new Date().toISOString(),
      relatedTasks: [],
      attachments: [],
    };
    STORE.tasks.push(newTask);
    addedTasks.push(newTask);
    addedCount++;
  });

  saveStore();
  addedTasks.forEach(task => syncTaskToCloud(task));
  updateBadges();

  // Mark the plan as confirmed with only the selected tasks
  const selectedTasks = [];
  checkboxes.forEach(cb => {
    const ti = parseInt(cb.dataset.taskIndex);
    if (msg.planTasks[ti]) selectedTasks.push(msg.planTasks[ti]);
  });
  msg.planTasks = selectedTasks;
  msg.planConfirmed = true;

  // Create plan record in STORE.plans
  const planName = (msg.planQuery || 'AI 计划').replace(/^(请|帮我|帮我制定|请帮我|制定|生成|创建)/, '').trim().slice(0, 30) || 'AI 计划';
  const planDays = [...new Set(selectedTasks.map(t => t.day || 1))];
  const newPlan = {
    id: genId(),
    name: planName,
    createdAt: new Date().toISOString(),
    tasks: selectedTasks,
    totalDays: planDays.length,
  };
  STORE.plans.push(newPlan);
  saveStore();

  // Sync new plan to cloud
  syncPlanToCloud(newPlan);

  // Append a small system note
  aiMessages.push({
    role: 'ai',
    content: `✅ 已添加 ${addedCount} 个任务到任务管理模块。你可以在「📋 任务管理」中查看和管理它们。`,
  });

  renderAi();
}

// ==================== PLAN MANAGEMENT ====================
function renderPlans() {
  if (!STORE.plans || STORE.plans.length === 0) {
    $('#contentArea').innerHTML = `<div class="empty-state">
      <div class="icon">📋</div>
      <p>暂无计划</p>
      <p style="font-size:13px;color:var(--text-secondary);margin-top:8px;">在 AI 助手中生成计划并添加任务后，计划会自动显示在这里</p>
    </div>`;
    return;
  }

  let html = '';
  STORE.plans.forEach((plan, idx) => {
    const total = plan.tasks ? plan.tasks.length : 0;
    const doneCount = 0;
    html += `
    <div class="plan-card">
      <div class="plan-card-header" onclick="togglePlan('${plan.id}')">
        <span class="plan-collapse-icon" id="planIcon_${plan.id}">▶</span>
        <div class="plan-card-title-wrap">
          <span class="plan-card-title">${escHtml(plan.name)}</span>
          <span class="plan-card-meta">${fmtDateTime(plan.createdAt)} · ${doneCount}/${total} 已完成 · ${plan.totalDays || 0} 天</span>
        </div>
        <button class="plan-delete-btn" onclick="event.stopPropagation();deletePlan('${plan.id}')" title="删除计划">删除</button>
      </div>
      <div class="plan-card-body" id="planBody_${plan.id}" style="display:none">
        ${renderPlanDays(plan)}
      </div>
    </div>`;
  });
  $('#contentArea').innerHTML = html;
}

function renderPlanDays(plan) {
  if (!plan.tasks || plan.tasks.length === 0) return '<div class="plan-empty-hint">暂无任务</div>';

  const grouped = {};
  plan.tasks.forEach(t => {
    const d = t.day || 1;
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(t);
  });

  let html = '';
  Object.keys(grouped).sort((a, b) => a - b).forEach(day => {
    const tasks = grouped[day];
    const dayDate = getPlanDayDate(plan.createdAt, parseInt(day));
    const dayLabel = dayDate.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    const weekday = dayDate.toLocaleDateString('zh-CN', { weekday: 'short' });

    html += `<div class="plan-day-block">
      <div class="pdb-header">Day ${day} · ${dayLabel} ${weekday} · ${tasks.length} 个任务</div>`;
    tasks.forEach(t => {
      const priColor = t.priority === 'P0' ? 'var(--p0)' : t.priority === 'P1' ? 'var(--p1)' : t.priority === 'P2' ? 'var(--p2)' : 'var(--p3)';
      html += `<div class="pdb-item">
        <span class="pdb-status">${t.status === 'done' ? '✅' : '⭕'}</span>
        <span class="pdb-name">${escHtml(t.name)}</span>
        <span class="pdb-prio" style="background:${priColor}">${t.priority}</span>
        <span class="pdb-date">${fmtDate(t.dueDate)}</span>
        <span class="pdb-remark">${escHtml(t.remark || '')}</span>
      </div>`;
    });
    html += `</div>`;
  });
  return html;
}

function getPlanDayDate(planCreatedAt, dayNum) {
  const base = new Date(planCreatedAt);
  base.setDate(base.getDate() + dayNum - 1);
  return base;
}

function togglePlan(planId) {
  const body = document.getElementById('planBody_' + planId);
  const icon = document.getElementById('planIcon_' + planId);
  if (!body || !icon) return;
  if (body.style.display === 'none') {
    body.style.display = 'block';
    icon.textContent = '▼';
  } else {
    body.style.display = 'none';
    icon.textContent = '▶';
  }
}

function deletePlan(planId) {
  if (!confirm('确定删除这个计划吗？任务列表中的对应任务不会受到影响。')) return;
  STORE.plans = STORE.plans.filter(p => p.id !== planId);
  saveStore();
  deletePlanFromCloud(planId);
  renderPlans();
}

// ==================== TODAY TASKS ====================
function getTodayDateStr() { return toDateInputValue(new Date()); }
function getTodayDate() { return startOfLocalDay(new Date()); }

function getTodayTasks() {
  const todayStr = getTodayDateStr();
  const today = getTodayDate();
  const items = [];

  // From task management: dueDate matches today
  STORE.tasks.forEach(t => {
    if (t.dueDate === todayStr) {
      items.push({
        id: t.id, name: t.name, priority: t.priority,
        source: '任务管理', sourceModule: 'tasks', sourceId: t.id,
        dueDate: t.dueDate, remark: t.remark || '',
        status: t.status, done: t.status === 'done', type: t.type,
      });
    }
  });

  // From plans: tasks whose day maps to today
  STORE.plans.forEach(plan => {
    if (!plan.tasks) return;
    const planStart = new Date(plan.createdAt);
    planStart.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today - planStart) / (1000 * 60 * 60 * 24));
    plan.tasks.forEach(t => {
      const taskDay = t.day || 1;
      if (taskDay - 1 === diffDays) {
        items.push({
          id: plan.id + '_' + t.name, name: t.name,
          priority: t.priority || 'P2', source: plan.name,
          sourceModule: 'plans', sourceId: plan.id + '_' + t.name,
          dueDate: t.dueDate || '', remark: t.remark || '',
          status: t.status || 'important', done: t.status === 'done',
          type: t.type || 'normal',
        });
      }
    });
  });

  return items;
}

function renderToday() {
  const items = getTodayTasks();
  const today = getTodayDate();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  const weekDay = weekDays[today.getDay()];
  const total = items.length;
  const done = items.filter(t => t.done).length;

  let html = '';

  // Header bar
  html += `<div class="today-header">
    <div class="today-date-box">
      <div class="today-date-num">${today.getDate()}</div>
      <div class="today-date-week">${today.getMonth() + 1}月 · 周${weekDay}</div>
    </div>
    <div class="today-stats">
      <div class="today-stat-item">
        <div class="today-stat-num">${total}</div>
        <div class="today-stat-label">今日任务</div>
      </div>
      <div class="today-stat-item">
        <div class="today-stat-num" style="color:var(--success);">${done}</div>
        <div class="today-stat-label">已完成</div>
      </div>
    </div>
    <div style="flex:1;text-align:right;font-size:13px;color:var(--text-secondary);">${dateStr} 周${weekDay}</div>
  </div>`;

  if (items.length === 0) {
    html += `<div class="empty-state">
      <div class="icon">☀️</div>
      <p>今天没有待办任务，放松一下吧</p>
    </div>`;
  } else {
    // Sort: incomplete first, then by priority
    const sorted = [...items].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const pOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
      return (pOrder[a.priority] || 2) - (pOrder[b.priority] || 2);
    });

    const typeIcon = (type) => type === 'timed' ? '📅' : type === 'recurring' ? '🔁' : '📝';
    const sourceClass = (m) => m === 'tasks' ? 'today-source-task' : 'today-source-plan';

    sorted.forEach(item => {
      html += `<div class="today-card ${item.done ? 'done' : ''}" data-source-module="${item.sourceModule}" data-source-id="${escHtml(item.sourceId)}" onclick="openTodayTaskDetail(this)">
        <div class="today-check" onclick="event.stopPropagation()">
          <input type="checkbox" ${item.done ? 'checked' : ''} onchange="toggleTodayTask(this)">
        </div>
        <span class="priority-dot ${item.priority.toLowerCase()}" style="flex-shrink:0;">${item.priority}</span>
        <div style="flex:1;min-width:0;">
          <div class="today-task-name">${typeIcon(item.type)} ${escHtml(item.name)}</div>
          ${item.remark ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">${escHtml(item.remark)}</div>` : ''}
        </div>
        <span class="today-source-tag ${sourceClass(item.sourceModule)}">${escHtml(item.source)}</span>
        ${item.dueDate ? `<span style="font-size:12px;color:var(--text-secondary);white-space:nowrap;">${item.dueDate}</span>` : ''}
      </div>`;
    });
  }

  $('#contentArea').innerHTML = html;
}

function toggleTodayTask(cb) {
  const card = cb.closest('.today-card');
  if (!card) return;
  const sourceModule = card.dataset.sourceModule;
  const sourceId = card.dataset.sourceId;
  const checked = cb.checked;

  if (sourceModule === 'tasks') {
    const task = STORE.tasks.find(t => t.id === sourceId);
    if (task) { task.status = checked ? 'done' : 'important'; saveStore(); syncTaskToCloud(task); }
  } else if (sourceModule === 'plans') {
    STORE.plans.forEach(plan => {
      plan.tasks.forEach(t => {
        if (plan.id + '_' + t.name === sourceId) {
          t.status = checked ? 'done' : 'important';
        }
      });
    });
    saveStore();
    // Sync updated plans
    STORE.plans.forEach(plan => syncPlanToCloud(plan));
  }
  updateBadges();
  renderToday();
}

function openTodayTaskDetail(el) {
  const sourceModule = el.dataset.sourceModule;
  const sourceId = el.dataset.sourceId;
  if (sourceModule === 'tasks') {
    openTaskDetail(sourceId);
  } else {
    switchModule('plans');
  }
}

// ==================== SETTINGS ====================
function renderSettings() {
  const prefs = getCurrentUserPrefs();
  const displayName = currentUser ? getUserDisplayName(currentUser) : '未登录';
  const avatarText = displayName.charAt(0).toUpperCase();
  const accountType = currentUser ? (currentUser.role === 'local' ? '本地账号' : currentUser.role === 'cloud' ? '云端账号' : '访客') : '未登录';
  const dataScope = currentUser ? (currentUser.role === 'cloud' ? '云端同步 + 本地缓存' : '当前浏览器本地保存') : '未登录本地缓存';
  const taskCount = STORE.tasks.length;
  const memoCount = STORE.memos.length;
  const planCount = STORE.plans.length;
  const notificationDisabled = typeof Notification === 'undefined';
  const html = `
    <div class="settings-grid">
      <aside class="settings-profile">
        <div class="avatar-lg">${escHtml(avatarText)}</div>
        <div class="name">${escHtml(displayName)}</div>
        <div class="meta">${accountType}</div>
        <div class="meta">任务 ${taskCount} · 备忘录 ${memoCount} · 计划 ${planCount}</div>
        <div class="settings-actions">
          ${currentUser ? '<button class="btn btn-secondary btn-sm" onclick="handleLogout()">退出登录</button>' : '<button class="btn btn-primary btn-sm" onclick="showLoginOverlay()">登录/注册</button>'}
        </div>
      </aside>
      <div class="settings-sections">
        <section class="settings-section">
          <h3>个人资料</h3>
          <div class="settings-row">
            <label for="settingsUsername">用户名</label>
            <input id="settingsUsername" type="text" value="${escHtml(currentUser?.username || '')}" ${currentUser ? '' : 'disabled'} placeholder="登录后可编辑">
          </div>
          <div class="settings-row">
            <label>账号类型</label>
            <input type="text" value="${accountType}" disabled>
          </div>
          <div class="settings-row">
            <label>数据范围</label>
            <input type="text" value="${dataScope}" disabled>
          </div>
          <div class="settings-actions">
            <button class="btn btn-primary" onclick="saveProfileSettings()" ${currentUser ? '' : 'disabled'}>保存资料</button>
            <span class="settings-save-msg" id="profileSaveMsg"></span>
          </div>
        </section>

        <section class="settings-section">
          <h3>账号安全</h3>
          <div class="settings-row">
            <label for="settingsCurrentPassword">当前密码</label>
            <input id="settingsCurrentPassword" type="password" placeholder="${currentUser?.role === 'local' ? '请输入当前密码' : '仅本地账号可修改'}" ${currentUser?.role === 'local' ? '' : 'disabled'}>
          </div>
          <div class="settings-row">
            <label for="settingsNewPassword">新密码</label>
            <input id="settingsNewPassword" type="password" placeholder="至少6个字符" ${currentUser?.role === 'local' ? '' : 'disabled'}>
          </div>
          <div class="settings-actions">
            <button class="btn btn-primary" onclick="savePasswordSettings()" ${currentUser?.role === 'local' ? '' : 'disabled'}>更新密码</button>
            <span class="settings-save-msg" id="passwordSaveMsg"></span>
          </div>
          <p class="settings-note">本地账号密码只保存在当前浏览器。更换浏览器或清理浏览器数据后，本地账号无法自动恢复。</p>
        </section>

        <section class="settings-section">
          <h3>使用偏好</h3>
          <div class="settings-row">
            <label for="settingsDefaultModule">默认打开</label>
            <select id="settingsDefaultModule">
              <option value="today" ${prefs.defaultModule === 'today' ? 'selected' : ''}>今日任务</option>
              <option value="tasks" ${prefs.defaultModule === 'tasks' ? 'selected' : ''}>任务管理</option>
              <option value="pomodoro" ${prefs.defaultModule === 'pomodoro' ? 'selected' : ''}>番茄钟</option>
              <option value="memos" ${prefs.defaultModule === 'memos' ? 'selected' : ''}>备忘录</option>
              <option value="plans" ${prefs.defaultModule === 'plans' ? 'selected' : ''}>计划管理</option>
            </select>
          </div>
          <div class="settings-row">
            <label for="settingsWeekStart">每周开始</label>
            <select id="settingsWeekStart">
              <option value="monday" ${prefs.weekStart === 'monday' ? 'selected' : ''}>周一</option>
              <option value="sunday" ${prefs.weekStart === 'sunday' ? 'selected' : ''}>周日</option>
            </select>
          </div>
          <div class="settings-row">
            <label for="settingsCompactMode">紧凑模式</label>
            <input class="settings-toggle" id="settingsCompactMode" type="checkbox" ${prefs.compactMode ? 'checked' : ''}>
          </div>
          <div class="settings-row">
            <label for="settingsNotifications">浏览器通知</label>
            <input class="settings-toggle" id="settingsNotifications" type="checkbox" ${prefs.notifications ? 'checked' : ''} ${notificationDisabled ? 'disabled' : ''}>
          </div>
          <div class="settings-actions">
            <button class="btn btn-primary" onclick="savePreferenceSettings()">保存偏好</button>
            <span class="settings-save-msg" id="prefsSaveMsg"></span>
          </div>
        </section>

        <section class="settings-section">
          <h3>数据管理</h3>
          <div class="settings-row">
            <label>当前数据</label>
            <input type="text" value="任务 ${taskCount}，备忘录 ${memoCount}，计划 ${planCount}" disabled>
          </div>
          <div class="settings-actions">
            <button class="btn btn-secondary" onclick="exportWorkspaceData()">导出数据</button>
            <button class="btn btn-danger" onclick="clearWorkspaceData()">清空工作台</button>
          </div>
          <p class="settings-note">导出会保存当前工作台的任务、备忘录、计划、番茄钟和偏好设置。</p>
        </section>
      </div>
    </div>`;
  $('#contentArea').innerHTML = html;
}

function showSettingsMessage(id, text, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? 'var(--danger)' : 'var(--success)';
  setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 2600);
}

async function saveProfileSettings() {
  try {
    const username = document.getElementById('settingsUsername').value;
    await updateCurrentUsername(username);
    renderSettings();
    showSettingsMessage('profileSaveMsg', '已保存');
  } catch (err) {
    showSettingsMessage('profileSaveMsg', err.message || '保存失败', true);
  }
}

async function savePasswordSettings() {
  try {
    const currentPassword = document.getElementById('settingsCurrentPassword').value;
    const newPassword = document.getElementById('settingsNewPassword').value;
    await updateCurrentPassword(currentPassword, newPassword);
    document.getElementById('settingsCurrentPassword').value = '';
    document.getElementById('settingsNewPassword').value = '';
    showSettingsMessage('passwordSaveMsg', '密码已更新');
  } catch (err) {
    showSettingsMessage('passwordSaveMsg', err.message || '更新失败', true);
  }
}

async function savePreferenceSettings() {
  const notificationsChecked = document.getElementById('settingsNotifications').checked;
  if (notificationsChecked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  const notificationsAllowed = notificationsChecked && typeof Notification !== 'undefined' && Notification.permission === 'granted';
  saveCurrentUserPrefs({
    defaultModule: document.getElementById('settingsDefaultModule').value,
    weekStart: document.getElementById('settingsWeekStart').value,
    compactMode: document.getElementById('settingsCompactMode').checked,
    notifications: notificationsAllowed
  });
  renderSettings();
  showSettingsMessage('prefsSaveMsg', notificationsChecked && !notificationsAllowed ? '通知权限未开启，其他偏好已保存' : '已保存', notificationsChecked && !notificationsAllowed);
}

// ==================== TASK BATCH OPERATIONS ====================
function getSelectedTaskIds() {
  const cbs = document.querySelectorAll('.task-checkbox:checked');
  return Array.from(cbs).map(cb => cb.dataset.id);
}

function updateBatchBar() {
  const selected = getSelectedTaskIds();
  const bar = document.getElementById('batchBar');
  const count = document.getElementById('batchCount');
  const selectAll = document.getElementById('selectAllTasks');
  if (!bar || !count) return;
  if (selected.length > 0) {
    bar.style.display = 'flex';
    count.textContent = '已选 ' + selected.length + ' 项';
  } else {
    bar.style.display = 'none';
  }
  if (selectAll) {
    const allCbs = document.querySelectorAll('.task-checkbox');
    selectAll.checked = allCbs.length > 0 && selected.length === allCbs.length;
  }
}

function toggleSelectAllTasks() {
  const selectAll = document.getElementById('selectAllTasks');
  const checked = selectAll ? selectAll.checked : false;
  document.querySelectorAll('.task-checkbox').forEach(cb => { cb.checked = checked; });
  updateBatchBar();
}

function batchMarkDone() {
  const ids = getSelectedTaskIds();
  if (ids.length === 0) return;
  STORE.tasks.forEach(t => { if (ids.includes(t.id)) t.status = 'done'; });
  saveStore();
  ids.forEach(id => { const t = STORE.tasks.find(x => x.id === id); if (t) syncTaskToCloud(t); });
  renderTasks();
}

function batchDeleteTasks() {
  const ids = getSelectedTaskIds();
  if (ids.length === 0) return;
  if (!confirm(`确定删除选中的 ${ids.length} 个任务吗？`)) return;
  STORE.tasks = STORE.tasks.filter(t => !ids.includes(t.id));
  saveStore();
  ids.forEach(id => deleteTaskFromCloud(id));
  updateBadges();
  renderTasks();
}

function batchChangePriority() {
  const sel = document.getElementById('batchPriority');
  const priority = sel ? sel.value : '';
  if (!priority) return;
  const ids = getSelectedTaskIds();
  if (ids.length === 0) return;
  STORE.tasks.forEach(t => { if (ids.includes(t.id)) t.priority = priority; });
  saveStore();
  ids.forEach(id => { const t = STORE.tasks.find(x => x.id === id); if (t) syncTaskToCloud(t); });
  sel.value = '';
  renderTasks();
}

// ==================== COMMON ====================
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ==================== INIT ====================
async function _continueInit() {
  if (supabaseReady) {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session && session.user) {
        currentUser = getCloudUserFromSession(session);
        clearLocalSession();
        showAppShell();
        updateSidebarForUser();
        setupCloudSync();
        await loadUserData();
        updateBadges();
        switchModule(getPreferredModule());
      } else {
        const localSession = restoreLocalSession();
        if (localSession) {
          currentUser = localSession;
          teardownCloudSync();
          showAppShell();
          updateSidebarForUser();
          await loadUserData();
          updateBadges();
          switchModule(getPreferredModule());
        } else {
          await enterLocalMode('today');
        }
      }
      supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          currentUser = getCloudUserFromSession(session);
          clearLocalSession();
          showAppShell();
          updateSidebarForUser();
          setupCloudSync();
          loadUserData().then(() => { updateBadges(); switchModule(getPreferredModule()); });
        } else if (event === 'SIGNED_OUT') {
          teardownCloudSync();
          enterLocalMode('today');
        }
      });
    } catch(e) {
      console.warn('Supabase 会话检查失败:', e.message);
      supabaseReady = false;
      const localSession = restoreLocalSession();
      if (localSession) {
        currentUser = localSession;
        showAppShell();
        updateSidebarForUser();
        await loadUserData();
        updateBadges();
        switchModule(getPreferredModule());
      } else {
        await enterLocalMode('today');
      }
    }
  } else {
    const localSession = restoreLocalSession();
    if (localSession) {
      currentUser = localSession;
      showAppShell();
      updateSidebarForUser();
      await loadUserData();
      updateBadges();
      switchModule(getPreferredModule());
    } else {
      await enterLocalMode('today');
    }
  }

  // Nav clicks
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchModule(item.dataset.module));
  });

}


var _testEl = document.createElement('div');
_testEl.style.cssText = 'background:lime;color:#000;padding:12px;text-align:center;font-size:18px;position:fixed;top:0;left:0;right:0;z-index:99999';
_testEl.textContent = 'SCRIPT BLOCK OK';
document.body.insertBefore(_testEl, document.body.firstChild);
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
let supabase = null;
let supabaseReady = false;
(function initSupabase() {
  var dbg = document.getElementById('_debugInfo');
  if (dbg) { dbg.textContent = 'IIFE started'; }
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    try {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
  // 无论 Supabase 是否就绪，都继续初始化
  _continueInit();
})();

// ==================== AUTH ====================
let authMode = 'login';
let currentUser = null; // { email, id }

function toggleLoginMode() {
  alert('DEBUG: toggleLoginMode invoked');
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

async function handleLogin() {
  alert('DEBUG: handleLogin invoked');
  var dbg = document.getElementById('_debugInfo');
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');

  if (!supabaseReady) {
    errorEl.textContent = '服务器连接失败，请先使用"访客体验"模式';
    errorEl.style.display = 'block'; return;
  }

  if (!email) {
    errorEl.textContent = '请输入邮箱地址';
    errorEl.style.display = 'block'; return;
  }
  if (!password || password.length < 6) {
    errorEl.textContent = '密码不能为空，且至少6个字符';
    errorEl.style.display = 'block'; return;
  }

  try {
    if (authMode === 'register') {
      const confirmPassword = document.getElementById('loginConfirmPassword').value;
      if (password !== confirmPassword) {
        errorEl.textContent = '两次输入的密码不一致';
        errorEl.style.display = 'block'; return;
      }
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.href }
      });
      if (error) throw error;
      if (data.user && data.session) {
        // Email auto-confirmed
        currentUser = { email: data.user.email, id: data.user.id };
        enterApp();
      } else {
        // Email confirmation may be required
        errorEl.textContent = '注册成功！请检查邮箱并确认验证链接后登录。';
        errorEl.style.display = 'block';
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentUser = { email: data.user.email, id: data.user.id };
      enterApp();
    }
  } catch (err) {
    errorEl.textContent = authMode === 'register' ? '注册失败：' + err.message : '登录失败：' + err.message;
    errorEl.style.display = 'block';
  }
}

function enterApp() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';
  updateSidebarForUser();
  loadUserData().then(() => {
    updateBadges();
    switchModule('today');
  });
}

async function handleLogout() {
  if (supabaseReady) { try { await supabase.auth.signOut(); } catch(e) {} }
  currentUser = null;
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'none';
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  if (document.getElementById('confirmPasswordGroup').style.display !== 'none') {
    document.getElementById('loginConfirmPassword').value = '';
  }
  document.getElementById('loginError').style.display = 'none';
  if (authMode === 'register') toggleLoginMode();
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
    pomodoro: STORE.pomodoro, aiCallsRemaining: currentUser._aiCallsRemaining ?? 1,
  };
  try { localStorage.setItem('guest_workspace_' + currentUser.id, JSON.stringify(ws)); } catch(e) {}
}

function enterAsGuest() {
  alert('DEBUG: enterAsGuest invoked');
  const guestId = 'guest_' + Date.now();
  currentUser = { id: guestId, role: 'guest', _aiCallsRemaining: 1 };
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';
  updateSidebarForGuest();
  STORE.tasks = [];
  STORE.memos = [];
  STORE.plans = [];
  STORE.pomodoro = { workMinutes: 25, breakMinutes: 5, todayCount: 0, todayDate: '' };
  saveGuestWorkspace();
  updateBadges();
  switchModule('today');
}

function updateSidebarForGuest() {
  document.getElementById('sidebarUser').textContent = '访客';
  document.getElementById('sidebarAvatar').textContent = '👤';
  const btn = document.getElementById('sidebarLogoutBtn');
  btn.textContent = '注册/登录';
  btn.className = 'guest-login-btn';
  btn.onclick = handleGuestLogout;
}

function updateSidebarForUser() {
  if (!currentUser || currentUser.role === 'guest') return;
  document.getElementById('sidebarUser').textContent = currentUser.email;
  document.getElementById('sidebarAvatar').textContent = currentUser.email.charAt(0).toUpperCase();
  const btn = document.getElementById('sidebarLogoutBtn');
  btn.textContent = '退出';
  btn.className = 'logout-btn';
  btn.onclick = handleLogout;
}

function handleGuestLogout() {
  if (confirm('访客数据仅保存在本地，关闭后无法恢复。确定退出吗？')) {
    if (currentUser && currentUser.id) {
      localStorage.removeItem('guest_workspace_' + currentUser.id);
    }
    currentUser = null;
    STORE.tasks = [];
    STORE.memos = [];
    STORE.plans = [];
    STORE.pomodoro = { workMinutes: 25, breakMinutes: 5, todayCount: 0, todayDate: '' };
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
  }
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

async function loadUserData() {
  if (!currentUser || !currentUser.id) return;

  // Guest mode: load from guest workspace only
  if (currentUser.role === 'guest') {
    const ws = getGuestWorkspace();
    if (ws) {
      STORE.tasks = ws.tasks || [];
      STORE.memos = ws.memos || [];
      STORE.plans = ws.plans || [];
      STORE.pomodoro = ws.pomodoro || { workMinutes: 25, breakMinutes: 5, todayCount: 0, todayDate: '' };
      currentUser._aiCallsRemaining = ws.aiCallsRemaining ?? 1;
    }
    return;
  }

  try {
    // Load from Supabase in parallel (only if ready)
    if (!supabaseReady) return;
    const [tasksRes, memosRes, plansRes, pomoRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', currentUser.id),
      supabase.from('memos').select('*').eq('user_id', currentUser.id),
      supabase.from('plans').select('*').eq('user_id', currentUser.id),
      supabase.from('pomodoro').select('*').eq('user_id', currentUser.id).eq('date', getTodayDateStr()).maybeSingle(),
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
  if (!currentUser || !currentUser.id || currentUser.role === 'guest') return;
  try {
    await supabase.from('tasks').upsert({
      id: task.id, user_id: currentUser.id, name: task.name, type: task.type,
      priority: task.priority, status: task.status, due_date: task.dueDate || null,
      remark: task.remark || '', created_at: task.createdAt, done_at: task.status === 'done' ? new Date().toISOString() : null,
      tags: task.tags || [], related_tasks: task.relatedTasks || [], attachments: task.attachments || []
    }, { onConflict: 'id' });
  } catch(e) { console.warn('syncTaskToCloud failed:', e); }
}

async function deleteTaskFromCloud(id) {
  if (!currentUser || !currentUser.id || currentUser.role === 'guest') return;
  try { await supabase.from('tasks').delete().eq('id', id).eq('user_id', currentUser.id); } catch(e) { console.warn('deleteTaskFromCloud failed:', e); }
}

async function syncMemoToCloud(memo) {
  if (!currentUser || !currentUser.id || currentUser.role === 'guest') return;
  try {
    await supabase.from('memos').upsert({
      id: memo.id, user_id: currentUser.id, title: memo.title, content: memo.content || '',
      tags: memo.tags || [], created_at: memo.createdAt, updated_at: memo.updatedAt || new Date().toISOString()
    }, { onConflict: 'id' });
  } catch(e) { console.warn('syncMemoToCloud failed:', e); }
}

async function deleteMemoFromCloud(id) {
  if (!currentUser || !currentUser.id || currentUser.role === 'guest') return;
  try { await supabase.from('memos').delete().eq('id', id).eq('user_id', currentUser.id); } catch(e) { console.warn('deleteMemoFromCloud failed:', e); }
}

async function syncPlanToCloud(plan) {
  if (!currentUser || !currentUser.id || currentUser.role === 'guest') return;
  try {
    await supabase.from('plans').upsert({
      id: plan.id, user_id: currentUser.id, plan_name: plan.name,
      tasks_json: plan.tasks || [], created_at: plan.createdAt, total_days: plan.totalDays || 0
    }, { onConflict: 'id' });
  } catch(e) { console.warn('syncPlanToCloud failed:', e); }
}

async function deletePlanFromCloud(id) {
  if (!currentUser || !currentUser.id || currentUser.role === 'guest') return;
  try { await supabase.from('plans').delete().eq('id', id).eq('user_id', currentUser.id); } catch(e) { console.warn('deletePlanFromCloud failed:', e); }
}

async function syncPomodoroToCloud() {
  if (!currentUser || !currentUser.id || currentUser.role === 'guest') return;
  try {
    await supabase.from('pomodoro').upsert({
      user_id: currentUser.id, today_count: STORE.pomodoro.todayCount,
      work_minutes: STORE.pomodoro.workMinutes, break_minutes: STORE.pomodoro.breakMinutes,
      date: getTodayDateStr()
    }, { onConflict: 'user_id,date' });
  } catch(e) { console.warn('syncPomodoroToCloud failed:', e); }
}

function genId() { return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }
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
  currentModule = module;
  $$('.nav-item').forEach(el => el.classList.remove('active'));
  $(`.nav-item[data-module="${module}"]`).classList.add('active');
  editingTaskId = null;
  editingMemoId = null;

  const titles = { today: '☀️ 今日任务', tasks: '📝 任务管理', memos: '📌 备忘录', pomodoro: '⏱ 番茄钟', ai: '🤖 AI助手', plans: '📋 计划管理' };
  const btnLabels = { today: '', tasks: '+ 新增任务', memos: '+ 新增备忘录', pomodoro: '', ai: '', plans: '' };
  $('#moduleTitle').textContent = titles[module];
  const addBtn = $('#headerAddBtn');
  addBtn.textContent = btnLabels[module];
  addBtn.style.display = (module === 'pomodoro' || module === 'today') ? 'none' : 'flex';
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

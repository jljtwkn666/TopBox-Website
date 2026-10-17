const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
// app.js contains a few legacy UI callbacks that are evaluated from a different
// module scope. Keep a global translation fallback available while the page is
// being hydrated after sign-in so those callbacks cannot interrupt login.
globalThis.t ??= text => String(text ?? '');
let user = null;
let knownPlanIds = new Set();
let pendingAvatar = '';
// These selections belong to the stable management views below.  Keeping them
// here avoids the old card renderers in app.js reusing stale selection state.
const stableArchiveSelection = new Set();
const stablePlanSelection = new Set();

const notify = (message, error = false) => {
  const toast = $('#appToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('visible');
  clearTimeout(window.__topboxToastTimer);
  window.__topboxToastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
};

const api = async (path, options = {}) => {
  const response = await fetch(path, { credentials: 'same-origin', headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '服务请求失败。');
  return data;
};
const isAdmin = () => user?.role === 'admin' || user?.role === 'super_admin';
const canEditRecords = () => isAdmin() || Boolean(user?.permissions?.records);
const canViewUpdates = () => isAdmin() || Boolean(user?.permissions?.updates);

const state = () => window.TopBoxApp?.state;
const rerender = () => {
  window.TopBoxApp?.renderSelectors?.();
  renderStableArchives();
  renderStablePlans();
};

function applyUserRecords(data) {
  const appState = state();
  if (!appState) throw new Error('页面初始化失败，请刷新后重试。');
  const quantities = new Map(appState.cargo.map(item => [item.id, { quantity: item.quantity, pieceQuantity: item.pieceQuantity }]));
  appState.containers = Array.isArray(data.containers) ? data.containers : [];
  appState.cargo = (Array.isArray(data.cargo) ? data.cargo : []).map(item => ({ ...item, ...(quantities.get(item.id) || {}), quantity: Math.max(1, +(quantities.get(item.id)?.quantity ?? item.quantity) || 1) }));
  const containerIds = new Set(appState.containers.map(item => item.id));
  const cargoIds = new Set(appState.cargo.map(item => item.id));
  appState.selectedContainers = new Set([...appState.selectedContainers].filter(id => containerIds.has(id)));
  appState.selectedCargo = new Set([...appState.selectedCargo].filter(id => cargoIds.has(id)));
  if (!appState.selectedContainers.size && appState.containers[0]) appState.selectedContainers.add(appState.containers[0].id);
  if (!appState.selectedCargo.size && appState.cargo[0]) appState.selectedCargo.add(appState.cargo[0].id);
  return appState;
}

function applyUser(next) {
  user = next;
  const name = user?.nickname || user?.username || '登录';
  $('#accountName').textContent = name;
  const avatar = user?.avatar || '';
  const avatarNode = $('#accountAvatar');
  avatarNode.replaceChildren();
  if (/^(data:image\/(png|jpe?g|webp);base64,|https:\/\/)/i.test(avatar)) {
    const image = document.createElement('img'); image.src = avatar; image.alt = ''; avatarNode.append(image);
  } else avatarNode.textContent = (name.trim()[0] || 'T').toUpperCase();
  $('#profileUsername').value = user?.username || '';
  $('#profileNickname').value = user?.nickname || '';
  pendingAvatar = avatar;
  const preview = $('#profileAvatarPreview');
  preview.src = avatar || ''; preview.classList.toggle('hidden', !avatar);
  $('#adminPanel').classList.toggle('hidden', !isAdmin());
  $('#newAccountRoleWrap').classList.toggle('hidden', user?.role !== 'super_admin');
  $('#archives').classList.toggle('records-readonly', !canEditRecords());
  const updatesButton = $('.nav-link[data-page="updates"]');
  updatesButton?.classList.toggle('permission-hidden', !canViewUpdates());
  $('#updates').classList.toggle('permission-hidden', !canViewUpdates());
  if (!canViewUpdates() && updatesButton?.classList.contains('active')) $('.nav-link[data-page="workspace"]')?.click();
}

async function loadBootstrap() {
  const data = await api('/api/bootstrap');
  const appState = applyUserRecords(data);
  appState.savedPlans = Array.isArray(data.plans) ? data.plans : [];
  knownPlanIds = new Set(appState.savedPlans.map(item => item.id));
  applyUser(data.user);
  requestAnimationFrame(() => { rerender(); requestAnimationFrame(rerender); });
}

async function refreshUserRecords() {
  if (!user) return;
  const data = await api('/api/shared/records');
  applyUserRecords(data);
  rerender();
}

async function syncUserRecords() {
  if (!state()) return;
  await api('/api/shared/records', { method: 'PUT', body: JSON.stringify({ containers: state().containers, cargo: state().cargo }) });
  await refreshUserRecords();
}

function bindSelectionTooltips() {
  const tooltip = $('#selectionNameTooltip');
  ['#selectedContainerCount', '#selectedCargoCount'].forEach(selector => {
    const badge = $(selector);
    if (!badge || badge.dataset.accountTooltipBound) return;
    badge.dataset.accountTooltipBound = 'true';
    badge.title = '';
    const selectionText = () => {
      const appState = state(); if (!appState) return '暂未选择';
      const records = badge.id === 'selectedContainerCount' ? appState.containers : appState.cargo;
      const ids = badge.id === 'selectedContainerCount' ? appState.selectedContainers : appState.selectedCargo;
      const names = records.filter(item => ids.has(item.id)).map(item => item.name);
      return names.join('、') || '暂未选择';
    };
    const show = event => {
      const rect = badge.getBoundingClientRect(), x = event?.clientX || rect.left + rect.width / 2, y = event?.clientY || rect.bottom;
      tooltip.textContent = selectionText();
      tooltip.style.left = `${Math.max(12, Math.min(window.innerWidth - 380, x + 12))}px`;
      tooltip.style.top = `${Math.min(window.innerHeight - 68, y + 12)}px`;
      tooltip.classList.add('visible');
    };
    badge.addEventListener('mouseenter', show);
    badge.addEventListener('mousemove', show);
    badge.addEventListener('focus', show);
    badge.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
    badge.addEventListener('blur', () => tooltip.classList.remove('visible'));
  });
}

function bindUtilizationPrecision() {
  const target = $('#utilizationPercent'); if (!target || target.dataset.precisionBound) return;
  target.dataset.precisionBound = 'true';
  const format = () => { const value = Number.parseFloat(target.textContent); const next = Number.isFinite(value) ? `${value.toFixed(2)}%` : '0.00%'; if (target.textContent !== next) target.textContent = next; };
  new MutationObserver(format).observe(target, { childList: true, characterData: true, subtree: true });
  format();
}

function openAccountPage() {
  $$('.nav-link').forEach(item => item.classList.remove('active'));
  $$('.page').forEach(item => item.classList.toggle('active-page', item.id === 'account'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (isAdmin()) renderUsers();
}

async function renderUsers() {
  if (!isAdmin()) return;
  try {
    const data = await api('/api/admin/users');
    $('#adminUsersList').innerHTML = data.users.map(account => {
      // Administrators always retain their management capabilities; feature
      // switches are intentionally scoped to ordinary user accounts.
      const editablePermissions = account.role === 'user';
      const editableProfile = account.role !== 'super_admin' && (user.role === 'super_admin' || account.role === 'user');
      const permissionControls = editablePermissions ? `<div class="permission-switches"><label><input data-user-permission="${escapeHtml(account.id)}" data-permission="records" type="checkbox" ${account.permissions?.records ? 'checked' : ''}> 档案维护</label><label><input data-user-permission="${escapeHtml(account.id)}" data-permission="updates" type="checkbox" ${account.permissions?.updates ? 'checked' : ''}> 更新日志</label></div>` : '';
      const roleControl = user.role === 'super_admin' && account.role !== 'super_admin' ? `<select data-user-role="${escapeHtml(account.id)}"><option value="user" ${account.role === 'user' ? 'selected' : ''}>普通用户</option><option value="admin" ${account.role === 'admin' ? 'selected' : ''}>管理员</option></select>` : '';
      const profileControls = editableProfile ? `<div class="user-edit-fields"><input data-user-username="${escapeHtml(account.id)}" value="${escapeHtml(account.username)}" aria-label="用户名"><input data-user-nickname="${escapeHtml(account.id)}" value="${escapeHtml(account.nickname || '')}" aria-label="昵称"><input data-user-password="${escapeHtml(account.id)}" type="password" placeholder="新密码（留空不修改）" aria-label="新密码"><button type="button" class="button secondary" data-save-user="${escapeHtml(account.id)}">保存用户</button></div>` : '';
      const deletable = account.role !== 'super_admin' && (user.role === 'super_admin' || account.role === 'user');
      const deleteControl = deletable ? `<button type="button" class="text-button delete-user" data-delete-user="${escapeHtml(account.id)}">删除用户</button>` : '';
      return `<div class="admin-user-row"><div><b>${escapeHtml(account.nickname || account.username)}</b><span> · ${escapeHtml(account.username)} · ${escapeHtml(account.role)}</span>${profileControls}${permissionControls}</div><div class="user-row-actions">${roleControl}${deleteControl}</div></div>`;
    }).join('');
    $$('[data-user-role]').forEach(select => select.addEventListener('change', async () => {
      const permissions = $$(`[data-user-permission="${select.dataset.userRole}"]`).reduce((value, input) => ({ ...value, [input.dataset.permission]: input.checked }), {});
      try { await api('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ id: select.dataset.userRole, role: select.value, permissions }) }); notify('权限已更新。'); renderUsers(); }
      catch (error) { notify(error.message, true); renderUsers(); }
    }));
    $$('[data-user-permission]').forEach(input => input.addEventListener('change', async () => {
      const permissions = $$(`[data-user-permission="${input.dataset.userPermission}"]`).reduce((value, item) => ({ ...value, [item.dataset.permission]: item.checked }), {});
      const role = $(`[data-user-role="${input.dataset.userPermission}"]`)?.value;
      try { await api('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ id: input.dataset.userPermission, ...(role ? { role } : {}), permissions }) }); notify('权限已更新。'); renderUsers(); }
      catch (error) { notify(error.message, true); renderUsers(); }
    }));
    $$('[data-save-user]').forEach(button => button.addEventListener('click', async () => {
      const id = button.dataset.saveUser, permissions = $$(`[data-user-permission="${id}"]`).reduce((value, item) => ({ ...value, [item.dataset.permission]: item.checked }), {}), role = $(`[data-user-role="${id}"]`)?.value;
      const password = $(`[data-user-password="${id}"]`)?.value || '';
      try { await api('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ id, ...(role ? { role } : {}), username: $(`[data-user-username="${id}"]`)?.value, nickname: $(`[data-user-nickname="${id}"]`)?.value, password, permissions }) }); notify('用户资料已更新。'); renderUsers(); }
      catch (error) { notify(error.message, true); }
    }));
    $$('[data-delete-user]').forEach(button => button.addEventListener('click', async () => {
      if (button.dataset.confirming !== 'true') { button.dataset.confirming = 'true'; button.textContent = '再次点击确认删除'; setTimeout(() => { if (button.dataset.confirming === 'true') { button.dataset.confirming = ''; button.textContent = '删除用户'; } }, 3000); return; }
      try { await api(`/api/admin/users/${encodeURIComponent(button.dataset.deleteUser)}`, { method: 'DELETE' }); notify('用户已删除。'); renderUsers(); }
      catch (error) { notify(error.message, true); }
    }));
  } catch (error) { notify(error.message, true); }
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]); }

// Management pages used to be rendered by several historical implementations
// in app.js.  These two renderers deliberately own the complete table markup,
// so a head/body column mismatch or an old card renderer cannot return on a
// refresh.
function stablePage(items, pageKey, sizeKey) {
  const appState = state();
  appState.ui ??= {};
  const allowed = [20, 30, 50, 100, 200, 500, 1000, 2000];
  const size = allowed.includes(+appState.ui[sizeKey]) ? +appState.ui[sizeKey] : 50;
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(Math.max(1, +appState.ui[pageKey] || 1), pages);
  appState.ui[sizeKey] = size; appState.ui[pageKey] = page;
  return { page, size, pages, rows: items.slice((page - 1) * size, page * size) };
}

function renderStablePager(hostId, pageData, total, pageKey, sizeKey, render) {
  const host = $("#" + hostId); if (!host) return;
  const first = total ? (pageData.page - 1) * pageData.size + 1 : 0;
  const last = Math.min(total, pageData.page * pageData.size);
  host.innerHTML = `<span>${first}-${last}/${total}</span><span class="stable-pager-controls"><button type="button" data-stable-page="prev" ${pageData.page <= 1 ? 'disabled' : ''}>‹</button><button type="button" data-stable-page="next" ${pageData.page >= pageData.pages ? 'disabled' : ''}>›</button><select data-stable-size>${[20, 30, 50, 100, 200, 500, 1000, 2000].map(size => `<option value="${size}" ${size === pageData.size ? 'selected' : ''}>${size}</option>`).join('')}</select></span>`;
  host.querySelector('[data-stable-page="prev"]')?.addEventListener('click', () => { state().ui[pageKey] -= 1; render(); });
  host.querySelector('[data-stable-page="next"]')?.addEventListener('click', () => { state().ui[pageKey] += 1; render(); });
  host.querySelector('[data-stable-size]')?.addEventListener('change', event => { state().ui[sizeKey] = +event.target.value; state().ui[pageKey] = 1; render(); });
}

function archiveVolume(record, isContainer) {
  const value = (+record.l || 0) * (+record.w || 0) * (+record.h || 0) / 1e9;
  return `${value.toFixed(4)} m³`;
}

function openStableArchiveEditor(record) {
  if (!record) return;
  const dialog = $('#archiveDialog');
  $('#recordKind').value = state().archive;
  $('#recordId').value = record.id;
  const map = { recordName: 'name', recordType: 'type', recordShape: 'shape', recordL: 'l', recordW: 'w', recordH: 'h', recordWeight: 'weight', recordPieces: 'pieces', recordReserve: 'reserve', recordPrice: 'price', recordColor: 'color' };
  Object.entries(map).forEach(([input, key]) => { const field = $('#' + input); if (field) field.value = record[key] ?? ''; });
  dialog?.showModal();
}

function renderStableArchives() {
  const appState = state(), rowsNode = $('#archiveRows');
  if (!appState || !rowsNode) return;
  const isContainer = appState.archive === 'containers';
  const records = Array.isArray(appState[appState.archive]) ? appState[appState.archive] : [];
  const query = ($('#archiveSearch')?.value || '').trim().toLowerCase();
  const filtered = records.filter(record => !query || `${record.name || ''}${record.type || ''}`.toLowerCase().includes(query));
  const pageData = stablePage(filtered, 'archivePage', 'archiveSize');
  const table = rowsNode.closest('table');
  if (!table) return;
  table.className = 'stable-data-table stable-archive-table';
  const columns = isContainer ? 9 : 10;
  const allSelected = filtered.length > 0 && filtered.every(record => stableArchiveSelection.has(record.id));
  const someSelected = filtered.some(record => stableArchiveSelection.has(record.id));
  table.innerHTML = `<thead><tr id="archiveTableHead"><th><input id="stableSelectAllArchive" type="checkbox" aria-label="选择全部"></th><th>序号</th><th>名称</th><th>类型</th><th>尺寸（长 × 宽 × 高）</th><th>容积</th><th>重量</th>${isContainer ? '' : '<th>小件数</th>'}<th>颜色</th><th>操作</th></tr></thead><tbody id="archiveRows">${pageData.rows.map((record, index) => `<tr><td><input data-stable-archive-select="${escapeHtml(record.id)}" type="checkbox" ${stableArchiveSelection.has(record.id) ? 'checked' : ''} aria-label="选择 ${escapeHtml(record.name)}"></td><td>${(pageData.page - 1) * pageData.size + index + 1}</td><td><b>${escapeHtml(record.name)}</b></td><td><span class="type-pill">${escapeHtml(record.type)}</span></td><td>${record.l} × ${record.w} × ${record.h} mm</td><td>${archiveVolume(record, isContainer)}</td><td>${+record.weight || 0} kg</td>${isContainer ? '' : `<td>${+record.pieces || 1} 件</td>`}<td><i class="color-pill" style="background:${escapeHtml(record.color || '#2563eb')}"></i></td><td><span class="row-actions"><button type="button" data-stable-edit-archive="${escapeHtml(record.id)}">编辑</button><button type="button" class="delete" data-stable-delete-archive="${escapeHtml(record.id)}">删除</button></span></td></tr>`).join('') || `<tr><td colspan="${columns}"><div class="empty-state">没有匹配的档案</div></td></tr>`}</tbody>`;
  const selectAll = $('#stableSelectAllArchive');
  if (selectAll) { selectAll.checked = allSelected; selectAll.indeterminate = someSelected && !allSelected; selectAll.addEventListener('change', event => { filtered.forEach(record => event.target.checked ? stableArchiveSelection.add(record.id) : stableArchiveSelection.delete(record.id)); renderStableArchives(); }); }
  $$('[data-stable-archive-select]').forEach(input => input.addEventListener('change', () => { input.checked ? stableArchiveSelection.add(input.dataset.stableArchiveSelect) : stableArchiveSelection.delete(input.dataset.stableArchiveSelect); renderStableArchives(); }));
  $$('[data-stable-edit-archive]').forEach(button => button.addEventListener('click', () => openStableArchiveEditor(records.find(record => record.id === button.dataset.stableEditArchive))));
  $$('[data-stable-delete-archive]').forEach(button => button.addEventListener('click', () => deleteArchivesDirect([button.dataset.stableDeleteArchive], button)));
  $('#containerTotal').textContent = appState.containers.length; $('#cargoTotal').textContent = appState.cargo.length;
  $('#archiveCount').textContent = `共 ${filtered.length} 条记录`;
  renderStablePager('archivePager', pageData, filtered.length, 'archivePage', 'archiveSize', renderStableArchives);
}

async function deleteArchivesDirect(ids, button) {
  if (!ids.length) return;
  if (button?.dataset.confirming !== 'true') {
    if (button) { button.dataset.confirming = 'true'; button.textContent = '再次点击确认删除'; setTimeout(() => { if (button.dataset.confirming === 'true') { button.dataset.confirming = ''; button.textContent = '删除'; } }, 3000); }
    else notify('再次点击“批量删除”确认删除所选档案。', true);
    return;
  }
  const appState = state(), remove = new Set(ids);
  appState[appState.archive] = appState[appState.archive].filter(record => !remove.has(record.id));
  ids.forEach(id => { stableArchiveSelection.delete(id); appState.selectedContainers.delete(id); appState.selectedCargo.delete(id); });
  try { await api('/api/shared/records', { method: 'PUT', body: JSON.stringify({ containers: appState.containers, cargo: appState.cargo }) }); await refreshUserRecords(); notify('档案已删除。'); }
  catch (error) { notify(error.message, true); await refreshUserRecords(); }
}

function renderStablePlans() {
  const appState = state(), host = $('#savedPlansList');
  if (!appState || !host) return;
  const plans = Array.isArray(appState.savedPlans) ? appState.savedPlans : [];
  const pageData = stablePage(plans, 'savedPlansPage', 'savedPlansSize');
  const allSelected = pageData.rows.length > 0 && pageData.rows.every(plan => stablePlanSelection.has(plan.id));
  const someSelected = pageData.rows.some(plan => stablePlanSelection.has(plan.id));
  const rows = pageData.rows.map((plan, index) => {
    const planItems = Array.isArray(plan.plans) ? plan.plans : [];
    const packages = planItems.reduce((sum, item) => sum + (Array.isArray(item.positions) ? item.positions.length : 0), 0);
    const pieces = planItems.reduce((sum, item) => sum + (Array.isArray(item.positions) ? item.positions.reduce((count, position) => count + (+position.pieces || 0), 0) : 0), 0);
    return `<tr><td><input data-stable-plan-select="${escapeHtml(plan.id)}" type="checkbox" ${stablePlanSelection.has(plan.id) ? 'checked' : ''} aria-label="选择 ${escapeHtml(plan.name)}"></td><td>${(pageData.page - 1) * pageData.size + index + 1}</td><td><b>${escapeHtml(plan.name)}</b></td><td>${escapeHtml(plan.createdAt || '')}</td><td>${planItems.length} 个容器方案</td><td>${packages} 包 / ${pieces.toLocaleString()} 件</td><td><span class="row-actions"><button type="button" data-stable-open-plan="${escapeHtml(plan.id)}">打开方案</button><button type="button" class="delete" data-stable-delete-plan="${escapeHtml(plan.id)}">删除</button></span></td></tr>`;
  }).join('');
  host.innerHTML = rows ? `<div class="stable-list-table-wrap"><table class="stable-data-table stable-plan-table"><thead><tr><th><input id="stableSelectAllPlans" type="checkbox" aria-label="选择全部"></th><th>序号</th><th>方案名称</th><th>保存时间</th><th>容器数量</th><th>装载数量</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty-state">还没有保存的装载方案。</div>';
  const selectAll = $('#stableSelectAllPlans');
  if (selectAll) { selectAll.checked = allSelected; selectAll.indeterminate = someSelected && !allSelected; selectAll.addEventListener('change', event => { pageData.rows.forEach(plan => event.target.checked ? stablePlanSelection.add(plan.id) : stablePlanSelection.delete(plan.id)); renderStablePlans(); }); }
  $$('[data-stable-plan-select]').forEach(input => input.addEventListener('change', () => { input.checked ? stablePlanSelection.add(input.dataset.stablePlanSelect) : stablePlanSelection.delete(input.dataset.stablePlanSelect); renderStablePlans(); }));
  $$('[data-stable-open-plan]').forEach(button => button.addEventListener('click', () => globalThis.openSavedPlan?.(button.dataset.stableOpenPlan)));
  $$('[data-stable-delete-plan]').forEach(button => button.addEventListener('click', () => deletePlansDirect([button.dataset.stableDeletePlan], button)));
  renderStablePager('savedPlansPager', pageData, plans.length, 'savedPlansPage', 'savedPlansSize', renderStablePlans);
}

async function deletePlansDirect(ids, button) {
  if (!ids.length) return;
  if (button?.dataset.confirming !== 'true') {
    if (button) { button.dataset.confirming = 'true'; button.textContent = '再次点击确认删除'; setTimeout(() => { if (button.dataset.confirming === 'true') { button.dataset.confirming = ''; button.textContent = '删除'; } }, 3000); }
    else notify('再次点击“批量删除”确认删除所选方案。', true);
    return;
  }
  try {
    await Promise.all(ids.map(id => api(`/api/plans/${encodeURIComponent(id)}`, { method: 'DELETE' })));
    const remove = new Set(ids); state().savedPlans = state().savedPlans.filter(plan => !remove.has(plan.id)); ids.forEach(id => { stablePlanSelection.delete(id); knownPlanIds.delete(id); });
    renderStablePlans(); notify('装载方案已删除。');
  } catch (error) { notify(error.message, true); await loadBootstrap(); }
}

async function compactAvatar(file) {
  if (!file || !/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error('请选择 PNG、JPG 或 WEBP 图片。');
  if (file.size > 8 * 1024 * 1024) throw new Error('头像图片不能超过 8 MB。');
  const source = await new Promise((resolve, reject) => { const image = new Image(), url = URL.createObjectURL(file); image.onload = () => { URL.revokeObjectURL(url); resolve(image); }; image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('头像图片无法读取。')); }; image.src = url; });
  const scale = Math.min(1, 360 / Math.max(source.naturalWidth, source.naturalHeight)), canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', .82);
}

let shareAction = null;
async function regenerateShareCode() {
  const appState = state(); if (!shareAction || !appState) return;
  const payload = shareAction.kind === 'plans' ? appState.savedPlans : appState[shareAction.kind];
  const input = $('#shareCodeInput');
  const preset = $('#shareExpiryPreset').value;
  const customHours = (+$('#shareCustomValue').value || 0) * ($('#shareCustomUnit').value === 'day' ? 24 : 1);
  const expiresInHours = preset === 'custom' ? customHours : +preset;
  if (!Number.isFinite(expiresInHours) || expiresInHours < 1 || expiresInHours > 8760) throw new Error('自定义有效时长需为 1–8760 小时。');
  $('#shareConfirm').disabled = true;
  $('#shareMessage').textContent = '正在随机生成可用分享码…';
  try {
    const result = await api('/api/shares', { method: 'POST', body: JSON.stringify({ kind: shareAction.kind, payload, expiresInHours }) });
    input.value = result.code; input.readOnly = true;
    $('#shareMessage').textContent = `分享码已生成：${result.code}\n有效至 ${new Date(result.expiresAt).toLocaleString('zh-CN')}。`;
  } finally { $('#shareConfirm').disabled = false; }
}
function openShareDialog(mode, kind) {
  const dialog = $('#shareDialog'), input = $('#shareCodeInput');
  shareAction = { mode, kind };
  $('#shareTitle').textContent = mode === 'create' ? '生成数据分享码' : '导入数据分享码';
  $('#shareMessage').textContent = mode === 'create' ? '正在自动生成有效期 30 天的分享码。' : '输入或粘贴其他用户提供的分享码。导入前会显示数据类别和数量。';
  input.value = ''; input.readOnly = mode === 'create';
  const appendMode = $('input[name="shareImportMode"][value="append"]'); if (appendMode) appendMode.checked = true;
  $('#shareImportMode').classList.add('hidden');
  $('#shareExpiryOptions').classList.toggle('hidden', mode !== 'create');
  $('#shareCustomExpiry').classList.add('hidden');
  $('#shareCopy').classList.toggle('hidden', mode !== 'create');
  $('#shareConfirm').textContent = mode === 'create' ? '随机生成' : '下一步';
  dialog.showModal();
  if (mode === 'create') regenerateShareCode().catch(error => { $('#shareMessage').textContent = error.message; });
}
async function handleShareDialog() {
  const appState = state(); if (!shareAction || !appState) return;
  const input = $('#shareCodeInput');
  if (shareAction.mode === 'create') {
    await regenerateShareCode(); return;
  }
  if (shareAction.mode === 'import') {
    const code = input.value.trim(); if (!code) throw new Error('请输入分享码。');
    const preview = await api(`/api/shares/${encodeURIComponent(code)}`);
    shareAction = { mode: 'confirm', code, kind: preview.kind };
    $('#shareMessage').textContent = `即将导入 ${preview.count} 条${preview.kind === 'plans' ? '装车方案' : preview.kind === 'containers' ? '容器档案' : '货物档案'}。确认后将加入当前账号的数据。`;
    input.readOnly = true; $('#shareImportMode').classList.remove('hidden'); $('#shareConfirm').textContent = '确认导入'; return;
  }
  const importMode = $('input[name="shareImportMode"]:checked')?.value || 'append';
  const result = await api(`/api/shares/${encodeURIComponent(shareAction.code)}/import`, { method: 'POST', body: JSON.stringify({ mode: importMode }) });
  $('#shareDialog').close(); await loadBootstrap(); notify(`已导入 ${result.count} 条数据。`);
}

function bindEvents() {
  $('#accountMenuButton').addEventListener('click', openAccountPage);
  $('#shareClose').addEventListener('click', () => $('#shareDialog').close());
  $('#shareCancel').addEventListener('click', () => $('#shareDialog').close());
  $('#shareCopy').addEventListener('click', async () => { const code = $('#shareCodeInput').value; if (!code) return; try { await navigator.clipboard.writeText(code); notify('分享码已复制。'); } catch { $('#shareCodeInput').select(); document.execCommand('copy'); notify('分享码已复制。'); } });
  $('#shareExpiryPreset').addEventListener('change', event => $('#shareCustomExpiry').classList.toggle('hidden', event.target.value !== 'custom'));
  $('#shareForm').addEventListener('submit', async event => { event.preventDefault(); try { await handleShareDialog(); } catch (error) { notify(error.message, true); } });
  $('#shareArchives').addEventListener('click', () => openShareDialog('create', state()?.archive === 'cargo' ? 'cargo' : 'containers'));
  $('#importArchiveShare').addEventListener('click', () => openShareDialog('import', 'archives'));
  $('#sharePlans').addEventListener('click', () => openShareDialog('create', 'plans'));
  $('#importPlanShare').addEventListener('click', () => openShareDialog('import', 'plans'));
  $('#toggleLoginPassword').addEventListener('click', () => { const input = $('#loginPassword'), visible = input.type === 'text'; input.type = visible ? 'password' : 'text'; $('#toggleLoginPassword').textContent = visible ? '◉' : '◉̸'; $('#toggleLoginPassword').setAttribute('aria-label', visible ? '显示密码' : '隐藏密码'); });
  $('#loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    $('#loginError').textContent = '';
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: $('#loginUsername').value, password: $('#loginPassword').value }) });
      applyUser(data.user); await loadBootstrap(); $('#authGate').classList.add('is-hidden'); notify('登录成功。');
    } catch (error) { $('#loginError').textContent = error.message; }
  });
  $('#logoutButton').addEventListener('click', async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch {} location.reload(); });
  $('#profileForm').addEventListener('submit', async event => {
    event.preventDefault();
    try { const data = await api('/api/profile', { method: 'PATCH', body: JSON.stringify({ nickname: $('#profileNickname').value, avatar: pendingAvatar }) }); applyUser(data.user); $('#profileAvatarFile').value = ''; notify('个人资料已保存。'); }
    catch (error) { notify(error.message, true); }
  });
  $('#profileAvatarFile').addEventListener('change', async event => { try { pendingAvatar = await compactAvatar(event.target.files?.[0]); const preview = $('#profileAvatarPreview'); preview.src = pendingAvatar; preview.classList.remove('hidden'); } catch (error) { event.target.value = ''; notify(error.message, true); } });
  $('#passwordForm').addEventListener('submit', async event => {
    event.preventDefault();
    try { await api('/api/profile/password', { method: 'PATCH', body: JSON.stringify({ oldPassword: $('#oldPassword').value, newPassword: $('#newPassword').value }) }); event.target.reset(); notify('密码已更新。'); }
    catch (error) { notify(error.message, true); }
  });
  $('#createUserForm').addEventListener('submit', async event => {
    event.preventDefault();
    try { await api('/api/admin/users', { method: 'POST', body: JSON.stringify({ username: $('#newAccountUsername').value, nickname: $('#newAccountNickname').value, password: $('#newAccountPassword').value, role: user?.role === 'super_admin' ? $('#newAccountRole').value : 'user' }) }); event.target.reset(); notify('账号已创建。'); renderUsers(); }
    catch (error) { notify(error.message, true); }
  });
  document.addEventListener('click', event => {
    if (!user) return;
    if (!canEditRecords() && event.target.closest('#archives [data-edit], #archives [data-delete], #addArchive, #bulkDeleteArchive, .file-button')) { event.preventDefault(); event.stopImmediatePropagation(); notify('未获档案维护权限。', true); return; }
  }, true);
  $$('.nav-link').forEach(button => button.addEventListener('click', () => setTimeout(() => loadBootstrap().catch(() => {}), 0), true));
  $('#archiveForm').addEventListener('submit', () => setTimeout(() => syncUserRecords().catch(error => notify(error.message, true)), 0));
  $('#importFile').addEventListener('change', () => setTimeout(() => syncUserRecords().catch(error => notify(error.message, true)), 300));
  // Run after the legacy listeners have changed their state, then restore the
  // single table implementation.  This is intentionally delegated because
  // the tables are replaced as users search, page, or switch archive type.
  $('.archive-tabs')?.addEventListener('click', () => setTimeout(renderStableArchives, 0));
  $('#archiveSearch')?.addEventListener('input', () => { state().ui.archivePage = 1; setTimeout(renderStableArchives, 0); });
  document.addEventListener('click', event => {
    const bulkArchives = event.target.closest('#bulkDeleteArchive');
    const bulkPlans = event.target.closest('#bulkDeletePlans');
    if (!bulkArchives && !bulkPlans) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const button = bulkArchives || bulkPlans;
    const selected = bulkArchives ? [...stableArchiveSelection] : [...stablePlanSelection];
    if (!selected.length) { notify(bulkArchives ? '请先选择要删除的档案。' : '请先选择要删除的方案。', true); return; }
    if (button.dataset.confirming !== 'true') {
      button.dataset.confirming = 'true'; button.dataset.originalText = button.textContent; button.textContent = '再次点击确认删除';
      setTimeout(() => { if (button.dataset.confirming === 'true') { button.dataset.confirming = ''; button.textContent = button.dataset.originalText || '批量删除'; } }, 3000);
      return;
    }
    button.dataset.confirming = ''; button.textContent = button.dataset.originalText || '批量删除';
    if (bulkArchives) deleteArchivesDirect(selected, { dataset: { confirming: 'true' } });
    else deletePlansDirect(selected, { dataset: { confirming: 'true' } });
  }, true);
  $('#appDialogForm').addEventListener('submit', () => setTimeout(async () => {
    const appState = state(); if (!appState) return;
    const candidate = appState.savedPlans.find(item => !knownPlanIds.has(item.id));
    if (!candidate) return;
    try { const remote = await api('/api/plans', { method: 'POST', body: JSON.stringify({ plan: candidate }) }); candidate.id = remote.id; knownPlanIds.add(remote.id); renderStablePlans(); notify('方案已安全保存。'); }
    catch (error) { notify(error.message, true); }
  }, 0));
  const syncPlans = () => setTimeout(() => {
    const appState = state(); if (!appState) return;
    const stillSaved = new Set(appState.savedPlans.map(item => item.id));
    [...knownPlanIds].filter(id => !stillSaved.has(id)).forEach(id => api(`/api/plans/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {}));
    knownPlanIds = stillSaved;
  }, 0);
  window.addEventListener('topbox:records-changed', () => syncUserRecords().catch(error => notify(error.message, true)));
  window.addEventListener('topbox:plans-changed', syncPlans);
}

async function start() {
  for (let attempt = 0; attempt < 50 && !window.TopBoxApp; attempt += 1) await new Promise(resolve => setTimeout(resolve, 50));
  bindEvents();
  try { await loadBootstrap(); $('#authGate').classList.add('is-hidden'); }
  catch { $('#authGate').classList.add('is-visible'); }
  bindUtilizationPrecision();
  bindSelectionTooltips();
  setInterval(bindSelectionTooltips, 700);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadBootstrap().catch(() => {}); });
}

start();


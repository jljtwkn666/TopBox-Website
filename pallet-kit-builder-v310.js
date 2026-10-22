import * as THREE from 'https://unpkg.com/three@0.162.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.162.0/examples/jsm/controls/OrbitControls.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const id = prefix => `${prefix}-${crypto.randomUUID?.().replaceAll('-', '').slice(0, 10) || Date.now().toString(36)}`;
let draft = null;
let selectedItemId = null;
let preview = null;

function appState() { return window.TopBoxApp?.state; }
function number(idValue, fallback = 0) { return Math.max(0, +(document.getElementById(idValue)?.value ?? fallback) || 0); }
function editable() { return !document.querySelector('#archives.records-readonly'); }
function freshDraft() {
  return { id: '', name: '新托盘套装', pallet: { l: 1200, w: 1000, h: 140, color: '#b97b45' }, items: [] };
}
function sourceCargo() { return (appState()?.cargo || []).filter(item => !item.kit); }
function itemFromCargo(source, overrides = {}) {
  const rotate = Boolean(overrides.rotate);
  return { id: id('kit-item'), sourceId: source.id, name: source.name, shape: source.shape === 'cylinder' ? 'cylinder' : 'box', color: source.color || '#2563eb', l: rotate ? +source.w : +source.l, w: rotate ? +source.l : +source.w, h: +source.h, weight: +source.weight || 0, pieces: Math.max(1, +source.pieces || 1), x: +overrides.x || 0, y: +overrides.y || 0, z: +overrides.z || 0, rotate };
}
function footprintValid(item, items = draft.items.filter(value => value.id !== item.id)) {
  const p = draft.pallet;
  if (item.x < 0 || item.y < 0 || item.z < 0 || item.x + item.l > p.l || item.y + item.w > p.w) return { ok: false, message: '货物超出托盘长或宽范围。' };
  const collision = items.some(other => item.x < other.x + other.l && item.x + item.l > other.x && item.y < other.y + other.w && item.y + item.w > other.y && item.z < other.z + other.h && item.z + item.h > other.z);
  return collision ? { ok: false, message: '货物与已有货物重叠，请调整坐标或高度。' } : { ok: true };
}
function ensureDialog() {
  if ($('#palletKitDialog')) return;
  document.body.insertAdjacentHTML('beforeend', `
  <dialog id="palletKitDialog" class="pallet-kit-dialog">
    <div class="pallet-kit-head"><div><p class="eyebrow">PALLET KIT DESIGNER</p><h2 id="palletKitTitle">托盘套装设计</h2><p>在托盘上布置货物；托盘长、宽为边界，高度可自由堆叠。</p></div><button class="icon-button" type="button" id="closePalletKit" aria-label="关闭">×</button></div>
    <div class="pallet-kit-layout">
      <aside class="pallet-kit-panel"><section><h3>套装与托盘参数</h3><label>套装名称<input id="kitName" maxlength="40" /></label><div class="pallet-kit-form-grid"><label>托盘长 mm<input id="kitLength" type="number" min="1" /></label><label>托盘宽 mm<input id="kitWidth" type="number" min="1" /></label><label>托盘高 mm<input id="kitHeight" type="number" min="1" /></label><label>托盘颜色<input id="kitColor" type="color" /></label></div><button type="button" class="button secondary" id="applyPalletSize">应用托盘参数</button></section>
      <section><h3>手动添加货物</h3><label>货物<select id="kitSource"></select></label><div class="pallet-kit-form-grid"><label>起点 X mm<input id="kitX" type="number" min="0" value="0" /></label><label>起点 Y mm<input id="kitY" type="number" min="0" value="0" /></label><label>起点 Z mm<input id="kitZ" type="number" min="0" value="0" /></label></div><label class="pallet-kit-check"><input id="kitRotate" type="checkbox" /> 托盘平面旋转 90°</label><button type="button" class="button primary" id="addKitItem">添加单件</button></section>
      <section><h3>参数化批量摆放</h3><div class="pallet-kit-form-grid"><label>长向数量<input id="kitGridX" type="number" min="1" value="1" /></label><label>宽向数量<input id="kitGridY" type="number" min="1" value="1" /></label><label>层数<input id="kitGridZ" type="number" min="1" value="1" /></label></div><button type="button" class="button secondary" id="addKitGrid">按参数添加</button></section></aside>
      <section class="pallet-kit-stage"><div class="pallet-kit-toolbar"><b>3D 托盘预览</b><span>左键点击货物可选中 · 拖动旋转 · 滚轮缩放</span><button type="button" class="button secondary" id="resetKitView">重置视角</button></div><div id="kitPreview" class="kit-preview"></div><p id="kitPreviewMessage" class="kit-preview-message">请选择左侧货物后添加。</p></section>
      <aside class="pallet-kit-panel kit-items-panel"><section><h3>已摆放货物 <span id="kitItemCount">0</span></h3><div id="kitItemList" class="kit-item-list"></div></section><section id="kitSelectedEditor" class="hidden"><h3>修改已选货物</h3><label>替换为<select id="kitReplaceSource"></select></label><div class="pallet-kit-form-grid"><label>X mm<input id="selectedX" type="number" min="0" /></label><label>Y mm<input id="selectedY" type="number" min="0" /></label><label>Z mm<input id="selectedZ" type="number" min="0" /></label></div><div class="kit-editor-actions"><button type="button" class="button secondary" id="rotateSelected">旋转 90°</button><button type="button" class="button secondary" id="updateSelected">应用修改</button><button type="button" class="button danger" id="deleteSelected">删除货物</button></div></section></aside>
    </div>
    <div class="pallet-kit-footer"><div><b id="kitSummary">0 件货物</b><span id="kitFootprint">托盘占地 0 × 0 mm</span></div><div><button type="button" class="button secondary" id="cancelPalletKit">取消</button><button type="button" class="button primary" id="savePalletKit">保存为套装货物</button></div></div>
  </dialog>`);
  $('#closePalletKit').addEventListener('click', close);
  $('#cancelPalletKit').addEventListener('click', close);
  $('#applyPalletSize').addEventListener('click', applyPallet);
  $('#addKitItem').addEventListener('click', addOne);
  $('#addKitGrid').addEventListener('click', addGrid);
  $('#resetKitView').addEventListener('click', () => { setPreviewCamera(); renderPreview(); });
  $('#kitItemList').addEventListener('click', event => { const button = event.target.closest('[data-kit-select]'); if (button) selectItem(button.dataset.kitSelect); });
  $('#rotateSelected').addEventListener('click', rotateSelected);
  $('#updateSelected').addEventListener('click', updateSelected);
  $('#deleteSelected').addEventListener('click', deleteSelected);
  $('#savePalletKit').addEventListener('click', saveKit);
}
function fillCargoChoices() {
  const current = $('#kitSource')?.value || '';
  const options = sourceCargo().map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${item.l} × ${item.w} × ${item.h} mm</option>`).join('');
  ['#kitSource', '#kitReplaceSource'].forEach(selector => { const node = $(selector); if (node) { node.innerHTML = options || '<option value="">请先建立单体货物</option>'; if ([...node.options].some(option => option.value === current)) node.value = current; } });
}
function syncDraftInputs() {
  $('#kitName').value = draft.name;
  $('#kitLength').value = draft.pallet.l;
  $('#kitWidth').value = draft.pallet.w;
  $('#kitHeight').value = draft.pallet.h;
  $('#kitColor').value = draft.pallet.color;
}
function applyPallet() {
  const next = { l: Math.max(1, number('kitLength', draft.pallet.l)), w: Math.max(1, number('kitWidth', draft.pallet.w)), h: Math.max(1, number('kitHeight', draft.pallet.h)), color: $('#kitColor').value || '#b97b45' };
  const invalid = draft.items.find(item => item.x + item.l > next.l || item.y + item.w > next.w);
  if (invalid) return message('新托盘尺寸会使现有货物超出范围，请先移动或删除该货物。', true);
  draft.name = $('#kitName').value.trim() || '未命名托盘套装'; draft.pallet = next; refresh();
}
function selectedSource() { return sourceCargo().find(item => item.id === $('#kitSource').value); }
function addOne() {
  const source = selectedSource(); if (!source) return message('请先选择一种单体货物。', true);
  const item = itemFromCargo(source, { x: number('kitX'), y: number('kitY'), z: number('kitZ'), rotate: $('#kitRotate').checked });
  const check = footprintValid(item); if (!check.ok) return message(check.message, true);
  draft.items.push(item); selectedItemId = item.id; refresh();
}
function addGrid() {
  const source = selectedSource(); if (!source) return message('请先选择一种单体货物。', true);
  const nx = Math.max(1, Math.floor(number('kitGridX', 1))), ny = Math.max(1, Math.floor(number('kitGridY', 1))), nz = Math.max(1, Math.floor(number('kitGridZ', 1)));
  const startX = number('kitX'), startY = number('kitY'), startZ = number('kitZ'), rotate = $('#kitRotate').checked;
  const base = itemFromCargo(source, { rotate }); const candidates = [];
  for (let z = 0; z < nz; z += 1) for (let y = 0; y < ny; y += 1) for (let x = 0; x < nx; x += 1) candidates.push(itemFromCargo(source, { rotate, x: startX + x * base.l, y: startY + y * base.w, z: startZ + z * base.h }));
  let added = 0; for (const item of candidates) { const check = footprintValid(item, [...draft.items, ...candidates.slice(0, added)]); if (check.ok) { draft.items.push(item); added += 1; } }
  if (!added) return message('没有可添加的货物；请检查托盘边界、坐标或堆叠位置。', true);
  selectedItemId = draft.items.at(-1).id; message(`已添加 ${added} 件货物。`); refresh();
}
function selectItem(itemId) {
  selectedItemId = itemId; const item = draft.items.find(value => value.id === itemId); if (!item) return;
  $('#kitSelectedEditor').classList.remove('hidden'); $('#kitReplaceSource').value = item.sourceId || ''; $('#selectedX').value = item.x; $('#selectedY').value = item.y; $('#selectedZ').value = item.z; refresh();
}
function rotateSelected() {
  const item = draft.items.find(value => value.id === selectedItemId); if (!item) return;
  const proposal = { ...item, l: item.w, w: item.l, rotate: !item.rotate }; const check = footprintValid(proposal); if (!check.ok) return message(check.message, true);
  Object.assign(item, proposal); refresh();
}
function updateSelected() {
  const item = draft.items.find(value => value.id === selectedItemId); if (!item) return;
  const source = sourceCargo().find(value => value.id === $('#kitReplaceSource').value);
  const replacement = source ? itemFromCargo(source, { x: number('selectedX'), y: number('selectedY'), z: number('selectedZ'), rotate: item.rotate }) : { ...item, x: number('selectedX'), y: number('selectedY'), z: number('selectedZ') };
  replacement.id = item.id; const check = footprintValid(replacement); if (!check.ok) return message(check.message, true);
  Object.assign(item, replacement); refresh();
}
function deleteSelected() { const index = draft.items.findIndex(value => value.id === selectedItemId); if (index < 0) return; draft.items.splice(index, 1); selectedItemId = null; $('#kitSelectedEditor').classList.add('hidden'); refresh(); }
function renderItemList() {
  $('#kitItemCount').textContent = draft.items.length;
  $('#kitItemList').innerHTML = draft.items.map((item, index) => `<button type="button" class="kit-item-row ${item.id === selectedItemId ? 'selected' : ''}" data-kit-select="${escapeHtml(item.id)}"><i style="background:${escapeHtml(item.color)}"></i><span><b>${index + 1}. ${escapeHtml(item.name)}</b><small>X ${item.x} · Y ${item.y} · Z ${item.z} mm${item.rotate ? ' · 已旋转' : ''}</small></span></button>`).join('') || '<div class="kit-empty">暂无货物。可从左侧手动添加或批量添加。</div>';
  const pieces = draft.items.reduce((sum, item) => sum + (+item.pieces || 0), 0), weight = draft.items.reduce((sum, item) => sum + (+item.weight || 0), 0);
  $('#kitSummary').textContent = `${draft.items.length} 包 · ${pieces.toLocaleString()} 件 · ${weight.toFixed(1)} kg`;
  $('#kitFootprint').textContent = `托盘占地 ${draft.pallet.l} × ${draft.pallet.w} mm`;
}
function ensurePreview() {
  const host = $('#kitPreview'); if (preview?.host === host) return;
  preview?.renderer?.dispose();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0xf3f7fb, 1); host.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100); const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.addEventListener('change', () => renderer.render(scene, camera));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5d7185, 2)); const light = new THREE.DirectionalLight(0xffffff, 2.2); light.position.set(7, 10, 8); scene.add(light);
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(); renderer.domElement.addEventListener('pointerdown', event => { const rect = renderer.domElement.getBoundingClientRect(); pointer.x = (event.clientX - rect.left) / rect.width * 2 - 1; pointer.y = -(event.clientY - rect.top) / rect.height * 2 + 1; raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects(scene.children, true).find(result => result.object.userData?.kitItemId); if (hit) selectItem(hit.object.userData.kitItemId); });
  preview = { host, renderer, scene, camera, controls }; const resize = () => { const w = host.clientWidth, h = host.clientHeight || 420; renderer.setSize(w, h, true); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.render(scene, camera); }; new ResizeObserver(resize).observe(host); resize();
}
function setPreviewCamera() { if (!preview) return; const { l, w } = draft.pallet, top = Math.max(draft.pallet.h, ...draft.items.map(item => draft.pallet.h + item.z + item.h)); const scale = 6 / Math.max(l, w, top); const center = new THREE.Vector3(l * scale / 2, top * scale / 2, w * scale / 2); const distance = 7.2; preview.camera.position.set(center.x + distance, center.y + distance * .72, center.z + distance); preview.controls.target.copy(center); preview.controls.update(); }
function renderPreview() {
  ensurePreview(); const { scene, renderer, camera } = preview; scene.children.filter(node => !node.isLight).forEach(node => scene.remove(node)); const { l, w, h, color } = draft.pallet, top = Math.max(h, ...draft.items.map(item => h + item.z + item.h)), scale = 6 / Math.max(l, w, top);
  const pallet = new THREE.Mesh(new THREE.BoxGeometry(l * scale, h * scale, w * scale), new THREE.MeshStandardMaterial({ color, roughness: .78 })); pallet.position.set(l * scale / 2, h * scale / 2, w * scale / 2); scene.add(pallet); const palletEdge = new THREE.LineSegments(new THREE.EdgesGeometry(pallet.geometry), new THREE.LineBasicMaterial({ color: 0x5d3924 })); palletEdge.position.copy(pallet.position); scene.add(palletEdge);
  draft.items.forEach(item => { const geometry = item.shape === 'cylinder' ? new THREE.CylinderGeometry(item.w * scale / 2, item.w * scale / 2, item.h * scale, 18) : new THREE.BoxGeometry(item.l * scale, item.h * scale, item.w * scale); const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: item.color, roughness: .55 })); mesh.position.set((item.x + item.l / 2) * scale, (h + item.z + item.h / 2) * scale, (item.y + item.w / 2) * scale); mesh.userData.kitItemId = item.id; scene.add(mesh); const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: item.id === selectedItemId ? 0x2563eb : 0x132b42, linewidth: item.id === selectedItemId ? 2 : 1 })); edge.position.copy(mesh.position); scene.add(edge); });
  const grid = new THREE.GridHelper(Math.max(l, w) * scale * 1.15, 12, 0x9eb1c5, 0xdde5ec); grid.position.set(l * scale / 2, -.012, w * scale / 2); scene.add(grid); setPreviewCamera(); renderer.render(scene, camera);
}
function refresh() { syncDraftInputs(); renderItemList(); renderPreview(); }
function message(text, error = false) { const node = $('#kitPreviewMessage'); if (node) { node.textContent = text; node.classList.toggle('error', error); } }
async function saveKit() {
  if (!editable()) return message('当前账户未获档案维护权限。', true);
  applyPallet(); if (!draft.items.length) return message('请至少在托盘上摆放一件货物后再保存。', true);
  const state = appState(), pallet = draft.pallet, height = Math.max(pallet.h, ...draft.items.map(item => pallet.h + item.z + item.h));
  const record = { id: draft.id || id('kit'), name: draft.name || '未命名托盘套装', type: '套装货物', shape: 'box', l: pallet.l, w: pallet.w, h: height, weight: draft.items.reduce((sum, item) => sum + (+item.weight || 0), 0), pieces: draft.items.reduce((sum, item) => sum + (+item.pieces || 0), 0), reserve: 0, price: 0, color: pallet.color, quantity: 1, pieceQuantity: draft.items.reduce((sum, item) => sum + (+item.pieces || 0), 0), kit: { version: 1, pallet: { ...pallet }, items: draft.items.map(item => ({ ...item })) } };
  const index = state.cargo.findIndex(item => item.id === record.id), previous = index >= 0 ? { ...state.cargo[index] } : null;
  if (index >= 0) state.cargo[index] = { ...state.cargo[index], ...record }; else state.cargo.push(record); state.selectedCargo.add(record.id);
  try { const response = await fetch('/api/shared/records', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ containers: state.containers, cargo: state.cargo }) }); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || '保存失败。'); window.dispatchEvent(new Event('topbox:records-changed')); window.TopBoxApp?.renderSelectors?.(); document.querySelector('.archive-tabs [data-archive="cargo"]')?.click(); message('已保存为套装货物，可直接在“选择货物”中勾选装载。'); setTimeout(close, 600); } catch (error) { const rollback = state.cargo.findIndex(item => item.id === record.id); if (previous && rollback >= 0) state.cargo[rollback] = previous; else if (rollback >= 0) state.cargo.splice(rollback, 1); message(error.message || '保存失败。', true); }
}
function open(record = null) { ensureDialog(); if (!editable()) return; draft = record?.kit ? { id: record.id, name: record.name, pallet: { ...record.kit.pallet }, items: record.kit.items.map(item => ({ ...item })) } : freshDraft(); selectedItemId = null; fillCargoChoices(); $('#palletKitTitle').textContent = record ? '修改托盘套装' : '托盘套装设计'; $('#palletKitDialog').showModal(); refresh(); message(record ? '可在 3D 预览中点击货物，再修改、替换、旋转或删除。' : '请选择左侧货物后添加。'); }
function close() { $('#palletKitDialog')?.close(); }
function refreshLaunch() { const button = $('#palletKitBuilder'), state = appState(); if (!button || !state) return; button.classList.toggle('hidden', state.archive !== 'cargo' || !editable()); }
function initialise() { ensureDialog(); $('#palletKitBuilder')?.addEventListener('click', () => open()); document.addEventListener('click', event => { if (event.target.closest('.nav-link[data-page="archives"], .archive-tabs [data-archive]')) setTimeout(refreshLaunch, 0); }); window.addEventListener('topbox:edit-pallet-kit', event => open(event.detail)); const archive = $('#archives'); if (archive) new MutationObserver(refreshLaunch).observe(archive, { attributes: true, childList: true, subtree: false }); refreshLaunch(); }

if (window.TopBoxApp) initialise(); else window.addEventListener('topbox-app-ready', initialise, { once: true });


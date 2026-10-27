import * as THREE from 'https://unpkg.com/three@0.162.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.162.0/examples/jsm/controls/OrbitControls.js';

// Compatibility layers below replace these strategies at runtime. Explicit
// bindings keep ES-module strict mode from aborting before the final owner is
// installed.
let buildExtraVehiclePlans;

const COLORS = ['#2563eb','#f97316','#10b981','#8b5cf6','#ef4444','#0891b2','#d97706','#ec4899'];
const STORAGE_KEY = 'vehicle-load-planner-state-v2';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const cubicMeters = (r) => (r.shape === 'cylinder' ? Math.PI * ((r.originalW ?? r.w) / 2) ** 2 * (r.originalH ?? r.h) : r.l * r.w * r.h) / 1e9;
const fmtVolume = (v) => `${v.toFixed(2)} m³`;
const fmtArchiveVolume = (v) => `${Number(v).toFixed(4)} m³`;
const getInitialState = () => ({
  containers: [
    {id:'c1',name:'9.6m 厢式货车',type:'车厢',shape:'box',l:9600,w:2400,h:2500,weight:6800,pieces:1,reserve:5,price:0,color:'#0f4c81'},
    {id:'c2',name:'7.6m 厢式货车',type:'车厢',shape:'box',l:7600,w:2300,h:2300,weight:5200,pieces:1,reserve:4,price:0,color:'#2563eb'},
    {id:'c3',name:'标准木箱',type:'箱子',shape:'box',l:1200,w:1000,h:900,weight:35,pieces:1,reserve:2,price:0,color:'#9a6b38'}
  ],
  cargo: [
    {id:'g1',name:'A 型纸箱（20件/包）',type:'单体货物',shape:'box',l:600,w:400,h:350,weight:12,pieces:20,reserve:0,price:86,color:'#2563eb',quantity:1},
    {id:'g2',name:'B 型托盘货',type:'套装货物',shape:'box',l:1200,w:1000,h:1100,weight:280,pieces:600,reserve:0,price:920,color:'#f97316',quantity:1},
    {id:'g3',name:'圆桶包装',type:'单体货物',shape:'cylinder',l:580,w:580,h:900,weight:46,pieces:1,reserve:0,price:330,color:'#10b981',quantity:1},
    {id:'g4',name:'C 型纸箱',type:'单体货物',shape:'box',l:500,w:350,h:300,weight:8.5,pieces:12,reserve:0,price:64,color:'#8b5cf6',quantity:1}
  ],
  selectedContainers: new Set(['c1']), selectedCargo: new Set(['g1','g2','g3']), archive:'containers', savedPlans:[], settings:{showCargoTooltip:true,showContainerDimensions:true,quantityInputMode:'bags'}, ui:{containerPage:1,cargoPage:1,containerSize:20,cargoSize:20,archivePage:1,archiveSize:50,savedPlansPage:1,savedPlansSize:50}, hiddenCargoIds:new Set(), plan:null
});
function loadState() {
  const fallback = getInitialState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.containers) || !Array.isArray(saved.cargo)) return fallback;
    const containerIds = new Set(saved.containers.map(x => x.id));
    const cargo = saved.cargo.map(x => ({...x,quantity: saved.version >= 3 ? Math.max(1,+x.quantity||1) : 1}));
    const cargoIds = new Set(cargo.map(x => x.id));
    return {
      ...fallback,
      containers: saved.containers,
      cargo,
      selectedContainers: new Set((saved.selectedContainers || []).filter(id => containerIds.has(id))),
      selectedCargo: new Set((saved.selectedCargo || []).filter(id => cargoIds.has(id))),
      archive: saved.archive === 'cargo' ? 'cargo' : 'containers',
      savedPlans: Array.isArray(saved.savedPlans) ? saved.savedPlans : [],
      settings: {showCargoTooltip: saved.settings?.showCargoTooltip !== false,showContainerDimensions:saved.settings?.showContainerDimensions !== false,language:saved.settings?.language||'zh-CN',quantityInputMode:saved.settings?.quantityInputMode==='pieces'?'pieces':'bags'},ui:{...fallback.ui,...(saved.ui||{})}
    };
  } catch { return fallback; }
}

const state = loadState();
// A lightweight bridge for companion modules loaded beside the compressed app.
// It is deliberately installed before optional UI enhancements run.
globalThis.__topboxStateV315 = state;
function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: 5,
    containers: state.containers,
    cargo: state.cargo,
    selectedContainers: [...state.selectedContainers],
    selectedCargo: [...state.selectedCargo],
    archive: state.archive,
    savedPlans: state.savedPlans,
    settings: state.settings,ui:state.ui
  }));
}

function uid(prefix) { return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`; }
const UI_TEXT={en:{'装载方案':'Load plans','档案管理':'Records','方案管理':'Saved plans','设置':'Settings','更新日志':'Release notes','重置':'Reset','生成最优方案':'Generate plan','选择容器':'Select containers','选择货物':'Select cargo','管理档案':'Manage records','保存方案':'Save plan','导出方案图片':'Export image','导出 PDF':'Export PDF','打印方案':'Print plan','装载优化结果':'Loading results','装载明细':'Loaded cargo','未装载':'Unloaded','未装载空间':'Free spaces','全部容器装载方案':'All container plans','容器与货物档案':'Container & cargo records','显示设置':'Display settings','更新日志':'Release notes'},th:{'装载方案':'แผนบรรทุก','档案管理':'ข้อมูลสินค้า','方案管理':'แผนที่บันทึก','设置':'ตั้งค่า','更新日志':'บันทึกการอัปเดต','重置':'รีเซ็ต','生成最优方案':'สร้างแผนที่เหมาะสม','选择容器':'เลือกภาชนะ','选择货物':'เลือกสินค้า','管理档案':'จัดการข้อมูล','保存方案':'บันทึกแผน','导出方案图片':'ส่งออกรูปภาพ','导出 PDF':'ส่งออก PDF','打印方案':'พิมพ์แผน','装载优化结果':'ผลการจัดบรรทุก','装载明细':'รายละเอียดการบรรทุก','未装载':'ไม่ได้บรรทุก','未装载空间':'พื้นที่ว่าง','全部容器装载方案':'แผนสำหรับทุกภาชนะ','容器与货物档案':'ข้อมูลภาชนะและสินค้า','显示设置':'ตั้งค่าการแสดงผล'}};
function applyLanguage(){const lang=state.settings.language||'zh-CN';$('#languageSelect').value=lang;document.documentElement.lang=lang;const dict=UI_TEXT[lang]||{};$$('button,h1,h2,h3,dt').forEach(el=>{const key=el.dataset.i18n||el.textContent.trim();if(UI_TEXT.en[key]||UI_TEXT.th[key]||key in dict){el.dataset.i18n=key;el.textContent=dict[key]||key;}});}
function usableVolume(c) { return cubicMeters(c) * (1 - (+c.reserve || 0) / 100); }
function containerLabel(c) { return `${c.l} × ${c.w} × ${c.h} mm · ${fmtVolume(usableVolume(c))} 可用`; }
function cargoLabel(g) { return `${g.l} × ${g.w} × ${g.h} mm · ${cubicMeters(g).toFixed(3)} m³ · ${g.pieces || 1} 件/包`; }

function renderSelectors() {
  const containerQuery=$('#containerSearch')?.value.trim().toLowerCase()||'',cargoQuery=$('#cargoSearch')?.value.trim().toLowerCase()||'';
  const matches=(item,query)=>!query||query.split(',').map(v=>v.trim()).filter(Boolean).every(term=>`${item.name}${item.type}`.toLowerCase().includes(term));
  const containers=state.containers.filter(c=>matches(c,containerQuery)),cargo=state.cargo.filter(g=>matches(g,cargoQuery));
  const slice=(items,pageKey,sizeKey)=>{const size=Math.max(1,+state.ui[sizeKey]||20),pages=Math.max(1,Math.ceil(items.length/size));state.ui[pageKey]=Math.min(state.ui[pageKey],pages);return {rows:items.slice((state.ui[pageKey]-1)*size,state.ui[pageKey]*size),pages,size};};const cp=slice(containers,'containerPage','containerSize'),gp=slice(cargo,'cargoPage','cargoSize');
  $('#containerList').innerHTML = cp.rows.map(c => `<label class="select-row ${state.selectedContainers.has(c.id) ? 'checked':''}"><input class="container-check" data-id="${c.id}" type="checkbox" ${state.selectedContainers.has(c.id) ? 'checked':''}><span class="color-square" style="background:${c.color}"></span><span class="record-main"><b>${c.name}</b><small>${containerLabel(c)}</small></span><span class="record-extra">${c.type}</span></label>`).join('') || '<div class="empty-state">没有匹配的容器</div>';
  $('#cargoList').innerHTML = gp.rows.map(g => `<label class="select-row ${state.selectedCargo.has(g.id) ? 'checked':''}"><input class="cargo-check" data-id="${g.id}" type="checkbox" ${state.selectedCargo.has(g.id) ? 'checked':''}><span class="color-square" style="background:${g.color}"></span><span class="record-main"><b>${g.name}</b><small>${cargoLabel(g)}</small></span><span class="quantity"><input class="cargo-quantity" data-id="${g.id}" type="number" min="1" value="${g.quantity || 1}" aria-label="${g.name} 数量"><span>包</span></span></label>`).join('') || '<div class="empty-state">没有匹配的货物</div>';
  renderListPager('containerPager',cp,containers.length,'containerPage','containerSize');renderListPager('cargoPager',gp,cargo.length,'cargoPage','cargoSize');
  $$('.container-check').forEach(x => x.addEventListener('change', () => { x.checked ? state.selectedContainers.add(x.dataset.id) : state.selectedContainers.delete(x.dataset.id); persistState(); renderSelectors(); }));
  $$('.cargo-check').forEach(x => x.addEventListener('change', () => { x.checked ? state.selectedCargo.add(x.dataset.id) : state.selectedCargo.delete(x.dataset.id); persistState(); renderSelectors(); }));
  $$('.cargo-quantity').forEach(x => x.addEventListener('change', () => { const g = state.cargo.find(v => v.id === x.dataset.id); g.quantity = Math.max(1, +x.value || 1); x.value = g.quantity; persistState(); }));
}
function renderListPager(id,data,total,pageKey,sizeKey){const host=$('#'+id),options=[20,30,50,100,200,500,1000,2000].map(v=>`<option ${data.size===v?'selected':''}>${v}</option>`).join('');host.innerHTML=`<span>${total?`${(state.ui[pageKey]-1)*data.size+1}-${Math.min(state.ui[pageKey]*data.size,total)}/${total}`:'0/0'}</span><button data-page="${pageKey}" data-step="-1" ${state.ui[pageKey]<=1?'disabled':''}>‹</button><button data-page="${pageKey}" data-step="1" ${state.ui[pageKey]>=data.pages?'disabled':''}>›</button><select data-size="${sizeKey}">${options}<option value="custom">自定义</option></select>`;$$('[data-page]',host).forEach(b=>b.addEventListener('click',()=>{state.ui[b.dataset.page]+=+b.dataset.step;renderSelectors();}));$('[data-size]',host).addEventListener('change',e=>{const val=e.target.value;if(val==='custom'){const n=prompt('每页条数（1-5000）',data.size);if(n)state.ui[sizeKey]=Math.max(1,Math.min(5000,+n||data.size));}else state.ui[sizeKey]=+val;state.ui[pageKey]=1;persistState();renderSelectors();});}

function activeMode() { return $('input[name="mode"]:checked').value; }
function expandRequested(selected, c, mode) {
  const result = [];
  const primary = selected.map(g => ({...g, wanted: Math.max(1, +g.quantity || 1)}));
  const capacityFor = (g) => Math.max(1, Math.ceil(usableVolume(c) / cubicMeters(g)) + 1);
  if (c.type !== '托盘') { if (mode === 'full') { primary.forEach(g => g.wanted = capacityFor(g)); }
  if (mode === 'ratio') { const total = primary.reduce((s,g) => s + cubicMeters(g) * g.wanted, 0); const multiplier = total ? usableVolume(c) / total : 0; primary.forEach(g => g.wanted = Math.max(1, Math.floor(g.wanted * multiplier))); }
  if (mode === 'lastFull' && primary.length) { primary[primary.length - 1].wanted = capacityFor(primary[primary.length - 1]); } }
  primary.forEach(g => { for (let i=0;i<g.wanted;i++) result.push(g); });
  return result.sort((a,b) => cubicMeters(b) - cubicMeters(a));
}
function packContainer(c, selected, mode, fillPriority='inside') {
  let positions = []; const unplaced = [], placedCount = new Map(), candidates = expandRequested(selected, c, mode),isPallet=c.type==='托盘',baseZ=isPallet?Math.max(1,c.h):0;
  const spaces = [{x:0,y:0,z:baseZ,l:c.l,w:c.w,h:isPallet?Number.POSITIVE_INFINITY:c.h}];
  const rotationsFor = item => {
    const values=item.kit ? [[item.l,item.w,item.h,'kitFixed']] : item.shape==='cylinder' ? [[item.l,item.w,item.h,'upright'],[item.h,item.w,item.l,'lyingLength'],[item.l,item.h,item.w,'lyingWidth']] : [[item.l,item.w,item.h,'longitudinal'],[item.w,item.l,item.h,'transverse'],[item.l,item.h,item.w,'onSideLength'],[item.h,item.l,item.w,'onSideWidth'],[item.w,item.h,item.l,'verticalLength'],[item.h,item.w,item.l,'verticalWidth']];
    return [...new Map(values.map(rotation=>[rotation.slice(0,3).join('×'),rotation])).values()];
  };
  const hasCollision = (x,y,z,l,w,h) => positions.some(p=>x<p.x+p.l&&x+l>p.x&&y<p.y+p.w&&y+w>p.y&&z<p.z+p.h&&z+h>p.z);
  for (const item of candidates) {
    const rotations=rotationsFor(item); let best=null;
    // Keep lower and tighter spaces first.  We stop after the best rotation for the
    // first suitable space, which avoids repeatedly scanning every historical gap.
    const ordered=spaces.map((space,i)=>({space,i})).sort((a,b)=>{
      if(mode==='specified'){
        /* 指定数量的三种优先铺满方向：里面=W×H，侧面=L×H，底面=L×W。 */
        if(fillPriority==='side')return a.space.y-b.space.y||a.space.z-b.space.z||a.space.x-b.space.x||(a.space.l*a.space.w)-(b.space.l*b.space.w);
        if(fillPriority==='bottom')return a.space.z-b.space.z||a.space.y-b.space.y||a.space.x-b.space.x||(a.space.l*a.space.w)-(b.space.l*b.space.w);
        return a.space.x-b.space.x||a.space.z-b.space.z||a.space.y-b.space.y||(a.space.l*a.space.w)-(b.space.l*b.space.w);
      }
      return a.space.z-b.space.z||(a.space.l*a.space.w)-(b.space.l*b.space.w)||a.space.y-b.space.y||a.space.x-b.space.x;
    });
    for(const {space,i} of ordered){
      let localBest=null;
      for (const [l,w,h,rotation] of rotations) {
        const within=space.x+l<=c.l&&space.y+w<=c.w&&(isPallet||space.z+h<=c.h);
        if(l>space.l||w>space.w||h>space.h||!within||hasCollision(space.x,space.y,space.z,l,w,h)) continue;
        const footprintWaste=(space.l*space.w)-(l*w),heightWaste=isPallet?0:Math.max(0,space.h-h),score=footprintWaste*1e4+heightWaste*100;
        if(!localBest||score<localBest.score)localBest={i,l,w,h,rotation,score};
      }
      if(localBest){best=localBest;break;}
    }
    let placed=null;
    if(best){
      const {i,l,w,h,rotation}=best,space=spaces[i],isCylinder=item.shape==='cylinder';
      const orientation=isCylinder?(rotation==='upright'?'竖放（圆柱直立）':rotation==='lyingLength'?'横放（轴向车长）':'横放（轴向车宽）'):({longitudinal:'纵向（长边沿车长）',transverse:'横向（长边沿车宽）',onSideLength:'侧放（长边沿车长）',onSideWidth:'侧放（长边沿车宽）',verticalLength:'竖放（长边竖直）',verticalWidth:'竖放（宽边竖直）'}[rotation]||'自动旋转');
      placed={...item,originalW:item.w,originalH:item.h,l,w,h,cylinderMode:rotation,x:space.x,y:space.y,z:space.z,orientation,spaceIndex:i};
    }
    if (placed) {
      const space=spaces.splice(placed.spaceIndex,1)[0]; delete placed.spaceIndex; positions.push(placed);
      [{x:space.x+placed.l,y:space.y,z:space.z,l:space.l-placed.l,w:space.w,h:space.h},{x:space.x,y:space.y+placed.w,z:space.z,l:placed.l,w:space.w-placed.w,h:space.h},{x:space.x,y:space.y,z:space.z+placed.h,l:placed.l,w:placed.w,h:space.h}].filter(s=>s.l>0&&s.w>0&&s.h>0).forEach(s=>spaces.push(s));
      placedCount.set(item.id,(placedCount.get(item.id)||0)+1);
    } else if (mode === 'specified') { unplaced.push(item); }
  }
  const invalid=positions.filter(p=>p.x<0||p.y<0||p.z<baseZ||p.x+p.l>c.l||p.y+p.w>c.w||(!isPallet&&p.z+p.h>c.h));if(invalid.length){if(mode==='specified')invalid.forEach(p=>unplaced.push(p));positions=positions.filter(p=>!invalid.includes(p));placedCount.clear();positions.forEach(p=>placedCount.set(p.id,(placedCount.get(p.id)||0)+1));}
  const loadedVolume=positions.reduce((s,p)=>s+cubicMeters(p),0), available=usableVolume(c);
  return {container:c,positions,unplaced,placedCount,pallet:isPallet,freeSpaces:spaces.filter(s=>s.l>0&&s.w>0&&s.h>0).sort((a,b)=>isPallet?b.l*b.w-a.l*a.w:b.l*b.w*b.h-a.l*a.w*a.h),loadedVolume,available,utilization:Math.min(100,loadedVolume/available*100)};
}
function generatePlan() {
  const containers = state.containers.filter(c => state.selectedContainers.has(c.id));
  const cargo = state.cargo.filter(g => state.selectedCargo.has(g.id));
  if (!containers.length || !cargo.length) { alert('请至少选择一个容器和一种货物。'); return; }
  state.plan = {plans: containers.map(c => packContainer(c,cargo,activeMode())),active:0,mode:activeMode()};
  $('#results').classList.remove('hidden'); renderPlan(); $('#results').scrollIntoView({behavior:'smooth',block:'start'});
}
function resetWorkspace(){
  const defaults=getInitialState(),savedPlans=state.savedPlans,settings=state.settings;Object.assign(state,defaults);state.savedPlans=savedPlans;state.settings=settings;
  $('#containerSearch').value='';$('#cargoSearch').value='';$('input[name="mode"][value="specified"]').checked=true;$$('.mode-option').forEach(label=>label.classList.toggle('selected',label.querySelector('input').checked));$('#results').classList.add('hidden');hideCargoHover();persistState();renderSelectors();renderArchives();renderSavedPlans();alert('已恢复初始化页面。');
}
function actualUsedVolume(plan){const records=new Map((state?.cargo||[]).map(item=>[item.id,item]));return Array.isArray(plan?.positions)?plan.positions.reduce((sum,item)=>sum+cubicMeters(records.get(item.id)||item),0):0;}
function actualAvailableVolume(plan){return plan?.container?usableVolume(plan.container):0;}
function actualUtilization(plan){const available=actualAvailableVolume(plan),used=actualUsedVolume(plan);return available>0?Math.max(0,Math.min(100,used/available*100)):0;}
function planTotals(plan){return {packages:plan.positions.length,pieces:plan.positions.reduce((sum,p)=>sum+(+p.pieces||0),0),weight:plan.positions.reduce((sum,p)=>sum+(+p.weight||0),0)};}
function renderContainerPlans(){
  if(!state.plan)return;
  $('#planCountBadge').textContent=`${state.plan.plans.length} 个方案`;
  $('#containerPlans').innerHTML=state.plan.plans.map((plan,index)=>{
    const totals=planTotals(plan),details=state.cargo.filter(g=>state.selectedCargo.has(g.id)).map(g=>{const count=plan.placedCount.get(g.id)||0;return count?`<li><b>${g.name}</b><span>${count} 包 / ${(count*(+g.pieces||0)).toLocaleString()} 件</span><small>${placementDetail(g,plan)}</small></li>`:'';}).join('')||'<li>无可装载货物</li>';
    return `<article class="container-plan-card ${index===state.plan.active?'active':''}"><div class="container-plan-head"><div><p>容器方案 ${index+1}</p><h3>${plan.container.name}</h3><small>${plan.container.l} × ${plan.container.w} × ${plan.container.h} mm</small></div><button class="button secondary" data-activate-plan="${index}">${index===state.plan.active?'正在查看':'查看 3D 方案'}</button></div><div class="container-metrics"><span><b>${actualUtilization(plan).toFixed(2)}%</b>利用率</span><span><b>${totals.packages} 包</b>${totals.pieces.toLocaleString()} 件</span><span><b>${fmtVolume(actualUsedVolume(plan))}</b>已用容积</span><span><b>${totals.weight.toFixed(0)} kg</b>总重量</span></div><ul class="container-cargo-details">${details}</ul></article>`;
  }).join('');
  $$('[data-activate-plan]').forEach(button=>button.addEventListener('click',()=>{state.plan.active=+button.dataset.activatePlan;renderPlan();$('#results').scrollIntoView({behavior:'smooth',block:'start'});}));
}
function renderPlan() {
  const plan = state.plan.plans[state.plan.active], c=plan.container;
  $('#activeContainerName').textContent = c.name;
  $('#activeContainerSpecs').textContent = `${c.l} × ${c.w} × ${c.h} mm · 合理装载 ${fmtVolume(plan.available)}`;
  $('#resultDescription').textContent = `已生成 ${state.plan.plans.length} 个容器方案；当前展示 ${state.plan.active + 1} / ${state.plan.plans.length}。`;
  const percent=Math.max(0,Math.min(100,+plan.utilization||0)); $('#utilizationPercent').textContent=`${percent.toFixed(2)}%`; $('#utilizationRing').style.background=`conic-gradient(var(--blue) ${percent*3.6}deg,#eaf0f6 0deg)`;
  const totalPieces=plan.positions.reduce((s,x)=>s+(+x.pieces||0),0);
  $('#availableVolume').textContent=fmtVolume(plan.available); $('#usedVolume').textContent=fmtVolume(plan.loadedVolume); $('#loadedCount').textContent=`${plan.positions.length} 包 · ${totalPieces.toLocaleString()} 件`; $('#totalWeight').textContent=`${plan.positions.reduce((s,x)=>s+(+x.weight||0),0).toFixed(0)} kg`;
  const details = state.cargo.filter(g=>state.selectedCargo.has(g.id)).map(g=>({g,count:plan.placedCount.get(g.id)||0}));
  $('#loadedBadge').textContent=`${plan.positions.length} 包 / ${totalPieces.toLocaleString()} 件`; $('#loadedDetails').innerHTML=details.filter(x=>x.count).map(({g,count})=>detailRow(g,count,`${(cubicMeters(g)*count).toFixed(2)} m³`,placementDetail(g,plan))).join('')||'<div class="empty-detail">无可装载货物</div>';
  const unLoadedCounts=new Map(); plan.unplaced.forEach(g=>unLoadedCounts.set(g.id,(unLoadedCounts.get(g.id)||0)+1)); $('#unloadedBadge').textContent=`${plan.unplaced.length} 未装`; $('#unloadedDetails').innerHTML=[...unLoadedCounts].map(([id,count])=>detailRow(state.cargo.find(g=>g.id===id),count,'空间不足')).join('')||'<div class="empty-detail">所有计划货物均已装载</div>';
  const free=plan.freeSpaces||[];$('#freeSpaceBadge').textContent=`${free.length} 处`;$('#freeSpaceDetails').innerHTML=free.slice(0,12).map((s,i)=>`<div class="free-space-row"><b>空间 ${i+1}</b><span>长 ${s.l} × 宽 ${s.w} × 高 ${s.h} mm</span><small>${fmtVolume(s.l*s.w*s.h/1e9)}</small></div>`).join('')||'<div class="empty-detail">无可用剩余空间</div>';
  $('#legend').innerHTML=details.filter(x=>x.count).map(({g})=>`<button class="legend-item ${state.hiddenCargoIds?.has(g.id)?'muted-item':''}" data-toggle-legend="${g.id}"><i class="legend-dot" style="background:${g.color}"></i>${g.name}</button>`).join('');$$('[data-toggle-legend]').forEach(b=>b.addEventListener('click',()=>{state.hiddenCargoIds??=new Set();state.hiddenCargoIds.has(b.dataset.toggleLegend)?state.hiddenCargoIds.delete(b.dataset.toggleLegend):state.hiddenCargoIds.add(b.dataset.toggleLegend);drawScene(plan);renderPlan();}));
  $('#prevPlan').disabled=state.plan.active===0;$('#nextPlan').disabled=state.plan.active===state.plan.plans.length-1;
  drawScene(plan);
  renderContainerPlans();
}
function saveCurrentPlan(){
  if(!state.plan){alert('请先生成装载方案。');return;}
  const suggested=`${state.plan.plans[0].container.name}装载方案-${new Date().toLocaleDateString('zh-CN')}`;
  const name=prompt('请输入方案名称：',suggested);if(name===null)return;
  const plans=state.plan.plans.map(plan=>({...plan,container:{...plan.container},positions:plan.positions.map(p=>({...p})),unplaced:plan.unplaced.map(p=>({...p})),placedCount:[...plan.placedCount]}));
  state.savedPlans.unshift({id:uid('p'),name:name.trim()||suggested,createdAt:new Date().toLocaleString('zh-CN',{hour12:false}),mode:state.plan.mode,plans});persistState();renderSavedPlans();alert('方案已保存，可在“方案管理”中打开。');
}
function renderSavedPlans(){
  const host=$('#savedPlansList');if(!host)return;
  host.innerHTML=state.savedPlans.map(saved=>{const packages=saved.plans.reduce((sum,p)=>sum+p.positions.length,0),pieces=saved.plans.reduce((sum,p)=>sum+p.positions.reduce((s,x)=>s+(+x.pieces||0),0),0);return `<article class="saved-plan-card"><div><p class="eyebrow">${saved.createdAt}</p><h2>${saved.name}</h2><p>${saved.plans.length} 个容器方案 · ${packages} 包 / ${pieces.toLocaleString()} 件</p></div><div class="saved-plan-actions"><button class="button secondary" data-open-saved="${saved.id}">打开方案</button><button class="text-button delete" data-delete-saved="${saved.id}">删除</button></div></article>`;}).join('')||'<div class="empty-state">还没有保存的装载方案。生成方案后点击“保存方案”即可在此管理。</div>';
  $$('[data-open-saved]').forEach(button=>button.addEventListener('click',()=>openSavedPlan(button.dataset.openSaved)));
  $$('[data-delete-saved]').forEach(button=>button.addEventListener('click',()=>{const saved=state.savedPlans.find(p=>p.id===button.dataset.deleteSaved);if(saved&&confirm(`删除方案“${saved.name}”？`)){state.savedPlans=state.savedPlans.filter(p=>p.id!==saved.id);persistState();renderSavedPlans();}}));
}
function renderSettings(){const toggle=$('#tooltipToggle');if(!toggle)return;toggle.checked=state.settings.showCargoTooltip;toggle.closest('.switch').querySelector('b').textContent=toggle.checked?'开启':'关闭';}
function openSavedPlan(id){
  const saved=state.savedPlans.find(p=>p.id===id);if(!saved)return;
  state.plan={plans:saved.plans.map(plan=>({...plan,container:{...plan.container},positions:plan.positions.map(p=>({...p})),unplaced:plan.unplaced.map(p=>({...p})),placedCount:new Map(plan.placedCount)})),active:0,mode:saved.mode};
  $('.nav-link[data-page="workspace"]').click();$('#results').classList.remove('hidden');renderPlan();setTimeout(()=>$('#results').scrollIntoView({behavior:'smooth',block:'start'}),0);
}
function placementDetail(g,plan){
  const items=plan.positions.filter(p=>p.id===g.id);
  if(!items.length)return '';
  const alongLength=new Set(items.map(p=>p.x)).size,alongWidth=new Set(items.map(p=>p.y)).size,layers=new Set(items.map(p=>p.z)).size;
  const longitudinal=items.filter(p=>(p.orientation||'').startsWith('纵向')).length,transverse=items.filter(p=>(p.orientation||'').startsWith('横向')).length;
  const placement=g.shape==='cylinder'?'竖放':`竖放（高度朝上）；纵向 ${longitudinal} 包、横向 ${transverse} 包`;
  return `横向 ${alongWidth} 列 · 纵向 ${alongLength} 排 · 竖向 ${layers} 层；${placement}`;
}
function detailRow(g,count,meta,placement=''){return `<div class="detail-row"><i class="detail-bar" style="background:${g.color}"></i><span><b>${g.name}</b><small>${meta}</small>${placement?`<small class="placement-detail">${placement}</small>`:''}</span><span style="text-align:right;white-space:nowrap"><b>× ${count} 包</b><small>${count * g.pieces} 件</small></span></div>`;}

let renderer,scene,camera,controls,frame,resizeObserver,raycaster,pointer;
function initThree() {
  const host=$('#threeCanvas'); renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:false}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setClearColor(0xf3f7fb,1); host.appendChild(renderer.domElement); scene=new THREE.Scene();scene.background=new THREE.Color(0xf3f7fb); camera=new THREE.PerspectiveCamera(42,1,.1,200); controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=false; controls.enablePan=true; controls.screenSpacePanning=true; controls.mouseButtons.MIDDLE=THREE.MOUSE.PAN; controls.minDistance=3; controls.maxDistance=25; controls.addEventListener('change',scheduleThreeRender); raycaster=new THREE.Raycaster();pointer=new THREE.Vector2();renderer.domElement.addEventListener('pointermove',updateCargoHover);renderer.domElement.addEventListener('pointerleave',hideCargoHover); scene.add(new THREE.HemisphereLight(0xffffff,0x5d7185,2)); const light=new THREE.DirectionalLight(0xffffff,2.2); light.position.set(7,10,8); scene.add(light); const grid=new THREE.GridHelper(16,16,0x9eb1c5,0xdde5ec); grid.position.y=-.012; scene.add(grid); resizeObserver=new ResizeObserver(resizeThree); resizeObserver.observe(host);resizeObserver.observe($('#canvasWrap')); resizeThree(); scheduleThreeRender();
}
function scheduleThreeRender(){if(!renderer||frame)return;frame=requestAnimationFrame(()=>{frame=0;alignDimensionLabels();renderer.render(scene,camera);});}
function resizeThree(){if(!renderer)return;const host=$('#threeCanvas'),w=host.clientWidth,h=host.clientHeight||400;if(!w||!h)return;renderer.setSize(w,h,true);camera.aspect=w/h;camera.updateProjectionMatrix();scheduleThreeRender();}
function fitThree(){resizeThree();requestAnimationFrame(()=>{resizeThree();requestAnimationFrame(resizeThree);});}
function hideCargoHover(){const tip=$('#threeTooltip');if(tip)tip.classList.remove('visible');}
function updateCargoHover(event){
  if(!state.settings.showCargoTooltip||!raycaster||!renderer){hideCargoHover();return;}
  const rect=renderer.domElement.getBoundingClientRect();if(!rect.width||!rect.height)return;
  pointer.x=((event.clientX-rect.left)/rect.width)*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);
  const hit=raycaster.intersectObjects(scene.children,true).find(item=>item.object.userData.isCargo);const tip=$('#threeTooltip');if(!hit||!tip){hideCargoHover();return;}
  const wrapRect=$('#canvasWrap').getBoundingClientRect();tip.textContent=hit.object.userData.name;tip.style.left=`${event.clientX-wrapRect.left+14}px`;tip.style.top=`${event.clientY-wrapRect.top+14}px`;tip.classList.add('visible');
}
function animate(){scheduleThreeRender();}
function clearObject(obj){while(obj.children.length){const child=obj.children.pop();child.traverse(node=>{node.geometry?.dispose();const disposeMaterial=material=>{material.map?.dispose();material.dispose();};if(Array.isArray(node.material))node.material.forEach(disposeMaterial);else if(node.material)disposeMaterial(node.material);});}}
function dimensionLabelSprite(text,from,to){const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.width=310;canvas.height=54;ctx.clearRect(0,0,310,54);ctx.font='700 25px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=5;ctx.strokeStyle='rgba(248,251,255,.92)';ctx.strokeText(text,155,27);ctx.fillStyle='#56738e';ctx.fillText(text,155,27);const texture=new THREE.CanvasTexture(canvas),sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false}));sprite.scale.set(1.45,.25,1);sprite.renderOrder=9;sprite.userData.dimensionLine={from:from.clone(),to:to.clone()};return sprite;}
function alignDimensionLabels(){if(!scene||!camera)return;scene.traverse(node=>{const line=node.userData.dimensionLine;if(!line||!node.material)return;const a=line.from.clone().project(camera),b=line.to.clone().project(camera);let angle=Math.atan2(-(b.y-a.y),b.x-a.x);if(angle>Math.PI/2)angle-=Math.PI;if(angle<-Math.PI/2)angle+=Math.PI;node.material.rotation=angle;});}
function addDimensionLine(group,from,to,fromBase,toBase,tickAxis,label){const material=new THREE.LineBasicMaterial({color:0x6f90ad,transparent:true,opacity:.9,depthTest:false});const points=[fromBase,from,toBase,to,from,to,from.clone().add(tickAxis),from.clone().sub(tickAxis),to.clone().add(tickAxis),to.clone().sub(tickAxis)];const lines=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),material);lines.renderOrder=8;group.add(lines);const text=dimensionLabelSprite(label,from,to);text.position.copy(from).lerp(to,.5);group.add(text);}
function addPalletPartV323(group,size,position,material,edgeColor=0x20384f){const geometry=new THREE.BoxGeometry(size.x,size.y,size.z),mesh=new THREE.Mesh(geometry,material);mesh.position.copy(position);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);const edge=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:edgeColor,transparent:true,opacity:.42}));edge.position.copy(position);group.add(edge);return mesh;}
function addPalletModel(group,c,scale){
  const x=c.l*scale,z=c.w*scale,h=Math.max(.08,c.h*scale),style=c.style||c.palletStyle||'wood',base=new THREE.Color(c.color||({wood:'#b97b45',plastic:'#2563eb',metal:'#8b99a8'}[style]||'#b97b45')),material=(color,roughness,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness}),topH=Math.max(.035,h*.19),bottomH=Math.max(.025,h*.14),bodyH=Math.max(.04,h-topH-bottomH);
  if(style==='plastic'){
    const main=material(base,.48,.03),light=material(base.clone().lerp(new THREE.Color(0xffffff),.18),.42,.03),dark=material(base.clone().multiplyScalar(.62),.62,.02),topY=h-topH/2,cells=6,gap=Math.min(x,z)*.018,cellX=(x*.88-gap*(cells-1))/cells,cellZ=(z*.88-gap*(cells-1))/cells;
    addPalletPartV323(group,new THREE.Vector3(x*.96,topH,z*.96),new THREE.Vector3(x/2,topY,z/2),dark,0x173c63);
    for(let ix=0;ix<cells;ix++)for(let iz=0;iz<cells;iz++)addPalletPartV323(group,new THREE.Vector3(cellX,topH*.28,cellZ),new THREE.Vector3(x*.06+cellX/2+ix*(cellX+gap),h+topH*.14,z*.06+cellZ/2+iz*(cellZ+gap)),(ix+iz)%2?main:light,0x245076);
    for(const px of [.1,.5,.9])for(const pz of [.1,.5,.9])addPalletPartV323(group,new THREE.Vector3(x*.17,bodyH,z*.17),new THREE.Vector3(x*px,bottomH+bodyH/2,z*pz),dark,0x173c63);
    for(const pz of [.1,.5,.9])addPalletPartV323(group,new THREE.Vector3(x*.92,bottomH,z*.075),new THREE.Vector3(x/2,bottomH/2,z*pz),dark,0x173c63);
  }else if(style==='metal'){
    const steel=material(base,.27,.82),bright=material(base.clone().lerp(new THREE.Color(0xffffff),.28),.22,.9),dark=material(base.clone().multiplyScalar(.56),.38,.76),topY=h-topH/2,frame=Math.max(.045,Math.min(x,z)*.045),rows=9,slatZ=(z-frame*3)/rows;
    addPalletPartV323(group,new THREE.Vector3(x,topH,frame),new THREE.Vector3(x/2,topY,frame/2),steel);addPalletPartV323(group,new THREE.Vector3(x,topH,frame),new THREE.Vector3(x/2,topY,z-frame/2),steel);addPalletPartV323(group,new THREE.Vector3(frame,topH,z-frame*2),new THREE.Vector3(frame/2,topY,z/2),steel);addPalletPartV323(group,new THREE.Vector3(frame,topH,z-frame*2),new THREE.Vector3(x-frame/2,topY,z/2),steel);
    for(let row=0;row<rows;row++)addPalletPartV323(group,new THREE.Vector3(x-frame*2,topH*.42,slatZ*.56),new THREE.Vector3(x/2,h-topH*.18,frame*1.25+slatZ/2+row*slatZ),row%2?steel:bright);
    for(const px of [.18,.5,.82])addPalletPartV323(group,new THREE.Vector3(frame*.62,bodyH,z*.86),new THREE.Vector3(x*px,bottomH+bodyH/2,z/2),dark);for(const pz of [.09,.91])addPalletPartV323(group,new THREE.Vector3(x*.92,bottomH,z*.065),new THREE.Vector3(x/2,bottomH/2,z*pz),dark);
  }else{
    const wood=material(base,.78),light=material(base.clone().lerp(new THREE.Color(0xffe1b9),.2),.72),dark=material(base.clone().multiplyScalar(.6),.86),grain=material(base.clone().multiplyScalar(.46),.95),topY=h-topH/2,boards=7,gap=z*.018,boardZ=(z-gap*(boards-1))/boards;
    for(let row=0;row<boards;row++){const centerZ=boardZ/2+row*(boardZ+gap);addPalletPartV323(group,new THREE.Vector3(x,topH,boardZ),new THREE.Vector3(x/2,topY,centerZ),row%2?wood:light,0x5d3924);for(const grainOffset of [.31,.68]){const line=new THREE.Mesh(new THREE.BoxGeometry(x*.9,Math.max(.006,topH*.035),Math.max(.006,boardZ*.025)),grain);line.position.set(x/2,h+.004,centerZ-boardZ/2+boardZ*grainOffset);group.add(line);}}
    for(const pz of [.11,.5,.89])addPalletPartV323(group,new THREE.Vector3(x*.94,bodyH,z*.085),new THREE.Vector3(x/2,bottomH+bodyH/2,z*pz),dark,0x5d3924);for(const px of [.11,.5,.89])addPalletPartV323(group,new THREE.Vector3(x*.09,bottomH,z*.94),new THREE.Vector3(x*px,bottomH/2,z/2),dark,0x5d3924);
  }
}
function drawScene(plan){if(!renderer)initThree();clearObject(scene);scene.add(new THREE.HemisphereLight(0xffffff,0x5d7185,2));const light=new THREE.DirectionalLight(0xffffff,2.2);light.position.set(7,10,8);scene.add(light);const scale=7/Math.max(plan.container.l,plan.container.w,plan.container.h),c=plan.container,isPallet=c.type==='托盘';const group=new THREE.Group();group.name='load';if(isPallet){addPalletModel(group,c,scale);}else{const wire=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(c.l*scale,c.h*scale,c.w*scale)),new THREE.LineBasicMaterial({color:0x0b2545,transparent:true,opacity:.52}));wire.position.set(c.l*scale/2,c.h*scale/2,c.w*scale/2);group.add(wire);}if(state.settings.showContainerDimensions!==false){const x=c.l*scale,y=c.h*scale,z=c.w*scale,offset=.34,tick=.075;addDimensionLine(group,new THREE.Vector3(0,0,z+offset),new THREE.Vector3(x,0,z+offset),new THREE.Vector3(0,0,z),new THREE.Vector3(x,0,z),new THREE.Vector3(0,0,tick),`长：${c.l} mm`);addDimensionLine(group,new THREE.Vector3(x+offset,0,0),new THREE.Vector3(x+offset,0,z),new THREE.Vector3(x,0,0),new THREE.Vector3(x,0,z),new THREE.Vector3(tick,0,0),`宽：${c.w} mm`);addDimensionLine(group,new THREE.Vector3(-offset,0,0),new THREE.Vector3(-offset,y,0),new THREE.Vector3(0,0,0),new THREE.Vector3(0,y,0),new THREE.Vector3(tick,0,0),`高：${c.h} mm`);}
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(c.l*scale,c.w*scale),new THREE.MeshStandardMaterial({color:0xe9f2fa,transparent:true,opacity:.32,side:THREE.DoubleSide}));floor.rotation.x=-Math.PI/2;floor.position.set(c.l*scale/2,0,c.w*scale/2);group.add(floor);
  plan.positions.forEach((p,index)=>{if(state.hiddenCargoIds?.has(p.id))return;let mesh;if(p.shape==='cylinder'){const axis=p.cylinderMode==='lyingLength'?p.l:p.cylinderMode==='lyingWidth'?p.w:p.h,diameter=p.cylinderMode==='lyingLength'?p.w:p.cylinderMode==='lyingWidth'?p.l:p.w;mesh=new THREE.Mesh(new THREE.CylinderGeometry(diameter*scale/2,diameter*scale/2,axis*scale,18),new THREE.MeshStandardMaterial({color:p.color,roughness:.52,metalness:.04}));if(p.cylinderMode==='lyingLength')mesh.rotation.z=Math.PI/2;if(p.cylinderMode==='lyingWidth')mesh.rotation.x=Math.PI/2;mesh.position.set((p.x+p.l/2)*scale,(p.z+p.h/2)*scale,(p.y+p.w/2)*scale);}else{mesh=new THREE.Mesh(new THREE.BoxGeometry(p.l*scale,p.h*scale,p.w*scale),new THREE.MeshStandardMaterial({color:p.color,roughness:.58,metalness:.03}));mesh.position.set((p.x+p.l/2)*scale,(p.z+p.h/2)*scale,(p.y+p.w/2)*scale);}mesh.castShadow=true;mesh.userData={name:p.name,index,isCargo:true};group.add(mesh);const outline=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0x132b42,transparent:true,opacity:.82}));outline.position.copy(mesh.position);outline.rotation.copy(mesh.rotation);outline.userData={name:`${p.name} 外框`,index};group.add(outline);}); scene.add(group);const gridSize=Math.max(c.l*scale,c.w*scale)*1.12,grid=new THREE.GridHelper(gridSize,Math.max(8,Math.round(gridSize*2)),0x9eb1c5,0xdde5ec);grid.position.set(c.l*scale/2,-.012,c.w*scale/2);scene.add(grid);setCamera('iso');scheduleThreeRender();}
function setCamera(view){if(!state.plan)return;const p=state.plan.plans[state.plan.active],s=7/Math.max(p.container.l,p.container.w,p.container.h),center=new THREE.Vector3(p.container.l*s/2,p.container.h*s/2,p.container.w*s/2),size=Math.max(p.container.l*s,p.container.w*s,p.container.h*s),d=Math.max(4.6,size*.68);const positions={front:[center.x,center.y,center.z+d],top:[center.x,center.y+d,center.z],side:[center.x+d,center.y,center.z],iso:[center.x+d*.82,center.y+d*.7,center.z+d*.82]};camera.position.set(...positions[view]);controls.target.copy(center);controls.update();$$('.view-buttons [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));}

function typeTone(type){return ({'车厢':'type-vehicle','箱子':'type-box','桶':'type-barrel','托盘':'type-pallet','单体货物':'type-single','套装货物':'type-set'})[type]||'type-default';}
function renderArchives(){const data=state[state.archive];$('#containerTotal').textContent=state.containers.length;$('#cargoTotal').textContent=state.cargo.length;const query=$('#archiveSearch').value.trim().toLowerCase();const filtered=data.filter(r=>!query||`${r.name}${r.type}`.toLowerCase().includes(query));$('#archiveCount').textContent=`共 ${filtered.length} 条记录`;$('#archiveRows').innerHTML=filtered.map(r=>`<tr><td><b>${r.name}</b></td><td><span class="type-pill ${typeTone(r.type)}">${r.type}</span></td><td>${r.l} × ${r.w} × ${r.h} mm</td><td>${fmtVolume(state.archive==='containers'?usableVolume(r):cubicMeters(r))}</td><td>${r.weight || 0} kg</td><td>${r.pieces} 件</td><td><i class="color-pill" style="background:${r.color}"></i></td><td><span class="row-actions"><button data-edit="${r.id}">编辑</button><button class="delete" data-delete="${r.id}">删除</button></span></td></tr>`).join('')||'<tr><td colspan="8"><div class="empty-state">没有匹配的档案</div></td></tr>';$('[data-edit]')&&$$('[data-edit]').forEach(b=>b.addEventListener('click',()=>openDialog(data.find(r=>r.id===b.dataset.edit))));$$('[data-delete]').forEach(b=>b.addEventListener('click',()=>{const i=data.findIndex(r=>r.id===b.dataset.delete);if(i>=0&&confirm(`删除“${data[i].name}”？`)){state.selectedContainers.delete(data[i].id);state.selectedCargo.delete(data[i].id);data.splice(i,1);persistState();renderArchives();renderSelectors();}}));}
function openDialog(record=null){const kind=record?.kind||state.archive;$('#archiveForm').reset();$('#recordId').value=record?.id||'';$('#recordKind').value=kind;$('#modalTitle').textContent=record?'编辑档案':`新增${kind==='containers'?'容器':'货物'}`;$('#modalEyebrow').textContent=record?'EDIT RECORD':'NEW RECORD';const fields={recordName:'name',recordType:'type',recordShape:'shape',recordL:'l',recordW:'w',recordH:'h',recordWeight:'weight',recordPieces:'pieces',recordReserve:'reserve',recordPrice:'price',recordColor:'color'};Object.entries(fields).forEach(([id,key])=>{if(record)$('#'+id).value=record[key]??'';});const type=$('#recordType');[...type.options].forEach(o=>o.hidden=kind==='containers'?['单体货物','套装货物'].includes(o.value):['车厢','箱子','桶','托盘'].includes(o.value));type.value=record?.type||(kind==='containers'?'车厢':'单体货物');$('#recordShape').value=record?.shape||(type.value==='桶'?'cylinder':'box');$('#archiveDialog').showModal();}
function saveDialog(e){e.preventDefault();const kind=$('#recordKind').value, id=$('#recordId').value;const fields={name:'recordName',type:'recordType',shape:'recordShape',l:'recordL',w:'recordW',h:'recordH',weight:'recordWeight',pieces:'recordPieces',reserve:'recordReserve',price:'recordPrice',color:'recordColor'};const record={id:id||uid(kind==='containers'?'c':'g')};Object.entries(fields).forEach(([key,field])=>record[key]=['name','type','shape','color'].includes(key)?$('#'+field).value:+$('#'+field).value);if(kind==='cargo')record.quantity=1;const list=state[kind],index=list.findIndex(x=>x.id===id);if(index<0)list.push(record);else list[index]={...list[index],...record};persistState();$('#archiveDialog').close();renderArchives();renderSelectors();}
function csvEscape(value){return `"${String(value).replaceAll('"','""')}"`;}
function downloadTemplate(){const fields=['kind','name','type','shape','l','w','h','weight','pieces','reserve','price','color','quantity'];const example=['containers','示例车厢','车厢','box',9600,2400,2500,0,1,5,0,'#2563eb',1];const csv=[fields,example].map(row=>row.map(csvEscape).join(',')).join('\n');downloadBlob(csv,'装载档案导入模板.csv','text/csv;charset=utf-8');}
function downloadBlob(content,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function parseCSV(text){const rows=[];let row=[],cell='',quote=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else quote=!quote;}else if(ch===','&&!quote){row.push(cell);cell='';}else if((ch==='\n'||ch==='\r')&&!quote){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}else cell+=ch;}row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;}
function importCSV(file){const reader=new FileReader();reader.onload=()=>{try{const [head,...rows]=parseCSV(reader.result),keys=head.map(x=>x.trim());let count=0;rows.forEach(row=>{const x=Object.fromEntries(keys.map((k,i)=>[k,row[i]??'']));const kind=x.kind==='containers'?'containers':'cargo';if(!x.name||!x.l||!x.w||!x.h)return;state[kind].push({id:uid(kind==='containers'?'c':'g'),name:x.name,type:x.type||(kind==='containers'?'车厢':'单体货物'),shape:x.shape==='cylinder'?'cylinder':'box',l:+x.l,w:+x.w,h:+x.h,weight:+x.weight||0,pieces:+x.pieces||1,reserve:+x.reserve||0,price:+x.price||0,color:x.color||COLORS[(state[kind].length)%COLORS.length],quantity:+x.quantity||1});count++;});persistState();renderArchives();renderSelectors();alert(`已导入 ${count} 条档案。`);}catch{alert('导入失败，请使用下载的 CSV 模板。');}};reader.readAsText(file,'utf-8');}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function activeReport(){
  const plan=state.plan.plans[state.plan.active], totalPieces=plan.positions.reduce((sum,p)=>sum+(+p.pieces||0),0);
  const rows=state.cargo.filter(g=>state.selectedCargo.has(g.id)).map(g=>{
    const count=plan.placedCount.get(g.id)||0;
    return {name:g.name,count,pieces:count*(+g.pieces||0),volume:cubicMeters(g)*count,placement:placementDetail(g,plan)||'未装载'};
  });
  return {plan,totalPieces,rows,createdAt:new Date().toLocaleString('zh-CN',{hour12:false})};
}
function reportCanvas(report){
  const previousActive=state.plan?.active??0,targetActive=state.plan?.plans.indexOf(report.plan)??-1;if(targetActive>=0)state.plan.active=targetActive;drawScene(report.plan);renderer.render(scene,camera);if(state.plan)state.plan.active=previousActive;
  const {plan,rows,totalPieces,createdAt}=report, width=1600, height=Math.max(1260,920+rows.length*92), canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#f5f8fc';ctx.fillRect(0,0,width,height);ctx.fillStyle='#0b2545';ctx.fillRect(0,0,width,118);
  ctx.fillStyle='#ffffff';ctx.font='bold 38px sans-serif';ctx.fillText('TOP BOX货物装车方案',64,67);ctx.font='18px sans-serif';ctx.fillStyle='#c9d9e8';ctx.fillText(`生成时间：${createdAt}`,64,96);
  ctx.fillStyle='#ffffff';ctx.fillRect(54,150,1492,620);ctx.strokeStyle='#d7e2ee';ctx.lineWidth=2;ctx.strokeRect(54,150,1492,620);
  ctx.fillStyle='#173a5e';ctx.font='bold 27px sans-serif';ctx.fillText(plan.container.name,86,198);ctx.font='18px sans-serif';ctx.fillStyle='#59718a';ctx.fillText(`${plan.container.l} × ${plan.container.w} × ${plan.container.h} mm  ·  合理装载 ${fmtVolume(plan.available)}`,86,231);
  const source=renderer.domElement, maxW=900,maxH=465,ratio=source.width/source.height||1;let imageW=maxW,imageH=maxW/ratio;if(imageH>maxH){imageH=maxH;imageW=maxH*ratio;}
  ctx.fillStyle='#edf3f8';ctx.fillRect(86,264,maxW,maxH);ctx.drawImage(source,86+(maxW-imageW)/2,264+(maxH-imageH)/2,imageW,imageH);
  const metrics=[['空间利用率',`${actualUtilization(plan).toFixed(2)}%`],['已装载',`${plan.positions.length} 包 / ${totalPieces.toLocaleString()} 件`],['已用容积',fmtVolume(actualUsedVolume(plan))],['总重量',`${plan.positions.reduce((s,p)=>s+(+p.weight||0),0).toFixed(0)} kg`]];
  metrics.forEach(([label,value],i)=>{const y=282+i*112;ctx.fillStyle='#edf4fb';ctx.fillRect(1040,y,440,86);ctx.fillStyle='#54718d';ctx.font='17px sans-serif';ctx.fillText(label,1068,y+32);ctx.fillStyle='#0b2545';ctx.font='bold 26px sans-serif';ctx.fillText(value,1068,y+66);});
  const startY=824;ctx.fillStyle='#0b2545';ctx.font='bold 25px sans-serif';ctx.fillText('各品装载明细',64,startY);const headers=['货物','装载数量','小件数','装载容积','摆放明细'];const columns=[64,390,570,720,930];ctx.fillStyle='#e1ebf5';ctx.fillRect(54,startY+24,1492,48);ctx.fillStyle='#365876';ctx.font='bold 16px sans-serif';headers.forEach((h,i)=>ctx.fillText(h,columns[i]+14,startY+55));
  rows.forEach((row,i)=>{const y=startY+72+i*92;ctx.fillStyle=i%2?'#ffffff':'#f8fbfe';ctx.fillRect(54,y,1492,92);ctx.strokeStyle='#e3ebf2';ctx.strokeRect(54,y,1492,92);ctx.fillStyle='#173a5e';ctx.font='bold 17px sans-serif';ctx.fillText(row.name.slice(0,19),78,y+34);ctx.font='16px sans-serif';ctx.fillStyle='#405b74';ctx.fillText(`${row.count} 包`,404,y+34);ctx.fillText(`${row.pieces.toLocaleString()} 件`,584,y+34);ctx.fillText(fmtVolume(row.volume),734,y+34);ctx.font='14px sans-serif';ctx.fillText(row.placement,944,y+34,560);});
  ctx.fillStyle='#6a8298';ctx.font='14px sans-serif';ctx.fillText('说明：横向为沿车厢宽度，纵向为沿车厢长度，竖向为堆叠层数。',64,height-36);
  return canvas;
}
function exportSerial(){const now=new Date(),date=`${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`,key=`topbox-export-sequence-${date}`,next=(Number(localStorage.getItem(key))||0)+1;localStorage.setItem(key,String(next));return `${date}${String(next).padStart(3,'0')}`;}
function exportFileName(prefix,extension){return `${prefix}-${exportSerial()}.${extension}`;}
function exportImage(){if(!renderer||!state.plan)return;const canvas=reportCanvas(activeReport()),a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=exportFileName('TOP BOX货物装车方案','png');a.click();}
async function exportPdf(){
  if(!renderer||!state.plan)return;
  try{
    const {jsPDF}=await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm');
    const canvas=reportCanvas(activeReport()),pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'}),pageW=pdf.internal.pageSize.getWidth(),pageH=pdf.internal.pageSize.getHeight(),margin=10,ratio=canvas.width/canvas.height;
    let drawW=pageW-margin*2,drawH=drawW/ratio;if(drawH>pageH-margin*2){drawH=pageH-margin*2;drawW=drawH*ratio;}
    pdf.addImage(canvas.toDataURL('image/png'),'PNG',(pageW-drawW)/2,(pageH-drawH)/2,drawW,drawH,undefined,'FAST');pdf.save(exportFileName('TOP BOX货物装车方案','pdf'));
  }catch(error){console.error(error);alert('PDF 组件加载失败，请检查网络后重试，或使用“打印方案”另存为 PDF。');}
}
function printPlan(){
  if(!renderer||!state.plan)return;
  const report=activeReport(), image=reportCanvas(report).toDataURL('image/png'), {plan,rows,totalPieces,createdAt}=report;
  const rowHtml=rows.map(row=>`<tr><td>${escapeHtml(row.name)}</td><td>${row.count} 包</td><td>${row.pieces.toLocaleString()} 件</td><td>${fmtVolume(row.volume)}</td><td>${escapeHtml(row.placement)}</td></tr>`).join('');
  const page=window.open('','_blank'); if(!page){alert('浏览器阻止了导出窗口，请允许弹出窗口后重试。');return;}
  page.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>标准车辆装车方案</title><style>body{margin:0;background:#eef3f8;color:#173a5e;font:14px Arial,"Microsoft YaHei",sans-serif}.sheet{max-width:1000px;margin:22px auto;background:#fff;padding:34px;box-sizing:border-box}.head{border-bottom:3px solid #0b2545;padding-bottom:18px}.head h1{margin:0 0 8px;font-size:28px;color:#0b2545}.muted{color:#60788f}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:22px 0}.metric{background:#f1f6fb;padding:14px;border-radius:6px}.metric b{display:block;margin-top:6px;font-size:17px;color:#0b2545}.render{width:100%;border:1px solid #d8e3ed;display:block;margin:18px 0 26px}table{width:100%;border-collapse:collapse}th,td{padding:10px;border:1px solid #dce6ee;text-align:left;vertical-align:top}th{background:#e9f1f8;color:#254d70}@media print{body{background:#fff}.sheet{margin:0;max-width:none;padding:0}.no-print{display:none}}</style></head><body><main class="sheet"><section class="head"><h1>标准车辆装车方案</h1><div class="muted">容器：${escapeHtml(plan.container.name)} ｜ ${plan.container.l} × ${plan.container.w} × ${plan.container.h} mm ｜ 生成时间：${escapeHtml(createdAt)}</div></section><section class="summary"><div class="metric">空间利用率<b>${actualUtilization(plan).toFixed(2)}%</b></div><div class="metric">装载数量<b>${plan.positions.length} 包 / ${totalPieces.toLocaleString()} 件</b></div><div class="metric">已用容积<b>${fmtVolume(plan.loadedVolume)}</b></div><div class="metric">总重量<b>${plan.positions.reduce((s,p)=>s+(+p.weight||0),0).toFixed(0)} kg</b></div></section><img class="render" src="${image}" alt="车辆装载三维效果图"><h2>每品装载明细</h2><table><thead><tr><th>货物</th><th>装载数量</th><th>小件数</th><th>装载容积</th><th>摆放明细</th></tr></thead><tbody>${rowHtml}</tbody></table><p class="muted">说明：横向为沿车厢宽度，纵向为沿车厢长度，竖向为堆叠层数。</p><button class="no-print" onclick="print()">打印 / 另存为 PDF</button></main></body></html>`);
  page.document.close();page.focus();setTimeout(()=>page.print(),250);
}

let toastTimer, selectorRenderTimer;
function showSuccess(message){const toast=$('#appToast');if(!toast)return;toast.textContent=message;toast.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('visible'),2000);}
function requestSelectorRender(){clearTimeout(selectorRenderTimer);selectorRenderTimer=setTimeout(renderSelectors,90);}
const renderSelectorsBase=renderSelectors;renderSelectors=function(){renderSelectorsBase();$$('.cargo-quantity').forEach(input=>{const cargo=state.cargo.find(item=>item.id===input.dataset.id),row=input.closest('.select-row'),main=row?.querySelector('.record-main'),quantity=row?.querySelector('.quantity');if(!cargo||!row||!main||!quantity)return;let perPackage=main.querySelector('.cargo-piece-note');if(!perPackage){perPackage=document.createElement('small');perPackage.className='cargo-piece-note';main.append(perPackage);}perPackage.textContent=`每包 ${(+cargo.pieces||1).toLocaleString()} 件`;let total=quantity.querySelector('.quantity-pieces');if(!total){total=document.createElement('b');total.className='quantity-pieces';quantity.append(total);}const updatePieces=()=>{const bags=Math.max(1,+input.value||1);total.textContent=`共 ${(bags*(+cargo.pieces||1)).toLocaleString()} 件`;};updatePieces();input.addEventListener('input',updatePieces);});};
function bind(){
  $$('.nav-link').forEach(b=>b.addEventListener('click',()=>{const page=b.dataset.page;$$('.nav-link').forEach(x=>x.classList.toggle('active',x===b));$$('.page').forEach(x=>x.classList.toggle('active-page',x.id===page));window.scrollTo({top:0,behavior:'smooth'});if(page==='archives')renderArchives();if(page==='savedPlans')renderSavedPlans();if(page==='settings')renderSettings();}));
  $$('[data-go-archives]').forEach(b=>b.addEventListener('click',()=>{state.archive=b.dataset.goArchives;persistState();$('.nav-link[data-page="archives"]').click();$$('.archive-tabs button').forEach(x=>x.classList.toggle('active',x.dataset.archive===state.archive));renderArchives();}));
  $$('input[name="mode"]').forEach(x=>x.addEventListener('change',()=>$$('.mode-option').forEach(l=>l.classList.toggle('selected',l.querySelector('input').checked))));$('#calculate').addEventListener('click',generatePlan);$('#resetWorkspace').addEventListener('click',resetWorkspace);$('#containerSearch').addEventListener('input',renderSelectors);$('#cargoSearch').addEventListener('input',renderSelectors);
  $$('.view-buttons [data-view]').forEach(b=>b.addEventListener('click',()=>setCamera(b.dataset.view)));$('#resetCamera').addEventListener('click',()=>setCamera('iso'));$('#prevPlan').addEventListener('click',()=>{if(state.plan?.active>0){state.plan.active--;renderPlan();}});$('#nextPlan').addEventListener('click',()=>{if(state.plan&&state.plan.active<state.plan.plans.length-1){state.plan.active++;renderPlan();}});$('#fullscreenView').addEventListener('click',()=>{const target=$('#visualCard');if(document.fullscreenElement)document.exitFullscreen();else target.requestFullscreen?.();});document.addEventListener('fullscreenchange',()=>{const isFull=Boolean(document.fullscreenElement),button=$('#fullscreenView');button.textContent=isFull?'×':'⛶';button.title=isFull?'退出全屏':'全屏放大';button.setAttribute('aria-label',button.title);fitThree();if(!isFull&&state.plan)setTimeout(()=>{fitThree();setCamera('iso');},120);});window.addEventListener('resize',fitThree);$('#savePlan').addEventListener('click',saveCurrentPlan);$('#exportImage').addEventListener('click',exportImage);$('#exportPdf').addEventListener('click',exportPdf);$('#printPlan').addEventListener('click',printPlan);
  $('#tooltipToggle').addEventListener('change',event=>{state.settings.showCargoTooltip=event.target.checked;persistState();renderSettings();if(!event.target.checked)hideCargoHover();});$('#languageSelect').addEventListener('change',event=>{state.settings.language=event.target.value;persistState();applyLanguage();});$('#scrollTop').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));$('#scrollBottom').addEventListener('click',()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'smooth'}));
  $$('.archive-tabs button').forEach(b=>b.addEventListener('click',()=>{state.archive=b.dataset.archive;persistState();$$('.archive-tabs button').forEach(x=>x.classList.toggle('active',x===b));renderArchives();}));$('#archiveSearch').addEventListener('input',renderArchives);$('#addArchive').addEventListener('click',()=>openDialog());$('#closeDialog').addEventListener('click',()=>$('#archiveDialog').close());$('#cancelDialog').addEventListener('click',()=>$('#archiveDialog').close());$('#archiveForm').addEventListener('submit',saveDialog);$('#downloadTemplate').addEventListener('click',downloadTemplate);$('#importFile').addEventListener('change',e=>e.target.files[0]&&importCSV(e.target.files[0]));
}
// The enhanced application bridge is exported at the end of this module.
// Keep this legacy fallback passive so it can never replace the enhanced renderer.
setTimeout(()=>{if(!window.TopBoxApp)window.TopBoxApp={state,renderSelectors:()=>renderSelectors(),renderArchives:()=>renderArchives(),renderSavedPlans:()=>renderSavedPlans(),generatePlan:()=>generatePlan(),openSavedPlan:id=>openSavedPlan(id)};},0);

{
// v1.5 — application dialogs, complete framework translations and batch actions.
const selectedArchiveIds = new Set(), selectedSavedPlanIds = new Set();
let dialogResolver = null, previewReports = [];
const I18N = {
  en: {'创建装载方案':'Create load plan','选择容器和货物，快速计算装载明细并查看空间布局。':'Select containers and cargo to calculate loading details and review the 3D layout.','刷新页面':'Refresh page','生成最优方案':'Generate optimal plan','选择装载方式':'Choose loading method','决定数量与满载规则':'Set quantity and full-load rules','指定数量':'Specified quantity','按填写数量装载':'Load the entered quantity','满载优先':'Full-load priority','尽可能填满容器':'Fill the container as much as possible','按比例满载':'Proportional full load','按需求比例配载':'Load by requested ratio','尾货满载':'Last item full load','最后一款自动补满':'Automatically fill the final item','选择容器':'Select containers','可多选，分别生成每个容器的方案':'Multiple selection creates an independent plan for each container.','管理档案':'Manage records','搜索容器名称或类型':'Search container name or type','选择货物':'Select cargo','填写每种货物的计划数量':'Enter the planned quantity for each cargo.','多个关键词以英文逗号分隔':'Separate multiple keywords with commas','装载优化结果':'Loading results','保存方案':'Save plan','导出方案图片':'Export plan image','导出 PDF':'Export PDF','打印方案':'Print plan','空间利用率':'Space utilization','可用容积':'Available volume','已用容积':'Used volume','总装载数量':'Total loaded','总重量':'Total weight','装载明细':'Loaded details','未装载':'Unloaded','未装载空间':'Free spaces','全部容器装载方案':'All container loading plans','容器与货物档案':'Container & cargo records','维护装载计算与 3D 可视化所需的基础数据。':'Maintain master data for loading calculations and 3D visualization.','下载导入模板':'Download import template','批量导入':'Bulk import','批量删除':'Delete selected','新增档案':'New record','容器档案':'Container records','货物档案':'Cargo records','按名称、类型搜索':'Search name or type','名称':'Name','类型':'Type','尺寸（长 × 宽 × 高）':'Dimensions (L × W × H)','容积':'Volume','重量':'Weight','小件数':'Pieces','颜色':'Color','装载方案管理':'Saved plan management','已保存的方案会保留在当前浏览器，可随时打开、导出或删除。':'Saved plans remain in this browser and can be opened, exported or deleted anytime.','更新日志':'Release notes','显示设置':'Display settings','设置会保留在当前浏览器。':'Settings remain in this browser.','3D 货物名称提示':'3D cargo name tooltip','鼠标悬停在 3D 货物颜色块上时显示货物名称。':'Show the cargo name when hovering over a 3D cargo block.','开启':'On','关闭':'Off','取消':'Cancel','确定':'OK','下载 PDF':'Download PDF','打印 PDF':'Print PDF','方案名称':'Plan name','提示':'Notice','确认删除':'Confirm deletion','关闭':'Close','打开方案':'Open plan','删除':'Delete','编辑':'Edit','没有匹配的档案':'No matching records','没有匹配的容器':'No matching containers','没有匹配的货物':'No matching cargo','无可装载货物':'No cargo can be loaded','所有计划货物均已装载':'All planned cargo is loaded','无可用剩余空间':'No remaining usable space','未装载':'Unloaded','包':'packages','件':'pieces','处':'spaces','已装':'loaded','未装':'unloaded','选择全部':'Select all','保存档案':'Save record'},
  th: {'创建装载方案':'สร้างแผนการบรรทุก','选择容器和货物，快速计算装载明细并查看空间布局。':'เลือกภาชนะและสินค้าเพื่อคำนวณรายละเอียดและดูผัง 3 มิติ','刷新页面':'รีเฟรชหน้า','生成最优方案':'สร้างแผนที่เหมาะสม','选择装载方式':'เลือกวิธีการบรรทุก','决定数量与满载规则':'กำหนดจำนวนและกฎการบรรทุกเต็ม','指定数量':'ตามจำนวนที่กำหนด','按填写数量装载':'บรรทุกตามจำนวนที่ระบุ','满载优先':'เน้นบรรทุกเต็ม','尽可能填满容器':'บรรทุกให้เต็มภาชนะมากที่สุด','按比例满载':'บรรทุกเต็มตามสัดส่วน','按需求比例配载':'บรรทุกตามสัดส่วนความต้องการ','尾货满载':'สินค้า cuốiเต็มคัน','最后一款自动补满':'เติมสินค้าอันดับสุดท้ายโดยอัตโนมัติ','选择容器':'เลือกภาชนะ','可多选，分别生成每个容器的方案':'เลือกได้หลายรายการ และสร้างแผนอิสระสำหรับแต่ละภาชนะ','管理档案':'จัดการข้อมูล','搜索容器名称或类型':'ค้นหาชื่อหรือประเภทภาชนะ','选择货物':'เลือกสินค้า','填写每种货物的计划数量':'ระบุจำนวนสินค้าที่วางแผนไว้','多个关键词以英文逗号分隔':'คั่นคำค้นหาหลายคำด้วยเครื่องหมายจุลภาค','装载优化结果':'ผลการจัดบรรทุก','保存方案':'บันทึกแผน','导出方案图片':'ส่งออกรูปแผน','导出 PDF':'ส่งออก PDF','打印方案':'พิมพ์แผน','空间利用率':'อัตราใช้พื้นที่','可用容积':'ปริมาตรที่ใช้ได้','已用容积':'ปริมาตรที่ใช้แล้ว','总装载数量':'จำนวนที่บรรทุกทั้งหมด','总重量':'น้ำหนักรวม','装载明细':'รายละเอียดการบรรทุก','未装载':'ไม่ได้บรรทุก','未装载空间':'พื้นที่ว่าง','全部容器装载方案':'แผนบรรทุกทุกภาชนะ','容器与货物档案':'ข้อมูลภาชนะและสินค้า','维护装载计算与 3D 可视化所需的基础数据。':'จัดการข้อมูลพื้นฐานสำหรับการคำนวณและภาพ 3 มิติ','下载导入模板':'ดาวน์โหลดเทมเพลตนำเข้า','批量导入':'นำเข้าหลายรายการ','批量删除':'ลบที่เลือก','新增档案':'เพิ่มข้อมูล','容器档案':'ข้อมูลภาชนะ','货物档案':'ข้อมูลสินค้า','按名称、类型搜索':'ค้นหาชื่อหรือประเภท','名称':'ชื่อ','类型':'ประเภท','尺寸（长 × 宽 × 高）':'ขนาด (ย × ก × ส)','容积':'ปริมาตร','重量':'น้ำหนัก','小件数':'จำนวนชิ้น','颜色':'สี','装载方案管理':'จัดการแผนบรรทุก','已保存的方案会保留在当前浏览器，可随时打开、导出或删除。':'แผนที่บันทึกจะอยู่ในเบราว์เซอร์นี้ และสามารถเปิด ส่งออก หรือลบได้ทุกเมื่อ','更新日志':'บันทึกการอัปเดต','显示设置':'ตั้งค่าการแสดงผล','设置会保留在当前浏览器。':'การตั้งค่าจะถูกเก็บในเบราว์เซอร์นี้','3D 货物名称提示':'ชื่อสินค้าในภาพ 3 มิติ','鼠标悬停在 3D 货物颜色块上时显示货物名称。':'แสดงชื่อสินค้าเมื่อวางเมาส์บนกล่องสินค้า 3 มิติ','开启':'เปิด','关闭':'ปิด','取消':'ยกเลิก','确定':'ตกลง','下载 PDF':'ดาวน์โหลด PDF','打印 PDF':'พิมพ์ PDF','方案名称':'ชื่อแผน','提示':'แจ้งเตือน','确认删除':'ยืนยันการลบ','打开方案':'เปิดแผน','删除':'ลบ','编辑':'แก้ไข','没有匹配的档案':'ไม่พบข้อมูลที่ตรงกัน','没有匹配的容器':'ไม่พบภาชนะที่ตรงกัน','没有匹配的货物':'ไม่พบสินค้าที่ตรงกัน','无可装载货物':'ไม่มีสินค้าที่บรรทุกได้','所有计划货物均已装载':'สินค้าที่วางแผนทั้งหมดถูกบรรทุกแล้ว','无可用剩余空间':'ไม่มีพื้นที่ว่างที่ใช้ได้','包':'แพ็ก','件':'ชิ้น','处':'ตำแหน่ง','已装':'บรรทุกแล้ว','未装':'ไม่ได้บรรทุก','选择全部':'เลือกทั้งหมด','保存档案':'บันทึกข้อมูล'}
};
Object.assign(I18N.en,{'导出方案':'Export plan','每包':'Per package','已生成最优装载方案。':'Optimal loading plan generated.','档案已保存。':'Record saved.','档案已删除。':'Record deleted.','方案已保存。':'Plan saved.','主导航':'Main navigation','语言':'Language','TOP BOX货物装载配货平台':'TOP BOX Cargo Loading & Allocation Platform','纵向（长边沿车长）':'Lengthwise (long edge along vehicle length)','横向（长边沿车宽）':'Widthwise (long edge along vehicle width)','侧放（长边沿车长）':'Sideways (long edge along vehicle length)','侧放（长边沿车宽）':'Sideways (long edge along vehicle width)','竖放（长边竖直）':'Upright (long edge vertical)','竖放（宽边竖直）':'Upright (width edge vertical)','自动旋转':'Auto rotated'});Object.assign(I18N.th,{'导出方案':'ส่งออกแผน','每包':'ต่อแพ็ก','已生成最优装载方案。':'สร้างแผนการบรรทุกที่เหมาะสมแล้ว','档案已保存。':'บันทึกข้อมูลแล้ว','档案已删除。':'ลบข้อมูลแล้ว','方案已保存。':'บันทึกแผนแล้ว','主导航':'เมนูหลัก','语言':'ภาษา','TOP BOX货物装载配货平台':'TOP BOX แพลตฟอร์มจัดการบรรทุกสินค้า','纵向（长边沿车长）':'ตามยาว (ด้านยาวตามความยาวรถ)','横向（长边沿车宽）':'ตามกว้าง (ด้านยาวตามความกว้างรถ)','侧放（长边沿车长）':'วางตะแคง (ด้านยาวตามความยาวรถ)','侧放（长边沿车宽）':'วางตะแคง (ด้านยาวตามความกว้างรถ)','竖放（长边竖直）':'ตั้งขึ้น (ด้านยาวแนวตั้ง)','竖放（宽边竖直）':'ตั้งขึ้น (ด้านกว้างแนวตั้ง)','自动旋转':'หมุนอัตโนมัติ'});
Object.assign(I18N.en,{'显示容器尺寸标注':'Show container dimensions','在 3D 预览中显示容器长、宽、高的尺寸数据。':'Show the container length, width and height in the 3D preview.','TOP BOX货物装车方案':'TOP BOX Cargo Loading Plan'});Object.assign(I18N.th,{'显示容器尺寸标注':'แสดงขนาดภาชนะ','在 3D 预览中显示容器长、宽、高的尺寸数据。':'แสดงความยาว ความกว้าง และความสูงของภาชนะในภาพ 3 มิติ','TOP BOX货物装车方案':'แผนบรรทุกสินค้า TOP BOX'});
Object.assign(I18N.en,{'容器长度':'Container length','容器宽度':'Container width','容器高度':'Container height','导出表格':'Export table'});Object.assign(I18N.th,{'容器长度':'ความยาวภาชนะ','容器宽度':'ความกว้างภาชนะ','容器高度':'ความสูงภาชนะ','导出表格':'ส่งออกตาราง'});
const sourceText = new WeakMap();
function t(text) { return I18N[state.settings.language || 'zh-CN']?.[text] || text; }
function translateNode(node) { const original = sourceText.get(node) ?? node.nodeValue; sourceText.set(node, original); const lead = original.match(/^\s*/)[0], tail = original.match(/\s*$/)[0], body = original.trim(); node.nodeValue = `${lead}${t(body)}${tail}`; }
function applyLanguage() {
  const lang = state.settings.language || 'zh-CN'; $('#languageSelect').value = lang; document.documentElement.lang = lang;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {acceptNode:n => n.parentElement?.closest('script,style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT});
  while (walker.nextNode()) translateNode(walker.currentNode);
  $$('[placeholder],[title],[aria-label]').forEach(el => ['placeholder','title','aria-label'].forEach(attr => { if (!el.hasAttribute(attr)) return; const key={placeholder:'i18nPlaceholder',title:'i18nTitle','aria-label':'i18nAriaLabel'}[attr]; const original=el.dataset[key] || el.getAttribute(attr); el.dataset[key]=original; el.setAttribute(attr,t(original)); }));
}
function showDialog({title=t('提示'),message='',kind='notice',value='',reports=[]}) {
  const dialog=$('#appDialog'); if (dialog.open) dialog.close(); dialog.dataset.kind=kind; $('#appDialogTitle').textContent=title; $('#appDialogMessage').textContent=message;
  $('#appDialogInputWrap').classList.toggle('hidden',kind!=='text'); $('#appDialogInput').value=value; $('#appDialogCancel').classList.toggle('hidden',kind==='notice'||kind==='preview'); $('#appDialogConfirm').classList.toggle('hidden',kind==='preview'); $('#pdfDownload').classList.toggle('hidden',kind!=='preview'); $('#pdfPrint').classList.toggle('hidden',kind!=='preview');
  const preview=$('#pdfPreview'); preview.classList.toggle('hidden',kind!=='preview'); preview.innerHTML=kind==='preview'?reports.map((report,i)=>`<img src="${reportCanvas(report).toDataURL('image/png')}" alt="${escapeHtml(t('装载方案'))} ${i+1}">`).join(''):'';
  $('#appDialogConfirm').textContent=kind==='text'?t('保存方案'):kind==='confirm'?t('确定'):t('关闭'); dialog.showModal(); if(kind==='text') setTimeout(()=>$('#appDialogInput').focus(),0);
}
function finishDialog(value) { const dialog=$('#appDialog'); if(dialog.open)dialog.close(); const resolve=dialogResolver; dialogResolver=null; resolve?.(value); }
function showNotice(message,title=t('提示')) { showDialog({title,message,kind:'notice'}); }
function askConfirm(message,title=t('确认删除')) { return new Promise(resolve=>{dialogResolver=resolve;showDialog({title,message,kind:'confirm'});}); }
function askText(message,value='',options={}) { return new Promise(resolve=>{dialogResolver=resolve;$('#appDialogInputLabel').textContent=options.label||t('方案名称');showDialog({title:options.title||t('保存方案'),message,kind:'text',value});}); }
function pageSlice(items,pageKey,sizeKey){const size=Math.max(1,+state.ui[sizeKey]||50),pages=Math.max(1,Math.ceil(items.length/size));state.ui[pageKey]=Math.max(1,Math.min(state.ui[pageKey]||1,pages));return {rows:items.slice((state.ui[pageKey]-1)*size,state.ui[pageKey]*size),pages,size};}
function renderListPager(id,data,total,pageKey,sizeKey,onChange=renderSelectors){const host=$('#'+id);if(!host)return;const options=[20,30,50,100,200,500,1000,2000].map(v=>`<option ${data.size===v?'selected':''}>${v}</option>`).join('');host.innerHTML=`<span>${total?`${(state.ui[pageKey]-1)*data.size+1}-${Math.min(state.ui[pageKey]*data.size,total)}/${total}`:'0/0'}</span><button data-page="${pageKey}" data-step="-1" ${state.ui[pageKey]<=1?'disabled':''}>‹</button><button data-page="${pageKey}" data-step="1" ${state.ui[pageKey]>=data.pages?'disabled':''}>›</button><select data-size="${sizeKey}">${options}<option value="custom">${t('自定义')}</option></select>`;$$('[data-page]',host).forEach(b=>b.addEventListener('click',()=>{state.ui[b.dataset.page]+=+b.dataset.step;onChange();}));$('[data-size]',host).addEventListener('change',async e=>{let val=e.target.value;if(val==='custom'){const n=await askText(t('每页条数（1-5000）'),String(data.size),{title:t('自定义每页条数'),label:t('每页条数 (1-5000)')});if(n)state.ui[sizeKey]=Math.max(1,Math.min(5000,+n||data.size));}else state.ui[sizeKey]=+val;state.ui[pageKey]=1;persistState();onChange();});}
function useSpecifiedQuantity(){return activeMode()==='specified';}
function applyCargoModeRules(){if(!useSpecifiedQuantity()&&state.selectedCargo.size>1){const first=state.cargo.find(g=>state.selectedCargo.has(g.id));state.selectedCargo.clear();if(first)state.selectedCargo.add(first.id);persistState();}renderSelectors();}
function resetCargoSelection(){state.selectedCargo.clear();state.cargo.forEach(g=>{g.quantity=1;g.pieceQuantity=Math.max(1,+g.pieces||1);});state.settings.quantityInputMode='bags';persistState();renderSelectors();}
function renderSelectors(){
  const cq=$('#containerSearch')?.value.trim().toLowerCase()||'',gq=$('#cargoSearch')?.value.trim().toLowerCase()||'';
  const matches=(item,q)=>!q||q.split(',').map(v=>v.trim()).filter(Boolean).every(term=>`${item.name}${item.type}`.toLowerCase().includes(term));
  const containers=state.containers.filter(c=>matches(c,cq)),cargo=state.cargo.filter(g=>matches(g,gq));
  const cp=pageSlice(containers,'containerPage','containerSize'),gp=pageSlice(cargo,'cargoPage','cargoSize');
  const selectedContainers=state.selectedContainers.size,selectedCargo=state.selectedCargo.size;
  $('#selectedContainerCount').textContent=`${t('已选')} ${selectedContainers} ${t('项')}`;
  $('#selectedCargoCount').textContent=`${t('已选')} ${selectedCargo} ${t('项')}`;
  const specified=useSpecifiedQuantity(),quantityMode=state.settings.quantityInputMode==='pieces'?'pieces':'bags',modeHost=$('#quantityInputMode');
  if(modeHost){
    modeHost.innerHTML=`<button type="button" class="quantity-mode-button ${quantityMode==='bags'?'active':''}" data-quantity-mode="bags" aria-pressed="${quantityMode==='bags'}" ${specified?'':'disabled'}>${t('按包数输入')}</button><button type="button" class="quantity-mode-button ${quantityMode==='pieces'?'active':''}" data-quantity-mode="pieces" aria-pressed="${quantityMode==='pieces'}" ${specified?'':'disabled'}>${t('按小件数输入')}</button>`;
    $$('[data-quantity-mode]',modeHost).forEach(button=>button.addEventListener('click',()=>{const next=button.dataset.quantityMode;if(next===state.settings.quantityInputMode)return;state.settings.quantityInputMode=next;persistState();renderSelectors();}));
  }
  $('#containerList').innerHTML=cp.rows.map(c=>`<label class="select-row ${state.selectedContainers.has(c.id)?'checked':''}"><input class="container-check" data-id="${c.id}" type="checkbox" ${state.selectedContainers.has(c.id)?'checked':''}><span class="color-square" style="background:${c.color}"></span><span class="record-main"><b>${escapeHtml(c.name)}</b><small>${containerLabel(c)}</small></span><span class="record-extra">${escapeHtml(c.type)}</span></label>`).join('')||`<div class="empty-state">${t('没有匹配的容器')}</div>`;
  $('#cargoList').innerHTML=gp.rows.map(g=>{const bags=Math.max(1,+g.quantity||1),pieces=Math.max(1,+g.pieces||1),pieceQuantity=Math.max(1,+g.pieceQuantity||bags*pieces),input=quantityMode==='pieces'?`<input class="cargo-pieces" data-id="${g.id}" type="number" min="1" value="${pieceQuantity}" aria-label="${escapeHtml(g.name)} ${t('小件数')}" ${specified?'':'disabled'}><span class="quantity-unit">${t('件')}</span><span class="quantity-total">${t('折合')} ${Math.ceil(pieceQuantity/pieces).toLocaleString()} ${t('包')}</span>`:`<input class="cargo-quantity" data-id="${g.id}" type="number" min="1" value="${bags}" aria-label="${escapeHtml(g.name)} ${t('包数')}" ${specified?'':'disabled'}><span class="quantity-unit">${t('包')}</span><span class="quantity-total">${t('共')} ${(bags*pieces).toLocaleString()} ${t('件')}</span>`;return `<label class="select-row ${state.selectedCargo.has(g.id)?'checked':''}"><input class="cargo-check" data-id="${g.id}" type="checkbox" ${state.selectedCargo.has(g.id)?'checked':''}><span class="color-square" style="background:${g.color}"></span><span class="record-main"><b>${escapeHtml(g.name)}</b><small class="cargo-spec-line">${g.l} × ${g.w} × ${g.h} mm · ${cubicMeters(g).toFixed(4)} m³</small><small class="cargo-piece-line">${pieces.toLocaleString()} ${t('件')}/${t('包')}</small></span><span class="quantity">${input}</span></label>`;}).join('')||`<div class="empty-state">${t('没有匹配的货物')}</div>`;
  renderListPager('containerPager',cp,containers.length,'containerPage','containerSize');renderListPager('cargoPager',gp,cargo.length,'cargoPage','cargoSize');
  $$('.container-check').forEach(x=>x.addEventListener('change',()=>{x.checked?state.selectedContainers.add(x.dataset.id):state.selectedContainers.delete(x.dataset.id);persistState();renderSelectors();}));
  $('#selectAllCargo').disabled=!specified;
  $$('.cargo-check').forEach(x=>x.addEventListener('change',()=>{if(x.checked&&!specified){state.selectedCargo.clear();state.selectedCargo.add(x.dataset.id);}else if(x.checked)state.selectedCargo.add(x.dataset.id);else state.selectedCargo.delete(x.dataset.id);persistState();renderSelectors();}));
  $$('.cargo-quantity').forEach(x=>{const update=()=>{const g=state.cargo.find(v=>v.id===x.dataset.id),bags=Math.max(1,+x.value||1),total=x.closest('.quantity').querySelector('.quantity-total');if(total)total.textContent=`${t('共')} ${(bags*Math.max(1,+g.pieces||1)).toLocaleString()} ${t('件')}`;};x.addEventListener('input',update);x.addEventListener('change',()=>{const g=state.cargo.find(v=>v.id===x.dataset.id);g.quantity=Math.max(1,+x.value||1);g.pieceQuantity=g.quantity*Math.max(1,+g.pieces||1);x.value=g.quantity;persistState();update();});});
  $$('.cargo-pieces').forEach(x=>{const update=()=>{const g=state.cargo.find(v=>v.id===x.dataset.id),count=Math.max(1,+x.value||1),pieces=Math.max(1,+g.pieces||1),total=x.closest('.quantity').querySelector('.quantity-total');if(total)total.textContent=`${t('折合')} ${Math.ceil(count/pieces).toLocaleString()} ${t('包')}`;};x.addEventListener('input',update);x.addEventListener('change',()=>{const g=state.cargo.find(v=>v.id===x.dataset.id),count=Math.max(1,+x.value||1);g.pieceQuantity=count;g.quantity=Math.ceil(count/Math.max(1,+g.pieces||1));x.value=count;persistState();update();});});
  applyLanguage();
}
function renderSettings(){const tooltip=$('#tooltipToggle'),dimensions=$('#dimensionToggle');if(tooltip){tooltip.checked=state.settings.showCargoTooltip;tooltip.closest('.switch').querySelector('b').textContent=t(tooltip.checked?'开启':'关闭');}if(dimensions){dimensions.checked=state.settings.showContainerDimensions!==false;dimensions.closest('.switch').querySelector('b').textContent=t(dimensions.checked?'开启':'关闭');}}
function generatePlan() { const containers=state.containers.filter(c=>state.selectedContainers.has(c.id)),cargo=state.cargo.filter(g=>state.selectedCargo.has(g.id)); if(!containers.length||!cargo.length){showNotice(t('请至少选择一个容器和一种货物。'));return;} state.hiddenCargoIds.clear();state.plan={plans:containers.map(c=>packContainer(c,cargo,activeMode())),active:0,mode:activeMode()};showSuccess(t('已生成'));$('#results').classList.remove('hidden');renderPlan();$('#results').scrollIntoView({behavior:'smooth',block:'start'}); }
function placementDetail(g,plan){const items=plan.positions.filter(p=>p.id===g.id);if(!items.length)return '';const alongLength=new Set(items.map(p=>p.x)).size,alongWidth=new Set(items.map(p=>p.y)).size,layers=new Set(items.map(p=>p.z)).size,orientationCounts=[...items.reduce((map,p)=>map.set(p.orientation,(map.get(p.orientation)||0)+1),new Map()).entries()].map(([name,count])=>`${t(name)} ${count} ${t('包')}`).join('、'),placement=g.shape==='cylinder'?t('竖放'):orientationCounts;return `${t('横向')} ${alongWidth} ${t('列')} · ${t('纵向')} ${alongLength} ${t('排')} · ${t('竖向')} ${layers} ${t('层')}；${placement}`;}
function detailRow(g,count,meta,placement=''){return `<div class="detail-row"><i class="detail-bar" style="background:${g.color}"></i><span><b>${escapeHtml(g.name)}</b><small>${meta}</small>${placement?`<small class="placement-detail">${placement}</small>`:''}</span><span style="text-align:right;white-space:nowrap"><b>× ${count} ${t('包')}</b><small>${count * g.pieces} ${t('件')}</small></span></div>`;}
function renderPlan(){const plan=state.plan.plans[state.plan.active],c=plan.container;$('#activeContainerName').textContent=c.name;$('#activeContainerSpecs').textContent=`${c.l} × ${c.w} × ${c.h} mm · ${t('合理装载')} ${fmtVolume(plan.available)}`;$('#resultDescription').textContent=`${t('已生成')} ${state.plan.plans.length} ${t('个容器方案')}；${t('当前展示')} ${state.plan.active+1} / ${state.plan.plans.length}。`;const percent=Math.round(plan.utilization),totalPieces=plan.positions.reduce((s,x)=>s+(+x.pieces||0),0);$('#utilizationPercent').textContent=`${percent}%`;$('#utilizationRing').style.background=`conic-gradient(var(--blue) ${percent*3.6}deg,#eaf0f6 0deg)`;$('#availableVolume').textContent=fmtVolume(plan.available);$('#usedVolume').textContent=fmtVolume(plan.loadedVolume);$('#loadedCount').textContent=`${plan.positions.length} ${t('包')} · ${totalPieces.toLocaleString()} ${t('件')}`;$('#totalWeight').textContent=`${plan.positions.reduce((s,x)=>s+(+x.weight||0),0).toFixed(0)} kg`;const details=state.cargo.filter(g=>state.selectedCargo.has(g.id)).map(g=>({g,count:plan.placedCount.get(g.id)||0}));$('#loadedBadge').textContent=`${plan.positions.length} ${t('包')} / ${totalPieces.toLocaleString()} ${t('件')}`;$('#loadedDetails').innerHTML=details.filter(x=>x.count).map(({g,count})=>detailRow(g,count,`${(cubicMeters(g)*count).toFixed(2)} m³`,placementDetail(g,plan))).join('')||`<div class="empty-detail">${t('无可装载货物')}</div>`;const counts=new Map();plan.unplaced.forEach(g=>counts.set(g.id,(counts.get(g.id)||0)+1));$('#unloadedBadge').textContent=`${plan.unplaced.length} ${t('未装')}`;$('#unloadedDetails').innerHTML=[...counts].map(([id,count])=>detailRow(state.cargo.find(g=>g.id===id),count,t('空间不足'))).join('')||`<div class="empty-detail">${t('所有计划货物均已装载')}</div>`;const free=plan.freeSpaces||[];$('#freeSpaceBadge').textContent=`${free.length} ${t('处')}`;$('#freeSpaceDetails').innerHTML=free.slice(0,12).map((s,i)=>`<div class="free-space-row"><b>${t('空间')} ${i+1}</b><span>${t('长')} ${s.l} × ${t('宽')} ${s.w} × ${t('高')} ${s.h} mm</span><small>${fmtVolume(s.l*s.w*s.h/1e9)}</small></div>`).join('')||`<div class="empty-detail">${t('无可用剩余空间')}</div>`;$('#legend').innerHTML=details.filter(x=>x.count).map(({g})=>`<button class="legend-item ${state.hiddenCargoIds?.has(g.id)?'muted-item':''}" data-toggle-legend="${g.id}"><i class="legend-dot" style="background:${g.color}"></i>${escapeHtml(g.name)}</button>`).join('');$$('[data-toggle-legend]').forEach(b=>b.addEventListener('click',()=>{state.hiddenCargoIds.has(b.dataset.toggleLegend)?state.hiddenCargoIds.delete(b.dataset.toggleLegend):state.hiddenCargoIds.add(b.dataset.toggleLegend);renderPlan();}));$('#prevPlan').disabled=state.plan.active===0;$('#nextPlan').disabled=state.plan.active===state.plan.plans.length-1;drawScene(plan);renderContainerPlans();applyLanguage();}
function updateArchiveBulkButton(){const button=$('#bulkDeleteArchive');button.disabled=!selectedArchiveIds.size;button.textContent=selectedArchiveIds.size?`${t('批量删除')} (${selectedArchiveIds.size})`:t('批量删除');}
function updatePlanBulkButton(){const button=$('#bulkDeletePlans');button.disabled=!selectedSavedPlanIds.size;button.textContent=selectedSavedPlanIds.size?`${t('批量删除')} (${selectedSavedPlanIds.size})`:t('批量删除');}
async function removeArchives(ids){const data=state[state.archive],records=data.filter(r=>ids.includes(r.id));if(!records.length)return;if(!await askConfirm(`${t('确定删除')} ${records.length} ${t('条档案')}？`))return;const remove=new Set(ids);state[state.archive]=data.filter(r=>!remove.has(r.id));ids.forEach(id=>{state.selectedContainers.delete(id);state.selectedCargo.delete(id);selectedArchiveIds.delete(id);});persistState();renderArchives();renderSelectors();window.dispatchEvent(new Event('topbox:records-changed'));showSuccess(t('档案已删除。'));}
function renderArchives(){const data=state[state.archive],isContainer=state.archive==='containers';$('#containerTotal').textContent=state.containers.length;$('#cargoTotal').textContent=state.cargo.length;const query=$('#archiveSearch').value.trim().toLowerCase(),filtered=data.filter(r=>!query||`${r.name}${r.type}`.toLowerCase().includes(query)),page=pageSlice(filtered,'archivePage','archiveSize');$('#archiveCount').textContent=`${t('共')} ${filtered.length} ${t('条记录')}`;$('#archiveTableHead').innerHTML=`<th>${t('序号')}</th><th><input id="selectAllArchive" type="checkbox" aria-label="${t('选择全部')}" /></th><th>${t('名称')}</th><th>${t('类型')}</th><th>${t('尺寸（长 × 宽 × 高）')}</th><th>${t('容积')}</th><th>${t('重量')}</th>${isContainer?'':`<th>${t('小件数')}</th>`}<th>${t('颜色')}</th><th></th>`;const columns=isContainer?9:10;$('#archiveRows').innerHTML=page.rows.map((r,index)=>`<tr><td class="serial-number">${(state.ui.archivePage-1)*page.size+index+1}</td><td><input class="archive-select" data-select-archive="${r.id}" type="checkbox" ${selectedArchiveIds.has(r.id)?'checked':''} aria-label="${t('选择')} ${escapeHtml(r.name)}"></td><td><b>${escapeHtml(r.name)}</b></td><td><span class="type-pill ${typeTone(r.type)}">${escapeHtml(r.type)}</span></td><td>${r.l} × ${r.w} × ${r.h} mm</td><td>${fmtArchiveVolume(isContainer?usableVolume(r):cubicMeters(r))}</td><td>${r.weight||0} kg</td>${isContainer?'':`<td>${r.pieces} ${t('件')}</td>`}<td><i class="color-pill" style="background:${r.color}"></i></td><td><span class="row-actions"><button data-edit="${r.id}">${t('编辑')}</button><button class="delete" data-delete="${r.id}">${t('删除')}</button></span></td></tr>`).join('')||`<tr><td colspan="${columns}"><div class="empty-state">${t('没有匹配的档案')}</div></td></tr>`;const all=$('#selectAllArchive');all.checked=filtered.length>0&&filtered.every(r=>selectedArchiveIds.has(r.id));all.indeterminate=filtered.some(r=>selectedArchiveIds.has(r.id))&&!all.checked;all.addEventListener('change',event=>{filtered.forEach(r=>event.target.checked?selectedArchiveIds.add(r.id):selectedArchiveIds.delete(r.id));renderArchives();});$$('[data-select-archive]').forEach(b=>b.addEventListener('change',()=>{b.checked?selectedArchiveIds.add(b.dataset.selectArchive):selectedArchiveIds.delete(b.dataset.selectArchive);renderArchives();}));$$('[data-edit]').forEach(b=>b.addEventListener('click',()=>openDialog(data.find(r=>r.id===b.dataset.edit))));$$('[data-delete]').forEach(b=>b.addEventListener('click',()=>removeArchives([b.dataset.delete])));renderListPager('archivePager',page,filtered.length,'archivePage','archiveSize',renderArchives);updateArchiveBulkButton();applyLanguage();}
function renderSavedPlans(){const host=$('#savedPlansList'),page=pageSlice(state.savedPlans,'savedPlansPage','savedPlansSize');host.innerHTML=page.rows.map((saved,index)=>{const packages=saved.plans.reduce((sum,p)=>sum+p.positions.length,0),pieces=saved.plans.reduce((sum,p)=>sum+p.positions.reduce((s,x)=>s+(+x.pieces||0),0),0),serial=(state.ui.savedPlansPage-1)*page.size+index+1;return `<article class="saved-plan-card"><span class="plan-sequence">${serial}</span><input class="plan-select" data-select-plan="${saved.id}" type="checkbox" ${selectedSavedPlanIds.has(saved.id)?'checked':''} aria-label="${t('选择')} ${escapeHtml(saved.name)}"><div><p class="eyebrow">${escapeHtml(saved.createdAt)}</p><h2>${escapeHtml(saved.name)}</h2><p>${saved.plans.length} ${t('个容器方案')} · ${packages} ${t('包')} / ${pieces.toLocaleString()} ${t('件')}</p></div><div class="saved-plan-actions"><button class="button secondary" data-open-saved="${saved.id}">${t('打开方案')}</button><button class="text-button delete" data-delete-saved="${saved.id}">${t('删除')}</button></div></article>`;}).join('')||`<div class="empty-state">${t('还没有保存的装载方案。生成方案后点击“保存方案”即可在此管理。')}</div>`;renderListPager('savedPlansPager',page,state.savedPlans.length,'savedPlansPage','savedPlansSize',renderSavedPlans);$$('[data-open-saved]').forEach(button=>button.addEventListener('click',()=>openSavedPlan(button.dataset.openSaved)));$$('[data-select-plan]').forEach(button=>button.addEventListener('change',()=>{button.checked?selectedSavedPlanIds.add(button.dataset.selectPlan):selectedSavedPlanIds.delete(button.dataset.selectPlan);renderSavedPlans();}));$$('[data-delete-saved]').forEach(button=>button.addEventListener('click',()=>removeSavedPlans([button.dataset.deleteSaved])));updatePlanBulkButton();applyLanguage();}
async function removeSavedPlans(ids){const items=state.savedPlans.filter(p=>ids.includes(p.id));if(!items.length||!await askConfirm(`${t('确定删除')} ${items.length} ${t('个装载方案')}？`))return;const remove=new Set(ids);state.savedPlans=state.savedPlans.filter(p=>!remove.has(p.id));ids.forEach(id=>selectedSavedPlanIds.delete(id));persistState();renderSavedPlans();window.dispatchEvent(new Event('topbox:plans-changed'));}
async function saveCurrentPlan(){if(!state.plan){showNotice(t('请先生成装载方案。'));return;}const suggested=`${state.plan.plans[0].container.name}${t('装载方案')}-${new Date().toLocaleDateString('zh-CN')}`,name=await askText(t('请输入方案名称：'),suggested);if(name===null)return;const plans=state.plan.plans.map(plan=>({...plan,container:{...plan.container},positions:plan.positions.map(p=>({...p})),unplaced:plan.unplaced.map(p=>({...p})),placedCount:[...plan.placedCount]}));state.savedPlans.unshift({id:uid('p'),name:name.trim()||suggested,createdAt:new Date().toLocaleString('zh-CN',{hour12:false}),mode:state.plan.mode,plans});persistState();renderSavedPlans();showSuccess(t('方案已保存。'));}
function reportForPlan(plan){const totalPieces=plan.positions.reduce((sum,p)=>sum+(+p.pieces||0),0),recordById=new Map(state.cargo.map(g=>[g.id,g])),ids=[...new Set([...plan.positions,...plan.unplaced].map(p=>p.id))],rows=ids.map(id=>{const position=plan.positions.find(p=>p.id===id)||plan.unplaced.find(p=>p.id===id),g=recordById.get(id)||position,count=plan.placedCount.get(id)||0;return {name:g.name,count,pieces:count*(+g.pieces||0),volume:cubicMeters(g)*count,placement:placementDetail(g,plan)||t('未装载')};});return {plan,totalPieces,rows,createdAt:new Date().toLocaleString('zh-CN',{hour12:false})};}
function openPdfPreview(){if(!renderer||!state.plan){showNotice(t('请先生成装载方案。'));return;}previewReports=state.plan.plans.map(reportForPlan);showDialog({title:t('PDF 方案预览'),message:`${t('共')} ${previewReports.length} ${t('个容器方案')} · ${t('确认后可下载或打印。')}`,kind:'preview',reports:previewReports});drawScene(state.plan.plans[state.plan.active]);}
async function downloadPreviewPdf(){try{const {jsPDF}=await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm'),pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});previewReports.forEach((report,i)=>{if(i)pdf.addPage();const canvas=reportCanvas(report),pageW=pdf.internal.pageSize.getWidth(),pageH=pdf.internal.pageSize.getHeight(),margin=10,ratio=canvas.width/canvas.height;let w=pageW-margin*2,h=w/ratio;if(h>pageH-margin*2){h=pageH-margin*2;w=h*ratio;}pdf.addImage(canvas.toDataURL('image/png'),'PNG',(pageW-w)/2,(pageH-h)/2,w,h,undefined,'FAST');});pdf.save(exportFileName('TOP BOX货物装车方案','pdf'));}catch(error){console.error(error);showNotice(t('PDF 组件加载失败，请检查网络后重试。'));}}
function printPreviewPdf(){const pages=previewReports.map(report=>reportCanvas(report).toDataURL('image/png')),page=window.open('','_blank');if(!page){showNotice(t('浏览器阻止了打印预览窗口，请允许弹出窗口后重试。'));return;}page.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(t('标准车辆装车方案'))}</title><style>body{margin:0;background:#edf3f8}.page{max-width:1100px;margin:18px auto;background:#fff}.page img{display:block;width:100%}@media print{.page{margin:0;break-after:page}}</style></head><body>${pages.map(src=>`<div class="page"><img src="${src}"></div>`).join('')}</body></html>`);page.document.close();page.focus();setTimeout(()=>page.print(),250);}
function exportPdf(){openPdfPreview();} function printPlan(){openPdfPreview();}
Object.assign(I18N.en, {'自定义':'Custom','每页条数（1-5000）':'Rows per page (1–5000)','请至少选择一个容器和一种货物。':'Select at least one container and one cargo item.','竖放':'Upright','竖放（高度朝上）':'Upright (height up)','纵向':'Lengthwise','横向':'Widthwise','竖向':'Vertical','列':'columns','排':'rows','层':'layers','合理装载':'Usable load','已生成':'Generated','个容器方案':'container plans','当前展示':'Showing','空间不足':'Insufficient space','空间':'Space','长':'L','宽':'W','高':'H','共':'Total','条记录':'records','选择':'Select','确定删除':'Delete','条档案':'records','个装载方案':'saved plans','还没有保存的装载方案。生成方案后点击“保存方案”即可在此管理。':'No saved plans yet. Generate a plan and select Save plan to manage it here.','请输入方案名称：':'Enter a plan name:','方案已保存，可在“方案管理”中打开。':'Plan saved. Open it from Saved plan management.','PDF 方案预览':'PDF plan preview','确认后可下载或打印。':'Download or print from this preview.','标准车辆装车方案':'Standard vehicle loading plan','PDF 组件加载失败，请检查网络后重试。':'The PDF component could not load. Check your network and try again.','浏览器阻止了打印预览窗口，请允许弹出窗口后重试。':'Your browser blocked the print preview window. Allow pop-ups and try again.','容器方案':'Container plan','正在查看':'Viewing','查看 3D 方案':'View 3D plan','利用率':'utilization','未装载':'Unloaded'});
Object.assign(I18N.th, {'自定义':'กำหนดเอง','每页条数（1-5000）':'จำนวนต่อหน้า (1–5000)','请至少选择一个容器和一种货物。':'เลือกภาชนะอย่างน้อยหนึ่งรายการและสินค้าอย่างน้อยหนึ่งรายการ','竖放':'ตั้งตรง','竖放（高度朝上）':'ตั้งตรง (ความสูงขึ้น)','纵向':'ตามยาว','横向':'ตามกว้าง','竖向':'แนวตั้ง','列':'คอลัมน์','排':'แถว','层':'ชั้น','合理装载':'บรรทุกได้จริง','已生成':'สร้างแล้ว','个容器方案':'แผนภาชนะ','当前展示':'กำลังแสดง','空间不足':'พื้นที่ไม่พอ','空间':'พื้นที่','长':'ยาว','宽':'กว้าง','高':'สูง','共':'รวม','条记录':'รายการ','选择':'เลือก','确定删除':'ลบ','条档案':'ข้อมูล','个装载方案':'แผนที่บันทึก','还没有保存的装载方案。生成方案后点击“保存方案”即可在此管理。':'ยังไม่มีแผนที่บันทึก สร้างแผนแล้วเลือกบันทึกเพื่อจัดการที่นี่','请输入方案名称：':'ระบุชื่อแผน:','方案已保存，可在“方案管理”中打开。':'บันทึกแผนแล้ว เปิดได้จากหน้าจัดการแผน','PDF 方案预览':'ตัวอย่างแผน PDF','确认后可下载或打印。':'ดาวน์โหลดหรือพิมพ์ได้จากหน้าตัวอย่างนี้','标准车辆装车方案':'แผนบรรทุกมาตรฐาน','PDF 组件加载失败，请检查网络后重试。':'ไม่สามารถโหลดส่วนประกอบ PDF โปรดตรวจสอบเครือข่ายแล้วลองใหม่','浏览器阻止了打印预览窗口，请允许弹出窗口后重试。':'เบราว์เซอร์บล็อกหน้าต่างพิมพ์ โปรดอนุญาตป๊อปอัปแล้วลองใหม่','容器方案':'แผนภาชนะ','正在查看':'กำลังดู','查看 3D 方案':'ดูแผน 3 มิติ','利用率':'อัตราใช้พื้นที่'});
function openDialog(record=null){const kind=record?.kind||state.archive,isContainer=kind==='containers';$('#archiveForm').reset();$('#recordId').value=record?.id||'';$('#recordKind').value=kind;$('#modalTitle').textContent=record?t('编辑档案'):`${t('新增档案')} ${isContainer?t('容器'):t('货物')}`;$('#modalEyebrow').textContent=record?'EDIT RECORD':'NEW RECORD';const fields={recordName:'name',recordType:'type',recordShape:'shape',recordL:'l',recordW:'w',recordH:'h',recordWeight:'weight',recordReserve:'reserve',recordPrice:'price',recordColor:'color'};Object.entries(fields).forEach(([id,key])=>{if(record)$('#'+id).value=record[key]??'';});const piecesField=$('#recordPiecesField'),pieces=$('#recordPieces');piecesField.classList.toggle('hidden',isContainer);pieces.required=!isContainer;pieces.value=isContainer?1:(record?.pieces||1);const type=$('#recordType');[...type.options].forEach(o=>o.hidden=isContainer?['单体货物','套装货物'].includes(o.value):['车厢','箱子','桶','托盘'].includes(o.value));type.value=record?.type||(isContainer?'车厢':'单体货物');$('#recordShape').value=record?.shape||(type.value==='桶'?'cylinder':'box');$('#archiveDialog').showModal();applyLanguage();}
function saveDialog(event){event.preventDefault();const kind=$('#recordKind').value,isContainer=kind==='containers',id=$('#recordId').value,fields={name:'recordName',type:'recordType',shape:'recordShape',l:'recordL',w:'recordW',h:'recordH',weight:'recordWeight',reserve:'recordReserve',price:'recordPrice',color:'recordColor'},record={id:id||uid(isContainer?'c':'g')};Object.entries(fields).forEach(([key,field])=>record[key]=['name','type','shape','color'].includes(key)?$('#'+field).value:+$('#'+field).value);record.pieces=isContainer?1:Math.max(1,+$('#recordPieces').value||1);const list=state[kind],index=list.findIndex(item=>item.id===id);if(index<0){if(!isContainer)record.quantity=1;list.push(record);}else list[index]={...list[index],...record};persistState();$('#archiveDialog').close();renderArchives();renderSelectors();}
async function importCSV(file){try{const bytes=new Uint8Array(await file.arrayBuffer());let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('gb18030').decode(bytes);}const [head,...rows]=parseCSV(text.replace(/^\uFEFF/,'')),keys=head.map(x=>x.trim());let count=0;rows.forEach(row=>{const x=Object.fromEntries(keys.map((k,i)=>[k,row[i]??''])),kind=x.kind==='containers'?'containers':'cargo';if(!x.name||!x.l||!x.w||!x.h)return;const rawType=String(x.type||'').trim(),type=rawType&& !rawType.includes('\uFFFD')?rawType:(kind==='containers'?'车厢':'单体货物');state[kind].push({id:uid(kind==='containers'?'c':'g'),name:x.name,type,shape:x.shape==='cylinder'?'cylinder':'box',l:+x.l,w:+x.w,h:+x.h,weight:+x.weight||0,pieces:kind==='cargo'?(+x.pieces||1):1,reserve:+x.reserve||0,price:+x.price||0,color:x.color||COLORS[(state[kind].length)%COLORS.length],quantity:kind==='cargo'?(+x.quantity||1):1});count++;});persistState();renderArchives();renderSelectors();showNotice(`${t('已导入')} ${count} ${t('条档案')}。`);}catch(error){console.error(error);showNotice(t('导入失败，请使用下载的 CSV 模板。'));}}
function bind(){
  $$('.nav-link').forEach(b=>b.addEventListener('click',()=>{const page=b.dataset.page;$$('.nav-link').forEach(x=>x.classList.toggle('active',x===b));$$('.page').forEach(x=>x.classList.toggle('active-page',x.id===page));window.scrollTo({top:0,behavior:'smooth'});if(page==='archives')renderArchives();if(page==='savedPlans')renderSavedPlans();if(page==='settings')renderSettings();applyLanguage();}));
  $$('[data-go-archives]').forEach(b=>b.addEventListener('click',()=>{state.archive=b.dataset.goArchives;selectedArchiveIds.clear();persistState();$('.nav-link[data-page="archives"]').click();$$('.archive-tabs button').forEach(x=>x.classList.toggle('active',x.dataset.archive===state.archive));renderArchives();}));
  $$('input[name="mode"]').forEach(x=>x.addEventListener('change',()=>$$('.mode-option').forEach(l=>l.classList.toggle('selected',l.querySelector('input').checked))));$('#calculate').addEventListener('click',generatePlan);$('#refreshPage').addEventListener('click',()=>location.reload());$('#containerSearch').addEventListener('input',requestSelectorRender);$('#cargoSearch').addEventListener('input',requestSelectorRender);
  $('#selectAllContainers').addEventListener('click',()=>{state.containers.forEach(c=>state.selectedContainers.add(c.id));persistState();renderSelectors();});$('#clearAllContainers').addEventListener('click',()=>{state.selectedContainers.clear();persistState();renderSelectors();});$('#resetContainers')?.addEventListener('click',()=>{state.selectedContainers.clear();persistState();renderSelectors();});$('#selectAllCargo').addEventListener('click',()=>{state.cargo.forEach(g=>state.selectedCargo.add(g.id));persistState();renderSelectors();});$('#clearAllCargo').addEventListener('click',()=>{state.selectedCargo.clear();persistState();renderSelectors();});
  $$('.view-buttons [data-view]').forEach(b=>b.addEventListener('click',()=>setCamera(b.dataset.view)));$('#resetCamera').addEventListener('click',()=>setCamera('iso'));$('#prevPlan').addEventListener('click',()=>{if(state.plan?.active>0){state.plan.active--;renderPlan();}});$('#nextPlan').addEventListener('click',()=>{if(state.plan&&state.plan.active<state.plan.plans.length-1){state.plan.active++;renderPlan();}});$('#fullscreenView').addEventListener('click',()=>{const target=$('#visualCard');if(document.fullscreenElement)document.exitFullscreen();else target.requestFullscreen?.();});document.addEventListener('fullscreenchange',()=>{const full=Boolean(document.fullscreenElement),button=$('#fullscreenView');button.textContent=full?'×':'⛶';button.title=full?t('退出全屏'):t('全屏放大');button.setAttribute('aria-label',button.title);fitThree();if(!full&&state.plan)setTimeout(()=>{fitThree();setCamera('iso');},120);});window.addEventListener('resize',fitThree);$('#savePlan').addEventListener('click',saveCurrentPlan);$('#exportImage').addEventListener('click',exportImage);$('#exportPdf').addEventListener('click',exportPdf);
  $('#tooltipToggle').addEventListener('change',event=>{state.settings.showCargoTooltip=event.target.checked;persistState();renderSettings();if(!event.target.checked)hideCargoHover();});$('#dimensionToggle').addEventListener('change',event=>{state.settings.showContainerDimensions=event.target.checked;persistState();renderSettings();if(state.plan)renderPlan();});$('#languageSelect').addEventListener('change',event=>{state.settings.language=event.target.value;persistState();applyLanguage();renderSelectors();if(state.plan)renderPlan();});$('#scrollTop').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));$('#scrollBottom').addEventListener('click',()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'smooth'}));
  $$('.archive-tabs button').forEach(b=>b.addEventListener('click',()=>{state.archive=b.dataset.archive;selectedArchiveIds.clear();persistState();$$('.archive-tabs button').forEach(x=>x.classList.toggle('active',x===b));renderArchives();}));$('#archiveSearch').addEventListener('input',renderArchives);$('#addArchive').addEventListener('click',()=>openDialog());$('#closeDialog').addEventListener('click',()=>$('#archiveDialog').close());$('#cancelDialog').addEventListener('click',()=>$('#archiveDialog').close());$('#archiveForm').addEventListener('submit',event=>{saveDialog(event);showSuccess(t('档案已保存。'));});$('#downloadTemplate').addEventListener('click',downloadTemplate);$('#importFile').addEventListener('change',e=>e.target.files[0]&&importCSV(e.target.files[0]));$('#selectAllArchive').addEventListener('change',e=>{const query=$('#archiveSearch').value.trim().toLowerCase(),filtered=state[state.archive].filter(r=>!query||`${r.name}${r.type}`.toLowerCase().includes(query));filtered.forEach(r=>e.target.checked?selectedArchiveIds.add(r.id):selectedArchiveIds.delete(r.id));renderArchives();});$('#bulkDeleteArchive').addEventListener('click',()=>removeArchives([...selectedArchiveIds]));$('#bulkDeletePlans').addEventListener('click',()=>removeSavedPlans([...selectedSavedPlanIds]));
  $('#appDialogForm').addEventListener('submit',event=>{event.preventDefault();const kind=$('#appDialog').dataset.kind;finishDialog(kind==='text'?$('#appDialogInput').value:true);});$('#appDialogClose').addEventListener('click',()=>finishDialog(false));$('#appDialogCancel').addEventListener('click',()=>finishDialog(false));$('#appDialog').addEventListener('cancel',event=>{event.preventDefault();finishDialog(false);});$('#pdfDownload').addEventListener('click',downloadPreviewPdf);$('#pdfPrint').addEventListener('click',printPreviewPdf);
}
function exportTable(rows,fileName){const csv=`\ufeff${rows.map(row=>row.map(csvEscape).join(',')).join('\n')}`;downloadBlob(csv,fileName,'text/csv;charset=utf-8');showSuccess(t('表格已导出。'));}
function exportArchivesTable(){const isContainer=state.archive==='containers',title=isContainer?t('容器档案'):t('货物档案'),headers=[t('档案类型'),t('名称'),t('类型'),t('形状'),t('长度 (mm)'),t('宽度 (mm)'),t('高度 (mm)'),t('重量 (kg)'),...(isContainer?[]:[t('小件数')]),t('装载余量 (%)'),t('价格 (元)')],rows=[headers,...state[state.archive].map(item=>[title,item.name,item.type,item.shape,item.l,item.w,item.h,item.weight||0,...(isContainer?[]:[item.pieces||1]),item.reserve||0,item.price||0])];exportTable(rows,exportFileName(`TOP BOX${title}`,'csv'));}
function exportSavedPlansTable(){const rows=[[t('方案名称'),t('保存时间'),t('容器数量'),t('容器名称'),t('装载包数'),t('装载小件数'),t('装载方式')],...state.savedPlans.map(saved=>{const plans=saved.plans||[],packages=plans.reduce((sum,plan)=>sum+plan.positions.length,0),pieces=plans.reduce((sum,plan)=>sum+plan.positions.reduce((n,item)=>n+(+item.pieces||0),0),0);return [saved.name,saved.createdAt,plans.length,plans.map(plan=>plan.container.name).join(' / '),packages,pieces,saved.mode];})];exportTable(rows,exportFileName(`TOP BOX${t('装载方案')}`,'csv'));}
function downloadTemplate(){const isContainer=state.archive==='containers',fields=isContainer?['kind','name','type','shape','l','w','h','weight','reserve','price','color','quantity']:['kind','name','type','shape','l','w','h','weight','pieces','reserve','price','color','quantity'],rows=isContainer?[fields,['containers','示例厢式货车','车厢','box',9600,2400,2500,6800,5,0,'#2563eb',1]]:[fields,['cargo','示例纸箱','单体货物','box',600,400,350,12,20,0,86,'#10b981',100],['cargo','示例圆桶','单体货物','cylinder',580,580,900,46,1,0,330,'#f97316',50]],csv=`\ufeff${rows.map(row=>row.map(csvEscape).join(',')).join('\n')}`;downloadBlob(csv,isContainer?'TOP BOX容器档案导入模板.csv':'TOP BOX货物档案导入模板.csv','text/csv;charset=utf-8');}
$('#exportArchives').addEventListener('click',exportArchivesTable);$('#exportSavedPlans').addEventListener('click',exportSavedPlansTable);
let enhancedSelectorTimer,successToastTimer;function showSuccess(message){const toast=$('#appToast');if(!toast)return;toast.textContent=message;toast.classList.remove('visible');void toast.offsetWidth;toast.classList.add('visible');clearTimeout(successToastTimer);successToastTimer=setTimeout(()=>toast.classList.remove('visible'),2000);}function requestSelectorRender(){clearTimeout(enhancedSelectorTimer);enhancedSelectorTimer=setTimeout(renderSelectors,120);}
const renderPlanBase=renderPlan;renderPlan=function(){renderPlanBase();if(!state.plan)return;const plan=state.plan.plans[state.plan.active],c=plan.container,maxX=plan.positions.reduce((m,p)=>Math.max(m,p.x+p.l),0),maxY=plan.positions.reduce((m,p)=>Math.max(m,p.y+p.w),0),maxZ=plan.positions.reduce((m,p)=>Math.max(m,p.z+p.h),0),remaining={l:Math.max(0,c.l-maxX),w:Math.max(0,c.w-maxY),h:Math.max(0,c.h-maxZ)};$('#freeSpaceBadge').textContent='';$('#freeSpaceDetails').innerHTML=`<div class="free-space-row"><span>${t('长')} ${remaining.l} mm</span><span>${t('宽')} ${remaining.w} mm</span><span>${t('高')} ${remaining.h} mm</span></div>`;};
const renderPlanDimensionsBase=renderPlan;renderPlan=function(){renderPlanDimensionsBase();$('#containerDimensionLabels')?.classList.add('hidden');};
/* v2.2 — archive workflow, selection hints, and unloaded vehicle recommendations. */
Object.assign(I18N.en,{'导出方案PDF':'Export Plan PDF','可多选货物':'Multiple cargo allowed','仅单选货物':'Single cargo only','暂未选择':'Nothing selected','已生成新装载方案，请查看':'New loading plan generated. Please review it.','额外车辆装载建议':'Additional vehicle loading recommendation','查看额外车辆方案':'View additional vehicle plans','建议增加':'Suggested additional vehicles','辆':'vehicles','仍未能装载':'Still cannot be loaded','无可用车厢档案可供建议。':'No box-truck records are available for a recommendation.','数量':'Quantity','车厢':'Box truck','容器合理装载体积会依尺寸与装载余量自动计算。':'Usable container volume is calculated from dimensions and loading reserve.','货物不需要填写装载余量。':'Cargo does not require a loading reserve.'});
Object.assign(I18N.th,{'导出方案PDF':'ส่งออกแผน PDF','可多选货物':'เลือกสินค้าได้หลายรายการ','仅单选货物':'เลือกสินค้าได้หนึ่งรายการ','暂未选择':'ยังไม่ได้เลือก','已生成新装载方案，请查看':'สร้างแผนบรรทุกใหม่แล้ว โปรดตรวจสอบ','额外车辆装载建议':'คำแนะนำรถเพิ่มเติม','查看额外车辆方案':'ดูแผนรถเพิ่มเติม','建议增加':'แนะนำให้เพิ่ม','辆':'คัน','仍未能装载':'ยังไม่สามารถบรรทุกได้','无可用车厢档案可供建议。':'ไม่มีข้อมูลรถตู้สำหรับคำแนะนำ','数量':'จำนวน','车厢':'รถตู้','容器合理装载体积会依尺寸与装载余量自动计算。':'ปริมาตรบรรทุกที่ใช้ได้คำนวณจากขนาดและพื้นที่สำรอง','货物不需要填写装载余量。':'สินค้าไม่ต้องระบุพื้นที่สำรอง'});
const applyLanguageV22Base=applyLanguage;applyLanguage=function(){applyLanguageV22Base();const copy={'.brand small':'货物装载配货平台','.nav-link[data-page="workspace"]':'装载方案','.nav-link[data-page="archives"]':'档案管理','.nav-link[data-page="savedPlans"]':'方案管理','.nav-link[data-page="settings"]':'设置','.nav-link[data-page="updates"]':'更新日志','#exportPdf':'导出方案PDF'};Object.entries(copy).forEach(([selector,key])=>{const node=$(selector);if(node)node.textContent=t(key);});const placeholders={containerSearch:'搜索容器名称或类型',cargoSearch:'多个关键词以英文逗号分隔',archiveSearch:'按名称、类型搜索'};Object.entries(placeholders).forEach(([id,key])=>$('#'+id)?.setAttribute('placeholder',t(key)));};
const openDialogV22Base=openDialog;openDialog=function(record=null){openDialogV22Base(record);const isContainer=$('#recordKind').value==='containers',piecesField=$('#recordPiecesField'),reserveField=$('#archiveDialog label:has(#recordReserve)'),note=$('#archiveDialog .form-note');piecesField?.classList.toggle('hidden',isContainer);reserveField?.classList.toggle('hidden',!isContainer);if(record){$('#modalTitle').textContent=t(isContainer?'修改容器':'修改货物');$('#modalEyebrow').textContent='EDIT RECORD';}if(note)note.textContent=t(isContainer?'容器合理装载体积会依尺寸与装载余量自动计算。':'货物不需要填写装载余量。');};
const saveDialogV22Base=saveDialog;saveDialog=function(event){if($('#recordKind').value==='cargo')$('#recordReserve').value='0';saveDialogV22Base(event);};
const renderSelectorsV22Base=renderSelectors;renderSelectors=function(){renderSelectorsV22Base();const updateBadge=(id,records,ids)=>{const names=records.filter(item=>ids.has(item.id)).map(item=>item.name),badge=$('#'+id);if(!badge)return;badge.textContent=`${t('已选')} ${names.length} ${t('项')}`;badge.removeAttribute('data-selection-tooltip');badge.removeAttribute('title');badge.dataset.selectedNames=names.join('、');};updateBadge('selectedContainerCount',state.containers,state.selectedContainers);updateBadge('selectedCargoCount',state.cargo,state.selectedCargo);};
const renderArchivesV22Base=renderArchives;renderArchives=function(){const data=state[state.archive],isContainer=state.archive==='containers',query=$('#archiveSearch').value.trim().toLowerCase(),filtered=data.filter(r=>!query||`${r.name}${r.type}`.toLowerCase().includes(query)),page=pageSlice(filtered,'archivePage','archiveSize');$('#containerTotal').textContent=state.containers.length;$('#cargoTotal').textContent=state.cargo.length;$('#archiveCount').textContent=`${t('共')} ${filtered.length} ${t('条记录')}`;$('#archiveTableHead').innerHTML=`<th><input id="selectAllArchive" type="checkbox" aria-label="${t('选择全部')}" /></th><th>${t('序号')}</th><th>${t('名称')}</th><th>${t('类型')}</th><th>${t('尺寸（长 × 宽 × 高）')}</th><th>${t('容积')}</th><th>${t('重量')}</th>${isContainer?'':`<th>${t('小件数')}</th>`}<th>${t('颜色')}</th><th></th>`;const columns=isContainer?9:10;$('#archiveRows').innerHTML=page.rows.map((r,index)=>`<tr><td><input class="archive-select" data-select-archive="${r.id}" type="checkbox" ${selectedArchiveIds.has(r.id)?'checked':''} aria-label="${t('选择')} ${escapeHtml(r.name)}"></td><td class="serial-number">${(state.ui.archivePage-1)*page.size+index+1}</td><td><b>${escapeHtml(r.name)}</b></td><td><span class="type-pill ${typeTone(r.type)}">${escapeHtml(r.type)}</span></td><td>${r.l} × ${r.w} × ${r.h} mm</td><td>${fmtArchiveVolume(isContainer?usableVolume(r):cubicMeters(r))}</td><td>${r.weight||0} kg</td>${isContainer?'':`<td>${r.pieces} ${t('件')}</td>`}<td><i class="color-pill" style="background:${r.color}"></i></td><td><span class="row-actions"><button data-edit="${r.id}">${t('编辑')}</button><button class="delete" data-delete="${r.id}">${t('删除')}</button></span></td></tr>`).join('')||`<tr><td colspan="${columns}"><div class="empty-state">${t('没有匹配的档案')}</div></td></tr>`;const all=$('#selectAllArchive');all.checked=filtered.length>0&&filtered.every(r=>selectedArchiveIds.has(r.id));all.indeterminate=filtered.some(r=>selectedArchiveIds.has(r.id))&&!all.checked;all.addEventListener('change',event=>{filtered.forEach(r=>event.target.checked?selectedArchiveIds.add(r.id):selectedArchiveIds.delete(r.id));renderArchives();});$$('[data-select-archive]').forEach(b=>b.addEventListener('change',()=>{b.checked?selectedArchiveIds.add(b.dataset.selectArchive):selectedArchiveIds.delete(b.dataset.selectArchive);renderArchives();}));$$('[data-edit]').forEach(b=>b.addEventListener('click',()=>openDialog(data.find(r=>r.id===b.dataset.edit))));$$('[data-delete]').forEach(b=>b.addEventListener('click',()=>removeArchives([b.dataset.delete])));renderListPager('archivePager',page,filtered.length,'archivePage','archiveSize',renderArchives);updateArchiveBulkButton();applyLanguage();};
const renderSavedPlansV22Base=renderSavedPlans;renderSavedPlans=function(){renderSavedPlansV22Base();const host=$('#savedPlansList');if(!host)return;const head=document.createElement('div');head.className='saved-plan-list-head';head.innerHTML=`<span></span><span>${t('序号')}</span><span>${t('方案名称')}</span><span>${t('数量')}</span>`;host.prepend(head);$$('.saved-plan-card',host).forEach(card=>{card.classList.add('saved-plan-row');const checkbox=$('.plan-select',card),serial=$('.plan-sequence',card);if(checkbox&&serial){card.insertBefore(checkbox,card.firstChild);card.insertBefore(serial,checkbox.nextSibling);}});};
function buildExtraVehiclePlans(unplaced){const trucks=state.containers.filter(c=>c.type==='车厢').slice().sort((a,b)=>usableVolume(a)-usableVolume(b)||a.l-b.l||a.w-b.w||a.h-b.h),counts=new Map();unplaced.forEach(item=>counts.set(item.id,(counts.get(item.id)||0)+1));const makeCargo=()=>[...counts].filter(([,count])=>count>0).map(([id,count])=>({...state.cargo.find(g=>g.id===id),quantity:count}));const plans=[];for(let run=0;run<20&&[...counts.values()].some(Boolean);run++){const options=trucks.map(container=>({container,plan:packContainer(container,makeCargo(),'specified')})).filter(option=>option.plan.positions.length);if(!options.length)break;const selected=options[0];plans.push(selected.plan);selected.plan.placedCount.forEach((count,id)=>counts.set(id,Math.max(0,(counts.get(id)||0)-count)));}const remaining=[...counts].flatMap(([id,count])=>Array.from({length:count},()=>state.cargo.find(g=>g.id===id))).filter(Boolean);return {plans,remaining};}
function showExtraVehiclePlans(recommendation){const {plans,remaining}=recommendation;if(!plans.length){showNotice(t('无可用车厢档案可供建议。'),t('额外车辆装载建议'));return;}showDialog({title:t('额外车辆装载建议'),message:`${t('建议增加')} ${plans.length} ${t('辆')} ${t('车厢')}`,kind:'preview',reports:[]});$('#pdfDownload').classList.add('hidden');$('#pdfPrint').classList.add('hidden');$('#pdfPreview').innerHTML=`<div class="extra-vehicle-plans">${plans.map((plan,index)=>{const details=[...plan.placedCount].filter(([,count])=>count).map(([id,count])=>{const cargo=state.cargo.find(g=>g.id===id);return `<li><b>${escapeHtml(cargo?.name||id)}</b><span>${count} ${t('包')} / ${(count*(+cargo?.pieces||1)).toLocaleString()} ${t('件')}</span><small>${placementDetail(cargo,plan)}</small></li>`;}).join('');return `<article class="extra-vehicle-card"><div><b>${t('车厢')} ${index+1}</b><h3>${escapeHtml(plan.container.name)}</h3><p>${plan.container.l} × ${plan.container.w} × ${plan.container.h} mm · ${Number(plan.utilization||0).toFixed(2)}%</p></div><ul>${details}</ul></article>`;}).join('')}${remaining.length?`<p class="extra-remaining">${t('仍未能装载')}：${remaining.length} ${t('包')} / ${remaining.reduce((sum,item)=>sum+(+item.pieces||0),0).toLocaleString()} ${t('件')}</p>`:''}</div>`;}
const renderPlanV22Base=renderPlan;renderPlan=function(){renderPlanV22Base();if(!state.plan)return;const plan=state.plan.plans[state.plan.active],unplaced=plan.unplaced||[],unloadedPieces=unplaced.reduce((sum,item)=>sum+(+item.pieces||0),0),recommendation=buildExtraVehiclePlans(unplaced);$('#unloadedBadge').textContent=`${unplaced.length} ${t('包')} / ${unloadedPieces.toLocaleString()} ${t('件')}`;if(unplaced.length){const button=document.createElement('button');button.type='button';button.id='viewExtraVehicles';button.className='extra-vehicle-button';button.textContent=`${t('查看额外车辆方案')} (${recommendation.plans.length})`;button.addEventListener('click',()=>showExtraVehiclePlans(recommendation));$('#unloadedDetails').append(button);}applyLanguage();};
const showSuccessV22Base=showSuccess;showSuccess=function(message,duration=2000){const toast=$('#appToast');if(!toast)return;toast.textContent=message;toast.classList.remove('visible');void toast.offsetWidth;toast.classList.add('visible');clearTimeout(successToastTimer);successToastTimer=setTimeout(()=>toast.classList.remove('visible'),duration);};
const generatePlanV22Base=generatePlan;generatePlan=function(){const containers=state.containers.filter(c=>state.selectedContainers.has(c.id)),cargo=state.cargo.filter(g=>state.selectedCargo.has(g.id));if(!containers.length||!cargo.length){showNotice(t('请至少选择一个容器和一种货物。'));return;}state.hiddenCargoIds.clear();state.plan={plans:containers.map(c=>packContainer(c,cargo,activeMode())),active:0,mode:activeMode()};showSuccess(t('已生成新装载方案，请查看'),3000);$('#results').classList.remove('hidden');renderPlan();$('#results').scrollIntoView({behavior:'smooth',block:'start'});};
let v22ArchiveTarget=null;$$('[data-go-archives]').forEach(button=>button.addEventListener('click',()=>{v22ArchiveTarget=button.dataset.goArchives;},true));$('.nav-link[data-page="archives"]')?.addEventListener('click',()=>{if(!v22ArchiveTarget){state.archive='containers';selectedArchiveIds.clear();persistState();$$('.archive-tabs button').forEach(tab=>tab.classList.toggle('active',tab.dataset.archive==='containers'));renderArchives();}v22ArchiveTarget=null;});
/* v2.2.1 — focused management pages, stronger unloaded summary, grouped updates. */
Object.assign(I18N.en,{'查看未装载货物的额外车辆方案':'View extra vehicle plans for unloaded cargo','更新记录':'updates'});Object.assign(I18N.th,{'查看未装载货物的额外车辆方案':'ดูแผนรถเพิ่มเติมสำหรับสินค้าที่ยังไม่ได้บรรทุก','更新记录':'รายการอัปเดต'});
const renderPlanV221Base=renderPlan;renderPlan=function(){renderPlanV221Base();if(!state.plan)return;const plan=state.plan.plans[state.plan.active],unplaced=plan.unplaced||[],pieces=unplaced.reduce((sum,item)=>sum+(+item.pieces||0),0),recommendation=buildExtraVehiclePlans(unplaced);$('#unloadedBadge').textContent=`${unplaced.length.toLocaleString()} ${t('包')} / ${pieces.toLocaleString()} ${t('件')}`;$('#viewExtraVehicles')?.remove();if(unplaced.length){const button=document.createElement('button');button.type='button';button.id='viewExtraVehicles';button.className='extra-vehicle-button';button.textContent=`${t('查看未装载货物的额外车辆方案')} · ${t('建议增加')} ${recommendation.plans.length} ${t('辆')}`;button.addEventListener('click',()=>showExtraVehiclePlans(recommendation));$('#unloadedDetails').append(button);}};
function groupUpdateLogs(){const page=$('#updates');if(!page||page.dataset.groupedUpdates==='true')return;const articles=$$('[data-release-date]',page);if(!articles.length)return;const groups=new Map();articles.forEach(article=>{const date=article.dataset.releaseDate;if(!groups.has(date))groups.set(date,[]);groups.get(date).push(article);});const host=document.createElement('div');host.className='update-groups';let first=true;groups.forEach((records,date)=>{const details=document.createElement('details');details.className='update-date-group';details.open=first;first=false;details.innerHTML=`<summary><span>${date}</span><b>${records.length} ${t('更新记录')}</b></summary><div class="update-date-records"></div>`;const recordHost=$('.update-date-records',details);records.forEach(record=>recordHost.append(record));host.append(details);});const oldCard=$('.changelog-card',page);page.insertBefore(host,oldCard||null);if(oldCard&&!oldCard.children.length)oldCard.remove();page.dataset.groupedUpdates='true';}
function syncGroupedUpdateLogs(){ $$('.update-date-group').forEach(group=>{const visible=$$('[data-release-date]',group).some(record=>!record.classList.contains('release-hidden'));group.classList.toggle('hidden',!visible);});}
groupUpdateLogs();$('#updateDateFilter')?.addEventListener('change',()=>setTimeout(syncGroupedUpdateLogs,0));setTimeout(syncGroupedUpdateLogs,0);
$$('input[name="mode"]').forEach(input=>input.addEventListener('change',applyCargoModeRules));
$('#resetCargoSelection').addEventListener('click',resetCargoSelection);
Object.assign(I18N.en,{'按包数输入':'Enter packages','按小件数输入':'Enter pieces','包数':'Packages','折合':'Equivalent to','数量输入方式':'Quantity input mode','已生成':'Generated'});
Object.assign(I18N.th,{'按包数输入':'กรอกจำนวนแพ็ก','按小件数输入':'กรอกจำนวนชิ้น','包数':'จำนวนแพ็ก','折合':'เทียบเท่า','数量输入方式':'รูปแบบการกรอกจำนวน','已生成':'สร้างแล้ว'});
Object.assign(I18N.en,{'开发中':'In development'});Object.assign(I18N.th,{'开发中':'กำลังพัฒนา'});
Object.assign(I18N.en,{'容器内剩余空间':'Remaining container clearance','未利用空间':'Unused volume','示例厢式货车':'Sample box truck','示例纸箱':'Sample carton','示例圆桶':'Sample drum','长度 (mm)':'Length (mm)','宽度 / 直径 (mm)':'Width / diameter (mm)','高度 (mm)':'Height (mm)','单件重量 (kg)':'Unit weight (kg)','装载余量 (%)':'Loading reserve (%)','价格 (元)':'Price (CNY)','显示颜色':'Display color','形状':'Shape','方形':'Box','圆柱形':'Cylinder','拖动旋转 · 滚轮缩放 · 中键平移':'Drag to rotate · wheel to zoom · middle button to pan','返回顶部':'Back to top','前往底部':'Go to bottom','全屏放大':'Fullscreen','退出全屏':'Exit fullscreen','重置视角':'Reset view','正视图':'Front view','俯视图':'Top view','侧视图':'Side view','等距视图':'Isometric view'});Object.assign(I18N.th,{'容器内剩余空间':'ระยะว่างภายในภาชนะ','未利用空间':'ปริมาตรที่ไม่ได้ใช้','示例厢式货车':'รถตู้ตัวอย่าง','示例纸箱':'กล่องกระดาษตัวอย่าง','示例圆桶':'ถังตัวอย่าง','长度 (mm)':'ความยาว (มม.)','宽度 / 直径 (mm)':'ความกว้าง / เส้นผ่านศูนย์กลาง (มม.)','高度 (mm)':'ความสูง (มม.)','单件重量 (kg)':'น้ำหนักต่อชิ้น (กก.)','装载余量 (%)':'พื้นที่สำรอง (%)','价格 (元)':'ราคา (หยวน)','显示颜色':'สีที่แสดง','形状':'รูปทรง','方形':'ทรงสี่เหลี่ยม','圆柱形':'ทรงกระบอก','拖动旋转 · 滚轮缩放 · 中键平移':'ลากเพื่อหมุน · ล้อเพื่อซูม · ปุ่มกลางเพื่อเลื่อน','返回顶部':'กลับด้านบน','前往底部':'ไปด้านล่าง','全屏放大':'เต็มหน้าจอ','退出全屏':'ออกจากเต็มหน้าจอ','重置视角':'รีเซ็ตมุมมอง','正视图':'มุมหน้า','俯视图':'มุมบน','侧视图':'มุมด้านข้าง','等距视图':'มุมไอโซเมตริก'});
Object.assign(I18N.en,{'自定义每页条数':'Custom rows per page','每页条数 (1-5000)':'Rows per page (1–5000)','左键旋转 · 滚轮缩放 · 右键平移':'Left drag to rotate · wheel to zoom · right drag to pan','货物装载配货平台':'Cargo Loading & Allocation Platform','TOP BOX货物装载配货平台首页':'TOP BOX Cargo Loading & Allocation Platform home','TOP BOX货物装载配货平台版本记录。':'TOP BOX Cargo Loading & Allocation Platform release history.','更新日期':'Release date','全部日期':'All dates','全选':'Select all','取消全选':'Clear selection','已选':'Selected','项':'items','序号':'No.'});Object.assign(I18N.th,{'自定义每页条数':'กำหนดจำนวนต่อหน้า','每页条数 (1-5000)':'จำนวนต่อหน้า (1–5000)','左键旋转 · 滚轮缩放 · 右键平移':'ลากซ้ายเพื่อหมุน · ล้อเพื่อซูม · ลากขวาเพื่อเลื่อน','货物装载配货平台':'แพลตฟอร์มจัดการบรรทุกสินค้า','TOP BOX货物装载配货平台首页':'หน้าแรก TOP BOX แพลตฟอร์มจัดการบรรทุกสินค้า','TOP BOX货物装载配货平台版本记录。':'ประวัติเวอร์ชัน TOP BOX แพลตฟอร์มจัดการบรรทุกสินค้า','更新日期':'วันที่อัปเดต','全部日期':'ทุกวันที่','全选':'เลือกทั้งหมด','取消全选':'ยกเลิกทั้งหมด','已选':'เลือกแล้ว','项':'รายการ','序号':'ลำดับ'});Object.assign(I18N.en,{'修改容器':'Modify container','修改货物':'Modify cargo'});Object.assign(I18N.th,{'修改容器':'แก้ไขภาชนะ','修改货物':'แก้ไขสินค้า'});const applyLanguageBase=applyLanguage;applyLanguage=function(){applyLanguageBase();document.title=t('TOP BOX货物装载配货平台');};const setCameraBase=setCamera;setCamera=function(view){if(!state.plan)return;const p=state.plan.plans[state.plan.active],s=7/Math.max(p.container.l,p.container.w,p.container.h),loadTop=Math.max(p.container.h,...p.positions.map(item=>item.z+item.h)),center=new THREE.Vector3(p.container.l*s/2,loadTop*s/2,p.container.w*s/2),size=Math.max(p.container.l*s,p.container.w*s,loadTop*s),d=Math.max(7.5,size*1.55),positions={front:[center.x,center.y,center.z+d],top:[center.x,center.y+d,center.z],side:[center.x+d,center.y,center.z],iso:[center.x+d*.82,center.y+d*.76,center.z+d*.82]};camera.position.set(...positions[view]);controls.target.copy(center);controls.update();scheduleThreeRender();$$('.view-buttons [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));};const filterUpdates=()=>{const value=$('#updateDateFilter')?.value||'all';$$('[data-release-date]').forEach(article=>article.classList.toggle('release-hidden',value!=='all'&&article.dataset.releaseDate!==value));};const renderArchivesV261Base=renderArchives;renderArchives=function(){renderArchivesV261Base();$('#archiveRows')?.closest('table')?.classList.add('stable-archive-table');};renderSavedPlans=function(){const host=$('#savedPlansList'),page=pageSlice(state.savedPlans,'savedPlansPage','savedPlansSize');const rows=page.rows.map((saved,index)=>{const packages=saved.plans.reduce((sum,p)=>sum+p.positions.length,0),pieces=saved.plans.reduce((sum,p)=>sum+p.positions.reduce((s,x)=>s+(+x.pieces||0),0),0),serial=(state.ui.savedPlansPage-1)*page.size+index+1;return `<tr><td><input class="plan-select" data-select-plan="${saved.id}" type="checkbox" ${selectedSavedPlanIds.has(saved.id)?'checked':''} aria-label="${t('选择')} ${escapeHtml(saved.name)}"></td><td class="serial-number">${serial}</td><td><b>${escapeHtml(saved.name)}</b></td><td>${escapeHtml(saved.createdAt)}</td><td>${saved.plans.length} ${t('个容器方案')}</td><td>${packages} ${t('包')} / ${pieces.toLocaleString()} ${t('件')}</td><td><span class="row-actions"><button data-open-saved="${saved.id}">${t('打开方案')}</button><button class="delete" data-delete-saved="${saved.id}">${t('删除')}</button></span></td></tr>`;}).join('');host.innerHTML=rows?`<div class="saved-plan-table-wrap"><table class="stable-plan-table"><thead><tr><th><input id="selectAllSavedPlans" type="checkbox" aria-label="${t('选择全部')}"></th><th>${t('序号')}</th><th>${t('方案名称')}</th><th>${t('保存时间')}</th><th>${t('容器数量')}</th><th>${t('数量')}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:`<div class="empty-state">${t('还没有保存的装载方案。生成方案后点击“保存方案”即可在此管理。')}</div>`;const all=$('#selectAllSavedPlans');if(all){all.checked=page.rows.length>0&&page.rows.every(item=>selectedSavedPlanIds.has(item.id));all.indeterminate=page.rows.some(item=>selectedSavedPlanIds.has(item.id))&&!all.checked;all.addEventListener('change',event=>{page.rows.forEach(item=>event.target.checked?selectedSavedPlanIds.add(item.id):selectedSavedPlanIds.delete(item.id));renderSavedPlans();});}renderListPager('savedPlansPager',page,state.savedPlans.length,'savedPlansPage','savedPlansSize',renderSavedPlans);$$('[data-open-saved]').forEach(button=>button.addEventListener('click',()=>openSavedPlan(button.dataset.openSaved)));$$('[data-select-plan]').forEach(button=>button.addEventListener('change',()=>{button.checked?selectedSavedPlanIds.add(button.dataset.selectPlan):selectedSavedPlanIds.delete(button.dataset.selectPlan);renderSavedPlans();}));$$('[data-delete-saved]').forEach(button=>button.addEventListener('click',()=>removeSavedPlans([button.dataset.deleteSaved])));updatePlanBulkButton();applyLanguage();};document.addEventListener('pointerdown',event=>{if(event.button===1&&event.target.closest('#threeCanvas')){event.preventDefault();event.stopImmediatePropagation();}},true);bind();const displaySettingsButton=$('#displaySettingsButton'),visualSettingsPopover=$('#visualSettingsPopover');displaySettingsButton?.addEventListener('click',event=>{event.stopPropagation();const open=visualSettingsPopover.classList.toggle('open');displaySettingsButton.setAttribute('aria-expanded',String(open));});document.addEventListener('click',event=>{if(!visualSettingsPopover?.contains(event.target)&&!displaySettingsButton?.contains(event.target)){visualSettingsPopover?.classList.remove('open');displaySettingsButton?.setAttribute('aria-expanded','false');}});$('#updateDateFilter')?.addEventListener('change',filterUpdates);filterUpdates();renderSelectors();renderArchives();renderSavedPlans();renderSettings();try{applyLanguage();}catch(error){console.error(error);}
/* v2.7.8 — keep enhanced UI helpers in the application scope. */
Object.assign(I18N.en,{'容器档案':'Container archives','货物档案':'Cargo archives','重置':'Reset','容器档案管理':'Container archive management','货物档案管理':'Cargo archive management','维护装载计算与 3D 可视化所需的基础数据。':'Maintain the base data used for loading calculations and 3D visualization.'});
Object.assign(I18N.th,{'容器档案':'ข้อมูลภาชนะ','货物档案':'ข้อมูลสินค้า','重置':'รีเซ็ต','容器档案管理':'จัดการข้อมูลภาชนะ','货物档案管理':'จัดการข้อมูลสินค้า','维护装载计算与 3D 可视化所需的基础数据。':'จัดการข้อมูลพื้นฐานสำหรับการคำนวณการบรรทุกและภาพสามมิติ'});
const applyLanguageV278Base=applyLanguage;applyLanguage=function(){applyLanguageV278Base();$$('.nav-link[data-page="archives"][data-archive-target]').forEach(button=>{button.textContent=t(button.dataset.archiveTarget==='containers'?'容器档案':'货物档案');});const reset=$('#resetContainers');if(reset)reset.textContent=t('重置');const heading=$('#archives .page-heading h1'),description=$('#archives .page-heading p');if(heading)heading.textContent=t(state.archive==='cargo'?'货物档案管理':'容器档案管理');if(description)description.textContent=t('维护装载计算与 3D 可视化所需的基础数据。');};
function activateArchiveSection(kind){state.archive=kind==='cargo'?'cargo':'containers';selectedArchiveIds.clear();persistState();$$('.archive-tabs button').forEach(tab=>tab.classList.toggle('active',tab.dataset.archive===state.archive));renderArchives();}
$$('.nav-link[data-page="archives"][data-archive-target]').forEach(button=>button.addEventListener('click',()=>{activateArchiveSection(button.dataset.archiveTarget);setTimeout(()=>activateArchiveSection(button.dataset.archiveTarget),0);},true));
document.addEventListener('click',event=>{const button=event.target.closest('#legend [data-toggle-legend]');if(!button||!state.plan)return;event.preventDefault();event.stopImmediatePropagation();const id=button.dataset.toggleLegend;state.hiddenCargoIds??=new Set();state.hiddenCargoIds.has(id)?state.hiddenCargoIds.delete(id):state.hiddenCargoIds.add(id);$$('#legend [data-toggle-legend]').forEach(item=>item.classList.toggle('muted-item',state.hiddenCargoIds.has(item.dataset.toggleLegend)));drawScene(state.plan.plans[state.plan.active]);},true);
}
// v2.6.4: display utilization from the actual loaded/available volume ratio.
const renderPlanV264Base=renderPlan;renderPlan=function(){renderPlanV264Base();const plan=state.plan?.plans?.[state.plan.active];if(!plan)return;const percent=actualUtilization(plan),used=actualUsedVolume(plan),available=actualAvailableVolume(plan);$('#utilizationPercent').textContent=`${percent.toFixed(2)}%`;$('#utilizationRing').style.background=`conic-gradient(var(--blue) ${percent*3.6}deg,#eaf0f6 0deg)`;$('#availableVolume').textContent=fmtVolume(available);$('#usedVolume').textContent=fmtVolume(used);};
// Expose the application bridge synchronously after all enhanced renderers load.
export const topboxApp = { state, renderSelectors: () => renderSelectors(), renderArchives: () => renderArchives(), renderSavedPlans: () => renderSavedPlans(), generatePlan: () => generatePlan(), openSavedPlan: id => openSavedPlan(id) };
window.TopBoxApp = topboxApp;
/* v2.8.4 — final output reconciliation.
   Older renderers are retained above for backwards-compatible behaviour.  This
   last layer deliberately owns the two user-facing calculated outputs so that
   no historical renderer can leave a rounded utilisation value or omit the
   package/piece conversion after an account refresh. */
function reconcileCargoQuantities(){
  $$('#cargoList .select-row').forEach(row=>{
    const input=$('.cargo-quantity, .cargo-pieces',row);
    if(!input)return;
    const cargo=state.cargo.find(item=>item.id===input.dataset.id);
    if(!cargo)return;
    const pieces=Math.max(1,+cargo.pieces||1),value=Math.max(1,+input.value||1),byPieces=input.classList.contains('cargo-pieces');
    let total=$('.quantity-total',row);
    if(!total){
      total=document.createElement('span');
      total.className='quantity-total';
      input.closest('.quantity')?.append(total);
    }
    total.textContent=byPieces?`${t('折合')} ${Math.ceil(value/pieces).toLocaleString()} ${t('包')}`:`${t('共')} ${(value*pieces).toLocaleString()} ${t('件')}`;
  });
}
function reconcileActualUtilization(){
  const plan=state.plan?.plans?.[state.plan.active];
  if(!plan?.container||!Array.isArray(plan.positions))return;
  const byId=new Map(state.cargo.map(item=>[item.id,item]));
  const used=plan.positions.reduce((total,item)=>total+cubicMeters(byId.get(item.id)||item),0);
  const available=usableVolume(plan.container);
  const percent=available>0?Math.max(0,Math.min(100,used/available*100)):0;
  const percentage=$('#utilizationPercent'),ring=$('#utilizationRing');
  if(percentage)percentage.textContent=`${percent.toFixed(2)}%`;
  if(ring)ring.style.background=`conic-gradient(var(--blue) ${percent*3.6}deg,#eaf0f6 0deg)`;
  const availableNode=$('#availableVolume'),usedNode=$('#usedVolume');
  const availableText=fmtVolume(available),usedText=fmtVolume(used);
  if(availableNode&&availableNode.textContent!==availableText)availableNode.textContent=availableText;
  if(usedNode&&usedNode.textContent!==usedText)usedNode.textContent=usedText;
}
function reconcileCalculatedOutputs(){reconcileCargoQuantities();reconcileActualUtilization();}
const renderSelectorsV284Base=renderSelectors;
renderSelectors=function(){renderSelectorsV284Base();reconcileCalculatedOutputs();};
const renderPlanV284Base=renderPlan;
renderPlan=function(){renderPlanV284Base();reconcileCalculatedOutputs();};
window.TopBoxApp.renderSelectors=()=>renderSelectors();
window.TopBoxApp.generatePlan=()=>generatePlan();
renderSelectors();
renderExactUtilization();
/* The mode controls belong to the standalone selector too.  Capture this
   before older compatibility listeners can redraw an obsolete cargo row. */
document.addEventListener('click',event=>{
  const button=event.target.closest('#quantityInputMode [data-quantity-mode]');
  if(!button||button.disabled)return;
  event.preventDefault();event.stopImmediatePropagation();
  const next=button.dataset.quantityMode;
  if(next===state.settings.quantityInputMode)return;
  state.settings.quantityInputMode=next;
  persistState();renderSelectors();
},true);

// v3.1.5 final ownership is installed after the archive import handler.
// (Kept at the physical end of this file so compatibility code cannot replace it.)
if(typeof window!=='undefined'&&typeof renderSelectorsV315==='function'){
  const renderArchivesV315EndBase=renderArchives;
  renderArchives=function(){renderArchivesV315EndBase();syncPalletLauncherV315();};
  renderSelectors=function(){renderSelectorsV315();};
  renderCargoSelectorV296=renderSelectorsV315;
  scheduleCargoSelectorV296=function(){renderSelectorsV315();requestAnimationFrame(renderSelectorsV315);};
  window.TopBoxApp.renderSelectors=()=>renderSelectorsV315();
  renderSelectorsV315();
  syncPalletLauncherV315();
}

/* v3.1.7 absolute final fleet owner.  Keep below every historical layer. */
function buildExtraVehiclePlansV317Final(unplaced){
  const remaining=new Map();
  (Array.isArray(unplaced)?unplaced:[]).forEach(item=>{
    if(!item?.id)return;
    const record=state.cargo.find(cargo=>cargo.id===item.id)||item;
    const entry=remaining.get(item.id)||{record,count:0};
    entry.count+=Math.max(1,Math.floor(+(item.unplacedQuantity??item.unplacedCount??1)||1));
    remaining.set(item.id,entry);
  });
  const trucks=state.containers.filter(container=>container.type==='车厢').slice()
    .sort((a,b)=>usableVolume(b)-usableVolume(a)||b.l-a.l||b.w-a.w||b.h-a.h);
  const requested=()=>[...remaining.values()].filter(entry=>entry.count>0).map(entry=>({...entry.record,quantity:entry.count}));
  const total=()=>[...remaining.values()].reduce((sum,entry)=>sum+entry.count,0);
  const plans=[];
  for(let run=0;run<2000&&total()>0;run++){
    const wanted=total();
    const choices=trucks.map(container=>{const plan=packContainer(container,requested(),'specified'),loaded=[...plan.placedCount.values()].reduce((sum,count)=>sum+(+count||0),0);return{plan,loaded};}).filter(choice=>choice.loaded>0);
    if(!choices.length)break;
    const complete=choices.filter(choice=>choice.loaded===wanted);
    const selected=complete.length?complete.at(-1):choices[0];
    plans.push(selected.plan);
    let progress=0;
    selected.plan.placedCount.forEach((count,id)=>{const entry=remaining.get(id);if(!entry)return;const used=Math.min(entry.count,Math.max(0,+count||0));entry.count-=used;progress+=used;});
    if(!progress)break;
  }
  return{plans,remaining:[...remaining.values()].flatMap(entry=>Array.from({length:entry.count},()=>({...entry.record})))};
}
buildExtraVehiclePlans=buildExtraVehiclePlansV317Final;
buildExtraVehiclePlansV313=buildExtraVehiclePlansV317Final;
buildExtraVehiclePlansV314=buildExtraVehiclePlansV317Final;

/* v3.1.7 final ownership.  This block intentionally stays at the physical end
   of app.js so no historical compatibility layer can restore the old fleet
   recommendation algorithm. */
function buildExtraVehiclePlansV317(unplaced){
  const remaining=new Map();
  (Array.isArray(unplaced)?unplaced:[]).forEach(item=>{
    if(!item?.id)return;
    const record=state.cargo.find(cargo=>cargo.id===item.id)||item;
    const entry=remaining.get(item.id)||{record,count:0};
    // packContainer expands requested cargo into one unplaced entry per package.
    // Imported/saved records may instead carry an explicit unplaced count.
    entry.count+=Math.max(1,Math.floor(+(item.unplacedQuantity??item.unplacedCount??1)||1));
    remaining.set(item.id,entry);
  });
  const trucks=state.containers.filter(container=>container.type==='车厢').slice()
    .sort((a,b)=>usableVolume(b)-usableVolume(a)||b.l-a.l||b.w-a.w||b.h-a.h);
  const cargoForRemaining=()=>[...remaining.values()].filter(entry=>entry.count>0)
    .map(entry=>({...entry.record,quantity:entry.count}));
  const totalRemaining=()=>[...remaining.values()].reduce((sum,entry)=>sum+entry.count,0);
  const plans=[];
  for(let run=0;run<2000&&totalRemaining()>0;run++){
    const wanted=totalRemaining();
    const choices=trucks.map(container=>{
      const plan=packContainer(container,cargoForRemaining(),'specified');
      const loaded=[...plan.placedCount.values()].reduce((sum,count)=>sum+count,0);
      return {container,plan,loaded};
    }).filter(choice=>choice.loaded>0);
    if(!choices.length)break;
    // If one vehicle can finish the remainder, use the smallest such vehicle.
    // Otherwise take the largest vehicle and fill it as far as the real packing
    // algorithm permits, then repeat with the exact remaining package counts.
    const complete=choices.filter(choice=>choice.loaded===wanted);
    const selected=complete.length?complete.at(-1):choices[0];
    plans.push(selected.plan);
    let progress=0;
    selected.plan.placedCount.forEach((count,id)=>{
      const entry=remaining.get(id);if(!entry)return;
      const used=Math.min(entry.count,Math.max(0,+count||0));
      entry.count-=used;progress+=used;
    });
    if(!progress)break;
  }
  const unresolved=[...remaining.values()].flatMap(entry=>Array.from({length:entry.count},()=>({...entry.record})));
  return {plans,remaining:unresolved};
}
buildExtraVehiclePlans=buildExtraVehiclePlansV317;
buildExtraVehiclePlansV313=buildExtraVehiclePlansV317;
buildExtraVehiclePlansV314=buildExtraVehiclePlansV317;
if(typeof buildExtraVehiclePlansV316!=='undefined')buildExtraVehiclePlansV316=buildExtraVehiclePlansV317;

/* v3.1.6 final ownership — keep this after every historical compatibility
   layer so exported reports use the intended large-first / small-last fleet. */
function buildExtraVehiclePlansV316Final(unplaced){
  const records=new Map();
  (Array.isArray(unplaced)?unplaced:[]).forEach(item=>{
    if(!item?.id)return;
    const record=state.cargo.find(cargo=>cargo.id===item.id)||item;
    const entry=records.get(item.id)||{record,count:0};entry.count++;records.set(item.id,entry);
  });
  const trucks=state.containers.filter(container=>container.type==='车厢').slice()
    .sort((a,b)=>usableVolume(b)-usableVolume(a)||b.l-a.l||b.w-a.w||b.h-a.h);
  const makeCargo=()=>[...records.values()].filter(entry=>entry.count>0)
    .map(entry=>({...entry.record,quantity:entry.count}));
  const plans=[];
  for(let run=0;run<200&&[...records.values()].some(entry=>entry.count>0);run++){
    const remainingCount=[...records.values()].reduce((sum,entry)=>sum+entry.count,0);
    const choices=trucks.map(container=>({container,plan:packContainer(container,makeCargo(),'specified')}))
      .filter(choice=>choice.plan.positions.length>0);
    if(!choices.length)break;
    // Final vehicle: choose the smallest truck that fits every remaining item.
    const complete=choices.filter(choice=>choice.plan.positions.length===remainingCount);
    // Intermediate vehicle: fill the largest usable truck, then continue.
    const selected=complete.length?complete[complete.length-1]:choices[0];
    plans.push(selected.plan);
    selected.plan.placedCount.forEach((count,id)=>{
      const entry=records.get(id);if(entry)entry.count=Math.max(0,entry.count-count);
    });
  }
  const remaining=[...records.values()].flatMap(entry=>Array.from({length:entry.count},()=>entry.record));
  return {plans,remaining};
}
buildExtraVehiclePlansV313=buildExtraVehiclePlansV316Final;
buildExtraVehiclePlansV314=buildExtraVehiclePlansV316Final;
if(typeof buildExtraVehiclePlans==='function')buildExtraVehiclePlans=buildExtraVehiclePlansV316Final;

/* v3.1.6 — final additional-vehicle policy: use the largest useful truck for
   every full intermediate load, then the smallest truck that fits the final
   remainder in one trip. */
function buildExtraVehiclePlansV316(unplaced){
  const records=new Map();
  (Array.isArray(unplaced)?unplaced:[]).forEach(item=>{if(!item?.id)return;const record=state.cargo.find(cargo=>cargo.id===item.id)||item,entry=records.get(item.id)||{record,count:0};entry.count++;records.set(item.id,entry);});
  const trucks=state.containers.filter(container=>container.type==='车厢').slice().sort((a,b)=>usableVolume(b)-usableVolume(a)||b.l-a.l||b.w-a.w||b.h-a.h);
  const makeCargo=()=>[...records.values()].filter(entry=>entry.count>0).map(entry=>({...entry.record,quantity:entry.count}));
  const plans=[];
  for(let run=0;run<100&&[...records.values()].some(entry=>entry.count>0);run++){
    const remainingCount=[...records.values()].reduce((sum,entry)=>sum+entry.count,0);
    const choices=trucks.map(container=>({container,plan:packContainer(container,makeCargo(),'specified')})).filter(choice=>choice.plan.positions.length>0);
    if(!choices.length)break;
    const complete=choices.filter(choice=>choice.plan.positions.length===remainingCount);
    const selected=complete.length?complete[complete.length-1]:choices[0];
    plans.push(selected.plan);
    selected.plan.placedCount.forEach((count,id)=>{const entry=records.get(id);if(entry)entry.count=Math.max(0,entry.count-count);});
  }
  const remaining=[...records.values()].flatMap(entry=>Array.from({length:entry.count},()=>entry.record));
  return {plans,remaining};
}
if(typeof buildExtraVehiclePlans==='function')buildExtraVehiclePlans=buildExtraVehiclePlansV316;
if(typeof buildExtraVehiclePlansV313==='function')buildExtraVehiclePlansV313=buildExtraVehiclePlansV316;
if(typeof buildExtraVehiclePlansV314==='function')buildExtraVehiclePlansV314=buildExtraVehiclePlansV316;

// Expose the live state explicitly for the account and pallet modules.  The
// loader also imports this module dynamically, so this assignment avoids any
// dependency on module-export timing during the login screen bootstrap.
window.TopBoxApp=window.TopBoxApp||{};
Object.assign(window.TopBoxApp,{state,renderSelectors:()=>renderSelectorsV315(),renderArchives:()=>renderArchives(),renderSavedPlans:()=>renderSavedPlans(),generatePlan:()=>generatePlan(),openSavedPlan:id=>openSavedPlan(id)});

/* v2.9.3 final ownership: no compatibility renderer may run after this. */
renderSelectors=function(){renderSelectorsV293();renderExactUtilization();};
window.TopBoxApp.renderSelectors=()=>renderSelectors();
renderSelectors();

/* v2.9.3: one final renderer owns the selector. It never delegates to the
   historical renderer chain, so changing a mode cannot repaint old rows. */
function renderSelectorsV293(){
  const containerQuery=$('#containerSearch')?.value.trim().toLowerCase()||'';
  const cargoQuery=$('#cargoSearch')?.value.trim().toLowerCase()||'';
  const matches=(item,query)=>!query||query.split(',').map(value=>value.trim()).filter(Boolean).every(term=>`${item.name}${item.type}`.toLowerCase().includes(term));
  const containers=state.containers.filter(item=>matches(item,containerQuery));
  const cargo=state.cargo.filter(item=>matches(item,cargoQuery));
  const slice=(items,pageKey,sizeKey)=>{const size=Math.max(1,+state.ui[sizeKey]||20),pages=Math.max(1,Math.ceil(items.length/size));state.ui[pageKey]=Math.max(1,Math.min(state.ui[pageKey]||1,pages));return {rows:items.slice((state.ui[pageKey]-1)*size,state.ui[pageKey]*size),pages,size};};
  const containerPage=slice(containers,'containerPage','containerSize');
  const cargoPage=slice(cargo,'cargoPage','cargoSize');
  const specified=document.querySelector('input[name="mode"]:checked')?.value==='specified';
  const pieceMode=state.settings.quantityInputMode==='pieces';
  const modeHost=$('#quantityInputMode');
  $('#selectedContainerCount').textContent=`${t('已选')} ${state.selectedContainers.size} ${t('项')}`;
  $('#selectedCargoCount').textContent=`${t('已选')} ${state.selectedCargo.size} ${t('项')}`;
  if(modeHost)modeHost.innerHTML=`<button type="button" class="quantity-mode-button ${pieceMode?'':'active'}" data-quantity-mode="bags" aria-pressed="${!pieceMode}" ${specified?'':'disabled'}>${t('按包数输入')}</button><button type="button" class="quantity-mode-button ${pieceMode?'active':''}" data-quantity-mode="pieces" aria-pressed="${pieceMode}" ${specified?'':'disabled'}>${t('按小件数输入')}</button>`;
  $('#selectAllCargo').disabled=!specified;
  $('#containerList').innerHTML=containerPage.rows.map(item=>`<label class="select-row ${state.selectedContainers.has(item.id)?'checked':''}"><input class="container-check" data-id="${item.id}" type="checkbox" ${state.selectedContainers.has(item.id)?'checked':''}><span class="color-square" style="background:${item.color}"></span><span class="record-main"><b>${escapeHtml(item.name)}</b><small>${containerLabel(item)}</small></span><span class="record-extra">${escapeHtml(item.type)}</span></label>`).join('')||`<div class="empty-state">${t('没有匹配的容器')}</div>`;
  $('#cargoList').innerHTML=cargoPage.rows.map(item=>{
    const perPackage=Math.max(1,+item.pieces||1),bags=Math.max(1,+item.quantity||1),pieces=Math.max(1,+item.pieceQuantity||bags*perPackage),value=pieceMode?pieces:bags;
    const result=pieceMode?`${t('折合')} ${Math.ceil(pieces/perPackage).toLocaleString()} ${t('包')}`:`${t('共')} ${(bags*perPackage).toLocaleString()} ${t('件')}`;
    return `<div class="cargo-fresh-row ${state.selectedCargo.has(item.id)?'checked':''}" data-cargo-row="${item.id}"><input class="cargo-fresh-check" data-id="${item.id}" type="checkbox" ${state.selectedCargo.has(item.id)?'checked':''} aria-label="${t('选择')} ${escapeHtml(item.name)}"><span class="cargo-fresh-color" style="background:${item.color}"></span><span class="cargo-fresh-info"><b>${escapeHtml(item.name)}</b><small>${item.l} × ${item.w} × ${item.h} mm · ${cubicMeters(item).toFixed(4)} m³</small><small>${perPackage.toLocaleString()} ${t('件')}/${t('包')}</small></span><span class="cargo-fresh-control"><input class="cargo-fresh-input" data-id="${item.id}" type="number" min="1" value="${value}" aria-label="${escapeHtml(item.name)} ${pieceMode?t('小件数'):t('包数')}" ${specified?'':'disabled'}><span>${pieceMode?t('件'):t('包')}</span><strong>${result}</strong></span></div>`;
  }).join('')||`<div class="empty-state">${t('没有匹配的货物')}</div>`;
  const drawPager=(id,data,total,pageKey,sizeKey)=>{const host=$('#'+id);if(!host)return;host.innerHTML=`<span>${total?`${(state.ui[pageKey]-1)*data.size+1}-${Math.min(state.ui[pageKey]*data.size,total)}/${total}`:'0/0'}</span><button data-v293-page="${pageKey}" data-step="-1" ${state.ui[pageKey]<=1?'disabled':''}>‹</button><button data-v293-page="${pageKey}" data-step="1" ${state.ui[pageKey]>=data.pages?'disabled':''}>›</button><select data-v293-size="${sizeKey}">${[20,30,50,100,200,500,1000,2000].map(value=>`<option value="${value}" ${data.size===value?'selected':''}>${value}</option>`).join('')}</select>`;$$('[data-v293-page]',host).forEach(button=>button.addEventListener('click',()=>{state.ui[button.dataset.v293Page]+=+button.dataset.step;persistState();renderSelectors();}));$('[data-v293-size]',host)?.addEventListener('change',event=>{state.ui[sizeKey]=+event.target.value;state.ui[pageKey]=1;persistState();renderSelectors();});};
  drawPager('containerPager',containerPage,containers.length,'containerPage','containerSize');
  drawPager('cargoPager',cargoPage,cargo.length,'cargoPage','cargoSize');
  $$('.container-check').forEach(input=>input.addEventListener('change',()=>{input.checked?state.selectedContainers.add(input.dataset.id):state.selectedContainers.delete(input.dataset.id);persistState();renderSelectors();}));
  $$('.cargo-fresh-check').forEach(input=>input.addEventListener('change',()=>{if(input.checked&&!specified){state.selectedCargo.clear();state.selectedCargo.add(input.dataset.id);}else if(input.checked)state.selectedCargo.add(input.dataset.id);else state.selectedCargo.delete(input.dataset.id);persistState();renderSelectors();}));
  $$('.cargo-fresh-input').forEach(input=>{
    const sync=save=>{const item=state.cargo.find(value=>value.id===input.dataset.id);if(!item)return;const perPackage=Math.max(1,+item.pieces||1),amount=Math.max(1,+input.value||1);if(pieceMode){item.pieceQuantity=amount;item.quantity=Math.ceil(amount/perPackage);}else{item.quantity=amount;item.pieceQuantity=amount*perPackage;}input.value=amount;const output=input.closest('.cargo-fresh-control')?.querySelector('strong');if(output)output.textContent=pieceMode?`${t('折合')} ${Math.ceil(amount/perPackage).toLocaleString()} ${t('包')}`:`${t('共')} ${(amount*perPackage).toLocaleString()} ${t('件')}`;if(save)persistState();};
    input.addEventListener('input',()=>sync(false));input.addEventListener('change',()=>sync(true));
  });
  applyLanguage();
}
renderSelectors=function(){renderSelectorsV293();renderExactUtilization();};
window.TopBoxApp.renderSelectors=()=>renderSelectors();
renderSelectors();

/* v2.9.0 — standalone cargo selector.
   This deliberately does not reuse the historical .select-row markup.  It is
   installed after every compatibility renderer, so no legacy quantity note or
   absolute-position rule can appear in the cargo list. */
function cargoInputAllowed(){
  return document.querySelector('input[name="mode"]:checked')?.value !== 'full';
}
function renderStandaloneCargoRows(){
  const host=$('#cargoList');
  if(!host)return;
  const ids=[...host.querySelectorAll('[data-id]')].map(node=>node.dataset.id).filter((id,index,list)=>id&&list.indexOf(id)===index);
  const rows=ids.map(id=>state.cargo.find(item=>item.id===id)).filter(Boolean);
  if(!rows.length)return;
  const pieceMode=state.settings.quantityInputMode==='pieces';
  const enabled=cargoInputAllowed();
  host.innerHTML=rows.map(cargo=>{
    const perPackage=Math.max(1,+cargo.pieces||1);
    const bags=Math.max(1,+cargo.quantity||1);
    const pieces=Math.max(1,+cargo.pieceQuantity||bags*perPackage);
    const value=pieceMode?pieces:bags;
    const unit=pieceMode?t('件'):t('包');
    const result=pieceMode
      ? `${t('折合')} ${Math.ceil(pieces/perPackage).toLocaleString()} ${t('包')}`
      : `${t('共')} ${(bags*perPackage).toLocaleString()} ${t('件')}`;
    return `<div class="cargo-fresh-row ${state.selectedCargo.has(cargo.id)?'checked':''}" data-cargo-row="${cargo.id}">
      <input class="cargo-fresh-check" data-id="${cargo.id}" type="checkbox" ${state.selectedCargo.has(cargo.id)?'checked':''} aria-label="${t('选择')} ${escapeHtml(cargo.name)}">
      <span class="cargo-fresh-color" style="background:${cargo.color}"></span>
      <span class="cargo-fresh-info"><b>${escapeHtml(cargo.name)}</b><small>${cargo.l} × ${cargo.w} × ${cargo.h} mm · ${cubicMeters(cargo).toFixed(4)} m³</small><small>${perPackage.toLocaleString()} ${t('件')}/${t('包')}</small></span>
      <span class="cargo-fresh-control"><input class="cargo-fresh-input" data-id="${cargo.id}" type="number" min="1" value="${value}" aria-label="${escapeHtml(cargo.name)} ${pieceMode?t('小件数'):t('包数')}" ${enabled?'':'disabled'}><span>${unit}</span><strong>${result}</strong></span>
    </div>`;
  }).join('');
  $$('.cargo-fresh-check',host).forEach(checkbox=>checkbox.addEventListener('change',()=>{
    const id=checkbox.dataset.id;
    if(checkbox.checked&&!cargoInputAllowed()){state.selectedCargo.clear();state.selectedCargo.add(id);}
    else if(checkbox.checked)state.selectedCargo.add(id);
    else state.selectedCargo.delete(id);
    persistState();renderSelectors();
  }));
  $$('.cargo-fresh-input',host).forEach(input=>{
    const update=()=>{
      const cargo=state.cargo.find(item=>item.id===input.dataset.id);
      const perPackage=Math.max(1,+cargo?.pieces||1);
      const value=Math.max(1,+input.value||1);
      const result=input.closest('.cargo-fresh-control')?.querySelector('strong');
      if(result)result.textContent=pieceMode?`${t('折合')} ${Math.ceil(value/perPackage).toLocaleString()} ${t('包')}`:`${t('共')} ${(value*perPackage).toLocaleString()} ${t('件')}`;
    };
    input.addEventListener('input',update);
    input.addEventListener('change',()=>{
      const cargo=state.cargo.find(item=>item.id===input.dataset.id);
      if(!cargo)return;
      const perPackage=Math.max(1,+cargo.pieces||1),value=Math.max(1,+input.value||1);
      if(pieceMode){cargo.pieceQuantity=value;cargo.quantity=Math.ceil(value/perPackage);}
      else {cargo.quantity=value;cargo.pieceQuantity=value*perPackage;}
      input.value=value;persistState();update();
    });
  });
}
function renderExactUtilization(){
  const plan=state.plan?.plans?.[state.plan.active];
  if(!plan?.container||!Array.isArray(plan.positions))return;
  const byId=new Map(state.cargo.map(item=>[item.id,item]));
  const used=plan.positions.reduce((sum,item)=>sum+cubicMeters(byId.get(item.id)||item),0);
  const available=usableVolume(plan.container);
  const percent=available>0?Math.max(0,Math.min(100,used/available*100)):0;
  const text=`${percent.toFixed(2)}%`;
  const label=$('#utilizationPercent');
  if(label)label.textContent=text;
  const ring=$('#utilizationRing');
  if(ring)ring.style.background=`conic-gradient(var(--blue) ${percent*3.6}deg,#eaf0f6 0deg)`;
  const availableNode=$('#availableVolume'),usedNode=$('#usedVolume');
  if(availableNode)availableNode.textContent=fmtVolume(available);
  if(usedNode)usedNode.textContent=fmtVolume(used);
}
const renderSelectorsV290Base=renderSelectors;
renderSelectors=function(){renderSelectorsV290Base();renderStandaloneCargoRows();renderExactUtilization();};
const renderPlanV290Base=renderPlan;
renderPlan=function(){renderPlanV290Base();renderExactUtilization();};
window.TopBoxApp.renderSelectors=()=>renderSelectors();
window.TopBoxApp.generatePlan=()=>generatePlan();

/* v2.8.7: this is deliberately the final selector hook.  Earlier releases
   layered legacy renderers around one another; owning the last paint here
   prevents a stale renderer from putting a second quantity total back. */
const renderSelectorsV287Base=renderSelectors;
renderSelectors=function(){
  renderSelectorsV287Base();
  requestAnimationFrame(()=>{
    rebuildStableCargoRows();
    enforceFinalCalculatedOutputs();
  });
};
window.TopBoxApp.renderSelectors=()=>renderSelectors();

/* v2.8.6 — replace, rather than decorate, cargo rows after legacy rendering.
   This prevents a legacy quantity label from surviving beside the current one. */
function rebuildStableCargoRows(){
  const pieceMode=state.settings.quantityInputMode==='pieces';
  $$('#cargoList .select-row').forEach(row=>{
    const legacyInput=$('.cargo-quantity, .cargo-pieces',row);
    const id=legacyInput?.dataset.id;
    const cargo=state.cargo.find(item=>item.id===id);
    if(!cargo)return;
    const mode=pieceMode?'pieces':'bags';
    if(row.dataset.stableCargoId===id&&row.dataset.stableCargoMode===mode&&$$('.quantity-total',row).length===1)return;
    const perPackage=Math.max(1,+cargo.pieces||1);
    const bags=Math.max(1,+cargo.quantity||1);
    const pieces=Math.max(1,+cargo.pieceQuantity||bags*perPackage);
    const inputValue=pieceMode?pieces:bags;
    const unit=pieceMode?t('件'):t('包');
    const conversion=pieceMode
      ? `${t('折合')} ${Math.ceil(pieces/perPackage).toLocaleString()} ${t('包')}`
      : `${t('共')} ${(bags*perPackage).toLocaleString()} ${t('件')}`;
    row.dataset.stableCargoId=id;
    row.dataset.stableCargoMode=mode;
    row.classList.add('cargo-row-stable');
    row.innerHTML=`<input class="cargo-check" data-id="${id}" type="checkbox" ${state.selectedCargo.has(id)?'checked':''} aria-label="${t('选择')} ${escapeHtml(cargo.name)}"><span class="color-square" style="background:${cargo.color}"></span><span class="record-main"><b>${escapeHtml(cargo.name)}</b><small class="cargo-spec-line">${cargo.l} × ${cargo.w} × ${cargo.h} mm · ${cubicMeters(cargo).toFixed(4)} m³</small><small class="cargo-piece-line">${perPackage.toLocaleString()} ${t('件')}/${t('包')}</small></span><span class="quantity stable-quantity"><input class="${pieceMode?'cargo-pieces':'cargo-quantity'}" data-id="${id}" type="number" min="1" value="${inputValue}" aria-label="${escapeHtml(cargo.name)} ${pieceMode?t('小件数'):t('包数')}" ${cargoInputAllowed()?'':'disabled'}><span class="quantity-unit">${unit}</span><span class="quantity-total">${conversion}</span></span>`;
    const checkbox=$('.cargo-check',row);
    checkbox.addEventListener('change',()=>{
      if(checkbox.checked&&!cargoInputAllowed()){state.selectedCargo.clear();state.selectedCargo.add(id);}
      else if(checkbox.checked)state.selectedCargo.add(id);
      else state.selectedCargo.delete(id);
      persistState();renderSelectors();
    });
    const input=$('.cargo-quantity, .cargo-pieces',row),total=$('.quantity-total',row);
    const update=()=>{
      const value=Math.max(1,+input.value||1);
      total.textContent=pieceMode?`${t('折合')} ${Math.ceil(value/perPackage).toLocaleString()} ${t('包')}`:`${t('共')} ${(value*perPackage).toLocaleString()} ${t('件')}`;
    };
    input.addEventListener('input',update);
    input.addEventListener('change',()=>{
      const value=Math.max(1,+input.value||1);
      if(pieceMode){cargo.pieceQuantity=value;cargo.quantity=Math.ceil(value/perPackage);}
      else {cargo.quantity=value;cargo.pieceQuantity=value*perPackage;}
      input.value=value;persistState();update();
    });
  });
}
const renderSelectorsV286Base=renderSelectors;
renderSelectors=function(){renderSelectorsV286Base();requestAnimationFrame(rebuildStableCargoRows);};
requestAnimationFrame(rebuildStableCargoRows);
window.TopBoxApp.renderSelectors=()=>renderSelectors();

/* v2.8.5 — final, post-render presentation guard.
   Some legacy integrations can render after the main functions above.  Watch
   their DOM output and normalise the two calculated areas on the next frame. */
function enforceFinalCalculatedOutputs(){
  $$('#cargoList .select-row').forEach(row=>{
    const input=$('.cargo-quantity, .cargo-pieces',row);
    if(!input)return;
    const cargo=state.cargo.find(item=>item.id===input.dataset.id);
    if(!cargo)return;
    const perPackage=Math.max(1,+cargo.pieces||1);
    const value=Math.max(1,+input.value||1);
    const pieceMode=input.classList.contains('cargo-pieces');
    const desired=pieceMode
      ? `${t('折合')} ${Math.ceil(value/perPackage).toLocaleString()} ${t('包')}`
      : `${t('共')} ${(value*perPackage).toLocaleString()} ${t('件')}`;
    let output=$('.quantity-total',row);
    if(!output){
      output=document.createElement('span');
      output.className='quantity-total';
      input.closest('.quantity')?.append(output);
    }
    if(output.textContent!==desired)output.textContent=desired;
  });
  const plan=state.plan?.plans?.[state.plan.active];
  if(!plan?.container||!Array.isArray(plan.positions))return;
  const used=plan.positions.reduce((sum,item)=>sum+cubicMeters(item),0);
  const available=usableVolume(plan.container);
  const percent=available>0?Math.max(0,Math.min(100,used/available*100)):0;
  const percentage=$('#utilizationPercent');
  const value=`${percent.toFixed(2)}%`;
  if(percentage&&percentage.textContent!==value)percentage.textContent=value;
  const ring=$('#utilizationRing');
  if(ring)ring.style.background=`conic-gradient(var(--blue) ${percent*3.6}deg,#eaf0f6 0deg)`;
  const availableNode=$('#availableVolume'),usedNode=$('#usedVolume');
  const availableText=fmtVolume(available),usedText=fmtVolume(used);
  if(availableNode&&availableNode.textContent!==availableText)availableNode.textContent=availableText;
  if(usedNode&&usedNode.textContent!==usedText)usedNode.textContent=usedText;
}
let finalOutputFrame=0;
function scheduleFinalOutputGuard(){
  if(finalOutputFrame)return;
  finalOutputFrame=requestAnimationFrame(()=>{finalOutputFrame=0;enforceFinalCalculatedOutputs();});
}
const renderSelectorsV285Base=renderSelectors;
renderSelectors=function(){renderSelectorsV285Base();scheduleFinalOutputGuard();};
const renderPlanV285Base=renderPlan;
renderPlan=function(){renderPlanV285Base();scheduleFinalOutputGuard();};
new MutationObserver(scheduleFinalOutputGuard).observe(document.body,{childList:true,subtree:true,characterData:true});
scheduleFinalOutputGuard();
window.TopBoxApp.renderSelectors=()=>renderSelectors();
window.TopBoxApp.generatePlan=()=>generatePlan();

/* v2.9.0 final installation: runs after every retired compatibility layer. */
const renderSelectorsV290FinalBase=renderSelectors;
renderSelectors=function(){renderSelectorsV290FinalBase();renderStandaloneCargoRows();renderExactUtilization();};
const renderPlanV290FinalBase=renderPlan;
renderPlan=function(){renderPlanV290FinalBase();renderExactUtilization();};
window.TopBoxApp.renderSelectors=()=>renderSelectors();
window.TopBoxApp.generatePlan=()=>generatePlan();
renderSelectors();
renderExactUtilization();
document.addEventListener('click',event=>{
  const button=event.target.closest('#quantityInputMode [data-quantity-mode]');
  if(!button||button.disabled)return;
  event.preventDefault();event.stopImmediatePropagation();
  const next=button.dataset.quantityMode;
  if(next===state.settings.quantityInputMode)return;
  state.settings.quantityInputMode=next;
  persistState();renderSelectors();
},true);

/* v2.9.3 final ownership: avoid the entire retired renderer chain. */
renderSelectors=function(){renderSelectorsV293();renderExactUtilization();};
window.TopBoxApp.renderSelectors=()=>renderSelectors();
renderSelectors();

/* v2.9.6 selector ownership.
   The original page has several historical handlers registered before the
   standalone selector was introduced.  They can repaint the retired row
   markup after a mode switch or reset.  Own those two actions in the capture
   phase, update the small amount of state they need, and then paint only the
   standalone rows. */
function renderCargoSelectorV296(){
  renderSelectorsV293();
  renderExactUtilization();
}
function scheduleCargoSelectorV296(){
  renderCargoSelectorV296();
  requestAnimationFrame(()=>requestAnimationFrame(renderCargoSelectorV296));
}
document.addEventListener('change',event=>{
  const input=event.target;
  if(!(input instanceof HTMLInputElement)||input.name!=='mode')return;
  event.stopImmediatePropagation();
  $$('.mode-option').forEach(label=>label.classList.toggle('selected',label.querySelector('input')?.checked));
  if(input.value!=='specified'&&state.selectedCargo.size>1){
    const first=state.cargo.find(item=>state.selectedCargo.has(item.id));
    state.selectedCargo.clear();
    if(first)state.selectedCargo.add(first.id);
  }
  persistState();
  scheduleCargoSelectorV296();
},true);

// The archive extension above is intentionally last. Re-apply the stable
// entry points after it so opening an archive can never restore a legacy
// selector/heading renderer.
const renderArchivesV315FinalBase=renderArchives;
renderArchives=function(){renderArchivesV315FinalBase();syncPalletLauncherV315();};
renderSelectors=function(){renderSelectorsV315();};
renderCargoSelectorV296=renderSelectorsV315;
scheduleCargoSelectorV296=function(){renderSelectorsV315();requestAnimationFrame(renderSelectorsV315);};
window.TopBoxApp.renderSelectors=()=>renderSelectorsV315();
renderSelectorsV315();
syncPalletLauncherV315();

/* v3.1.5 — final selector ownership.  Older releases registered several
   compatibility renderers.  This renderer deliberately uses its own markup
   and is called by every selector entry point, so mode changes/reset cannot
   resurrect one of the historical layouts. */
function renderCargoRowsV315(){
  const host=$('#cargoList');if(!host)return;
  const query=$('#cargoSearch')?.value.trim().toLowerCase()||'';
  const terms=query.split(',').map(value=>value.trim()).filter(Boolean);
  const rows=state.cargo.filter(item=>terms.every(term=>`${item.name}${item.type}`.toLowerCase().includes(term)));
  const size=Math.max(1,+state.ui.cargoSize||20),pages=Math.max(1,Math.ceil(rows.length/size));
  state.ui.cargoPage=Math.max(1,Math.min(+state.ui.cargoPage||1,pages));
  const page=rows.slice((state.ui.cargoPage-1)*size,state.ui.cargoPage*size);
  const specified=document.querySelector('input[name="mode"]:checked')?.value==='specified';
  const pieceMode=state.settings.quantityInputMode==='pieces';
  host.className='cargo-v315-list';host.dataset.renderer='v315';
  host.innerHTML=page.map(item=>{
    const perPackage=Math.max(1,+item.pieces||1),bags=Math.max(1,+item.quantity||1),pieces=Math.max(1,+item.pieceQuantity||bags*perPackage),value=pieceMode?pieces:bags;
    const result=pieceMode?`${t('折合')} ${Math.ceil(pieces/perPackage).toLocaleString()} ${t('包')}`:`${t('共')} ${(bags*perPackage).toLocaleString()} ${t('件')}`;
    return `<label class="cargo-v315-row ${state.selectedCargo.has(item.id)?'checked':''}" data-cargo-v315="${item.id}"><input class="cargo-v315-check" data-id="${item.id}" type="checkbox" ${state.selectedCargo.has(item.id)?'checked':''}><span class="cargo-v315-color" style="background:${item.color}"></span><span class="cargo-v315-info"><b>${escapeHtml(item.name)}</b><small>${item.l} × ${item.w} × ${item.h} mm · ${cubicMeters(item).toFixed(4)} m³</small><small>${perPackage.toLocaleString()} ${t('件')}/${t('包')}</small></span><span class="cargo-v315-control"><input class="cargo-v315-input" data-id="${item.id}" type="number" min="1" value="${value}" ${specified?'':'disabled'}><span class="cargo-v315-unit">${pieceMode?t('件'):t('包')}</span><strong class="cargo-v315-result">${result}</strong></span></label>`;
  }).join('')||`<div class="empty-state">${t('没有匹配的货物')}</div>`;
  const pager=$('#cargoPager');if(pager)pager.innerHTML=`<span>${rows.length?`${(state.ui.cargoPage-1)*size+1}-${Math.min(state.ui.cargoPage*size,rows.length)}/${rows.length}`:'0/0'}</span><button data-v315-page="-1" ${state.ui.cargoPage<=1?'disabled':''}>‹</button><button data-v315-page="1" ${state.ui.cargoPage>=pages?'disabled':''}>›</button><select data-v315-size>${[20,30,50,100,200,500,1000,2000].map(value=>`<option value="${value}" ${size===value?'selected':''}>${value}</option>`).join('')}</select>`;
  $('[data-v315-page="-1"]',pager)?.addEventListener('click',()=>{state.ui.cargoPage--;persistState();renderSelectors();});
  $('[data-v315-page="1"]',pager)?.addEventListener('click',()=>{state.ui.cargoPage++;persistState();renderSelectors();});
  $('[data-v315-size]',pager)?.addEventListener('change',event=>{state.ui.cargoSize=+event.target.value;state.ui.cargoPage=1;persistState();renderSelectors();});
  $$('.cargo-v315-check',host).forEach(input=>input.addEventListener('change',()=>{if(input.checked&&!specified){state.selectedCargo.clear();state.selectedCargo.add(input.dataset.id);}else if(input.checked)state.selectedCargo.add(input.dataset.id);else state.selectedCargo.delete(input.dataset.id);persistState();renderSelectors();}));
  $$('.cargo-v315-input',host).forEach(input=>{const sync=save=>{const item=state.cargo.find(value=>value.id===input.dataset.id);if(!item)return;const perPackage=Math.max(1,+item.pieces||1),amount=Math.max(1,+input.value||1);if(pieceMode){item.pieceQuantity=amount;item.quantity=Math.ceil(amount/perPackage);}else{item.quantity=amount;item.pieceQuantity=amount*perPackage;}input.value=amount;const out=input.closest('.cargo-v315-control')?.querySelector('.cargo-v315-result');if(out)out.textContent=pieceMode?`${t('折合')} ${Math.ceil(amount/perPackage).toLocaleString()} ${t('包')}`:`${t('共')} ${(amount*perPackage).toLocaleString()} ${t('件')}`;if(save)persistState();};input.addEventListener('input',()=>sync(false));input.addEventListener('change',()=>sync(true));});
}
function renderSelectorsV315(){
  renderSelectorsV293();
  renderCargoRowsV315();
  renderExactUtilization();
}
renderSelectors=function(){renderSelectorsV315();};
renderCargoSelectorV296=renderSelectorsV315;
scheduleCargoSelectorV296=function(){renderSelectorsV315();requestAnimationFrame(renderSelectorsV315);};
window.TopBoxApp.renderSelectors=()=>renderSelectorsV315();

function syncPalletLauncherV315(){
  const launcher=$('#palletKitBuilder');if(!launcher)return;
  launcher.classList.toggle('hidden',state.archive!=='cargo');
  launcher.style.background='#9a6235';launcher.style.borderColor='#9a6235';launcher.style.color='#fff';
}
const renderArchivesV315Base=renderArchives;
renderArchives=function(){renderArchivesV315Base();syncPalletLauncherV315();};
document.addEventListener('click',event=>{const nav=event.target.closest('.nav-link[data-archive-target],.archive-tabs [data-archive]');if(!nav)return;requestAnimationFrame(()=>{syncPalletLauncherV315();renderSelectorsV315();});},true);
renderSelectorsV315();
// This compatibility block is outside the scoped i18n table declared above.
// Keep the late archive enhancement independent from that scoped variable so a
// translation add-on can never prevent the whole application from starting.
document.addEventListener('click',event=>{
  if(!event.target.closest('#resetCargoSelection'))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  state.selectedCargo.clear();
  state.cargo.forEach(item=>{
    item.quantity=1;
    item.pieceQuantity=Math.max(1,+item.pieces||1);
  });
  state.settings.quantityInputMode='bags';
  persistState();
  scheduleCargoSelectorV296();
},true);
const cargoSelectorV296Host=$('#cargoList');
let cargoSelectorV296RepairFrame=0;
if(cargoSelectorV296Host)new MutationObserver(()=>{
  if(!cargoSelectorV296Host.querySelector('.select-row,.cargo-quantity'))return;
  if(cargoSelectorV296RepairFrame)return;
  cargoSelectorV296RepairFrame=requestAnimationFrame(()=>{
    cargoSelectorV296RepairFrame=0;
    renderCargoSelectorV296();
  });
}).observe(cargoSelectorV296Host,{childList:true,subtree:true});

/* v2.9.9: archive menus are two distinct pages, not tabs of a generic page. */
function paintArchiveHeadingV299(kind){
  const archive=kind==='cargo'?'cargo':'containers';
  const title=archive==='cargo'?t('货物档案'):t('容器档案');
  const heading=$('#archives .page-heading h1');
  if(heading)heading.textContent=title;
  const eyebrow=$('#archives .page-heading .eyebrow');
  if(eyebrow)eyebrow.hidden=true;
}
document.addEventListener('click',event=>{
  const button=event.target.closest('.nav-link[data-page="archives"][data-archive-target]');
  if(!button)return;
  const archive=button.dataset.archiveTarget==='cargo'?'cargo':'containers';
  /* Do not stop the regular navigation handlers: they are responsible for
     opening the page and refreshing the latest records.  Reconcile the
     archive type and title after those handlers have finished. */
  requestAnimationFrame(()=>{
    state.archive=archive;
    selectedArchiveIds.clear();
    persistState();
    $$('.archive-tabs button').forEach(tab=>tab.classList.toggle('active',tab.dataset.archive===archive));
    renderArchives();
    paintArchiveHeadingV299(archive);
    requestAnimationFrame(()=>paintArchiveHeadingV299(archive));
  });
},true);
paintArchiveHeadingV299(state.archive);

/* v3.0.1: legacy language/render callbacks may update the archive heading
   asynchronously. Keep the visible title derived from the active archive menu
   without touching the click/navigation event itself. */
let archiveHeadingV301Frame=0;
function enforceArchiveHeadingV301(){
  archiveHeadingV301Frame=0;
  const active=$('.nav-link[data-page="archives"][data-archive-target].active');
  const archive=active?.dataset.archiveTarget==='cargo'?'cargo':active?.dataset.archiveTarget==='containers'?'containers':state.archive;
  paintArchiveHeadingV299(archive);
}
const archiveHeadingV301Node=$('#archives .page-heading');
if(archiveHeadingV301Node)new MutationObserver(()=>{
  if(archiveHeadingV301Frame)return;
  archiveHeadingV301Frame=requestAnimationFrame(enforceArchiveHeadingV301);
}).observe(archiveHeadingV301Node,{childList:true,subtree:true,characterData:true});
document.addEventListener('click',event=>{
  if(!event.target.closest('.nav-link[data-page="archives"][data-archive-target]'))return;
  setTimeout(enforceArchiveHeadingV301,0);
  requestAnimationFrame(enforceArchiveHeadingV301);
  setTimeout(enforceArchiveHeadingV301,250);
},true);

/* v3.1.0: a pallet kit is packed as one fixed-size cargo unit, while its
   saved pallet and child cargo layout is rendered in the plan and exports. */
const drawSceneV310Base=drawScene;
function addPalletKitVisualV310(parent,position,scale){
  const kit=position.kit||{},pallet=kit.pallet||{l:position.l,w:position.w,h:Math.min(150,position.h),color:'#b97b45'};
  const origin=kit.origin||{x:0,y:0};
  const kitGroup=new THREE.Group();
  kitGroup.name=`pallet-kit-${position.id}`;
  kitGroup.position.set(position.x*scale,position.z*scale,position.y*scale);
  const palletGroup=new THREE.Group();
  palletGroup.position.set((+origin.x||0)*scale,0,(+origin.y||0)*scale);
  addPalletModel(palletGroup,{l:+pallet.l||position.l,w:+pallet.w||position.w,h:+pallet.h||100,style:pallet.style||'wood',color:pallet.color||'#b97b45'},scale);
  kitGroup.add(palletGroup);
  (Array.isArray(kit.items)?kit.items:[]).forEach((item,index)=>{
    const l=Math.max(1,+item.l||1),w=Math.max(1,+item.w||1),h=Math.max(1,+item.h||1);
    let mesh;
    if(item.shape==='cylinder'){
      mesh=new THREE.Mesh(new THREE.CylinderGeometry(w*scale/2,w*scale/2,h*scale,18),new THREE.MeshStandardMaterial({color:item.color||position.color,roughness:.52,metalness:.04}));
    }else mesh=new THREE.Mesh(new THREE.BoxGeometry(l*scale,h*scale,w*scale),new THREE.MeshStandardMaterial({color:item.color||position.color,roughness:.58,metalness:.03}));
    mesh.position.set(((+origin.x||0)+(+item.x||0)+l/2)*scale,((+pallet.h||0)+(+item.z||0)+h/2)*scale,((+origin.y||0)+(+item.y||0)+w/2)*scale);
    mesh.castShadow=true;mesh.userData={name:item.name||position.name,index,isCargo:true};kitGroup.add(mesh);
    const outline=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0x132b42,transparent:true,opacity:.82}));
    outline.position.copy(mesh.position);kitGroup.add(outline);
  });
  parent.add(kitGroup);
}
drawScene=function(plan){
  drawSceneV310Base(plan);
  if(!plan?.positions?.some(item=>item.kit)||!scene)return;
  const scale=7/Math.max(plan.container.l,plan.container.w,plan.container.h);
  const load=scene.getObjectByName('load');if(!load)return;
  load.traverse(node=>{const position=plan.positions[node.userData?.index];if(position?.kit&&(node.userData?.isCargo||node.userData?.name===`${position.name} 外框`))node.visible=false;});
  plan.positions.forEach(position=>{if(position.kit&&!state.hiddenCargoIds?.has(position.id))addPalletKitVisualV310(load,position,scale);});
  scheduleThreeRender();
};

/* v3.1.3 — resilient saved-plan restoration and compact extra-vehicle output. */
function normalizeSavedContainerPlanV313(plan){
  const positions=Array.isArray(plan?.positions)?plan.positions.map(item=>({...item})):[];
  const unplaced=Array.isArray(plan?.unplaced)?plan.unplaced.map(item=>({...item})):[];
  const entries=Array.isArray(plan?.placedCount)?plan.placedCount:plan?.placedCount&&typeof plan.placedCount==='object'?Object.entries(plan.placedCount):[];
  const placedCount=new Map(entries.map(([id,count])=>[id,Math.max(0,+count||0)]));
  if(!placedCount.size)positions.forEach(item=>placedCount.set(item.id,(placedCount.get(item.id)||0)+1));
  const container={...(plan?.container||{})};
  const loadedVolume=Number.isFinite(+plan?.loadedVolume)?+plan.loadedVolume:positions.reduce((sum,item)=>sum+cubicMeters(item),0);
  const available=Number.isFinite(+plan?.available)?+plan.available:usableVolume(container);
  return {...plan,container,positions,unplaced,placedCount,loadedVolume,available,utilization:available?loadedVolume/available*100:0,freeSpaces:Array.isArray(plan?.freeSpaces)?plan.freeSpaces.map(item=>({...item})):[]};
}
openSavedPlan=function(id){
  const saved=state.savedPlans.find(item=>item.id===id);
  if(!saved)return;
  const plans=(Array.isArray(saved.plans)?saved.plans:[]).map(normalizeSavedContainerPlanV313);
  if(!plans.length){showNotice(t('该保存方案没有可恢复的容器数据。'));return;}
  state.plan={plans,active:0,mode:saved.mode||'specified'};
  state.selectedContainers.clear();state.selectedCargo.clear();
  plans.forEach(plan=>{
    if(plan.container?.id)state.selectedContainers.add(plan.container.id);
    [...plan.positions,...plan.unplaced].forEach(item=>item?.id&&state.selectedCargo.add(item.id));
  });
  $('.nav-link[data-page="workspace"]')?.click();
  $('#results').classList.remove('hidden');
  renderSelectors();renderPlan();
  setTimeout(()=>$('#results')?.scrollIntoView({behavior:'smooth',block:'start'}),0);
};
if(window.TopBoxApp)window.TopBoxApp.openSavedPlan=id=>openSavedPlan(id);

function buildExtraVehiclePlansV313(unplaced){
  const records=new Map();
  (Array.isArray(unplaced)?unplaced:[]).forEach(item=>{
    if(!item?.id)return;
    const record=state.cargo.find(cargo=>cargo.id===item.id)||item;
    const entry=records.get(item.id)||{record,count:0};entry.count++;records.set(item.id,entry);
  });
  const trucks=state.containers.filter(container=>container.type==='车厢').slice().sort((a,b)=>usableVolume(a)-usableVolume(b)||a.l-b.l||a.w-b.w||a.h-b.h);
  const makeCargo=()=>[...records.values()].filter(entry=>entry.count>0).map(entry=>({...entry.record,quantity:entry.count}));
  const plans=[];
  for(let run=0;run<40&&[...records.values()].some(entry=>entry.count>0);run++){
    const option=trucks.map(container=>({container,plan:packContainer(container,makeCargo(),'specified')})).find(candidate=>candidate.plan.positions.length>0);
    if(!option)break;
    plans.push(option.plan);
    option.plan.placedCount.forEach((count,id)=>{const entry=records.get(id);if(entry)entry.count=Math.max(0,entry.count-count);});
  }
  const remaining=[...records.values()].flatMap(entry=>Array.from({length:entry.count},()=>entry.record));
  return {plans,remaining};
}

function unloadedSummaryV313(plan){
  const groups=new Map();
  (plan?.unplaced||[]).forEach(item=>{
    if(!item?.id)return;
    const cargo=state.cargo.find(record=>record.id===item.id)||item;
    const entry=groups.get(item.id)||{cargo,count:0,pieces:0};entry.count++;entry.pieces+=Math.max(1,+cargo.pieces||1);groups.set(item.id,entry);
  });
  return [...groups.values()];
}
const reportCanvasV313Base=reportCanvas;
reportCanvas=function(report){
  const base=reportCanvasV313Base(report),unloaded=unloadedSummaryV313(report?.plan);
  if(!unloaded.length)return base;
  const recommendation=buildExtraVehiclePlansV313((report.plan?.unplaced)||[]);
  const extraHeight=Math.max(230,112+unloaded.length*34+recommendation.plans.length*42+(recommendation.remaining.length?36:0));
  const canvas=document.createElement('canvas');canvas.width=base.width;canvas.height=base.height+extraHeight;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#f5f8fc';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(base,0,0);
  const top=base.height+26;ctx.fillStyle='#ffffff';ctx.fillRect(54,top,1492,extraHeight-48);ctx.strokeStyle='#d7e2ee';ctx.lineWidth=2;ctx.strokeRect(54,top,1492,extraHeight-48);
  ctx.fillStyle='#0b2545';ctx.font='bold 24px sans-serif';ctx.fillText('未装载货物与额外车辆建议',78,top+40);
  ctx.font='16px sans-serif';ctx.fillStyle='#405b74';let y=top+72;
  unloaded.forEach(entry=>{ctx.fillText(`${entry.cargo.name}：未装载 ${entry.count} 包 / ${entry.pieces.toLocaleString()} 件`,84,y);y+=31;});
  ctx.fillStyle='#0c7659';ctx.font='bold 17px sans-serif';ctx.fillText('建议车辆（优先大车满载，再匹配剩余货物）',84,y+12);y+=43;
  ctx.fillStyle='#405b74';ctx.font='16px sans-serif';recommendation.plans.forEach((plan,index)=>{const pieces=plan.positions.reduce((sum,item)=>sum+(+item.pieces||0),0);ctx.fillText(`${index+1}. ${plan.container.name}：${plan.positions.length} 包 / ${pieces.toLocaleString()} 件`,84,y);y+=31;});
  if(recommendation.remaining.length){const pieces=recommendation.remaining.reduce((sum,item)=>sum+(+item.pieces||0),0);ctx.fillStyle='#b45309';ctx.fillText(`仍无法匹配：${recommendation.remaining.length} 包 / ${pieces.toLocaleString()} 件`,84,y);}
  return canvas;
};

/* v3.1.4 — cargo details and full-load-first additional vehicle recommendation. */
function buildExtraVehiclePlansV314(unplaced){
  const records=new Map();
  (Array.isArray(unplaced)?unplaced:[]).forEach(item=>{if(!item?.id)return;const record=state.cargo.find(cargo=>cargo.id===item.id)||item,entry=records.get(item.id)||{record,count:0};entry.count++;records.set(item.id,entry);});
  const trucks=state.containers.filter(container=>container.type==='车厢').slice().sort((a,b)=>usableVolume(b)-usableVolume(a)||b.l-a.l||b.w-a.w||b.h-a.h);
  const makeCargo=()=>[...records.values()].filter(entry=>entry.count>0).map(entry=>({...entry.record,quantity:entry.count}));
  const plans=[];
  for(let run=0;run<40&&[...records.values()].some(entry=>entry.count>0);run++){
    const remainingCount=[...records.values()].reduce((sum,entry)=>sum+entry.count,0);
    const choices=trucks.map(container=>({container,plan:packContainer(container,makeCargo(),'specified')})).filter(choice=>choice.plan.positions.length>0);
    if(!choices.length)break;
    const selected=choices.find(choice=>choice.plan.positions.length===remainingCount)||choices[0];
    plans.push(selected.plan);
    selected.plan.placedCount.forEach((count,id)=>{const entry=records.get(id);if(entry)entry.count=Math.max(0,entry.count-count);});
  }
  const remaining=[...records.values()].flatMap(entry=>Array.from({length:entry.count},()=>entry.record));
  return {plans,remaining};
}
// Earlier recommendation helpers were declared in a compatibility scope in
// some saved builds.  Never assign to a missing lexical binding: the report
// wrapper calls the v3.1.4 helper directly when it is available.
if(typeof buildExtraVehiclePlans==='function')buildExtraVehiclePlans=buildExtraVehiclePlansV314;
if(typeof buildExtraVehiclePlansV313==='function')buildExtraVehiclePlansV313=buildExtraVehiclePlansV314;

function installCargoArchiveFieldsV314(){
  const pieces=$('#recordPiecesField');if(!pieces||$('#recordPieceDimensions'))return;
  pieces.insertAdjacentHTML('afterend','<div id="recordPieceDimensions" class="cargo-extra-record-fields"><label>小件长 (mm)<input id="recordPieceL" type="number" min="0" step="0.1" value="0" /></label><label>小件宽 (mm)<input id="recordPieceW" type="number" min="0" step="0.1" value="0" /></label><label>小件高 (mm)<input id="recordPieceH" type="number" min="0" step="0.1" value="0" /></label></div><label id="recordNoteField" class="cargo-note-field">备注<textarea id="recordNote" rows="2" maxlength="300" placeholder="可填写货物说明、堆码要求等"></textarea></label>');
}
const openDialogV314Base=openDialog;
openDialog=function(record=null){
  installCargoArchiveFieldsV314();openDialogV314Base(record);
  const isCargo=$('#recordKind').value==='cargo';
  $('#recordPieceDimensions')?.toggleAttribute('hidden',!isCargo);$('#recordNoteField')?.toggleAttribute('hidden',!isCargo);
  $('#recordPieceL').value=record?.pieceL??0;$('#recordPieceW').value=record?.pieceW??0;$('#recordPieceH').value=record?.pieceH??0;$('#recordNote').value=record?.note??'';
};
document.addEventListener('submit',event=>{
  if(event.target?.id!=='archiveForm')return;
  event.preventDefault();event.stopImmediatePropagation();
  const kind=$('#recordKind').value,id=$('#recordId').value,record={id:id||uid(kind==='containers'?'c':'g'),name:$('#recordName').value.trim(),type:$('#recordType').value,shape:$('#recordShape').value,l:+$('#recordL').value,w:+$('#recordW').value,h:+$('#recordH').value,weight:+$('#recordWeight').value||0,pieces:Math.max(1,+$('#recordPieces').value||1),reserve:kind==='containers'?(+$('#recordReserve').value||0):0,price:+$('#recordPrice').value||0,color:$('#recordColor').value,quantity:1};
  if(!record.name||!record.l||!record.w||!record.h)return;
  if(kind==='cargo'){record.pieceL=Math.max(0,+$('#recordPieceL')?.value||0);record.pieceW=Math.max(0,+$('#recordPieceW')?.value||0);record.pieceH=Math.max(0,+$('#recordPieceH')?.value||0);record.note=$('#recordNote')?.value.trim()||'';}
  const records=state[kind],index=records.findIndex(item=>item.id===id);if(index<0)records.push(record);else records[index]={...records[index],...record};
  persistState();$('#archiveDialog').close();renderArchives();renderSelectors();window.dispatchEvent(new Event('topbox:records-changed'));showSuccess(`${record.name} ${t('已保存。')}`);
},true);
const renderArchivesV314Base=renderArchives;
renderArchives=function(){
  renderArchivesV314Base();if(state.archive!=='cargo')return;
  const head=$('#archiveTableHead');if(head&&!head.dataset.cargoExtra){const target=head.children[8];target?.insertAdjacentHTML('beforebegin',`<th>${t('小件尺寸')}</th><th>${t('备注')}</th>`);head.dataset.cargoExtra='1';}
  $$('#archiveRows tr').forEach(row=>{if(row.dataset.cargoExtra)return;const id=$('[data-edit]',row)?.dataset.edit,record=state.cargo.find(item=>item.id===id);if(!record)return;const target=row.children[8];target?.insertAdjacentHTML('beforebegin',`<td>${record.pieceL||record.pieceW||record.pieceH?`${record.pieceL||0} × ${record.pieceW||0} × ${record.pieceH||0} mm`:'—'}</td><td class="archive-note-cell" title="${escapeHtml(record.note||'')}">${escapeHtml(record.note||'—')}</td>`);row.dataset.cargoExtra='1';});
};
function downloadCargoTemplateV314(){const rows=[['kind','name','type','shape','l','w','h','weight','pieces','pieceL','pieceW','pieceH','note','price','color','quantity'],['cargo','示例货物','单体货物','box',600,400,350,12,20,120,80,60,'可选备注',86,'#2563eb',1]],csv=rows.map(row=>row.map(csvEscape).join(',')).join('\n');downloadBlob(csv,'货物档案导入模板.csv','text/csv;charset=utf-8');}
document.addEventListener('click',event=>{const button=event.target.closest('#downloadTemplate');if(button&&state.archive==='cargo'){event.preventDefault();event.stopImmediatePropagation();downloadCargoTemplateV314();}},true);
document.addEventListener('change',event=>{
  const input=event.target;if(input?.id!=='importFile'||state.archive!=='cargo'||!input.files?.[0])return;
  event.stopImmediatePropagation();const reader=new FileReader();reader.onload=()=>{try{const [head,...rows]=parseCSV(reader.result),keys=head.map(key=>key.trim()),items=[];rows.forEach(row=>{const source=Object.fromEntries(keys.map((key,index)=>[key,row[index]??'']));if(!source.name||!source.l||!source.w||!source.h)return;items.push({id:uid('g'),name:source.name,type:source.type||'单体货物',shape:source.shape==='cylinder'?'cylinder':'box',l:+source.l,w:+source.w,h:+source.h,weight:+source.weight||0,pieces:Math.max(1,+source.pieces||1),pieceL:Math.max(0,+source.pieceL||0),pieceW:Math.max(0,+source.pieceW||0),pieceH:Math.max(0,+source.pieceH||0),note:source.note||'',reserve:0,price:+source.price||0,color:source.color||COLORS[(state.cargo.length+items.length)%COLORS.length],quantity:Math.max(1,+source.quantity||1)});});if(!items.length)throw Error('没有有效货物');state.cargo.push(...items);persistState();renderArchives();renderSelectors();window.dispatchEvent(new Event('topbox:records-changed'));showSuccess(`已导入 ${items.length} 条货物档案。`);}catch{showNotice('导入失败，请使用货物档案导入模板。');}finally{input.value='';}};reader.readAsText(input.files[0],'utf-8');
},true);

// v3.1.5 final ownership: this runs after every historical enhancement.
if(typeof window!=='undefined'&&typeof renderSelectorsV315==='function'){
  const renderArchivesV315EndBase=renderArchives;
  renderArchives=function(){renderArchivesV315EndBase();syncPalletLauncherV315();};
  renderSelectors=function(){renderSelectorsV315();};
  renderCargoSelectorV296=renderSelectorsV315;
  scheduleCargoSelectorV296=function(){renderSelectorsV315();requestAnimationFrame(renderSelectorsV315);};
  window.TopBoxApp.renderSelectors=()=>renderSelectorsV315();
  renderSelectorsV315();
  syncPalletLauncherV315();
}

/* v3.1.7 absolute final fleet owner. */
function buildExtraVehiclePlansV317Absolute(unplaced){
  const remaining=new Map();
  (Array.isArray(unplaced)?unplaced:[]).forEach(item=>{
    if(!item?.id)return;
    const record=state.cargo.find(cargo=>cargo.id===item.id)||item,entry=remaining.get(item.id)||{record,count:0};
    entry.count+=Math.max(1,Math.floor(+(item.unplacedQuantity??item.unplacedCount??1)||1));remaining.set(item.id,entry);
  });
  const trucks=state.containers.filter(container=>container.type==='车厢').slice().sort((a,b)=>usableVolume(b)-usableVolume(a)||b.l-a.l||b.w-a.w||b.h-a.h);
  const requested=()=>[...remaining.values()].filter(entry=>entry.count>0).map(entry=>({...entry.record,quantity:entry.count}));
  const total=()=>[...remaining.values()].reduce((sum,entry)=>sum+entry.count,0),plans=[];
  for(let run=0;run<2000&&total()>0;run++){
    const wanted=total(),choices=trucks.map(container=>{const plan=packContainer(container,requested(),'specified'),loaded=[...plan.placedCount.values()].reduce((sum,count)=>sum+(+count||0),0);return{plan,loaded};}).filter(choice=>choice.loaded>0);
    if(!choices.length)break;
    const complete=choices.filter(choice=>choice.loaded===wanted),selected=complete.length?complete.at(-1):choices[0];plans.push(selected.plan);
    let progress=0;selected.plan.placedCount.forEach((count,id)=>{const entry=remaining.get(id);if(!entry)return;const used=Math.min(entry.count,Math.max(0,+count||0));entry.count-=used;progress+=used;});if(!progress)break;
  }
  return{plans,remaining:[...remaining.values()].flatMap(entry=>Array.from({length:entry.count},()=>({...entry.record})))};
}
buildExtraVehiclePlans=buildExtraVehiclePlansV317Absolute;
buildExtraVehiclePlansV313=buildExtraVehiclePlansV317Absolute;
buildExtraVehiclePlansV314=buildExtraVehiclePlansV317Absolute;

/* v3.1.8 — one final cargo renderer and one final fleet recommender.
   Historical renderers remain parseable for old saved payloads, but no live
   entry point is allowed to leave their markup in the document. */
function renderCargoRowsV318(){
  const host=$('#cargoList');if(!host)return;
  const terms=($('#cargoSearch')?.value||'').trim().toLowerCase().split(',').map(value=>value.trim()).filter(Boolean);
  const rows=state.cargo.filter(item=>terms.every(term=>`${item.name}${item.type}`.toLowerCase().includes(term)));
  const size=Math.max(1,+state.ui.cargoSize||20),pages=Math.max(1,Math.ceil(rows.length/size));
  state.ui.cargoPage=Math.max(1,Math.min(+state.ui.cargoPage||1,pages));
  const page=rows.slice((state.ui.cargoPage-1)*size,state.ui.cargoPage*size);
  const specified=document.querySelector('input[name="mode"]:checked')?.value==='specified';
  const pieceMode=state.settings.quantityInputMode==='pieces';
  host.className='cargo-v318-list';host.dataset.renderer='v318';
  host.innerHTML=page.map(item=>{
    const perPackage=Math.max(1,+item.pieces||1),bags=Math.max(1,+item.quantity||1),pieces=Math.max(1,+item.pieceQuantity||bags*perPackage),value=pieceMode?pieces:bags;
    const result=pieceMode?`${t('折合')} ${Math.ceil(pieces/perPackage).toLocaleString()} ${t('包')}`:`${t('共')} ${(bags*perPackage).toLocaleString()} ${t('件')}`;
    return `<label class="cargo-v318-row ${state.selectedCargo.has(item.id)?'checked':''}" data-cargo-v318="${item.id}"><input class="cargo-v318-check" data-id="${item.id}" type="checkbox" ${state.selectedCargo.has(item.id)?'checked':''}><span class="cargo-v318-color" style="background:${item.color}"></span><span class="cargo-v318-info"><b>${escapeHtml(item.name)}</b><small>${item.l} × ${item.w} × ${item.h} mm · ${cubicMeters(item).toFixed(4)} m³</small><small>${perPackage.toLocaleString()} ${t('件')}/${t('包')}</small></span><span class="cargo-v318-control"><input class="cargo-v318-input" data-id="${item.id}" type="number" min="1" value="${value}" ${specified?'':'disabled'}><span class="cargo-v318-unit">${pieceMode?t('件'):t('包')}</span><strong class="cargo-v318-result">${result}</strong></span></label>`;
  }).join('')||`<div class="empty-state">${t('没有匹配的货物')}</div>`;
  const pager=$('#cargoPager');if(pager)pager.innerHTML=`<span>${rows.length?`${(state.ui.cargoPage-1)*size+1}-${Math.min(state.ui.cargoPage*size,rows.length)}/${rows.length}`:'0/0'}</span><button data-v318-page="-1" ${state.ui.cargoPage<=1?'disabled':''}>‹</button><button data-v318-page="1" ${state.ui.cargoPage>=pages?'disabled':''}>›</button><select data-v318-size>${[20,30,50,100,200,500,1000,2000].map(value=>`<option value="${value}" ${size===value?'selected':''}>${value}</option>`).join('')}</select>`;
  $('[data-v318-page="-1"]',pager)?.addEventListener('click',()=>{state.ui.cargoPage--;persistState();renderSelectorsV318();});
  $('[data-v318-page="1"]',pager)?.addEventListener('click',()=>{state.ui.cargoPage++;persistState();renderSelectorsV318();});
  $('[data-v318-size]',pager)?.addEventListener('change',event=>{state.ui.cargoSize=+event.target.value;state.ui.cargoPage=1;persistState();renderSelectorsV318();});
  $$('.cargo-v318-check',host).forEach(input=>input.addEventListener('change',()=>{if(input.checked&&!specified){state.selectedCargo.clear();state.selectedCargo.add(input.dataset.id);}else if(input.checked)state.selectedCargo.add(input.dataset.id);else state.selectedCargo.delete(input.dataset.id);persistState();renderSelectorsV318();}));
  $$('.cargo-v318-input',host).forEach(input=>{const sync=save=>{const item=state.cargo.find(value=>value.id===input.dataset.id);if(!item)return;const perPackage=Math.max(1,+item.pieces||1),amount=Math.max(1,+input.value||1);if(pieceMode){item.pieceQuantity=amount;item.quantity=Math.ceil(amount/perPackage);}else{item.quantity=amount;item.pieceQuantity=amount*perPackage;}input.value=amount;const out=input.closest('.cargo-v318-control')?.querySelector('.cargo-v318-result');if(out)out.textContent=pieceMode?`${t('折合')} ${Math.ceil(amount/perPackage).toLocaleString()} ${t('包')}`:`${t('共')} ${(amount*perPackage).toLocaleString()} ${t('件')}`;if(save)persistState();};input.addEventListener('input',()=>sync(false));input.addEventListener('change',()=>sync(true));});
}
function renderContainerRowsV318(){
  const host=$('#containerList');if(!host)return;
  const query=($('#containerSearch')?.value||'').trim().toLowerCase();
  const rows=state.containers.filter(item=>!query||`${item.name}${item.type}`.toLowerCase().includes(query));
  const size=Math.max(1,+state.ui.containerSize||20),pages=Math.max(1,Math.ceil(rows.length/size));
  state.ui.containerPage=Math.max(1,Math.min(+state.ui.containerPage||1,pages));
  const page=rows.slice((state.ui.containerPage-1)*size,state.ui.containerPage*size);
  host.innerHTML=page.map(item=>`<label class="select-row ${state.selectedContainers.has(item.id)?'checked':''}"><input class="container-check" data-id="${item.id}" type="checkbox" ${state.selectedContainers.has(item.id)?'checked':''}><span class="color-square" style="background:${item.color}"></span><span class="record-main"><b>${escapeHtml(item.name)}</b><small>${containerLabel(item)}</small></span><span class="record-extra">${escapeHtml(item.type)}</span></label>`).join('')||`<div class="empty-state">${t('没有匹配的容器')}</div>`;
  const pager=$('#containerPager');if(pager)pager.innerHTML=`<span>${rows.length?`${(state.ui.containerPage-1)*size+1}-${Math.min(state.ui.containerPage*size,rows.length)}/${rows.length}`:'0/0'}</span><button data-v318-container-page="-1" ${state.ui.containerPage<=1?'disabled':''}>‹</button><button data-v318-container-page="1" ${state.ui.containerPage>=pages?'disabled':''}>›</button><select data-v318-container-size>${[20,30,50,100,200,500,1000,2000].map(value=>`<option value="${value}" ${size===value?'selected':''}>${value}</option>`).join('')}</select>`;
  $('[data-v318-container-page="-1"]',pager)?.addEventListener('click',()=>{state.ui.containerPage--;persistState();renderSelectorsV318();});
  $('[data-v318-container-page="1"]',pager)?.addEventListener('click',()=>{state.ui.containerPage++;persistState();renderSelectorsV318();});
  $('[data-v318-container-size]',pager)?.addEventListener('change',event=>{state.ui.containerSize=+event.target.value;state.ui.containerPage=1;persistState();renderSelectorsV318();});
  $$('.container-check',host).forEach(input=>input.addEventListener('change',()=>{input.checked?state.selectedContainers.add(input.dataset.id):state.selectedContainers.delete(input.dataset.id);persistState();renderSelectorsV318();}));
}
function syncSelectorBadgesV318(){
  const update=(id,records,selected)=>{const badge=$('#'+id);if(!badge)return;const names=records.filter(item=>selected.has(item.id)).map(item=>item.name);badge.textContent=`${t('已选')} ${names.length} ${t('项')}`;badge.dataset.selectedNames=names.join('、');badge.title=names.join('、');};
  update('selectedContainerCount',state.containers,state.selectedContainers);
  update('selectedCargoCount',state.cargo,state.selectedCargo);
}
function renderSelectorsV318(){
  renderContainerRowsV318();
  renderCargoRowsV318();
  syncSelectorBadgesV318();
  renderExactUtilization();
}
function scheduleSelectorsV318(){
  renderSelectorsV318();
  queueMicrotask(renderCargoRowsV318);
  requestAnimationFrame(renderCargoRowsV318);
}
renderSelectors=renderSelectorsV318;
renderSelectorsV315=renderSelectorsV318;
renderCargoSelectorV296=renderSelectorsV318;
scheduleCargoSelectorV296=scheduleSelectorsV318;
window.TopBoxApp.renderSelectors=renderSelectorsV318;
const cargoSelectorV318Host=$('#cargoList');
if(cargoSelectorV318Host)new MutationObserver(()=>{
  if(cargoSelectorV318Host.dataset.renderer==='v319')return;
  if(cargoSelectorV318Host.dataset.renderer==='v318'&&![...cargoSelectorV318Host.children].some(node=>node.matches?.('.select-row,.cargo-fresh-row,.cargo-v315-row')))return;
  requestAnimationFrame(renderCargoRowsV318);
}).observe(cargoSelectorV318Host,{childList:true});
document.addEventListener('change',event=>{
  const input=event.target;
  if(!(input instanceof HTMLInputElement)||input.name!=='mode')return;
  queueMicrotask(scheduleSelectorsV318);
},true);
document.addEventListener('click',event=>{
  if(!event.target.closest('#resetCargoSelection,[data-quantity-mode]'))return;
  setTimeout(scheduleSelectorsV318,0);
},true);
renderSelectorsV318();

function buildExtraVehiclePlansV318(unplaced){
  const grouped=new Map();
  (Array.isArray(unplaced)?unplaced:[]).forEach(item=>{
    if(!item?.id)return;
    const entry=grouped.get(item.id)||{record:state.cargo.find(cargo=>cargo.id===item.id)||item,implicit:0,explicit:0};
    const raw=item.unplacedQuantity??item.unplacedCount;
    if(raw==null)entry.implicit+=1;else entry.explicit=Math.max(entry.explicit,Math.max(1,Math.floor(+raw||1)));
    grouped.set(item.id,entry);
  });
  const remaining=new Map([...grouped].map(([id,entry])=>[id,{record:entry.record,count:entry.explicit||entry.implicit}]));
  const trucks=state.containers.filter(container=>container.type==='车厢').slice().sort((a,b)=>usableVolume(b)-usableVolume(a)||b.l-a.l||b.w-a.w||b.h-a.h);
  const requested=()=>[...remaining.values()].filter(entry=>entry.count>0).map(entry=>({...entry.record,quantity:entry.count}));
  const total=()=>[...remaining.values()].reduce((sum,entry)=>sum+entry.count,0),plans=[];
  for(let run=0;run<2000&&total()>0;run++){
    const wanted=total();
    const choices=trucks.map(container=>{
      const plan=packContainer(container,requested(),'specified');
      const loaded=[...plan.placedCount.values()].reduce((sum,count)=>sum+(+count||0),0);
      return{plan,loaded,volume:+plan.loadedVolume||0,capacity:usableVolume(container)};
    }).filter(choice=>choice.loaded>0);
    if(!choices.length)break;
    /* If one vehicle can finish the remainder, use the smallest vehicle that
       can do so. Otherwise use the largest available vehicle that can make
       progress, fill it, remove its cargo, and repeat. This keeps the fleet
       count low without recommending an oversized final vehicle. */
    const complete=choices.filter(choice=>choice.loaded===wanted).sort((a,b)=>a.capacity-b.capacity||a.plan.container.l-b.plan.container.l);
    const partial=choices.filter(choice=>choice.loaded<wanted).sort((a,b)=>b.capacity-a.capacity||b.volume-a.volume||b.loaded-a.loaded);
    const selected=complete[0]||partial[0];if(!selected)break;
    plans.push(selected.plan);
    let progress=0;
    selected.plan.placedCount.forEach((count,id)=>{const entry=remaining.get(id);if(!entry)return;const used=Math.min(entry.count,Math.max(0,+count||0));entry.count-=used;progress+=used;});
    if(!progress)break;
  }
  return{plans,remaining:[...remaining.values()].flatMap(entry=>Array.from({length:entry.count},()=>({...entry.record})))};
}
buildExtraVehiclePlans=buildExtraVehiclePlansV318;
buildExtraVehiclePlansV313=buildExtraVehiclePlansV318;
buildExtraVehiclePlansV314=buildExtraVehiclePlansV318;
if(typeof buildExtraVehiclePlansV316!=='undefined')buildExtraVehiclePlansV316=buildExtraVehiclePlansV318;

/* v3.1.9 — the selector has one DOM contract for initial load, reset and every
   loading mode.  No compatibility renderer is allowed to own the live host. */
function renderCargoRowsV319(){
  const host=$('#cargoList');if(!host)return;
  const terms=($('#cargoSearch')?.value||'').trim().toLowerCase().split(',').map(value=>value.trim()).filter(Boolean);
  const rows=state.cargo.filter(item=>terms.every(term=>`${item.name}${item.type}`.toLowerCase().includes(term)));
  const size=Math.max(1,+state.ui.cargoSize||20),pages=Math.max(1,Math.ceil(rows.length/size));
  state.ui.cargoPage=Math.max(1,Math.min(+state.ui.cargoPage||1,pages));
  const page=rows.slice((state.ui.cargoPage-1)*size,state.ui.cargoPage*size);
  const specified=document.querySelector('input[name="mode"]:checked')?.value==='specified';
  const pieceMode=state.settings.quantityInputMode==='pieces';
  const modeHost=$('#quantityInputMode');
  if(modeHost)modeHost.innerHTML=`<button type="button" class="quantity-mode-button ${pieceMode?'':'active'}" data-quantity-mode="bags" aria-pressed="${!pieceMode}" ${specified?'':'disabled'}>${t('按包数输入')}</button><button type="button" class="quantity-mode-button ${pieceMode?'active':''}" data-quantity-mode="pieces" aria-pressed="${pieceMode}" ${specified?'':'disabled'}>${t('按小件数输入')}</button>`;
  $$('.mode-option').forEach(label=>label.classList.toggle('selected',!!label.querySelector('input')?.checked));
  host.className='cargo-v319-list';host.dataset.renderer='v319';
  host.innerHTML=page.map(item=>{
    const perPackage=Math.max(1,+item.pieces||1),bags=Math.max(1,+item.quantity||1),pieces=Math.max(1,+item.pieceQuantity||bags*perPackage),value=pieceMode?pieces:bags;
    const result=pieceMode?`${t('折合')} ${Math.ceil(pieces/perPackage).toLocaleString()} ${t('包')}`:`${t('共')} ${(bags*perPackage).toLocaleString()} ${t('件')}`;
    return `<label class="cargo-v319-row ${state.selectedCargo.has(item.id)?'checked':''}" data-cargo-v319="${item.id}"><input class="cargo-v319-check" data-id="${item.id}" type="checkbox" ${state.selectedCargo.has(item.id)?'checked':''}><span class="cargo-v319-color" style="background:${item.color}"></span><span class="cargo-v319-info"><b>${escapeHtml(item.name)}</b><small>${item.l} × ${item.w} × ${item.h} mm · ${cubicMeters(item).toFixed(4)} m³</small><small>${perPackage.toLocaleString()} ${t('件')}/${t('包')}</small></span><span class="cargo-v319-control"><input class="cargo-v319-input" data-id="${item.id}" type="number" min="1" value="${value}" ${specified?'':'disabled'}><span class="cargo-v319-unit">${pieceMode?t('件'):t('包')}</span><strong class="cargo-v319-result">${result}</strong></span></label>`;
  }).join('')||`<div class="empty-state">${t('没有匹配的货物')}</div>`;
  const pager=$('#cargoPager');if(pager)pager.innerHTML=`<span>${rows.length?`${(state.ui.cargoPage-1)*size+1}-${Math.min(state.ui.cargoPage*size,rows.length)}/${rows.length}`:'0/0'}</span><button data-v319-page="-1" ${state.ui.cargoPage<=1?'disabled':''}>‹</button><button data-v319-page="1" ${state.ui.cargoPage>=pages?'disabled':''}>›</button><select data-v319-size>${[20,30,50,100,200,500,1000,2000].map(value=>`<option value="${value}" ${size===value?'selected':''}>${value}</option>`).join('')}</select>`;
  $('[data-v319-page="-1"]',pager)?.addEventListener('click',()=>{state.ui.cargoPage--;persistState();renderSelectorsV319();});
  $('[data-v319-page="1"]',pager)?.addEventListener('click',()=>{state.ui.cargoPage++;persistState();renderSelectorsV319();});
  $('[data-v319-size]',pager)?.addEventListener('change',event=>{state.ui.cargoSize=+event.target.value;state.ui.cargoPage=1;persistState();renderSelectorsV319();});
  $$('[data-quantity-mode]',modeHost).forEach(button=>button.addEventListener('click',()=>{if(button.disabled)return;state.settings.quantityInputMode=button.dataset.quantityMode;persistState();renderSelectorsV319();}));
  $$('.cargo-v319-check',host).forEach(input=>input.addEventListener('change',()=>{if(input.checked&&!specified){state.selectedCargo.clear();state.selectedCargo.add(input.dataset.id);}else if(input.checked)state.selectedCargo.add(input.dataset.id);else state.selectedCargo.delete(input.dataset.id);persistState();renderSelectorsV319();}));
  $$('.cargo-v319-input',host).forEach(input=>{const sync=save=>{const item=state.cargo.find(value=>value.id===input.dataset.id);if(!item)return;const perPackage=Math.max(1,+item.pieces||1),amount=Math.max(1,+input.value||1);if(pieceMode){item.pieceQuantity=amount;item.quantity=Math.ceil(amount/perPackage);}else{item.quantity=amount;item.pieceQuantity=amount*perPackage;}input.value=amount;const out=input.closest('.cargo-v319-control')?.querySelector('.cargo-v319-result');if(out)out.textContent=pieceMode?`${t('折合')} ${Math.ceil(amount/perPackage).toLocaleString()} ${t('包')}`:`${t('共')} ${(amount*perPackage).toLocaleString()} ${t('件')}`;if(save)persistState();};input.addEventListener('input',()=>sync(false));input.addEventListener('change',()=>sync(true));});
}
function renderSelectorsV319(){renderContainerRowsV318();renderCargoRowsV319();syncSelectorBadgesV318();renderExactUtilization();}
function scheduleSelectorsV319(){renderSelectorsV319();queueMicrotask(renderCargoRowsV319);requestAnimationFrame(renderCargoRowsV319);}
renderSelectors=renderSelectorsV319;
/* Every historical listener resolves these mutable function bindings at event
   time.  Point all of them at the one v3.1.9 renderer so reset and loading-mode
   changes cannot repaint legacy markup after the new layout has rendered. */
renderSelectorsV293=renderSelectorsV319;
renderSelectorsV315=renderSelectorsV319;
renderCargoRowsV315=renderCargoRowsV319;
renderSelectorsV318=renderSelectorsV319;
renderCargoRowsV318=renderCargoRowsV319;
scheduleSelectorsV318=scheduleSelectorsV319;
renderCargoSelectorV296=renderSelectorsV319;
scheduleCargoSelectorV296=scheduleSelectorsV319;
window.TopBoxApp.renderSelectors=renderSelectorsV319;

function rotationsV319(item){
  const l=Math.max(1,+item.l||1),w=Math.max(1,+item.w||1),h=Math.max(1,+item.h||1);
  return item.kit?[[l,w,h]]:item.shape==='cylinder'?[[l,w,h],[h,w,l],[l,h,w]]:[[l,w,h],[w,l,h],[l,h,w],[h,l,w],[w,h,l],[h,w,l]];
}
function remainingFitsFreeSpaceV319(plan,request){
  const spaces=Array.isArray(plan.freeSpaces)?plan.freeSpaces:[];
  return request.some(item=>spaces.some(space=>rotationsV319(item).some(([l,w,h])=>l<=space.l&&w<=space.w&&h<=space.h&&space.x+l<=plan.container.l&&space.y+w<=plan.container.w&&space.z+h<=plan.container.h)));
}
function buildExtraVehiclePlansV319(unplaced){
  const grouped=new Map();
  (Array.isArray(unplaced)?unplaced:[]).forEach(item=>{if(!item?.id)return;const entry=grouped.get(item.id)||{record:state.cargo.find(cargo=>cargo.id===item.id)||item,implicit:0,explicit:0};const raw=item.unplacedQuantity??item.unplacedCount;if(raw==null)entry.implicit+=1;else entry.explicit=Math.max(entry.explicit,Math.max(1,Math.floor(+raw||1)));grouped.set(item.id,entry);});
  const remaining=new Map([...grouped].map(([id,entry])=>[id,{record:entry.record,count:entry.explicit||entry.implicit}]));
  const trucks=state.containers.filter(container=>container.type==='车厢').slice().sort((a,b)=>usableVolume(b)-usableVolume(a)||b.l-a.l||b.w-a.w||b.h-a.h);
  const requested=()=>[...remaining.values()].filter(entry=>entry.count>0).map(entry=>({...entry.record,quantity:entry.count}));
  const total=()=>[...remaining.values()].reduce((sum,entry)=>sum+entry.count,0),plans=[];
  for(let run=0;run<2000&&total()>0;run++){
    const wanted=total(),request=requested();
    const choices=trucks.map(container=>{const plan=packContainer(container,request,'specified'),loaded=[...plan.placedCount.values()].reduce((sum,count)=>sum+(+count||0),0),volume=+plan.loadedVolume||0,capacity=usableVolume(container);return{plan,loaded,volume,capacity};}).filter(choice=>choice.loaded>0);
    if(!choices.length)break;
    const complete=choices.filter(choice=>choice.loaded===wanted).sort((a,b)=>a.capacity-b.capacity||a.plan.container.l-b.plan.container.l);
    /* The final vehicle is the smallest truck that can take all remaining
       packages. Until then, use the largest truck, subtract exactly what it
       loaded, and evaluate the smaller remainder again. */
    const largestProgress=choices.filter(choice=>choice.loaded<wanted).sort((a,b)=>b.capacity-a.capacity||b.loaded-a.loaded||b.volume-a.volume);
    const selected=complete[0]||largestProgress[0];if(!selected)break;
    plans.push(selected.plan);let progress=0;
    selected.plan.placedCount.forEach((count,id)=>{const entry=remaining.get(id);if(!entry)return;const used=Math.min(entry.count,Math.max(0,+count||0));entry.count-=used;progress+=used;});
    if(!progress)break;
  }
  return{plans,remaining:[...remaining.values()].flatMap(entry=>Array.from({length:entry.count},()=>({...entry.record})))};
}
buildExtraVehiclePlans=buildExtraVehiclePlansV319;
buildExtraVehiclePlansV313=buildExtraVehiclePlansV319;
buildExtraVehiclePlansV314=buildExtraVehiclePlansV319;
if(typeof buildExtraVehiclePlansV316!=='undefined')buildExtraVehiclePlansV316=buildExtraVehiclePlansV319;
renderSelectorsV319();

/* v3.2.4 — specified-quantity packing priority has one final controller. */
function specifiedFillPriorityV324(){
  const allowed=new Set(['inside','side','bottom']);
  const select=$('#specifiedFillPriority');
  const value=state.settings?.specifiedFillPriority||select?.value||'inside';
  return allowed.has(value)?value:'inside';
}
function syncSpecifiedFillPriorityV324(){
  const specified=activeMode()==='specified',step=$('#loadingModeStep'),select=$('#specifiedFillPriority');
  step?.classList.toggle('specified-active',specified);
  if(select){select.disabled=!specified;select.value=specifiedFillPriorityV324();}
}
function generatePlanV324(){
  const containers=state.containers.filter(container=>state.selectedContainers.has(container.id));
  const cargo=state.cargo.filter(item=>state.selectedCargo.has(item.id));
  if(!containers.length||!cargo.length){showNotice(t('请至少选择一个容器和一种货物。'));return;}
  const mode=activeMode(),fillPriority=mode==='specified'?specifiedFillPriorityV324():'inside';
  state.settings.specifiedFillPriority=fillPriority;
  state.hiddenCargoIds.clear();
  state.plan={plans:containers.map(container=>packContainer(container,cargo,mode,fillPriority)),active:0,mode,fillPriority};
  persistState();
  showSuccess(t('已生成新装载方案，请查看'),3000);
  $('#results').classList.remove('hidden');renderPlan();$('#results').scrollIntoView({behavior:'smooth',block:'start'});
}
$('#specifiedFillPriority')?.addEventListener('change',event=>{state.settings.specifiedFillPriority=event.target.value;persistState();});
document.addEventListener('change',event=>{
  if(event.target instanceof HTMLInputElement&&event.target.name==='mode'){
    queueMicrotask(()=>{syncSpecifiedFillPriorityV324();renderSelectorsV319();});
  }
},true);
document.addEventListener('click',event=>{
  if(event.target.closest('#calculate')){event.preventDefault();event.stopImmediatePropagation();generatePlanV324();}
  if(event.target.closest('#resetWorkspace'))setTimeout(()=>{state.settings.specifiedFillPriority='inside';persistState();syncSpecifiedFillPriorityV324();renderSelectorsV319();},0);
},true);
syncSpecifiedFillPriorityV324();

/* v3.2.5 — one modal selection flow owns containers and cargo.  The planner
   only renders confirmed selections, so mode changes and reset can never
   revive a historical list layout. */
let selectorPickerKindV325='containers',selectorPickerTabV325='all';
const escV325=value=>String(value??'').replace(/[&<>"']/g,char=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const pickerTermsV325=value=>String(value||'').trim().toLowerCase().split(/[\s,，]+/).filter(Boolean);
function pickerMatchesV325(item,terms){return !terms.length||terms.every(term=>`${item.name||''} ${item.type||''} ${item.l||''} ${item.w||''} ${item.h||''}`.toLowerCase().includes(term));}
function pickerFavoritesV325(kind){const key=kind==='cargo'?'favoriteCargoIds':'favoriteContainerIds';const ids=new Set(state.settings[key]||[]);state.settings[key]=[...ids];return {ids,key};}
function selectedItemsV325(kind){const list=kind==='cargo'?state.cargo:state.containers,ids=kind==='cargo'?state.selectedCargo:state.selectedContainers;return list.filter(item=>ids.has(item.id));}
function pickerPageV325(kind){const key=kind==='cargo'?'pickerCargoPage':'pickerContainerPage';return Math.max(1,+state.ui[key]||1);}
function setPickerPageV325(kind,page){state.ui[kind==='cargo'?'pickerCargoPage':'pickerContainerPage']=Math.max(1,page);}
function activePickerModeV325(){return activeMode()==='specified';}
function normalizePickerSelectionV325(){if(activePickerModeV325())return;const first=[...state.selectedCargo][0];state.selectedCargo=new Set(first?[first]:[]);}
function syncSpecifiedFillPriorityV325(){const specified=activeMode()==='specified',wrap=$('#specifiedFillPriorityWrap'),select=$('#specifiedFillPriority');if(wrap)wrap.hidden=!specified;if(select){select.disabled=!specified;select.value=specifiedFillPriorityV324();}}
function renderCurrentSelectorsV325(){
  const render=(kind,hostId)=>{const host=$('#'+hostId),items=selectedItemsV325(kind);if(!host)return;host.innerHTML=items.map(item=>{const stat=kind==='cargo'?`${state.settings.quantityInputMode==='pieces'?'折合 '+Math.ceil(Math.max(1,+item.pieceQuantity||(+item.quantity||1)*Math.max(1,+item.pieces||1))/Math.max(1,+item.pieces||1)).toLocaleString()+' 包':'共 '+((+item.quantity||1)*Math.max(1,+item.pieces||1)).toLocaleString()+' 件'}`:item.type;return `<div class="selector-current-row"><i class="color-square" style="background:${escV325(item.color||'#2563eb')}"></i><span class="record-main"><b title="${escV325(item.name)}">${escV325(item.name)}</b><small title="${escV325(kind==='cargo'?cargoLabel(item):containerLabel(item))}">${escV325(kind==='cargo'?cargoLabel(item):containerLabel(item))}</small></span><strong class="selector-current-stat">${escV325(stat)}</strong></div>`;}).join('')||'<div class="empty-state">暂未选择项目，请点击右上角按钮选择。</div>';};
  render('containers','containerList');render('cargo','cargoList');
  const containerCount=$('#selectedContainerCount'),cargoCount=$('#selectedCargoCount');if(containerCount)containerCount.textContent=`已选 ${state.selectedContainers.size} 项`;if(cargoCount)cargoCount.textContent=`已选 ${state.selectedCargo.size} 项`;
}
function renderSelectorsV325(){normalizePickerSelectionV325();syncSpecifiedFillPriorityV325();renderCurrentSelectorsV325();renderExactUtilization();}
function ensureSelectorPickerV325(){
  if($('#selectorPickerDialog'))return;
  document.body.insertAdjacentHTML('beforeend',`<dialog id="selectorPickerDialog" class="selector-picker-dialog"><div class="selector-picker-shell"><div class="modal-head"><div><p class="eyebrow">TOP BOX</p><h2 id="selectorPickerTitle">选择项目</h2></div><button type="button" class="icon-button" id="closeSelectorPicker" aria-label="关闭">×</button></div><div class="selector-picker-tools"><div class="selector-picker-tabs"><button type="button" data-picker-tab="all" class="active">全部</button><button type="button" data-picker-tab="favorites">已收藏</button></div><button type="button" id="pickerSelectAll" class="picker-primary">全选</button><button type="button" id="pickerClearAll">取消全选</button><button type="button" id="pickerReset">重置</button><span id="pickerQuantityMode" class="picker-mode" hidden></span><label class="selector-picker-search"><span>⌕</span><input id="pickerSearch" type="search" placeholder="输入名称、类型或尺寸模糊查询"></label></div><div id="selectorPickerList" class="selector-picker-list"></div><div class="selector-picker-footer"><div id="selectorPickerPager" class="selector-picker-pager"></div><div class="modal-actions"><button type="button" class="button secondary" id="pickerManageArchive">管理档案</button><button type="button" class="button secondary" id="cancelSelectorPicker">取消</button><button type="button" class="button primary" id="confirmSelectorPicker">完成选择</button></div></div></div></dialog>`);
  const dialog=$('#selectorPickerDialog');
  $('#closeSelectorPicker').onclick=()=>dialog.close();$('#cancelSelectorPicker').onclick=()=>dialog.close();$('#confirmSelectorPicker').onclick=()=>{persistState();renderSelectorsV325();dialog.close();};
  $('#pickerSearch').oninput=()=>{setPickerPageV325(selectorPickerKindV325,1);renderSelectorPickerV325();};
  $$('.selector-picker-tabs button').forEach(button=>button.onclick=()=>{selectorPickerTabV325=button.dataset.pickerTab;setPickerPageV325(selectorPickerKindV325,1);renderSelectorPickerV325();});
  $('#pickerSelectAll').onclick=()=>{if(selectorPickerKindV325==='cargo'&&!activePickerModeV325())return;const list=pickerFilteredV325();const set=selectorPickerKindV325==='cargo'?state.selectedCargo:state.selectedContainers;list.forEach(item=>set.add(item.id));persistState();renderSelectorPickerV325();};
  $('#pickerClearAll').onclick=()=>{(selectorPickerKindV325==='cargo'?state.selectedCargo:state.selectedContainers).clear();persistState();renderSelectorPickerV325();};
  $('#pickerReset').onclick=()=>{if(selectorPickerKindV325==='cargo'){state.selectedCargo.clear();state.settings.quantityInputMode='bags';state.cargo.forEach(item=>{item.quantity=1;item.pieceQuantity=Math.max(1,+item.pieces||1);});}else state.selectedContainers.clear();persistState();renderSelectorPickerV325();};
  $('#pickerManageArchive').onclick=()=>{const target=selectorPickerKindV325==='cargo'?'cargo':'containers';state.archive=target;persistState();dialog.close();document.querySelector(`.nav-link[data-page="archives"]`)?.click();setTimeout(()=>document.querySelector(`[data-archive-tab="${target}"]`)?.click(),0);};
  $('#selectorPickerList').addEventListener('click',event=>{const favorite=event.target.closest('[data-picker-favorite]');if(favorite){const {ids,key}=pickerFavoritesV325(selectorPickerKindV325),id=favorite.dataset.pickerFavorite;ids.has(id)?ids.delete(id):ids.add(id);state.settings[key]=[...ids];persistState();renderSelectorPickerV325();return;}const check=event.target.closest('[data-picker-check]');if(!check)return;const id=check.dataset.pickerCheck,set=selectorPickerKindV325==='cargo'?state.selectedCargo:state.selectedContainers;if(selectorPickerKindV325==='cargo'&&!activePickerModeV325()){set.clear();set.add(id);}else if(set.has(id))set.delete(id);else set.add(id);persistState();renderSelectorPickerV325();});
  $('#selectorPickerList').addEventListener('input',event=>{const input=event.target.closest('[data-picker-quantity]');if(!input)return;const item=state.cargo.find(value=>value.id===input.dataset.pickerQuantity);if(!item)return;const per=Math.max(1,+item.pieces||1),pieces=state.settings.quantityInputMode==='pieces';const value=Math.max(1,+input.value||1);if(pieces){item.pieceQuantity=value;item.quantity=Math.ceil(value/per);}else{item.quantity=value;item.pieceQuantity=value*per;}renderSelectorPickerV325(false);});
  $('#selectorPickerList').addEventListener('change',event=>{if(event.target.closest('[data-picker-quantity]'))persistState();});
}
function pickerFilteredV325(){const list=selectorPickerKindV325==='cargo'?state.cargo:state.containers,{ids}=pickerFavoritesV325(selectorPickerKindV325),terms=pickerTermsV325($('#pickerSearch')?.value);return list.filter(item=>(selectorPickerTabV325==='favorites'?ids.has(item.id):true)&&pickerMatchesV325(item,terms));}
function renderSelectorPickerV325(persist=true){
  const listHost=$('#selectorPickerList'),pager=$('#selectorPickerPager'),modeHost=$('#pickerQuantityMode');if(!listHost)return;
  const kind=selectorPickerKindV325,isCargo=kind==='cargo',specified=activePickerModeV325(),{ids:favorites}=pickerFavoritesV325(kind),all=pickerFilteredV325(),size=20,pages=Math.max(1,Math.ceil(all.length/size)),page=Math.min(pickerPageV325(kind),pages),rows=all.slice((page-1)*size,page*size),selected=isCargo?state.selectedCargo:state.selectedContainers,pieceMode=state.settings.quantityInputMode==='pieces';setPickerPageV325(kind,page);
  $('#selectorPickerTitle').textContent=isCargo?'选择货物':'选择容器';
  $$('.selector-picker-tabs button').forEach(button=>button.classList.toggle('active',button.dataset.pickerTab===selectorPickerTabV325));
  $('#pickerSelectAll').disabled=isCargo&&!specified;
  modeHost.hidden=!isCargo;modeHost.innerHTML=isCargo?`<button type="button" data-picker-mode="bags" class="${!pieceMode?'active':''}" ${!specified?'disabled':''}>按包数输入</button><button type="button" data-picker-mode="pieces" class="${pieceMode?'active':''}" ${!specified?'disabled':''}>按小件数输入</button>`:'';
  $$('[data-picker-mode]',modeHost).forEach(button=>button.onclick=()=>{if(button.disabled)return;state.settings.quantityInputMode=button.dataset.pickerMode;persistState();renderSelectorPickerV325();});
  listHost.innerHTML=rows.map(item=>{const checked=selected.has(item.id),per=Math.max(1,+item.pieces||1),value=pieceMode?Math.max(1,+item.pieceQuantity||(+item.quantity||1)*per):Math.max(1,+item.quantity||1),result=pieceMode?`折合 ${Math.ceil(value/per).toLocaleString()} 包`:`共 ${(value*per).toLocaleString()} 件`;return `<div class="selector-picker-row ${checked?'checked':''}"><input type="${isCargo&&!specified?'radio':'checkbox'}" name="${isCargo&&!specified?'full-cargo-choice':''}" data-picker-check="${escV325(item.id)}" ${checked?'checked':''}><button type="button" class="picker-favorite ${favorites.has(item.id)?'active':''}" data-picker-favorite="${escV325(item.id)}" title="${favorites.has(item.id)?'取消收藏':'收藏'}">★</button><span class="picker-main"><b>${escV325(item.name)}</b><small>${escV325(isCargo?cargoLabel(item):containerLabel(item))}</small></span>${isCargo?`<span class="picker-quantity"><input type="number" min="1" data-picker-quantity="${escV325(item.id)}" value="${value}" ${specified?'':'disabled'}><em>${pieceMode?'件':'包'}</em></span><strong class="picker-result">${result}</strong>`:`<span class="picker-type">${escV325(item.type)}</span>`}</div>`;}).join('')||'<div class="empty-state">没有匹配的项目</div>';
  pager.innerHTML=`<span>${all.length?`${(page-1)*size+1}-${Math.min(page*size,all.length)}/${all.length}`:'0/0'}</span><button type="button" data-picker-page="-1" ${page<=1?'disabled':''}>‹</button><button type="button" data-picker-page="1" ${page>=pages?'disabled':''}>›</button>`;
  $$('[data-picker-page]',pager).forEach(button=>button.onclick=()=>{setPickerPageV325(kind,page+(+button.dataset.pickerPage));renderSelectorPickerV325();});
  if(persist)persistState();
}
function openSelectorPickerV325(kind){ensureSelectorPickerV325();selectorPickerKindV325=kind;selectorPickerTabV325='all';$('#pickerSearch').value='';renderSelectorPickerV325(false);$('#selectorPickerDialog').showModal();requestAnimationFrame(()=>$('#pickerSearch').focus());}
$('#openContainerPicker')?.addEventListener('click',()=>openSelectorPickerV325('containers'));
$('#openCargoPicker')?.addEventListener('click',()=>openSelectorPickerV325('cargo'));
document.addEventListener('change',event=>{if(event.target instanceof HTMLInputElement&&event.target.name==='mode'){setTimeout(()=>{normalizePickerSelectionV325();renderSelectorsV325();const dialog=$('#selectorPickerDialog');if(dialog?.open)renderSelectorPickerV325(false);},0);}},true);
renderSelectors=renderSelectorsV325;renderSelectorsV293=renderSelectorsV325;renderSelectorsV315=renderSelectorsV325;renderSelectorsV318=renderSelectorsV325;renderSelectorsV319=renderSelectorsV325;renderCargoRowsV315=renderSelectorsV325;renderCargoRowsV318=renderSelectorsV325;renderCargoSelectorV296=renderSelectorsV325;scheduleSelectorsV318=renderSelectorsV325;scheduleSelectorsV319=renderSelectorsV325;scheduleCargoSelectorV296=renderSelectorsV325;window.TopBoxApp.renderSelectors=renderSelectorsV325;
renderSelectorsV325();

/* v3.2.8 — one final selector controller.  Keep all planner entry paths on
   the same renderer so mode changes and resets cannot revive legacy cards. */
function resetCargoSelectionV328(){
  state.selectedCargo.clear();
  state.settings.quantityInputMode='bags';
  state.cargo.forEach(item=>{
    const pieces=Math.max(1,+item.pieces||1);
    item.quantity=1;
    item.pieceQuantity=pieces;
  });
}
function resetPlannerSelectionsV328(){
  state.selectedContainers.clear();
  resetCargoSelectionV328();
}
function syncSpecifiedFillPriorityV328(){
  const specified=activeMode()==='specified';
  const button=$('#specifiedFillSettings');
  if(button)button.hidden=!specified;
  const wrap=$('#specifiedFillPriorityWrap');
  if(wrap){wrap.hidden=true;wrap.style.display='none';}
  const input=$('#specifiedFillPriority');
  if(input){input.disabled=!specified;input.value=specifiedFillPriorityV324();}
}
function renderSelectorsV328(){
  normalizePickerSelectionV325();
  syncSpecifiedFillPriorityV328();
  renderCurrentSelectorsV325();
  renderExactUtilization();
}
function generatePlanV328(){
  const containers=state.containers.filter(item=>state.selectedContainers.has(item.id));
  const cargo=state.cargo.filter(item=>state.selectedCargo.has(item.id));
  if(!containers.length||!cargo.length){showNotice('请至少选择一个容器和一个货物。');return;}
  const mode=activeMode(),fillPriority=mode==='specified'?specifiedFillPriorityV324():'inside';
  state.settings.specifiedFillPriority=fillPriority;
  state.hiddenCargoIds.clear();
  state.plan={plans:containers.map(container=>packContainer(container,cargo,mode,fillPriority)),active:0,mode,fillPriority};
  persistState();
  showSuccess(t('已生成新装载方案，请查看'),3000);
  $('#results').classList.remove('hidden');
  renderPlan();
  $('#results').scrollIntoView({behavior:'smooth',block:'start'});
}
syncSpecifiedFillPriorityV324=syncSpecifiedFillPriorityV328;
syncSpecifiedFillPriorityV325=syncSpecifiedFillPriorityV328;
renderSelectors=renderSelectorsV328;
renderSelectorsV293=renderSelectorsV328;
renderSelectorsV315=renderSelectorsV328;
renderSelectorsV318=renderSelectorsV328;
renderSelectorsV319=renderSelectorsV328;
renderSelectorsV325=renderSelectorsV328;
renderCargoRowsV315=renderSelectorsV328;
renderCargoRowsV318=renderSelectorsV328;
renderCargoSelectorV296=renderSelectorsV328;
scheduleSelectorsV318=renderSelectorsV328;
scheduleSelectorsV319=renderSelectorsV328;
scheduleCargoSelectorV296=renderSelectorsV328;
window.TopBoxApp.renderSelectors=renderSelectorsV328;
generatePlanV324=generatePlanV328;

$('#specifiedFillSettings')?.addEventListener('click',event=>{
  event.preventDefault();event.stopPropagation();openSpecifiedFillPriorityDialogV327();
});
$('#resetContainerSelection')?.addEventListener('click',event=>{
  event.preventDefault();state.selectedContainers.clear();persistState();renderSelectorsV328();
});
$('#resetCargoSelection')?.addEventListener('click',event=>{
  event.preventDefault();resetCargoSelectionV328();persistState();renderSelectorsV328();
});
document.addEventListener('change',event=>{
  if(!(event.target instanceof HTMLInputElement)||event.target.name!=='mode')return;
  setTimeout(()=>{
    resetCargoSelectionV328();
    persistState();
    renderSelectorsV328();
    if($('#selectorPickerDialog')?.open)renderSelectorPickerV326(false);
  },0);
},true);
document.addEventListener('click',event=>{
  if(event.target.closest('#refreshPage')){resetPlannerSelectionsV328();persistState();}
  if(event.target.closest('#resetWorkspace'))setTimeout(()=>{resetPlannerSelectionsV328();state.settings.specifiedFillPriority='inside';persistState();renderSelectorsV328();},0);
},true);

/* Browser reloads always start a new calculation, without changing archives. */
setTimeout(()=>{resetPlannerSelectionsV328();persistState();renderSelectorsV328();},0);

/* v3.2.7 — planner selection controls have one reset path and the specified
   quantity packing preference is configured in a small radio dialog. */
function resetCargoSelectionV327({resetQuantities=true}={}){
  state.selectedCargo.clear();
  if(resetQuantities){
    state.settings.quantityInputMode='bags';
    state.cargo.forEach(item=>{
      item.quantity=1;
      item.pieceQuantity=Math.max(1,+item.pieces||1);
    });
  }
}
function resetAllSelectionsV327(){
  state.selectedContainers.clear();
  resetCargoSelectionV327();
  persistState();
}
function renderSelectorsV327(){
  normalizePickerSelectionV325();
  syncSpecifiedFillPriorityV327();
  renderCurrentSelectorsV325();
  renderExactUtilization();
}
function ensureSpecifiedFillPriorityDialogV327(){
  if($('#specifiedFillPriorityDialog'))return;
  document.body.insertAdjacentHTML('beforeend',`<dialog id="specifiedFillPriorityDialog" class="fill-priority-dialog"><div class="fill-priority-shell"><div class="modal-head"><div><p class="eyebrow">TOP BOX</p><h2>指定数量铺满优先级</h2><small>选择优先组织货物的平面；超出容量的货物将保留为未装载。</small></div><button class="icon-button" type="button" id="closeSpecifiedFillPriority" aria-label="关闭">×</button></div><div class="fill-priority-options" role="radiogroup" aria-label="指定数量铺满优先级"><label><input type="radio" name="specified-fill-priority" value="inside"><span><b>优先铺满里面</b><small>宽高方向</small></span></label><label><input type="radio" name="specified-fill-priority" value="side"><span><b>优先铺满侧面</b><small>长高方向</small></span></label><label><input type="radio" name="specified-fill-priority" value="bottom"><span><b>优先铺满底面</b><small>长宽方向</small></span></label></div><div class="modal-actions"><button type="button" class="button secondary" id="cancelSpecifiedFillPriority">取消</button><button type="button" class="button primary" id="saveSpecifiedFillPriority">确定</button></div></div></dialog>`);
  const dialog=$('#specifiedFillPriorityDialog');
  const close=()=>dialog.close();
  $('#closeSpecifiedFillPriority').onclick=close;
  $('#cancelSpecifiedFillPriority').onclick=close;
  $('#saveSpecifiedFillPriority').onclick=()=>{
    const value=$('input[name="specified-fill-priority"]:checked')?.value||'inside';
    state.settings.specifiedFillPriority=value;
    const input=$('#specifiedFillPriority');
    if(input)input.value=value;
    persistState();
    close();
  };
}
function openSpecifiedFillPriorityDialogV327(){
  if(activeMode()!=='specified')return;
  ensureSpecifiedFillPriorityDialogV327();
  const value=specifiedFillPriorityV324();
  const radio=$(`input[name="specified-fill-priority"][value="${value}"]`);
  if(radio)radio.checked=true;
  if (!$('#specifiedFillPriorityDialog').open) $('#specifiedFillPriorityDialog').showModal();
}
function syncSpecifiedFillPriorityV327(){
  const specified=activeMode()==='specified';
  $('#loadingModeStep')?.classList.toggle('specified-active',specified);
  const input=$('#specifiedFillPriority');
  if(input){input.disabled=!specified;input.value=specifiedFillPriorityV324();}
  const button=$('#specifiedFillSettings');
  if(button)button.hidden=!specified;
  const wrap=$('#specifiedFillPriorityWrap');
  if(wrap)wrap.hidden=true;
}
syncSpecifiedFillPriorityV324=syncSpecifiedFillPriorityV327;
syncSpecifiedFillPriorityV325=syncSpecifiedFillPriorityV327;

function generatePlanV327(){
  const containers=state.containers.filter(container=>state.selectedContainers.has(container.id));
  const cargo=state.cargo.filter(item=>state.selectedCargo.has(item.id));
  if(!containers.length||!cargo.length){showNotice('请至少选择一个容器和一个货物。');return;}
  const mode=activeMode(),fillPriority=mode==='specified'?specifiedFillPriorityV324():'inside';
  state.settings.specifiedFillPriority=fillPriority;
  state.hiddenCargoIds.clear();
  state.plan={plans:containers.map(container=>packContainer(container,cargo,mode,fillPriority)),active:0,mode,fillPriority};
  persistState();
  showSuccess(t('已生成新装载方案，请查看'),3000);
  $('#results').classList.remove('hidden');
  renderPlan();
  $('#results').scrollIntoView({behavior:'smooth',block:'start'});
}
generatePlanV324=generatePlanV327;

$('#specifiedFillSettings')?.addEventListener('click',event=>{
  event.preventDefault();
  event.stopPropagation();
  openSpecifiedFillPriorityDialogV327();
});
$('#resetContainerSelection')?.addEventListener('click',()=>{
  state.selectedContainers.clear();
  persistState();
  renderSelectorsV327();
});
$('#resetCargoSelection')?.addEventListener('click',()=>{
  resetCargoSelectionV327();
  persistState();
  renderSelectorsV327();
});
document.addEventListener('change',event=>{
  if(!(event.target instanceof HTMLInputElement)||event.target.name!=='mode')return;
  setTimeout(()=>{
    resetCargoSelectionV327();
    persistState();
    renderSelectorsV327();
    const dialog=$('#selectorPickerDialog');
    if(dialog?.open)renderSelectorPickerV326(false);
  },0);
},true);
document.addEventListener('click',event=>{
  if(event.target.closest('#refreshPage')){
    resetAllSelectionsV327();
  }
  if(event.target.closest('#resetWorkspace')){
    setTimeout(()=>{
      resetAllSelectionsV327();
      state.settings.specifiedFillPriority='inside';
      syncSpecifiedFillPriorityV327();
      renderSelectorsV327();
    },0);
  }
},true);

/* A browser reload intentionally begins with a clean selection workspace. */
resetAllSelectionsV327();
renderSelectorsV327();

/* v3.2.6 — selector dialogs own one stable layout and never re-render while a
   quantity field is being typed.  This replaces the last legacy picker row
   path rather than layering another cargo-list renderer over it. */
function pickerTypeToneV326(type){
  const value=String(type||'');
  if(value.includes('车厢'))return 'vehicle';
  if(value.includes('箱'))return 'box';
  if(value.includes('桶'))return 'barrel';
  if(value.includes('托盘'))return 'pallet';
  return 'default';
}
function cargoSelectionStatV326(item){
  const pieces=Math.max(1,+item.pieces||1),pieceMode=state.settings.quantityInputMode==='pieces';
  const value=Math.max(1,pieceMode?(+item.pieceQuantity||(+item.quantity||1)*pieces):(+item.quantity||1));
  return pieceMode?`${value.toLocaleString()} 件 · 折合 ${Math.ceil(value/pieces).toLocaleString()} 包`:`${value.toLocaleString()} 包 · 共 ${(value*pieces).toLocaleString()} 件`;
}
renderCurrentSelectorsV325=function(){
  const render=(kind,hostId)=>{
    const host=$('#'+hostId),items=selectedItemsV325(kind);if(!host)return;
    host.innerHTML=items.map(item=>{
      const label=kind==='cargo'?cargoLabel(item):containerLabel(item);
      return `<div class="selector-current-row"><i class="color-square" style="background:${escV325(item.color||'#2563eb')}"></i><span class="record-main"><b title="${escV325(item.name)}">${escV325(item.name)}</b><small title="${escV325(label)}">${escV325(label)}</small></span><strong class="selector-current-stat">${escV325(kind==='cargo'?cargoSelectionStatV326(item):item.type)}</strong></div>`;
    }).join('')||'<div class="empty-state">暂未选择项目，请点击右上角按钮选择。</div>';
  };
  render('containers','containerList');render('cargo','cargoList');
  const containers=$('#selectedContainerCount'),cargo=$('#selectedCargoCount');
  if(containers)containers.textContent=`已选 ${state.selectedContainers.size} 项`;
  if(cargo)cargo.textContent=`已选 ${state.selectedCargo.size} 项`;
};
function pickerRowV326(item,kind,favorites,selected){
  const cargo=kind==='cargo',pieces=Math.max(1,+item.pieces||1),pieceMode=state.settings.quantityInputMode==='pieces';
  const value=Math.max(1,pieceMode?(+item.pieceQuantity||(+item.quantity||1)*pieces):(+item.quantity||1));
  const result=pieceMode?`折合 ${Math.ceil(value/pieces).toLocaleString()} 包`:`共 ${(value*pieces).toLocaleString()} 件`;
  const inputType=cargo&&!activePickerModeV325()?'radio':'checkbox';
  return `<article class="selector-picker-row ${selected?'selected':''}" data-picker-row="${escV325(item.id)}"><input type="${inputType}" name="${inputType==='radio'?'full-cargo-choice':''}" data-picker-check="${escV325(item.id)}" ${selected?'checked':''} aria-label="选择 ${escV325(item.name)}"><button type="button" class="picker-favorite ${favorites.has(item.id)?'active':''}" data-picker-favorite="${escV325(item.id)}" title="${favorites.has(item.id)?'取消收藏':'收藏'}">★</button>${cargo?`<i class="picker-color" style="background:${escV325(item.color||'#2563eb')}"></i>`:''}<span class="picker-main"><b title="${escV325(item.name)}">${escV325(item.name)}</b><small title="${escV325(cargo?cargoLabel(item):containerLabel(item))}">${escV325(cargo?cargoLabel(item):containerLabel(item))}</small></span>${cargo?`<span class="picker-quantity"><input type="number" min="1" step="1" data-picker-quantity="${escV325(item.id)}" value="${value}" ${activePickerModeV325()?'':'disabled'}><em>${pieceMode?'件':'包'}</em></span><strong class="picker-result">${result}</strong>`:`<span class="picker-type picker-type-${pickerTypeToneV326(item.type)}">${escV325(item.type)}</span>`}</article>`;
}
function renderSelectorPickerV326(persist=true){
  const listHost=$('#selectorPickerList'),pager=$('#selectorPickerPager'),modeHost=$('#pickerQuantityMode');if(!listHost)return;
  const kind=selectorPickerKindV325,isCargo=kind==='cargo',specified=activePickerModeV325(),{ids:favorites}=pickerFavoritesV325(kind),all=pickerFilteredV325(),size=20,pages=Math.max(1,Math.ceil(all.length/size)),page=Math.min(pickerPageV325(kind),pages),rows=all.slice((page-1)*size,page*size),selected=isCargo?state.selectedCargo:state.selectedContainers,pieceMode=state.settings.quantityInputMode==='pieces';
  setPickerPageV325(kind,page);$('#selectorPickerTitle').textContent=isCargo?'选择货物':'选择容器';
  $$('.selector-picker-tabs button').forEach(button=>button.classList.toggle('active',button.dataset.pickerTab===selectorPickerTabV325));
  $('#pickerSelectAll').disabled=isCargo&&!specified;modeHost.hidden=!isCargo;
  modeHost.innerHTML=isCargo?`<button type="button" data-picker-mode="bags" class="${!pieceMode?'active':''}" ${!specified?'disabled':''}>按包数输入</button><button type="button" data-picker-mode="pieces" class="${pieceMode?'active':''}" ${!specified?'disabled':''}>按小件数输入</button>`:'';
  $$('[data-picker-mode]',modeHost).forEach(button=>button.onclick=()=>{if(button.disabled)return;state.settings.quantityInputMode=button.dataset.pickerMode;state.cargo.forEach(item=>{const per=Math.max(1,+item.pieces||1);if(button.dataset.pickerMode==='pieces')item.pieceQuantity=Math.max(1,(+item.quantity||1)*per);else item.quantity=Math.max(1,Math.ceil((+item.pieceQuantity||per)/per));});persistState();renderSelectorPickerV326(false);});
  listHost.innerHTML=rows.map(item=>pickerRowV326(item,kind,favorites,selected.has(item.id))).join('')||'<div class="empty-state">没有匹配的项目</div>';
  pager.innerHTML=`<span>${all.length?`${(page-1)*size+1}-${Math.min(page*size,all.length)}/${all.length}`:'0/0'}</span><button type="button" data-picker-page="-1" ${page<=1?'disabled':''}>‹</button><button type="button" data-picker-page="1" ${page>=pages?'disabled':''}>›</button>`;
  $$('[data-picker-page]',pager).forEach(button=>button.onclick=()=>{setPickerPageV325(kind,page+(+button.dataset.pickerPage));renderSelectorPickerV326();});
  if(persist)persistState();
}
function bindSelectorPickerV326(){
  const dialog=$('#selectorPickerDialog'),host=$('#selectorPickerList');if(!dialog||!host||host.dataset.v326Bound)return;host.dataset.v326Bound='1';
  dialog.addEventListener('close',()=>document.body.classList.remove('selector-dialog-open'));
  host.addEventListener('click',event=>{
    const favorite=event.target.closest('[data-picker-favorite]');
    if(favorite){event.preventDefault();event.stopImmediatePropagation();const {ids,key}=pickerFavoritesV325(selectorPickerKindV325),id=favorite.dataset.pickerFavorite;ids.has(id)?ids.delete(id):ids.add(id);state.settings[key]=[...ids];persistState();renderSelectorPickerV326(false);return;}
    if(event.target.closest('[data-picker-quantity]'))return;
    const row=event.target.closest('[data-picker-row]');if(!row)return;
    event.preventDefault();event.stopImmediatePropagation();
    const id=row.dataset.pickerRow,set=selectorPickerKindV325==='cargo'?state.selectedCargo:state.selectedContainers;
    if(selectorPickerKindV325==='cargo'&&!activePickerModeV325()){set.clear();set.add(id);}else if(set.has(id))set.delete(id);else set.add(id);
    persistState();renderSelectorPickerV326(false);
  },true);
  host.addEventListener('input',event=>{
    const input=event.target.closest('[data-picker-quantity]');if(!input)return;event.stopImmediatePropagation();
    const item=state.cargo.find(value=>value.id===input.dataset.pickerQuantity);if(!item)return;const per=Math.max(1,+item.pieces||1),value=Math.max(1,Math.floor(+input.value||1));
    if(state.settings.quantityInputMode==='pieces'){item.pieceQuantity=value;item.quantity=Math.ceil(value/per);}else{item.quantity=value;item.pieceQuantity=value*per;}
    const result=input.closest('.selector-picker-row')?.querySelector('.picker-result');if(result)result.textContent=state.settings.quantityInputMode==='pieces'?`折合 ${Math.ceil(value/per).toLocaleString()} 包`:`共 ${(value*per).toLocaleString()} 件`;
  },true);
  host.addEventListener('change',event=>{if(event.target.closest('[data-picker-quantity]'))persistState();},true);
}
const openSelectorPickerV326Base=openSelectorPickerV325;
openSelectorPickerV325=function(kind){openSelectorPickerV326Base(kind);bindSelectorPickerV326();document.body.classList.add('selector-dialog-open');renderSelectorPickerV326(false);};
renderSelectorPickerV325=renderSelectorPickerV326;
const generatePlanV326Base=generatePlanV324;
generatePlanV324=function(){
  if(!state.selectedContainers.size||!state.selectedCargo.size){showNotice('请至少选择一个容器和一种货物。');return;}
  generatePlanV326Base();
};
renderSelectorsV325();

/* v3.2.9 — final runtime aliases.  This file contains earlier compatibility
   layers; keep only this renderer and generator reachable after they load. */
syncSpecifiedFillPriorityV324=syncSpecifiedFillPriorityV328;
syncSpecifiedFillPriorityV325=syncSpecifiedFillPriorityV328;
renderSelectors=renderSelectorsV328;
renderSelectorsV293=renderSelectorsV328;
renderSelectorsV315=renderSelectorsV328;
renderSelectorsV318=renderSelectorsV328;
renderSelectorsV319=renderSelectorsV328;
renderSelectorsV325=renderSelectorsV328;
renderCargoRowsV315=renderSelectorsV328;
renderCargoRowsV318=renderSelectorsV328;
renderCargoSelectorV296=renderSelectorsV328;
scheduleSelectorsV318=renderSelectorsV328;
scheduleSelectorsV319=renderSelectorsV328;
scheduleCargoSelectorV296=renderSelectorsV328;
window.TopBoxApp.renderSelectors=renderSelectorsV328;
generatePlanV324=generatePlanV328;
syncSpecifiedFillPriorityV328();
renderSelectorsV328();

/* v3.2.10 — one canonical confirmed-selection renderer.
   The planner used to retain several historical list renderers.  Every entry
   point now comes through this compact renderer so switching the loading mode
   or resetting cannot bring an older layout back. */
function renderCurrentSelectorsV329(){
  const render=(kind,hostId)=>{
    const host=$('#'+hostId),items=selectedItemsV325(kind);if(!host)return;
    host.hidden=!items.length;
    host.innerHTML=items.map(item=>{
      const label=kind==='cargo'?cargoLabel(item):containerLabel(item);
      const statistic=kind==='cargo'?cargoSelectionStatV326(item):item.type;
      return `<div class="selector-current-row"><i class="color-square" style="background:${escV325(item.color||'#2563eb')}"></i><span class="record-main"><b title="${escV325(item.name)}">${escV325(item.name)}</b><small title="${escV325(label)}">${escV325(label)}</small></span><strong class="selector-current-stat">${escV325(statistic)}</strong></div>`;
    }).join('');
  };
  render('containers','containerList');render('cargo','cargoList');
  const containers=$('#selectedContainerCount'),cargo=$('#selectedCargoCount');
  if(containers)containers.textContent=`已选 ${state.selectedContainers.size} 项`;
  if(cargo)cargo.textContent=`已选 ${state.selectedCargo.size} 项`;
}
function renderSelectorsV329(){
  normalizePickerSelectionV325();
  syncSpecifiedFillPriorityV328();
  renderCurrentSelectorsV329();
  renderExactUtilization();
}
function resetPlannerSelectionsV329(){
  state.selectedContainers.clear();
  resetCargoSelectionV328();
}
renderSelectors=renderSelectorsV329;
renderSelectorsV293=renderSelectorsV329;
renderSelectorsV315=renderSelectorsV329;
renderSelectorsV318=renderSelectorsV329;
renderSelectorsV319=renderSelectorsV329;
renderSelectorsV325=renderSelectorsV329;
window.TopBoxApp.renderSelectors=renderSelectorsV329;
document.addEventListener('click',event=>{
  const option=event.target.closest?.('.mode-option');
  if(!option||option.classList.contains('disabled'))return;
  setTimeout(()=>{resetPlannerSelectionsV329();persistState();renderSelectorsV329();},0);
},true);
document.addEventListener('change',event=>{
  if(!event.target.matches?.('input[name="mode"]'))return;
  setTimeout(()=>{resetPlannerSelectionsV329();persistState();renderSelectorsV329();},0);
},true);
renderSelectorsV329();

/* v3.2.11 — one final planner state policy.  Mode changes clear cargo only;
   a page refresh starts a new workspace and therefore clears both lists. */
resetPlannerSelectionsV329=function(){
  resetCargoSelectionV328();
};
function resetAllPlannerSelectionsV330(){
  state.selectedContainers.clear();
  resetCargoSelectionV328();
}
function priorityLabelV330(value=specifiedFillPriorityV324()){
  return ({inside:'里面',side:'侧面',bottom:'底面'})[value]||'里面';
}
function syncSpecifiedFillPriorityV330(){
  syncSpecifiedFillPriorityV328();
  const button=$('#specifiedFillSettings');
  if(!button)return;
  const value=specifiedFillPriorityV324();
  button.dataset.priority=value;
  button.title=`指定数量：优先铺满${priorityLabelV330(value)}`;
  button.setAttribute('aria-label',button.title);
  button.innerHTML=`<span aria-hidden="true">⚙</span><small>${priorityLabelV330(value)}</small>`;
}
function renderCurrentSelectorsV330(){
  const render=(kind,hostId)=>{
    const host=$('#'+hostId),items=selectedItemsV325(kind);if(!host)return;
    host.hidden=false;
    host.classList.toggle('selector-current-empty',!items.length);
    host.innerHTML=items.map(item=>{
      const label=kind==='cargo'?cargoLabel(item):containerLabel(item);
      const statistic=kind==='cargo'?cargoSelectionStatV326(item):item.type;
      return `<div class="selector-current-row"><i class="color-square" style="background:${escV325(item.color||'#2563eb')}"></i><span class="record-main"><b title="${escV325(item.name)}">${escV325(item.name)}</b><small title="${escV325(label)}">${escV325(label)}</small></span><strong class="selector-current-stat">${escV325(statistic)}</strong></div>`;
    }).join('')||'<div class="empty-state">暂未选择项目，请点击右上角按钮选择。</div>';
  };
  render('containers','containerList');render('cargo','cargoList');
  const containers=$('#selectedContainerCount'),cargo=$('#selectedCargoCount');
  if(containers)containers.textContent=`已选 ${state.selectedContainers.size} 项`;
  if(cargo)cargo.textContent=`已选 ${state.selectedCargo.size} 项`;
}
function renderSelectorsV330(){
  normalizePickerSelectionV325();
  syncSpecifiedFillPriorityV330();
  renderCurrentSelectorsV330();
  renderExactUtilization();
}
renderSelectors=renderSelectorsV330;
renderSelectorsV293=renderSelectorsV330;
renderSelectorsV315=renderSelectorsV330;
renderSelectorsV318=renderSelectorsV330;
renderSelectorsV319=renderSelectorsV330;
renderSelectorsV325=renderSelectorsV330;
window.TopBoxApp.renderSelectors=renderSelectorsV330;

/* A modal owns the viewport: the backdrop must never scroll the planner. */
function syncModalScrollLockV330(){
  const open=[...document.querySelectorAll('dialog[open]')].some(dialog=>
    ['selectorPickerDialog','specifiedFillPriorityDialog','palletKitDialog','palletKitConfirmV330','appDialog'].includes(dialog.id));
  document.documentElement.classList.toggle('topbox-modal-lock',open);
  document.body.classList.toggle('topbox-modal-lock',open);
}
new MutationObserver(syncModalScrollLockV330).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
document.addEventListener('wheel',event=>{
  const dialog=[...document.querySelectorAll('dialog[open]')].find(node=>
    ['selectorPickerDialog','specifiedFillPriorityDialog','palletKitDialog','palletKitConfirmV330','appDialog'].includes(node.id));
  if(!dialog)return;
  const scrollable=event.target.closest?.('.selector-picker-shell,.fill-priority-shell,.pallet-kit-layout,.pallet-kit-panel,.kit-items-panel,.app-dialog-body');
  if(!scrollable)event.preventDefault();
},{capture:true,passive:false});

/* The gear is the only entry point for the priority dialog and also shows
   the saved preference directly on the specified-quantity mode. */
document.addEventListener('click',event=>{
  const gear=event.target.closest?.('#specifiedFillSettings');
  if(!gear)return;
  event.preventDefault();event.stopImmediatePropagation();
  openSpecifiedFillPriorityDialogV327();
  syncModalScrollLockV330();
},true);
document.addEventListener('click',event=>{
  if(!event.target.closest?.('#calculate'))return;
  if(state.selectedContainers.size&&state.selectedCargo.size)return;
  event.preventDefault();event.stopImmediatePropagation();
  showNotice('请至少选择一种容器和一种货物。');
},true);
$('#specifiedFillPriorityDialog')?.addEventListener('close',syncModalScrollLockV330);
document.addEventListener('click',event=>{
  if(event.target.closest?.('#saveSpecifiedFillPriority'))setTimeout(()=>{
    syncSpecifiedFillPriorityV330();persistState();
  },0);
},true);

/* Existing refresh handlers already clear both kinds; this final handler
   keeps that guarantee when the compact controls are used. */
document.addEventListener('click',event=>{
  if(!event.target.closest?.('#refreshPage'))return;
  setTimeout(()=>{resetAllPlannerSelectionsV330();persistState();renderSelectorsV330();},0);
},true);
/* The legacy workspace reset previously also reset the saved fill preference.
   Resetting a workspace is now deliberately limited to the two selections. */
document.addEventListener('click',event=>{
  if(!event.target.closest?.('#resetWorkspace'))return;
  event.preventDefault();event.stopImmediatePropagation();
  resetAllPlannerSelectionsV330();persistState();renderSelectorsV330();
},true);
syncModalScrollLockV330();
renderSelectorsV330();

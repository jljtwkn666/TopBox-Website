Warning: truncated output (original token count: 33226)
Total output lines: 431

import * as THREE from 'https://unpkg.com/three@0.162.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.162.0/examples/jsm/controls/OrbitControls.js';

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
function packContainer(c, selected, mode) {
  let positions = []; const unplaced = [], placedCount = new Map(), candidates = expandRequested(selected, c, mode),isPallet=c.type==='托盘',baseZ=isPallet?Math.max(1,c.h):0;
  const spaces = [{x:0,y:0,z:baseZ,l:c.l,w:c.w,h:isPallet?Number.POSITIVE_INFINITY:c.h}];
  const rotationsFor = item => {
    const values=item.shape==='cylinder' ? [[item.l,item.w,item.h,'upright'],[item.h,item.w,item.l,'lyingLength'],[item.l,item.h,item.w,'lyingWidth']] : [[item.l,item.w,item.h,'longitudinal'],[item.w,item.l,item.h,'transverse'],[item.l,item.h,item.w,'onSideLength'],[item.h,item.l,item.w,'onSideWidth'],[item.w,item.h,item.l,'verticalLength'],[item.h,item.w,item.l,'verticalWidth']];
    return [...new Map(values.map(rotation=>[rotation.slice(0,3).join('×'),rotation])).values()];
  };
  const hasCollision = (x,y,z,l,w,h) => positions.some(p=>x<p.x+p.l&&x+l>p.x&&y<p.y+p.w&&y+w>p.y&&z<p.z+p.h&&z+h>p.z);
  for (const item of candidates) {
    const rotations=rotationsFor(item); let best=null;
    // Keep lower and tighter spaces first.  We stop after the best rotation for the
    // first suitable space, which avoids repeatedly scanning every historical gap.
    const ordered=spaces.map((space,i)=>({space,i})).sort((a,b)=>a.space.z-b.space.z||(a.space.l*a.space.w)-(b.space.l*b.space.w)||a.space.y-b.space.y||a.space.x-b.space.x);
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
function actualUtilization(plan){const available=+plan?.available||0,used=+plan?.loadedVolume||0;return available>0?Math.max(0,used/available*100):0;}
function planTotals(plan){return {packages:plan.positions.length,pieces:plan.positions.reduce((sum,p)=>sum+(+p.pieces||0),0),weight:plan.positions.reduce((sum,p)=>sum+(+p.weight||0),0)};}
function renderContainerPlans(){
  if(!state.plan)return;
  $('#planCountBadge').textContent=`${state.plan.plans.length} 个方案`;
  $('#containerPlans').innerHTML=state.plan.plans.map((plan,index)=>{
    const totals=planTotals(plan),details=state.cargo.filter(g=>state.selectedCargo.has(g.id)).map(g=>{const count=plan.placedCount.get(g.id)||0;return count?`<li><b>${g.name}</b><span>${count} 包 / ${(count*(+g.pieces||0)).toLocaleString()} 件</span><small>${placementDetail(g,plan)}</small></li>`:'';}).join('')||'<li>无可装载货物</li>';
    return `<article class="container-plan-card ${index===state.plan.active?'active':''}"><div class="container-plan-head"><div><p>容器方案 ${index+1}</p><h3>${plan.container.name}</h3><small>${plan.container.l} × ${plan.container.w} × ${plan.container.h} mm</small></div><button class="button secondary" data-activate-plan="${index}">${index===state.plan.active?'正在查看':'查看 3D 方案'}</button></div><div class="container-metrics"><span><b>${actualUtilization(plan).toFixed(2)}%</b>利用率</span><span><b>${totals.packages} 包</b>${totals.pieces.toLocaleString()} 件</span><span><b>${fmtVolume(plan.loadedVolume)}</b>已用容积</span><span><b>${totals.weight.toFixed(0)} kg</b>总重量</span></div><ul class="container-cargo-details">${details}</ul></article>`;
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
  const unLoadedCounts=new Map(); plan.unplaced.forEach(g=>unLoadedCounts.set(g.id,(unLoadedCounts.get(g.id)||0)+1)); $('#unloadedBadge').textContent=`${plan.unplaced.length} 未装`; $('#unloadedDetails').innerHTML=[...unLoadedCounts].map(([id,count])=>detailRow(state.cargo.f…23226 tokens truncated…r?usableVolume(r):cubicMeters(r))}</td><td>${r.weight||0} kg</td>${isContainer?'':`<td>${r.pieces} ${t('件')}</td>`}<td><i class="color-pill" style="background:${r.color}"></i></td><td><span class="row-actions"><button data-edit="${r.id}">${t('编辑')}</button><button class="delete" data-delete="${r.id}">${t('删除')}</button></span></td></tr>`).join('')||`<tr><td colspan="${columns}"><div class="empty-state">${t('没有匹配的档案')}</div></td></tr>`;const all=$('#selectAllArchive');all.checked=filtered.length>0&&filtered.every(r=>selectedArchiveIds.has(r.id));all.indeterminate=filtered.some(r=>selectedArchiveIds.has(r.id))&&!all.checked;all.addEventListener('change',event=>{filtered.forEach(r=>event.target.checked?selectedArchiveIds.add(r.id):selectedArchiveIds.delete(r.id));renderArchives();});$$('[data-select-archive]').forEach(b=>b.addEventListener('change',()=>{b.checked?selectedArchiveIds.add(b.dataset.selectArchive):selectedArchiveIds.delete(b.dataset.selectArchive);renderArchives();}));$$('[data-edit]').forEach(b=>b.addEventListener('click',()=>openDialog(data.find(r=>r.id===b.dataset.edit))));$$('[data-delete]').forEach(b=>b.addEventListener('click',()=>removeArchives([b.dataset.delete])));renderListPager('archivePager',page,filtered.length,'archivePage','archiveSize',renderArchives);updateArchiveBulkButton();applyLanguage();};
const renderSavedPlansV22Base=renderSavedPlans;renderSavedPlans=function(){renderSavedPlansV22Base();const host=$('#savedPlansList');if(!host)return;const head=document.createElement('div');head.className='saved-plan-list-head';head.innerHTML=`<span></span><span>${t('序号')}</span><span>${t('方案名称')}</span><span>${t('数量')}</span>`;host.prepend(head);$$('.saved-plan-card',host).forEach(card=>{card.classList.add('saved-plan-row');const checkbox=$('.plan-select',card),serial=$('.plan-sequence',card);if(checkbox&&serial){card.insertBefore(checkbox,card.firstChild);card.insertBefore(serial,checkbox.nextSibling);}});};
function buildExtraVehiclePlans(unplaced){const trucks=state.containers.filter(c=>c.type==='车厢'),counts=new Map();unplaced.forEach(item=>counts.set(item.id,(counts.get(item.id)||0)+1));const makeCargo=()=>[...counts].filter(([,count])=>count>0).map(([id,count])=>({...state.cargo.find(g=>g.id===id),quantity:count}));const plans=[];for(let run=0;run<20&&[...counts.values()].some(Boolean);run++){const options=trucks.map(container=>({container,plan:packContainer(container,makeCargo(),'specified')})).filter(option=>option.plan.positions.length);if(!options.length)break;options.sort((a,b)=>b.plan.loadedVolume-a.plan.loadedVolume||b.plan.positions.length-a.plan.positions.length);const best=options[0];plans.push(best.plan);best.plan.placedCount.forEach((count,id)=>counts.set(id,Math.max(0,(counts.get(id)||0)-count)));}const remaining=[...counts].flatMap(([id,count])=>Array.from({length:count},()=>state.cargo.find(g=>g.id===id))).filter(Boolean);return {plans,remaining};}
function showExtraVehiclePlans(recommendation){const {plans,remaining}=recommendation;if(!plans.length){showNotice(t('无可用车厢档案可供建议。'),t('额外车辆装载建议'));return;}showDialog({title:t('额外车辆装载建议'),message:`${t('建议增加')} ${plans.length} ${t('辆')} ${t('车厢')}`,kind:'preview',reports:[]});$('#pdfDownload').classList.add('hidden');$('#pdfPrint').classList.add('hidden');$('#pdfPreview').innerHTML=`<div class="extra-vehicle-plans">${plans.map((plan,index)=>{const details=[...plan.placedCount].filter(([,count])=>count).map(([id,count])=>{const cargo=state.cargo.find(g=>g.id===id);return `<li><b>${escapeHtml(cargo?.name||id)}</b><span>${count} ${t('包')} / ${(count*(+cargo?.pieces||1)).toLocaleString()} ${t('件')}</span><small>${placementDetail(cargo,plan)}</small></li>`;}).join('');return `<article class="extra-vehicle-card"><div><b>${t('车厢')} ${index+1}</b><h3>${escapeHtml(plan.container.name)}</h3><p>${plan.container.l} × ${plan.container.w} × ${plan.container.h} mm · ${Math.round(plan.utilization)}%</p></div><ul>${details}</ul></article>`;}).join('')}${remaining.length?`<p class="extra-remaining">${t('仍未能装载')}：${remaining.length} ${t('包')} / ${remaining.reduce((sum,item)=>sum+(+item.pieces||0),0).toLocaleString()} ${t('件')}</p>`:''}</div>`;}
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
Object.assign(I18N.en,{'自定义每页条数':'Custom rows per page','每页条数 (1-5000)':'Rows per page (1–5000)','左键旋转 · 滚轮缩放 · 右键平移':'Left drag to rotate · wheel to zoom · right drag to pan','货物装载配货平台':'Cargo Loading & Allocation Platform','TOP BOX货物装载配货平台首页':'TOP BOX Cargo Loading & Allocation Platform home','TOP BOX货物装载配货平台版本记录。':'TOP BOX Cargo Loading & Allocation Platform release history.','更新日期':'Release date','全部日期':'All dates','全选':'Select all','取消全选':'Clear selection','已选':'Selected','项':'items','序号':'No.'});Object.assign(I18N.th,{'自定义每页条数':'กำหนดจำนวนต่อหน้า','每页条数 (1-5000)':'จำนวนต่อหน้า (1–5000)','左键旋转 · 滚轮缩放 · 右键平移':'ลากซ้ายเพื่อหมุน · ล้อเพื่อซูม · ลากขวาเพื่อเลื่อน','货物装载配货平台':'แพลตฟอร์มจัดการบรรทุกสินค้า','TOP BOX货物装载配货平台首页':'หน้าแรก TOP BOX แพลตฟอร์มจัดการบรรทุกสินค้า','TOP BOX货物装载配货平台版本记录。':'ประวัติเวอร์ชัน TOP BOX แพลตฟอร์มจัดการบรรทุกสินค้า','更新日期':'วันที่อัปเดต','全部日期':'ทุกวันที่','全选':'เลือกทั้งหมด','取消全选':'ยกเลิกทั้งหมด','已选':'เลือกแล้ว','项':'รายการ','序号':'ลำดับ'});const applyLanguageBase=applyLanguage;applyLanguage=function(){applyLanguageBase();document.title=t('TOP BOX货物装载配货平台');};const setCameraBase=setCamera;setCamera=function(view){if(!state.plan)return;const p=state.plan.plans[state.plan.active],s=7/Math.max(p.container.l,p.container.w,p.container.h),loadTop=Math.max(p.container.h,...p.positions.map(item=>item.z+item.h)),center=new THREE.Vector3(p.container.l*s/2,loadTop*s/2,p.container.w*s/2),size=Math.max(p.container.l*s,p.container.w*s,loadTop*s),d=Math.max(7.5,size*1.55),positions={front:[center.x,center.y,center.z+d],top:[center.x,center.y+d,center.z],side:[center.x+d,center.y,center.z],iso:[center.x+d*.82,center.y+d*.76,center.z+d*.82]};camera.position.set(...positions[view]);controls.target.copy(center);controls.update();scheduleThreeRender();$$('.view-buttons [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));};const filterUpdates=()=>{const value=$('#updateDateFilter')?.value||'all';$$('[data-release-date]').forEach(article=>article.classList.toggle('release-hidden',value!=='all'&&article.dataset.releaseDate!==value));};const renderArchivesV261Base=renderArchives;renderArchives=function(){renderArchivesV261Base();$('#archiveRows')?.closest('table')?.classList.add('stable-archive-table');};renderSavedPlans=function(){const host=$('#savedPlansList'),page=pageSlice(state.savedPlans,'savedPlansPage','savedPlansSize');const rows=page.rows.map((saved,index)=>{const packages=saved.plans.reduce((sum,p)=>sum+p.positions.length,0),pieces=saved.plans.reduce((sum,p)=>sum+p.positions.reduce((s,x)=>s+(+x.pieces||0),0),0),serial=(state.ui.savedPlansPage-1)*page.size+index+1;return `<tr><td><input class="plan-select" data-select-plan="${saved.id}" type="checkbox" ${selectedSavedPlanIds.has(saved.id)?'checked':''} aria-label="${t('选择')} ${escapeHtml(saved.name)}"></td><td class="serial-number">${serial}</td><td><b>${escapeHtml(saved.name)}</b></td><td>${escapeHtml(saved.createdAt)}</td><td>${saved.plans.length} ${t('个容器方案')}</td><td>${packages} ${t('包')} / ${pieces.toLocaleString()} ${t('件')}</td><td><span class="row-actions"><button data-open-saved="${saved.id}">${t('打开方案')}</button><button class="delete" data-delete-saved="${saved.id}">${t('删除')}</button></span></td></tr>`;}).join('');host.innerHTML=rows?`<div class="saved-plan-table-wrap"><table class="stable-plan-table"><thead><tr><th><input id="selectAllSavedPlans" type="checkbox" aria-label="${t('选择全部')}"></th><th>${t('序号')}</th><th>${t('方案名称')}</th><th>${t('保存时间')}</th><th>${t('容器数量')}</th><th>${t('数量')}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:`<div class="empty-state">${t('还没有保存的装载方案。生成方案后点击“保存方案”即可在此管理。')}</div>`;const all=$('#selectAllSavedPlans');if(all){all.checked=page.rows.length>0&&page.rows.every(item=>selectedSavedPlanIds.has(item.id));all.indeterminate=page.rows.some(item=>selectedSavedPlanIds.has(item.id))&&!all.checked;all.addEventListener('change',event=>{page.rows.forEach(item=>event.target.checked?selectedSavedPlanIds.add(item.id):selectedSavedPlanIds.delete(item.id));renderSavedPlans();});}renderListPager('savedPlansPager',page,state.savedPlans.length,'savedPlansPage','savedPlansSize',renderSavedPlans);$$('[data-open-saved]').forEach(button=>button.addEventListener('click',()=>openSavedPlan(button.dataset.openSaved)));$$('[data-select-plan]').forEach(button=>button.addEventListener('change',()=>{button.checked?selectedSavedPlanIds.add(button.dataset.selectPlan):selectedSavedPlanIds.delete(button.dataset.selectPlan);renderSavedPlans();}));$$('[data-delete-saved]').forEach(button=>button.addEventListener('click',()=>removeSavedPlans([button.dataset.deleteSaved])));updatePlanBulkButton();applyLanguage();};document.addEventListener('pointerdown',event=>{if(event.button===1&&event.target.closest('#threeCanvas')){event.preventDefault();event.stopImmediatePropagation();}},true);bind();const displaySettingsButton=$('#displaySettingsButton'),visualSettingsPopover=$('#visualSettingsPopover');displaySettingsButton?.addEventListener('click',event=>{event.stopPropagation();const open=visualSettingsPopover.classList.toggle('open');displaySettingsButton.setAttribute('aria-expanded',String(open));});document.addEventListener('click',event=>{if(!visualSettingsPopover?.contains(event.target)&&!displaySettingsButton?.contains(event.target)){visualSettingsPopover?.classList.remove('open');displaySettingsButton?.setAttribute('aria-expanded','false');}});$('#updateDateFilter')?.addEventListener('change',filterUpdates);filterUpdates();renderSelectors();renderArchives();renderSavedPlans();renderSettings();try{applyLanguage();}catch(error){console.error(error);}
}
// v2.6.4: display utilization from the actual loaded/available volume ratio.
const renderPlanV264Base=renderPlan;renderPlan=function(){renderPlanV264Base();const plan=state.plan?.plans?.[state.plan.active];if(!plan)return;const percent=actualUtilization(plan);$('#utilizationPercent').textContent=`${percent.toFixed(2)}%`;$('#utilizationRing').style.background=`conic-gradient(var(--blue) ${percent*3.6}deg,#eaf0f6 0deg)`;};
// v2.6.5: keep the account bridge and feedback behaviour consistent with the
// stable server-backed management tables.
window.TopBoxApp ??= {};
window.TopBoxApp.openSavedPlan = id => openSavedPlan(id);
$('#archiveForm')?.addEventListener('submit', () => {
  const isNew = !$('#recordId')?.value;
  setTimeout(() => showSuccess(isNew ? t('新建档案成功。') : t('档案已保存。')), 0);
}, true);


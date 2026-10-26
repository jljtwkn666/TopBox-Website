import * as THREE from 'https://unpkg.com/three@0.162.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.162.0/examples/jsm/controls/OrbitControls.js';

const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=p=>`${p}-${crypto.randomUUID?.().replaceAll('-','').slice(0,10)||Date.now().toString(36)}`;
let draft,selectedItemId=null,markedItemIds=new Set(),preview=null;
const state=()=>window.TopBoxApp?.state;
const num=(id,f=0)=>Math.max(0,+(document.getElementById(id)?.value??f)||0);
const coord=(id,f=0)=>+(document.getElementById(id)?.value??f)||0;
const editable=()=>document.documentElement.dataset.palletKitAllowed!=='false'&&!$('#archives.pallet-kit-readonly');
const fresh=()=>({id:'',name:'托盘货-',pallet:{l:1100,w:1100,h:130,color:'#b97b45',style:'wood'},allowOverhang:false,items:[]});
const cargo=()=>state()?.cargo?.filter(x=>!x.kit)||[];
function makeItem(source,o={}){const r=!!o.rotate;return{id:uid('kit-item'),sourceId:source.id,name:source.name,shape:source.shape==='cylinder'?'cylinder':'box',color:source.color||'#2563eb',l:r?+source.w:+source.l,w:r?+source.l:+source.w,h:+source.h,weight:+source.weight||0,pieces:Math.max(1,+source.pieces||1),x:+o.x||0,y:+o.y||0,z:Math.max(0,+o.z||0),rotate:r};}
function bounds(){const p=draft.pallet;let minX=0,minY=0,maxX=p.l,maxY=p.w,maxZ=p.h;draft.items.forEach(i=>{minX=Math.min(minX,i.x);minY=Math.min(minY,i.y);maxX=Math.max(maxX,i.x+i.l);maxY=Math.max(maxY,i.y+i.w);maxZ=Math.max(maxZ,p.h+i.z+i.h);});return{minX,minY,maxX,maxY,maxZ,l:maxX-minX,w:maxY-minY,h:maxZ,volume:(maxX-minX)*(maxY-minY)*maxZ/1e9};}
function valid(item,items=draft.items.filter(x=>x.id!==item.id)){const p=draft.pallet,touch=item.x<p.l&&item.x+item.l>0&&item.y<p.w&&item.y+item.w>0;if(!touch)return{ok:false,message:'货物必须至少有一部分底面落在托盘范围内，不能完全悬空。'};if(!draft.allowOverhang&&(item.x<0||item.y<0||item.x+item.l>p.l||item.y+item.w>p.w))return{ok:false,message:'货物超出托盘长或宽范围。'};const hit=items.some(o=>item.x<o.x+o.l&&item.x+item.l>o.x&&item.y<o.y+o.w&&item.y+item.w>o.y&&item.z<o.z+o.h&&item.z+item.h>o.z);return hit?{ok:false,message:'货物与已有货物重叠，请调整坐标或高度。'}:{ok:true};}
function dialog(){if($('#palletKitDialog'))return;document.body.insertAdjacentHTML('beforeend',`<dialog id="palletKitDialog" class="pallet-kit-dialog"><div class="pallet-kit-head"><div><h2 id="palletKitTitle">托盘套装设计</h2><p>点击 3D 货物即可选中；可按参数添加、批量摆放、替换、旋转或删除。</p></div><button class="icon-button" type="button" id="closePalletKit">×</button></div><div class="pallet-kit-layout"><aside class="pallet-kit-panel"><section><h3>套装与托盘参数</h3><label>套装名称<input id="kitName" maxlength="40"></label><div class="pallet-kit-form-grid"><label>托盘长 mm<input id="kitLength" type="number" min="1"></label><label>托盘宽 mm<input id="kitWidth" type="number" min="1"></label><label>托盘高 mm<input id="kitHeight" type="number" min="1"></label><label>托盘颜色<input id="kitColor" type="color"></label></div><label class="pallet-kit-check"><input id="allowOverhang" type="checkbox"> 允许货物部分超出托盘长宽边界</label><small class="kit-help">未勾选时不得越界；勾选后货物底面仍须部分落在托盘上。</small><button type="button" class="button secondary" id="applyPalletSize">应用托盘参数</button></section><section><h3>手动添加货物</h3><label>货物<select id="kitSource"></select></label><div class="pallet-kit-form-grid"><label>起点 X mm<input id="kitX" type="number" value="0"></label><label>起点 Y mm<input id="kitY" type="number" value="0"></label><label>起点 Z mm<input id="kitZ" type="number" min="0" value="0"></label></div><label class="pallet-kit-check"><input id="kitRotate" type="checkbox"> 托盘平面旋转 90°</label><button type="button" class="button primary" id="addKitItem">添加单件</button></section><section><h3>参数化批量摆放</h3><div class="pallet-kit-form-grid"><label>长向数量<input id="kitGridX" type="number" min="1" value="1"></label><label>宽向数量<input id="kitGridY" type="number" min="1" value="1"></label><label>层数<input id="kitGridZ" type="number" min="1" value="1"></label></div><button type="button" class="button secondary" id="addKitGrid">按参数添加</button></section></aside><section class="pallet-kit-stage"><div class="pallet-kit-toolbar"><b>3D 托盘预览</b><span>左键选中 · 拖动旋转 · 滚轮缩放</span><div class="kit-view-buttons"><button type="button" data-kit-view="front">正</button><button type="button" data-kit-view="top">顶</button><button type="button" data-kit-view="side">侧</button><button type="button" data-kit-view="iso" class="active">45°</button><button type="button" id="resetKitView">↻</button></div></div><div id="kitPreview" class="kit-preview"></div><p id="kitPreviewMessage" class="kit-preview-message">请选择左侧货物后添加。</p></section><aside class="pallet-kit-panel kit-items-panel"><section><div class="kit-items-head"><h3>已摆放货物 <span id="kitItemCount">0</span></h3><div><button type="button" class="button tiny danger" id="bulkDeleteKitItems">批量删除</button><button type="button" class="button tiny danger" id="clearKitItems">清空</button></div></div><div id="kitItemList" class="kit-item-list"></div></section><section id="kitSelectedEditor" class="hidden"><h3>修改已选货物</h3><label>替换为<select id="kitReplaceSource"></select></label><div class="pallet-kit-form-grid"><label>X mm<input id="selectedX" type="number"></label><label>Y mm<input id="selectedY" type="number"></label><label>Z mm<input id="selectedZ" type="number" min="0"></label></div><div class="kit-editor-actions"><button type="button" class="button secondary" id="rotateSelected">旋转 90°</button><button type="button" class="button secondary" id="updateSelected">应用修改</button><button type="button" class="button danger" id="deleteSelected">删除货物</button></div></section></aside></div><div class="pallet-kit-footer"><div><b id="kitSummary">0 件货物</b><span id="kitDimensions">整体尺寸 0 × 0 × 0 mm · 0.0000 m³</span></div><div><button type="button" class="button secondary" id="cancelPalletKit">取消</button><button type="button" class="button primary" id="savePalletKit">保存为套装货物</button></div></div></dialog>`);
const colorField=$('#kitColor')?.closest('label');
if(colorField&&!$('#kitPalletStyle'))colorField.insertAdjacentHTML('beforebegin','<label>托盘样式<select id="kitPalletStyle"><option value="wood">木质托盘</option><option value="plastic">塑料托盘</option><option value="metal">金属托盘</option></select></label>');
$('#kitPalletStyle').addEventListener('change',event=>{const colors={wood:'#b97b45',plastic:'#2563eb',metal:'#8b99a8'};$('#kitColor').value=colors[event.target.value]||colors.wood;});
$('#closePalletKit').onclick=close;$('#cancelPalletKit').onclick=close;$('#applyPalletSize').onclick=applyPallet;$('#addKitItem').onclick=addOne;$('#addKitGrid').onclick=addGrid;$('#resetKitView').onclick=()=>setView('iso');$$('[data-kit-view]').forEach(b=>b.onclick=()=>setView(b.dataset.kitView));$('#kitItemList').onclick=e=>{const b=e.target.closest('[data-kit-select]');if(b)select(b.dataset.kitSelect)};$('#kitItemList').onchange=e=>{const b=e.target.closest('[data-kit-mark]');if(b)b.checked?markedItemIds.add(b.dataset.kitMark):markedItemIds.delete(b.dataset.kitMark)};$('#rotateSelected').onclick=rotate;$('#updateSelected').onclick=update;$('#deleteSelected').onclick=deleteSelected;$('#bulkDeleteKitItems').onclick=bulkDelete;$('#clearKitItems').onclick=clearItems;$('#savePalletKit').onclick=save;}
function fillChoices(){const current=$('#kitSource')?.value||'',options=cargo().map(x=>`<option value="${esc(x.id)}">${esc(x.name)} · ${x.l} × ${x.w} × ${x.h} mm</option>`).join('');['#kitSource','#kitReplaceSource'].forEach(s=>{const n=$(s);if(!n)return;n.innerHTML=options||'<option value="">请先建立单体货物</option>';if([...n.options].some(o=>o.value===current))n.value=current;});}
function sync(){['kitName','kitLength','kitWidth','kitHeight'].forEach((k,i)=>$('#'+k).value=i?draft.pallet[['l','w','h'][i-1]]:draft.name);$('#kitColor').value=draft.pallet.color;$('#kitPalletStyle').value=draft.pallet.style||'wood';$('#allowOverhang').checked=!!draft.allowOverhang;}
function applyPallet(){const p={l:Math.max(1,num('kitLength',draft.pallet.l)),w:Math.max(1,num('kitWidth',draft.pallet.w)),h:Math.max(1,num('kitHeight',draft.pallet.h)),color:$('#kitColor').value||'#b97b45',style:$('#kitPalletStyle').value||'wood'},allow=$('#allowOverhang').checked,bad=!allow&&draft.items.find(i=>i.x<0||i.y<0||i.x+i.l>p.l||i.y+i.w>p.w);if(bad)return msg('新托盘尺寸会使已有货物越界，请先移动、删除或启用允许超出。',true);draft.name=$('#kitName').value.trim()||'托盘货-';draft.pallet=p;draft.allowOverhang=allow;refresh();}
function source(){return cargo().find(x=>x.id===$('#kitSource').value);}
function addOne(){const s=source();if(!s)return msg('请先选择一种单体货物。',true);const i=makeItem(s,{x:coord('kitX'),y:coord('kitY'),z:num('kitZ'),rotate:$('#kitRotate').checked}),check=valid(i);if(!check.ok)return msg(check.message,true);draft.items.push(i);selectedItemId=i.id;markedItemIds.add(i.id);refresh();}
function addGrid(){const s=source();if(!s)return msg('请先选择一种单体货物。',true);const nx=Math.max(1,Math.floor(num('kitGridX',1))),ny=Math.max(1,Math.floor(num('kitGridY',1))),nz=Math.max(1,Math.floor(num('kitGridZ',1))),x0=coord('kitX'),y0=coord('kitY'),z0=num('kitZ'),r=$('#kitRotate').checked,base=makeItem(s,{rotate:r}),list=[];for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)list.push(makeItem(s,{rotate:r,x:x0+x*base.l,y:y0+y*base.w,z:z0+z*base.h}));let added=0;for(const i of list){const check=valid(i,[...draft.items,...list.slice(0,added)]);if(check.ok){draft.items.push(i);markedItemIds.add(i.id);added++;}}if(!added)return msg('没有可添加的货物；请检查边界、坐标或堆叠位置。',true);selectedItemId=draft.items.at(-1).id;msg(`已添加 ${added} 件货物。`);refresh();}
function select(id){selectedItemId=id;const i=draft.items.find(x=>x.id===id);if(!i)return;$('#kitSelectedEditor').classList.remove('hidden');$('#kitReplaceSource').value=i.sourceId||'';$('#selectedX').value=i.x;$('#selectedY').value=i.y;$('#selectedZ').value=i.z;refresh();}
function rotate(){const i=draft.items.find(x=>x.id===selectedItemId);if(!i)return;const n={...i,l:i.w,w:i.l,rotate:!i.rotate},check=valid(n);if(!check.ok)return msg(check.message,true);Object.assign(i,n);refresh();}
function update(){const i=draft.items.find(x=>x.id===selectedItemId);if(!i)return;const s=cargo().find(x=>x.id===$('#kitReplaceSource').value),n=s?makeItem(s,{x:coord('selectedX'),y:coord('selectedY'),z:num('selectedZ'),rotate:i.rotate}):{...i,x:coord('selectedX'),y:coord('selectedY'),z:num('selectedZ')};n.id=i.id;const check=valid(n);if(!check.ok)return msg(check.message,true);Object.assign(i,n);refresh();}
function deleteSelected(){const n=draft.items.findIndex(x=>x.id===selectedItemId);if(n<0)return;markedItemIds.delete(selectedItemId);draft.items.splice(n,1);selectedItemId=null;$('#kitSelectedEditor').classList.add('hidden');refresh();}
function bulkDelete(){if(!markedItemIds.size)return msg('请先勾选需要批量删除的货物。',true);draft.items=draft.items.filter(i=>!markedItemIds.has(i.id));if(markedItemIds.has(selectedItemId)){$('#kitSelectedEditor').classList.add('hidden');selectedItemId=null;}markedItemIds.clear();msg('已删除勾选的货物。');refresh();}
function clearItems(){if(!draft.items.length)return;draft.items=[];markedItemIds.clear();selectedItemId=null;$('#kitSelectedEditor').classList.add('hidden');msg('已清空全部已摆放货物。');refresh();}
function renderItems(){const b=bounds(),pieces=draft.items.reduce((s,i)=>s+(+i.pieces||0),0),weight=draft.items.reduce((s,i)=>s+(+i.weight||0),0);$('#kitItemCount').textContent=draft.items.length;$('#kitItemList').innerHTML=draft.items.map((i,n)=>`<div class="kit-item-row ${i.id===selectedItemId?'selected':''}"><input type="checkbox" data-kit-mark="${esc(i.id)}" ${markedItemIds.has(i.id)?'checked':''}><button type="button" data-kit-select="${esc(i.id)}"><i style="background:${esc(i.color)}"></i><span><b>${n+1}. ${esc(i.name)}</b><small>X ${i.x} · Y ${i.y} · Z ${i.z} mm${i.rotate?' · 已旋转':''}</small></span></button></div>`).join('')||'<div class="kit-empty">暂无货物。可从左侧手动添加或批量添加。</div>';$('#kitSummary').textContent=`${draft.items.length} 包 · ${pieces.toLocaleString()} 件 · ${weight.toFixed(1)} kg`;$('#kitDimensions').textContent=`整体尺寸 ${b.l.toFixed(0)} × ${b.w.toFixed(0)} × ${b.h.toFixed(0)} mm · ${b.volume.toFixed(4)} m³`;}
function ensurePreview(){const host=$('#kitPreview');if(preview?.host===host)return;preview?.renderer?.dispose();const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0xf3f7fb,1);host.replaceChildren(renderer.domElement);const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,1,.1,100),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.addEventListener('change',()=>renderer.render(scene,camera));scene.add(new THREE.HemisphereLight(0xffffff,0x5d7185,2));const light=new THREE.DirectionalLight(0xffffff,2.2);light.position.set(7,10,8);scene.add(light);const ray=new THREE.Raycaster(),point=new THREE.Vector2();renderer.domElement.addEventListener('pointerdown',e=>{const r=renderer.domElement.getBoundingClientRect();point.x=(e.clientX-r.left)/r.width*2-1;point.y=-(e.clientY-r.top)/r.height*2+1;ray.setFromCamera(point,camera);const hit=ray.intersectObjects(scene.children,true).find(x=>x.object.userData?.kitItemId);if(hit)select(hit.object.userData.kitItemId);});preview={host,renderer,scene,camera,controls,view:'iso'};new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight||390;renderer.setSize(w,h,true);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.render(scene,camera);}).observe(host);}
function setView(view='iso'){if(!preview)return;preview.view=view;const b=bounds(),s=6/Math.max(b.l,b.w,b.h),c=new THREE.Vector3(b.l*s/2,b.h*s/2,b.w*s/2),d=Math.max(7.2,Math.max(b.l,b.w,b.h)*s*1.35),pos={front:[c.x,c.y,c.z+d],top:[c.x,c.y+d,c.z],side:[c.x+d,c.y,c.z],iso:[c.x+d*.82,c.y+d*.76,c.z+d*.82]};preview.camera.position.set(...(pos[view]||pos.iso));preview.controls.target.copy(c);preview.controls.update();$$('[data-kit-view]').forEach(b=>b.classList.toggle('active',b.dataset.kitView===view));preview.renderer.render(preview.scene,preview.camera);}
function palletBoxV323(group,size,position,material,edgeColor=0x20384f,edgeOpacity=.45){
  const geometry=new THREE.BoxGeometry(size.x,size.y,size.z),mesh=new THREE.Mesh(geometry,material);
  mesh.position.copy(position);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  if(edgeOpacity>0){const edge=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:edgeColor,transparent:true,opacity:edgeOpacity}));edge.position.copy(position);group.add(edge);}
  return mesh;
}
function detailedPalletV323(parent,pallet,scale,offsetX=0,offsetZ=0){
  const group=new THREE.Group(),x=pallet.l*scale,z=pallet.w*scale,h=Math.max(.08,pallet.h*scale),style=pallet.style||'wood',base=new THREE.Color(pallet.color||'#b97b45');
  group.name=`${style}-pallet`;group.position.set(offsetX*scale,0,offsetZ*scale);parent.add(group);
  const material=(color,roughness,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const topH=Math.max(.035,h*.19),bottomH=Math.max(.025,h*.14),bodyH=Math.max(.04,h-topH-bottomH);
  if(style==='plastic'){
    const main=material(base,.48,.03),light=material(base.clone().lerp(new THREE.Color(0xffffff),.18),.42,.03),dark=material(base.clone().multiplyScalar(.62),.62,.02),rail=Math.max(.035,Math.min(x,z)*.035),topY=h-topH/2;
    palletBoxV323(group,new THREE.Vector3(x*.96,topH,z*.96),new THREE.Vector3(x/2,topY,z/2),dark,0x173c63,.36);
    const cells=6,gap=Math.min(x,z)*.018,cellX=(x*.88-gap*(cells-1))/cells,cellZ=(z*.88-gap*(cells-1))/cells;
    for(let ix=0;ix<cells;ix++)for(let iz=0;iz<cells;iz++)palletBoxV323(group,new THREE.Vector3(cellX,topH*.28,cellZ),new THREE.Vector3(x*.06+cellX/2+ix*(cellX+gap),h+topH*.14,z*.06+cellZ/2+iz*(cellZ+gap)),(ix+iz)%2?main:light,0x245076,.28);
    for(const px of [.1,.5,.9])for(const pz of [.1,.5,.9])palletBoxV323(group,new THREE.Vector3(x*.17,bodyH,z*.17),new THREE.Vector3(x*px,bottomH+bodyH/2,z*pz),dark,0x173c63,.4);
    for(const pz of [.1,.5,.9])palletBoxV323(group,new THREE.Vector3(x*.92,bottomH,z*.075),new THREE.Vector3(x/2,bottomH/2,z*pz),dark,0x173c63,.4);
    for(const px of [.06,.94])palletBoxV323(group,new THREE.Vector3(rail,topH*.82,z*.86),new THREE.Vector3(x*px,topY,z/2),light,0x245076,.28);
  }else if(style==='metal'){
    const steel=material(base,.27,.82),bright=material(base.clone().lerp(new THREE.Color(0xffffff),.28),.22,.9),dark=material(base.clone().multiplyScalar(.56),.38,.76),topY=h-topH/2,frame=Math.max(.045,Math.min(x,z)*.045);
    palletBoxV323(group,new THREE.Vector3(x,topH,frame),new THREE.Vector3(x/2,topY,frame/2),steel,0x233443,.6);
    palletBoxV323(group,new THREE.Vector3(x,topH,frame),new THREE.Vector3(x/2,topY,z-frame/2),steel,0x233443,.6);
    palletBoxV323(group,new THREE.Vector3(frame,topH,z-frame*2),new THREE.Vector3(frame/2,topY,z/2),steel,0x233443,.6);
    palletBoxV323(group,new THREE.Vector3(frame,topH,z-frame*2),new THREE.Vector3(x-frame/2,topY,z/2),steel,0x233443,.6);
    const rows=9,slatZ=(z-frame*3)/rows;
    for(let row=0;row<rows;row++)palletBoxV323(group,new THREE.Vector3(x-frame*2,topH*.42,slatZ*.56),new THREE.Vector3(x/2,h-topH*.18,frame*1.25+slatZ/2+row*slatZ),row%2?steel:bright,0x314758,.38);
    for(const px of [.18,.5,.82])palletBoxV323(group,new THREE.Vector3(frame*.62,bodyH,z*.86),new THREE.Vector3(x*px,bottomH+bodyH/2,z/2),dark,0x233443,.55);
    for(const pz of [.09,.91])palletBoxV323(group,new THREE.Vector3(x*.92,bottomH,z*.065),new THREE.Vector3(x/2,bottomH/2,z*pz),dark,0x233443,.58);
    for(const px of [.08,.92])for(const pz of [.09,.91])palletBoxV323(group,new THREE.Vector3(frame*.9,bodyH,z*.07),new THREE.Vector3(x*px,bottomH+bodyH/2,z*pz),steel,0x233443,.5);
  }else{
    const wood=material(base,.78),light=material(base.clone().lerp(new THREE.Color(0xffe1b9),.2),.72),dark=material(base.clone().multiplyScalar(.6),.86),grain=material(base.clone().multiplyScalar(.46),.95),topY=h-topH/2,boards=7,gap=z*.018,boardZ=(z-gap*(boards-1))/boards;
    for(let row=0;row<boards;row++){
      const centerZ=boardZ/2+row*(boardZ+gap);palletBoxV323(group,new THREE.Vector3(x,topH,boardZ),new THREE.Vector3(x/2,topY,centerZ),row%2?wood:light,0x5d3924,.55);
      for(const grainOffset of [.31,.68])palletBoxV323(group,new THREE.Vector3(x*.9,Math.max(.006,topH*.035),Math.max(.006,boardZ*.025)),new THREE.Vector3(x/2,h+.004,centerZ-boardZ/2+boardZ*grainOffset),grain,0,0);
    }
    for(const pz of [.11,.5,.89])palletBoxV323(group,new THREE.Vector3(x*.94,bodyH,z*.085),new THREE.Vector3(x/2,bottomH+bodyH/2,z*pz),dark,0x5d3924,.56);
    for(const px of [.11,.5,.89])palletBoxV323(group,new THREE.Vector3(x*.09,bottomH,z*.94),new THREE.Vector3(x*px,bottomH/2,z/2),dark,0x5d3924,.56);
    const nailMaterial=material(0x6b7480,.34,.72),nailGeometry=new THREE.CylinderGeometry(Math.max(.008,Math.min(x,z)*.009),Math.max(.008,Math.min(x,z)*.009),Math.max(.006,topH*.045),10);
    for(let row=0;row<boards;row++)for(const px of [.1,.5,.9]){const nail=new THREE.Mesh(nailGeometry,nailMaterial);nail.position.set(x*px,h+.006,boardZ/2+row*(boardZ+gap));group.add(nail);}
  }
  return group;
}
function renderPreview(){
  ensurePreview();
  const {scene,renderer,camera}=preview,b=bounds(),p=draft.pallet,s=6/Math.max(b.l,b.w,b.h),sx=-b.minX,sy=-b.minY;
  scene.children.filter(n=>!n.isLight).forEach(n=>scene.remove(n));
  detailedPalletV323(scene,p,s,sx,sy);
  draft.items.forEach(i=>{const selected=i.id===selectedItemId,baseColor=new THREE.Color(i.color||'#2563eb'),displayColor=selected?baseColor.clone().lerp(new THREE.Color(0xffffff),.42):baseColor,geo=i.shape==='cylinder'?new THREE.CylinderGeometry(i.w*s/2,i.w*s/2,i.h*s,18):new THREE.BoxGeometry(i.l*s,i.h*s,i.w*s),mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:displayColor,roughness:selected ? .38 : .55,emissive:selected ? displayColor : 0x000000,emissiveIntensity:selected ? .12 : 0}));mesh.position.set((sx+i.x+i.l/2)*s,(p.h+i.z+i.h/2)*s,(sy+i.y+i.w/2)*s);mesh.userData.kitItemId=i.id;scene.add(mesh);const e=new THREE.LineSegments(new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:selected?0x2563eb:0x132b42}));e.position.copy(mesh.position);scene.add(e);});
  const grid=new THREE.GridHelper(Math.max(b.l,b.w)*s*1.15,12,0x9eb1c5,0xdde5ec);grid.position.set(b.l*s/2,-.012,b.w*s/2);scene.add(grid);
  if(!preview.hasCameraPose){setView(preview.view||'iso');preview.hasCameraPose=true;}else renderer.render(scene,camera);
}
function refresh(){sync();renderItems();renderPreview();}
function msg(text,error=false){const n=$('#kitPreviewMessage');if(n){n.textContent=text;n.classList.toggle('error',error);}}
async function save(){if(!editable())return msg('当前账户未获档案维护权限。',true);applyPallet();if(!draft.items.length)return msg('请至少在托盘上摆放一件货物后再保存。',true);const s=state(),p=draft.pallet,b=bounds(),record={id:draft.id||uid('kit'),name:draft.name||'托盘货-',type:'套装货物',shape:'box',l:b.l,w:b.w,h:b.h,weight:draft.items.reduce((n,i)=>n+(+i.weight||0),0),pieces:draft.items.reduce((n,i)=>n+(+i.pieces||0),0),reserve:0,price:0,color:p.color,quantity:1,pieceQuantity:draft.items.reduce((n,i)=>n+(+i.pieces||0),0),kit:{version:2,pallet:{...p},origin:{x:-b.minX,y:-b.minY},allowOverhang:!!draft.allowOverhang,items:draft.items.map(i=>({...i}))}},n=s.cargo.findIndex(i=>i.id===record.id),old=n>=0?{...s.cargo[n]}:null;if(n>=0)s.cargo[n]={...s.cargo[n],...record};else s.cargo.push(record);s.selectedCargo.add(record.id);try{const r=await fetch('/api/shared/records',{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({containers:s.containers,cargo:s.cargo})}),out=await r.json().catch(()=>({}));if(!r.ok)throw Error(out.error||'保存失败。');window.dispatchEvent(new Event('topbox:records-changed'));window.TopBoxApp?.renderSelectors?.();$('.archive-tabs [data-archive="cargo"]')?.click();msg('已保存为套装货物，可直接在“选择货物”中勾选装载。');setTimeout(close,600);}catch(e){const at=s.cargo.findIndex(i=>i.id===record.id);if(old&&at>=0)s.cargo[at]=old;else if(at>=0)s.cargo.splice(at,1);msg(e.message||'保存失败。',true);}}
function open(record=null){dialog();if(!editable())return;draft=record?.kit?{id:record.id,name:record.name,pallet:{...record.kit.pallet},allowOverhang:!!record.kit.allowOverhang,items:record.kit.items.map(i=>({...i}))}:fresh();selectedItemId=null;markedItemIds=new Set();fillChoices();$('#palletKitTitle').textContent=record?'修改托盘套装':'托盘套装设计';$('#palletKitDialog').showModal();refresh();msg(record?'可在 3D 预览中点击货物，再修改、替换、旋转或删除。':'请选择左侧货物后添加。');}
function close(){$('#palletKitDialog')?.close();}
function activeArchive(){const m=$('.nav-link[data-page="archives"][data-archive-target].active'),t=$('.archive-tabs button.active')?.dataset.archive;return m?.dataset.archiveTarget||t||state()?.archive;}
function refreshLaunch(kind){const b=$('#palletKitBuilder');if(!b)return;const visible=$('#archives')?.classList.contains('active-page');b.classList.toggle('hidden',!visible||(kind||activeArchive())!=='cargo'||!editable());}
function initialise(){$('#palletKitBuilder')?.addEventListener('click',()=>requestOpenPalletKitV320());document.addEventListener('click',e=>{const n=e.target.closest('.nav-link[data-page="archives"][data-archive-target]'),t=e.target.closest('.archive-tabs [data-archive]'),kind=n?.dataset.archiveTarget||t?.dataset.archive;if(!kind)return;[0,16,120].forEach(wait=>setTimeout(()=>refreshLaunch(kind),wait));requestAnimationFrame(()=>refreshLaunch(kind));},true);window.addEventListener('topbox:edit-pallet-kit',e=>requestOpenPalletKitV320(e.detail));const a=$('#archives');if(a)new MutationObserver(()=>refreshLaunch()).observe(a,{attributes:true,attributeFilter:['class']});refreshLaunch();}
if(window.TopBoxApp)initialise();else window.addEventListener('topbox-app-ready',initialise,{once:true});

/* v3.1.2: interactive preview helpers for the pallet designer. */
const validateKitItemV312=valid;
valid=function(item,items){if(item.z<0)return{ok:false,message:'货物底部不能低于托盘上表面，不能悬空。'};return validateKitItemV312(item,items);};
function persistKitDisplaySetting(){try{const s=state();if(!s)return;const saved=JSON.parse(localStorage.getItem('vehicle-load-planner-state-v2')||'{}');saved.settings=s.settings;localStorage.setItem('vehicle-load-planner-state-v2',JSON.stringify(saved));}catch{}}
function hitPreviewV312(event){if(!preview)return null;const rect=preview.renderer.domElement.getBoundingClientRect(),pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),ray=new THREE.Raycaster();ray.setFromCamera(pointer,preview.camera);return ray.intersectObjects(preview.scene.children,true).find(hit=>hit.object.userData?.kitItemId)||null;}
function itemForPreviewHitV312(event){const hit=hitPreviewV312(event);return hit&&draft?.items.find(item=>item.id===hit.object.userData.kitItemId);}
function closeKitContextMenuV312(){const menu=$('#kitContextMenu');if(menu)menu.hidden=true;}
function showKitContextMenuV312(event,item){const host=$('#kitPreview'),menu=$('#kitContextMenu');if(!host||!menu)return;const r=host.getBoundingClientRect(),left=Math.max(8,Math.min(event.clientX-r.left,host.clientWidth-236)),top=Math.max(8,Math.min(event.clientY-r.top,host.clientHeight-220));menu.style.left=`${left}px`;menu.style.top=`${top}px`;menu.hidden=false;menu.dataset.itemId=item.id;}
function duplicateKitItemV312(direction){const menu=$('#kitContextMenu'),item=draft?.items.find(value=>value.id===menu?.dataset.itemId);if(!item)return;const next={...item,id:uid('kit-item')};if(direction==='xp')next.x+=item.l;if(direction==='xn')next.x-=item.l;if(direction==='yp')next.y+=item.w;if(direction==='yn')next.y-=item.w;if(direction==='zp')next.z+=item.h;if(direction==='zn')next.z-=item.h;const check=valid(next);if(!check.ok)return msg(`不能新增：${check.message}`,true);draft.items.push(next);selectedItemId=next.id;markedItemIds.add(next.id);closeKitContextMenuV312();refresh();msg('已新增 1 件相同货物。');}
function rotateKitItemV312(axis,degrees){const menu=$('#kitContextMenu'),item=draft?.items.find(value=>value.id===menu?.dataset.itemId);if(!item)return;const next={...item,rotation:{...(item.rotation||{})}},quarter=degrees%180!==0;if(quarter){if(axis==='x')[next.l,next.w,next.h]=[item.l,item.h,item.w];if(axis==='y')[next.l,next.w,next.h]=[item.h,item.w,item.l];if(axis==='z')[next.l,next.w,next.h]=[item.w,item.l,item.h];}next.rotation[axis]=((+next.rotation[axis]||0)+degrees)%360;const check=valid(next);if(!check.ok)return msg(`不能旋转：${check.message}`,true);Object.assign(item,next);selectedItemId=item.id;closeKitContextMenuV312();refresh();msg(`已沿 ${axis.toUpperCase()} 轴旋转 ${degrees}°。`);}
function setupInteractivePreviewV312(){const host=$('#kitPreview'),canvas=preview?.renderer?.domElement;if(!host||!canvas||canvas.dataset.kitInteractiveV312)return;canvas.dataset.kitInteractiveV312='1';host.insertAdjacentHTML('beforeend',`<div id="kitHoverTooltip" class="kit-hover-tooltip" hidden></div><div id="kitContextMenu" class="kit-context-menu" hidden><b>货物操作</b><div class="kit-menu-group"><span>+1 新增同货物</span><button data-kit-add="xp">X 正向</button><button data-kit-add="xn">X 负向</button><button data-kit-add="yp">Y 正向</button><button data-kit-add="yn">Y 负向</button><button data-kit-add="zp">Z 正向</button><button data-kit-add="zn">Z 负向</button></div><div class="kit-menu-group"><span>旋转</span><button data-kit-rotate="x,90">X 90°</button><button data-kit-rotate="x,180">X 180°</button><button data-kit-rotate="y,90">Y 90°</button><button data-kit-rotate="y,180">Y 180°</button><button data-kit-rotate="z,90">Z 90°</button><button data-kit-rotate="z,180">Z 180°</button></div><button class="kit-menu-delete" data-kit-delete>删除货物</button></div>`);
  canvas.addEventListener('pointermove',event=>{const tip=$('#kitHoverTooltip');if(!tip)return;const item=itemForPreviewHitV312(event),enabled=state()?.settings?.kitCargoTooltip!==false;if(!item||!enabled){tip.hidden=true;return;}const r=host.getBoundingClientRect();tip.textContent=item.name;tip.style.left=`${Math.min(host.clientWidth-170,Math.max(8,event.clientX-r.left+12))}px`;tip.style.top=`${Math.min(host.clientHeight-34,Math.max(8,event.clientY-r.top+12))}px`;tip.hidden=false;});
  canvas.addEventListener('pointerleave',()=>{const tip=$('#kitHoverTooltip');if(tip)tip.hidden=true;});
  canvas.addEventListener('contextmenu',event=>{event.preventDefault();const item=itemForPreviewHitV312(event);if(!item){closeKitContextMenuV312();return;}select(item.id);showKitContextMenuV312(event,item);});
  $('#kitContextMenu')?.addEventListener('click',event=>{const add=event.target.closest('[data-kit-add]'),rotate=event.target.closest('[data-kit-rotate]');if(add)duplicateKitItemV312(add.dataset.kitAdd);if(rotate){const [axis,degrees]=rotate.dataset.kitRotate.split(',');rotateKitItemV312(axis,+degrees);}if(event.target.closest('[data-kit-delete]')){selectedItemId=$('#kitContextMenu').dataset.itemId;closeKitContextMenuV312();deleteSelected();}});
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('#kitContextMenu')&&!event.target.closest('#kitPreview canvas'))closeKitContextMenuV312();});
}
function setupKitDisplayControlsV312(){const toolbar=$('.pallet-kit-toolbar');if(!toolbar||$('#kitDisplaySettings'))return;toolbar.insertAdjacentHTML('beforeend',`<div class="kit-display-settings"><button type="button" id="kitDisplaySettings" class="kit-display-settings-button" title="显示设置">⚙</button><div id="kitDisplaySettingsMenu" class="kit-display-settings-menu" hidden><label><input type="checkbox" id="kitTooltipToggle"> 悬浮显示货物名称</label></div></div>`);const button=$('#kitDisplaySettings'),menu=$('#kitDisplaySettingsMenu'),toggle=$('#kitTooltipToggle');toggle.checked=state()?.settings?.kitCargoTooltip!==false;button.onclick=event=>{event.stopPropagation();menu.hidden=!menu.hidden;};toggle.onchange=()=>{if(state())state().settings.kitCargoTooltip=toggle.checked;persistKitDisplaySetting();};document.addEventListener('click',event=>{if(!event.target.closest('.kit-display-settings'))menu.hidden=true;});}
const openKitV312=open;
open=function(record=null){openKitV312(record);setupKitDisplayControlsV312();setupInteractivePreviewV312();};

/* v3.1.3: coalesce bursts of form and selection changes into one WebGL redraw. */
const renderPreviewV313Base=renderPreview;
let palletPreviewFrameV313=0;
renderPreview=function(){
  if(palletPreviewFrameV313)cancelAnimationFrame(palletPreviewFrameV313);
  palletPreviewFrameV313=requestAnimationFrame(()=>{
    palletPreviewFrameV313=0;
    renderPreviewV313Base();
    setupInteractivePreviewV312();
  });
};

/* v3.1.4 — searchable cargo controls, stable camera selection and free XY placement. */
function installCargoSearchV314(){
  const definitions=[['kitSource','kitSourceSearch','搜索添加货物'],['kitReplaceSource','kitReplaceSearch','搜索替换货物']];
  definitions.forEach(([selectId,searchId,label])=>{
    const select=$('#'+selectId);if(!select)return;
    if(!$('#'+searchId))select.closest('label')?.insertAdjacentHTML('beforebegin',`<label class="kit-cargo-search" for="${searchId}">${label}<input id="${searchId}" type="search" autocomplete="off" placeholder="输入名称、类型或尺寸模糊搜索"></label>`);
    const search=$('#'+searchId);if(!search||search.dataset.bound)return;
    const apply=()=>{const previous=select.value,terms=search.value.trim().toLowerCase().split(/[ ,，]+/).filter(Boolean),choices=cargo().filter(item=>terms.every(term=>`${item.name} ${item.type} ${item.l} ${item.w} ${item.h}`.toLowerCase().includes(term)));select.innerHTML=choices.map(item=>`<option value="${esc(item.id)}">${esc(item.name)} · ${item.l} × ${item.w} × ${item.h} mm</option>`).join('')||'<option value="">没有匹配的货物</option>';if([...select.options].some(option=>option.value===previous))select.value=previous;};
    search.dataset.bound='1';search.addEventListener('input',apply);search._kitApply=apply;
  });
  definitions.forEach(([,searchId])=>$('#'+searchId)?._kitApply?.());
}
const fillChoicesV314Base=fillChoices;
fillChoices=function(){fillChoicesV314Base();installCargoSearchV314();};

renderItems=function(){const b=bounds(),pieces=draft.items.reduce((s,i)=>s+(+i.pieces||0),0),weight=draft.items.reduce((s,i)=>s+(+i.weight||0),0);$('#kitItemCount').textContent=draft.items.length;$('#kitItemList').innerHTML=draft.items.map((i,n)=>`<div class="kit-item-row ${i.id===selectedItemId?'selected':''}"><input type="checkbox" data-kit-mark="${esc(i.id)}" ${markedItemIds.has(i.id)?'checked':''}><button type="button" data-kit-select="${esc(i.id)}"><i style="background:${esc(i.color)}"></i><span><b>${n+1}. ${esc(i.name)} <em class="kit-pieces">${(+i.pieces||1).toLocaleString()} 件/包</em></b><small>X ${i.x} · Y ${i.y} · Z ${i.z} mm${i.rotate?' · 已旋转':''}</small></span></button></div>`).join('')||'<div class="kit-empty">暂无货物。可从左侧手动添加或批量添加。</div>';$('#kitSummary').textContent=`${draft.items.length} 包 · ${pieces.toLocaleString()} 件 · ${weight.toFixed(1)} kg`;$('#kitDimensions').textContent=`整体尺寸 ${b.l.toFixed(0)} × ${b.w.toFixed(0)} × ${b.h.toFixed(0)} mm · ${b.volume.toFixed(4)} m³`;};

let kitFreeMoveV314=false,kitDragV314=null;
function syncFreeMoveV314(){const button=$('#kitFreeMove');if(button){button.classList.toggle('active',kitFreeMoveV314);button.setAttribute('aria-pressed',String(kitFreeMoveV314));button.textContent=kitFreeMoveV314?'自由移动：开':'自由移动货物';}if(preview?.controls){preview.controls.enableRotate=!kitFreeMoveV314;preview.controls.enablePan=!kitFreeMoveV314;preview.controls.enabled=true;}}
function setupFreeMoveV314(){const toolbar=$('.pallet-kit-toolbar'),canvas=preview?.renderer?.domElement;if(!toolbar||!canvas)return;if(!$('#kitFreeMove'))toolbar.querySelector('.kit-view-buttons')?.insertAdjacentHTML('afterend','<button type="button" class="kit-free-move" id="kitFreeMove" aria-pressed="false">自由移动货物</button>');$('#kitFreeMove').onclick=()=>{kitFreeMoveV314=!kitFreeMoveV314;kitDragV314=null;syncFreeMoveV314();};syncFreeMoveV314();if(canvas.dataset.kitFreeMoveV314)return;canvas.dataset.kitFreeMoveV314='1';const point=new THREE.Vector2(),ray=new THREE.Raycaster(),plane=new THREE.Plane(),world=new THREE.Vector3();const pointer=(event)=>{const rect=canvas.getBoundingClientRect();point.x=(event.clientX-rect.left)/rect.width*2-1;point.y=-(event.clientY-rect.top)/rect.height*2+1;ray.setFromCamera(point,preview.camera);};canvas.addEventListener('pointerdown',event=>{if(event.button===0)closeKitContextMenuV312();if(!kitFreeMoveV314||event.button!==0)return;const hit=itemForPreviewHitV312(event),item=hit&&draft.items.find(value=>value.id===hit.id);if(!item)return;event.preventDefault();event.stopImmediatePropagation();selectedItemId=item.id;kitDragV314={id:item.id,pointerId:event.pointerId};canvas.setPointerCapture?.(event.pointerId);preview.controls.enabled=false;select(item.id);},true);canvas.addEventListener('pointermove',event=>{if(!kitDragV314||event.pointerId!==kitDragV314.pointerId)return;const item=draft.items.find(value=>value.id===kitDragV314.id);if(!item)return;event.preventDefault();pointer(event);const b=bounds(),s=6/Math.max(b.l,b.w,b.h),sx=-b.minX,sy=-b.minY;plane.set(new THREE.Vector3(0,1,0),-(draft.pallet.h+item.z)*s);if(!ray.ray.intersectPlane(plane,world))return;const next={...item,x:Math.max(0,Math.min(draft.pallet.l-item.l,world.x/s-sx-item.l/2)),y:Math.max(0,Math.min(draft.pallet.w-item.w,world.z/s-sy-item.w/2))};const check=valid(next,draft.items.filter(value=>value.id!==item.id));if(!check.ok)return;Object.assign(item,next);refresh();},true);const finish=event=>{if(kitDragV314&&(!event||event.pointerId===kitDragV314.pointerId)){kitDragV314=null;if(preview)preview.controls.enabled=true;syncFreeMoveV314();}};canvas.addEventListener('pointerup',finish,true);canvas.addEventListener('pointercancel',finish,true);}
function setupPreviewInteractionsV314(){const canvas=preview?.renderer?.domElement;if(!canvas||canvas.dataset.kitPreviewV314)return;canvas.dataset.kitPreviewV314='1';canvas.addEventListener('pointerdown',event=>{if(event.button===0)closeKitContextMenuV312();},true);}
const openKitV314Base=open;
open=function(record=null){openKitV314Base(record);installCargoSearchV314();requestAnimationFrame(()=>{setupPreviewInteractionsV314();setupFreeMoveV314();});};

/* v3.1.6 — real searchable dropdowns and dedicated pallet-design permission. */
function cargoSearchTextV316(item){return `${item.name||''} ${item.type||''} ${item.l||0} ${item.w||0} ${item.h||0}`.toLowerCase();}
function syncCargoComboV316(selectId){
  const select=$('#'+selectId),combo=select?.nextElementSibling;
  if(!select||!combo?.classList.contains('kit-search-combo'))return;
  const selected=cargo().find(item=>item.id===select.value),button=$('.kit-search-combo-button',combo);
  if(button)button.textContent=selected?`${selected.name} · ${selected.l} × ${selected.w} × ${selected.h} mm`:'请选择货物';
}
function installCargoComboV316(selectId,placeholder){
  const select=$('#'+selectId);if(!select)return;
  select.closest('label')?.previousElementSibling?.classList?.contains('kit-cargo-search')&&select.closest('label').previousElementSibling.remove();
  select.classList.add('kit-native-select-hidden');
  let combo=select.nextElementSibling;
  if(!combo?.classList.contains('kit-search-combo')){
    combo=document.createElement('div');combo.className='kit-search-combo';
    combo.innerHTML=`<button type="button" class="kit-search-combo-button" aria-haspopup="listbox" aria-expanded="false">请选择货物</button><div class="kit-search-combo-popover" hidden><div class="kit-search-combo-sticky"><input type="search" autocomplete="off" placeholder="${placeholder}"></div><div class="kit-search-combo-options" role="listbox"></div></div>`;
    select.insertAdjacentElement('afterend',combo);
    const button=$('.kit-search-combo-button',combo),popover=$('.kit-search-combo-popover',combo),input=$('input',combo),options=$('.kit-search-combo-options',combo);
    const render=()=>{const terms=input.value.trim().toLowerCase().split(/[ ,，]+/).filter(Boolean),matches=cargo().filter(item=>terms.every(term=>cargoSearchTextV316(item).includes(term)));options.innerHTML=matches.map(item=>`<button type="button" role="option" data-kit-combo-value="${esc(item.id)}" class="${item.id===select.value?'selected':''}"><b>${esc(item.name)}</b><span>${item.l} × ${item.w} × ${item.h} mm</span></button>`).join('')||'<p>没有匹配的货物</p>';};
    button.addEventListener('click',event=>{event.stopPropagation();$$('.kit-search-combo-popover').forEach(node=>{if(node!==popover)node.hidden=true;});popover.hidden=!popover.hidden;button.setAttribute('aria-expanded',String(!popover.hidden));if(!popover.hidden){input.value='';render();requestAnimationFrame(()=>input.focus());}});
    input.addEventListener('input',render);
    options.addEventListener('click',event=>{const choice=event.target.closest('[data-kit-combo-value]');if(!choice)return;select.value=choice.dataset.kitComboValue;select.dispatchEvent(new Event('change',{bubbles:true}));popover.hidden=true;button.setAttribute('aria-expanded','false');syncCargoComboV316(selectId);});
    combo._renderOptions=render;
  }
  combo._renderOptions?.();syncCargoComboV316(selectId);
}
function installCargoCombosV316(){installCargoComboV316('kitSource','输入名称、类型或尺寸模糊搜索');installCargoComboV316('kitReplaceSource','输入名称、类型或尺寸模糊搜索');}
const fillChoicesV316Base=fillChoices;
fillChoices=function(){fillChoicesV316Base();installCargoCombosV316();};
const selectV316Base=select;
select=function(id){selectV316Base(id);syncCargoComboV316('kitReplaceSource');};
const openKitV316Base=open;
open=function(record=null){if(!editable()){const toast=document.querySelector('#appToast');if(toast){toast.textContent='当前账户未获托盘套装设计权限。';toast.classList.add('visible');setTimeout(()=>toast.classList.remove('visible'),3000);}return;}openKitV316Base(record);installCargoCombosV316();};
document.addEventListener('click',event=>{if(event.target.closest('.kit-search-combo'))return;$$('.kit-search-combo-popover').forEach(node=>node.hidden=true);});
window.addEventListener('topbox:permissions-changed',()=>refreshLaunch());

/* v3.1.7 — cargo choice is an explicit single-select dialog, not a dropdown. */
let kitPickerTargetV317='',kitPickerPendingV317='';
function cargoPickerLabelV317(item){return item?`${item.name} · ${item.l} × ${item.w} × ${item.h} mm`:'请选择货物';}
function ensureCargoPickerV317(){
  if($('#kitCargoPickerDialog'))return;
  document.body.insertAdjacentHTML('beforeend',`<dialog id="kitCargoPickerDialog" class="kit-cargo-picker-dialog"><div class="modal-head"><div><p class="eyebrow">SELECT CARGO</p><h2 id="kitCargoPickerTitle">选择货物</h2></div><button type="button" class="icon-button" id="closeKitCargoPicker">×</button></div><label class="kit-cargo-picker-search">模糊查询<input id="kitCargoPickerSearch" type="search" autocomplete="off" placeholder="输入名称、类型或尺寸，支持多个关键词"></label><div id="kitCargoPickerList" class="kit-cargo-picker-list" role="radiogroup"></div><div class="modal-actions"><button type="button" class="button secondary" id="cancelKitCargoPicker">取消</button><button type="button" class="button primary" id="confirmKitCargoPicker">确定选择</button></div></dialog>`);
  const close=()=>$('#kitCargoPickerDialog').close();
  $('#closeKitCargoPicker').onclick=close;$('#cancelKitCargoPicker').onclick=close;
  $('#kitCargoPickerSearch').oninput=renderCargoPickerV317;
  $('#kitCargoPickerList').onclick=event=>{const row=event.target.closest('[data-kit-picker-id]');if(!row)return;kitPickerPendingV317=row.dataset.kitPickerId;renderCargoPickerV317();};
  $('#confirmKitCargoPicker').onclick=()=>{const select=$('#'+kitPickerTargetV317);if(!select||!kitPickerPendingV317)return;select.value=kitPickerPendingV317;select.dispatchEvent(new Event('change',{bubbles:true}));syncCargoPickerButtonsV317();close();};
}
function renderCargoPickerV317(){
  const terms=($('#kitCargoPickerSearch')?.value||'').trim().toLowerCase().split(/[\s,，]+/).filter(Boolean),items=cargo().filter(item=>terms.every(term=>cargoSearchTextV316(item).includes(term)));
  $('#kitCargoPickerList').innerHTML=items.map(item=>`<button type="button" class="kit-cargo-picker-row ${item.id===kitPickerPendingV317?'selected':''}" data-kit-picker-id="${esc(item.id)}"><i style="background:${esc(item.color||'#2563eb')}"></i><span><b>${esc(item.name)}</b><small>${esc(item.type||'单体货物')} · ${item.l} × ${item.w} × ${item.h} mm · ${(+item.pieces||1).toLocaleString()} 件/包</small></span><strong>${item.id===kitPickerPendingV317?'已选择':''}</strong></button>`).join('')||'<div class="kit-empty">没有匹配的货物</div>';
}
function openCargoPickerV317(selectId){
  ensureCargoPickerV317();kitPickerTargetV317=selectId;kitPickerPendingV317=$('#'+selectId)?.value||cargo()[0]?.id||'';
  $('#kitCargoPickerTitle').textContent=selectId==='kitReplaceSource'?'选择替换货物':'选择添加货物';$('#kitCargoPickerSearch').value='';renderCargoPickerV317();$('#kitCargoPickerDialog').showModal();requestAnimationFrame(()=>$('#kitCargoPickerSearch').focus());
}
function syncCargoPickerButtonsV317(){
  [['kitSource','选择添加货物'],['kitReplaceSource','选择替换货物']].forEach(([id,label])=>{
    const select=$('#'+id);if(!select)return;
    select.classList.add('kit-native-select-hidden');
    select.parentElement?.querySelector('.kit-search-combo')?.remove();
    let button=select.parentElement?.querySelector(`[data-kit-picker-button="${id}"]`);
    if(!button){button=document.createElement('button');button.type='button';button.className='kit-cargo-picker-button';button.dataset.kitPickerButton=id;button.addEventListener('click',()=>openCargoPickerV317(id));select.insertAdjacentElement('afterend',button);}
    const item=cargo().find(value=>value.id===select.value);button.innerHTML=`<span>${esc(label)}</span><b>${esc(cargoPickerLabelV317(item))}</b>`;
  });
}
const fillChoicesV317Base=fillChoices;
fillChoices=function(){fillChoicesV317Base();$$('.kit-search-combo').forEach(node=>node.remove());syncCargoPickerButtonsV317();};
const selectV317Base=select;
select=function(id){selectV317Base(id);syncCargoPickerButtonsV317();};
const openKitV317Base=open;
open=function(record=null){openKitV317Base(record);$$('.kit-search-combo').forEach(node=>node.remove());syncCargoPickerButtonsV317();};

/* v3.2.0 — launch through delegation so archive rerenders cannot detach the designer. */
function openPalletKitV319(record=null){
  const dialogNode=$('#palletKitDialog');
  if(dialogNode?.open){dialogNode.focus();return;}
  try{open(record);}catch(error){
    console.error(error);
    const toast=document.querySelector('#appToast');
    if(toast){toast.textContent='托盘套装设计打开失败，请刷新后重试。';toast.classList.add('visible');setTimeout(()=>toast.classList.remove('visible'),3000);}
  }
}
function requestOpenPalletKitV320(record=null){
  if(state()){openPalletKitV319(record);return;}
  const retry=()=>openPalletKitV319(record);
  window.addEventListener('topbox-app-ready',retry,{once:true});
  setTimeout(()=>{if(state())retry();},0);
}
document.addEventListener('click',event=>{
  const launch=event.target.closest('#palletKitBuilder');
  if(!launch)return;
  event.preventDefault();event.stopImmediatePropagation();requestOpenPalletKitV320();
},true);
window.addEventListener('topbox-app-ready',()=>refreshLaunch(),{once:true});
window.TopBoxPalletKit={open:requestOpenPalletKitV320,refreshLaunch};

/* v3.2.4 — multi-selection and movement controls live together in 3D settings. */
let kitMultiSelectV324=false,kitMultiSelectedIdsV324=new Set();
function persistKitSettingsV324(){persistKitDisplaySetting();}
function syncKitSettingsV324(){
  const freeToggle=$('#kitFreeMoveToggle'),multiToggle=$('#kitMultiSelectToggle');
  if(freeToggle)freeToggle.checked=!!kitFreeMoveV314;
  if(multiToggle)multiToggle.checked=kitMultiSelectV324;
}
function highlightKitSelectionsV324(){
  if(!preview?.scene)return;
  preview.scene.traverse(object=>{
    const id=object.userData?.kitItemId;
    if(!id||!object.isMesh||!object.material?.color)return;
    const item=draft?.items?.find(value=>value.id===id);if(!item)return;
    const selected=kitMultiSelectedIdsV324.has(id)||id===selectedItemId;
    const color=new THREE.Color(item.color||'#2563eb');
    if(selected)color.lerp(new THREE.Color(0xffffff),.42);
    object.material.color.copy(color);object.material.emissive?.copy(selected?color:new THREE.Color(0x000000));
    if('emissiveIntensity' in object.material)object.material.emissiveIntensity=selected ? 0.12 : 0;
  });
  preview.renderer?.render(preview.scene,preview.camera);
}
function setupKitSettingsV324(){
  setupKitDisplayControlsV312();
  const button=$('#kitDisplaySettings'),menu=$('#kitDisplaySettingsMenu');if(!button||!menu)return;
  menu.innerHTML=`<label class="kit-setting-toggle"><input type="checkbox" id="kitTooltipToggle"> <span>悬浮显示货物名称</span></label><label class="kit-setting-toggle"><input type="checkbox" id="kitMultiSelectToggle"> <span>多选货物</span></label><label class="kit-setting-toggle"><input type="checkbox" id="kitFreeMoveToggle"> <span>自由移动货物</span></label>`;
  const tooltip=$('#kitTooltipToggle'),multi=$('#kitMultiSelectToggle'),free=$('#kitFreeMoveToggle');
  tooltip.checked=state()?.settings?.kitCargoTooltip!==false;
  kitMultiSelectV324=!!state()?.settings?.kitMultiSelect;
  syncKitSettingsV324();
  button.onclick=event=>{event.stopPropagation();menu.hidden=!menu.hidden;};
  tooltip.onchange=()=>{if(state())state().settings.kitCargoTooltip=tooltip.checked;persistKitSettingsV324();};
  multi.onchange=()=>{kitMultiSelectV324=multi.checked;if(!kitMultiSelectV324&&selectedItemId)kitMultiSelectedIdsV324=new Set([selectedItemId]);if(state())state().settings.kitMultiSelect=kitMultiSelectV324;persistKitSettingsV324();refresh();};
  free.onchange=()=>{if(free.checked!==kitFreeMoveV314)$('#kitFreeMove')?.click();syncKitSettingsV324();};
}
function setupKitMultiSelectionV324(){
  const canvas=preview?.renderer?.domElement;if(!canvas||canvas.dataset.kitMultiV324)return;canvas.dataset.kitMultiV324='1';
  canvas.addEventListener('pointerdown',event=>{
    if(!kitMultiSelectV324||kitFreeMoveV314||event.button!==0)return;
    const hit=itemForPreviewHitV312(event);if(!hit)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(kitMultiSelectedIdsV324.has(hit.id))kitMultiSelectedIdsV324.delete(hit.id);else kitMultiSelectedIdsV324.add(hit.id);
    const primary=[...kitMultiSelectedIdsV324].at(-1)||null;
    markedItemIds=new Set(kitMultiSelectedIdsV324);
    if(primary)selectV317Base(primary);else{selectedItemId=null;$('#kitSelectedEditor')?.classList.add('hidden');refresh();}
    highlightKitSelectionsV324();
  },true);
}
const renderPreviewV324Base=renderPreview;
renderPreview=function(){renderPreviewV324Base();requestAnimationFrame(highlightKitSelectionsV324);};
const openKitV324Base=open;
open=function(record=null){openKitV324Base(record);kitMultiSelectedIdsV324=selectedItemId?new Set([selectedItemId]):new Set();requestAnimationFrame(()=>{setupKitSettingsV324();setupKitMultiSelectionV324();highlightKitSelectionsV324();});};

/* v3.2.5 — selection is shared by 3D and the placed-item panel. */
function selectedKitIdsV325(){return new Set(kitMultiSelectV324?[...kitMultiSelectedIdsV324]:(selectedItemId?[selectedItemId]:[]));}
function syncKitSelectionV325(ids,primary=[...ids].at(-1)||null){kitMultiSelectedIdsV324=new Set(ids);markedItemIds=new Set(ids);selectedItemId=primary;if(primary){const item=draft.items.find(value=>value.id===primary);if(item){$('#kitSelectedEditor')?.classList.remove('hidden');$('#kitReplaceSource').value=item.sourceId||'';$('#selectedX').value=item.x;$('#selectedY').value=item.y;$('#selectedZ').value=item.z;}}else $('#kitSelectedEditor')?.classList.add('hidden');refresh();}
const renderItemsV325Base=renderItems;
renderItems=function(){markedItemIds=new Set(selectedKitIdsV325());renderItemsV325Base();};
function deleteKitSelectionV325(){const ids=selectedKitIdsV325();if(!ids.size)return msg('请先选择需要删除的货物。',true);draft.items=draft.items.filter(item=>!ids.has(item.id));kitMultiSelectedIdsV324.clear();markedItemIds.clear();selectedItemId=null;$('#kitSelectedEditor')?.classList.add('hidden');closeKitContextMenuV312();refresh();msg(`已删除 ${ids.size} 件货物。`);}
function ensureLayerToolsV325(){const anchor=$('#addKitGrid');if(!anchor||$('#kitFillLayer'))return;anchor.insertAdjacentHTML('afterend','<div class="kit-layer-tools"><button type="button" class="button secondary" id="kitFillLayer">铺满一层</button><button type="button" class="button secondary" id="kitCopyLayer">复制本层到上一层</button></div>');$('#kitFillLayer').onclick=fillKitLayerV325;$('#kitCopyLayer').onclick=copyKitLayerV325;}
function fillKitLayerV325(){const sourceItem=source();if(!sourceItem)return msg('请先选择一种货物。',true);const z=Math.max(0,num('kitZ')),rotate=$('#kitRotate')?.checked,base=makeItem(sourceItem,{rotate}),nx=Math.max(1,Math.floor(draft.pallet.l/base.l)),ny=Math.max(1,Math.floor(draft.pallet.w/base.w));let added=0;for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const item=makeItem(sourceItem,{rotate,x:x*base.l,y:y*base.w,z});if(valid(item).ok){draft.items.push(item);added++;}}if(!added)return msg('当前层没有可放置的空位。',true);const ids=new Set(draft.items.filter(item=>item.z===z).map(item=>item.id));syncKitSelectionV325(ids,[...ids].at(-1));msg(`已铺满一层，新增 ${added} 件货物。`);}
function copyKitLayerV325(){const sourceZ=selectedItemId?(draft.items.find(item=>item.id===selectedItemId)?.z??num('kitZ')):num('kitZ'),layer=draft.items.filter(item=>item.z===sourceZ);if(!layer.length)return msg('当前层没有货物可复制。',true);const rise=Math.max(...layer.map(item=>item.h)),copies=layer.map(item=>({...item,id:uid('kit-item'),z:item.z+rise}));const accepted=[];for(const candidate of copies){if(valid(candidate,[...draft.items,...accepted]).ok)accepted.push(candidate);}if(!accepted.length)return msg('上一层没有可复制的可用位置。',true);draft.items.push(...accepted);syncKitSelectionV325(new Set(accepted.map(item=>item.id)),accepted.at(-1).id);msg(`已复制本层到上一层，共 ${accepted.length} 件货物。`);}
function setupKitSelectionControlsV325(){
  ensureLayerToolsV325();const canvas=preview?.renderer?.domElement;if(!canvas||canvas.dataset.kitSelectV325)return;canvas.dataset.kitSelectV325='1';
  canvas.addEventListener('contextmenu',event=>{const ids=selectedKitIdsV325();if(!kitMultiSelectV324||ids.size<2)return;event.preventDefault();event.stopImmediatePropagation();const menu=$('#kitContextMenu'),first=draft.items.find(item=>ids.has(item.id));if(!menu||!first)return;menu.innerHTML=`<b>货物操作</b><button class="kit-menu-delete" data-kit-multi-delete>删除已选择的 ${ids.size} 件货物</button>`;menu.onclick=click=>{if(click.target.closest('[data-kit-multi-delete]'))deleteKitSelectionV325();};showKitContextMenuV312(event,first);},true);
}
document.addEventListener('change',event=>{const mark=event.target.closest?.('#kitItemList [data-kit-mark]');if(!mark)return;event.stopImmediatePropagation();const ids=selectedKitIdsV325();if(kitMultiSelectV324){mark.checked?ids.add(mark.dataset.kitMark):ids.delete(mark.dataset.kitMark);syncKitSelectionV325(ids,[...ids].at(-1)||null);}else syncKitSelectionV325(mark.checked?new Set([mark.dataset.kitMark]):new Set(),mark.checked?mark.dataset.kitMark:null);},true);
document.addEventListener('keydown',event=>{if(event.key!=='Delete'||!$('#palletKitDialog')?.open||event.target.matches?.('input,textarea,select'))return;const ids=selectedKitIdsV325();if(!ids.size)return;event.preventDefault();deleteKitSelectionV325();});
const openKitV325Base=open;
open=function(record=null){openKitV325Base(record);requestAnimationFrame(()=>{ensureLayerToolsV325();setupKitSelectionControlsV325();markedItemIds=new Set(selectedKitIdsV325());renderItems();});};

/* v3.2.6 — pallet designer selection tools and settings are local, persistent
   controls.  They do not close the settings panel or reset the 3D camera. */
function setKitSwitchV326(button,on){button.classList.toggle('on',!!on);button.setAttribute('aria-checked',String(!!on));button.querySelector('i').textContent=on?'开':'关';}
setupKitSettingsV324=function(){
  setupKitDisplayControlsV312();
  const button=$('#kitDisplaySettings'),menu=$('#kitDisplaySettingsMenu');if(!button||!menu)return;
  const saved=state()?.settings||{};kitMultiSelectV324=!!saved.kitMultiSelect;
  menu.innerHTML=`<div class="kit-setting-switch"><span>悬浮显示货物名称</span><button type="button" role="switch" id="kitTooltipSwitch"><i></i></button></div><div class="kit-setting-switch"><span>多选货物</span><button type="button" role="switch" id="kitMultiSwitch"><i></i></button></div><div class="kit-setting-switch"><span>自由移动货物</span><button type="button" role="switch" id="kitFreeSwitch"><i></i></button></div>`;
  const tooltip=$('#kitTooltipSwitch'),multi=$('#kitMultiSwitch'),free=$('#kitFreeSwitch');
  setKitSwitchV326(tooltip,saved.kitCargoTooltip!==false);setKitSwitchV326(multi,kitMultiSelectV324);setKitSwitchV326(free,kitFreeMoveV314);
  button.onclick=event=>{event.preventDefault();event.stopPropagation();menu.hidden=!menu.hidden;};
  menu.onpointerdown=event=>event.stopPropagation();menu.onclick=event=>{event.stopPropagation();const target=event.target.closest('button');if(!target)return;
    if(target===tooltip){const on=target.getAttribute('aria-checked')!=='true';if(state())state().settings.kitCargoTooltip=on;setKitSwitchV326(target,on);persistKitSettingsV324();}
    if(target===multi){kitMultiSelectV324=target.getAttribute('aria-checked')!=='true';if(!kitMultiSelectV324&&selectedItemId)kitMultiSelectedIdsV324=new Set([selectedItemId]);if(state())state().settings.kitMultiSelect=kitMultiSelectV324;setKitSwitchV326(target,kitMultiSelectV324);persistKitSettingsV324();highlightKitSelectionsV324();renderItems();}
    if(target===free){kitFreeMoveV314=target.getAttribute('aria-checked')!=='true';kitDragV314=null;syncFreeMoveV314();setKitSwitchV326(target,kitFreeMoveV314);}
  };
};
function ensureKitSelectionToolsV326(){
  const panel=$('.kit-items-panel section');if(!panel||$('#kitSelectionToolsV326'))return;
  const head=panel.querySelector('.kit-items-head');head?.insertAdjacentHTML('afterend',`<div id="kitSelectionToolsV326" class="kit-selection-tools"><button type="button" data-kit-select-group="all">全选</button><button type="button" data-kit-select-group="none">取消全选</button><button type="button" data-kit-select-group="layer">选择当前层</button><button type="button" data-kit-select-group="x">选择当前 X 行</button><button type="button" data-kit-select-group="y">选择当前 Y 行</button><button type="button" data-kit-select-group="z">选择当前 Z 行</button></div>`);
  $('#kitSelectionToolsV326').onclick=event=>{const button=event.target.closest('[data-kit-select-group]');if(button)selectKitGroupV326(button.dataset.kitSelectGroup);};
  const anchor=$('#kitCopyLayer')||$('#kitFillLayer')||$('#addKitGrid');if(anchor&&!$('#kitFullLayerToolsV326')){anchor.insertAdjacentHTML('afterend',`<div class="kit-full-layer-tools" id="kitFullLayerToolsV326"><label>满载层数<input id="kitFullLayerCount" type="number" min="1" value="1"></label><button type="button" class="button primary" id="kitFullLayer">按层数满载</button></div>`);$('#kitFullLayer').onclick=fillKitLayersV326;}
  const controls=$('.kit-view-buttons');if(controls&&!$('#kitFullscreenV326')){controls.insertAdjacentHTML('beforeend','<button type="button" id="kitFullscreenV326" title="全屏显示">⛶</button>');$('#kitFullscreenV326').onclick=()=>{$('.pallet-kit-stage')?.requestFullscreen?.();};}
}
function kitSelectionBaseV326(){const ids=selectedKitIdsV325();const id=[...ids].at(-1)||selectedItemId;return draft?.items?.find(item=>item.id===id)||null;}
function selectKitGroupV326(group){
  if(!draft?.items?.length)return msg('当前没有可选择的货物。',true);
  if(group==='all')return syncKitSelectionV325(new Set(draft.items.map(item=>item.id)),draft.items.at(-1).id);
  if(group==='none')return syncKitSelectionV325(new Set(),null);
  const base=kitSelectionBaseV326();if(!base)return msg('请先选择一件货物作为基准。',true);
  let items=[];
  if(group==='layer')items=draft.items.filter(item=>item.z===base.z);
  if(group==='x')items=draft.items.filter(item=>item.y===base.y&&item.z===base.z);
  if(group==='y')items=draft.items.filter(item=>item.x===base.x&&item.z===base.z);
  if(group==='z')items=draft.items.filter(item=>item.x===base.x&&item.y===base.y);
  kitMultiSelectV324=true;if(state())state().settings.kitMultiSelect=true;const switcher=$('#kitMultiSwitch');if(switcher)setKitSwitchV326(switcher,true);syncKitSelectionV325(new Set(items.map(item=>item.id)),base.id);
}
function fillKitLayersV326(){
  const sourceItem=source();if(!sourceItem)return msg('请先选择一种货物。',true);
  const layers=Math.max(1,Math.floor(num('kitFullLayerCount',1))),normal=makeItem(sourceItem,{rotate:false}),rotated=makeItem(sourceItem,{rotate:true});
  const count=item=>Math.floor(draft.pallet.l/item.l)*Math.floor(draft.pallet.w/item.w);
  const base=count(rotated)>count(normal)?rotated:normal,nx=Math.floor(draft.pallet.l/base.l),ny=Math.floor(draft.pallet.w/base.w);
  if(nx<1||ny<1)return msg('当前货物无法放入托盘范围。',true);
  const next=[];for(let layer=0;layer<layers;layer++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)next.push(makeItem(sourceItem,{rotate:base.rotate,x:x*base.l,y:y*base.w,z:layer*base.h}));
  draft.items=[];draft.items.push(...next);kitMultiSelectV324=true;if(state())state().settings.kitMultiSelect=true;syncKitSelectionV325(new Set(next.map(item=>item.id)),next.at(-1).id);msg(`已按 ${layers} 层满载托盘，共摆放 ${next.length} 件货物。`);
}
const openKitV326Base=open;
open=function(record=null){openKitV326Base(record);requestAnimationFrame(()=>{setupKitSettingsV324();ensureKitSelectionToolsV326();});};

/* v3.2.8 — keep the original single-item actions, but make fullscreen a
   reversible in-place view that never recreates the camera pose. */
function kitSingleContextMarkupV328(){return `<b>货物操作</b><div class="kit-menu-group"><span>+1 新增同货物</span><button data-kit-add="xp">X 正向</button><button data-kit-add="xn">X 负向</button><button data-kit-add="yp">Y 正向</button><button data-kit-add="yn">Y 负向</button><button data-kit-add="zp">Z 正向</button><button data-kit-add="zn">Z 负向</button></div><div class="kit-menu-group"><span>旋转</span><button data-kit-rotate="x,90">X 90°</button><button data-kit-rotate="x,180">X 180°</button><button data-kit-rotate="y,90">Y 90°</button><button data-kit-rotate="y,180">Y 180°</button><button data-kit-rotate="z,90">Z 90°</button><button data-kit-rotate="z,180">Z 180°</button></div>`;}
function resizeKitPreviewV328(){
  const host=$('#kitPreview');if(!host||!preview?.renderer||!preview?.camera)return;
  const width=Math.max(1,host.clientWidth),height=Math.max(1,host.clientHeight);
  preview.renderer.setSize(width,height,false);preview.camera.aspect=width/height;preview.camera.updateProjectionMatrix();preview.controls?.update?.();preview.renderer.render?.(preview.scene,preview.camera);
}
function syncKitFullscreenV328(){
  const stage=$('.pallet-kit-stage'),button=$('#kitFullscreenV326');if(!stage||!button)return;
  const full=document.fullscreenElement===stage;
  button.textContent=full?'×':'⛶';button.title=full?'退出全屏':'全屏显示';button.setAttribute('aria-label',button.title);button.classList.toggle('kit-fullscreen-exit',full);
  requestAnimationFrame(resizeKitPreviewV328);
}
function setupKitFullscreenV328(){
  const stage=$('.pallet-kit-stage'),current=$('#kitFullscreenV326');if(!stage||!current)return;
  if(!current.dataset.v328Bound){
    const button=current.cloneNode(true);button.dataset.v328Bound='1';current.replaceWith(button);
    button.addEventListener('click',event=>{event.preventDefault();if(document.fullscreenElement===stage)document.exitFullscreen?.();else stage.requestFullscreen?.().catch(()=>msg('当前浏览器不支持全屏显示。',true));});
  }
  if(!document.documentElement.dataset.kitFullscreenV328){document.documentElement.dataset.kitFullscreenV328='1';document.addEventListener('fullscreenchange',syncKitFullscreenV328);}
  syncKitFullscreenV328();
}
function setupSingleKitContextMenuV328(){
  const canvas=preview?.renderer?.domElement;if(!canvas||canvas.dataset.kitSingleMenuV328)return;canvas.dataset.kitSingleMenuV328='1';
  canvas.addEventListener('contextmenu',event=>{
    const selected=selectedKitIdsV325();
    if(kitMultiSelectV324&&selected.size>1)return;
    const item=itemForPreviewHitV312(event);if(!item)return;
    event.preventDefault();event.stopImmediatePropagation();
    selectedItemId=item.id;markedItemIds=new Set([item.id]);kitMultiSelectedIdsV324=new Set([item.id]);
    const menu=$('#kitContextMenu');if(!menu)return;
    menu.innerHTML=kitSingleContextMarkupV328();
    menu.onclick=click=>{const add=click.target.closest('[data-kit-add]'),rotate=click.target.closest('[data-kit-rotate]');if(add)duplicateKitItemV312(add.dataset.kitAdd);if(rotate){const [axis,degrees]=rotate.dataset.kitRotate.split(',');rotateKitItemV312(axis,+degrees);}};
    syncKitSelectionV325(new Set([item.id]),item.id);
    showKitContextMenuV312(event,item);
  },true);
}
const openKitV328Base=open;
open=function(record=null){openKitV328Base(record);requestAnimationFrame(()=>{setupSingleKitContextMenuV328();setupKitFullscreenV328();});};

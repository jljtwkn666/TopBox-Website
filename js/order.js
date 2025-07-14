// 生成30条纸箱产品和20条包材产品的模拟数据
const boxProducts = Array.from({length: 30}, (_, i) => ({
  code: `BX${(i+1).toString().padStart(3, '0')}`,
  name: `快递纸箱${i+1}`,
  size: `${30+i}×${20+i}×${15+i}cm`,
  spec: `${i%3===0?'A型':'B型'}`,
  material: ['三层','五层','七层'][i%3],
  process: i%2===0?'四色印刷':'单色印刷',
  price: (8 + i%5 + (i%3)*2).toFixed(2),
  stock: 100 - i*2,
}));
const materialProducts = [
  {name:'封箱胶带',size:'48mm×100m',spec:'透明',material:'BOPP',process:'高粘',price:2.5,stock:500},
  {name:'气泡膜',size:'1m×100m',spec:'10mm气泡',material:'PE',process:'防震',price:18,stock:200},
  {name:'拉伸膜',size:'500mm×1500m',spec:'20μm',material:'PE',process:'高弹',price:45,stock:120},
  {name:'快递袋',size:'300×400mm',spec:'灰色',material:'PE',process:'防水',price:0.5,stock:1000},
  {name:'标签贴纸',size:'100×150mm',spec:'铜版纸',material:'纸',process:'不干胶',price:0.08,stock:3000},
  {name:'泡沫垫',size:'1m×2m×5cm',spec:'25kg/m³',material:'EPE',process:'高密度',price:35,stock:80},
  {name:'打包绳',size:'6mm×200m',spec:'白色',material:'PP',process:'高强',price:8.5,stock:150},
  {name:'牛皮纸',size:'70cm×100m',spec:'原色',material:'牛皮纸',process:'高强',price:12,stock:90},
  {name:'彩色胶带',size:'48mm×100m',spec:'红色',material:'BOPP',process:'彩印',price:3,stock:400},
  {name:'防静电袋',size:'350×450mm',spec:'粉色',material:'PE',process:'防静电',price:1.2,stock:300},
  {name:'纸护角',size:'40×40×3mm',spec:'1m',material:'纸',process:'加固',price:2.2,stock:200},
  {name:'珍珠棉',size:'1m×100m',spec:'3mm',material:'EPE',process:'防震',price:15,stock:100},
  {name:'缠绕膜',size:'500mm×1000m',spec:'透明',material:'PE',process:'高弹',price:30,stock:110},
  {name:'热敏纸',size:'100×150mm',spec:'卷',material:'热敏纸',process:'打印',price:0.12,stock:500},
  {name:'防伪标签',size:'30×30mm',spec:'激光',material:'纸',process:'防伪',price:0.25,stock:800},
  {name:'快递箱内袋',size:'250×350mm',spec:'透明',material:'PE',process:'防潮',price:0.3,stock:600},
  {name:'纸箱垫板',size:'60×40cm',spec:'3mm',material:'纸',process:'加固',price:2.8,stock:120},
  {name:'牛皮纸袋',size:'350×500mm',spec:'原色',material:'牛皮纸',process:'环保',price:1.5,stock:200},
  {name:'防潮袋',size:'300×400mm',spec:'蓝色',material:'PE',process:'防潮',price:0.6,stock:350},
  {name:'警示胶带',size:'48mm×100m',spec:'警示语',material:'BOPP',process:'印刷',price:3.5,stock:250},
];

// 渲染表格
function renderBoxTable() {
  const tbody = document.getElementById('box-tbody');
  tbody.innerHTML = '';
  const search = document.getElementById('box-search').value.trim();
  const mat = document.getElementById('box-material-filter').value;
  boxProducts.forEach((p, i) => {
    if ((search && !p.name.includes(search) && !p.code.includes(search)) || (mat && p.material !== mat)) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.code}</td>
      <td>${p.name}</td>
      <td>${p.size}</td>
      <td>${p.spec}</td>
      <td>${p.material}</td>
      <td>${p.process}</td>
      <td>${p.price}</td>
      <td>${p.stock}</td>
      <td><input type="number" min="0" max="${p.stock}" value="0" data-idx="${i}" class="box-qty"></td>
      <td class="box-amount">0.00</td>
    `;
    tbody.appendChild(tr);
  });
}
function renderMaterialTable() {
  const tbody = document.getElementById('material-tbody');
  tbody.innerHTML = '';
  const search = document.getElementById('material-search').value.trim();
  const type = document.getElementById('material-type-filter').value;
  materialProducts.forEach((p, i) => {
    if ((search && !p.name.includes(search)) || (type && !p.name.includes(type))) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.name}</td>
      <td>${p.size}</td>
      <td>${p.spec}</td>
      <td>${p.material}</td>
      <td>${p.process}</td>
      <td>${p.price}</td>
      <td>${p.stock}</td>
      <td><input type="number" min="0" max="${p.stock}" value="0" data-idx="${i}" class="mat-qty"></td>
      <td class="mat-amount">0.00</td>
    `;
    tbody.appendChild(tr);
  });
}

function updateBoxAmounts() {
  let total = 0;
  document.querySelectorAll('.box-qty').forEach((input, i) => {
    const idx = input.getAttribute('data-idx');
    const qty = parseInt(input.value) || 0;
    const price = parseFloat(boxProducts[idx].price);
    const amount = qty * price;
    input.closest('tr').querySelector('.box-amount').textContent = amount.toFixed(2);
    total += amount;
  });
  return total;
}
function updateMaterialAmounts() {
  let total = 0;
  document.querySelectorAll('.mat-qty').forEach((input, i) => {
    const idx = input.getAttribute('data-idx');
    const qty = parseInt(input.value) || 0;
    const price = parseFloat(materialProducts[idx].price);
    const amount = qty * price;
    input.closest('tr').querySelector('.mat-amount').textContent = amount.toFixed(2);
    total += amount;
  });
  return total;
}
function updateOrderSummary() {
  const total = updateBoxAmounts() + updateMaterialAmounts();
  document.getElementById('order-summary').textContent = `总订单金额：฿${total.toFixed(2)}`;
}

// 事件绑定
window.addEventListener('DOMContentLoaded', () => {
  renderBoxTable();
  renderMaterialTable();
  updateOrderSummary();
  document.getElementById('box-search').addEventListener('input', () => { renderBoxTable(); updateOrderSummary(); });
  document.getElementById('box-material-filter').addEventListener('change', () => { renderBoxTable(); updateOrderSummary(); });
  document.getElementById('material-search').addEventListener('input', () => { renderMaterialTable(); updateOrderSummary(); });
  document.getElementById('material-type-filter').addEventListener('change', () => { renderMaterialTable(); updateOrderSummary(); });

  document.getElementById('box-tbody').addEventListener('input', e => {
    if (e.target.classList.contains('box-qty')) updateOrderSummary();
  });
  document.getElementById('material-tbody').addEventListener('input', e => {
    if (e.target.classList.contains('mat-qty')) updateOrderSummary();
  });

  document.getElementById('clear-order').addEventListener('click', () => {
    document.querySelectorAll('.box-qty, .mat-qty').forEach(input => input.value = 0);
    updateOrderSummary();
  });
  document.getElementById('submit-order').addEventListener('click', () => {
    let order = [];
    document.querySelectorAll('.box-qty').forEach((input, i) => {
      const qty = parseInt(input.value) || 0;
      if (qty > 0) order.push({type:'纸箱', ...boxProducts[input.getAttribute('data-idx')], qty});
    });
    document.querySelectorAll('.mat-qty').forEach((input, i) => {
      const qty = parseInt(input.value) || 0;
      if (qty > 0) order.push({type:'包材', ...materialProducts[input.getAttribute('data-idx')], qty});
    });
    if (order.length === 0) {
      alert('请至少选择一种产品并输入订购数量！');
      return;
    }
    alert('订单已提交！\n' + order.map(o => `${o.type}-${o.name||o.code} x${o.qty}`).join('\n'));
    document.getElementById('clear-order').click();
  });
}); 
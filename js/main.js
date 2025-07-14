// 轮播图功能
let currentSlide = 0;
const slides = document.querySelectorAll('.slide');
const dots = document.querySelectorAll('.dot');
const prevBtn = document.querySelector('.slider-btn.prev');
const nextBtn = document.querySelector('.slider-btn.next');

function showSlide(index) {
  slides.forEach((slide, i) => {
    slide.classList.toggle('active', i === index);
    if (dots[i]) dots[i].classList.toggle('active', i === index);
  });
  currentSlide = index;
}

function nextSlide() {
  showSlide((currentSlide + 1) % slides.length);
}

function prevSlide() {
  showSlide((currentSlide - 1 + slides.length) % slides.length);
}

if (prevBtn && nextBtn) {
  prevBtn.addEventListener('click', prevSlide);
  nextBtn.addEventListener('click', nextSlide);
}
if (dots.length) {
  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => showSlide(i));
  });
}
let sliderInterval = setInterval(nextSlide, 5000);
if (slides.length) {
  slides.forEach(slide => {
    slide.addEventListener('mouseenter', () => clearInterval(sliderInterval));
    slide.addEventListener('mouseleave', () => sliderInterval = setInterval(nextSlide, 5000));
  });
}

// 移动端菜单
const mobileToggle = document.querySelector('.mobile-menu-toggle');
const navMenu = document.querySelector('.nav-menu');
if (mobileToggle && navMenu) {
  mobileToggle.addEventListener('click', () => {
    navMenu.classList.toggle('active');
  });
}
// 关闭菜单时点击菜单项
if (navMenu) {
  navMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 767) navMenu.classList.remove('active');
    });
  });
}

// 语言下拉框切换
window.addEventListener('DOMContentLoaded', () => {
  const langSelect = document.getElementById('langSelect');
  if (langSelect) {
    // 设置初始选中项
    const savedLang = localStorage.getItem('lang') || 'zh-CN';
    langSelect.value = savedLang;
    setFlagIcon(langSelect);
    langSelect.addEventListener('change', function() {
      setLanguage(this.value);
      setFlagIcon(this);
    });
  }
});
function setFlagIcon(select) {
  // 仅在桌面端显示flag，移动端可省略
  const flag = select.options[select.selectedIndex].getAttribute('data-flag');
  select.style.backgroundImage = flag ? `url('${flag}'), url('../images/arrow-down.svg')` : `url('../images/arrow-down.svg')`;
  select.style.backgroundPosition = '8px center, right 12px center';
  select.style.backgroundSize = '22px 16px, 18px 18px';
  select.style.paddingLeft = '36px';
}

// 右下角悬浮按钮组交互
window.addEventListener('DOMContentLoaded', () => {
  const fabGroup = document.querySelector('.fab-group');
  const fabMain = document.querySelector('.fab-main');
  const fabActions = document.querySelector('.fab-actions');
  if (fabMain && fabGroup) {
    fabGroup.addEventListener('mouseenter', () => fabGroup.classList.add('open'));
    fabGroup.addEventListener('mouseleave', () => fabGroup.classList.remove('open'));
    // 电话
    const telBtn = document.querySelector('.fab-tel');
    if (telBtn) telBtn.addEventListener('click', () => { window.open('tel:0938628101'); });
    // 邮箱
    const mailBtn = document.querySelector('.fab-mail');
    if (mailBtn) mailBtn.addEventListener('click', () => {
      navigator.clipboard.writeText('topboxindustry@gmail.com');
      mailBtn.classList.add('copied');
      mailBtn.querySelector('.fab-action-label').textContent = '已复制';
      setTimeout(() => {
        mailBtn.classList.remove('copied');
        mailBtn.querySelector('.fab-action-label').textContent = 'topboxindustry@gmail.com';
      }, 1200);
    });
    // 返回顶部
    const topBtn = document.querySelector('.fab-top');
    if (topBtn) topBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    // LINE二维码
    const lineBtn = document.querySelector('.fab-line');
    if (lineBtn) {
      lineBtn.addEventListener('mouseenter', () => lineBtn.classList.add('show-qr'));
      lineBtn.addEventListener('mouseleave', () => lineBtn.classList.remove('show-qr'));
    }
  }
}); 
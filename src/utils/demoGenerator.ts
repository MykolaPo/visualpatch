export function generateRichnachasDemoScreenshot(): {
  dataUrl: string;
  width: number;
  height: number;
} {
  const width = 1280;
  const height = 860;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Page background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  // Header
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, 72);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 71, width, 1);

  // Brand logo
  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.roundRect(40, 18, 36, 36, 8);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px Inter, sans-serif';
  ctx.fillText('Р', 52, 42);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px Inter, sans-serif';
  ctx.fillText('Річ на час', 88, 43);

  // Top Search Bar (#1)
  ctx.fillStyle = '#f1f5f9';
  ctx.beginPath();
  ctx.roundRect(260, 16, 460, 40, 8);
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#64748b';
  ctx.font = '14px Inter, sans-serif';
  ctx.fillText('Пошук речей для оренди...', 280, 41);

  // Top Search Button (#1)
  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.roundRect(634, 20, 82, 32, 6);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 13px Inter, sans-serif';
  ctx.fillText('Пошук', 654, 41);

  // City selector
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(740, 16, 150, 40, 8);
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.font = '500 14px Inter, sans-serif';
  ctx.fillText('Київ ▾', 760, 41);

  // CTA Button
  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.roundRect(1060, 16, 180, 40, 8);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 14px Inter, sans-serif';
  ctx.fillText('+ Здати в оренду', 1086, 41);

  // Hero section
  ctx.fillStyle = '#eff6ff';
  ctx.beginPath();
  ctx.roundRect(40, 96, 1200, 160, 16);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 30px Inter, sans-serif';
  ctx.fillText('Орендуйте потрібні речі поруч з вами', 80, 154);
  ctx.fillStyle = '#475569';
  ctx.font = '16px Inter, sans-serif';
  ctx.fillText('Інструменти, техніка, спорттовари та спорядження без переплат', 80, 190);

  // Duplicate Search Bar (#2) - intentionally present for demo scenario!
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(40, 286, 1200, 74, 12);
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.roundRect(60, 301, 860, 44, 8);
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.stroke();
  ctx.fillStyle = '#64748b';
  ctx.font = '15px Inter, sans-serif';
  ctx.fillText('Що шукаєте? Наприклад: перфоратор, велосипед, камера...', 80, 328);

  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.roundRect(940, 301, 140, 44, 8);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 15px Inter, sans-serif';
  ctx.fillText('Пошук', 986, 328);

  // Section title
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px Inter, sans-serif';
  ctx.fillText('Популярні пропозиції', 40, 412);

  // Rental Cards
  const cards = [
    { title: 'Перфоратор Bosch GBH 2-26', price: '280 ₴ / доба', city: 'Київ, Поділ', color: '#dbeafe' },
    { title: 'Гірський велосипед Trek', price: '450 ₴ / доба', city: 'Київ, Оболонь', color: '#dcfce7' },
    { title: 'Камера Sony Alpha A7 III', price: '950 ₴ / доба', city: 'Київ, Центр', color: '#fef3c7' },
    { title: 'Туристичний намет 4-місний', price: '320 ₴ / доба', city: 'Київ, Печерськ', color: '#f3e8ff' },
  ];

  cards.forEach((c, idx) => {
    const cx = 40 + idx * 305;
    const cy = 434;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(cx, cy, 285, 340, 12);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();

    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.roundRect(cx + 12, cy + 12, 261, 170, 8);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = '600 16px Inter, sans-serif';
    ctx.fillText(c.title, cx + 16, cy + 214);

    ctx.fillStyle = '#2563eb';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.fillText(c.price, cx + 16, cy + 248);

    ctx.fillStyle = '#64748b';
    ctx.font = '13px Inter, sans-serif';
    ctx.fillText(c.city, cx + 16, cy + 278);

    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.roundRect(cx + 16, cy + 294, 253, 32, 6);
    ctx.fill();
    ctx.fillStyle = '#334155';
    ctx.font = '600 13px Inter, sans-serif';
    ctx.fillText('Забронювати', cx + 96, cy + 315);
  });

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width,
    height,
  };
}

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(amount);
}

export function normalizeSearchText(text: string): string {
  if (!text) return '';
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeSupplyCode(s: string): string {
  let trimmed = s.trim().toUpperCase();
  if (!trimmed) return "";
  if (trimmed.startsWith('SUM-')) {
    trimmed = trimmed.substring(4);
  }
  // Remove leading zeros as long as the string has something left
  trimmed = trimmed.replace(/^0+(?!$)/, '');
  return `SUM-${trimmed}`;
}

export const render3DPieChartToDataURL = (
  data: { name: string; value: number; color: string }[],
  title: string
): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 450;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  
  // White background for the PDF
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, canvas.width / 2, 40);

  const cx = canvas.width / 2;
  const cy = 200;
  const rx = 180;
  const ry = 90;
  const h = 45;

  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return '';

  const darkenColor = (color: string, amount: number) => {
    let c = color.substring(1);
    // Expand 3-digit hex
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    let rgb = parseInt(c, 16);
    let r = Math.max(0, (rgb >> 16) - amount);
    let g = Math.max(0, ((rgb >> 8) & 0x00FF) - amount);
    let b = Math.max(0, (rgb & 0x0000FF) - amount);
    return '#' + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
  };

  // Draw layers from bottom to top
  for (let y = cy + h; y >= cy; y -= 1) {
    let currentAngle = 0;
    data.forEach(slice => {
      const sliceAngle = (slice.value / total) * Math.PI * 2;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      currentAngle = endAngle;

      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.ellipse(cx, y, rx, ry, 0, startAngle, endAngle);
      ctx.lineTo(cx, y);
      
      if (y > cy) {
        ctx.fillStyle = darkenColor(slice.color, 40);
      } else {
        ctx.fillStyle = slice.color;
      }
      ctx.fill();
      
      if (y === cy) {
         ctx.strokeStyle = '#ffffff';
         ctx.lineWidth = 1.5;
         ctx.stroke();
      }
    });
  }

  // Draw legends - wrapped if needed
  ctx.textAlign = 'left';
  
  const legendItems = data.map(slice => {
    const pct = ((slice.value / total) * 100).toFixed(1);
    const text = `${slice.name} (${pct}%)`;
    ctx.font = '14px sans-serif';
    const width = 15 + 10 + ctx.measureText(text).width + 20; // box + space + text + padding
    return { text, color: slice.color, width };
  });

  // The 3D pie's bottom edge reaches cy + h + ry = 200 + 45 + 90 = 335.
  // Start the legend below this point.
  let legendY = cy + h + ry + 30; // 365
  
  // Arrange items in rows
  let rows: {text: string, color: string, width: number}[][] = [[]];
  let currentRowWidth = 0;
  
  legendItems.forEach(item => {
    if (currentRowWidth + item.width > canvas.width - 40 && rows[rows.length - 1].length > 0) {
       rows.push([item]);
       currentRowWidth = item.width;
    } else {
       rows[rows.length - 1].push(item);
       currentRowWidth += item.width;
    }
  });

  rows.forEach(row => {
    const rowWidth = row.reduce((sum, item) => sum + item.width, 0);
    let legendX = (canvas.width - rowWidth) / 2;
    
    row.forEach(item => {
        ctx.fillStyle = item.color;
        ctx.fillRect(legendX, legendY - 12, 15, 15);
        ctx.fillStyle = '#0f172a';
        ctx.fillText(item.text, legendX + 25, legendY);
        legendX += item.width;
    });
    legendY += 25;
  });

  return canvas.toDataURL('image/png');
};

export function getMonthFollowing(dateString: string): string {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length < 2) return '';
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  return `${nextYear}-${nextMonth.toString().padStart(2, '0')}`;
}

export function getMonthOf(dateString: string): string {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length < 2) return '';
  return `${parts[0]}-${parts[1]}`;
}

export function getExonerationClassification(
  comites: any[] | undefined,
  supplyCode: string | undefined,
  mes: string | undefined
): 'PRE_EXONERATION' | 'EXONERATED' | 'POST_EXONERATION' | 'NORMAL' {
  if (!comites || !supplyCode || !mes) return 'NORMAL';
  
  // Find all committees where this supply was exonerated
  const relevantComites = comites.filter(comite => {
    const members = [
      comite.presidente,
      comite.secretario,
      comite.tesorero,
      comite.fiscalizador,
      comite.vocal
    ].filter(Boolean);
    return members.some(m => m.supplyCodeExonerado === supplyCode);
  });
  
  if (relevantComites.length === 0) return 'NORMAL';
  
  // Sort them chronologically by fechaInicio
  relevantComites.sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
  
  let isWithin = false;
  let isPre = false;
  let isPost = false;
  
  for (const comite of relevantComites) {
    const exStart = getMonthFollowing(comite.fechaInicio);
    const exEnd = getMonthOf(comite.fechaFin);
    
    if (mes >= exStart && mes <= exEnd) {
      isWithin = true;
      break;
    } else if (mes < exStart) {
      isPre = true;
    } else if (mes > exEnd) {
      isPost = true;
    }
  }
  
  if (isWithin) return 'EXONERATED';
  if (isPre && !isPost) return 'PRE_EXONERATION';
  if (isPost) return 'POST_EXONERATION';
  return 'NORMAL';
}

export function genericCompare<T>(
  a: T,
  b: T,
  keyOrResolver: string | ((item: T) => any),
  direction: 'asc' | 'desc' = 'asc'
): number {
  let valA = typeof keyOrResolver === 'function' ? keyOrResolver(a) : (a as any)[keyOrResolver];
  let valB = typeof keyOrResolver === 'function' ? keyOrResolver(b) : (b as any)[keyOrResolver];

  if (valA === undefined || valA === null) valA = '';
  if (valB === undefined || valB === null) valB = '';

  let comparison = 0;

  // Let's determine the type/key string representation to check rules
  const keyStr = typeof keyOrResolver === 'string' ? keyOrResolver.toLowerCase() : '';

  // Rule 1: Suministro (e.g., SUM-0001, SUM-12, SUM-2, 12, etc.)
  if (keyStr.includes('suministro') || keyStr === 'codigo' || keyStr === 'suministros' || keyStr.includes('supply') || keyStr.includes('code')) {
    // If it's an array of suministros, take the first one
    const strA = Array.isArray(valA) ? (valA[0] || '') : String(valA);
    const strB = Array.isArray(valB) ? (valB[0] || '') : String(valB);
    const numA = parseInt(strA.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(strB.replace(/\D/g, ''), 10) || 0;
    if (numA !== numB) {
      comparison = numA - numB;
    } else {
      comparison = strA.localeCompare(strB, 'es', { numeric: true });
    }
  }
  // Rule 2: DNI or RUC (numerical comparison)
  else if (keyStr === 'dni' || keyStr === 'ruc') {
    const numA = parseFloat(String(valA).replace(/\D/g, '')) || 0;
    const numB = parseFloat(String(valB).replace(/\D/g, '')) || 0;
    comparison = numA - numB;
  }
  // Rule 4: Dates (from oldest to newest)
  else if (
    keyStr.includes('fecha') || 
    keyStr === 'mes' || 
    keyStr === 'mespagado' ||
    keyStr === 'periodo' ||
    (typeof valA === 'string' && !isNaN(Date.parse(valA)) && valA.includes('-') && valA.length >= 7)
  ) {
    const dateA = new Date(valA).getTime() || 0;
    const dateB = new Date(valB).getTime() || 0;
    comparison = dateA - dateB;
  }
  // Rule 3: Names, Lastnames, Razón Social or alphabetical strings
  else if (typeof valA === 'string' && typeof valB === 'string') {
    comparison = valA.localeCompare(valB, 'es', { sensitivity: 'base', numeric: true });
  }
  // Rule 5: Any other field (e.g. numbers, booleans)
  else {
    if (valA < valB) comparison = -1;
    else if (valA > valB) comparison = 1;
    else comparison = 0;
  }

  return direction === 'asc' ? comparison : -comparison;
}



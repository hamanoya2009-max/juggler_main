// ========================================
// JUGGLER MAIN — graph.js
// 月間連結スランプグラフ
// ========================================

const GAS_URL = 'https://script.google.com/macros/s/AKfycbwMliehrkydhGBzOqjfqKbVz7xpZzWyADa8xb7NmM2yNXrWYoO_WVr3raXeEBhd8i5iXw/exec';

// ========================================
// 状態
// ========================================
let machineNo  = null;
let modelInfo  = null;
let currentYear  = null;
let currentMonth = null;

// ========================================
// 初期化
// ========================================
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  machineNo = params.get('no');

  if (!machineNo) {
    setStatus('error');
    showError('台番号が指定されていません');
    return;
  }

  // 機種情報を取得
  modelInfo = MODELS.find(m => m.machines.includes(Number(machineNo))) || null;

  // ヘッダー設定
  document.title = `台${machineNo} — JUGGLER MAIN`;
  document.getElementById('graphTitle').textContent =
    `No.${String(machineNo).padStart(2,'0')} ${modelInfo ? modelInfo.short : ''}`;
  document.getElementById('graphSub').textContent =
    modelInfo ? modelInfo.name : '不明';

  // 戻るボタンのリンクを機種ページに
  if (modelInfo) {
    document.getElementById('backBtn').href = `${MODEL_BASE}?model=${modelInfo.key}`;
  }

  // 今月をデフォルトに
  const now = new Date();
  currentYear  = now.getFullYear();
  currentMonth = now.getMonth() + 1;

  initMonthNav();
  loadGraph();
});

// ========================================
// 月ナビ
// ========================================
function initMonthNav() {
  updateMonthLabel();
  document.getElementById('monthPrev').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    updateMonthLabel();
    loadGraph();
  });
  document.getElementById('monthNext').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    updateMonthLabel();
    loadGraph();
  });
}

function updateMonthLabel() {
  document.getElementById('monthLabel').textContent =
    `${currentYear}年 ${currentMonth}月`;
}

// ========================================
// ステータス
// ========================================
function setStatus(s) {
  const dot = document.getElementById('statusDot');
  const map = {
    loading: { text: '● LOADING', cls: '' },
    ready:   { text: '● READY',   cls: 'ready loaded' },
    error:   { text: '✕ ERROR',   cls: 'error' },
  };
  const item = map[s] || map.ready;
  dot.textContent = item.text;
  dot.className = `header-status ${item.cls}`;
}

function showError(msg) {
  const wrap = document.getElementById('graphWrap');
  wrap.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">✕</div>
      <div class="empty-text">${msg}</div>
    </div>
  `;
}

// ========================================
// GASからgraph_dataを取得
// ========================================
async function loadGraph() {
  const wrap = document.getElementById('graphWrap');
  const summary = document.getElementById('daySummary');

  wrap.innerHTML = `
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <div class="loading-text">LOADING...</div>
    </div>
  `;
  summary.style.display = 'none';
  setStatus('loading');

  const monthStr = `${currentYear}/${String(currentMonth).padStart(2,'0')}`;

  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'getGraphData',
        machineNo: machineNo,
        month: monthStr,
      }),
      redirect: 'follow',
    });
    const json = await res.json();

    if (!json.success) throw new Error(json.error || 'データ取得失敗');

    const data = json.data; // { "2026/05/01": [{g,diff}, ...], ... }
    const dates = Object.keys(data).sort();

    if (dates.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">◌</div>
          <div class="empty-text">データなし</div>
          <div class="empty-sub">${currentYear}年${currentMonth}月のデータがありません</div>
        </div>
      `;
      setStatus('ready');
      return;
    }

    renderGraph(data, dates);
    renderDaySummary(data, dates);
    setStatus('ready');

  } catch (e) {
    showError(e.message);
    setStatus('error');
  }
}

// ========================================
// グラフ描画
// ========================================
function renderGraph(data, dates) {
  const wrap = document.getElementById('graphWrap');

  // 連結データ生成（前日終値をオフセットとして累積）
  const combined = [];
  const dayBoundaries = [];
  let xOffset = 0;
  let yOffset = 0;

  dates.forEach((date, di) => {
    const points = data[date]; // [{g, diff}, ...]
    dayBoundaries.push({ x: xOffset, date: date, yStart: yOffset });

    points.forEach(p => {
      combined.push({
        x: xOffset + p.g,
        y: yOffset + p.diff,
        date: date,
        dayIndex: di,
      });
    });

    // 終値を取得してオフセット更新
    const lastPoint = points[points.length - 1];
    xOffset += lastPoint.g;
    yOffset += lastPoint.diff;
  });

  if (combined.length === 0) return;

  // SVGサイズ
  const W = 800, H = 380;
  const ML = 52, MR = 16, MT = 24, MB = 44;
  const plotW = W - ML - MR;
  const plotH = H - MT - MB;

  const totalG = combined[combined.length - 1].x;
  const minY = Math.min(...combined.map(p => p.y));
  const maxY = Math.max(...combined.map(p => p.y));
  const yRange = Math.max(maxY - minY, 100);
  const yPad = yRange * 0.1;

  const toX = g => ML + (g / totalG) * plotW;
  const toY = v => MT + plotH - ((v - (minY - yPad)) / (yRange + yPad * 2)) * plotH;
  const zeroY = toY(0);

  // Yグリッド目盛り
  const yStep = yRange > 5000 ? 1000 : yRange > 2000 ? 500 : yRange > 500 ? 200 : 100;
  const yTickStart = Math.ceil((minY - yPad) / yStep) * yStep;
  const yTickEnd   = Math.floor((maxY + yPad) / yStep) * yStep;
  const yTicks = [];
  for (let v = yTickStart; v <= yTickEnd; v += yStep) yTicks.push(v);

  // X軸ラベル（日付境界）
  const modelColor = modelInfo
    ? getComputedStyle(document.documentElement)
        .getPropertyValue('--model-color') || '#00e5ff'
    : '#00e5ff';

  // パス生成
  const linePath = combined.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${toX(p.x).toFixed(1)},${toY(p.y).toFixed(1)}`
  ).join(' ');

  // エリアパス
  const areaPath = [
    `M${toX(combined[0].x).toFixed(1)},${zeroY.toFixed(1)}`,
    ...combined.map(p => `L${toX(p.x).toFixed(1)},${toY(p.y).toFixed(1)}`),
    `L${toX(combined[combined.length-1].x).toFixed(1)},${zeroY.toFixed(1)}`,
    'Z'
  ].join(' ');

  // 最大・最小点
  const maxPt = combined.reduce((a,b) => a.y > b.y ? a : b);
  const minPt = combined.reduce((a,b) => a.y < b.y ? a : b);
  const lastPt = combined[combined.length - 1];

  // グリッドHTML
  let gridLines = yTicks.map(v => `
    <line x1="${ML}" y1="${toY(v).toFixed(1)}" x2="${W-MR}" y2="${toY(v).toFixed(1)}"
      stroke="${v === 0 ? '#1e4060' : '#111825'}"
      stroke-width="${v === 0 ? 1.5 : 0.5}"/>
    <text x="${ML-4}" y="${(toY(v)+4).toFixed(1)}"
      text-anchor="end" font-size="8"
      fill="${v === 0 ? '#00e5ff' : '#3d4f63'}">
      ${v >= 0 ? '+' : ''}${v}
    </text>
  `).join('');

  // 日境界線・日付ラベル
  let boundaryLines = dayBoundaries.map((b, i) => {
    const x = toX(b.x).toFixed(1);
    const nextX = i < dayBoundaries.length - 1
      ? toX(dayBoundaries[i+1].x)
      : W - MR;
    const midX = ((parseFloat(x) + nextX) / 2).toFixed(1);
    const dayLabel = b.date.split('/')[2]; // DD部分のみ
    return `
      ${i > 0 ? `<line x1="${x}" y1="${MT}" x2="${x}" y2="${H-MB}"
        stroke="#1a2535" stroke-width="0.5" stroke-dasharray="2,3"/>` : ''}
      <text x="${midX}" y="${H-MB+14}"
        text-anchor="middle" font-size="8" fill="#3d4f63">${dayLabel}</text>
    `;
  }).join('');

  // 日境界の終値点
  let endPoints = dayBoundaries.map((b, i) => {
    if (i === 0) return '';
    const cx = toX(b.x).toFixed(1);
    const cy = toY(b.yStart).toFixed(1);
    return `<circle cx="${cx}" cy="${cy}" r="2.5" fill="#ff2d6b" stroke="#000" stroke-width="0.5"/>`;
  }).join('');

  const color = modelInfo ? {
    neo: '#ff9500', gg3: '#00e5ff', my5: '#7fff00',
    mr: '#ff2d6b', gss: '#bf5fff', umj: '#00ffcc',
    fk2: '#ffcc00', hp8: '#ff6b6b'
  }[modelInfo.key] || '#00e5ff' : '#00e5ff';

  wrap.innerHTML = `
    <div class="graph-scroll">
      <svg width="100%" viewBox="0 0 ${W} ${H}" style="display:block">

        ${gridLines}

        <line x1="${ML}" y1="${zeroY.toFixed(1)}" x2="${W-MR}" y2="${zeroY.toFixed(1)}"
          stroke="#1a3050" stroke-width="1"/>

        ${boundaryLines}

        <path d="${areaPath}" fill="${color}" fill-opacity="0.07"/>
        <path d="${linePath}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>

        ${endPoints}

        <!-- 最大値 -->
        <circle cx="${toX(maxPt.x).toFixed(1)}" cy="${toY(maxPt.y).toFixed(1)}"
          r="3" fill="#ffd600"/>
        <text x="${toX(maxPt.x).toFixed(1)}" y="${(toY(maxPt.y)-6).toFixed(1)}"
          text-anchor="middle" font-size="8" fill="#ffd600">
          +${Math.round(maxPt.y)}
        </text>

        <!-- 最小値 -->
        <circle cx="${toX(minPt.x).toFixed(1)}" cy="${toY(minPt.y).toFixed(1)}"
          r="3" fill="#ff2d6b"/>
        <text x="${toX(minPt.x).toFixed(1)}" y="${(toY(minPt.y)+14).toFixed(1)}"
          text-anchor="middle" font-size="8" fill="#ff2d6b">
          ${Math.round(minPt.y)}
        </text>

        <!-- 現在値 -->
        <circle cx="${toX(lastPt.x).toFixed(1)}" cy="${toY(lastPt.y).toFixed(1)}"
          r="3.5" fill="${color}" stroke="#000" stroke-width="0.5"/>

        <!-- 枠線 -->
        <rect x="${ML}" y="${MT}" width="${plotW}" height="${plotH}"
          fill="none" stroke="#1c1c2e" stroke-width="0.5"/>

      </svg>
    </div>
  `;
}

// ========================================
// 日別サマリー描画
// ========================================
function renderDaySummary(data, dates) {
  const summary = document.getElementById('daySummary');
  const grid = document.getElementById('dayGrid');
  const totalEl = document.getElementById('monthlyTotal');
  summary.style.display = 'block';

  const color = modelInfo ? {
    neo: '#ff9500', gg3: '#00e5ff', my5: '#7fff00',
    mr: '#ff2d6b', gss: '#bf5fff', umj: '#00ffcc',
    fk2: '#ffcc00', hp8: '#ff6b6b'
  }[modelInfo.key] || '#00e5ff' : '#00e5ff';

  let cumulative = 0;
  let totalG = 0;
  grid.innerHTML = '';

  dates.forEach(date => {
    const points = data[date];
    const lastPt = points[points.length - 1];
    const maxDiff = Math.max(...points.map(p => p.diff));
    const minDiff = Math.min(...points.map(p => p.diff));
    const endVal = lastPt.diff;
    const games = lastPt.g;
    cumulative += endVal;
    totalG += games;

    const dayLabel = date.split('/')[2];
    const endColor = endVal >= 0 ? '#7fff00' : '#ff2d6b';
    const cumColor = cumulative >= 0 ? '#00aa55' : '#aa2244';

    const item = document.createElement('div');
    item.className = 'day-item';
    item.style.borderLeftColor = color;
    item.innerHTML = `
      <div class="day-item-date" style="color:${color}">${date.slice(5)}</div>
      <div class="day-item-games">${games.toLocaleString()}G</div>
      <div class="day-item-end" style="color:${endColor}">
        ${endVal >= 0 ? '+' : ''}${endVal}
      </div>
      <div class="day-item-cum" style="color:${cumColor}">
        累: ${cumulative >= 0 ? '+' : ''}${Math.round(cumulative)}
      </div>
    `;
    grid.appendChild(item);
  });

  const totalColor = cumulative >= 0 ? '#7fff00' : '#ff2d6b';
  totalEl.innerHTML = `
    <span class="total-label">月間合計</span>
    <span class="total-val" style="color:${totalColor}">
      ${cumulative >= 0 ? '+' : ''}${Math.round(cumulative)}枚
    </span>
    <span class="total-g">${totalG.toLocaleString()}G</span>
    <span class="total-days">${dates.length}日</span>
  `;
}

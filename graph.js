// ========================================
// JUGGLER MAIN — graph.js
// 月間連結スランプグラフ
// ========================================

const GAS_URL = 'https://script.google.com/macros/s/AKfycbwMliehrkydhGBzOqjfqKbVz7xpZzWyADa8xb7NmM2yNXrWYoO_WVr3raXeEBhd8i5iXw/exec';

// ========================================
// 状態
// ========================================
let machineNo    = null;
let modelInfo    = null;
let currentYear  = null;
let currentMonth = null;
let selectedDay  = null;
let graphData    = null;
let graphDates   = null;
let rawDataMap   = null; // 日付 → { big, reg, totalGames }

// ========================================
// ゴーゴージャグラー3 固定値
// ========================================
const GG3_CONSTANTS = {
  BIG_PAYOUT:     240,    // BIG払い出し枚数
  REG_PAYOUT:     96,     // REG払い出し枚数
  REPLAY_PROB:    7.3,    // リプレイ確率（1/7.3）
  CHERRY_PROB:    33,     // チェリー確率（1/33）
  CHERRY_PAYOUT:  1,      // チェリー払い出し（適当打ち・平均1枚）
  GRAPE_PAYOUT:   8,      // ブドウ払い出し枚数
  BET:            3,      // 通常遊技投入枚数
};

// ブドウ確率の設定別閾値（設定間の中間値で区切る）
const GG3_GRAPE_SETTINGS = [
  { setting: 1, prob: 7.76 },
  { setting: 2, prob: 7.63 },
  { setting: 3, prob: 7.52 },
  { setting: 4, prob: 7.27 },
  { setting: 5, prob: 6.86 },
  { setting: 6, prob: 6.37 },
];

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

  modelInfo = MODELS.find(m => m.machines.includes(Number(machineNo))) || null;

  document.title = `台${machineNo} — JUGGLER MAIN`;
  document.getElementById('graphTitle').textContent =
    `No.${String(machineNo).padStart(2,'0')} ${modelInfo ? modelInfo.short : ''}`;
  document.getElementById('graphSub').textContent =
    modelInfo ? modelInfo.name : '不明';

  if (modelInfo) {
    document.getElementById('backBtn').href = `${MODEL_BASE}?model=${modelInfo.key}`;
  }

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
    selectedDay = null;
    updateMonthLabel();
    loadGraph();
  });
  document.getElementById('monthNext').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    selectedDay = null;
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
  document.getElementById('graphWrap').innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">✕</div>
      <div class="empty-text">${msg}</div>
    </div>
  `;
}

// ========================================
// モデルカラー取得
// ========================================
function getModelColor() {
  if (!modelInfo) return '#00e5ff';
  return {
    neo: '#ff9500', gg3: '#00e5ff', my5: '#7fff00',
    mr:  '#ff2d6b', gss: '#bf5fff', umj: '#00ffcc',
    fk2: '#ffcc00', hp8: '#ff6b6b'
  }[modelInfo.key] || '#00e5ff';
}

// ========================================
// GASからgraph_data + raw_dataを取得
// ========================================
async function loadGraph() {
  const wrap    = document.getElementById('graphWrap');
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
        action:    'getGraphData',
        machineNo: machineNo,
        month:     monthStr,
      }),
      redirect: 'follow',
    });
    const json = await res.json();

    if (!json.success) throw new Error(json.error || 'データ取得失敗');

    const data  = json.data;
    const dates = Object.keys(data).sort();

    // raw_dataを状態に保存（ない場合は空オブジェクト）
    rawDataMap = json.rawData || {};

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

    graphData  = data;
    graphDates = dates;

    renderGraph(data, dates, selectedDay);
    renderDaySummary(data, dates);
    setStatus('ready');

  } catch (e) {
    showError(e.message);
    setStatus('error');
  }
}

// ========================================
// ブドウ確率逆算（GG3専用）
// ========================================
function calcGrapeProb(date, graphPoints) {
  // raw_dataがない場合は計算不可
  const raw = rawDataMap ? rawDataMap[date] : null;
  if (!raw) return null;

  const { big, reg, totalGames } = raw;
  if (!totalGames || totalGames < 1000) return null;

  const C = GG3_CONSTANTS;

  // 実質投入枚数（リプレイ分を除く）
  const replayCount    = totalGames / C.REPLAY_PROB;
  const actualInserted = (totalGames - replayCount) * C.BET;

  // グラフの終値（差枚）を使用
  const lastPt  = graphPoints[graphPoints.length - 1];
  // graphPointsのdiffは当日相対値（0起点）なのでそのまま使う
  const diffVal = lastPt.diff;

  // 総払い出し
  const totalPayout = diffVal + actualInserted;

  // ボーナス払い出し
  const bonusPayout = big * C.BIG_PAYOUT + reg * C.REG_PAYOUT;

  // チェリー払い出し（適当打ち・平均1枚）
  const cherryPayout = (totalGames / C.CHERRY_PROB) * C.CHERRY_PAYOUT;

  // ブドウ払い出し
  const grapePayout = totalPayout - bonusPayout - cherryPayout;
  if (grapePayout <= 0) return null;

  // ブドウ回数・確率
  const grapeCount = grapePayout / C.GRAPE_PAYOUT;
  const grapeProb  = totalGames / grapeCount;

  return grapeProb;
}

// ========================================
// ブドウ確率から最近似設定を判定
// ========================================
function estimateSetting(grapeProb) {
  // 各設定との差が最小のものを選ぶ
  let nearest = GG3_GRAPE_SETTINGS[0];
  let minDiff = Math.abs(grapeProb - nearest.prob);

  for (const s of GG3_GRAPE_SETTINGS) {
    const d = Math.abs(grapeProb - s.prob);
    if (d < minDiff) {
      minDiff = d;
      nearest = s;
    }
  }

  // 隣の設定との差も見て「付近」か「〜」か判定
  const idx = GG3_GRAPE_SETTINGS.indexOf(nearest);
  const prevS = GG3_GRAPE_SETTINGS[idx - 1];
  const nextS = GG3_GRAPE_SETTINGS[idx + 1];

  // 上下の設定との中間値を閾値にして境界付近か判定
  const borderThreshold = 0.08; // この値以内なら「設定X-Y」表示
  let label = `設定${nearest.setting}付近`;

  if (prevS && Math.abs(grapeProb - (nearest.prob + prevS.prob) / 2) < borderThreshold) {
    label = `設定${prevS.setting}-${nearest.setting}`;
  } else if (nextS && Math.abs(grapeProb - (nearest.prob + nextS.prob) / 2) < borderThreshold) {
    label = `設定${nearest.setting}-${nextS.setting}`;
  }

  return label;
}

// ========================================
// ブドウ表示用オブジェクト生成
// ========================================
function buildGrapeDisplay(date, graphPoints) {
  // GG3のみ対応
  if (!modelInfo || modelInfo.key !== 'gg3') return null;

  const raw = rawDataMap ? rawDataMap[date] : null;
  if (!raw || !raw.totalGames || raw.totalGames < 1000) return null;

  const grapeProb = calcGrapeProb(date, graphPoints);
  if (grapeProb === null || grapeProb <= 0) return null;

  const totalGames = raw.totalGames;
  const probText   = `1/${grapeProb.toFixed(1)}`;
  const settingLabel = estimateSetting(grapeProb);

  // G数に応じて色を変える
  let color, confidence;
  if (totalGames >= 3000) {
    color      = '#ffd600'; // 黄色
    confidence = 'high';
  } else if (totalGames >= 2000) {
    color      = '#00e5ff'; // 水色
    confidence = 'mid';
  } else {
    color      = '#6a8aaa'; // グレー
    confidence = 'low';
  }

  return { probText, settingLabel, color, confidence, totalGames };
}

// ========================================
// グラフ描画
// ========================================
function renderGraph(data, dates, highlightDate) {
  const wrap = document.getElementById('graphWrap');
  const color = getModelColor();

  // 連結データ生成
  const combined = [];
  const dayBoundaries = [];
  let xOffset = 0;
  let yOffset = 0;

  dates.forEach((date, di) => {
    const points = data[date];
    dayBoundaries.push({ x: xOffset, date, yStart: yOffset, dayIndex: di });

    points.forEach(p => {
      combined.push({
        x: xOffset + p.g,
        y: yOffset + p.diff,
        date,
        dayIndex: di,
      });
    });

    const lastPt = points[points.length - 1];
    xOffset += lastPt.g;
    yOffset += lastPt.diff;
  });

  if (combined.length === 0) return;

  // SVGサイズ
  const W = 800, H = 380;
  const ML = 52, MR = 16, MT = 24, MB = 44;
  const plotW = W - ML - MR;
  const plotH = H - MT - MB;

  const totalG = combined[combined.length - 1].x;
  const minY   = Math.min(...combined.map(p => p.y));
  const maxY   = Math.max(...combined.map(p => p.y));
  const yRange = Math.max(maxY - minY, 100);
  const yPad   = yRange * 0.1;

  // ゼロラインが常に範囲内に収まるよう調整
  const yMin = Math.min(minY - yPad, -yPad);
  const yMax = Math.max(maxY + yPad,  yPad);
  const ySpan = yMax - yMin;

  const toX = g => ML + (g / totalG) * plotW;
  const toY = v => MT + plotH - ((v - yMin) / ySpan) * plotH;
  const zeroY = toY(0);

  // Yグリッド
  const yStep = yRange > 5000 ? 1000 : yRange > 2000 ? 500 : yRange > 500 ? 200 : 100;
  const yTicks = [];
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= Math.floor(yMax / yStep) * yStep; v += yStep) {
    yTicks.push(v);
  }

  // 日別にポイントをグループ化
  const dayGroups = {};
  dates.forEach(d => { dayGroups[d] = []; });
  combined.forEach(p => dayGroups[p.date].push(p));

  // グリッド線
  const gridLines = yTicks.map(v => `
    <line x1="${ML}" y1="${toY(v).toFixed(1)}" x2="${W-MR}" y2="${toY(v).toFixed(1)}"
      stroke="${v === 0 ? '#1e4060' : '#111825'}"
      stroke-width="${v === 0 ? 1.5 : 0.5}"/>
    <text x="${ML-4}" y="${(toY(v)+4).toFixed(1)}"
      text-anchor="end" font-size="8"
      fill="${v === 0 ? '#00e5ff' : '#3d4f63'}">
      ${v >= 0 ? '+' : ''}${v}
    </text>
  `).join('');

  // 日境界線・X軸日付ラベル
  const boundaryLines = dayBoundaries.map((b, i) => {
    const x = toX(b.x).toFixed(1);
    const nextX = i < dayBoundaries.length - 1 ? toX(dayBoundaries[i+1].x) : W - MR;
    const midX  = ((parseFloat(x) + nextX) / 2).toFixed(1);
    const dayLabel = b.date.split('/')[2];
    const isHighlight = highlightDate === b.date;
    return `
      ${i > 0 ? `<line x1="${x}" y1="${MT}" x2="${x}" y2="${H-MB}"
        stroke="${isHighlight ? color : '#1a2535'}"
        stroke-width="${isHighlight ? 1 : 0.5}"
        stroke-dasharray="2,3"/>` : ''}
      <text x="${midX}" y="${H-MB+14}"
        text-anchor="middle" font-size="8"
        fill="${isHighlight ? color : '#3d4f63'}"
        font-weight="${isHighlight ? 'bold' : 'normal'}">${dayLabel}</text>
    `;
  }).join('');

  // 日別折れ線（ハイライト対応）
  const dayPaths = dates.map(date => {
    const pts = dayGroups[date];
    if (pts.length === 0) return '';

    const isSelected   = highlightDate === date;
    const hasSelection = highlightDate !== null;
    const lineColor = isSelected ? color : hasSelection ? '#2a3040' : color;
    const lineWidth = isSelected ? 2.5 : hasSelection ? 0.8 : 1.5;
    const opacity   = isSelected ? 1 : hasSelection ? 0.3 : 1;

    const path = pts.map((p, i) =>
      `${i === 0 ? 'M' : 'L'}${toX(p.x).toFixed(1)},${toY(p.y).toFixed(1)}`
    ).join(' ');

    const area = [
      `M${toX(pts[0].x).toFixed(1)},${zeroY.toFixed(1)}`,
      ...pts.map(p => `L${toX(p.x).toFixed(1)},${toY(p.y).toFixed(1)}`),
      `L${toX(pts[pts.length-1].x).toFixed(1)},${zeroY.toFixed(1)}`,
      'Z'
    ].join(' ');

    return `
      <path d="${area}" fill="${lineColor}" fill-opacity="${isSelected ? 0.12 : hasSelection ? 0.02 : 0.07}"/>
      <path d="${path}" fill="none" stroke="${lineColor}"
        stroke-width="${lineWidth}" stroke-linejoin="round" opacity="${opacity}"/>
    `;
  }).join('');

  // 日境界の終値点
  const endPoints = dayBoundaries.map((b, i) => {
    if (i === 0) return '';
    const isHighlight = highlightDate === b.date || highlightDate === dates[i-1];
    return `<circle cx="${toX(b.x).toFixed(1)}" cy="${toY(b.yStart).toFixed(1)}"
      r="${isHighlight ? 3.5 : 2.5}"
      fill="${isHighlight ? color : '#ff2d6b'}"
      stroke="#000" stroke-width="0.5" opacity="${highlightDate && !isHighlight ? 0.3 : 1}"/>`;
  }).join('');

  // 最大・最小点
  const maxPt  = combined.reduce((a,b) => a.y > b.y ? a : b);
  const minPt  = combined.reduce((a,b) => a.y < b.y ? a : b);
  const lastPt = combined[combined.length - 1];

  // 最大値ラベルのY位置（上端クリップ回避）
  const maxLabelY = Math.max(toY(maxPt.y) - 6, MT + 10);
  // 最小値ラベルのY位置（下端クリップ回避）
  const minLabelY = Math.min(toY(minPt.y) + 14, H - MB - 2);

  wrap.innerHTML = `
    <div class="graph-scroll">
      <svg width="100%" viewBox="0 0 ${W} ${H}" style="display:block">
        ${gridLines}
        <line x1="${ML}" y1="${zeroY.toFixed(1)}" x2="${W-MR}" y2="${zeroY.toFixed(1)}"
          stroke="#1a3050" stroke-width="1"/>
        ${boundaryLines}
        ${dayPaths}
        ${endPoints}

        <!-- 最大値 -->
        <circle cx="${toX(maxPt.x).toFixed(1)}" cy="${toY(maxPt.y).toFixed(1)}"
          r="3" fill="#ffd600"
          opacity="${highlightDate && highlightDate !== maxPt.date ? 0.3 : 1}"/>
        <text x="${toX(maxPt.x).toFixed(1)}" y="${maxLabelY.toFixed(1)}"
          text-anchor="middle" font-size="8" fill="#ffd600"
          opacity="${highlightDate && highlightDate !== maxPt.date ? 0.3 : 1}">
          +${Math.round(maxPt.y)}
        </text>

        <!-- 最小値 -->
        <circle cx="${toX(minPt.x).toFixed(1)}" cy="${toY(minPt.y).toFixed(1)}"
          r="3" fill="#ff2d6b"
          opacity="${highlightDate && highlightDate !== minPt.date ? 0.3 : 1}"/>
        <text x="${toX(minPt.x).toFixed(1)}" y="${minLabelY.toFixed(1)}"
          text-anchor="middle" font-size="8" fill="#ff2d6b"
          opacity="${highlightDate && highlightDate !== minPt.date ? 0.3 : 1}">
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
  const summary  = document.getElementById('daySummary');
  const grid     = document.getElementById('dayGrid');
  const totalEl  = document.getElementById('monthlyTotal');
  summary.style.display = 'block';

  const color = getModelColor();
  let cumulative = 0;
  let totalG     = 0;
  grid.innerHTML = '';

  dates.forEach(date => {
    const points = data[date];
    const lastPt = points[points.length - 1];
    const endVal = lastPt.diff;
    const games  = lastPt.g;
    cumulative += endVal;
    totalG     += games;

    const endColor = endVal >= 0 ? '#7fff00' : '#ff2d6b';
    const cumColor = cumulative >= 0 ? '#00aa55' : '#aa2244';

    // ブドウ逆算（GG3のみ・1000G以上）
    const grape = buildGrapeDisplay(date, points);

    const item = document.createElement('div');
    item.className = 'day-item';
    item.dataset.date = date;
    item.style.borderLeftColor = color;
    item.style.cursor = 'pointer';

    // ブドウ表示HTML
    let grapeHtml = '';
    if (grape) {
      grapeHtml = `
        <div class="day-item-grape" style="color:${grape.color}">
          🍇 ${grape.probText}
          <span class="day-item-grape-label" style="color:${grape.color}">${grape.settingLabel}</span>
        </div>
      `;
    }

    item.innerHTML = `
      <div class="day-item-date" style="color:${color}">${date.slice(5)}</div>
      <div class="day-item-games">${games.toLocaleString()}G</div>
      <div class="day-item-end" style="color:${endColor}">
        ${endVal >= 0 ? '+' : ''}${endVal}
      </div>
      <div class="day-item-cum" style="color:${cumColor}">
        累: ${cumulative >= 0 ? '+' : ''}${Math.round(cumulative)}
      </div>
      ${grapeHtml}
    `;

    // タップでハイライト
    item.addEventListener('click', () => {
      if (selectedDay === date) {
        selectedDay = null;
        item.classList.remove('day-item-active');
      } else {
        selectedDay = date;
        document.querySelectorAll('.day-item').forEach(el => {
          el.classList.remove('day-item-active');
        });
        item.classList.add('day-item-active');
      }
      renderGraph(graphData, graphDates, selectedDay);
    });

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

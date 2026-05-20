// ========================================
// JUGGLER MAIN — main.js
// ========================================

const GRAPH_BASE = 'https://hamanoya2009-max.github.io/juggler_main/graph.html';
const MODEL_BASE = 'https://hamanoya2009-max.github.io/juggler_main/model.html';

// ========================================
// 機種マスター
// ========================================
const MODELS = [
  {
    key: 'gg3',
    name: 'ゴーゴージャグラー3',
    short: 'GG3',
    cls: 'model-gg3',
    machines: [1,2,3,5,6,7,8,10,11,12,13,15,16,17,18,20,21,22,23,25,26,27,28,30,31,32]
  },
  {
    key: 'my5',
    name: 'マイジャグラーV',
    short: 'MY5',
    cls: 'model-my5',
    machines: [33,35,36,37,38,40,41,42,43,45,46,47,48,50,51,52,53,55,56,57,58,60,61,62]
  },
  {
    key: 'neo',
    name: 'ネオアイムジャグラーEX',
    short: 'NEO',
    cls: 'model-neo',
    machines: [63,65,66,67,68,70,71,72,73,75,76,77]
  },
  {
    key: 'mr',
    name: 'ミスタージャグラー',
    short: 'MR',
    cls: 'model-mr',
    machines: [78,80,81,82,83,85,86,87,88]
  },
  {
    key: 'gss',
    name: 'ジャグラーガールズSS',
    short: 'GSS',
    cls: 'model-gss',
    machines: [90,91,92,93,95,96,97,98,100,101]
  },
  {
    key: 'umj',
    name: 'ウルトラミラクルジャグラー',
    short: 'UMJ',
    cls: 'model-umj',
    machines: [102,103,105,106,108,110,111,128,130,131,132]
  },
  {
    key: 'fk2',
    name: 'ファンキージャグラー2',
    short: 'FK2',
    cls: 'model-fk2',
    machines: [133,135]
  },
  {
    key: 'hp8',
    name: 'ハッピージャグラーVIII',
    short: 'HP8',
    cls: 'model-hp8',
    machines: [136,137]
  },
];

// ========================================
// index.html: 機種カード描画
// ========================================
function renderModelGrid() {
  const grid = document.getElementById('modelGrid');
  if (!grid) return;

  MODELS.forEach((m, i) => {
    const card = document.createElement('a');
    card.className = `model-card ${m.cls}`;
    card.href = `${MODEL_BASE}?model=${encodeURIComponent(m.key)}`;
    card.style.animationDelay = `${i * 50}ms`;
    card.innerHTML = `
      <div class="model-card-short">${m.short}</div>
      <div class="model-card-name">${m.name}</div>
      <div class="model-card-count">${m.machines.length} MACHINES</div>
    `;
    grid.appendChild(card);
  });
}

// ========================================
// 初期化
// ========================================
document.addEventListener('DOMContentLoaded', () => {
  renderModelGrid();
});

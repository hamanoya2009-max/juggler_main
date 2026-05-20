// ========================================
// JUGGLER MAIN — model.js
// 機種別台番号リスト
// ========================================

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const key = params.get('model');
  const model = getModelByKey(key);

  if (!model) {
    document.getElementById('modelShort').textContent = 'NOT FOUND';
    document.getElementById('modelName').textContent = '機種が見つかりません';
    return;
  }

  // ヘッダー情報を設定
  document.title = `${model.short} — JUGGLER MAIN`;
  document.getElementById('modelShort').textContent = model.short;
  document.getElementById('modelName').textContent = model.name;

  // 台番号リスト描画
  const list = document.getElementById('machineList');
  model.machines.forEach((no, i) => {
    const row = document.createElement('div');
    row.className = `machine-row ${model.cls}`;
    row.style.animationDelay = `${i * 30}ms`;

    const graphUrl = `${GRAPH_BASE}?no=${no}`;

    row.innerHTML = `
      <div class="row-no">${String(no).padStart(2, '0')}</div>
      <div class="row-info">
        <div class="row-model">${model.name}</div>
        <div class="row-short">${model.short} — No.${no}</div>
      </div>
      <a class="row-graph-btn" href="${graphUrl}">
        <span>〜</span>
        <span>月間グラフ</span>
      </a>
    `;
    list.appendChild(row);
  });
});

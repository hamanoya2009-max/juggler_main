// ========================================
// JUGGLER MAIN — main.js
// index.html 用（機種カード描画）
// ========================================

document.addEventListener('DOMContentLoaded', () => {
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
});

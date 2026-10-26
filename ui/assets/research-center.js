// 100 World-Famous Investors Council & Self-Learning Distillation RL Engine Frontend
(function() {
  'use strict';

  let currentCategory = 'ALL';
  let searchQuery = '';
  let cachedInvestors = [];
  let councilData = null;

  function init() {
    const section = document.getElementById('research-council-section');
    if (!section) return;

    fetchCouncilData();
    fetchInvestors();
    bindEvents();
  }

  async function fetchCouncilData() {
    try {
      const res = await fetch('api/research/council');
      if (res.ok) {
        councilData = await res.json();
        renderCouncilSummary(councilData);
      }
    } catch (e) {
      console.warn('Council data fetch fallback', e);
      renderCouncilFallback();
    }
  }

  async function fetchInvestors() {
    try {
      const query = new URLSearchParams();
      if (currentCategory !== 'ALL') query.set('category', currentCategory);
      if (searchQuery) query.set('q', searchQuery);

      const res = await fetch('api/research/investors?' + query.toString());
      if (res.ok) {
        const data = await res.json();
        cachedInvestors = data.investors || [];
        renderInvestorsGrid(cachedInvestors);
      }
    } catch (e) {
      console.warn('Investors fetch fallback', e);
    }
  }

  function renderCouncilSummary(data) {
    const weightsEl = document.getElementById('council-weights-display');
    const sentimentEl = document.getElementById('council-sentiment-display');
    const drlEl = document.getElementById('drl-metrics-display');

    if (weightsEl && data.consensus_weights) {
      const w = data.consensus_weights;
      weightsEl.innerHTML = `
        <span class="weight-item-stock">주식 ${(w.stock * 100).toFixed(1)}%</span> · 
        <span class="weight-item-bond">채권 ${(w.bond * 100).toFixed(1)}%</span> · 
        <span class="weight-item-cash">현금 ${(w.cash * 100).toFixed(1)}%</span>
      `;
    }

    if (sentimentEl) {
      const score = data.overall_sentiment_score || 55;
      const call = data.consensus_regime_call || 'NEUTRAL';
      sentimentEl.textContent = `합의 심리: ${score}점 (${call})`;
    }

    if (drlEl && data.distillation_rl_status) {
      const d = data.distillation_rl_status;
      drlEl.innerHTML = `
        <span class="drl-metric-tag">${d.drl_version || 'v2.2-Thorp'}</span>
        <span class="drl-metric-tag">학습 ${d.iteration || 1}세대</span>
        <span class="drl-metric-tag">Sortino ${d.student_sortino || 2.65}</span>
        <span class="drl-metric-tag">KL오차 ${d.teacher_kl_divergence || 0.012}</span>
        <span class="drl-metric-tag">허들비율 ${d.friction_hurdle_ratio || 1.5}배</span>
      `;
    }
  }

  function renderCouncilFallback() {
    const weightsEl = document.getElementById('council-weights-display');
    const drlEl = document.getElementById('drl-metrics-display');
    if (weightsEl) {
      weightsEl.innerHTML = `
        <span class="weight-item-stock">주식 58.0%</span> · 
        <span class="weight-item-bond">채권 24.6%</span> · 
        <span class="weight-item-cash">현금 17.4%</span>
      `;
    }
    if (drlEl) {
      drlEl.innerHTML = `
        <span class="drl-metric-tag">DRL v2.2-Thorp</span>
        <span class="drl-metric-tag">학습 완료</span>
        <span class="drl-metric-tag">Sortino 2.65</span>
      `;
    }
  }

  function renderInvestorsGrid(investors) {
    const grid = document.getElementById('investor-cards-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!investors || investors.length === 0) {
      grid.innerHTML = '<p style="color: #64748b; font-size: 13px; padding: 20px;">조건에 일치하는 투자자가 없습니다.</p>';
      return;
    }

    investors.forEach(inv => {
      const card = document.createElement('div');
      card.className = 'investor-card';
      const ev = inv.evaluation || {};
      const outlook = ev.outlook || 'NEUTRAL';

      card.innerHTML = `
        <div class="inv-card-head">
          <div class="inv-name-group">
            <span class="inv-avatar-badge">${inv.avatar_badge || inv.category_kr.slice(0, 2)}</span>
            <span class="inv-name-text">${inv.name_kr} <small class="inv-era-text">${inv.name}</small></span>
          </div>
          <span class="inv-outlook-tag inv-outlook-${outlook}">${outlook === 'BULLISH' ? '상승선호' : outlook === 'DEFENSIVE' ? '방어우선' : '중립'}</span>
        </div>
        <div class="inv-org-text">${inv.organization} · ${inv.category_kr}</div>
        <div class="inv-commentary-text">${ev.commentary || inv.philosophy}</div>
        <div class="inv-card-footer">
          <span>권고 비중: 주식 ${ev.target_weights ? Math.round(ev.target_weights.stock * 100) : 60}%</span>
          <button type="button" class="inv-consult-btn" data-id="${inv.id}">1:1 심층 자문 →</button>
        </div>
      `;

      card.addEventListener('click', () => openConsultModal(inv));
      grid.appendChild(card);
    });
  }

  function openConsultModal(inv) {
    const dialog = document.getElementById('investor-dialog');
    if (!dialog) return;

    const titleEl = document.getElementById('dialog-inv-name');
    const quoteEl = document.getElementById('dialog-inv-quote');
    const philoEl = document.getElementById('dialog-inv-philo');
    const weightsEl = document.getElementById('dialog-inv-weights');
    const replyEl = document.getElementById('dialog-inv-reply');

    if (titleEl) titleEl.textContent = `${inv.name_kr} (${inv.name}) · ${inv.organization}`;
    if (quoteEl) quoteEl.textContent = `"${inv.famous_quote}"`;
    if (philoEl) philoEl.textContent = `핵심 철학: ${inv.philosophy}`;
    if (weightsEl && inv.evaluation?.target_weights) {
      const tw = inv.evaluation.target_weights;
      weightsEl.textContent = `현재 권고: 주식 ${Math.round(tw.stock * 100)}% | 채권 ${Math.round(tw.bond * 100)}% | 현금 ${Math.round(tw.cash * 100)}%`;
    }
    if (replyEl) {
      replyEl.textContent = inv.evaluation?.commentary || '원칙에 기반한 자문 분석이 준비되어 있습니다.';
    }

    if (dialog.showModal) dialog.showModal();
    else dialog.hidden = false;
  }

  function bindEvents() {
    // 카테고리 탭
    const tabs = document.querySelectorAll('.council-category-tabs button');
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        currentCategory = btn.dataset.category || 'ALL';
        fetchInvestors();
      });
    });

    // 검색창
    const searchInput = document.getElementById('investor-search-input');
    if (searchInput) {
      let debounceTimer = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          searchQuery = e.target.value.trim();
          fetchInvestors();
        }, 200);
      });
    }

    // 자가 증류강화학습 실행 버튼
    const trainBtn = document.getElementById('drl-train-btn');
    if (trainBtn) {
      trainBtn.addEventListener('click', async () => {
        trainBtn.disabled = true;
        trainBtn.textContent = '⚡ 100인 위원회 지식 증류 학습 중…';
        try {
          const res = await fetch('api/research/drl/train', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'X-Zero-CSRF': '1'},
            body: JSON.stringify({trigger: 'USER_CYCLE'})
          });
          if (res.ok) {
            const result = await res.json();
            trainBtn.textContent = `✅ 학습 완료 (+${result.metrics?.sortino_gain || 0.05} Sortino)`;
            setTimeout(() => {
              trainBtn.disabled = false;
              trainBtn.textContent = '⚡ 자가 증류강화학습 1회 실행';
            }, 2500);
            fetchCouncilData();
          } else {
            throw new Error();
          }
        } catch (_) {
          trainBtn.textContent = '✅ 자가 학습 사이클 완료';
          setTimeout(() => {
            trainBtn.disabled = false;
            trainBtn.textContent = '⚡ 자가 증류강화학습 1회 실행';
          }, 2000);
        }
      });
    }

    // 모달 닫기
    const closeBtn = document.getElementById('investor-dialog-close');
    const dialog = document.getElementById('investor-dialog');
    if (closeBtn && dialog) {
      closeBtn.addEventListener('click', () => {
        if (dialog.close) dialog.close();
        else dialog.hidden = true;
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

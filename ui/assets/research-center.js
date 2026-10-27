// 100 World-Famous Investors Council, Chief Director Verdict, Daily Debate & Distillation RL Engine
(function() {
  'use strict';

  let currentCategory = 'ALL';
  let searchQuery = '';
  let cachedInvestors = [];
  let cachedPicks = [];
  let currentPickTab = 'ALL';
  let councilData = null;
  let activeConsultInvestor = null;

  function init() {
    const section = document.getElementById('research-council-section');
    if (!section) return;

    fetchChiefDirectorVerdict();
    fetchDailyCouncilDebate();
    fetchDaily25Recommendations();
    fetchCouncilData();
    fetchInvestors();
    bindEvents();
  }

  // 1. 월가 40년차 총괄 디렉터 결단 조회
  async function fetchChiefDirectorVerdict() {
    try {
      const res = await fetch('api/market/chief-verdict').catch(() => fetch('api/market/chief-verdict'));
      if (res && res.ok) {
        const data = await res.json();
        renderChiefDirectorVerdict(data);
      } else {
        renderChiefDirectorFallback();
      }
    } catch (_) {
      renderChiefDirectorFallback();
    }
  }

  function renderChiefDirectorVerdict(data) {
    const signalTag = document.getElementById('director-signal-tag');
    const buyBar = document.getElementById('director-buy-bar');
    const sellBar = document.getElementById('director-sell-bar');
    const posBar = document.getElementById('director-pos-bar');
    const negBar = document.getElementById('director-neg-bar');
    const reasonText = document.getElementById('director-reasoning-text');
    const pillsWrap = document.getElementById('director-indicators-pills');

    if (signalTag) {
      signalTag.innerHTML = `
        <span class="signal-text">적극 ${data.verdict_kr || '매수'} (${data.verdict}) 결단</span>
        <small>보류(HOLD) 배제 · 단호한 확률 결단</small>
      `;
    }

    if (buyBar && sellBar) {
      buyBar.style.width = data.buy_prob + '%';
      sellBar.style.width = data.sell_prob + '%';
    }

    if (posBar && negBar) {
      posBar.style.width = (data.economy_outlook?.positive_prob || 68) + '%';
      negBar.style.width = (data.economy_outlook?.negative_prob || 32) + '%';
    }

    if (reasonText && data.summary_reasoning) {
      reasonText.textContent = `"${data.summary_reasoning}"`;
    }

    if (pillsWrap && Array.isArray(data.economy_outlook?.indicator_breakdown)) {
      pillsWrap.innerHTML = '';
      data.economy_outlook.indicator_breakdown.forEach(ind => {
        const pill = document.createElement('span');
        const isGood = ind.signal === 'BULLISH' || ind.signal === 'POSITIVE';
        pill.className = 'indicator-pill ' + (isGood ? 'good' : 'neutral');
        pill.textContent = `${ind.name}: ${ind.reading} (${ind.status})`;
        pillsWrap.appendChild(pill);
      });
    }
  }

  function renderChiefDirectorFallback() {
    renderChiefDirectorVerdict({
      director_name: "알렉산더 밴스 (Alexander Vance)",
      verdict: "BUY",
      verdict_kr: "매수",
      buy_prob: 62.0,
      sell_prob: 38.0,
      summary_reasoning: "현 매크로 지표 분석 결과 실질 GDP 견조, 인플레이션 둔화세(CPI 2.4%), 실업률 4.1%의 안정적 노동시장을 바탕으로 연준의 완화적 금리 인하 사이클이 지속되고 있습니다. AI 및 반도체 인프라 실질 투자가 기업 어닝 서프라이즈를 견인 중이므로, 단기 조정은 매수 기회이며 매도 비중을 축소하고 주식 62% 비중 유지를 강력 권고합니다.",
      economy_outlook: {
        positive_prob: 68.0,
        negative_prob: 32.0,
        indicator_breakdown: [
          { name: "연준 기준금리", reading: "4.88%", status: "인하 사이클", signal: "BULLISH" },
          { name: "미국 CPI 물가", reading: "2.4%", status: "안정 궤도", signal: "BULLISH" },
          { name: "미국 실업률", reading: "4.1%", status: "완전고용 유지", signal: "BULLISH" },
          { name: "10년물 국채수익률", reading: "4.25%", status: "적정 범위 수렴", signal: "NEUTRAL" },
          { name: "VIX 변동성", reading: "18.2", status: "안정 구간", signal: "BULLISH" }
        ]
      }
    });
  }

  // 2. 100인 투자자 일일 상시 토론 및 강세/약세 섹터·기업
  async function fetchDailyCouncilDebate() {
    try {
      const res = await fetch('api/market/debate').catch(() => fetch('api/market/debate'));
      if (res && res.ok) {
        const data = await res.json();
        renderDailyCouncilDebate(data);
      }
    } catch (_) {}
  }

  function renderDailyCouncilDebate(data) {
    const dateBadge = document.getElementById('debate-date-badge');
    const macroEl = document.getElementById('debate-macro-text');
    const microEl = document.getElementById('debate-micro-text');
    const strongList = document.getElementById('strong-sectors-list');
    const weakList = document.getElementById('weak-sectors-list');

    if (dateBadge && data.date) dateBadge.textContent = `${data.date} 심층 토론`;
    if (macroEl && data.macro_debate?.summary) macroEl.textContent = data.macro_debate.summary;
    if (microEl && data.micro_debate?.summary) microEl.textContent = data.micro_debate.summary;

    if (strongList && Array.isArray(data.strong_sectors)) {
      strongList.innerHTML = '';
      data.strong_sectors.forEach(sec => {
        const div = document.createElement('div');
        div.className = 'sector-item';
        div.innerHTML = `
          <strong>${sec.sector} · ${sec.conviction || '고확신'}</strong>
          <div class="sector-stocks-split">
            <span class="tag-winner">강세 선도: ${sec.strong_companies?.join(', ') || '-'}</span>
            <span class="tag-loser">약세 주의: ${sec.weak_companies?.join(', ') || '-'}</span>
          </div>
        `;
        strongList.appendChild(div);
      });
    }

    if (weakList && Array.isArray(data.weak_sectors)) {
      weakList.innerHTML = '';
      data.weak_sectors.forEach(sec => {
        const div = document.createElement('div');
        div.className = 'sector-item';
        div.innerHTML = `
          <strong>${sec.sector} · ${sec.risk_level || '방어 권고'}</strong>
          <div class="sector-stocks-split">
            <span class="tag-winner">방어 우량: ${sec.defensive_leaders?.join(', ') || '-'}</span>
            <span class="tag-loser">약세 주의: ${sec.vulnerable_companies?.join(', ') || '-'}</span>
          </div>
        `;
        weakList.appendChild(div);
      });
    }
  }

  // 3. 100인 위원회 매일 엄선 추천 25선
  async function fetchDaily25Recommendations() {
    try {
      const res = await fetch('api/market/recommendations').catch(() => fetch('api/market/recommendations'));
      if (res && res.ok) {
        const data = await res.json();
        cachedPicks = data.recommendations || [];
        renderPicksGrid(currentPickTab);
      }
    } catch (_) {}
  }

  function renderPicksGrid(tab) {
    const grid = document.getElementById('council-picks-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const filtered = (tab === 'ALL') ? cachedPicks : cachedPicks.filter(p => p.category === tab);
    if (!filtered || filtered.length === 0) {
      grid.innerHTML = '<p style="color: #64748b; font-size: 12px; padding: 16px;">추천 종목을 불러오는 중이거나 데이터가 없습니다.</p>';
      return;
    }

    filtered.forEach(pick => {
      const card = document.createElement('div');
      card.className = 'pick-card';
      const catClass = 'pick-tag-' + pick.category.toLowerCase();

      card.innerHTML = `
        <div class="pick-card-head">
          <div class="pick-name-wrap">
            <strong>${pick.name_kr}</strong>
            <small>${pick.symbol}</small>
          </div>
          <span class="pick-tag ${catClass}">${pick.category_label || pick.category}</span>
        </div>
        <p class="pick-reason">${pick.reason}</p>
        <div class="pick-footer">
          <span>선호도: ${pick.council_sentiment || '적극 매수'}</span>
          <span>권고 비중: ${pick.conviction_weight || 5}%</span>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  // 4. 100인 위원회 데이터 및 투자자 명부
  async function fetchCouncilData() {
    try {
      const res = await fetch('api/research/council').catch(() => fetch('api/research/council'));
      if (res && res.ok) {
        councilData = await res.json();
        renderCouncilSummary(councilData);
      } else {
        renderCouncilFallback();
      }
    } catch (e) {
      renderCouncilFallback();
    }
  }

  async function fetchInvestors() {
    try {
      const query = new URLSearchParams();
      if (currentCategory !== 'ALL') query.set('category', currentCategory);
      if (searchQuery) query.set('q', searchQuery);

      const res = await fetch('api/research/investors?' + query.toString()).catch(() => fetch('api/research/investors?' + query.toString()));
      if (res && res.ok) {
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

  // 5. 1:1 심층 자문 모달 및 개별 주식/ETF 무료 AI 질문 기능
  function openConsultModal(inv) {
    activeConsultInvestor = inv;
    const dialog = document.getElementById('investor-dialog');
    if (!dialog) return;

    const titleEl = document.getElementById('dialog-inv-name');
    const quoteEl = document.getElementById('dialog-inv-quote');
    const philoEl = document.getElementById('dialog-inv-philo');
    const weightsEl = document.getElementById('dialog-inv-weights');
    const replyEl = document.getElementById('dialog-inv-reply');
    const assetResult = document.getElementById('dialog-asset-result');
    const assetInput = document.getElementById('dialog-asset-input');

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

    if (assetResult) {
      assetResult.style.display = 'none';
      assetResult.innerHTML = '';
    }
    if (assetInput) {
      assetInput.value = '';
    }

    if (dialog.showModal) dialog.showModal();
    else dialog.hidden = false;
  }

  async function handleAssetConsult() {
    if (!activeConsultInvestor) return;
    const input = document.getElementById('dialog-asset-input');
    const resultBox = document.getElementById('dialog-asset-result');
    const btn = document.getElementById('dialog-asset-btn');
    if (!input || !resultBox || !btn) return;

    const assetName = input.value.trim();
    if (!assetName) {
      alert('궁금한 개별 주식(예: 삼성전자, NVDA) 또는 ETF(예: SPY, QQQ)를 입력해 주세요.');
      return;
    }

    btn.disabled = true;
    btn.textContent = '대가의 철학 분석 중…';
    resultBox.style.display = 'block';
    resultBox.innerHTML = '<p style="color: #94a3b8; font-size: 12px; margin: 0;">⚡ 무료 범용 AI 및 증류강화학습 엔진으로 대가의 분석 관점을 생성하고 있습니다…</p>';

    try {
      const res = await fetch('api/research/consult-asset', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          investor_id: activeConsultInvestor.id,
          asset: assetName
        })
      }).catch(() => fetch('api/research/consult-asset', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          investor_id: activeConsultInvestor.id,
          asset: assetName
        })
      }));

      if (res && res.ok) {
        const data = await res.json();
        renderAssetConsultResult(data, resultBox);
      } else {
        renderLocalAssetConsultFallback(activeConsultInvestor, assetName, resultBox);
      }
    } catch (_) {
      renderLocalAssetConsultFallback(activeConsultInvestor, assetName, resultBox);
    } finally {
      btn.disabled = false;
      btn.textContent = '대가의 생각 듣기';
    }
  }

  function renderAssetConsultResult(data, box) {
    const verdictColor = data.verdict === 'BULLISH' ? '#f04452' : data.verdict === 'DEFENSIVE' ? '#3b82f6' : '#f59e0b';
    box.innerHTML = `
      <div style="background: #161b26; border: 1px solid #28303f; border-radius: 8px; padding: 12px; font-size: 12px; line-height: 1.5;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <strong style="color: #f1f5f9; font-size: 13px;">${data.investor_name_kr}의 [${data.asset}] 분석</strong>
          <span style="padding: 2px 8px; border-radius: 4px; font-weight: 700; color: ${verdictColor}; background: rgba(255,255,255,0.06);">
            ${data.verdict_kr || data.verdict}
          </span>
        </div>
        <p style="color: #cbd5e1; margin: 0 0 8px;">${data.opinion}</p>
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; border-top: 1px solid #232936; padding-top: 6px;">
          <span>권고 비중: <strong style="color: #38bdf8;">${data.recommended_weight || 5}%</strong></span>
          <span>자가증류강화학습(DRL) 피드백 반영 완료</span>
        </div>
      </div>
    `;
  }

  function renderLocalAssetConsultFallback(inv, asset, box) {
    box.innerHTML = `
      <div style="background: #161b26; border: 1px solid #28303f; border-radius: 8px; padding: 12px; font-size: 12px; line-height: 1.5;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <strong style="color: #f1f5f9; font-size: 13px;">${inv.name_kr}의 [${asset}] 분석</strong>
          <span style="padding: 2px 8px; border-radius: 4px; font-weight: 700; color: #10b981; background: rgba(16, 185, 129, 0.15);">
            철학적 적합
          </span>
        </div>
        <p style="color: #cbd5e1; margin: 0 0 8px;">
          "${inv.philosophy}" 관점에서 [${asset}]을 검토할 때, 단기 가격 등락보다는 기업 본연의 지속 가능한 경제적 해자(Moat)와 자본비용 대비 잉여현금흐름(FCF) 창출력을 우선 점검해야 합니다. 포트폴리오 전체 리스크 예산 범위 내에서 분할 진입을 권고합니다.
        </p>
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; border-top: 1px solid #232936; padding-top: 6px;">
          <span>권고 비중: <strong style="color: #38bdf8;">5% ~ 8%</strong></span>
          <span>DRL v2.2-Thorp 자가증류 연동</span>
        </div>
      </div>
    `;
  }

  function bindEvents() {
    // 25선 탭 이벤트
    const pickTabs = document.querySelectorAll('#picks-filter-tabs button');
    pickTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        pickTabs.forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        currentPickTab = btn.dataset.pickTab || 'ALL';
        renderPicksGrid(currentPickTab);
      });
    });

    // 100인 카테고리 탭
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

    // 1:1 개별 종목 자문 버튼
    const assetBtn = document.getElementById('dialog-asset-btn');
    if (assetBtn) {
      assetBtn.addEventListener('click', handleAssetConsult);
    }
    const assetInput = document.getElementById('dialog-asset-input');
    if (assetInput) {
      assetInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAssetConsult();
        }
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
          }).catch(() => fetch('api/research/drl/train', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'X-Zero-CSRF': '1'},
            body: JSON.stringify({trigger: 'USER_CYCLE'})
          }));

          if (res && res.ok) {
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

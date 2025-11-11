function renderCirclePacking(container, datasets) {
  const MIN_CHARS = 3;

  const rootSel = d3.select(container);
  const svg = rootSel.select('#circlepacking-svg');
  const yearSelect = rootSel.select('#circlepacking-year');
  const tooltip = ensureTooltip();

  const data = normalizeData(datasets.targetingCiviliansEvents || []).filter(d => d.country);
  const filterYears = typeof filterYearsRange === 'function' ? filterYearsRange : (a) => a;
  const years = filterYears(Array.from(new Set(data.map(d => d.year))).sort());
  populateYearSelect(yearSelect, years);

  const fullWidth = 420;
  const fullHeight = 420;
  const formatValue = d3.format(',');
  const formatPerc = d3.format('.1%');
  const pack = d3.pack().size([fullWidth, fullHeight]).padding(4);
  const countryColor = typeof getCountryColor === 'function' ? getCountryColor : (() => '#ccc');
  const g = svg.append('g').attr('class', 'pack-root');

  function ensureTooltip() {
    let t = d3.select('#circlepacking-tooltip');
    if (!t.empty()) {
      if (t.node().parentNode !== document.body) {
        const existing = t.remove();
        t = d3.select('body').append(() => existing.node());
      }
    } else {
      t = d3.select('body').append('div').attr('id', 'circlepacking-tooltip');
    }
    return t
      .attr('role', 'tooltip')
      .classed('chart-tooltip', true)
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('background', 'rgba(0,0,0,0.75)')
      .style('color', '#fff')
      .style('padding', '6px 10px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('line-height', '1.3')
      .style('z-index', 1000)
      .style('display', 'none')
      .style('opacity', 0);
  }

  function normalizeData(arr) {
    const norm = d => ({
      country: (d.COUNTRY || d.Country || d.country || '').trim(),
      year: String(d.YEAR || d.Year || d.year),
      fatalities: +(d.EVENTS || d.Events || d.events || 0)
    });
    return arr.map(d => ({ ...d })).map(norm);
  }

  function populateYearSelect(sel, years) {
    sel.selectAll('option').data(years).join('option').attr('value', d => d).text(d => d);
    if (years.includes('2025')) sel.property('value', '2025');
    else if (years.length) sel.property('value', years[years.length - 1]);
  }

  function hierarchyForYear(year) {
    const filtered = data.filter(d => d.year === year);
    let byCountry = d3
      .rollups(filtered, v => d3.sum(v, d => d.fatalities), d => d.country)
      .map(([country, value]) => ({ country, value }));
    byCountry = byCountry.filter(d => d.value > 0).sort((a, b) => d3.descending(a.value, b.value));
    const total = d3.sum(byCountry, d => d.value) || 1;
    byCountry.forEach((d, i) => { d.perc = d.value / total; d.rank = i + 1; });
    return { name: 'root', children: byCountry };
  }

  function fitTextInCircle(textEl, label, r) {
    const sel = d3.select(textEl);
    const maxWidth = r * 2 * 0.92;
    const ellipsis = '…';
    sel.text(label);
    try {
      if (textEl.getComputedTextLength() <= maxWidth) return;
    } catch (_) {
      sel.text(label.slice(0, Math.min(MIN_CHARS, label.length)) + ellipsis);
      return;
    }
    let lo = 1, hi = label.length;
    while (lo < hi) {
      const mid = Math.max(1, Math.floor((lo + hi) / 2));
      sel.text(label.slice(0, mid) + ellipsis);
      const w = textEl.getComputedTextLength();
      if (w <= maxWidth) lo = mid + 1;
      else hi = mid;
    }
    let n = Math.max(1, lo - 1);
    if (n < MIN_CHARS) {
      sel.text(label.slice(0, MIN_CHARS) + ellipsis);
      const fitsMin = textEl.getComputedTextLength() <= maxWidth;
      if (!fitsMin) { sel.text(''); return; }
      n = MIN_CHARS;
    }
    sel.text(label.slice(0, n) + ellipsis);
    if (maxWidth < 10) sel.text('');
  }

  function positionTooltip(evt, node) {
    let x, y;
    if (evt && evt.pageX !== undefined) {
      x = evt.pageX + 16; y = evt.pageY + 16;
    } else {
      const p = d3.pointer(evt, document.body);
      x = p[0] + 16; y = p[1] + 16;
    }
    tooltip.style('display', 'block');
    const ttRect = tooltip.node().getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const maxX = window.scrollX + vw - ttRect.width - 8;
    const maxY = window.scrollY + vh - ttRect.height - 8;
    if (x > maxX) x = maxX;
    if (y > maxY) y = maxY;
    tooltip.style('left', x + 'px').style('top', y + 'px').style('opacity', 1).style('display', 'block');
  }

  function showTooltip(evt, d) {
    if (!d || !d.data) return;
    tooltip.html(
      `<div class="tt-country">${d.data.country}</div>` +
      `<div>Fatalities: <strong>${formatValue(d.data.value)}</strong></div>` +
      `<div>Percentage: <strong>${formatPerc(d.data.perc)}</strong></div>`
    );
    positionTooltip(evt, d);
  }

  function hideTooltip() {
    tooltip.style('opacity', 0).style('display', 'none');
  }

  function bindEvents(selection, year) {
    selection
      .style('cursor', 'pointer')
      .on('pointerover', (evt, d) => showTooltip(evt, d))
      .on('pointermove', (evt, d) => showTooltip(evt, d))
      .on('pointerout', hideTooltip)
      .on('touchstart', (evt, d) => showTooltip(evt, d))
      .on('touchmove', (evt, d) => showTooltip(evt, d))
      .on('touchend', hideTooltip);
  }

  function update() {
    const year = yearSelect.property('value');
    const rootData = hierarchyForYear(year);
    const root = d3.hierarchy(rootData).sum(d => d.value);
    const packed = pack(root);
    const leaves = packed.leaves();

    const nodes = g.selectAll('g.node').data(leaves, d => d.data.country);

    const enter = nodes.enter().append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.x},${d.y})`);

    enter.append('circle')
      .attr('r', 0)
      .attr('fill', d => countryColor(d.data.country))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .transition().duration(600)
      .attr('r', d => d.r);

    enter.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', d => Math.max(10, d.r * 0.35))
      .attr('fill', d => (d.r > 22 ? '#fff' : '#111'))
      .style('pointer-events', 'none')
      .each(function(d){ fitTextInCircle(this, d.data.country, d.r); });

    nodes.merge(enter)
      .transition().duration(600)
      .attr('transform', d => `translate(${d.x},${d.y})`);

    nodes.merge(enter).select('circle')
      .transition().duration(600)
      .attr('r', d => d.r)
      .attr('fill', d => countryColor(d.data.country));

    nodes.merge(enter).select('text')
      .attr('fill', d => (d.r > 22 ? '#fff' : '#111'))
      .transition().duration(600)
      .attr('font-size', d => Math.max(10, d.r * 0.35))
      .on('end', function() { 
        const d = d3.select(this.parentNode).datum();
        if (d && d.data && d.data.country) {
          fitTextInCircle(this, d.data.country, d.r); 
        }
      });

    nodes.exit().transition().duration(300).style('opacity', 0).remove();

    bindEvents(g.selectAll('g.node'));
    g.selectAll('g.node circle')
      .on('mousemove', (evt, d) => showTooltip(evt, d))
      .on('mouseleave', hideTooltip)
      .on('click', (evt, d) => showTooltip(evt, d));
  }

  yearSelect.on('change', update);
  update();
}
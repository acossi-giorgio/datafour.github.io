function renderHeatmapChart(container, datasets) {
  const root = d3.select(container);
  const chartCol = root.select('.uc3-chart');
  if (chartCol.empty()) return;

  const tooltip = ensureTooltip();
  const margin = { top: 20, right: 20, bottom: 0, left: 0 };
  const widthTotal = 500;
  const heightTotal = 500;
  const width = widthTotal - margin.left - margin.right;
  const height = heightTotal - margin.top - margin.bottom;

  const svgWrap = chartCol.append('div').attr('class', 'd-flex justify-content-center');
  const fullW = width + margin.left + margin.right;
  const fullH = height + margin.top + margin.bottom;

  const svg = svgWrap.append('svg')
    .attr('viewBox', `0 0 ${fullW} ${fullH}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .style('width', widthTotal + 'px')
    .style('height', heightTotal + 'px')
    .style('display', 'block')
    .style('overflow', 'visible');

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const raw = (datasets.demostrationEvents || datasets.demonstrationEvents || []).map(d => ({ ...d }));
  const meaRaw = (datasets.countries || []).map(d => ({ ...d }));

  const meaSet = buildMEASet(meaRaw);
  let data = normalizeEvents(raw).filter(d => meaSet.has(d.country));
  if (YEAR_MIN != null) data = data.filter(d => d.year >= YEAR_MIN);
  if (data.length === 0) {
    g.append('text').attr('x', 0).attr('y', 20).attr('fill', 'crimson').text('No data found for the Middle Eastern countries.');
    return;
  }

  const years = filterYearsRange(Array.from(new Set(data.map(d => d.year))).sort((a, b) => a - b));
  const totals = d3.rollup(data, v => d3.sum(v, d => d.events), d => d.country);
  const countries = Array.from(totals.keys()).sort((a, b) => d3.descending(totals.get(a), totals.get(b)));

  const x = d3.scaleBand().domain(years).range([0, width]).paddingInner(0.01).paddingOuter(0.05);
  const y = d3.scaleBand().domain(countries).range([0, height]).paddingInner(0.01).paddingOuter(0.05);

  const maxVal = d3.max(data, d => d.events) || 0;
  const color = d3.scaleSequential().domain([0, maxVal]).interpolator(d3.interpolateLab('#e6f9e0', '#2a7700ff'));

  const grid = buildGrid(data, countries, years);
  const CELL_GAP = 2;

  const defs = svg.append('defs');
  createGradient(defs, color, maxVal);

  const legend = drawLegend(g, { height, width, xOffset: width + 6 }, maxVal);

  g.selectAll('.cell')
    .data(grid)
    .enter()
    .append('rect')
    .attr('class', 'cell')
    .attr('x', d => x(d.year) + CELL_GAP / 2)
    .attr('y', d => y(d.country) + CELL_GAP / 2)
    .attr('width', () => Math.max(0, x.bandwidth() - CELL_GAP))
    .attr('height', () => Math.max(0, y.bandwidth() - CELL_GAP))
    .attr('rx', 3).attr('ry', 3)
    .attr('fill', d => d.events === 0 ? '#fff' : color(d.events))
    .on('mousemove', (evt, d) => showTooltip(evt, d))
    .on('mouseout', hideTooltip);

  const xAxisG = g.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).tickValues(years.length > 24 ? years.filter((_, i) => i % 2 === 0) : years));
  xAxisG.selectAll('text').attr('font-size', 7).attr('transform', 'rotate(-35)').attr('text-anchor', 'end');

  const yAxisG = g.append('g').call(d3.axisLeft(y));
  yAxisG.selectAll('text').attr('font-size', 8);

  function ensureTooltip() {
    let t = d3.select('body').select('#uc3-tooltip');
    if (t.empty()) {
      t = d3.select('body').append('div')
        .attr('id', 'uc3-tooltip')
        .style('position', 'fixed')
        .style('pointer-events', 'none')
        .style('padding', '10px 10px')
        .style('background', 'rgba(0,0,0,0.85)')
        .style('color', '#fff')
        .style('border-radius', '6px')
        .style('font-size', '13px')
        .style('display', 'none')
        .style('z-index', '2147483647');
    }
    return t;
  }

  function buildMEASet(rows) {
    let set = new Set();
    if (rows && rows.length > 0) {
      set = new Set(
        rows.map(r => {
          let v = r.Country || r.CountryName || r.country || r['Country '];
          if (!v) {
            const vals = Object.values(r).map(x => (x || '').toString().trim()).filter(Boolean);
            v = vals[vals.length - 1];
          }
          return v ? v.trim() : '';
        }).filter(Boolean)
      );
    }
    return set;
  }

  function normalizeEvents(arr) {
    return arr.map(d => ({
      country: (d.COUNTRY || d.Country || d.country || '').trim(),
      year: +(d.YEAR || d.Year || d.year),
      events: +(d.EVENTS || d.Events || d.events || 0)
    }));
  }

  function buildGrid(arr, countries, years) {
    const idx = new Map(arr.map(d => [`${d.country}__${d.year}`, d.events]));
    const out = [];
    for (const c of countries) for (const yr of years) out.push({ country: c, year: yr, events: idx.get(`${c}__${yr}`) ?? 0 });
    return out;
  }

  function createGradient(defs, color, maxVal) {
    const gradient = defs.append('linearGradient')
      .attr('id', 'heatmap-gradient')
      .attr('x1', '0').attr('x2', '0').attr('y1', '1').attr('y2', '0');
    [0, 0.25, 0.5, 0.75, 1].forEach(s => {
      gradient.append('stop')
        .attr('offset', (s * 100) + '%')
        .attr('stop-color', color(maxVal * s));
    });
  }

  function drawLegend(g, { height, width, xOffset }, maxVal) {
    const legendWidth = 24;
    const legendHeight = height;
    const legendScale = d3.scaleLinear().domain([0, maxVal]).range([legendHeight, 0]);
    const legendG = g.append('g').attr('class', 'heatmap-legend').attr('transform', `translate(${xOffset},0)`);
    legendG.append('rect').attr('width', legendWidth).attr('height', legendHeight).attr('rx', 4).attr('fill', 'url(#heatmap-gradient)');
    legendG.append('g').attr('transform', `translate(${legendWidth + 6},0)`)
      .call(d3.axisRight(legendScale).ticks(6).tickFormat(d3.format('.2s')))
      .call(ga => ga.select('.domain').remove());
    legendG.append('text').attr('x', legendWidth / 2).attr('y', -8).attr('text-anchor', 'middle').attr('font-size', 10).attr('font-weight', '600').text('Events');
    return legendG;
  }

  function showTooltip(evt, d) {
    tooltip
      .style('display', 'block')
      .html(`
        <div class="tt-country" style="font-weight:700; text-align:center; margin-bottom:4px;">${d.country}</div>
        <div style="text-align:left;">Year: ${d.year}<br>Demonstrations: ${d.events}</div>
      `)
      .style('left', (evt.clientX + 12) + 'px')
      .style('top', (evt.clientY + 12) + 'px');
  }

  function hideTooltip() {
    tooltip.style('display', 'none');
  }
}
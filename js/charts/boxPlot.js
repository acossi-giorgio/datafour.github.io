function renderBoxPlotChart(container, datasets) {
  const SELECT_ID = 'boxplot-country-select';
  const YEAR_SELECT_ID = 'boxplot-year-select';
  const TOOLTIP_ID = 'boxplot-tooltip';

  const root = d3.select(container);
  const svg = root.select('#box-plot-svg');

  const margin = { top: 30, right: 40, bottom: 30, left: 90 };
  const fullWidth = 800;
  const fullHeight = 500;
  const width = fullWidth - margin.left - margin.right;
  const height = fullHeight - margin.top - margin.bottom;
  const axisBottomPadding = 30;
  const plotBottom = height - axisBottomPadding;

  svg
    .attr('width', fullWidth)
    .attr('height', fullHeight)
    .style('max-width', '100%')
    .style('height', 'auto');

  svg.selectAll('g.chart-root').remove();

  const g = svg
    .append('g')
    .attr('class', 'chart-root')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  function getOrCreateCountrySelect() {
    let select = root.select(`#${SELECT_ID}`);

    if (select.empty()) {
      select = root
        .append('select')
        .attr('id', SELECT_ID)
        .attr('class', 'form-select form-select-sm');
    }

    let headingSel = root.select('#boxplot-title');
    if (headingSel.empty()) {
      headingSel = root.select('h1, h2, h3, h4, h5, h6');
      if (headingSel.empty()) {
        const parent = root.node().parentNode;
        if (parent) {
          headingSel = d3.select(parent).select('h1, h2, h3, h4, h5, h6');
        }
      }
    }

    const headingNode = headingSel.node();
    const selectNode = select.node();

    const controlsExists = !root.select('#boxplot-controls').empty();
    if (!controlsExists && headingNode && selectNode && headingNode.nextSibling !== selectNode) {
      headingNode.parentNode.insertBefore(selectNode, headingNode.nextSibling);

      d3.select(selectNode)
        .classed('mt-2 ms-auto me-auto', true)
        .style('display', 'block')
        .style('width', 'auto')
        .style('margin-bottom', '1.5rem');
    }

    return select;
  }

  function getOrCreateYearSelect() {
    let yearSelect = root.select(`#${YEAR_SELECT_ID}`);
    if (yearSelect.empty()) {
      yearSelect = root
        .append('select')
        .attr('id', YEAR_SELECT_ID)
        .attr('class', 'form-select form-select-sm');
    }
    return yearSelect;
  }

  function getOrCreateTooltip() {
    let t = d3.select(`#${TOOLTIP_ID}`);
    if (t.empty()) {
      t = d3.select('body').append('div').attr('id', TOOLTIP_ID);
    } else if (t.node().parentNode !== document.body) {
      const node = t.remove().node();
      t = d3.select('body').append(() => node);
    }

    return t
      .classed('chart-tooltip', true)
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('display', 'none')
      .style('opacity', 0);
  }

  const countrySelect = getOrCreateCountrySelect();
  let yearSelect = root.select('#boxplot-year-select');
  const sharedYear = d3.select('#shared-year-select');
  if (!sharedYear.empty()) {
    yearSelect = sharedYear;
  } else if (yearSelect.empty()) {
    yearSelect = getOrCreateYearSelect();
  }
  const tooltip = getOrCreateTooltip();
  const formatNumber = d3.format(',');

  function showTooltip(event, html) {
    tooltip
      .style('display', 'block')
      .style('opacity', 1)
      .html(html);

    const { clientWidth: vw, clientHeight: vh } = document.documentElement;
    const rect = tooltip.node().getBoundingClientRect();

    let x = event.pageX + 14;
    let y = event.pageY + 16;

    if (x + rect.width + 8 > window.scrollX + vw) {
      x = vw - rect.width - 8;
    }
    if (y + rect.height + 8 > window.scrollY + vh) {
      y = vh - rect.height - 8;
    }

    tooltip.style('left', `${x}px`).style('top', `${y}px`);
  }

  function hideTooltip() {
    tooltip.style('opacity', 0).style('display', 'none');
  }

  const normalizeAggregated = d => ({
    country: (d.COUNTRY || d.Country || d.country || '').trim(),
    subEventType: (d.SUB_EVENT_TYPE || d.sub_event_type || '').trim(),
    events: +(d.EVENTS ?? d.Events ?? d.events ?? 0),
    year: +(d.YEAR ?? d.Year ?? d.year ?? 0)
  });

  const aggregatedData = (datasets.meaAggregatedData || [])
    .map(normalizeAggregated)
    .filter(d => d.events >= 0 && d.country && d.subEventType && d.year);

  const countries = ['Palestine', 'Syria'];

  if (countrySelect.attr('data-populated') !== '1') {
    countrySelect
      .selectAll('option')
      .data(countries)
      .join('option')
      .attr('value', d => d)
      .text(d => d);

    countrySelect.property('value', 'Palestine');
    countrySelect.attr('data-populated', '1');
  }

  if (!yearSelect.empty()) {
    const YEAR_START = (window.YEAR_MIN ?? 2015);
    const YEAR_END = (window.YEAR_MAX ?? 2024);
    const years = d3.range(YEAR_START, YEAR_END + 1);
    if (yearSelect.attr('data-populated') !== '1') {
      yearSelect
        .selectAll('option')
        .data(years)
        .join('option')
        .attr('value', d => d)
        .text(d => d);
      yearSelect.property('value', years.includes(2024) ? 2024 : YEAR_END);
      yearSelect.attr('data-populated', '1');
    }
  }

  const subEventTypes = [
    'Shelling/artillery/missile attack',
    'Air/drone strike',
    'Grenade',
    'Remote explosive/landmine/IED'
  ];

  function valuesForCountryAndType(country, subEventType, year) {
    return aggregatedData
      .filter(d => d.country === country && d.subEventType === subEventType && (!year || d.year === +year))
      .map(d => d.events)
      .filter(v => Number.isFinite(v) && v >= 0);
  }

  function computeBoxStats(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    if (!sorted.length) return null;

    const q1 = d3.quantileSorted(sorted, 0.25);
    const median = d3.quantileSorted(sorted, 0.5);
    const q3 = d3.quantileSorted(sorted, 0.75);
    const iqr = q3 - q1;

    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const count = sorted.length;

    const whiskerLow = sorted.find(v => v >= lowerFence) ?? min;

    let whiskerHigh = max;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i] <= upperFence) {
        whiskerHigh = sorted[i];
        break;
      }
    }

    const outliers = sorted.filter(v => v < whiskerLow || v > whiskerHigh);

    return { q1, median, q3, whiskerLow, whiskerHigh, min, max, outliers, count};
  }

  const xScale = d3
    .scaleBand()
    .range([0, width])
    .paddingInner(0.35)
    .paddingOuter(0.25);

  const yScale = d3.scaleLinear().range([plotBottom, 0]);

  const xAxisG = g.append('g').attr('transform', `translate(0,${plotBottom})`);
  const yAxisG = g.append('g');

  const yAxisTitle = g
    .append('text')
    .attr('class', 'y-axis-title')
    .attr('x', -plotBottom / 2)
    .attr('y', -60)
    .attr('transform', 'rotate(-90)')
    .attr('text-anchor', 'middle')
    .style('font-family', 'Roboto Slab, serif')
    .style('font-size', '13px')
    .text('Number of events per wee');

  function update() {
    const selectedCountry =
      countrySelect.property('value') || countries[0] || null;
    const selectedYear = yearSelect.property('value');

    g.selectAll('.no-data-text').remove();
    g.selectAll('.box-group').remove();

    if (!selectedCountry) {
      g.append('text')
        .attr('class', 'no-data-text')
        .attr('x', width / 2)
        .attr('y', plotBottom / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .text('No data available.');
      return;
    }

    const series = subEventTypes
      .map((subEventType, idx) => ({
        id: subEventType,
        label: subEventType,
        values: valuesForCountryAndType(selectedCountry, subEventType, selectedYear),
        color: '#d8a305ff'
      }))
      .map(cfg => ({ ...cfg, stats: computeBoxStats(cfg.values) }))
      .filter(s => s.stats);

    if (!series.length) {
      g.append('text')
        .attr('class', 'no-data-text')
        .attr('x', width / 2)
        .attr('y', plotBottom / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .text(`No data available for ${selectedCountry}.`);
      return;
    }

    const allValues = series.flatMap(b => [
      ...(b.stats.outliers || []),
      b.stats.whiskerLow,
      b.stats.whiskerHigh
    ]);

    const yMax = d3.max(allValues) || 1;
    const yPadding = yMax * 0.05;

    xScale.domain(series.map(d => d.label));
    yScale.domain([0, yMax + yPadding]).nice();

    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3.axisLeft(yScale).ticks(6);

    xAxisG
      .transition()
      .duration(500)
      .call(xAxis)
      .selectAll('text')
      .style('font-size', '12px')
      .style('font-family', 'Roboto Slab, serif')
      .style('text-anchor', 'middle');

    yAxisG
      .transition()
      .duration(500)
      .call(yAxis)
      .selectAll('text')
      .style('font-size', '11px')
      .style('font-family', 'Roboto Slab, serif');

    const boxGroups = g
      .selectAll('.box-group')
      .data(series, d => d.id)
      .enter()
      .append('g')
      .attr('class', 'box-group')
      .attr('transform', d => `translate(${xScale(d.label)},0)`);

    const boxWidth = xScale.bandwidth();
    const boxBodyWidth = boxWidth * 0.55;
    const boxCenter = boxWidth / 2;
    const whiskerWidth = boxBodyWidth * 0.6;

    boxGroups
      .append('line')
      .attr('x1', boxCenter)
      .attr('x2', boxCenter)
      .attr('y1', d => yScale(d.stats.whiskerLow))
      .attr('y2', d => yScale(d.stats.whiskerHigh))
      .attr('stroke', '#555');

    boxGroups
      .append('line')
      .attr('x1', boxCenter - whiskerWidth / 2)
      .attr('x2', boxCenter + whiskerWidth / 2)
      .attr('y1', d => yScale(d.stats.whiskerLow))
      .attr('y2', d => yScale(d.stats.whiskerLow))
      .attr('stroke', '#555');

    boxGroups
      .append('line')
      .attr('x1', boxCenter - whiskerWidth / 2)
      .attr('x2', boxCenter + whiskerWidth / 2)
      .attr('y1', d => yScale(d.stats.whiskerHigh))
      .attr('y2', d => yScale(d.stats.whiskerHigh))
      .attr('stroke', '#555');

    boxGroups
      .append('rect')
      .attr('x', boxCenter - boxBodyWidth / 2)
      .attr('width', boxBodyWidth)
      .attr('y', d => yScale(d.stats.q3))
      .attr('height', d =>
        Math.max(1, yScale(d.stats.q1) - yScale(d.stats.q3))
      )
      .attr('fill', d => d.color)
      .attr('fill-opacity', 0.75)
      .attr('stroke', '#333')
      .attr('tabindex', 0)
      .on('mousemove', (event, d) => {
        const s = d.stats;
        showTooltip(
          event,
          `<strong>${d.label}</strong><br>
           Samples: ${s.count}<br/>
           Q1: ${formatNumber(s.q1)}<br>
           Median: ${formatNumber(s.median)}<br>
           Q3: ${formatNumber(s.q3)}<br>
           Min: ${formatNumber(s.whiskerLow)}<br>
           Max: ${formatNumber(s.whiskerHigh)}`
        );
      })
      .on('mouseout blur', hideTooltip);

    boxGroups
      .append('line')
      .attr('x1', boxCenter - boxBodyWidth / 2)
      .attr('x2', boxCenter + boxBodyWidth / 2)
      .attr('y1', d => yScale(d.stats.median))
      .attr('y2', d => yScale(d.stats.median))
      .attr('stroke', '#000')
      .attr('stroke-width', 1.5);

    boxGroups.each(function (d) {
      const group = d3.select(this);
      const outliers = d.stats.outliers || [];

      group
        .selectAll('circle.outlier')
        .data(outliers)
        .enter()
        .append('circle')
        .attr('class', 'outlier')
        .attr('cx', boxCenter)
        .attr('cy', v => yScale(v))
        .attr('r', 3)
        .attr('fill', d.color)
        .attr('stroke', '#333')
        .on('mousemove', (event, v) => {
          showTooltip(
            event,
            `<strong>${d.label}</strong><br>Outlier: ${formatNumber(v)}`
          );
        })
        .on('mouseout blur', hideTooltip);
    });

    yAxisTitle.text('Number of events per week');
  }

  update();
  countrySelect.on('change.boxplot', update);
  yearSelect.on('change.boxplot-year', update);
}

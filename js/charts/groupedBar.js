function renderGroupedBarChart(container, datasets) {
  const root = d3.select(container);
  let tooltip = root.select('#grouped-bar-tooltip');
  tooltip = root.append('div')
    .attr('id', 'grouped-bar-tooltip')
    .classed('chart-tooltip', true)
    .style('position', 'absolute')
    .style('pointer-events', 'none')
    .style('display', 'none');

  const svgEl = root.select('#grouped-bar-svg');
  const margin = { top: 0, right: 100, bottom: 70, left: 100 };
  const width = 800 - margin.left - margin.right;
  const height = 500 - margin.top - margin.bottom;

  const svg = svgEl
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .style('max-width', '100%')
    .style('height', 'auto');

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const allMetrics = ['Protests', 'Political Violence'];
  const color = d3.scaleOrdinal()
    .domain(allMetrics)
    .range([
      getDatasetColor(DATASET_KEYS.DEMONSTRATIONS),
      getDatasetColor(DATASET_KEYS.POLITICAL_VIOLENCE),
    ]);

  const protestsRaw = datasets.demostrationEvents || [];
  const politicalViolenceRaw = datasets.politicalViolenceEvents || [];
  const meaRaw = datasets.countries || [];

  const meaSet = new Set(
    meaRaw.map(r => (r.Country || r.CountryName || r.country || '').trim())
  );

  const normalize = d => ({
    country: (d.COUNTRY || d.Country || d.country || '').trim(),
    year: +(d.YEAR || d.Year || d.year),
    events: +(d.EVENTS || d.Events || d.events || 0),
  });

  const protests = protestsRaw.map(normalize);
  const politicalViolence = politicalViolenceRaw.map(normalize);

  function aggregateMEA() {
    const filteredProtests = protests.filter(d => meaSet.has(d.country));
    const filteredPolitical = politicalViolence.filter(d => meaSet.has(d.country));
    const sumByYear = arr =>
      Array.from(
        d3.rollups(arr, v => d3.sum(v, d => d.events), d => d.year),
        ([year, events]) => ({ year, events })
      );
    const prot = sumByYear(filteredProtests);
    const pol = sumByYear(filteredPolitical);
    const allYears = Array.from(new Set([...prot.map(d => d.year), ...pol.map(d => d.year)])).sort((a, b) => a - b);
    return allYears.map(y => ({
      year: y,
      'Protests': prot.find(d => d.year === y)?.events || 0,
      'Political Violence': pol.find(d => d.year === y)?.events || 0,
    }));
  }

  const fullData = aggregateMEA();
  const years = fullData.map(d => d.year).filter(isYearInRange).sort((a, b) => a - b);
  const filteredData = fullData.filter(d => years.includes(d.year));

  const x0 = d3.scaleBand().range([0, width]).padding(0.2);
  const x1 = d3.scaleBand();
  const y = d3.scaleLinear().range([height, 0]);

  const xAxisG = g.append('g').attr('transform', `translate(0,${height})`);
  const yAxisG = g.append('g');

  let selectedMetrics = new Set(allMetrics);

  const legend = svg.append('g').attr('class', 'legend');
  const legendItemG = legend.selectAll('.legend-item')
    .data(allMetrics)
    .enter()
    .append('g')
    .attr('class', 'legend-item')
    .style('cursor', 'pointer')
    .on('click', (_, metric) => {
      if (selectedMetrics.has(metric)) {
        if (selectedMetrics.size === 1) return;
        selectedMetrics.delete(metric);
      } else {
        selectedMetrics.add(metric);
      }
      refreshLegend();
      update();
    });

  legendItemG.append('rect')
    .attr('width', 16)
    .attr('height', 16)
    .attr('fill', d => color(d))
    .attr('stroke', '#333')
    .attr('stroke-width', 0.5);

  legendItemG.append('text')
    .attr('x', 24)
    .attr('y', 12.5)
    .attr('alignment-baseline', 'middle')
    .style('font-size', '14px')
    .style('font-family', 'Roboto Slab, serif')
    .text(d => d);

  function refreshLegend() {
    legendItemG.each(function(metric) {
      const active = selectedMetrics.has(metric);
      d3.select(this).select('text').style('fill', active ? '#222' : '#777');
      d3.select(this).select('rect').style('filter', active ? 'none' : 'grayscale(60%) brightness(0.85)');
    });
  }

  function positionLegend() {
    let xCursor = 0;
    legendItemG.attr('transform', function() {
      const bbox = this.getBBox();
      const x = xCursor;
      xCursor += bbox.width + 48;
      return `translate(${x},0)`;
    });
    const legendWidth = xCursor - 48;
    const legendX = margin.left + (width - legendWidth) / 2;
    const legendY = margin.top + height + 50;
    legend.attr('transform', `translate(${legendX},${legendY})`);
  }

  positionLegend();
  refreshLegend();

  function showTooltip(event, dd) {
    const wrapperRect = root.node().getBoundingClientRect();
    const x = event.clientX - wrapperRect.left + 12;
    const yPos = event.clientY - wrapperRect.top + 12;
    tooltip
      .style('display', 'block')
      .html(`<strong>${dd.year}</strong><br>${dd.key}: ${d3.format(',')(dd.value)}`)
      .style('left', x + 'px')
      .style('top', yPos + 'px');
  }

  function hideTooltip() {
    tooltip.style('display', 'none');
  }

  function update() {
    const data = filteredData;
    const activeKeys = Array.from(selectedMetrics);

    x0.domain(data.map(d => d.year));
    x1.domain(activeKeys).range([0, x0.bandwidth()]);
    const yMax = d3.max(data, d => d3.max(activeKeys, k => d[k])) || 1;
    y.domain([0, yMax]).nice();

    const yearGroups = g.selectAll('g.bar-group').data(data, d => d.year);
    const yearEnter = yearGroups.enter().append('g').attr('class', 'bar-group');
    yearEnter.merge(yearGroups).attr('transform', d => `translate(${x0(d.year)},0)`);
    yearGroups.exit().remove();

    yearEnter.merge(yearGroups).each(function(d) {
      const group = d3.select(this);
      const bars = group.selectAll('rect.metric-bar')
        .data(activeKeys.map(k => ({ key: k, value: d[k], year: d.year })), dd => dd.key);

      const barsEnter = bars.enter().append('rect')
        .attr('class', 'metric-bar')
        .attr('x', dd => x1(dd.key))
        .attr('y', height)
        .attr('width', x1.bandwidth())
        .attr('height', 0)
        .attr('fill', dd => color(dd.key))
        .attr('tabindex', 0)
        .on('mousemove', (event, dd) => showTooltip(event, dd))
        .on('focus', (event, dd) => showTooltip(event, dd))
        .on('blur mouseout', hideTooltip);

      barsEnter.transition().duration(800)
        .attr('y', dd => y(dd.value))
        .attr('height', dd => height - y(dd.value));

      bars.transition().duration(800)
        .attr('x', dd => x1(dd.key))
        .attr('width', x1.bandwidth())
        .attr('y', dd => y(dd.value))
        .attr('height', dd => height - y(dd.value))
        .attr('fill', dd => color(dd.key));

      bars.exit().transition().duration(400)
        .attr('y', height)
        .attr('height', 0)
        .remove();
    });

    const xAxis = d3.axisBottom(x0).tickFormat(d3.format('d'));
    const yAxis = d3.axisLeft(y).ticks(6);
    xAxisG.transition().duration(600).call(xAxis);
    yAxisG.transition().duration(600).call(yAxis);
  }

  update();
}
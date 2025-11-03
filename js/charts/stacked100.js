function renderStacked100Chart(container, datasets = {}) {
  const controlsSelector = '#stacked-100-controls';
  const svgSelector = '#stacked-100-svg';
  const tooltipSelector = '#stacked-100-tooltip';
  const svgWidth = 800;
  const svgHeight = 500;
  const margin = { top: 10, right: 150, bottom: 50, left: 150 };

  const root = d3.select(container);
  if (root.empty()) {
    console.warn('[stacked100] Container not found, abort.');
    return;
  }

  let controls = root.select(controlsSelector);
  if (controls.empty()) controls = root.append('div').attr('id', controlsSelector.slice(1));

  let svg = root.select(svgSelector);
  if (svg.empty()) svg = root.append('svg').attr('id', svgSelector.slice(1));

  let tooltip = root.select(tooltipSelector);
  if (tooltip.empty()) {
    tooltip = root
      .append('div')
      .attr('id', tooltipSelector.slice(1))
      .classed('chart-tooltip', true)
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('display', 'none');
  } else {
    tooltip.classed('chart-tooltip', true);
  }

  const containerNode = root.node();
  if (containerNode && getComputedStyle(containerNode).position === 'static') {
    root.style('position', 'relative');
  }

  svg.selectAll('*').remove();
  controls.selectAll('*').remove();
  tooltip.style('display', 'none');

  svg
    .attr('role', 'img')
    .attr('aria-label', '100% stacked bar chart: violence against civilians vs other political violence by country');

  controls.attr('class', 'd-flex flex-wrap justify-content-center align-items-center gap-4 mb-3');

  const controlsRow = controls.append('div').attr('class', 'd-flex align-items-center gap-2');

  controlsRow
    .append('label')
    .attr('for', 'stacked-100-year-select')
    .attr('class', 'text-uppercase small fw-semibold mb-0')
    .text('Year');

  const yearSelect = controlsRow
    .append('select')
    .attr('id', 'stacked-100-year-select')
    .attr('class', 'form-select form-select-sm');

  const scaleToggle = controlsRow
    .append('button')
    .attr('type', 'button')
    .attr('id', 'stacked-100-scale-toggle')
    .attr('class', 'btn btn-sm btn-outline-secondary')
    .style('white-space', 'nowrap')
    .text('Scale: %');

  const innerWidth = svgWidth - margin.left - margin.right;
  const innerHeight = svgHeight - margin.top - margin.bottom;

  svg
    .attr('width', svgWidth)
    .attr('height', svgHeight)
    .style('max-width', '100%')
    .style('height', 'auto')
    .style('display', 'block');

  const chartG = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const color = d3
    .scaleOrdinal()
    .domain(['civilians', 'other'])
    .range([getDatasetColor(DATASET_KEYS.TARGET_CIVIL_EVENT), getDatasetColor(DATASET_KEYS.OTHER_POLITICAL_VIOLENCE)]);

  const totalRaw = datasets.politicalViolenceEvents || [];
  const civiliansRaw = datasets.targetingCiviliansEvents || [];
  const countriesFilterRaw = datasets.countries || [];

  const countriesFilter =
    countriesFilterRaw.length > 0
      ? new Set(
          countriesFilterRaw
            .map(r => r.Country || r.CountryName || r.country || r['Country '])
            .filter(Boolean)
            .map(v => v.trim())
        )
      : null;

  const normalizeTotal = d => ({
    country: (d.COUNTRY || d.Country || d.country || '').trim(),
    year: String(d.YEAR || d.Year || d.year),
    total: +(d.EVENTS || d.Events || d.events || 0)
  });

  const normalizeCiv = d => ({
    country: (d.COUNTRY || d.Country || d.country || '').trim(),
    year: String(d.YEAR || d.Year || d.year),
    civilians: +(d.EVENTS || d.Events || d.events || 0)
  });

  const totals = totalRaw.map(normalizeTotal);
  const civs = civiliansRaw.map(normalizeCiv);

  const makeKey = (c, y) => `${c}||${y}`;
  const agg = new Map();

  for (const d of totals) {
    if (countriesFilter && !countriesFilter.has(d.country)) continue;
    const k = makeKey(d.country, d.year);
    const acc = agg.get(k) || { country: d.country, year: d.year, total: 0, civilians: 0 };
    acc.total += d.total;
    agg.set(k, acc);
  }

  for (const d of civs) {
    if (countriesFilter && !countriesFilter.has(d.country)) continue;
    const k = makeKey(d.country, d.year);
    const acc = agg.get(k) || { country: d.country, year: d.year, total: 0, civilians: 0 };
    acc.civilians += d.civilians;
    agg.set(k, acc);
  }

  const data = Array.from(agg.values()).map(r => ({
    country: r.country,
    year: r.year,
    civilians: r.civilians,
    other: Math.max(r.total - r.civilians, 0)
  }));

  let currentScaleMode = 'percent';

  const years = filterYearsRange(Array.from(new Set(data.map(d => d.year))).sort());
  yearSelect.selectAll('option').data(years).join('option').attr('value', d => d).text(d => d);

  if (years.length) {
    const preferredYear = years.includes('2024') ? '2024' : years[years.length - 1];
    yearSelect.property('value', preferredYear);
  }

  const xScale = d3.scaleLinear().range([0, innerWidth]);
  const yScale = d3.scaleBand().range([0, innerHeight]).padding(0.12);

  const xAxis = d3.axisBottom(xScale).tickFormat(d3.format('.0%'));
  const yAxis = d3.axisLeft(yScale);

  const xAxisG = chartG.append('g').attr('transform', `translate(0,${innerHeight})`);
  const yAxisG = chartG.append('g');

  const legendData = [
    { key: 'civilians', label: 'Violence against civilians' },
    { key: 'other', label: 'Other political violence' }
  ];

  const legend = svg.append('g').attr('class', 'legend');

  const legendItems = legend
    .selectAll('.legend-item')
    .data(legendData)
    .join(enter => {
      const g = enter.append('g').attr('class', 'legend-item');
      g.append('rect').attr('width', 16).attr('height', 16).attr('fill', d => color(d.key)).attr('stroke', '#333').attr('stroke-width', 0.5);
      g.append('text').attr('x', 24).attr('y', 13).attr('font-size', '14px').text(d => d.label);
      return g;
    });

  let legendCursor = 0;
  legendItems.each(function () {
    const bbox = this.getBBox();
    d3.select(this).attr('transform', `translate(${legendCursor},0)`);
    legendCursor += bbox.width + 40;
  });

  const legendWidth = legendCursor - 40;
  const legendY = svgHeight - margin.bottom + 35;
  const legendX = margin.left + (innerWidth - legendWidth) / 2;
  legend.attr('transform', `translate(${legendX},${legendY})`);

  function update(year, scaleMode = currentScaleMode) {
    const filtered = data.filter(d => d.year === year);

    const byCountry = Array.from(
      d3.rollups(
        filtered,
        vals => ({
          civilians: d3.sum(vals, v => v.civilians),
          other: d3.sum(vals, v => v.other)
        }),
        d => d.country
      ),
      ([country, vals]) => ({ country, ...vals })
    );

    if (scaleMode === 'percent') {
      byCountry.sort(
        (a, b) => b.civilians / ((b.civilians + b.other) || 1) - a.civilians / ((a.civilians + a.other) || 1)
      );
    } else {
      byCountry.sort((a, b) => b.civilians - a.civilians);
    }

    let stackData;

    if (scaleMode === 'percent') {
      stackData = byCountry.map(d => {
        const tot = d.civilians + d.other || 1;
        return {
          country: d.country,
          civilians: d.civilians / tot,
          other: d.other / tot,
          _tot: tot,
          _civ: d.civilians,
          _other: d.other
        };
      });
      xScale.domain([0, 1]);
      xAxis.tickFormat(d3.format('.0%'));
    } else {
      const maxTot = d3.max(byCountry, d => d.civilians + d.other) || 1;
      stackData = byCountry.map(d => ({
        country: d.country,
        civilians: d.civilians,
        other: d.other,
        _tot: d.civilians + d.other,
        _civ: d.civilians,
        _other: d.other
      }));
      xScale.domain([0, maxTot]);
      xAxis.tickFormat(d3.format('~s'));
    }

    yScale.domain(stackData.map(d => d.country));

    const stack = d3.stack().keys(['civilians', 'other']);
    const layers = stack(stackData);

    const layerG = chartG.selectAll('.layer').data(layers, d => d.key);

    layerG
      .enter()
      .append('g')
      .attr('class', 'layer')
      .attr('fill', d => color(d.key))
      .merge(layerG)
      .selectAll('rect')
      .data(d => d.map((p, i) => Object.assign({}, p, { key: d.key, country: stackData[i].country })))
      .join(
        enter =>
          enter
            .append('rect')
            .attr('x', d => xScale(d[0]))
            .attr('y', (d, i) => yScale(stackData[i].country))
            .attr('height', yScale.bandwidth())
            .attr('width', d => xScale(d[1]) - xScale(d[0]))
            .attr('tabindex', 0)
            .on('mousemove focus', (event, d) => {
              const original = byCountry.find(r => r.country === d.country) || { civilians: 0, other: 0 };
              const totalCount = original.civilians + original.other;
              const segmentCount = d.key === 'civilians' ? original.civilians : original.other;
              const pct = totalCount ? (segmentCount / totalCount) * 100 : 0;
              tooltip
                .style('display', 'block')
                .html(
                  `<strong>${d.country}</strong><br>` +
                    `${d.key === 'civilians' ? 'Violence against civilians' : 'Other political violence'}: ${segmentCount} (${pct.toFixed(
                      1
                    )}%)<br>` +
                    `Total political violence events: ${totalCount}`
                );

              let x, y;
              if (event.type === 'mousemove') {
                [x, y] = d3.pointer(event, containerNode);
              } else {
                const ref = containerNode.getBoundingClientRect();
                const rect = event.currentTarget.getBoundingClientRect();
                x = rect.left - ref.left + rect.width / 2;
                y = rect.top - ref.top + rect.height / 2;
              }
              tooltip.style('left', `${x + 16}px`).style('top', `${y + 18}px`);
            })
            .on('blur mouseleave', () => tooltip.style('display', 'none')),
        updateSel =>
          updateSel
            .transition()
            .duration(600)
            .attr('x', d => xScale(d[0]))
            .attr('y', (d, i) => yScale(stackData[i].country))
            .attr('height', yScale.bandwidth())
            .attr('width', d => xScale(d[1]) - xScale(d[0]))
      );

    xAxisG.transition().duration(600).call(xAxis);
    yAxisG.transition().duration(600).call(yAxis);
  }

  const initialYear = yearSelect.property('value') || years[0];
  if (initialYear) update(initialYear, currentScaleMode);

  yearSelect.on('change', function () {
    update(this.value, currentScaleMode);
  });

  scaleToggle.on('click', function () {
    currentScaleMode = currentScaleMode === 'percent' ? 'absolute' : 'percent';
    scaleToggle.text(currentScaleMode === 'percent' ? 'Scale: %' : 'Scale: values');
    update(yearSelect.property('value'), currentScaleMode);
  });
}
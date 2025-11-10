function renderWaffleChart(container, datasets) {
  const root = d3.select(container);
  const countrySelect = root.select('#waffle-country-select');
  const yearSelect = root.select('#waffle-year-select');
  const svg = root.select('#waffle-svg');
  let tooltip = root.select('#waffle-tooltip');
  const storyEl = root.select('#waffle-story');

  if (tooltip.empty()) {
    tooltip = root
      .append('div')
      .attr('id', 'waffle-tooltip')
      .classed('chart-tooltip', true)
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('display', 'none');
  } else {
    tooltip.classed('chart-tooltip', true);
  }

  const totalEventsRaw = datasets.politicalViolenceEvents || [];
  const civilianEventsRaw = datasets.targetingCiviliansEvents || [];

  function normalizeRecord(r) {
    return {
      country: (r.COUNTRY || r.Country || r.country || '').trim(),
      year: String(r.YEAR || r.Year || r.year),
      events: +(r.EVENTS || r.Events || r.events || 0)
    };
  }

  const totalEvents = totalEventsRaw.map(normalizeRecord);
  const civilianEvents = civilianEventsRaw.map(normalizeRecord);

  const totalByKey = new Map();
  for (const d of totalEvents) {
    const k = `${d.country}||${d.year}`;
    totalByKey.set(k, (totalByKey.get(k) || 0) + d.events);
  }

  const civiliansByKey = new Map();
  for (const d of civilianEvents) {
    const k = `${d.country}||${d.year}`;
    civiliansByKey.set(k, (civiliansByKey.get(k) || 0) + d.events);
  }

  const countries = Array.from(new Set([...totalEvents, ...civilianEvents].map(d => d.country))).sort();
  const years = filterYearsRange(Array.from(new Set([...totalEvents, ...civilianEvents].map(d => d.year))).sort());

  countrySelect
    .selectAll('option')
    .data(countries, d => d)
    .join(
      enter => enter.append('option').attr('value', d => d).text(d => d),
      update => update,
      exit => exit.remove()
    );

  countrySelect.property('value', countries.includes('Palestine') ? 'Palestine' : countries[0]);

  yearSelect
    .selectAll('option')
    .data(years, d => d)
    .join(
      enter => enter.append('option').attr('value', d => d).text(d => d),
      update => update,
      exit => exit.remove()
    );

  const defaultYear = years.includes('2024') ? '2024' : years[years.length - 1];
  yearSelect.property('value', defaultYear);

  const chartSize = 300;
  const columns = 10;
  const cellSpacing = 4;
  const cellSide = Math.floor((chartSize - (columns - 1) * cellSpacing) / columns);

  svg.selectAll('*').remove();
  svg.attr('width', chartSize).attr('height', chartSize + 30);

  const gridG = svg.append('g').attr('transform', 'translate(0,0)');
  const legendG = svg.append('g').attr('transform', `translate(0,${chartSize + 10})`);

  const legendData = [
    { key: 'civilians', label: 'Violence against civilians', color: getDatasetColor(DATASET_KEYS.TARGET_CIVIL_EVENT) },
    { key: 'other', label: 'Other political violence', color: getDatasetColor(DATASET_KEYS.OTHER_POLITICAL_VIOLENCE) }
  ];

  const legendItems = legendG
    .selectAll('.legend-item')
    .data(legendData)
    .join(enter => {
      const g = enter.append('g').attr('class', 'legend-item').attr('transform', (d, i) => `translate(${i * 240},0)`);
      g.append('rect').attr('width', 18).attr('height', 18).attr('fill', d => d.color).attr('stroke', '#333').attr('stroke-width', 0.6);
      g.append('text').attr('x', 26).attr('y', 13).style('font-size', '14px').text(d => d.label);
      return g;
    });

  tooltip
    .style('background', 'rgba(0,0,0,0.75)')
    .style('color', '#fff')
    .style('padding', '6px 8px')
    .style('font-size', '12px')
    .style('border-radius', '4px');

  const cells = d3.range(100).map(i => ({ index: i, r: Math.floor(i / columns), c: i % columns }));

  const cellSel = gridG
    .selectAll('rect.cell')
    .data(cells)
    .join(enter =>
      enter
        .append('rect')
        .attr('class', 'cell')
        .attr('width', cellSide)
        .attr('height', cellSide)
        .attr('x', d => d.c * (cellSide + cellSpacing))
        .attr('y', d => d.r * (cellSide + cellSpacing))
        .attr('rx', 3)
        .attr('ry', 3)
        .attr('fill', '#f0f0f0')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1)
        .attr('tabindex', 0)
        .style('cursor', 'default')
    );

  function render() {
    const country = countrySelect.property('value');
    const year = yearSelect.property('value');
    const key = `${country}||${year}`;
    const tot = totalByKey.get(key) || 0;
    const civ = civiliansByKey.get(key) || 0;
    const pct = tot > 0 ? (civ / tot) * 100 : 0;
    const filled = Math.min(100, Math.max(0, Math.round(pct)));

    const narrative =
      tot === 0
        ? `No events recorded for ${country} in ${year}.`
        : `In ${country} in ${year}, ${civ} events out of ${tot} (${pct.toFixed(1)}%) directly targeted civilians.`;

    storyEl.text(narrative);

    const civilColor = getDatasetColor(DATASET_KEYS.TARGET_CIVIL_EVENT);
    const otherColor = getDatasetColor(DATASET_KEYS.OTHER_POLITICAL_VIOLENCE);

    cellSel
      .transition()
      .duration(500)
      .attr('fill', d => (tot === 0 ? '#c2c2c2' : d.index < filled ? civilColor : otherColor));

    cellSel.attr('aria-label', (d, i) => (i === 0 ? narrative : null));
  }

  function buildTooltip(d) {
    const country = countrySelect.property('value');
    const year = yearSelect.property('value');
    const key = `${country}||${year}`;
    const tot = totalByKey.get(key) || 0;
    const civ = civiliansByKey.get(key) || 0;
    const civShare = tot > 0 ? (civ / tot) * 100 : 0;
    const otherCount = tot - civ;
    const otherShare = tot > 0 ? (otherCount / tot) * 100 : 0;
    const filled = Math.min(100, Math.max(0, Math.round(civShare)));

    if (tot === 0) {
      return {
        html: `<strong>${country}</strong><br>No events recorded`,
        color: '#c2c2c2'
      };
    }

    const isCivil = d.index < filled;
    const label = isCivil ? 'Violence against civilians' : 'Other political violence';
    const count = isCivil ? civ : otherCount;
    const color = isCivil ? getDatasetColor(DATASET_KEYS.TARGET_CIVIL_EVENT) : getDatasetColor(DATASET_KEYS.OTHER_POLITICAL_VIOLENCE);
    const share = isCivil ? civShare : otherShare;

    return {
      html: `<strong>${country}</strong><br>${label}: ${d3.format(',')(count)} (${share.toFixed(1)}%)<br>Total: ${d3.format(',')(tot)}`,
      color
    };
  }

  cellSel
    .on('mousemove', (event, d) => {
      const wrapperRect = root.node().getBoundingClientRect();
      const { html } = buildTooltip(d);
      const x = event.clientX - wrapperRect.left + 12;
      const y = event.clientY - wrapperRect.top + 12;
      tooltip.style('display', 'block').html(html).style('left', `${x}px`).style('top', `${y}px`);
    })
    .on('focus', (event, d) => {
      const wrapperRect = root.node().getBoundingClientRect();
      const cellRect = event.target.getBoundingClientRect();
      const { html } = buildTooltip(d);
      const x = cellRect.left - wrapperRect.left + cellRect.width / 2;
      const y = cellRect.top - wrapperRect.top - 8;
      tooltip.style('display', 'block').html(html).style('left', `${x}px`).style('top', `${y}px`);
    })
    .on('blur mouseout', () => {
      tooltip.style('display', 'none');
    });

  countrySelect.on('change', render);
  yearSelect.on('change', render);
  render();
}

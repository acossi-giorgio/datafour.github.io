function renderBoxPlotChart(container, datasets) {
  const root = d3.select(container);
  const svg = root.select('#box-plot-svg');
  let countrySelect = root.select('#boxplot-country-select');

  // Se il select non esiste nell'HTML, lo creo (fallback)
  if (countrySelect.empty()) {
    countrySelect = root
      .append('select')
      .attr('id', 'boxplot-country-select')
      .attr('class', 'form-select form-select-sm');
  }

  // --- trova un titolo, anche se è nel container padre ---
  let headingSel = root.select('#boxplot-title');
  if (headingSel.empty()) {
    headingSel = root.select('h1, h2, h3, h4, h5, h6');
    if (headingSel.empty()) {
      // prova anche nel genitore, nel caso il titolo sia fuori dal container
      const parent = root.node().parentNode;
      if (parent) headingSel = d3.select(parent).select('h1, h2, h3, h4, h5, h6');
    }
  }

  const headingNode = headingSel.node();
  const selectNode = countrySelect.node();

  if (headingNode && selectNode && headingNode.nextSibling !== selectNode) {
    headingNode.parentNode.insertBefore(selectNode, headingNode.nextSibling);

    d3.select(selectNode)
      .classed('mt-2 ms-auto me-auto', true)
      .style('display', 'block')
      .style('width', 'auto')
      .style('margin-bottom', '1.5rem'); // un po’ di spazio prima del grafico
  }

  // Tooltip stile barHorizontal / histogram
  function ensureTooltip() {
    let t = d3.select('#boxplot-tooltip');
    if (t.empty()) {
      t = d3.select('body').append('div').attr('id', 'boxplot-tooltip');
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
  const tooltip = ensureTooltip();

  // Layout coerente con gli altri grafici
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

  // Normalizzazione dati
  const normalizeEvents = d => ({
    country: (d.COUNTRY || d.Country || d.country || '').trim(),
    year: +(d.YEAR || d.Year || d.year),
    // file "number_of_..._events..." → colonna EVENTS
    events: +(d.EVENTS ?? d.Events ?? d.events ?? 0)
  });

  const normalizeFatalities = d => ({
    country: (d.COUNTRY || d.Country || d.country || '').trim(),
    year: +(d.YEAR || d.Year || d.year),
    // file "number_of_reported_civilian_fatalities..." → colonna FATALITIES
    events: +(d.FATALITIES ?? d.Fatalities ?? d.fatalities ?? 0)
  });

  const demoData = (datasets.demostrationEvents || [])
    .map(normalizeEvents)
    .filter(d => isYearInRange(d.year));

  const targetCivData = (datasets.targetingCiviliansEvents || [])
    .map(normalizeEvents)
    .filter(d => isYearInRange(d.year));

  const polViolenceData = (datasets.politicalViolenceEvents || [])
    .map(normalizeEvents)
    .filter(d => isYearInRange(d.year));

  const civFatalData = (datasets.civilianFatalities || [])
    .map(normalizeFatalities)
    .filter(d => isYearInRange(d.year));

  const allData = demoData.concat(targetCivData, polViolenceData, civFatalData);
  const countries = Array.from(new Set(allData.map(d => d.country)))
    .filter(d => d && d !== '')
    .sort((a, b) => a.localeCompare(b));

  // Popolo il select una sola volta
  if (countrySelect.attr('data-populated') !== '1') {
    countrySelect
      .selectAll('option')
      .data(countries)
      .join('option')
      .attr('value', d => d)
      .text(d => d);

    const defaultCountry = countries.includes('Syria') ? 'Syria' : countries[0];
    if (defaultCountry) {
      countrySelect.property('value', defaultCountry);
    }
    countrySelect.attr('data-populated', '1');
  }

  // Funzioni utili
  function valuesForCountry(dataArr, country) {
    return dataArr
      .filter(d => d.country === country)
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
    const whiskerLow = sorted.find(v => v >= lowerFence) ?? min;
    const whiskerHigh = [...sorted].reverse().find(v => v <= upperFence) ?? max;
    const outliers = sorted.filter(v => v < whiskerLow || v > whiskerHigh);
    return { q1, median, q3, whiskerLow, whiskerHigh, min, max, outliers };
  }

  // Scale & assi
  const xScale = d3
    .scaleBand()
    .range([0, width])
    .paddingInner(0.35)
    .paddingOuter(0.25);

  const yScale = d3.scaleLinear().range([plotBottom, 0]);

  const xAxisG = g.append('g').attr('transform', `translate(0,${plotBottom})`);
  const yAxisG = g.append('g');

  // Tooltip helpers
  function showTooltip(event, html) {
    tooltip
      .style('display', 'block')
      .style('opacity', 1)
      .html(html);

    let x = event.pageX + 14;
    let y = event.pageY + 16;
    const rect = tooltip.node().getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    let adjX = x;
    let adjY = y;
    if (adjX + rect.width + 8 > window.scrollX + vw) adjX = vw - rect.width - 8;
    if (adjY + rect.height + 8 > window.scrollY + vh) adjY = vh - rect.height - 8;
    tooltip.style('left', adjX + 'px').style('top', adjY + 'px');
  }

  function hideTooltip() {
    tooltip.style('opacity', 0).style('display', 'none');
  }

  function update() {
    const selectedCountry = countrySelect.property('value') || countries[0];

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

    const series = [
      {
        id: DATASET_KEYS.DEMONSTRATIONS,
        label: 'Demonstrations',
        values: valuesForCountry(demoData, selectedCountry),
        color: getDatasetColor(DATASET_KEYS.DEMONSTRATIONS)
      },
      {
        id: DATASET_KEYS.TARGET_CIVIL_EVENT,
        label: 'Targeting Civilians',
        values: valuesForCountry(targetCivData, selectedCountry),
        color: getDatasetColor(DATASET_KEYS.TARGET_CIVIL_EVENT)
      },
      {
        id: DATASET_KEYS.POLITICAL_VIOLENCE,
        label: 'Political Violence',
        values: valuesForCountry(polViolenceData, selectedCountry),
        color: getDatasetColor(DATASET_KEYS.POLITICAL_VIOLENCE)
      },
      {
        id: DATASET_KEYS.CIVILIAN_FATALITIES,
        label: 'Civilian Fatalities',
        values: valuesForCountry(civFatalData, selectedCountry),
        color: getDatasetColor(DATASET_KEYS.CIVILIAN_FATALITIES)
      }
    ]
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

    const allValues = series.flatMap(b =>
      (b.stats.outliers || []).concat([b.stats.whiskerLow, b.stats.whiskerHigh])
    );
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
    const jitterWidth = boxBodyWidth * 0.35;

    // Whisker
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

    // Box Q1–Q3
    boxGroups
      .append('rect')
      .attr('x', boxCenter - boxBodyWidth / 2)
      .attr('width', boxBodyWidth)
      .attr('y', d => yScale(d.stats.q3))
      .attr('height', d => Math.max(1, yScale(d.stats.q1) - yScale(d.stats.q3)))
      .attr('fill', d => d.color)
      .attr('fill-opacity', 0.75)
      .attr('stroke', '#333')
      .attr('tabindex', 0)
      .on('mousemove', (event, d) => {
        const s = d.stats;
        const fmt = d3.format(',');
        showTooltip(
          event,
          `<strong>${d.label}</strong><br>
           Q1: ${fmt(s.q1)}<br>
           Median: ${fmt(s.median)}<br>
           Q3: ${fmt(s.q3)}<br>
           Whisker low: ${fmt(s.whiskerLow)}<br>
           Whisker high: ${fmt(s.whiskerHigh)}`
        );
      })
      .on('mouseout blur', hideTooltip);

    // Mediana
    boxGroups
      .append('line')
      .attr('x1', boxCenter - boxBodyWidth / 2)
      .attr('x2', boxCenter + boxBodyWidth / 2)
      .attr('y1', d => yScale(d.stats.median))
      .attr('y2', d => yScale(d.stats.median))
      .attr('stroke', '#000')
      .attr('stroke-width', 1.5);

    // Outliers
    boxGroups.each(function (d) {
      const group = d3.select(this);
      const outliers = d.stats.outliers || [];
      group
        .selectAll('circle.outlier')
        .data(outliers)
        .enter()
        .append('circle')
        .attr('class', 'outlier')
        .attr('cx', () => boxCenter + (Math.random() - 0.5) * jitterWidth)
        .attr('cy', v => yScale(v))
        .attr('r', 3)
        .attr('fill', d.color)
        .attr('stroke', '#333')
        .on('mousemove', (event, v) => {
          const fmt = d3.format(',');
          showTooltip(
            event,
            `<strong>${d.label}</strong><br>Outlier: ${fmt(v)}`
          );
        })
        .on('mouseout blur', hideTooltip);
    });

    // Titolo asse Y
    g.selectAll('.y-axis-title').remove();
    g
      .append('text')
      .attr('class', 'y-axis-title')
      .attr('x', -plotBottom / 2)
      .attr('y', -60)
      .attr('transform', 'rotate(-90)')
      .attr('text-anchor', 'middle')
      .style('font-family', 'Roboto Slab, serif')
      .style('font-size', '13px')
      .text('Number of events per year');
  }

  update();
  countrySelect.on('change.boxplot', update);
}

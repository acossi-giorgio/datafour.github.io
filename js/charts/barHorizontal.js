function renderBarHorizontalChart(container, datasets) {
  const root = d3.select(container);
  let yearSelect = root.select('#bar-horizontal-year-select');
  const sharedSelect = d3.select('#shared-year-select');
  const useShared = !sharedSelect.empty();
  if (useShared) {
    yearSelect = sharedSelect;
  }
  const svg = root.select('#bar-horizontal-svg');

  function ensureTooltip() {
    let t = d3.select('#bar-horizontal-tooltip');
    if (t.empty()) {
      t = d3.select('body').append('div').attr('id', 'bar-horizontal-tooltip');
    } else {
      if (t.node().parentNode !== document.body) {
        const node = t.remove().node();
        t = d3.select('body').append(() => node);
      }
    }
    return t
      .classed('chart-tooltip', true)
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('display', 'none')
      .style('opacity', 0);
  }

  const tooltip = ensureTooltip();

  const sharedLayout = !d3.select('#fatalities-shared').empty();
  const margin = sharedLayout ? { top: 20, right: 80, bottom: 30, left: 80 } : { top: 10, right: 60, bottom: 20, left: 60 };
  const fullWidth = sharedLayout ? 500 : 700;
  const fullHeight = sharedLayout ? 420 : 300;
  const width = fullWidth - margin.left - margin.right;
  const height = fullHeight - margin.top - margin.bottom;

  svg.attr('width', fullWidth).attr('height', fullHeight);
  svg.selectAll('g.chart-root').remove();
  const g = svg.append('g').attr('class', 'chart-root').attr('transform', `translate(${margin.left},${margin.top})`);

  const countriesSet = new Set(datasets.countries.map(d => d.Country.trim()));
  const fatalities = datasets.civilianFatalities
    .map(d => ({ country: d.COUNTRY, year: +d.YEAR, fatalities: d.FATALITIES || 0 }))
    .filter(d => countriesSet.has(d.country));

  const years = filterYearsRange([...new Set(fatalities.map(d => d.year))].sort((a, b) => a - b));
  if (yearSelect.attr('data-populated') !== '1') {
    yearSelect.selectAll('option').data(years).join('option').attr('value', d => d).text(d => d);
    yearSelect.property('value', years[years.length - 1]);
    yearSelect.attr('data-populated', '1');
  }

  const xScale = d3.scaleLinear().range([0, width]);
  const yScale = d3.scaleBand().range([0, height]).padding(0.25);
  const xAxisG = g.append('g').attr('transform', `translate(0,${height})`);
  const yAxisG = g.append('g');
  const barColor = getDatasetColor(DATASET_KEYS.CIVILIAN_FATALITIES);

  const formatNum = d3.format(',');

  function computeTop10(year) {
    const filtered = fatalities.filter(d => d.year === +year);
    return d3
      .rollups(filtered, v => d3.sum(v, d => d.fatalities), d => d.country)
      .map(([country, fatalities]) => ({ country, fatalities }))
      .sort((a, b) => b.fatalities - a.fatalities)
      .slice(0, 10);
  }

  function update(year) {
    const data = computeTop10(year);
    xScale.domain([0, d3.max(data, d => d.fatalities) || 1]).nice();
    yScale.domain(data.map(d => d.country));

    g.selectAll('.fatality-bar')
      .data(data, d => d.country)
      .join(
        enter =>
          enter
            .append('rect')
            .attr('class', 'fatality-bar')
            .attr('x', 1)
            .attr('y', d => yScale(d.country))
            .attr('height', yScale.bandwidth())
            .attr('width', 0)
            .attr('fill', barColor)
            .on('mousemove', (event, d) => {
              tooltip
                .style('display', 'block')
                .style('opacity', 1)
                .html(`<div style="text-align: center;"><strong>${d.country}</strong></div>Fatalities: ${formatNum(d.fatalities)}`);
              const x = event.pageX + 14;
              const y = event.pageY + 16;
              const rect = tooltip.node().getBoundingClientRect();
              const vw = document.documentElement.clientWidth;
              const vh = document.documentElement.clientHeight;
              let adjX = x, adjY = y;
              if (adjX + rect.width + 8 > window.scrollX + vw) adjX = vw - rect.width - 8;
              if (adjY + rect.height + 8 > window.scrollY + vh) adjY = vh - rect.height - 8;
              tooltip.style('left', adjX + 'px').style('top', adjY + 'px');
            })
            .on('mouseout', () => tooltip.style('opacity', 0).style('display', 'none'))
            .call(enter => enter.transition().duration(800).attr('width', d => xScale(d.fatalities))),
        update =>
          update.call(sel =>
            sel
              .transition()
              .duration(600)
              .attr('y', d => yScale(d.country))
              .attr('height', yScale.bandwidth())
              .attr('width', d => xScale(d.fatalities))
              .attr('fill', barColor)
          ),
        exit => exit.transition().duration(400).attr('width', 0).remove()
      );

    g.selectAll('.fatality-label')
      .data(data, d => d.country)
      .join(
        enter =>
          enter
            .append('text')
            .attr('class', 'fatality-label')
            .attr('x', d => xScale(d.fatalities) + 4)
            .attr('y', d => yScale(d.country) + yScale.bandwidth() / 2)
            .attr('dominant-baseline', 'middle')
            .attr('font-size', '12px')
            .attr('fill', '#333')
            .text(d => formatNum(d.fatalities))
            .style('opacity', 0)
            .call(enter => enter.transition().duration(800).style('opacity', 1)),
        update =>
          update.call(sel =>
            sel
              .transition()
              .duration(600)
              .attr('x', d => xScale(d.fatalities) + 4)
              .attr('y', d => yScale(d.country) + yScale.bandwidth() / 2)
              .text(d => formatNum(d.fatalities))
          ),
        exit => exit.transition().duration(400).style('opacity', 0).remove()
      );

  const tickCount = sharedLayout ? 4 : 6;
  const xAxis = d3.axisBottom(xScale).ticks(tickCount).tickFormat(formatNum);
    const yAxis = d3.axisLeft(yScale);
    xAxisG.transition().duration(600).call(xAxis);
    yAxisG.transition().duration(600).call(yAxis);
  }

  update(yearSelect.property('value'));
  yearSelect.on('change.barHorizontal', function () {
    update(this.value);
  });
}
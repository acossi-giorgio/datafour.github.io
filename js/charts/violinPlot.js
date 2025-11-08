function renderViolinPlot(container, datasets) {
  // Se esiste già un grafico precedente lo rimuovo
  d3.select(container).selectAll('svg').remove();

  const countrySelect = document.getElementById('violin-country-select');
  const subTypeSelect = document.getElementById('violin-subtype-select');
  const chartHolder = document.getElementById('violin-chart-inner');

  const raw = (datasets.meaAggregatedData || []).map(d => ({
    country: (d.COUNTRY || d.Country || '').trim(),
    subType: (d.SUB_EVENT_TYPE || d.SubEventType || '').trim(),
    events: +((d.EVENTS != null && d.EVENTS !== '') ? d.EVENTS : 0),
    year: +(d.YEAR || d.Year || 0)
  })).filter(d => d.year && !isNaN(d.events));

    const countries = Array.from(new Set(raw.map(d => d.country))).sort((a,b)=>a.localeCompare(b));
    countries.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c; countrySelect.appendChild(opt);
    });
    // Default Palestine se presente
    if (countries.includes('Palestine')) countrySelect.value = 'Palestine';

  function updateSubTypeOptions(selectedCountry) {
    if (!subTypeSelect) return;
    const prevVal = subTypeSelect.value;
    subTypeSelect.innerHTML = '';
    const subTypes = Array.from(new Set(raw.filter(d => d.country === selectedCountry).map(d => d.subType))).sort((a,b)=>a.localeCompare(b));
    subTypes.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s; subTypeSelect.appendChild(opt);
    });
    // Default Peaceful protest se esiste
    if (subTypes.includes('Peaceful protest')) {
      subTypeSelect.value = 'Peaceful protest';
    } else if (prevVal && subTypes.includes(prevVal)) {
      subTypeSelect.value = prevVal;
    }
  }

  if (countrySelect && subTypeSelect) {
    updateSubTypeOptions(countrySelect.value || raw[0]?.country);
  }

  // Disegno vero e proprio incapsulato
  function drawViolin(country, subType) {
    // Cleanup precedente
    d3.select(chartHolder).selectAll('svg').remove();
    d3.selectAll('.violin-tooltip').remove();

    const data = raw.filter(d => (!country || d.country === country) && (!subType || d.subType === subType));

    const margin = { top: 20, right: 30, bottom: 40, left: 60 },
      width = 800 - margin.left - margin.right,
      height = 420 - margin.top - margin.bottom;

    const svg = d3.select(chartHolder)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    if (!data.length) {
      svg.append('text')
        .attr('x', width/2)
        .attr('y', height/2)
        .attr('text-anchor', 'middle')
        .style('font', '14px sans-serif')
        .text('Nessun dato disponibile');
      return;
    }

    const byYearMap = d3.group(data, d => d.year);
    const years = Array.from(byYearMap.keys()).sort((a,b)=>a-b);
    const yearData = years.map(y => ({ year: y, values: byYearMap.get(y).map(d => d.events) })).filter(d => d.values.length);

    if (!yearData.length) {
      svg.append('text')
        .attr('x', width/2)
        .attr('y', height/2)
        .attr('text-anchor', 'middle')
        .style('font', '14px sans-serif')
        .text('Dati insufficienti');
      return;
    }

    const allValues = yearData.flatMap(d => d.values);
    const maxVal = d3.max(allValues);
    const y = d3.scaleLinear().domain([0, maxVal * 1.05]).range([height, 0]);
    svg.append('g').call(d3.axisLeft(y));

    const x = d3.scaleBand().domain(yearData.map(d => d.year)).range([0, width]).padding(0.12);
    svg.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x));

    const histogram = d3.histogram().domain(y.domain()).thresholds(y.ticks(30)).value(d => d);
    const sumstat = yearData.map(d => {
      const bins = histogram(d.values);
      // Trova ultimo bin con conteggio >0 per evitare la "linea fino in cima" di soli zeri
      let lastIdx = -1;
      for (let i = 0; i < bins.length; i++) {
        if (bins[i].length > 0) lastIdx = i;
      }
      const trimmed = lastIdx >= 0 ? bins.slice(0, lastIdx + 1) : [];
      return { key: d.year, bins: trimmed, raw: d.values };
    });

    let maxCount = 0; sumstat.forEach(s => { const m = d3.max(s.bins.map(b => b.length)); if (m > maxCount) maxCount = m; });
    const xNum = d3.scaleLinear().domain([-maxCount, maxCount]).range([0, x.bandwidth()]);

    const tooltip = d3.select('body').append('div')
      .attr('class', 'violin-tooltip')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('background', 'rgba(255,255,255,0.95)')
      .style('border', '1px solid #666')
      .style('border-radius', '4px')
      .style('padding', '6px 8px')
      .style('font', '12px sans-serif')
      .style('color', '#222')
      .style('box-shadow', '0 2px 4px rgba(0,0,0,0.15)')
      .style('opacity', 0);

    const statsMap = new Map();
    sumstat.forEach(s => { const vals = s.raw; statsMap.set(s.key, { count: vals.length, mean: d3.mean(vals).toFixed(2), median: d3.median(vals).toFixed(2), min: d3.min(vals).toFixed(2), max: d3.max(vals).toFixed(2) }); });

    const groups = svg.selectAll('.violin').data(sumstat).enter().append('g').attr('class','violin').attr('transform', d => `translate(${x(d.key)},0)`);

    groups.each(function(d) {
      if (d.raw.length === 1) {
        // Singolo valore: se è 0 non disegno nulla, altrimenti punto + linea
        if (d.raw[0] === 0) return;
        d3.select(this).append('circle').attr('cx', x.bandwidth()/2).attr('cy', y(d.raw[0])).attr('r',5).style('fill','#69b3a2').style('stroke','#333');
        d3.select(this).append('line').attr('x1', x.bandwidth()/2 - 8).attr('x2', x.bandwidth()/2 + 8).attr('y1', y(d.raw[0])).attr('y2', y(d.raw[0])).style('stroke','#333');
        return;
      }
      if (!d.bins.length) return; // niente dati reali
      d3.select(this)
        .append('path')
        .datum(d.bins)
        .attr('d', d3.area()
          .x0(b => xNum(-b.length))
          .x1(b => xNum(b.length))
          .y(b => y(b.x0))
          .curve(d3.curveCatmullRom))
        .style('fill','#69b3a2')
        .style('opacity',0.85)
        .style('stroke','#333')
        .style('stroke-width',0.6);
    });

    groups.on('mouseover', function(event, d) { const stats = statsMap.get(d.key); tooltip.style('opacity',1).html(`<strong>Anno ${d.key}</strong><br/>n: ${stats.count}<br/>media: ${stats.mean}<br/>mediana: ${stats.median}<br/>min: ${stats.min}<br/>max: ${stats.max}`); })
      .on('mousemove', function(event) { tooltip.style('left', (event.pageX+12)+'px').style('top', (event.pageY-28)+'px'); })
      .on('mouseleave', function() { tooltip.transition().duration(150).style('opacity',0); });

    svg.append('text').attr('x', width/2).attr('y', height+32).attr('text-anchor','middle').style('font','12px sans-serif').text('Anno');
    svg.append('text').attr('transform','rotate(-90)').attr('x', -height/2).attr('y', -45).attr('text-anchor','middle').style('font','12px sans-serif').text('Events');
  }

  // Event listeners
  if (countrySelect) {
    countrySelect.addEventListener('change', () => {
      updateSubTypeOptions(countrySelect.value);
      drawViolin(countrySelect.value, subTypeSelect?.value);
    });
  }
  if (subTypeSelect) {
    subTypeSelect.addEventListener('change', () => {
      drawViolin(countrySelect?.value, subTypeSelect.value);
    });
  }

  // Primo render con default
  drawViolin(countrySelect?.value || raw[0]?.country, subTypeSelect?.value || 'Peaceful protest');
}
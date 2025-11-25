function renderCartogram(container, datasets) {
  const root = d3.select(container);
  if (root.empty()) {
    console.warn('Container not found for cartogram');
    return;
  }

  const svg = root.select('#cartogram-svg');
  if (svg.empty()) {
    console.warn('SVG element #cartogram-svg not found');
    return;
  }

  const yearSlider = root.select('#cartogram-year-slider');
  const yearLabel = root.select('#cartogram-year-slider-value');
  const playBtn = root.select('#cartogram-play-btn');
  const speedSlider = root.select('#cartogram-speed-slider');
  const speedLabel = root.select('#cartogram-speed-value');
  
  const zoomInBtn = root.select('#cartogram-zoom-in');
  const zoomOutBtn = root.select('#cartogram-zoom-out');
  const zoomResetBtn = root.select('#cartogram-zoom-reset');

  let animationInterval = null;
  let isPlaying = false;


  const TOOLTIP_ID = 'cartogram-tooltip';
  let tooltip = d3.select(`#${TOOLTIP_ID}`);
  if (tooltip.empty()) {
    tooltip = d3.select('body').append('div').attr('id', TOOLTIP_ID);
  }

  tooltip
    .classed('chart-tooltip', true)
    .style('position', 'fixed')
    .style('pointer-events', 'none')
    .style('display', 'none')
    .style('opacity', 0)
    .style('background', 'rgba(0, 0, 0, 0.9)')
    .style('color', '#fff')
    .style('padding', '8px 12px')
    .style('border-radius', '4px')
    .style('font-size', '12px')
    .style('font-family', 'sans-serif')
    .style('z-index', 10000)
    .style('white-space', 'nowrap')
    .style('box-shadow', '0 2px 8px rgba(0,0,0,0.3)');

  const margin = { top: 10, right: 20, bottom: 20, left: 20 };
  const fullWidth = 960;
  const fullHeight = 500;
  const width = fullWidth - margin.left - margin.right;
  const height = fullHeight - margin.top - margin.bottom;

  svg
    .attr('width', fullWidth)
    .attr('height', fullHeight)
    .style('max-width', '100%')
    .style('height', 'auto');

  svg.selectAll('g.chart-root').remove();
  
  svg.selectAll('rect.background').remove();
  svg.append('rect')
    .attr('class', 'background')
    .attr('width', fullWidth)
    .attr('height', fullHeight)
    .attr('fill', '#2d3436');
  
  const g = svg
    .append('g')
    .attr('class', 'chart-root')
    .attr('transform', `translate(${margin.left},${margin.top})`);
  const mapGroup = g.append('g').attr('class', 'map-group');

  const zoom = d3.zoom()
    .scaleExtent([1, 8])
    .translateExtent([[0, 0], [width, height]])
    .on('zoom', (event) => {
      mapGroup.attr('transform', event.transform);
    });

  svg.call(zoom);

  if (!zoomInBtn.empty()) {
    zoomInBtn.on('click', () => {
      svg.transition().duration(300).call(zoom.scaleBy, 1.3);
    });
  }

  if (!zoomOutBtn.empty()) {
    zoomOutBtn.on('click', () => {
      svg.transition().duration(300).call(zoom.scaleBy, 0.7);
    });
  }

  if (!zoomResetBtn.empty()) {
    zoomResetBtn.on('click', () => {
      svg.transition().duration(500).call(
        zoom.transform,
        d3.zoomIdentity.translate(0, 0).scale(1)
      );
    });
  }

  if (!datasets.countries || !datasets.politicalViolenceEvents) {
    return;
  }

  const countriesSet = new Set(datasets.countries.map(d => d.Country.trim()));
  const iso3Map = new Map(datasets.countries.map(d => [d.Country.trim(), d.iso3]));

  const aggregatedData = d3.rollup(
    datasets.politicalViolenceEvents,
    v => d3.sum(v, d => +d.EVENTS || 0),
    d => d.COUNTRY,
    d => +d.YEAR
  );

  const eventsData = [];
  aggregatedData.forEach((yearMap, country) => {
    yearMap.forEach((events, year) => {
      if (year && countriesSet.has(country)) {
        eventsData.push({
          country: country,
          year: year,
          events: events,
          iso3: iso3Map.get(country)
        });
      }
    });
  });

  const years = filterYearsRange(
    [...new Set(eventsData.map(d => d.year))].sort((a, b) => a - b)
  );

  if (years.length === 0) {
    console.error('No valid years found in the data');
    return;
  }

  yearSlider
    .attr('min', 0)
    .attr('max', years.length - 1)
    .attr('value', years.length - 1);

  yearLabel.text(years[years.length - 1]);

  const projection = d3.geoMercator()
    .scale(1200)
    .center([42, 33])
    .translate([width / 2, height / 2]);

  const path = d3.geoPath().projection(projection);

  const maxEvents = d3.max(eventsData, d => d.events) || 1;
  const colorScale = d3.scaleSequential()
    .domain([0, maxEvents])
    .interpolator(d3.interpolateRgb("#ffeaa7", "#d63031"));

  const radiusScale = d3.scaleSqrt()
    .domain([0, maxEvents])
    .range([0, 40]);
  const formatNum = d3.format(',');

  function showTooltip(event, html) {
    tooltip
      .html(html)
      .style('display', 'block')
      .style('opacity', 1);

    let x = event.clientX + 14;
    let y = event.clientY + 16;

    const rect = tooltip.node().getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (x + rect.width > vw - 8) {
      x = event.clientX - rect.width - 14;
    }
    if (y + rect.height > vh - 8) {
      y = event.clientY - rect.height - 14;
    }

    tooltip.style('left', `${x}px`).style('top', `${y}px`);
  }

  function hideTooltip() {
    tooltip.style('opacity', 0).style('display', 'none');
  }

  d3.json("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson")
    .then(function(topo) {
      // --- Legend (use bubble chart colors, spaced by text width) ---
      // Create legend bins based on maxEvents
      const legendSteps = 6;
      const breaks = d3.range(legendSteps).map(i => Math.round(i / (legendSteps - 1) * maxEvents));

      const legendData = breaks.map((b, i) => {
        let label;
        if (i === 0) label = '0';
        else if (i === legendSteps - 1) label = d3.format(',')(b) + '+';
        else label = d3.format(',')(breaks[i - 1] + 1) + '–' + d3.format(',')(b);

        // representative value for color: midpoint of the bin (or 0 for first)
        const rep = i === 0 ? 0 : Math.round((breaks[i - 1] + b) / 2);
        return { value: label, color: colorScale(rep) };
      });

      const legend = svg.append('g')
        .attr('class', 'legend')
        // position will be adjusted after measuring items to allow centering
        .attr('transform', `translate(0, ${height + margin.top - 465})`);

      const rectSize = 16;
      const textPadding = 8;
      const gapBetweenTexts = 30;

      const items = legend.selectAll('.legend-item')
        .data(legendData)
        .enter()
        .append('g')
        .attr('class', 'legend-item');

      items.append('rect')
        .attr('width', rectSize)
        .attr('height', rectSize)
        .attr('fill', d => d.color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5);

      items.append('text')
        .attr('x', rectSize + textPadding)
        .attr('y', rectSize / 2)
        .attr('alignment-baseline', 'middle')
        .style('font-size', '12px')
        .style('font-family', 'Roboto Slab, serif')
        .style('fill', '#fff')
        .text(d => d.value);

      // layout groups so gap between end of text and start of next group is constant
      let lx = 0;
      items.each(function() {
        const g = d3.select(this);
        const txt = g.select('text').node();
        const bbox = txt.getBBox();
        const groupWidth = rectSize + textPadding + bbox.width;
        g.attr('transform', `translate(${lx}, 0)`);
        lx += groupWidth + gapBetweenTexts;
      });

      // center legend horizontally within available chart width
      const totalLegendWidth = lx - gapBetweenTexts; // remove last added gap
      const startX = margin.left + Math.max(0, (width - totalLegendWidth) / 2);
      legend.attr('transform', `translate(${startX}, ${height + margin.top - 465})`);

      // --- end legend ---

      function update(yearIndex) {
        const selectedYear = years[yearIndex];
        yearLabel.text(selectedYear);
        const yearData = eventsData.filter(d => d.year === selectedYear);

        const meaIso3Set = new Set(Array.from(iso3Map.values()));

        mapGroup.selectAll('path.country')
          .data(topo.features)
          .join('path')
          .attr('class', 'country')
          .attr('d', path)
          .attr('fill', '#636e72')
          .attr('stroke', '#4a5459')
          .attr('stroke-width', 0.5);

        const bubbleData = yearData
          .filter(d => d.iso3)
          .map(d => {
            const feature = topo.features.find(f => f.id === d.iso3);
            if (feature) {
              const centroid = path.centroid(feature);
              return {
                ...d,
                x: centroid[0],
                y: centroid[1]
              };
            }
            return null;
          })
          .filter(d => d && !isNaN(d.x) && !isNaN(d.y));

        mapGroup.selectAll('circle.bubble')
          .data(bubbleData, d => d.iso3)
          .join(
            enter => enter.append('circle')
              .attr('class', 'bubble')
              .attr('cx', d => d.x)
              .attr('cy', d => d.y)
              .attr('r', 0)
              .attr('fill', d => colorScale(d.events))
              .attr('stroke', 'none')
              .attr('opacity', 0.7)
              .style('cursor', 'pointer')
              .call(enter => enter.transition()
                .duration(500)
                .attr('r', d => radiusScale(d.events))),
            update => update
              .call(update => update.transition()
                .duration(500)
                .attr('cx', d => d.x)
                .attr('cy', d => d.y)
                .attr('r', d => radiusScale(d.events))
                .attr('fill', d => colorScale(d.events))),
            exit => exit
              .call(exit => exit.transition()
                .duration(300)
                .attr('r', 0)
                .remove())
          )
          .on('mouseenter', (event, d) => {
            showTooltip(
              event,
              `<div style="text-align: center;"><strong>${d.country}</strong></div>` +
              `<strong>Year:</strong> ${selectedYear}<br/>` +
              `<strong>Political Violence Events:</strong> ${formatNum(d.events)}`
            );
            
            d3.select(event.currentTarget)
              .attr('opacity', 1);
          })
          .on('mousemove', (event, d) => {
            showTooltip(
              event,
              `<div style="text-align: center;"><strong>${d.country}</strong></div>` +
              `<strong>Year:</strong> ${selectedYear}<br/>` +
              `<strong>Political Violence Events:</strong> ${formatNum(d.events)}`
            );
          })
          .on('mouseleave', (event) => {
            hideTooltip();
            
            d3.select(event.currentTarget)
              .attr('opacity', 0.7);
          });

        g.selectAll('.year-label').remove();
        g.append('text')
          .attr('class', 'year-label')
          .attr('x', width - 10)
          .attr('y', height - 10)
          .attr('text-anchor', 'end')
          .attr('font-size', 48)
          .attr('font-weight', 'bold')
          .style('fill', '#ffffff')  
          .attr('opacity', 0.7)
          .text(selectedYear);
      }

      update(years.length - 1);


      yearSlider.on('input', function() {
        update(+this.value);
      });


      speedSlider.on('input', function() {
        const speed = +this.value;
        speedLabel.text((speed / 1000).toFixed(1) + 's');
        
        if (isPlaying) {
          clearInterval(animationInterval);
          startAnimation(speed);
        }
      });


      function startAnimation(speed) {
        animationInterval = setInterval(() => {
          let currentIndex = +yearSlider.property('value');
          currentIndex++;
          
          if (currentIndex >= years.length) {
            currentIndex = 0;
          }
          
          yearSlider.property('value', currentIndex);
          update(currentIndex);
        }, speed);
      }

      playBtn.on('click', function() {
        if (isPlaying) {
          clearInterval(animationInterval);
          animationInterval = null;
          isPlaying = false;
          playBtn.html('<i class="bi bi-play-fill"></i> Play');
          playBtn.classed('btn-primary', true).classed('btn-danger', false);
        } else {

          isPlaying = true;
          const speed = +speedSlider.property('value');
          playBtn.html('<i class="bi bi-stop-fill"></i> Stop');
          playBtn.classed('btn-primary', false).classed('btn-danger', true);
          startAnimation(speed);
        }
      });
    })
    .catch(function(error) {
      console.error('Error loading GeoJSON:', error);
      g.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('font-size', 16)
        .attr('fill', '#666')
        .text('Error loading map data');
    });
}
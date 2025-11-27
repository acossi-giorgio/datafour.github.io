function renderSymbolicMapChart(container, datasets) {
  const root = d3.select(container);
  if (root.empty()) {
    console.warn('Container not found for symbolic map');
    return;
  }

  const svg = root.select('#symbolic-map-svg');
  if (svg.empty()) {
    console.warn('SVG element #symbolic-map-svg not found');
    return;
  }

  let animationInterval = null;
  let isPlaying = false;

  const TOOLTIP_ID = 'symbolic-map-tooltip';
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

  if (!datasets.countries || !datasets.aggregatedMapData) {
    console.error('Missing required datasets: countries or aggregatedMapData');
    return;
  }

  const countriesSet = new Set(datasets.countries.map(d => d.Country.trim()));
  const iso3Map = new Map(datasets.countries.map(d => [d.Country.trim(), d.iso3]));
  function parseCoordinate(coord) {
    if (!coord) return NaN;
    return parseFloat(coord.toString().replace(',', '.'));
  }
  const eventTypes = {
    'Shelling/artillery/missile attack': { color: '#d8a305ff', label: 'Shelling/Artillery/Missile' },
    'Air/drone strike': { color: '#d8a305ff', label: 'Air/Drone Strike' },
    'Remote explosive/landmine/IED': { color: '#d8a305ff', label: 'IED/Landmine' }
  };

  const eventsData = datasets.aggregatedMapData
    .map(d => ({
      country: d.COUNTRY?.trim() || '',
      year: +d.YEAR,
      eventType: d.EVENT_TYPE?.trim(),
      subEventType: d.SUB_EVENT_TYPE?.trim(),
      lat: parseCoordinate(d.CENTROID_LATITUDE),
      lon: parseCoordinate(d.CENTROID_LONGITUDE),
      events: +(d.EVENTS || 0),
      fatalities: +(d.FATALITIES || 0),
      iso3: iso3Map.get(d.COUNTRY?.trim())
    }))
    .filter(d => 
      d.country && 
      countriesSet.has(d.country) && 
      !isNaN(d.year) &&
      !isNaN(d.lat) &&
      !isNaN(d.lon) &&
      eventTypes[d.subEventType]
    );

  console.log('Filtered events data:', eventsData.length, 'events');

  const years = filterYearsRange(
    [...new Set(eventsData.map(d => d.year))]
      .sort((a, b) => a - b)
  );

  if (years.length === 0) {
    console.error('No valid years found in the data');
    return;
  }

  const yearSlider = root.select('#symbolic-year-slider');
  const yearLabel = root.select('#symbolic-year-slider-value');
  
  if (yearSlider.empty()) {
    console.warn('Year slider element #symbolic-year-slider not found');
    return;
  }

  const eventSelect = root.select('#symbolic-event-select');
  if (eventSelect.empty()) {
    console.warn('Event select element #symbolic-event-select not found');
    return;
  }

  const playBtn = root.select('#symbolic-play-btn');
  const speedSlider = root.select('#symbolic-speed-slider');
  const speedLabel = root.select('#symbolic-speed-value');

  const zoomInBtn = root.select('#symbolic-zoom-in');
  const zoomOutBtn = root.select('#symbolic-zoom-out');
  const zoomResetBtn = root.select('#symbolic-zoom-reset');
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

  yearSlider
    .attr('min', 0)
    .attr('max', years.length - 1)
    .attr('value', years.length - 1);

  yearLabel.text(years[years.length - 1]);

  eventSelect
    .selectAll('option')
    .data(Object.entries(eventTypes))
    .join('option')
    .attr('value', d => d[0])
    .text(d => d[1].label);

  eventSelect.property('value', Object.keys(eventTypes)[0]);

  const projection = d3.geoMercator()
    .scale(800)
    .center([45, 27])
    .translate([width / 2, height / 2]);

  const path = d3.geoPath().projection(projection);

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
      
      const baseMapGroup = mapGroup.append('g').attr('class', 'base-map-group');
      
      const spikesGroup = mapGroup.append('g').attr('class', 'spikes-group');

      function update(yearIndex, selectedEventType) {
        const selectedYear = years[yearIndex];
        yearLabel.text(selectedYear);

        const yearEvents = eventsData.filter(d => 
          d.year === selectedYear && d.subEventType === selectedEventType
        );
        
        console.log(`Year ${selectedYear}, Event: ${selectedEventType}: ${yearEvents.length} events`);

        const maxFatalitiesForYear = d3.max(yearEvents, d => d.fatalities) || 1;
        const spikeHeightScale = d3.scaleSqrt()
          .domain([0, maxFatalitiesForYear])
          .range([0, 80]);

        updateLegend(yearIndex, selectedEventType);

        baseMapGroup.selectAll('path.country')
          .data(topo.features)
          .join('path')
          .attr('class', 'country')
          .attr('d', path)
          .attr('fill', '#e8e8e8')
          .attr('stroke', '#fff')
          .attr('stroke-width', 0.5);

        const spikes = spikesGroup.selectAll('g.spike')
          .data(yearEvents, (d, i) => `${d.country}-${d.lat}-${d.lon}-${i}`);

        spikes.exit()
          .transition()
          .duration(500)
          .style('opacity', 0)
          .remove();

        const spikeEnter = spikes.enter()
          .append('g')
          .attr('class', 'spike')
          .style('opacity', 0);

        const spikesMerged = spikeEnter.merge(spikes);
        
        spikeEnter.transition()
          .duration(500)
          .style('opacity', 1);

        const mapSpikeWidth = 7;
        
        spikesMerged.each(function(d) {
          const spike = d3.select(this);
          const existingPath = spike.select('.spike-path');
          const isNewSpike = existingPath.empty();
          
          if (isNewSpike) {
            spike.selectAll('*').remove();
          }

          const [x, y] = projection([d.lon, d.lat]);
          const h = spikeHeightScale(d.fatalities);
          const spikeColor = eventTypes[d.subEventType].color;

          if (h > 0) {
            const targetPath = `M${x - mapSpikeWidth / 2},${y} L${x},${y - h} L${x + mapSpikeWidth / 2},${y} Z`;
            
            if (isNewSpike) {
              const startPath = `M${x - mapSpikeWidth / 2},${y} L${x},${y} L${x + mapSpikeWidth / 2},${y} Z`;
              
              spike.append('path')
                .attr('class', 'spike-path')
                .attr('d', startPath)
                .attr('fill', spikeColor)
                .attr('stroke', spikeColor)
                .attr('stroke-width', 1.5)
                .attr('stroke-linejoin', 'miter')
                .attr('stroke-miterlimit', 10)
                .attr('opacity', 0.7)
                .transition()
                .duration(500)
                .attr('d', targetPath);
            } else {
              existingPath
                .transition()
                .duration(500)
                .attr('d', targetPath);
            }
          }

          spike.selectAll('path.hover-area').remove();
          
          spike.append('path')
            .attr('class', 'hover-area')
            .attr('d', `M${x - mapSpikeWidth},${y} L${x},${y - h - 5} L${x + mapSpikeWidth},${y} Z`)
            .attr('fill', 'transparent')
            .style('cursor', 'pointer')
            .on('mouseenter', (event) => {
              showTooltip(
                event,
                `<div style="text-align: center;"><strong>${d.country}</strong></div>` +
                `<div style="text-align: left;">` +
                `<strong>Year:</strong> ${selectedYear}<br/>` +
                `<strong>Events number:</strong> ${formatNum(d.events)}<br/>` +
                `<strong>Fatalities:</strong> ${formatNum(d.fatalities)}` +
                `</div>`
              );
              
              spike.select('.spike-path')
                .attr('opacity', 1)
                .attr('stroke-width', 2.5);
            })
            .on('mousemove', (event) => {
              showTooltip(
                event,
                `<div style="text-align: center;"><strong>${d.country}</strong></div>` +
                `<div style="text-align: left;">` +
                `<strong>Year:</strong> ${selectedYear}<br/>` +
                `<strong>Events number:</strong> ${formatNum(d.events)}<br/>` +
                `<strong>Fatalities:</strong> ${formatNum(d.fatalities)}` +
                `</div>`
              );
            })
            .on('mouseleave', () => {
              hideTooltip();
            
              spike.select('.spike-path')
                .attr('opacity', 0.7)
                .attr('stroke-width', 1.5);
            });
        });

        const yearLabelSelection = mapGroup.selectAll('.year-label')
          .data([selectedYear]);
        
        yearLabelSelection.exit()
          .transition()
          .duration(200)
          .attr('opacity', 0)
          .remove();
        
        yearLabelSelection.enter()
          .append('text')
          .attr('class', 'year-label')
          .attr('x', width - 10)
          .attr('y', height - 10)
          .attr('text-anchor', 'end')
          .attr('font-size', 48)
          .attr('font-weight', 'bold')
          .attr('fill', '#000')
          .attr('opacity', 0)
          .merge(yearLabelSelection)
          .text(d => d)
          .transition()
          .duration(200)
          .attr('opacity', 0.15);
      }

      const legendGroup = g.append('g')
        .attr('class', 'legend')
        .attr('transform', `translate(10, ${height - 20})`);

      const spikeColor = Object.values(eventTypes)[0].color;
      const legendSpikeWidth = 7;
      const itemSpacing = 60;
      
      const legendHeightRange = 80;

      function updateLegend(yearIndex, selectedEventType) {
        const selectedYear = years[yearIndex];
        const yearEvents = eventsData.filter(d => 
          d.year === selectedYear && d.subEventType === selectedEventType
        );

        const maxFatalitiesForYear = d3.max(yearEvents, d => d.fatalities) || 1;
        const legendScale = d3.scaleSqrt()
          .domain([0, maxFatalitiesForYear])
          .range([0, legendHeightRange]);
        const legendValues = [
          10,
          50,
          100,
          Math.round(maxFatalitiesForYear * 0.3),
          Math.round(maxFatalitiesForYear * 0.6),
          maxFatalitiesForYear
        ].filter((v, i, arr) => v <= maxFatalitiesForYear && v > 0 && arr.indexOf(v) === i)
         .sort((a, b) => a - b)
         .slice(0, 6);

        const legendItems = legendGroup.selectAll('g.legend-item')
          .data(legendValues, d => d);

        legendItems.exit()
          .transition()
          .duration(500)
          .style('opacity', 0)
          .remove();

        const legendEnter = legendItems.enter()
          .append('g')
          .attr('class', 'legend-item')
          .style('opacity', 0);

        const legendMerged = legendEnter.merge(legendItems);

        legendMerged
          .attr('transform', (d, i) => `translate(${i * itemSpacing + 12}, 20)`);

        legendMerged
          .transition()
          .duration(500)
          .style('opacity', 1);

        legendMerged.each(function(value, i) {
          const item = d3.select(this);
          item.selectAll('*').remove();

          const h = legendScale(value);
          const spikePath = `M${-legendSpikeWidth / 2},0 L0,${-h} L${legendSpikeWidth / 2},0 Z`;

          item.append('path')
            .attr('d', `M${-legendSpikeWidth / 2},0 L0,0 L${legendSpikeWidth / 2},0 Z`)
            .attr('fill', spikeColor)
            .attr('stroke', spikeColor)
            .attr('stroke-width', 1.5)
            .attr('stroke-linejoin', 'miter')
            .attr('stroke-miterlimit', 10)
            .attr('opacity', 0.7)
            .transition()
            .duration(500)
            .attr('d', spikePath);

          item.append('text')
            .attr('x', 0)
            .attr('y', 10)
            .attr('text-anchor', 'middle')
            .attr('font-size', '9px')
            .attr('fill', '#333')
            .text(formatNum(value));
        });
      }

      updateLegend(years.length - 1, eventSelect.property('value'));
      update(years.length - 1, eventSelect.property('value'));
      
      yearSlider.on('input', function() {
        update(+this.value, eventSelect.property('value'));
      });

      eventSelect.on('change', function() {
        update(+yearSlider.property('value'), this.value);
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
          update(currentIndex, eventSelect.property('value'));
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
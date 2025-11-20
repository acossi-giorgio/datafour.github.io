function renderChoroplethMap(container, datasets) {
  const root = d3.select(container);
  if (root.empty()) {
    console.warn('Container not found for choropleth map');
    return;
  }

  const svg = root.select('#choropleth-svg');
  if (svg.empty()) {
    console.warn('SVG element #choropleth-svg not found');
    return;
  }

  const yearSlider = root.select('#choropleth-year-slider');
  const yearLabel = root.select('#choropleth-year-slider-value');
  const playBtn = root.select('#choropleth-play-btn');
  const speedSlider = root.select('#choropleth-speed-slider');
  const speedLabel = root.select('#choropleth-speed-value');
  

  const zoomInBtn = root.select('#choropleth-zoom-in');
  const zoomOutBtn = root.select('#choropleth-zoom-out');
  const zoomResetBtn = root.select('#choropleth-zoom-reset');


  let animationInterval = null;
  let isPlaying = false; 

  const TOOLTIP_ID = 'choropleth-tooltip';
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

  if (!datasets.countries || !datasets.civilianFatalities) {
    console.error('Missing required datasets: countries or civilianFatalities');
    return;
  }


  const countriesSet = new Set(datasets.countries.map(d => d.Country.trim()));
  const iso3Map = new Map(datasets.countries.map(d => [d.Country.trim(), d.iso3]));


  const fatalitiesData = datasets.civilianFatalities
    .map(d => ({ 
      country: d.COUNTRY?.trim() || '', 
      year: +d.YEAR, 
      fatalities: +(d.FATALITIES || 0),
      iso3: iso3Map.get(d.COUNTRY?.trim())
    }))
    .filter(d => d.country && countriesSet.has(d.country) && !isNaN(d.year));


  const years = filterYearsRange(
    [...new Set(fatalitiesData.map(d => d.year))]
      .sort((a, b) => a - b)
  );

  if (years.length === 0) {
    console.error('No valid years found in the data');
    return;
  }

  // Configura slider
  yearSlider
    .attr('min', 0)
    .attr('max', years.length - 1)
    .attr('value', years.length - 1);

  yearLabel.text(years[years.length - 1]);

  
  const projection = d3.geoMercator()
    .scale(550)  
    .center([29, 25]) 
    .translate([width / 2, height / 2]);

  const path = d3.geoPath().projection(projection);


const maxFatalities = d3.max(fatalitiesData, d => d.fatalities) || 1;
const colorScale = d3.scaleThreshold()
  .domain([1, 50, 100, 500, 1000, 5000, 10000, 20000])
  .range([
    '#ffd4d4',
    '#f9b9b7',
    '#f09e9a',
    '#e6847d',
    '#da695f',
    '#cc4e41',
    '#bc3123',
    '#aa0000',
    '#f81500ff'
  ]);

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

  // Carica GeoJSON
  d3.json("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson")
    .then(function(topo) {
      
      function update(yearIndex) {
        const selectedYear = years[yearIndex];
        yearLabel.text(selectedYear);

        const dataMap = new Map();
        fatalitiesData
          .filter(d => d.year === selectedYear)
          .forEach(d => {
            if (d.iso3) {
              dataMap.set(d.iso3, d.fatalities);
            }
          });
        mapGroup.selectAll('path.country')
          .data(topo.features)
          .join('path')
          .attr('class', 'country')
          .attr('d', path)
          .attr('fill', function(d) {
            const value = dataMap.get(d.id) || 0;
            if (value === 0) return '#e0e0e0';
            return colorScale(value);
          })
          .attr('stroke', '#fff')
          .attr('stroke-width', 0.5)
          .style('cursor', d => {
            const value = dataMap.get(d.id) || 0;
            return value > 0 ? 'pointer' : 'default';
          })
          .on('mouseenter', (event, d) => {
            const value = dataMap.get(d.id) || 0;
            if (value > 0) {
              const countryName = [...iso3Map.entries()].find(([_, iso]) => iso === d.id)?.[0] 
                || d.properties?.name 
                || d.id;
              
              showTooltip(
                event,
                `<div style="text-align: center;"><strong>${countryName}</strong></div>` +
                `<strong>Year:</strong> ${selectedYear}<br/>` +
                `<strong>Civilian Fatalities:</strong> ${formatNum(value)}`
              );
            }
          })
          .on('mousemove', (event, d) => {
            const value = dataMap.get(d.id) || 0;
            if (value > 0) {
              const countryName = [...iso3Map.entries()].find(([_, iso]) => iso === d.id)?.[0] 
                || d.properties?.name 
                || d.id;
              
              showTooltip(
                event,
                `<div style="text-align: center;"><strong>${countryName}</strong></div>` +
                `<strong>Year:</strong> ${selectedYear}<br/>` +
                `<strong>Civilian Fatalities:</strong> ${formatNum(value)}`
              );
            }
          })
          .on('mouseleave', () => {
            hideTooltip();
          });
        g.selectAll('.year-label').remove();
        g.append('text')
          .attr('class', 'year-label')
          .attr('x', width - 10)
          .attr('y', height - 10)
          .attr('text-anchor', 'end')
          .attr('font-size', 48)
          .attr('font-weight', 'bold')
          .attr('fill', '#000')
          .attr('opacity', 0.15)
          .text(selectedYear);
      }

      // Inizializza
      update(years.length - 1);

      // Slider event
      yearSlider.on('input', function() {
        update(+this.value);
      });

      // Speed slider event
      speedSlider.on('input', function() {
        const speed = +this.value;
        speedLabel.text((speed / 1000).toFixed(1) + 's');
        
        // Se l'animazione è in corso, riavviala con la nuova velocità
        if (isPlaying) {
          clearInterval(animationInterval);
          startAnimation(speed);
        }
      });

      // Funzione per avviare l'animazione
      function startAnimation(speed) {
        animationInterval = setInterval(() => {
          let currentIndex = +yearSlider.property('value');
          currentIndex++;
          
          if (currentIndex >= years.length) {
            currentIndex = 0; // Ricomincia dall'inizio
          }
          
          yearSlider.property('value', currentIndex);
          update(currentIndex);
        }, speed);
      }

      // Play/Stop button toggle
      playBtn.on('click', function() {
        if (isPlaying) {
          // Stop
          clearInterval(animationInterval);
          animationInterval = null;
          isPlaying = false;
          playBtn.html('<i class="bi bi-play-fill"></i> Play');
          playBtn.classed('btn-primary', true).classed('btn-danger', false);
        } else {
          // Play
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
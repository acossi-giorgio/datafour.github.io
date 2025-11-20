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
  
  // Aggiungi sfondo scuro
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

  // Verifica datasets
  if (!datasets.countries || !datasets.targetingCiviliansEvents || !datasets.politicalViolenceEvents) {
    console.error('Missing required datasets: countries, targetingCiviliansEvents, or politicalViolenceEvents');
    return;
  }

  // Prepara i dati dei paesi MEA
  const countriesSet = new Set(datasets.countries.map(d => d.Country.trim()));
  const iso3Map = new Map(datasets.countries.map(d => [d.Country.trim(), d.iso3]));

  // Combina i due dataset
  const combinedData = [
    ...datasets.targetingCiviliansEvents,
    ...datasets.politicalViolenceEvents
  ];

  // Aggrega eventi per paese e anno (somma eventi dai due dataset)
  const aggregatedData = d3.rollup(
    combinedData,
    v => d3.sum(v, d => +d.EVENTS || 0),
    d => d.COUNTRY,
    d => +d.YEAR
  );

  // Converti in array e filtra
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

  // Filtra anni nel range
  const years = filterYearsRange(
    [...new Set(eventsData.map(d => d.year))].sort((a, b) => a - b)
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

  // Map projection - zoom sulla zona con più eventi (Medio Oriente centrale)
  const projection = d3.geoMercator()
    .scale(1200)
    .center([42, 33])
    .translate([width / 2, height / 2]);

  const path = d3.geoPath().projection(projection);

  // Color scale per eventi - gradiente arancione chiaro a scuro
  const maxEvents = d3.max(eventsData, d => d.events) || 1;
  const colorScale = d3.scaleSequential()
    .domain([0, maxEvents])
    .interpolator(d3.interpolateRgb("#ffeaa7", "#d63031")); // Arancione chiaro a scuro

  // Scala per la dimensione delle bolle
  const radiusScale = d3.scaleSqrt()
    .domain([0, maxEvents])
    .range([0, 40]); // Raggio da 0 a 40 pixel

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

        // Filtra dati per l'anno selezionato
        const yearData = eventsData.filter(d => d.year === selectedYear);

        // Crea set di iso3 dei paesi MEA
        const meaIso3Set = new Set(Array.from(iso3Map.values()));

        // Disegna la mappa base (tutti i paesi in grigio chiaro)
        g.selectAll('path.country')
          .data(topo.features)
          .join('path')
          .attr('class', 'country')
          .attr('d', path)
          .attr('fill', '#636e72')
          .attr('stroke', '#4a5459')
          .attr('stroke-width', 0.5);

        // Calcola centroidi per ogni paese con dati
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

        // Disegna le bolle
        g.selectAll('circle.bubble')
          .data(bubbleData, d => d.iso3)
          .join(
            enter => enter.append('circle')
              .attr('class', 'bubble')
              .attr('cx', d => d.x)
              .attr('cy', d => d.y)
              .attr('r', 0)
              .attr('fill', d => colorScale(d.events))
              .attr('stroke', '#fff')
              .attr('stroke-width', 1.5)
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
              `<strong>Violence Events:</strong> ${formatNum(d.events)}`
            );
            
            // Evidenzia la bolla
            d3.select(event.currentTarget)
              .attr('opacity', 1)
              .attr('stroke-width', 2.5);
          })
          .on('mousemove', (event, d) => {
            showTooltip(
              event,
              `<div style="text-align: center;"><strong>${d.country}</strong></div>` +
              `<strong>Year:</strong> ${selectedYear}<br/>` +
              `<strong>Violence Events:</strong> ${formatNum(d.events)}`
            );
          })
          .on('mouseleave', (event) => {
            hideTooltip();
            
            // Ripristina l'opacità normale
            d3.select(event.currentTarget)
              .attr('opacity', 0.7)
              .attr('stroke-width', 1.5);
          });

        // Aggiungi anno sulla mappa
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
          playBtn.html('<i class="bi bi-play-fill"></i> Play Animation');
          playBtn.classed('btn-primary', true).classed('btn-danger', false);
        } else {
          // Play
          isPlaying = true;
          const speed = +speedSlider.property('value');
          playBtn.html('<i class="bi bi-stop-fill"></i> Stop Animation');
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
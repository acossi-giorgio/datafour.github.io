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

  const yearSelect = root.select('#choropleth-year-select');
  if (yearSelect.empty()) {
    console.warn('Year select element #choropleth-year-select not found');
    return;
  }

  const playBtn = root.select('#choropleth-play-btn');
  const speedSlider = root.select('#choropleth-speed-slider');
  const speedLabel = root.select('#choropleth-speed-label');

  // Variabili per l'animazione
  let animationInterval = null;
  let isPlaying = false;
  let animationSpeed = 800; // millisecondi per frame

  // Crea o recupera il tooltip centralizzato
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

  // Verifica che i datasets necessari esistano
  if (!datasets.countries || !datasets.civilianFatalities) {
    console.error('Missing required datasets: countries or civilianFatalities');
    return;
  }

  // Prepara i dati dei paesi MEA
  const countriesSet = new Set(datasets.countries.map(d => d.Country.trim()));
  const iso3Map = new Map(datasets.countries.map(d => [d.Country.trim(), d.iso3]));

  // Prepara i dati delle fatalities
  const fatalitiesData = datasets.civilianFatalities
    .map(d => ({ 
      country: d.COUNTRY?.trim() || '', 
      year: +d.YEAR, 
      fatalities: +(d.FATALITIES || 0),
      iso3: iso3Map.get(d.COUNTRY?.trim())
    }))
    .filter(d => d.country && countriesSet.has(d.country) && !isNaN(d.year));

  // Filtra gli anni nel range
  const years = filterYearsRange(
    [...new Set(fatalitiesData.map(d => d.year))]
      .sort((a, b) => a - b)
  );

  if (years.length === 0) {
    console.error('No valid years found in the data');
    return;
  }

  // Popola il select degli anni
  yearSelect
    .selectAll('option')
    .data(years)
    .join('option')
    .attr('value', d => d)
    .text(d => d);

  // Imposta l'anno più recente come default
  yearSelect.property('value', years[years.length - 1]);

  // Map projection - focalizzata sul Medio Oriente e Nord Africa (MEA)
  const projection = d3.geoMercator()
    .scale(550)  // Zoom più stretto
    .center([29, 25])  // Centro tra Medio Oriente e Nord Africa
    .translate([width / 2, height / 2]);

  const path = d3.geoPath().projection(projection);

  // Color scale - rossi per le fatalities
  const maxFatalities = d3.max(fatalitiesData, d => d.fatalities) || 1;
  const colorScale = d3.scaleOrdinal(d3.schemeReds[9]);

  const formatNum = d3.format(',');

  function showTooltip(event, html) {
    tooltip
      .html(html)
      .style('display', 'block')
      .style('opacity', 1);

    // Usa clientX/clientY invece di pageX/pageY per posizionamento fisso
    let x = event.clientX + 14;
    let y = event.clientY + 16;

    const rect = tooltip.node().getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Evita che il tooltip esca dai bordi
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
      
      function update(year) {
        // Crea mappa delle fatalities per anno
        const dataMap = new Map();
        fatalitiesData
          .filter(d => d.year === +year)
          .forEach(d => {
            if (d.iso3) {
              dataMap.set(d.iso3, d.fatalities);
            }
          });

        // Disegna la mappa
        g.selectAll('path.country')
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
                `<strong>Year:</strong> ${year}<br/>` +
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
                `<strong>Year:</strong> ${year}<br/>` +
                `<strong>Civilian Fatalities:</strong> ${formatNum(value)}`
              );
            }
          })
          .on('mouseleave', () => {
            hideTooltip();
          });

        // Aggiungi indicatore dell'anno corrente sulla mappa
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
          .text(year);
      }

      // Inizializza con l'anno selezionato
      update(yearSelect.property('value'));
      
      // Aggiorna quando cambia l'anno manualmente
      yearSelect.on('change', function() {
        update(this.value);
      });

      // Funzione per avviare/fermare l'animazione
      function toggleAnimation() {
        if (isPlaying) {
          // Ferma l'animazione
          clearInterval(animationInterval);
          animationInterval = null;
          isPlaying = false;
          playBtn.html('▶ Play Animation');
          playBtn.classed('btn-primary', true).classed('btn-danger', false);
        } else {
          // Avvia l'animazione
          isPlaying = true;
          playBtn.html('⏸ Pause Animation');
          playBtn.classed('btn-primary', false).classed('btn-danger', true);
          
          let currentIndex = years.indexOf(+yearSelect.property('value'));
          
          animationInterval = setInterval(() => {
            currentIndex++;
            if (currentIndex >= years.length) {
              currentIndex = 0; // Ricomincia dall'inizio
            }
            
            const nextYear = years[currentIndex];
            yearSelect.property('value', nextYear);
            update(nextYear);
          }, animationSpeed);
        }
      }

      // Event listener per il bottone play/pause
      if (!playBtn.empty()) {
        playBtn.on('click', toggleAnimation);
      }

      // Event listener per lo slider della velocità
      if (!speedSlider.empty()) {
        speedSlider.on('input', function() {
          animationSpeed = +this.value;
          speedLabel.text((animationSpeed / 1000).toFixed(1) + 's');
          
          // Se l'animazione è in corso, riavviala con la nuova velocità
          if (isPlaying) {
            clearInterval(animationInterval);
            let currentIndex = years.indexOf(+yearSelect.property('value'));
            
            animationInterval = setInterval(() => {
              currentIndex++;
              if (currentIndex >= years.length) {
                currentIndex = 0;
              }
              
              const nextYear = years[currentIndex];
              yearSelect.property('value', nextYear);
              update(nextYear);
            }, animationSpeed);
          }
        });
      }
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
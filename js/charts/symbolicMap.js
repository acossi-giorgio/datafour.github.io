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

  // Crea o recupera il tooltip centralizzato
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

  // Verifica che i datasets necessari esistano
  if (!datasets.countries || !datasets.aggregatedMapData) {
    console.error('Missing required datasets: countries or aggregatedMapData');
    return;
  }

  // Prepara i dati dei paesi MEA
  const countriesSet = new Set(datasets.countries.map(d => d.Country.trim()));
  const iso3Map = new Map(datasets.countries.map(d => [d.Country.trim(), d.iso3]));

  // Funzione per parsare le coordinate con virgola come separatore decimale
  function parseCoordinate(coord) {
    if (!coord) return NaN;
    return parseFloat(coord.toString().replace(',', '.'));
  }

  // Tipi di eventi da visualizzare con i loro colori
  const eventTypes = {
    'Shelling/artillery/missile attack': { color: '#d8a305ff', label: 'Shelling/Artillery/Missile' },
    'Air/drone strike': { color: '#d8a305ff', label: 'Air/Drone Strike' },
    'Remote explosive/landmine/IED': { color: '#d8a305ff', label: 'IED/Landmine' }
  };

  // Prepara i dati degli eventi
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

  // Filtra gli anni nel range
  const years = filterYearsRange(
    [...new Set(eventsData.map(d => d.year))]
      .sort((a, b) => a - b)
  );

  if (years.length === 0) {
    console.error('No valid years found in the data');
    return;
  }

  // Crea il controllo per l'anno
  const controls = root.select('#symbolic-map-controls');
  controls.selectAll('*').remove();

  const controlGroup = controls.append('div')
    .attr('class', 'd-flex align-items-center gap-3 flex-wrap');

  // Dropdown anno
  const yearGroup = controlGroup.append('div')
    .attr('class', 'd-flex align-items-center gap-2');

  yearGroup.append('label')
    .attr('for', 'symbolic-year-select')
    .attr('class', 'form-label mb-0')
    .text('Year:');

  const yearSelect = yearGroup.append('select')
    .attr('id', 'symbolic-year-select')
    .attr('class', 'form-select form-select-sm')
    .style('width', 'auto');

  // Popola il select degli anni
  yearSelect
    .selectAll('option')
    .data(years)
    .join('option')
    .attr('value', d => d)
    .text(d => d);

  // Imposta l'anno più recente come default
  yearSelect.property('value', years[years.length - 1]);

  // Dropdown tipo di evento
  const eventGroup = controlGroup.append('div')
    .attr('class', 'd-flex align-items-center gap-2');

  eventGroup.append('label')
    .attr('for', 'symbolic-event-select')
    .attr('class', 'form-label mb-0')
    .text('Event Type:');

  const eventSelect = eventGroup.append('select')
    .attr('id', 'symbolic-event-select')
    .attr('class', 'form-select form-select-sm')
    .style('width', 'auto');

  // Popola il select degli eventi
  eventSelect
    .selectAll('option')
    .data(Object.entries(eventTypes))
    .join('option')
    .attr('value', d => d[0])
    .text(d => d[1].label);

  // Imposta il primo tipo di evento come default
  eventSelect.property('value', Object.keys(eventTypes)[0]);

  // Map projection - focalizzata su Medio Oriente (Iraq, Siria, Yemen, Arabia Saudita)
  const projection = d3.geoMercator()
    .scale(900)  // Zoom più stretto
    .center([45, 27])  // Centro più a est, tra Iraq/Yemen/Arabia
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

  // Carica GeoJSON
  d3.json("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson")
    .then(function(topo) {
      
      // Gruppo per la mappa di base
      const mapGroup = g.append('g').attr('class', 'map-group');
      
      // Gruppo per gli spike (sopra la mappa)
      const spikesGroup = g.append('g').attr('class', 'spikes-group');

      function update(year, selectedEventType) {
        // Filtra gli eventi per anno e tipo di evento
        const yearEvents = eventsData.filter(d => 
          d.year === +year && d.subEventType === selectedEventType
        );
        
        console.log(`Year ${year}, Event: ${selectedEventType}: ${yearEvents.length} events`);

        // Calcola la scala per l'altezza degli spike basata solo sugli eventi del tipo selezionato
        const maxFatalitiesForType = d3.max(yearEvents, d => d.fatalities) || 1;
        const spikeHeightScale = d3.scaleSqrt()
          .domain([0, maxFatalitiesForType])
          .range([0, 80]); // Altezza massima dello spike in pixel

        // Disegna la mappa di base
        mapGroup.selectAll('path.country')
          .data(topo.features)
          .join('path')
          .attr('class', 'country')
          .attr('d', path)
          .attr('fill', '#e8e8e8')
          .attr('stroke', '#fff')
          .attr('stroke-width', 0.5);

        // Disegna gli spike
        const spikes = spikesGroup.selectAll('g.spike')
          .data(yearEvents, (d, i) => `${d.country}-${d.lat}-${d.lon}-${i}`);

        spikes.exit().remove();

        const spikeEnter = spikes.enter()
          .append('g')
          .attr('class', 'spike');

        // Unisci enter e update
        const spikesMerged = spikeEnter.merge(spikes);

        spikesMerged.each(function(d) {
          const spike = d3.select(this);
          spike.selectAll('*').remove();

          const [x, y] = projection([d.lon, d.lat]);
          const h = spikeHeightScale(d.fatalities);
          const spikeWidth = 7; // Larghezza base dello spike
          const spikeColor = eventTypes[d.subEventType].color;

          if (h > 0) {
            // Crea lo spike path come nell'esempio Observable
            // M${-width / 2},0 L0,${-length} L${width / 2},0
            const spikePath = `M${x - spikeWidth / 2},${y} L${x},${y - h} L${x + spikeWidth / 2},${y}`;
            
            spike.append('path')
              .attr('class', 'spike-path')
              .attr('d', spikePath)
              .attr('fill', spikeColor)
              .attr('stroke', spikeColor)
              .attr('stroke-width', 1)
              .attr('stroke-linejoin', 'round')
              .attr('opacity', 0.7);
          }

          // Area interattiva più ampia per il tooltip
          spike.append('path')
            .attr('d', `M${x - spikeWidth},${y} L${x},${y - h - 5} L${x + spikeWidth},${y} Z`)
            .attr('fill', 'transparent')
            .style('cursor', 'pointer')
            .on('mouseenter', (event) => {
              showTooltip(
                event,
                `<div style="text-align: center;"><strong>${d.country}</strong></div>` +
                `<div style="text-align: left;">` +
                `<strong>Year:</strong> ${year}<br/>` +
                `<strong>Events number:</strong> ${formatNum(d.events)}<br/>` +
                `<strong>Fatalities:</strong> ${formatNum(d.fatalities)}` +
                `</div>`
              );
              
              // Evidenzia lo spike
              spike.select('.spike-path')
                .attr('opacity', 1)
                .attr('stroke-width', 1.5);
            })
            .on('mousemove', (event) => {
              showTooltip(
                event,
                `<div style="text-align: center;"><strong>${d.country}</strong></div>` +
                `<div style="text-align: left;">` +
                `<strong>Year:</strong> ${year}<br/>` +
                `<strong>Events number:</strong> ${formatNum(d.events)}<br/>` +
                `<strong>Fatalities:</strong> ${formatNum(d.fatalities)}` +
                `</div>`
              );
            })
            .on('mouseleave', () => {
              hideTooltip();
              
              // Ripristina l'opacità normale
              spike.select('.spike-path')
                .attr('opacity', 0.7)
                .attr('stroke-width', 1);
            });
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

      // Inizializza con l'anno e tipo di evento selezionati
      update(yearSelect.property('value'), eventSelect.property('value'));
      
      // Aggiorna quando cambia l'anno
      yearSelect.on('change', function() {
        update(this.value, eventSelect.property('value'));
      });

      // Aggiorna quando cambia il tipo di evento
      eventSelect.on('change', function() {
        update(yearSelect.property('value'), this.value);
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
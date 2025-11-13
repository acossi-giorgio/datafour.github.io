function renderLinePlotChart(container, datasets) {
  const TOOLTIP_ID = 'lineplot-tooltip';
  
  const root = d3.select(container);
  if (root.empty()) return;

  const svg = root.select("#lineplot-svg");
  if (svg.empty()) return;

  // Seleziona gli elementi dei controlli
  const eventSelect = d3.select("#lineplot-year-select");
  const countrySelect = d3.select("#lineplot-country-select");
  const storyEl = d3.select("#lineplot-story");

  // Crea o recupera il tooltip centralizzato
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

  function showTooltip(event, html) {
    tooltip
      .style('display', 'block')
      .style('opacity', 1)
      .html(html);

    const rect = tooltip.node().getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x = event.pageX + 14;
    let y = event.pageY + 16;

    // Evita che il tooltip esca dai bordi
    if (x + rect.width > vw - 8) {
      x = event.pageX - rect.width - 14;
    }
    if (y + rect.height > vh - 8) {
      y = event.pageY - rect.height - 14;
    }

    tooltip.style('left', `${x}px`).style('top', `${y}px`);
  }

  function hideTooltip() {
    tooltip.style('opacity', 0).style('display', 'none');
  }

  const margin = { top: 30, right: 40, bottom: 50, left: 100 };
  const fullWidth = Math.max(svg.attr('width') || 900, 300);
  const fullHeight = Math.max(svg.attr('height') || 500, 330);
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

  // --- Configurazione dei dataset selezionabili dal menu "Events" ---
  const EVENT_CONFIGS = [
    {
      id: "demostrationEvents",
      label: "Demonstration events",
      colorKey: DATASET_KEYS.DEMONSTRATIONS,
    },
    {
      id: "politicalViolenceEvents",
      label: "Political violence events",
      colorKey: DATASET_KEYS.POLITICAL_VIOLENCE,
    },
    {
      id: "targetingCiviliansEvents",
      label: "Events targeting civilians",
      colorKey: DATASET_KEYS.TARGET_CIVIL_EVENT,
    },
    {
      id: "civilianFatalities",
      label: "Reported civilian fatalities",
      colorKey: DATASET_KEYS.CIVILIAN_FATALITIES,
    },
  ];

  const eventById = new Map(EVENT_CONFIGS.map(d => [d.id, d]));

  // --- Lista dei paesi da visualizzare ---
  const allCountries = [
    "Pakistan",
    "Yemen",
    "Morocco",
    "Palestine",
    "Iran",
    "Syria",
    "Israel",
    "Iraq"
  ].sort(d3.ascending);

  // Popola il select degli eventi
  eventSelect
    .selectAll("option")
    .data(EVENT_CONFIGS)
    .join("option")
    .attr("value", d => d.id)
    .text(d => d.label);

  // Popola il select dei paesi
  countrySelect
    .selectAll("option")
    .data(allCountries)
    .join("option")
    .attr("value", d => d)
    .text(d => d);

  // Stato iniziale
  let currentEventId = EVENT_CONFIGS[0].id;
  let currentCountry = allCountries[0];

  eventSelect.property("value", currentEventId);
  countrySelect.property("value", currentCountry);

  // --- Scale & assi (aggiornati ad ogni redraw) ---
  const xScale = d3.scaleLinear().range([0, width]);
  const yScale = d3.scaleLinear().range([height, 0]);

  const xAxisG = g
    .append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${height})`);

  const yAxisG = g.append("g").attr("class", "y-axis");

  const lineGen = d3.line()
    .x(d => xScale(d.YEAR))
    .y(d => yScale(d.EVENTS))
    .defined(d => d.YEAR != null && d.EVENTS != null);

  const linesG = g.append("g").attr("class", "lines");
  const pointsG = g.append("g").attr("class", "points");

  // Prende il dataset giusto e lo raggruppa per paese
  function getFilteredData(eventId) {
    const raw = datasets[eventId] || [];
    let data = raw.filter(d =>
      d.COUNTRY &&
      d.YEAR != null &&
      d.EVENTS != null &&
      allCountries.includes(d.COUNTRY) &&
      (!window.isYearInRange || window.isYearInRange(d.YEAR))
    );

    const grouped = d3.group(data, d => d.COUNTRY);
    return Array.from(grouped, ([country, values]) => ({
      country,
      values: values.sort((a, b) => d3.ascending(a.YEAR, b.YEAR)),
    }));
  }

  // Identifica i punti di cambio direzione (massimi e minimi locali)
  function findTurningPoints(values) {
    if (values.length < 3) return [];
    
    const turningPoints = [];
    for (let i = 1; i < values.length - 1; i++) {
      const prev = values[i - 1].EVENTS;
      const curr = values[i].EVENTS;
      const next = values[i + 1].EVENTS;
      
      // Massimo locale
      if (curr > prev && curr > next) {
        turningPoints.push({
          ...values[i],
          type: "max",
          index: i
        });
      }
      // Minimo locale
      if (curr < prev && curr < next) {
        turningPoints.push({
          ...values[i],
          type: "min",
          index: i
        });
      }
    }
    return turningPoints;
  }

  function updateChart() {
    const cfg = eventById.get(currentEventId);
    const colorHighlight = cfg ? getDatasetColor(cfg.colorKey) : "#333";

    const groupedData = getFilteredData(currentEventId);
    if (!groupedData.length) return;

    const allYears = groupedData.flatMap(d => d.values.map(v => v.YEAR));
    const allEvents = groupedData.flatMap(d => d.values.map(v => v.EVENTS));

    const yearExtent = d3.extent(allYears);
    xScale.domain(yearExtent);

    const maxEvents = d3.max(allEvents);
    yScale.domain([0, maxEvents || 1]).nice();

    // Assi
    xAxisG
      .call(
        d3.axisBottom(xScale)
          .ticks(Math.min(yearExtent[1] - yearExtent[0] + 1, 10))
          .tickFormat(d3.format("d"))
      )
      .selectAll("text")
      .attr("font-size", 12);

    yAxisG
      .call(d3.axisLeft(yScale).ticks(5))
      .selectAll("text")
      .attr("font-size", 12);

    // Aggiungi etichette agli assi
    if (!g.select(".x-label").node()) {
      g.append("text")
        .attr("class", "x-label")
        .attr("x", width / 2)
        .attr("y", height + 45)
        .attr("text-anchor", "middle")
        .attr("font-size", 13)
        .attr("font-weight", "bold")
        .text("Year");
    }

    if (!g.select(".y-label").node()) {
      g.append("text")
        .attr("class", "y-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -75)
        .attr("text-anchor", "middle")
        .attr("font-size", 13)
        .attr("font-weight", "bold")
        .text("Number of Events");
    }

    // --- Linee: tutte grigie, tranne il paese selezionato ---
const lineSel = linesG
  .selectAll(".country-line")
  .data(groupedData, d => d.country);

lineSel
  .join("path")
  .attr("class", "country-line")
  .attr("fill", "none")
  .attr("stroke-linecap", "round")
  .attr("stroke-linejoin", "round")
  .attr("d", d => lineGen(d.values))
  .attr("stroke", d =>
    d.country === currentCountry ? getCountryColor(d.country) : "#cccccc"
  )
  .attr("stroke-width", d =>
    d.country === currentCountry ? 4 : 1.5
  )
  .attr("opacity", d =>
    d.country === currentCountry ? 1 : 0.3
  )
  .style("cursor", d => d.country === currentCountry ? "default" : "pointer")
  .on("mousemove", function (event, d) {
    // statistiche per il tooltip, in stile “Samples / Median / Min / Max”
    const samples = d.values.length;
    const minVal  = d3.min(d.values, v => v.EVENTS);
    const maxVal  = d3.max(d.values, v => v.EVENTS);
    const median  = d3.median(d.values, v => v.EVENTS);
    const firstYear = d3.min(d.values, v => v.YEAR);
    const lastYear  = d3.max(d.values, v => v.YEAR);

    showTooltip(
      event,
      `<strong>${d.country}</strong><br/>` +
      `${firstYear}–${lastYear}<br/>` +
      `Samples: ${samples}<br/>` +
      `Median: ${median.toFixed(2)}<br/>` +
      `Min: ${minVal}<br/>` +
      `Max: ${maxVal}`
    );

    // piccola evidenziazione al passaggio
    if (d.country !== currentCountry) {
      d3.select(this)
        .attr("stroke-width", 2.5)
        .attr("opacity", 0.6);
    }
  })
  .on("mouseout", function (event, d) {
    hideTooltip();

    if (d.country !== currentCountry) {
      d3.select(this)
        .attr("stroke-width", 1.5)
        .attr("opacity", 0.3);
    }
  })
  .on("click", function (event, d) {
    if (d.country !== currentCountry) {
      currentCountry = d.country;
      countrySelect.property("value", currentCountry);
      updateChart();
      hideTooltip();
    }
  });


    // --- Etichette con nomi dei paesi alla fine delle linee ---
    // Calcola le posizioni y finali e ordina per evitare sovrapposizioni
    const labelData = groupedData.map(d => {
      const lastPoint = d.values[d.values.length - 1];
      return {
        country: d.country,
        x: xScale(lastPoint.YEAR) + 5,
        y: yScale(lastPoint.EVENTS),
        originalY: yScale(lastPoint.EVENTS)
      };
    }).sort((a, b) => a.y - b.y);

    // Risolvi sovrapposizioni con algoritmo di separazione
    const minSpacing = 14; // Spaziatura minima tra le etichette
    for (let i = 1; i < labelData.length; i++) {
      const prev = labelData[i - 1];
      const curr = labelData[i];
      if (curr.y - prev.y < minSpacing) {
        curr.y = prev.y + minSpacing;
      }
    }

    linesG
      .selectAll(".country-label")
      .data(labelData, d => d.country)
      .join("text")
      .attr("class", "country-label")
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("dy", "0.35em")
      .attr("font-size", d => d.country === currentCountry ? 12 : 10)
      .attr("font-weight", d => d.country === currentCountry ? "bold" : "normal")
      .attr("fill", d => d.country === currentCountry ? getCountryColor(d.country) : "#999")
      .attr("opacity", d => d.country === currentCountry ? 1 : 0.5)
      .text(d => d.country)
      .style("pointer-events", "none");

    // --- Trova i dati del paese selezionato ---
    const selectedCountryData = groupedData.find(d => d.country === currentCountry);

    // --- Punti di cambio direzione (massimi e minimi locali) per il paese selezionato ---
    pointsG.selectAll("*").remove();
    
    if (selectedCountryData) {
      // Punti dati interattivi per tutti i valori del paese selezionato
      // Cerchi invisibili per mostrare tooltip senza elementi visibili
      pointsG
        .selectAll(".data-point")
        .data(selectedCountryData.values)
        .join("circle")
        .attr("class", "data-point")
        .attr("cx", d => xScale(d.YEAR))
        .attr("cy", d => yScale(d.EVENTS))
        .attr("r", 6)
        .attr("fill", "transparent")
        .attr("stroke", "none")
        .style("cursor", "pointer")
        .on("mouseover", function (event, d) {
          showTooltip(
            event,
            `<div style="text-align: center;"><strong>${currentCountry}</strong></div>` +
            `<strong>Year:</strong> ${d.YEAR}<br/>` +
            `<strong>${cfg.label}:</strong> ${d.EVENTS.toLocaleString()}`
          );
        })
        .on("mousemove", function (event, d) {
          showTooltip(
            event,
            `<div style="text-align: center;"><strong>${currentCountry}</strong></div>` +
            `<strong>Year:</strong> ${d.YEAR}<br/>` +
            `<strong>${cfg.label}:</strong> ${d.EVENTS.toLocaleString()}`
          );
        })
        .on("mouseout", function () {
          hideTooltip();
        });
    }

    // --- Testo di story sotto il grafico ---
    if (!storyEl.empty() && selectedCountryData && selectedCountryData.values.length) {
      const selectedValues = selectedCountryData.values;
      const firstYear = selectedValues[0].YEAR;
      const lastYear = selectedValues[selectedValues.length - 1].YEAR;
      const minVal = d3.min(selectedValues, d => d.EVENTS);
      const maxVal = d3.max(selectedValues, d => d.EVENTS);

      storyEl.text(
        `${currentCountry} – from ${firstYear} to ${lastYear}, ` +
        `${cfg.label.toLowerCase()} range between ${minVal} and ${maxVal} events per year.`
      );
    }
  }

  // --- Event handlers dei menu a tendina ---
  eventSelect.on("change", function () {
    currentEventId = this.value;
    updateChart();
  });

  countrySelect.on("change", function () {
    currentCountry = this.value;
    updateChart();
  });

  // Primo draw
  updateChart();
}

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
    .style('position', 'absolute')
    .style('pointer-events', 'none')
    .style('display', 'none')
    .style('opacity', 0);

  function showTooltip(event, html) {
    tooltip
      .style('display', 'block')
      .style('opacity', 1)
      .html(html);

    const x = event.pageX + 14;
    const y = event.pageY + 16;

    tooltip.style('left', `${x}px`).style('top', `${y}px`);
  }

  function hideTooltip() {
    tooltip.style('opacity', 0).style('display', 'none');
  }

  const margin = { top: 30, right: 80, bottom: 50, left: 100 };
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
  let selectedYear = null; // Anno selezionato per il confronto verticale

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
  const verticalLineG = g.append("g").attr("class", "vertical-line-group");
  const comparisonPointsG = g.append("g").attr("class", "comparison-points");

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
    return Array.from(grouped, ([country, values]) => {
      const sorted = values.sort((a, b) => d3.ascending(a.YEAR, b.YEAR));
      return {
        country,
        values: sorted,
        originalValues: sorted // Mantieni i valori originali separati
      };
    });
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

    // Espandi i dati per includere anni mancanti all'inizio con valori del primo anno disponibile
    const expandedData = groupedData.map(d => {
      const firstYear = d.values[0].YEAR;
      const firstValue = d.values[0].EVENTS;
      const missingYears = [];
      
      // Aggiungi punti fantasma per gli anni mancanti all'inizio
      for (let y = yearExtent[0]; y < firstYear; y++) {
        missingYears.push({
          YEAR: y,
          EVENTS: firstValue,
          COUNTRY: d.country,
          isFilled: true // Flag per identificare i punti aggiunti
        });
      }
      
      return {
        ...d,
        allValues: [...missingYears, ...d.values], // Valori completi con anni mancanti
        filledYears: missingYears.map(m => m.YEAR) // Traccia quali anni sono stati riempiti
      };
    });

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
    // Prima disegna le linee di sfondo grigie per il paese selezionato
    const backgroundLines = linesG
      .selectAll(".country-line-background")
      .data(expandedData.filter(d => d.country === currentCountry), d => d.country);

    backgroundLines
      .join("path")
      .attr("class", "country-line-background")
      .attr("fill", "none")
      .attr("stroke", "#cccccc")
      .attr("stroke-width", 4)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("opacity", 0.4)
      .attr("d", d => lineGen(d.values))
      .style("pointer-events", "none");

    // Poi disegna le linee principali sopra
    const lineSel = linesG
      .selectAll(".country-line")
      .data(expandedData, d => d.country);

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
  .style("cursor", "pointer")
  .each(function(d) {
    // Calcola la lunghezza del path per l'animazione
    const pathLength = this.getTotalLength();
    d3.select(this).attr("data-length", pathLength);
    
    // Se è il paese selezionato e non è già stato animato, anima
    if (d.country === currentCountry && !d3.select(this).classed("animated")) {
      d3.select(this)
        .attr("stroke-dasharray", pathLength)
        .attr("stroke-dashoffset", pathLength)
        .classed("animated", true)
        .transition()
        .duration(1500)
        .ease(d3.easeLinear)
        .attr("stroke-dashoffset", 0)
        .on("end", function() {
          // Rimuovi stroke-dasharray dopo l'animazione per rendering normale
          d3.select(this).attr("stroke-dasharray", "none");
        });
    } else {
      // Reset per linee non selezionate
      d3.select(this)
        .attr("stroke-dasharray", "none")
        .attr("stroke-dashoffset", 0)
        .classed("animated", false);
    }
  })
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

    // Linee tratteggiate per gli anni riempiti all'inizio
    const dashedLines = linesG
      .selectAll(".country-line-dashed")
      .data(expandedData.filter(d => d.filledYears.length > 0), d => d.country);

    dashedLines
      .join("path")
      .attr("class", "country-line-dashed")
      .attr("fill", "none")
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("stroke-dasharray", "5,5")
      .attr("d", d => lineGen(d.allValues.filter(v => v.isFilled || v.YEAR === d.values[0].YEAR)))
      .attr("stroke", d =>
        d.country === currentCountry ? getCountryColor(d.country) : "#cccccc"
      )
      .attr("stroke-width", d =>
        d.country === currentCountry ? 2 : 1
      )
      .attr("opacity", d =>
        d.country === currentCountry ? 0.6 : 0.2
      )
      .style("pointer-events", "none");

    // --- Linee tratteggiate per estensione fino al bordo destro ---
    const extensionLines = linesG
      .selectAll(".country-line-extension")
      .data(expandedData.filter(d => {
        // Solo per paesi che non arrivano all'anno massimo
        const lastYear = d.values[d.values.length - 1].YEAR;
        return lastYear < yearExtent[1];
      }), d => d.country);

    extensionLines
      .join("line")
      .attr("class", "country-line-extension")
      .attr("x1", d => {
        const lastPoint = d.values[d.values.length - 1];
        return xScale(lastPoint.YEAR);
      })
      .attr("y1", d => {
        const lastPoint = d.values[d.values.length - 1];
        return yScale(lastPoint.EVENTS);
      })
      .attr("x2", xScale(yearExtent[1]))
      .attr("y2", d => {
        const lastPoint = d.values[d.values.length - 1];
        return yScale(lastPoint.EVENTS);
      })
      .attr("stroke", d => 
        d.country === currentCountry ? getCountryColor(d.country) : "#cccccc"
      )
      .attr("stroke-width", d => 
        d.country === currentCountry ? 2 : 1
      )
      .attr("stroke-dasharray", "5,5")
      .attr("opacity", d => 
        d.country === currentCountry ? 0.5 : 0.2
      )
      .style("pointer-events", "none");


    // --- Etichette con nomi dei paesi alla fine delle linee ---
    // Calcola le posizioni y finali e ordina per evitare sovrapposizioni
    const labelData = expandedData.map(d => {
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
      .style("pointer-events", d => d.country === currentCountry ? "none" : "auto")
      .style("cursor", d => d.country === currentCountry ? "default" : "pointer")
      .on("click", function(event, d) {
        if (d.country !== currentCountry) {
          currentCountry = d.country;
          countrySelect.property("value", currentCountry);
          updateChart();
        }
      })
      .on("mouseover", function(event, d) {
        if (d.country !== currentCountry) {
          d3.select(this)
            .attr("opacity", 0.8)
            .attr("font-size", 11);
        }
      })
      .on("mouseout", function(event, d) {
        if (d.country !== currentCountry) {
          d3.select(this)
            .attr("opacity", 0.5)
            .attr("font-size", 10);
        }
      });

    // --- Trova i dati del paese selezionato ---
    const selectedCountryData = expandedData.find(d => d.country === currentCountry);

    // --- Punti di cambio direzione (massimi e minimi locali) per il paese selezionato ---
    pointsG.selectAll("*").remove();
    
    if (selectedCountryData) {
      // Punti dati interattivi per tutti i valori del paese selezionato
      // Aggiungi cerchi visibili
      pointsG
        .selectAll(".data-point-visible")
        .data(selectedCountryData.values)
        .join("circle")
        .attr("class", "data-point-visible")
        .attr("cx", d => xScale(d.YEAR))
        .attr("cy", d => yScale(d.EVENTS))
        .attr("r", 4)
        .attr("fill", getCountryColor(currentCountry))
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5)
        .attr("opacity", 0.7)
        .style("pointer-events", "none");

      // Aggiungi cerchi invisibili più grandi per catturare il mouse
      pointsG
        .selectAll(".data-point-hitarea")
        .data(selectedCountryData.values)
        .join("circle")
        .attr("class", "data-point-hitarea")
        .attr("cx", d => xScale(d.YEAR))
        .attr("cy", d => yScale(d.EVENTS))
        .attr("r", 12)
        .attr("fill", "transparent")
        .attr("stroke", "none")
        .style("cursor", "pointer")
        .on("mouseenter", function (event, d) {
          // Trova il cerchio visibile corrispondente
          const index = selectedCountryData.values.indexOf(d);
          d3.select(pointsG.selectAll(".data-point-visible").nodes()[index])
            .attr("r", 6)
            .attr("opacity", 1);
          
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
        .on("mouseleave", function (event, d) {
          // Ripristina il cerchio visibile
          const index = selectedCountryData.values.indexOf(d);
          d3.select(pointsG.selectAll(".data-point-visible").nodes()[index])
            .attr("r", 4)
            .attr("opacity", 0.7);
          
          hideTooltip();
        })
        .on("click", function (event, d) {
          event.stopPropagation();
          // Toggle: se clicco sullo stesso anno, deseleziono
          if (selectedYear === d.YEAR) {
            selectedYear = null;
          } else {
            selectedYear = d.YEAR;
          }
          updateVerticalLine();
        });
    }

    // Funzione per aggiornare la linea verticale e i punti di confronto
    function updateVerticalLine() {
      verticalLineG.selectAll("*").remove();
      comparisonPointsG.selectAll("*").remove();

      if (selectedYear === null) return;

      const x = xScale(selectedYear);

      // Disegna la linea verticale tratteggiata rossa
      verticalLineG
        .append("line")
        .attr("class", "comparison-vertical-line")
        .attr("x1", x)
        .attr("x2", x)
        .attr("y1", 0)
        .attr("y2", height)
        .attr("stroke", "#000")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "6,4")
        .attr("opacity", 0.6);

      // Aggiungi etichetta anno sulla linea
      verticalLineG
        .append("text")
        .attr("x", x)
        .attr("y", -10)
        .attr("text-anchor", "middle")
        .attr("font-size", 12)
        .attr("font-weight", "bold")
        .attr("fill", "#dc3545")
        .text(selectedYear);

      // Raccogli tutti i valori per quell'anno da tutti i paesi
      const yearData = expandedData
        .map(d => {
          const point = d.values.find(v => v.YEAR === selectedYear);
          return point ? { country: d.country, ...point } : null;
        })
        .filter(d => d !== null);

      // Disegna i punti di confronto per tutti i paesi
      comparisonPointsG
        .selectAll(".comparison-point")
        .data(yearData)
        .join("circle")
        .attr("class", "comparison-point")
        .attr("cx", x)
        .attr("cy", d => yScale(d.EVENTS))
        .attr("r", 5)
        .attr("fill", d => getCountryColor(d.country))
        .attr("stroke", "#000")
        .attr("stroke-width", 1)
        .attr("opacity", 0.9)
        .style("cursor", "pointer")
        .on("mouseenter", function (event, d) {
          d3.select(this)
            .attr("r", 7)
            .attr("stroke-width", 2);
          
          showTooltip(
            event,
            `<div style="text-align: center;"><strong>${d.country}</strong></div>` +
            `<strong>Year:</strong> ${d.YEAR}<br/>` +
            `<strong>${cfg.label}:</strong> ${d.EVENTS.toLocaleString()}`
          );
        })
        .on("mousemove", function (event, d) {
          showTooltip(
            event,
            `<div style="text-align: center;"><strong>${d.country}</strong></div>` +
            `<strong>Year:</strong> ${d.YEAR}<br/>` +
            `<strong>${cfg.label}:</strong> ${d.EVENTS.toLocaleString()}`
          );
        })
        .on("mouseleave", function () {
          d3.select(this)
            .attr("r", 5)
            .attr("stroke-width", 1);
          hideTooltip();
        })
        .on("click", function (event, d) {
          event.stopPropagation();
          if (d.country !== currentCountry) {
            currentCountry = d.country;
            countrySelect.property("value", currentCountry);
            updateChart();
          }
        });
    }

    // Inizializza la linea verticale se c'è un anno selezionato
    updateVerticalLine();

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
    selectedYear = null; // Reset anno selezionato quando cambia evento
    updateChart();
  });

  countrySelect.on("change", function () {
    currentCountry = this.value;
    updateChart();
  });

  // Click sul background SVG per deselezionare l'anno
  svg.on("click", function (event) {
    if (event.target === this || event.target.tagName === 'rect') {
      selectedYear = null;
      updateChart();
    }
  });

  // Primo draw
  updateChart();
}

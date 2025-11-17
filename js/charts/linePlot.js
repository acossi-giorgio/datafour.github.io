function renderLinePlotChart(container, datasets) {
  const root = d3.select(container);
  const svg = root.select("#lineplot-svg");
  
  if (root.empty() || svg.empty()) return;

  const eventSelect = d3.select("#lineplot-year-select");
  const storyEl = d3.select("#lineplot-story");
  
  const TOOLTIP_ID = 'lineplot-tooltip';
  let tooltip = d3.select(`#${TOOLTIP_ID}`);
  
  if (tooltip.empty()) {
    tooltip = d3.select('body').append('div')
      .attr('id', TOOLTIP_ID)
      .attr('class', 'chart-tooltip')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('display', 'none')
      .style('opacity', 0);
  }

  const updateTooltip = (show, event, content) => {
    if (!show) {
      tooltip.style('opacity', 0).style('display', 'none');
      return;
    }
    tooltip
      .style('display', 'block')
      .style('opacity', 1)
      .html(content)
      .style('left', `${event.pageX + 14}px`)
      .style('top', `${event.pageY + 16}px`);
  };

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
  const g = svg.append('g')
    .attr('class', 'chart-root')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const linesLayer = g.append("g").attr("class", "lines");
  const pointsLayer = g.append("g").attr("class", "points");
  const verticalLineLayer = g.append("g").attr("class", "vertical-line-group");
  const comparisonPointsLayer = g.append("g").attr("class", "comparison-points");

  const xAxisG = g.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`);
  const yAxisG = g.append("g").attr("class", "y-axis");

  g.append("text")
    .attr("class", "x-label")
    .attr("x", width / 2)
    .attr("y", height + 45)
    .attr("text-anchor", "middle")
    .attr("font-size", 13)
    .attr("font-weight", "bold")
    .text("Year");

  g.append("text")
    .attr("class", "y-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -75)
    .attr("text-anchor", "middle")
    .attr("font-size", 13)
    .attr("font-weight", "bold")
    .text("Number of Events");

  const EVENT_CONFIGS = [
    { id: "demostrationEvents", label: "Demonstration events", colorKey: DATASET_KEYS.DEMONSTRATIONS },
    { id: "politicalViolenceEvents", label: "Political violence events", colorKey: DATASET_KEYS.POLITICAL_VIOLENCE },
    { id: "targetingCiviliansEvents", label: "Events targeting civilians", colorKey: DATASET_KEYS.TARGET_CIVIL_EVENT },
    { id: "civilianFatalities", label: "Reported civilian fatalities", colorKey: DATASET_KEYS.CIVILIAN_FATALITIES },
  ];

  const allCountries = ["Pakistan", "Yemen", "Morocco", "Palestine", "Iran", "Syria", "Israel", "Iraq"].sort(d3.ascending);
  const eventById = new Map(EVENT_CONFIGS.map(d => [d.id, d]));

  const populateSelect = (sel, data, valFn, txtFn) => 
    sel.selectAll("option").data(data).join("option").attr("value", valFn).text(txtFn);

  populateSelect(eventSelect, EVENT_CONFIGS, d => d.id, d => d.label);

  let currentEventId = EVENT_CONFIGS[0].id;
  let currentCountry = allCountries[0];
  let selectedYear = null;

  eventSelect.property("value", currentEventId);

  const xScale = d3.scaleLinear().range([0, width]);
  const yScale = d3.scaleLinear().range([height, 0]);
  const lineGen = d3.line()
    .x(d => xScale(d.YEAR))
    .y(d => yScale(d.EVENTS))
    .defined(d => d.YEAR != null && d.EVENTS != null);

  function processData(eventId) {
    const raw = datasets[eventId] || [];
    const filtered = raw.filter(d => 
      d.COUNTRY && d.YEAR != null && d.EVENTS != null && 
      allCountries.includes(d.COUNTRY) && 
      (!window.isYearInRange || window.isYearInRange(d.YEAR))
    );

    if (!filtered.length) return { grouped: [], yearExtent: [0, 0], maxEvents: 0 };

    const yearExtent = d3.extent(filtered, d => d.YEAR);
    const maxEvents = d3.max(filtered, d => d.EVENTS) || 1;

    const grouped = Array.from(d3.group(filtered, d => d.COUNTRY), ([country, values]) => {
      const sorted = values.sort((a, b) => d3.ascending(a.YEAR, b.YEAR));
      const firstDataPoint = sorted[0];
      
      const missingYears = d3.range(yearExtent[0], firstDataPoint.YEAR).map(y => ({
        YEAR: y,
        EVENTS: firstDataPoint.EVENTS,
        COUNTRY: country,
        isFilled: true
      }));

      return {
        country,
        values: sorted,
        allValues: [...missingYears, ...sorted],
        filledYears: missingYears.map(m => m.YEAR)
      };
    });

    return { grouped, yearExtent, maxEvents };
  }

  function updateChart() {
    const eventConfig = eventById.get(currentEventId);
    const { grouped: data, yearExtent, maxEvents } = processData(currentEventId);
    
    if (!data.length) return;

    xScale.domain(yearExtent);
    yScale.domain([0, maxEvents]).nice();

    xAxisG.call(d3.axisBottom(xScale).ticks(Math.min(yearExtent[1] - yearExtent[0] + 1, 10)).tickFormat(d3.format("d")))
      .selectAll("text").attr("font-size", 12);
    yAxisG.call(d3.axisLeft(yScale).ticks(5))
      .selectAll("text").attr("font-size", 12);

    const getLineAttrs = (c, isActive) => ({
      stroke: isActive ? getCountryColor(c) : "#cccccc",
      width: isActive ? (c === currentCountry ? 4 : 2) : (c === currentCountry ? 1.5 : 1),
      opacity: isActive ? 1 : (c === currentCountry ? 0.3 : 0.2) 
    });

    const backgroundLines = linesLayer.selectAll(".country-line-background")
      .data(data.filter(d => d.country === currentCountry), d => d.country);

    backgroundLines.join("path")
      .attr("class", "country-line-background")
      .attr("fill", "none")
      .attr("stroke", "#cccccc")
      .attr("stroke-width", 4)
      .attr("stroke-linecap", "round")
      .attr("opacity", 0.4)
      .attr("d", d => lineGen(d.values))
      .style("pointer-events", "none");

    linesLayer.selectAll(".country-line")
      .data(data, d => d.country)
      .join("path")
      .attr("class", "country-line")
      .attr("fill", "none")
      .attr("stroke-linecap", "round")
      .attr("d", d => lineGen(d.values))
      .attr("stroke", d => getLineAttrs(d.country, d.country === currentCountry).stroke)
      .attr("stroke-width", d => d.country === currentCountry ? 4 : 1.5)
      .attr("opacity", d => d.country === currentCountry ? 1 : 0.3)
      .style("cursor", "pointer")
      .each(function(d) {
        if (d.country === currentCountry && !d3.select(this).classed("animated")) {
          const len = this.getTotalLength();
          d3.select(this)
            .attr("stroke-dasharray", len)
            .attr("stroke-dashoffset", len)
            .classed("animated", true)
            .transition().duration(1500).ease(d3.easeLinear)
            .attr("stroke-dashoffset", 0)
            .on("end", function() { d3.select(this).attr("stroke-dasharray", "none"); });
        } else if (d.country !== currentCountry) {
          d3.select(this).attr("stroke-dasharray", "none").classed("animated", false);
        }
      })
      .on("mousemove", function(event, d) {
        const vals = d.values.map(v => v.EVENTS);
        const stats = {
          min: d3.min(vals),
          max: d3.max(vals),
          first: d3.min(d.values, v => v.YEAR),
          last: d3.max(d.values, v => v.YEAR)
        };
        
        updateTooltip(true, event, 
          `<strong>${d.country}</strong><br/>${stats.first}–${stats.last}<br/>Min: ${stats.min}<br/>Max: ${stats.max}`
        );

        if (d.country !== currentCountry) d3.select(this).attr("stroke-width", 2.5).attr("opacity", 0.6);
      })
      .on("mouseout", function(event, d) {
        updateTooltip(false);
        if (d.country !== currentCountry) d3.select(this).attr("stroke-width", 1.5).attr("opacity", 0.3);
      })
      .on("click", (e, d) => {
        if (d.country !== currentCountry) {
          currentCountry = d.country;
          updateChart();
          updateTooltip(false);
        }
      });

    const dashedData = data.filter(d => d.filledYears.length > 0);
    linesLayer.selectAll(".country-line-dashed")
      .data(dashedData, d => d.country)
      .join("path")
      .attr("class", "country-line-dashed")
      .attr("fill", "none")
      .attr("stroke-dasharray", "5,5")
      .attr("d", d => lineGen(d.allValues.filter(v => v.isFilled || v.YEAR === d.values[0].YEAR)))
      .attr("stroke", d => getLineAttrs(d.country, d.country === currentCountry).stroke)
      .attr("stroke-width", d => d.country === currentCountry ? 2 : 1)
      .attr("opacity", d => d.country === currentCountry ? 0.6 : 0.2)
      .style("pointer-events", "none");

    const extensionData = data.filter(d => d.values[d.values.length - 1].YEAR < yearExtent[1]);
    linesLayer.selectAll(".country-line-extension")
      .data(extensionData, d => d.country)
      .join("line")
      .attr("class", "country-line-extension")
      .attr("x1", d => xScale(d.values[d.values.length - 1].YEAR))
      .attr("y1", d => yScale(d.values[d.values.length - 1].EVENTS))
      .attr("x2", xScale(yearExtent[1]))
      .attr("y2", d => yScale(d.values[d.values.length - 1].EVENTS))
      .attr("stroke", d => getLineAttrs(d.country, d.country === currentCountry).stroke)
      .attr("stroke-width", d => d.country === currentCountry ? 2 : 1)
      .attr("stroke-dasharray", "5,5")
      .attr("opacity", d => d.country === currentCountry ? 0.5 : 0.2)
      .style("pointer-events", "none");

    const labelData = data.map(d => {
      const last = d.values[d.values.length - 1];
      return { country: d.country, x: xScale(last.YEAR) + 5, y: yScale(last.EVENTS) };
    }).sort((a, b) => a.y - b.y);

    const minLabelSpacing = 14;
    for (let i = 1; i < labelData.length; i++) {
      if (labelData[i].y - labelData[i - 1].y < minLabelSpacing) {
        labelData[i].y = labelData[i - 1].y + minLabelSpacing;
      }
    }

    linesLayer.selectAll(".country-label")
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
      .style("cursor", d => d.country === currentCountry ? "default" : "pointer")
      .on("click", (e, d) => {
        if (d.country !== currentCountry) {
          currentCountry = d.country;
          updateChart();
        }
      })
      .on("mouseover", function(e, d) {
        if (d.country !== currentCountry) d3.select(this).attr("opacity", 0.8).attr("font-size", 11);
      })
      .on("mouseout", function(e, d) {
        if (d.country !== currentCountry) d3.select(this).attr("opacity", 0.5).attr("font-size", 10);
      });

    pointsLayer.selectAll("*").remove();
    const selectedCountryData = data.find(d => d.country === currentCountry);

    if (selectedCountryData) {
      pointsLayer.selectAll(".data-point-visible")
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

      pointsLayer.selectAll(".data-point-hitarea")
        .data(selectedCountryData.values)
        .join("circle")
        .attr("class", "data-point-hitarea")
        .attr("cx", d => xScale(d.YEAR))
        .attr("cy", d => yScale(d.EVENTS))
        .attr("r", 12)
        .attr("fill", "transparent")
        .style("cursor", "pointer")
        .on("mouseenter", (event, d) => {
          const idx = selectedCountryData.values.indexOf(d);
          d3.select(pointsLayer.selectAll(".data-point-visible").nodes()[idx]).attr("r", 6).attr("opacity", 1);
          updateTooltip(true, event, `<div style="text-align: center;"><strong>${currentCountry}</strong></div><strong>Year:</strong> ${d.YEAR}<br/><strong>${eventConfig.label}:</strong> ${d.EVENTS.toLocaleString()}`);
        })
        .on("mousemove", (event, d) => {
          updateTooltip(true, event, `<div style="text-align: center;"><strong>${currentCountry}</strong></div><strong>Year:</strong> ${d.YEAR}<br/><strong>${eventConfig.label}:</strong> ${d.EVENTS.toLocaleString()}`);
        })
        .on("mouseleave", (event, d) => {
          const idx = selectedCountryData.values.indexOf(d);
          d3.select(pointsLayer.selectAll(".data-point-visible").nodes()[idx]).attr("r", 4).attr("opacity", 0.7);
          updateTooltip(false);
        })
        .on("click", (event, d) => {
          event.stopPropagation();
          selectedYear = selectedYear === d.YEAR ? null : d.YEAR;
          updateVerticalLine();
        });
    }

    function updateVerticalLine() {
      verticalLineLayer.selectAll("*").remove();
      comparisonPointsLayer.selectAll("*").remove();

      if (selectedYear === null) return;

      const x = xScale(selectedYear);
      const vLine = verticalLineLayer.append("g");
      
      vLine.append("line")
        .attr("x1", x).attr("x2", x).attr("y1", 0).attr("y2", height)
        .attr("stroke", "#000").attr("stroke-width", 1).attr("stroke-dasharray", "6,4").attr("opacity", 0.6);

      vLine.append("text")
        .attr("x", x).attr("y", -10)
        .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", "bold").attr("fill", "#dc3545")
        .text(selectedYear);

      const yearData = data.map(d => {
        const p = d.values.find(v => v.YEAR === selectedYear);
        return p ? { country: d.country, ...p } : null;
      }).filter(Boolean);

      comparisonPointsLayer.selectAll(".comparison-point")
        .data(yearData)
        .join("circle")
        .attr("class", "comparison-point")
        .attr("cx", x)
        .attr("cy", d => yScale(d.EVENTS))
        .attr("r", 5)
        .attr("fill", d => getCountryColor(d.country))
        .attr("stroke", "#000").attr("stroke-width", 1).attr("opacity", 0.9)
        .style("cursor", "pointer")
        .on("mouseenter", function(e, d) {
          d3.select(this).attr("r", 7).attr("stroke-width", 2);
          updateTooltip(true, e, `<div style="text-align: center;"><strong>${d.country}</strong></div><strong>Year:</strong> ${d.YEAR}<br/><strong>${eventConfig.label}:</strong> ${d.EVENTS.toLocaleString()}`);
        })
        .on("mousemove", function(e, d) {
           updateTooltip(true, e, `<div style="text-align: center;"><strong>${d.country}</strong></div><strong>Year:</strong> ${d.YEAR}<br/><strong>${eventConfig.label}:</strong> ${d.EVENTS.toLocaleString()}`);
        })
        .on("mouseleave", function() {
          d3.select(this).attr("r", 5).attr("stroke-width", 1);
          updateTooltip(false);
        })
        .on("click", (e, d) => {
          e.stopPropagation();
          if (d.country !== currentCountry) {
            currentCountry = d.country;
            updateChart();
          }
        });
    }

    updateVerticalLine();

    if (!storyEl.empty() && selectedCountryData?.values.length) {
      const vals = selectedCountryData.values;
      const minVal = d3.min(vals, d => d.EVENTS);
      const maxVal = d3.max(vals, d => d.EVENTS);
      storyEl.text(`${currentCountry} – from ${vals[0].YEAR} to ${vals[vals.length - 1].YEAR}, ${eventConfig.label.toLowerCase()} range between ${minVal} and ${maxVal} events per year.`);
    }
  }

  eventSelect.on("change", function() {
    currentEventId = this.value;
    selectedYear = null;
    updateChart();
  });

  svg.on("click", (e) => {
    if (e.target === svg.node() || e.target.tagName === 'rect') {
      selectedYear = null;
      updateChart();
    }
  });

  updateChart();
}
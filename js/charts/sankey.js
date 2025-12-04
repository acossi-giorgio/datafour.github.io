function renderSankeyChart(container, datasets) {
  const root = d3.select(container);
  if (root.empty()) {
    console.warn('Container not found for sankey chart');
    return;
  }

  // UI Elements
  const svg = root.select('#sankey-svg');
  const countrySelect = root.select('#sankey-country-select');
  const yearStartSelect = root.select('#sankey-year-start');
  const yearEndSelect = root.select('#sankey-year-end');

  // Year range
  const YEAR_MIN = 2015;
  const YEAR_MAX = 2024;
  const years = d3.range(YEAR_MIN, YEAR_MAX + 1);

  // Function to update year end options based on year start selection
  function updateYearEndOptions(minYear) {
    if (yearEndSelect.empty()) return;
    
    const currentEnd = +yearEndSelect.property('value');
    const validYears = years.filter(y => y >= minYear);
    
    yearEndSelect.selectAll('option').remove();
    yearEndSelect.selectAll('option')
      .data(validYears)
      .enter()
      .append('option')
      .attr('value', d => d)
      .text(d => d);
    
    // Keep current selection if valid, otherwise set to max
    if (currentEnd >= minYear) {
      yearEndSelect.property('value', currentEnd);
    } else {
      yearEndSelect.property('value', YEAR_MAX);
    }
  }

  // Function to update year start options based on year end selection
  function updateYearStartOptions(maxYear) {
    if (yearStartSelect.empty()) return;
    
    const currentStart = +yearStartSelect.property('value');
    const validYears = years.filter(y => y <= maxYear);
    
    yearStartSelect.selectAll('option').remove();
    yearStartSelect.selectAll('option')
      .data(validYears)
      .enter()
      .append('option')
      .attr('value', d => d)
      .text(d => d);
    
    // Keep current selection if valid, otherwise set to min
    if (currentStart <= maxYear) {
      yearStartSelect.property('value', currentStart);
    } else {
      yearStartSelect.property('value', YEAR_MIN);
    }
  }

  // Initial populate year selectors
  if (!yearStartSelect.empty()) {
    yearStartSelect.selectAll('option').remove();
    yearStartSelect.selectAll('option')
      .data(years)
      .enter()
      .append('option')
      .attr('value', d => d)
      .text(d => d);
    yearStartSelect.property('value', YEAR_MIN);
  }

  if (!yearEndSelect.empty()) {
    yearEndSelect.selectAll('option').remove();
    yearEndSelect.selectAll('option')
      .data(years)
      .enter()
      .append('option')
      .attr('value', d => d)
      .text(d => d);
    yearEndSelect.property('value', YEAR_MAX);
  }

  // Tooltip
  const TOOLTIP_ID = 'sankey-tooltip';
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
    .style('padding', '10px 14px')
    .style('border-radius', '6px')
    .style('font-size', '13px')
    .style('font-family', 'Roboto Slab, serif')
    .style('z-index', 10000)
    .style('box-shadow', '0 2px 12px rgba(0,0,0,0.3)')
    .style('max-width', '300px');

  // Chart margins
  const margin = { top: 20, right: 200, bottom: 20, left: 20 };

  // Compute responsive dimensions based on container width
  function computeDimensions() {
    const containerNode = root.node();
    let containerWidth = 1100; // fallback
    if (containerNode) {
      const rect = containerNode.getBoundingClientRect();
      if (rect && rect.width) containerWidth = Math.max(600, Math.round(rect.width));
    }
    const fullWidth = containerWidth;
    const fullHeight = Math.max(400, Math.round(fullWidth * 0.6));
    const width = fullWidth - margin.left - margin.right;
    const height = fullHeight - margin.top - margin.bottom;
    return { fullWidth, fullHeight, width, height };
  }

  // Simple debounce helper
  function debounce(fn, wait) {
    let t;
    return function(...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // Apply initial responsive sizing to the SVG
  const initialDims = computeDimensions();
  svg
    .attr('viewBox', `0 0 ${initialDims.fullWidth} ${initialDims.fullHeight}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('width', '100%')
    .style('max-width', '100%')
    .style('height', 'auto');
  // Clear previous content
  svg.selectAll('g.chart-root').remove();
  const g = svg
    .append('g')
    .attr('class', 'chart-root')
    .attr('transform', `translate(${margin.left},${margin.top})`);
  const chartGroup = g.append('g').attr('class', 'sankey-group');

  // Load and process data (keep all data, filter later)
  const rawAll = (datasets.meaAggregatedData || []).map(d => ({
    country: (d.COUNTRY || d.Country || '').trim(),
    eventType: (d.EVENT_TYPE || d.EventType || '').trim(),
    subEventType: (d.SUB_EVENT_TYPE || d.SubEventType || '').trim(),
    events: +(d.EVENTS || 0),
    fatalities: +(d.FATALITIES || 0),
    year: +(d.YEAR || d.Year || 0)
  })).filter(d => d.country && d.eventType && d.subEventType && d.year >= YEAR_MIN && d.year <= YEAR_MAX);

  // Get unique countries
  const countries = [...new Set(rawAll.map(d => d.country))].sort();

  // Populate country selector
  if (!countrySelect.empty()) {
    countrySelect.selectAll('option').remove();
    countrySelect.selectAll('option')
      .data(countries)
      .enter()
      .append('option')
      .attr('value', d => d)
      .text(d => d);
    
    // Default to first country with substantial data
    const defaultCountry = countries.includes('Syria') ? 'Syria' : 
                          countries.includes('Yemen') ? 'Yemen' : countries[0];
    countrySelect.property('value', defaultCountry);
  }

  const eventTypeColors = d3.scaleOrdinal()
    .domain(['Protests', 'Violence against civilians', 'Battles', 'Explosions/Remote violence', 'Riots', 'Strategic developments'])
    .range([
      '#2a7700',  
      '#bc0303',  
      '#d8a305',  
      '#d84f05',  
      '#1461a9',  
      '#666666'   
    ]);

  // Create a sankey generator for given drawing width/height
  function createSankey(drawWidth, drawHeight) {
    return d3.sankey()
      .nodeId(d => d.name)
      .nodeWidth(20)
      .nodePadding(12)
      .nodeAlign(d3.sankeyLeft)
      .extent([[0, 0], [Math.max(0, drawWidth - 100), Math.max(0, drawHeight)]]);
  }

  function showTooltip(event, content) {
    tooltip
      .style('display', 'block')
      .style('opacity', 1)
      .html(content)
      .style('left', (event.clientX + 15) + 'px')
      .style('top', (event.clientY + 15) + 'px');
  }

  function hideTooltip() {
    tooltip.style('display', 'none').style('opacity', 0);
  }

  function drawSankey(country, yearStart, yearEnd, animate = true) {
    if (animate && chartGroup.selectAll('*').size() > 0) {
      chartGroup.selectAll('*')
        .transition()
        .duration(300)
        .style('opacity', 0)
        .remove();
      
      setTimeout(() => {
        drawSankeyContent(country, yearStart, yearEnd);
      }, 320);
    } else {
      chartGroup.selectAll('*').remove();
      drawSankeyContent(country, yearStart, yearEnd);
    }
  }

  function drawSankeyContent(country, yearStart, yearEnd) {
    // Recompute dimensions for responsive behavior
    const dims = computeDimensions();
    const fullWidth = dims.fullWidth;
    const fullHeight = dims.fullHeight;
    const width = dims.width;
    const height = dims.height;

    // Ensure SVG viewBox matches current container size
    svg.attr('viewBox', `0 0 ${fullWidth} ${fullHeight}`);

    const countryData = rawAll.filter(d => 
      d.country === country && 
      d.year >= yearStart && 
      d.year <= yearEnd
    );

    if (countryData.length === 0) {
      chartGroup.selectAll('*').remove();
      chartGroup.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .style('fill', '#666')
        .style('opacity', 0)
        .transition()
        .duration(400)
        .style('opacity', 1)
        .text('No data available for this selection');
      return;
    }

    const flowMap = d3.rollup(
      countryData,
      v => ({
        events: d3.sum(v, d => d.events),
        fatalities: d3.sum(v, d => d.fatalities)
      }),
      d => d.eventType,
      d => d.subEventType
    );

    const nodeSet = new Set();
    const links = [];

    flowMap.forEach((subTypes, eventType) => {
      nodeSet.add(eventType);
      subTypes.forEach((values, subType) => {
        const targetName = `${subType}`;
        nodeSet.add(targetName);
        links.push({
          source: eventType,
          target: targetName,
          value: values.events,
          fatalities: values.fatalities,
          eventType: eventType
        });
      });
    });

    const filteredLinks = links.filter(l => l.value > 0);

    if (filteredLinks.length === 0) {
      chartGroup.selectAll('*').remove();
      chartGroup.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .style('fill', '#666')
        .style('opacity', 0)
        .text('No event data available')
        .transition()
        .duration(400)
        .style('opacity', 1);
      return;
    }

    const nodes = Array.from(nodeSet).map(name => ({ name }));

    const sankeyGenerator = createSankey(width, height);
    const sankeyData = sankeyGenerator({
      nodes: nodes.map(d => ({ ...d })),
      links: filteredLinks.map(d => ({ ...d }))
    });

    chartGroup.selectAll('*').remove();

    const clipId = 'sankey-clip-' + Math.random().toString(36).substr(2, 9);
    const defs = chartGroup.append('defs');
    const clipRect = defs.append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('x', -margin.left)
      .attr('y', -margin.top)
      .attr('width', 0)
      .attr('height', 0);

    // Expand clip to include margins and extra padding so labels are not cut
    clipRect.transition()
      .duration(600)
      .ease(d3.easeQuadOut)
      .attr('width', width + margin.left + margin.right + 300)
      .attr('height', height + margin.top + margin.bottom + 100);

    const linkGroup = chartGroup.append('g')
      .attr('class', 'links')
      .attr('clip-path', `url(#${clipId})`);
    
    linkGroup.selectAll('path')
      .data(sankeyData.links)
      .join('path')
      .attr('d', d3.sankeyLinkHorizontal())
      .attr('fill', 'none')
      .attr('stroke', d => {
        const color = eventTypeColors(d.eventType);
        return color || '#999';
      })
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', d => Math.max(1, d.width))
      .style('cursor', 'pointer');

    const nodeGroup = chartGroup.append('g')
      .attr('class', 'nodes')
      .attr('clip-path', `url(#${clipId})`);

    const node = nodeGroup.selectAll('g')
      .data(sankeyData.nodes)
      .join('g')
      .attr('class', 'node');

    function highlightLink(linkData) {
      const connectedNodeNames = new Set([linkData.source.name, linkData.target.name]);

      linkGroup.selectAll('path')
        .transition()
        .duration(200)
        .attr('stroke-opacity', l => 
          (l.source.name === linkData.source.name && l.target.name === linkData.target.name) ? 0.8 : 0.1
        );

      nodeGroup.selectAll('g.node')
        .transition()
        .duration(200)
        .style('opacity', n => connectedNodeNames.has(n.name) ? 1 : 0.2);
    }

    function highlightPath(d) {
      const connectedLinks = sankeyData.links.filter(l => 
        l.source.name === d.name || l.target.name === d.name
      );
      
      const connectedNodeNames = new Set([d.name]);
      connectedLinks.forEach(l => {
        connectedNodeNames.add(l.source.name);
        connectedNodeNames.add(l.target.name);
      });


      linkGroup.selectAll('path')
        .transition()
        .duration(200)
        .attr('stroke-opacity', l => 
          (l.source.name === d.name || l.target.name === d.name) ? 0.8 : 0.1
        );

      // Dim all nodes
      nodeGroup.selectAll('g.node')
        .transition()
        .duration(200)
        .style('opacity', n => connectedNodeNames.has(n.name) ? 1 : 0.2);
    }

    function resetHighlight() {
      // Restore all links
      linkGroup.selectAll('path')
        .transition()
        .duration(200)
        .attr('stroke-opacity', 0.5);

      // Restore all nodes
      nodeGroup.selectAll('g.node')
        .transition()
        .duration(200)
        .style('opacity', 1);
    }

    // Add event listeners for links
    linkGroup.selectAll('path')
      .on('mouseover', function(event, d) {
        highlightLink(d);
        showTooltip(event, `
          <strong>${d.source.name}</strong> → <strong>${d.target.name}</strong><br>
          Events: ${d3.format(',')(d.value)}<br>
          Fatalities: ${d3.format(',')(d.fatalities)}
        `);
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', (event.clientX + 15) + 'px')
          .style('top', (event.clientY + 15) + 'px');
      })
      .on('mouseout', function() {
        resetHighlight();
        hideTooltip();
      });

    // Store fill colors for each node
    const getNodeColor = (d) => {
      const isSource = sankeyData.links.some(l => l.source.name === d.name);
      if (isSource && !sankeyData.links.some(l => l.target.name === d.name)) {
        return eventTypeColors(d.name) || '#69b3a2';
      }
      const parentLink = sankeyData.links.find(l => l.target.name === d.name);
      if (parentLink) {
        return d3.color(eventTypeColors(parentLink.eventType)).darker(0.3) || '#999';
      }
      return '#999';
    };

    node.append('rect')
      .attr('x', d => d.x0)
      .attr('y', d => d.y0)
      .attr('height', d => Math.max(1, d.y1 - d.y0))
      .attr('width', d => d.x1 - d.x0)
      .attr('fill', d => getNodeColor(d))
      .attr('stroke', '#333')
      .attr('stroke-width', 0.5)
      .attr('rx', 3)
      .attr('ry', 3)
      .style('cursor', 'pointer')
      .on('mouseover', function(event, d) {
        // Highlight the path
        highlightPath(d);
        
        const totalEvents = d.value || 0;
        const outgoingLinks = sankeyData.links.filter(l => l.source.name === d.name);
        
        let content = `<strong>${d.name}</strong><br>Total Events: ${d3.format(',')(totalEvents)}`;
        
        if (outgoingLinks.length > 0) {
          content += '<br><br><em>Sub-types:</em>';
          outgoingLinks.slice(0, 5).forEach(l => {
            content += `<br>• ${l.target.name}: ${d3.format(',')(l.value)}`;
          });
          if (outgoingLinks.length > 5) {
            content += `<br>...and ${outgoingLinks.length - 5} more`;
          }
        }
        
        showTooltip(event, content);
        d3.select(this).attr('stroke-width', 2);
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', (event.clientX + 15) + 'px')
          .style('top', (event.clientY + 15) + 'px');
      })
      .on('mouseout', function() {
        // Reset highlight
        resetHighlight();
        hideTooltip();
        d3.select(this).attr('stroke-width', 0.5);
      });

    // Helper function to generate tooltip content for a node
    function getNodeTooltipContent(d) {
      const totalEvents = d.value || 0;
      const incomingLinks = sankeyData.links.filter(l => l.target.name === d.name);
      const outgoingLinks = sankeyData.links.filter(l => l.source.name === d.name);
      
      let content = `<strong>${d.name}</strong><br>Total Events: ${d3.format(',')(totalEvents)}`;
      
      if (outgoingLinks.length > 0) {
        content += '<br><br><em>Sub-types:</em>';
        outgoingLinks.slice(0, 5).forEach(l => {
          content += `<br>• ${l.target.name}: ${d3.format(',')(l.value)}`;
        });
        if (outgoingLinks.length > 5) {
          content += `<br>...and ${outgoingLinks.length - 5} more`;
        }
      }
      
      return content;
    }

    // Add labels - always on the right side with fixed font size, interactive
    node.append('text')
      .attr('x', d => d.x1 + 6)
      .attr('y', d => (d.y1 + d.y0) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'start')
      .text(d => d.name.length > 30 ? d.name.substring(0, 27) + '...' : d.name)
      .style('font-size', '11px')
      .style('font-family', 'Roboto Slab, serif')
      .style('fill', '#333')
      .style('cursor', 'pointer')
      .on('mouseover', function(event, d) {
        // Highlight the path
        highlightPath(d);
        showTooltip(event, getNodeTooltipContent(d));
        // Highlight the corresponding rect
        d3.select(this.parentNode).select('rect').attr('stroke-width', 2);
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', (event.clientX + 15) + 'px')
          .style('top', (event.clientY + 15) + 'px');
      })
      .on('mouseout', function() {
        // Reset highlight
        resetHighlight();
        hideTooltip();
        d3.select(this.parentNode).select('rect').attr('stroke-width', 0.5);
      });
  }

  // Helper function to get current selections and redraw
  function updateChart(animate = true) {
    const country = countrySelect.empty() ? countries[0] : countrySelect.property('value');
    const yearStart = yearStartSelect.empty() ? YEAR_MIN : +yearStartSelect.property('value');
    const yearEnd = yearEndSelect.empty() ? YEAR_MAX : +yearEndSelect.property('value');
    
    // Ensure yearStart <= yearEnd
    const actualStart = Math.min(yearStart, yearEnd);
    const actualEnd = Math.max(yearStart, yearEnd);
    
    drawSankey(country, actualStart, actualEnd, animate);
  }

  // Initial draw (with animation)
  updateChart(true);

  // Redraw on window resize (debounced)
  const handleResize = debounce(() => updateChart(false), 150);
  window.addEventListener('resize', handleResize);

  // Event listeners for controls
  if (!countrySelect.empty()) {
    countrySelect.on('change', () => updateChart(true));
  }
  if (!yearStartSelect.empty()) {
    yearStartSelect.on('change', function() {
      const selectedStart = +this.value;
      updateYearEndOptions(selectedStart);
      updateChart(true);
    });
  }
  if (!yearEndSelect.empty()) {
    yearEndSelect.on('change', function() {
      const selectedEnd = +this.value;
      updateYearStartOptions(selectedEnd);
      updateChart(true);
    });
  }
}

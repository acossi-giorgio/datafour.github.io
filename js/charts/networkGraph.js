function renderNetworkGraph(container, datasets) {
  const data = datasets.networkData;
  const nodes = data.nodes.map(d => ({...d}));
  const links = data.links.map(d => ({...d}));

  function getLinkId(linkEnd) {
    return typeof linkEnd === 'object' ? linkEnd.id : linkEnd;
  }

  function getCountryTooltip(countryId) {
    const connectedLinks = links.filter(l => getLinkId(l.source) === countryId || getLinkId(l.target) === countryId);
    const totalEvents = connectedLinks.reduce((sum, l) => sum + l.value, 0);
    
    const typeComposition = {};
    connectedLinks.forEach(link => {
      const sourceId = getLinkId(link.source);
      const targetId = getLinkId(link.target);
      const typeId = targetId === countryId ? sourceId : targetId;
      if (!typeComposition[typeId]) {
        typeComposition[typeId] = 0;
      }
      typeComposition[typeId] += link.value;
    });

    const sortedTypes = Object.entries(typeComposition)
      .sort((a, b) => b[1] - a[1]);

    let html = `<div style="text-align: center;"><strong>${countryId}</strong></div>Total Events:${totalEvents}<hr style="margin: 4px 0; border: 0; border-top: 1px solid rgba(255,255,255,0.3);">`;
    
    sortedTypes.forEach(([type, count], index) => {
      const percentage = ((count / totalEvents) * 100).toFixed(1);
      html += `${index > 0 ? '<br>' : ''}${type}: ${count} (${percentage}%)`;
    });

    return html;
  }

  function getEventTypeTooltip(typeId) {
    const connectedLinks = links.filter(l => getLinkId(l.source) === typeId || getLinkId(l.target) === typeId);
    const totalEvents = connectedLinks.reduce((sum, l) => sum + l.value, 0);
    
    const countryComposition = {};
    connectedLinks.forEach(link => {
      const sourceId = getLinkId(link.source);
      const targetId = getLinkId(link.target);
      const countryId = sourceId === typeId ? targetId : sourceId;
      if (!countryComposition[countryId]) {
        countryComposition[countryId] = 0;
      }
      countryComposition[countryId] += link.value;
    });

    const sortedCountries = Object.entries(countryComposition)
      .sort((a, b) => b[1] - a[1]);

    let html = `<div style="text-align: center;"><strong>${typeId}</strong></div><strong>Total Events:</strong> ${totalEvents}<hr style="margin: 4px 0; border: 0; border-top: 1px solid rgba(255,255,255,0.3);">`;
    
    sortedCountries.forEach(([country, count], index) => {
      const percentage = ((count / totalEvents) * 100).toFixed(1);
      html += `${index > 0 ? '<br>' : ''}<strong>${country}:</strong> ${count} (${percentage}%)`;
    });

    return html;
  }

  const width = 800;
  const height = 800;
  const centerX = width / 2;
  const centerY = height / 2;

  const root = d3.select(container);
  const containerDiv = root.select('#network-graph-container');
  
  containerDiv.selectAll('*').remove();

  const svg = containerDiv.append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', [-50, 50, 900, 700])
      .attr('style', 'max-width: 100%; height: auto;');

  const countryNodes = nodes.filter(d => d.group === 'country');
  const eventTypeNodes = nodes.filter(d => d.group !== 'country');

  const innerRadius = 120;
  eventTypeNodes.forEach((d, i) => {
    const angle = (2 * Math.PI * i) / eventTypeNodes.length - Math.PI / 2;
    d.x = centerX + innerRadius * Math.cos(angle);
    d.y = centerY + innerRadius * Math.sin(angle);
  });

  const outerRadius = 280;
  countryNodes.forEach((d, i) => {
    const angle = (2 * Math.PI * i) / countryNodes.length - Math.PI / 2;
    d.x = centerX + outerRadius * Math.cos(angle);
    d.y = centerY + outerRadius * Math.sin(angle);
  });

  nodes.forEach(d => {
    d.fx = d.x;
    d.fy = d.y;
  });

  const nodeMap = new Map(nodes.map(d => [d.id, d]));

  links.forEach(link => {
    if (typeof link.source === 'string') {
      link.source = nodeMap.get(link.source);
    }
    if (typeof link.target === 'string') {
      link.target = nodeMap.get(link.target);
    }
  });

  const link = svg.append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.3)
    .selectAll("line")
    .data(links)
    .join("line")
      .attr("class", "network-link")
      .attr("stroke-width", d => Math.max(1, Math.sqrt(d.value) * 0.05));

  const node = svg.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
    .selectAll("circle")
    .data(nodes)
    .join("circle")
      .attr("class", "network-node")
      .attr("r", 12)
      .attr("fill", d => d.group === 'country' ? "#1f77b4" : "#ff7f0e")
      .style("cursor", "pointer");

  const tooltip = d3.select(container)
      .append("div")
      .style("position", "absolute")
      .style("background-color", "rgba(33, 33, 33, 0.95)")
      .style("color", "white")
      .style("padding", "8px 12px")
      .style("border-radius", "4px")
      .style("font-size", "13px")
      .style("font-family", "sans-serif")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .style("z-index", "1000")
      .style("line-height", "1.4")
      .style("text-align", "left");

  const labels = svg.append("g")
      .attr("class", "labels")
      .style("pointer-events", "none")
    .selectAll("text")
    .data(nodes)
    .join("text")
      .attr("class", "network-label")
      .attr("dx", 18)
      .attr("dy", ".35em")
      .text(d => d.id)
      .style("font-family", "sans-serif")
      .style("font-size", "12px")
      .style("fill", "#333")
      .style("stroke", "white")
      .style("stroke-width", "3px")
      .style("paint-order", "stroke");

  node.on("mouseover", function(event, d) {
    node.style("opacity", 0.1);
    link.style("opacity", 0.05);
    labels.style("opacity", 0.1);

    d3.select(this).style("opacity", 1);
    
    const connectedLinks = links.filter(l => getLinkId(l.source) === d.id || getLinkId(l.target) === d.id);
    const neighborIds = new Set();
    connectedLinks.forEach(l => {
      neighborIds.add(getLinkId(l.source));
      neighborIds.add(getLinkId(l.target));
    });

    node.filter(n => neighborIds.has(n.id)).style("opacity", 1);
    labels.filter(n => neighborIds.has(n.id) || n.id === d.id).style("opacity", 1);

    link.filter(l => getLinkId(l.source) === d.id || getLinkId(l.target) === d.id)
        .style("opacity", 0.8)
        .attr("stroke", "#555");

    const tooltipContent = d.group === 'country' ? getCountryTooltip(d.id) : getEventTypeTooltip(d.id);
    tooltip.html(tooltipContent)
        .style("opacity", 1)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY + 10) + "px");
  })
  .on("mousemove", function(event) {
    tooltip.style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY + 10) + "px");
  })
  .on("mouseout", function() {
    node.style("opacity", 1).attr("stroke", "#fff");
    link.style("opacity", 0.3).attr("stroke", "#999");
    labels.style("opacity", 1);
    
    tooltip.style("opacity", 0);
  })
  .on("click", function(event, d) {
    event.stopPropagation();
    
    const tooltipContent = d.group === 'country' ? getCountryTooltip(d.id) : getEventTypeTooltip(d.id);
    tooltip.html(tooltipContent)
        .style("opacity", 1)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY + 10) + "px");
  });

  svg.on("click", function() {
    tooltip.style("opacity", 0);
  });

  link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

  node
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);
      
  labels
      .attr("x", d => d.x)
      .attr("y", d => d.y);
}

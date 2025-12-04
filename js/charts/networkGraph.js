function renderNetworkGraph(container, datasets) {
  const data = datasets.networkData;
  // Clone data to avoid mutation issues if re-rendered
  const nodes = data.nodes.map(d => ({...d}));
  const links = data.links.map(d => ({...d}));

  const width = 800;
  const height = 800;
  const centerX = width / 2;
  const centerY = height / 2;

  const root = d3.select(container);
  const containerDiv = root.select('#network-graph-container');
  
  // Clear previous
  containerDiv.selectAll('*').remove();

  const svg = containerDiv.append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', [-50, 50, 900, 700])
      .attr('style', 'max-width: 100%; height: auto;');

  // Separate nodes by group
  const countryNodes = nodes.filter(d => d.group === 'country');
  const otherNodes = nodes.filter(d => d.group !== 'country');

  // Seeded random for consistent pseudo-random positioning
  const seededRandom = (seed) => {
    const x = Math.sin(seed * 9999) * 10000;
    return x - Math.floor(x);
  };

  // Position country nodes (blue) pseudo-randomly in the center area
  const innerRadius = 1000;
  countryNodes.forEach((d, i) => {
    const angle = seededRandom(i * 7) * 2 * Math.PI;
    const radius = seededRandom(i * 13) * innerRadius;
    d.x = centerX + radius * Math.cos(angle);
    d.y = centerY + radius * Math.sin(angle);
  });

  // Position other nodes (orange) radially around the center
  const outerRadius = 300;
  otherNodes.forEach((d, i) => {
    const angle = (2 * Math.PI * i) / otherNodes.length - Math.PI / 2;
    d.x = centerX + outerRadius * Math.cos(angle);
    d.y = centerY + outerRadius * Math.sin(angle);
  });

  // Simulation with radial force for orange nodes, blue nodes stay in center area
  const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(150).strength(0.1))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("radial", d3.forceRadial(d => d.group === 'country' ? 0 : outerRadius, centerX, centerY).strength(d => d.group === 'country' ? 0.3 : 0.8))
      .force("collide", d3.forceCollide().radius(30));

  // Links with lower default opacity
  const link = svg.append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.3)
    .selectAll("line")
    .data(links)
    .join("line")
      .attr("class", "network-link")
      .attr("stroke-width", d => Math.max(1, Math.sqrt(d.value) * 0.05)); 

  // Nodes
  const node = svg.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
    .selectAll("circle")
    .data(nodes)
    .join("circle")
      .attr("class", "network-node")
      .attr("r", d => d.group === 'country' ? 15 : 10) // Slightly larger nodes
      .attr("fill", d => d.group === 'country' ? "#1f77b4" : "#ff7f0e")
      .style("cursor", "pointer")
      .call(drag(simulation));

  node.append("title")
      .text(d => d.id);

  // Labels with white halo for better readability
  const labels = svg.append("g")
      .attr("class", "labels")
      .style("pointer-events", "none") // Let clicks pass through to nodes
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

  // Hover Interaction
  node.on("mouseover", function(event, d) {
    // Dim everything
    node.style("opacity", 0.1);
    link.style("opacity", 0.05);
    labels.style("opacity", 0.1);

    // Highlight current node
    d3.select(this).style("opacity", 1).attr("stroke", "#333");
    
    // Find neighbors
    const connectedLinks = links.filter(l => l.source.id === d.id || l.target.id === d.id);
    const neighborIds = new Set();
    connectedLinks.forEach(l => {
      neighborIds.add(l.source.id);
      neighborIds.add(l.target.id);
    });

    // Highlight neighbors
    node.filter(n => neighborIds.has(n.id)).style("opacity", 1);
    labels.filter(n => neighborIds.has(n.id) || n.id === d.id).style("opacity", 1);

    // Highlight links
    link.filter(l => l.source.id === d.id || l.target.id === d.id)
        .style("opacity", 0.8)
        .attr("stroke", "#555");
  })
  .on("mouseout", function() {
    // Reset styles
    node.style("opacity", 1).attr("stroke", "#fff");
    link.style("opacity", 0.3).attr("stroke", "#999");
    labels.style("opacity", 1);
  });

  simulation.on("tick", () => {
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
  });

  function drag(simulation) {
    function dragstarted(event) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
  }
}

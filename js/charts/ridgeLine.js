function renderRidgeLinePlot(container, datasets) {
    const UI = {
        countrySelect: document.getElementById('ridgeline-country-select'),
        subTypeSelect: document.getElementById('ridgeline-subtype-select'),
        chartHolder: document.getElementById('ridgeline-chart-inner'),
        tooltip: d3.select('body').selectAll('#ridgeline-tooltip').data([0])
            .join('div')
            .attr('id', 'ridgeline-tooltip')
            .attr('class', 'chart-tooltip')
            .style('position', 'absolute')
            .style('pointer-events', 'none')
            .style('display', 'none')
            .style('opacity', 0)
    };

    const raw = (datasets.meaAggregatedData || [])
        .map(d => ({
            country: (d.COUNTRY || d.Country || '').trim(),
            subType: (d.SUB_EVENT_TYPE || d.SubEventType || '').trim(),
            events: +(d.EVENTS || 0),
            year: +(d.YEAR || d.Year || 0)
        }))
        .filter(d => d.year && !isNaN(d.events));

    const populateSelect = (el, options, defaultVal) => {
        if (!el) return;
        el.innerHTML = options.map(o => `<option value="${o}">${o}</option>`).join('');
        if (!options.includes(el.value)) el.value = defaultVal;
    };

    populateSelect(UI.countrySelect, ['Palestine', 'Syria'], 'Palestine');
    populateSelect(UI.subTypeSelect, ['Peaceful protest', 'Violent demonstration'], 'Peaceful protest');

    function drawRidgeline(country, subType) {
        d3.select(UI.chartHolder).selectAll('svg').remove();

        const data = raw.filter(d => (!country || d.country === country) && (!subType || d.subType === subType));
        const margin = { top: 20, right: 30, bottom: 40, left: 60 };
        const width = 800 - margin.left - margin.right;
        const height = 500 - margin.top - margin.bottom;

        const svg = d3.select(UI.chartHolder)
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        const renderEmpty = (msg) => {
            svg.append('text')
                .attr('x', width / 2)
                .attr('y', height / 2)
                .attr('text-anchor', 'middle')
                .attr('class', 'chart-placeholder-text')
                .style('font-family', 'Roboto Slab, serif')
                .text(msg);
        };

        if (!data.length) return renderEmpty('No data available');

        const byYearMap = d3.group(data, d => d.year);
        // Includi sempre tutti gli anni 2015-2024 (anche se vuoti) in ordine decrescente
        const allYears = d3.range(2024, 2014, -1); // 2024 -> 2015
        const yearData = allYears.map(y => ({
            year: y,
            values: byYearMap.has(y) ? byYearMap.get(y).map(d => d.events) : []
        }));

        // Se tutti gli anni sono vuoti, mostra placeholder
        if (yearData.every(d => d.values.length === 0)) return renderEmpty('Insufficient data');

        // Calculate KDE for each year
        const kde = (values, bandwidth = 0.5) => {
            const sorted = values.slice().sort((a, b) => a - b);
            const min = d3.min(sorted);
            const max = d3.max(sorted);
            const range = max - min || 1;
            const bw = bandwidth * range / 10;
            
            const gridSize = 100;
            const grid = d3.range(Math.max(0, min - range * 0.1), max + range * 0.1, (max - min + range * 0.2) / gridSize);
            
            const density = grid.map(x => {
                const sum = d3.sum(values, v => {
                    const u = (x - v) / bw;
                    return Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
                });
                return { x, y: sum / (values.length * bw) };
            });
            
            const maxDensity = d3.max(density, d => d.y);
            return density.map(d => ({ x: d.x, y: maxDensity > 0 ? d.y / maxDensity : 0 }));
        };

        const densities = yearData.map(d => {
            if (d.values.length > 1) {
                return { year: d.year, density: kde(d.values), raw: d.values };
            } else if (d.values.length === 1) {
                return { year: d.year, density: [{ x: d.values[0], y: 1 }], raw: d.values };
            } else {
                return { year: d.year, density: [], raw: [] }; // anno vuoto
            }
        });

        // Scales
        const xScale = d3.scaleLinear()
            .domain([0, 120])
            .range([0, width]);

        const ridgeHeight = 35; // Height allocated for each ridge
        const ridgeSpacing = 8; // Extra spacing between ridges to prevent overlap
    const totalHeight = densities.length * (ridgeHeight + ridgeSpacing);
        
        const yScale = d3.scaleLinear()
            .domain([0, 1])
            .range([0, ridgeHeight]);

        // Draw ridges
        densities.forEach((d, i) => {
            const yOffset = i * (ridgeHeight + ridgeSpacing);
            const group = svg.append('g')
                .attr('class', 'ridge')
                .attr('transform', `translate(0, ${yOffset})`);

            // Area generator (solo se ci sono dati)
            const area = d3.area()
                .x(p => xScale(p.x))
                .y0(ridgeHeight)
                .y1(p => ridgeHeight - yScale(p.y))
                .curve(d3.curveBasis);
            
            if (d.raw.length) {
                group.append('path')
                    .datum(d.density)
                    .attr('d', area)
                    .attr('fill', '#2a7700')
                    .attr('opacity', 0.75);
            }

            // Estendere la linea del profilo fino ai bordi (aggiungendo punti a y=0)
            const densityWithEdges = d.raw.length ? [
                { x: xScale.domain()[0], y: 0 },
                ...d.density,
                { x: xScale.domain()[1], y: 0 }
            ] : [
                { x: xScale.domain()[0], y: 0 },
                { x: xScale.domain()[1], y: 0 }
            ];

    

            // Draw outline
            const line = d3.line()
                .x(p => xScale(p.x))
                .y(p => ridgeHeight - yScale(p.y))
                .curve(d3.curveBasis);

            group.append('path')
                .datum(densityWithEdges)
                .attr('d', line)
                .attr('fill', 'none')
                .attr('stroke', '#2a7700')
                .attr('stroke-width', d.raw.length ? 1.2 : 0.9)
                .attr('stroke-dasharray', d.raw.length ? null : '4 3');

            // Year label
            group.append('text')
                .attr('x', -10)
                .attr('y', ridgeHeight / 2)
                .attr('text-anchor', 'end')
                .attr('dominant-baseline', 'middle')
                .style('font-family', 'Roboto Slab, serif')
                .style('font-size', '11px')
                .style('font-weight', '500')
                .text(d.year);
            // Tooltip interaction
            group.append('rect')
                .attr('x', 0)
                .attr('y', 0)
                .attr('width', width)
                .attr('height', ridgeHeight)
                .attr('fill', 'transparent')
                .on('mouseover', (e) => {
                    const vals = d.raw;
                    let content;
                    if (!vals.length) {
                        content = `<div class="text-center"><strong>${d.year}</strong></div>No data`;
                    } else {
                        const stats = {
                            count: vals.length,
                            median: d3.median(vals).toFixed(2),
                            min: d3.min(vals).toFixed(2),
                            max: d3.max(vals).toFixed(2)
                        };
                        content = `<div class="text-center"><strong>${d.year}</strong></div>
                            Samples: ${stats.count}<br/>Median: ${stats.median}<br/>Min: ${stats.min}<br/>Max: ${stats.max}`;
                    }
                    
                    UI.tooltip.style('display', 'block').style('opacity', 1).html(content);
                    const rect = UI.tooltip.node().getBoundingClientRect();
                    const left = Math.min(e.pageX + 15, window.innerWidth + window.scrollX - rect.width - 15);
                    const top = Math.min(e.pageY + 15, window.innerHeight + window.scrollY - rect.height - 15);
                    UI.tooltip.style('left', `${left}px`).style('top', `${top}px`);
                })
                .on('mousemove', (e) => {
                    const rect = UI.tooltip.node().getBoundingClientRect();
                    const left = Math.min(e.pageX + 15, window.innerWidth + window.scrollX - rect.width - 15);
                    const top = Math.min(e.pageY + 15, window.innerHeight + window.scrollY - rect.height - 15);
                    UI.tooltip.style('left', `${left}px`).style('top', `${top}px`);
                })
                .on('mouseleave', () => {
                    UI.tooltip.style('opacity', 0).style('display', 'none');
                });
        });

        // X-axis
        svg.append('g')
            .attr('transform', `translate(0,${totalHeight})`)
            .call(d3.axisBottom(xScale).ticks(8))
            .style('font-family', 'Roboto Slab, serif')
            .style('font-size', '11px');

        // X-axis label
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', totalHeight + 35)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('font-family', 'Roboto Slab, serif')
            .text(`Number of ${subType} per week`);
    }

    UI.countrySelect?.addEventListener('change', () => drawRidgeline(UI.countrySelect.value, UI.subTypeSelect.value));
    UI.subTypeSelect?.addEventListener('change', () => drawRidgeline(UI.countrySelect.value, UI.subTypeSelect.value));
    drawRidgeline(UI.countrySelect?.value || 'Palestine', UI.subTypeSelect?.value || 'Peaceful protest');
}
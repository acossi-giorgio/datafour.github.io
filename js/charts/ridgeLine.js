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

    const cleanData = (datasets.meaAggregatedData || [])
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

        const data = cleanData.filter(d => (!country || d.country === country) && (!subType || d.subType === subType));
        const margin = { top: 20, right: 30, bottom: 40, left: 60 };
        const width = 800 - margin.left - margin.right;
        const height = 500 - margin.top - margin.bottom;

        const svg = d3.select(UI.chartHolder)
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        const renderText = (msg, yPos = height / 2) => {
            svg.append('text')
                .attr('x', width / 2)
                .attr('y', yPos)
                .attr('text-anchor', 'middle')
                .attr('class', 'chart-placeholder-text')
                .style('font-family', 'Roboto Slab, serif')
                .text(msg);
        };

        if (!data.length) return renderText('No data available');

        const byYearMap = d3.group(data, d => d.year);
        const guaranteedYears = d3.range(2024, 2014, -1);
        const yearData = guaranteedYears.map(y => ({
            year: y,
            values: byYearMap.get(y)?.map(d => d.events) || []
        }));

        if (yearData.every(d => d.values.length === 0)) return renderText('Insufficient data');

        const kde = (values, bandwidth = 0.5) => {
            const sorted = values.slice().sort((a, b) => a - b);
            const min = d3.min(sorted);
            const max = d3.max(sorted);
            const range = max - min || 1;
            const bw = bandwidth * range / 10;
            const gridSize = 100;
            const grid = d3.range(Math.max(0, min - range * 0.1), max + range * 0.1, (max - min + range * 0.2) / gridSize);

            const density = grid.map(x => {
                const sum = d3.sum(values, v => Math.exp(-0.5 * Math.pow((x - v) / bw, 2)) / Math.sqrt(2 * Math.PI));
                return { x, y: sum / (values.length * bw) };
            });

            const maxDensity = d3.max(density, d => d.y);
            return density.map(d => ({ x: d.x, y: maxDensity > 0 ? d.y / maxDensity : 0 }));
        };

        const densities = yearData.map(d => ({
            year: d.year,
            raw: d.values,
            density: d.values.length > 1 ? kde(d.values) : 
                     d.values.length === 1 ? [{ x: d.values[0], y: 1 }] : []
        }));

        const xScale = d3.scaleLinear().domain([0, 120]).range([0, width]);
        const ridgeHeight = 35;
        const ridgeSpacing = 8;
        const totalHeight = densities.length * (ridgeHeight + ridgeSpacing);
        const yScale = d3.scaleLinear().domain([0, 1]).range([0, ridgeHeight]);

        const MIN_SAMPLE_SIZE = 20;

        densities.forEach((d, i) => {
            const group = svg.append('g')
                .attr('class', 'ridge')
                .attr('transform', `translate(0, ${i * (ridgeHeight + ridgeSpacing)})`);

            const hasEnoughData = d.raw.length >= MIN_SAMPLE_SIZE;
            const edgePoints = [{ x: xScale.domain()[0], y: 0 }, { x: xScale.domain()[1], y: 0 }];
            const areaData = d.raw.length ? [edgePoints[0], ...d.density, edgePoints[1]] : edgePoints;

            if (hasEnoughData) {
                group.append('path')
                    .datum(d.density)
                    .attr('fill', '#2a7700')
                    .attr('opacity', 0.75)
                    .attr('d', d3.area()
                        .x(p => xScale(p.x))
                        .y0(ridgeHeight)
                        .y1(p => ridgeHeight - yScale(p.y))
                        .curve(d3.curveBasis)
                    );
            }

            group.append('path')
                .datum(hasEnoughData ? areaData : edgePoints)
                .attr('fill', 'none')
                .attr('stroke', '#2a7700')
                .attr('stroke-width', d.raw.length ? 1.2 : 0.9)
                .attr('stroke-dasharray', hasEnoughData ? null : '4 3')
                .attr('d', d3.line()
                    .x(p => xScale(p.x))
                    .y(p => ridgeHeight - yScale(p.y))
                    .curve(d3.curveBasis)
                );

            group.append('text')
                .attr('x', -10)
                .attr('y', ridgeHeight / 2)
                .attr('text-anchor', 'end')
                .attr('dominant-baseline', 'middle')
                .style('font-family', 'Roboto Slab, serif')
                .style('font-size', '11px')
                .style('font-weight', '500')
                .text(d.year);

            group.append('rect')
                .attr('width', width)
                .attr('height', ridgeHeight)
                .attr('fill', 'transparent')
                .on('mouseover', (e) => {
                    UI.tooltip.style('display', 'block').style('opacity', 1).html(getTooltipHtml(d.year, d.raw));
                    updateTooltipPos(e);
                })
                .on('mousemove', updateTooltipPos)
                .on('mouseleave', () => UI.tooltip.style('opacity', 0).style('display', 'none'));
        });

        svg.append('g')
            .attr('transform', `translate(0,${totalHeight})`)
            .call(d3.axisBottom(xScale).ticks(8))
            .style('font-family', 'Roboto Slab, serif')
            .style('font-size', '11px');

        svg.append('text')
            .attr('x', width / 2)
            .attr('y', totalHeight + 35)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('font-family', 'Roboto Slab, serif')
            .text(`Number of ${subType} per week`);

        function getTooltipHtml(year, vals) {
            if (!vals.length) return `<div class="text-center"><strong>${year}</strong></div>No data`;
            
            const stats = {
                count: vals.length,
                median: d3.median(vals).toFixed(2),
                min: d3.min(vals).toFixed(2),
                max: d3.max(vals).toFixed(2)
            };
            
            let html = `<div class="text-center"><strong>${year}</strong></div>`;
            if (vals.length < MIN_SAMPLE_SIZE) html += 'Not enough data<br/>';
            return html + `Samples: ${stats.count}<br/>Median: ${stats.median}<br/>Min: ${stats.min}<br/>Max: ${stats.max}`;
        }

        function updateTooltipPos(e) {
            const rect = UI.tooltip.node().getBoundingClientRect();
            const left = Math.min(e.pageX + 15, window.innerWidth + window.scrollX - rect.width - 15);
            const top = Math.min(e.pageY + 15, window.innerHeight + window.scrollY - rect.height - 15);
            UI.tooltip.style('left', `${left}px`).style('top', `${top}px`);
        }
    }

    const refresh = () => drawRidgeline(UI.countrySelect?.value, UI.subTypeSelect?.value);
    UI.countrySelect?.addEventListener('change', refresh);
    UI.subTypeSelect?.addEventListener('change', refresh);
    
    drawRidgeline(UI.countrySelect?.value || 'Palestine', UI.subTypeSelect?.value || 'Peaceful protest');
}
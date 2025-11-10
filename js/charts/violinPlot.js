function renderViolinPlot(container, datasets) {
    const UI = {
        countrySelect: document.getElementById('violin-country-select'),
        subTypeSelect: document.getElementById('violin-subtype-select'),
        chartHolder: document.getElementById('violin-chart-inner'),
        tooltip: d3.select('body').selectAll('#violin-tooltip').data([0])
            .join('div')
            .attr('id', 'violin-tooltip')
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
        // Keep existing selection if valid, otherwise reset to default
        if (!options.includes(el.value)) el.value = defaultVal;
    };

    populateSelect(UI.countrySelect, ['Palestine', 'Syria'], 'Palestine');
    populateSelect(UI.subTypeSelect, ['Peaceful protest', 'Violent demonstration'], 'Peaceful protest');

    function drawViolin(country, subType) {
        d3.select(UI.chartHolder).selectAll('svg').remove();

        const data = raw.filter(d => (!country || d.country === country) && (!subType || d.subType === subType));
        const margin = { top: 20, right: 30, bottom: 40, left: 60 };
        const width = 800 - margin.left - margin.right;
        const height = 420 - margin.top - margin.bottom;

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
        
        // Generate all years from 2015 to 2024, even if no data
        const allYears = d3.range(2015, 2025); // 2015 to 2024 inclusive
        const yearData = allYears
            .map(y => {
                const values = byYearMap.has(y) ? byYearMap.get(y).map(d => d.events) : [];
                return { year: y, values };
            })
            .filter(d => d.values.length > 0); // Only keep years with data

        if (!yearData.length) return renderEmpty('Insufficient data');

        const yScale = d3.scaleLinear()
            .domain([0, 120])
            .range([height, 0]);

        const xScale = d3.scaleBand()
            .domain(yearData.map(d => d.year))
            .range([0, width])
            .padding(0.12);

        // Axes
        svg.append('g').call(d3.axisLeft(yScale).ticks(6))
            .style('font-family', 'Roboto Slab, serif').style('font-size', '11px');

        svg.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(xScale))
            .style('font-family', 'Roboto Slab, serif').style('font-size', '12px');

        // Violin stats generation
        const histogram = d3.histogram()
            .domain(yScale.domain())
            .thresholds(yScale.ticks(30))
            .value(d => d);

        let globalMaxCount = 0;
        const sumstat = yearData.map(d => {
            const bins = histogram(d.values);
            // Trim trailing empty bins to avoid weird flat tops on violins
            while (bins.length && bins[bins.length - 1].length === 0) {
                 bins.pop();
            }
            const maxBin = d3.max(bins, b => b.length) || 0;
            if (maxBin > globalMaxCount) globalMaxCount = maxBin;

            return { key: d.year, bins, raw: d.values };
        });

        const xNum = d3.scaleLinear()
            .domain([-globalMaxCount, globalMaxCount])
            .range([0, xScale.bandwidth()]);

        // Draw violins
        svg.selectAll('.violin')
            .data(sumstat)
            .join('g')
            .attr('class', 'violin')
            .attr('transform', d => `translate(${xScale(d.key)},0)`)
            .append('path')
            .datum(d => d.bins)
            .attr('d', d3.area()
                .x0(b => xNum(-b.length))
                .x1(b => xNum(b.length))
                .y(b => yScale(b.x0))
                .curve(d3.curveCatmullRom)
            )
            .style('fill', '#2a7700');

        // Tooltips & Interactions
        const updateTooltip = (event, content = '') => {
            const t = UI.tooltip;
            if (!content) {
                t.style('opacity', 0).style('display', 'none');
                return;
            }
            
            t.style('display', 'block').style('opacity', 1).html(content);
            
            const rect = t.node().getBoundingClientRect();
            // Simple boundary check to keep tooltip on screen
            const left = Math.min(event.pageX + 15, window.innerWidth + window.scrollX - rect.width - 15);
            const top = Math.min(event.pageY + 15, window.innerHeight + window.scrollY - rect.height - 15);
            t.style('left', `${left}px`).style('top', `${top}px`);
        };

        svg.selectAll('.violin')
            .on('mouseover', (e, d) => {
                const vals = d.raw;
                const stats = {
                    count: vals.length,
                    median: d3.median(vals).toFixed(2),
                    min: d3.min(vals).toFixed(2),
                    max: d3.max(vals).toFixed(2)
                };
                updateTooltip(e, `<div class="text-center"><strong>${d.key}</strong></div>
                    Samples: ${stats.count}<br/>Median: ${stats.median}<br/>Min: ${stats.min}<br/>Max: ${stats.max}`);
            })
            .on('mousemove', (e) => updateTooltip(e, UI.tooltip.html())) // refresh pos
            .on('mouseleave', () => updateTooltip(null));

        // Y-axis label
        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', -45)
            .attr('x', -height / 2)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('font-family', 'Roboto Slab, serif')
            .text(`Number of ${subType} per week`);
    }

    UI.countrySelect?.addEventListener('change', () => drawViolin(UI.countrySelect.value, UI.subTypeSelect.value));
    UI.subTypeSelect?.addEventListener('change', () => drawViolin(UI.countrySelect.value, UI.subTypeSelect.value));
    drawViolin(UI.countrySelect?.value || 'Palestine', UI.subTypeSelect?.value || 'Peaceful protest');
}
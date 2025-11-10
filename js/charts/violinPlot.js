function renderViolinPlot(container, datasets) {
    const subTypeSelect = document.getElementById('violin-subtype-select');
    const chartHolder = document.getElementById('violin-chart-inner');
    
    const selectedCountry = 'Palestine';

    const raw = (datasets.meaAggregatedData || []).map(d => ({
        country: (d.COUNTRY || d.Country || '').trim(),
        subType: (d.SUB_EVENT_TYPE || d.SubEventType || '').trim(),
        events: +((d.EVENTS != null && d.EVENTS !== '') ? d.EVENTS : 0),
        year: +(d.YEAR || d.Year || 0)
    })).filter(d => d.year && !isNaN(d.events));

    function updateSubTypeOptions() {
        if (!subTypeSelect) return;
        const prevVal = subTypeSelect.value;
        subTypeSelect.innerHTML = '';

        const allowedSubTypes = ['Peaceful protest', 'Violent demonstration'];
        allowedSubTypes.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            subTypeSelect.appendChild(opt);
        });

        if (prevVal && allowedSubTypes.includes(prevVal)) {
            subTypeSelect.value = prevVal;
        } else {
            subTypeSelect.value = 'Peaceful protest';
        }
    }

    if (subTypeSelect) {
        updateSubTypeOptions();
    }

    let tooltip = d3.select('#violin-tooltip');
    if (tooltip.empty()) {
        tooltip = d3.select('body').append('div')
            .attr('id', 'violin-tooltip')
            .attr('class', 'chart-tooltip')
            .style('position', 'absolute')
            .style('pointer-events', 'none')
            .style('display', 'none')
            .style('opacity', 0);
    }

    function drawViolin(country, subType) {
        d3.select(chartHolder).selectAll('svg').remove();

        const data = raw.filter(d => (!country || d.country === country) && (!subType || d.subType === subType));
        const margin = { top: 20, right: 30, bottom: 40, left: 60 };
        const width = 800 - margin.left - margin.right;
        const height = 420 - margin.top - margin.bottom;

        const svg = d3.select(chartHolder)
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        if (!data.length) {
            svg.append('text')
                .attr('x', width / 2)
                .attr('y', height / 2)
                .attr('text-anchor', 'middle')
                .style('font-family', 'Roboto Slab, serif')
                .text('No data available');
            return;
        }

        const byYearMap = d3.group(data, d => d.year);
        const years = Array.from(byYearMap.keys()).sort((a, b) => a - b);
        const yearData = years.map(y => ({ year: y, values: byYearMap.get(y).map(d => d.events) }))
            .filter(d => d.values.length);

        if (!yearData.length) {
            svg.append('text')
                .attr('x', width / 2)
                .attr('y', height / 2)
                .attr('text-anchor', 'middle')
                .style('font-family', 'Roboto Slab, serif')
                .text('Insufficient data');
            return;
        }

        const allValues = yearData.flatMap(d => d.values);
        const yScale = d3.scaleLinear()
            .domain([0, d3.max(allValues) * 1.05])
            .range([height, 0]);

        svg.append('g').call(d3.axisLeft(yScale))
            .selectAll('text')
            .style('font-size', '11px')
            .style('font-family', 'Roboto Slab, serif');

        const xScale = d3.scaleBand()
            .domain(yearData.map(d => d.year))
            .range([0, width])
            .padding(0.12);

        svg.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(xScale))
            .selectAll('text')
            .style('font-size', '12px')
            .style('font-family', 'Roboto Slab, serif');

        const histogram = d3.histogram()
            .domain(yScale.domain())
            .thresholds(yScale.ticks(30))
            .value(d => d);

        const sumstat = yearData.map(d => {
            const bins = histogram(d.values);
            let lastIdx = -1;
            for (let i = 0; i < bins.length; i++) {
                if (bins[i].length > 0) lastIdx = i;
            }
            return {
                key: d.year,
                bins: lastIdx >= 0 ? bins.slice(0, lastIdx + 1) : [],
                raw: d.values
            };
        });

        let maxCount = 0;
        sumstat.forEach(s => {
            const m = d3.max(s.bins.map(b => b.length));
            if (m > maxCount) maxCount = m;
        });

        const xNum = d3.scaleLinear()
            .domain([-maxCount, maxCount])
            .range([0, xScale.bandwidth()]);

        const statsMap = new Map();
        sumstat.forEach(s => {
            const vals = s.raw;
            statsMap.set(s.key, {
                count: vals.length,
                mean: d3.mean(vals).toFixed(2),
                median: d3.median(vals).toFixed(2),
                min: d3.min(vals).toFixed(2),
                max: d3.max(vals).toFixed(2)
            });
        });

        const groups = svg.selectAll('.violin')
            .data(sumstat)
            .enter()
            .append('g')
            .attr('class', 'violin')
            .attr('transform', d => `translate(${xScale(d.key)},0)`);

        groups.each(function(d) {
            if (!d.bins.length) return;
            d3.select(this)
                .append('path')
                .datum(d.bins)
                .attr('d', d3.area()
                    .x0(b => xNum(-b.length))
                    .x1(b => xNum(b.length))
                    .y(b => yScale(b.x0))
                    .curve(d3.curveCatmullRom)
                )
                .style('fill', '#69b3a2')
                .style('opacity', 0.75)
                .style('stroke', '#333');
        });

        function updateTooltipPos(event) {
            const rect = tooltip.node().getBoundingClientRect();
            const vw = document.documentElement.clientWidth;
            const vh = document.documentElement.clientHeight;
            let adjX = event.pageX + 14;
            let adjY = event.pageY + 16;

            if (adjX + rect.width + 8 > window.scrollX + vw) adjX = vw - rect.width - 8;
            if (adjY + rect.height + 8 > window.scrollY + vh) adjY = vh - rect.height - 8;

            tooltip.style('left', adjX + 'px').style('top', adjY + 'px');
        }

        groups.on('mouseover', function(event, d) {
            const s = statsMap.get(d.key);
            tooltip.style('display', 'block').style('opacity', 1)
                .html(`<div style="text-align: center;"><strong>${d.key}</strong></div>Samples: ${s.count}<br/>Mean: ${s.mean}<br/>Median: ${s.median}<br/>Min: ${s.min}<br/>Max: ${s.max}`);
            updateTooltipPos(event);
        })
        .on('mousemove', updateTooltipPos)
        .on('mouseleave', () => tooltip.style('opacity', 0).style('display', 'none'));

        svg.append('text').attr('x', width / 2).attr('y', height + 32).attr('text-anchor', 'middle').style('font-size', '12px').style('font-family', 'Roboto Slab, serif').text('Year');
        svg.append('text').attr('transform', 'rotate(-90)').attr('x', -height / 2).attr('y', -45).attr('text-anchor', 'middle').style('font-size', '12px').style('font-family', 'Roboto Slab, serif').text(subType);
    }

    if (subTypeSelect) {
        subTypeSelect.addEventListener('change', () => {
            drawViolin(selectedCountry, subTypeSelect.value);
        });
    }

    drawViolin(selectedCountry, subTypeSelect?.value || 'Peaceful protest');
}
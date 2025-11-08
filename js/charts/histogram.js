function renderHistogramChart(container, datasets) {
	const root = d3.select(container);
	const svg = root.select('#histogram-svg');
	let countrySelect = root.select('#histogram-country-select');
	let typeSelect = root.select('#histogram-type-select');
	const titleEl = root.select('#histogram-title');

	// === Tooltip come in renderBarHorizontalChart ===
	function ensureTooltip() {
		let t = d3.select('#histogram-tooltip');
		if (t.empty()) {
			t = d3.select('body').append('div').attr('id', 'histogram-tooltip');
		} else {
			if (t.node().parentNode !== document.body) {
				const node = t.remove().node();
				t = d3.select('body').append(() => node);
			}
		}
		return t
			.classed('chart-tooltip', true)
			.style('position', 'absolute')
			.style('pointer-events', 'none')
			.style('display', 'none')
			.style('opacity', 0);
	}
	const tooltip = ensureTooltip();

	const margin = { top: 10, right: 40, bottom: 50, left: 60 };
	const fullWidth = 760;
	const fullHeight = 400;
	const width = fullWidth - margin.left - margin.right;
	const height = fullHeight - margin.top - margin.bottom;
	svg.attr('width', fullWidth).attr('height', fullHeight);
	svg.selectAll('g.chart-root').remove();
	const g = svg
		.append('g')
		.attr('class', 'chart-root')
		.attr('transform', `translate(${margin.left},${margin.top})`);

	const raw = datasets.meaAggregatedData || [];
	const countriesSet = new Set(
		datasets.countries.map(d => (d.Country || d.country || '').trim())
	);
	const data = raw
		.map(d => ({
			country: (d.COUNTRY || d.Country || '').trim(),
			eventType: (d.EVENT_TYPE || d.EventType || '').trim(),
			subType: (d.SUB_EVENT_TYPE || d.SubEventType || '').trim(),
			events: +((d.EVENTS != null && d.EVENTS !== '') ? d.EVENTS : 0),
			fatalities: +((d.FATALITIES != null && d.FATALITIES !== '') ? d.FATALITIES : 0),
			year: +(d.YEAR || d.Year || 0)
		}))
		.filter(d => countriesSet.has(d.country) && isYearInRange(d.year));

	const countries = Array.from(new Set(data.map(d => d.country))).sort((a,b)=>a.localeCompare(b));
	const subTypes = Array.from(new Set(data.map(d => d.subType))).sort((a,b)=>a.localeCompare(b));

	if (countrySelect.attr('data-populated') !== '1') {
		countrySelect
			.selectAll('option')
			.data(countries)
			.join('option')
			.attr('value', d => d)
			.text(d => d);
		countrySelect.property('value', countries.includes('Syria') ? 'Syria' : countries[0]);
		countrySelect.attr('data-populated', '1');
	}
	if (typeSelect.attr('data-populated') !== '1') {
		typeSelect
			.selectAll('option')
			.data(subTypes)
			.join('option')
			.attr('value', d => d)
			.text(d => d);
		const defaultType =
			['Attack', 'Abduction/forced disappearance', 'Sexual violence'].find(t =>
				subTypes.includes(t)
			) || subTypes[0];
		typeSelect.property('value', defaultType);
		typeSelect.attr('data-populated', '1');
	}

	const xScale = d3.scaleBand().range([0, width]).padding(0.25);
	const yScale = d3.scaleLinear().range([height, 0]);
	const xAxisG = g.append('g').attr('transform', `translate(0,${height})`);
	const yAxisG = g.append('g');
	const formatNum = d3.format(',');

	// Mappa SubType -> EventType dominante
	const subTypeEventTotals = d3.rollups(
		data,
		v =>
			d3
				.rollups(v, vv => d3.sum(vv, d => d.events), d => d.eventType)
				.map(([eventType, total]) => ({ eventType, total }))
				.sort((a, b) => b.total - a.total)[0]?.eventType || null,
		d => d.subType
	);
	const subTypeToEventType = new Map(subTypeEventTotals);

	function computeSeries(country, subType) {
		// Replica logica script Python:
		// - filtro substring case-insensitive su country e subType
		// - anno >= 2014
		// - solo anni presenti (niente anni con 0 artificiali)
		const lcCountry = (country || '').toLowerCase();
		const lcSub = (subType || '').toLowerCase();
		const filtered = data.filter(d =>
			 d.year >= 2014 &&
			 d.country.toLowerCase().includes(lcCountry) &&
			 d.subType.toLowerCase().includes(lcSub)
		);
		const byYear = d3.rollups(
			filtered,
			v => d3.sum(v, d => d.events),
			d => d.year
		).sort((a,b)=>a[0]-b[0]);
		return byYear.map(([year, events]) => ({ year, events }));
	}

	function update() {
		const country = countrySelect.property('value');
		const subType = typeSelect.property('value');
		const eventType = subTypeToEventType.get(subType) || '';
		// Colore fisso per replica stile Matplotlib (steelblue)
		const barColor = 'steelblue';
		// Titolo coerente con script Python
		titleEl.text(`Somma degli eventi di tipo '${subType}' in ${country} (dal 2014 in poi)`);
		const series = computeSeries(country, subType);

		xScale.domain(series.map(d => d.year));
		yScale.domain([0, d3.max(series, d => d.events) || 1]).nice();

		const bars = g.selectAll('.hist-bar').data(series, d => d.year);
		const barsEnter = bars
			.enter()
			.append('rect')
			.attr('class', 'hist-bar')
			.attr('x', d => xScale(d.year))
			.attr('y', height)
			.attr('width', xScale.bandwidth())
			.attr('height', 0)
			.attr('fill', barColor)
			.on('mousemove', (event, d) => {
				// Ricerca dettaglio con substring case-insensitive (replica Python)
				const lcCountry = country.toLowerCase();
				const lcSub = subType.toLowerCase();
				const detail = data.find(x =>
					 x.year === d.year &&
					 x.country.toLowerCase().includes(lcCountry) &&
					 x.subType.toLowerCase().includes(lcSub)
				);
				tooltip
					.style('display', 'block')
					.style('opacity', 1)
					.html(`
						<strong>Year:</strong> ${d.year}<br>
						<strong>Event type:</strong> ${eventType || 'N/A'}<br>
						<strong>Subtype:</strong> ${subType}<br>
						<strong>Events:</strong> ${formatNum(d.events)}<br>
						<strong>Fatalities:</strong> ${formatNum(detail?.fatalities || 0)}
					`);
				const x = event.pageX + 14;
				const y = event.pageY + 16;
				const rect = tooltip.node().getBoundingClientRect();
				const vw = document.documentElement.clientWidth;
				const vh = document.documentElement.clientHeight;
				let adjX = x, adjY = y;
				if (adjX + rect.width + 8 > window.scrollX + vw) adjX = vw - rect.width - 8;
				if (adjY + rect.height + 8 > window.scrollY + vh) adjY = vh - rect.height - 8;
				tooltip.style('left', adjX + 'px').style('top', adjY + 'px');
			})
			.on('mouseout', () => tooltip.style('opacity', 0).style('display', 'none'));

		barsEnter
			.transition()
			.duration(800)
			.attr('y', d => yScale(d.events))
			.attr('height', d => height - yScale(d.events));

		bars
			.transition()
			.duration(600)
			.attr('x', d => xScale(d.year))
			.attr('width', xScale.bandwidth())
			.attr('y', d => yScale(d.events))
			.attr('height', d => height - yScale(d.events))
			.attr('fill', barColor);

		bars.exit()
			.transition()
			.duration(400)
			.attr('y', height)
			.attr('height', 0)
			.remove();

		const xAxis = d3.axisBottom(xScale).tickFormat(d3.format('d'));
		const yAxis = d3.axisLeft(yScale).ticks(6).tickFormat(formatNum);
		xAxisG.transition().duration(600).call(xAxis);
		yAxisG.transition().duration(600).call(yAxis);
	}

	update();
	countrySelect.on('change.histogram', update);
	typeSelect.on('change.histogram', update);
}


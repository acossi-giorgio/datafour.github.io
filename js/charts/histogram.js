function renderHistogramChart(container, datasets) {
	const root = d3.select(container);
	const svg = root.select('#histogram-svg');
	const countrySelect = root.select('#histogram-country-select');
	const typeSelect = root.select('#histogram-type-select');
	const titleEl = root.select('#histogram-title');

	// Tooltip setup
	const tooltip = (() => {
		let el = d3.select('#histogram-tooltip');
		if (el.empty()) el = d3.select('body').append('div').attr('id', 'histogram-tooltip');
		return el
			.classed('chart-tooltip', true)
			.style('position', 'absolute')
			.style('pointer-events', 'none')
			.style('display', 'none')
			.style('opacity', 0);
	})();

	const margin = { top: 10, right: 40, bottom: 50, left: 60 };
	const fullWidth = 760, fullHeight = 400;
	const width = fullWidth - margin.left - margin.right;
	const height = fullHeight - margin.top - margin.bottom;

	svg.attr('width', fullWidth).attr('height', fullHeight);
	svg.selectAll('.chart-root').remove();
	const g = svg.append('g')
		.attr('class', 'chart-root')
		.attr('transform', `translate(${margin.left},${margin.top})`);

	// Data normalization
	const raw = datasets.meaAggregatedData || [];
	const countriesSet = new Set(
		(datasets.countries || raw).map(d => (d.Country || d.COUNTRY || '').trim())
	);

	const data = raw
		.map(d => ({
			country: (d.COUNTRY || d.Country || '').trim(),
			eventType: (d.EVENT_TYPE || d.EventType || '').trim(),
			subType: (d.SUB_EVENT_TYPE || d.SubEventType || '').trim(),
			events: +d.EVENTS || 0,
			fatalities: +d.FATALITIES || 0,
			year: +d.YEAR || +d.Year || 0
		}))
		.filter(d => d.year >= 2014 && d.year <= 2024 && countriesSet.has(d.country));

	const countries = [...new Set(data.map(d => d.country))].sort(d3.ascending);
	const subTypes = [...new Set(data.map(d => d.subType))].sort(d3.ascending);

	// Select population
	if (!countrySelect.node().options.length) {
		countrySelect.selectAll('option')
			.data(countries)
			.join('option')
			.attr('value', d => d)
			.text(d => d);
		countrySelect.property('value', countries.includes('Syria') ? 'Syria' : countries[0]);
	}
	if (!typeSelect.node().options.length) {
		typeSelect.selectAll('option')
			.data(subTypes)
			.join('option')
			.attr('value', d => d)
			.text(d => d);
		const defaults = ['Attack', 'Abduction/forced disappearance', 'Sexual violence'];
		typeSelect.property('value', defaults.find(t => subTypes.includes(t)) || subTypes[0]);
	}

	// Scales and axes
	const xScale = d3.scaleBand().range([0, width]).padding(0.25);
	const yScale = d3.scaleLinear().range([height, 0]);
	const xAxisG = g.append('g').attr('transform', `translate(0,${height})`);
	const yAxisG = g.append('g');
	const fmt = d3.format(',');

	// Color helpers
	const subTypeToEventType = new Map(
		d3.rollups(
			data,
			v => d3.rollups(v, vv => d3.sum(vv, d => d.events), d => d.eventType)
				.map(([eventType, total]) => ({ eventType, total }))
				.sort((a, b) => b.total - a.total)[0]?.eventType,
			d => d.subType
		)
	);

	const getBaseColor = eventType => {
		if (typeof getEventTypeColor === 'function') return getEventTypeColor(eventType);
		if (typeof getDatasetColor === 'function')
			return getDatasetColor(eventTypeKey(eventType));
		return '#666';
	};

	const eventTypeKey = type => {
		switch ((type || '').toLowerCase()) {
			case 'protests': return DATASET_KEYS.DEMONSTRATIONS;
			case 'violence against civilians': return DATASET_KEYS.TARGET_CIVIL_EVENT;
			case 'battles': return DATASET_KEYS.POLITICAL_VIOLENCE;
			case 'explosions/remote violence':
			case 'riots':
			case 'strategic developments':
				return DATASET_KEYS.OTHER_POLITICAL_VIOLENCE;
			default:
				return DATASET_KEYS.POLITICAL_VIOLENCE;
		}
	};

	const shadeBySubtype = (hex, eventType, subType) => {
		const subList = [...subTypeToEventType.keys()]
			.filter(st => subTypeToEventType.get(st) === eventType)
			.sort(d3.ascending);
		if (!subList.length) return hex;
		const t = subList.indexOf(subType) / Math.max(1, subList.length - 1);
		const c = d3.hsl(d3.color(hex));
		c.l = 0.35 + 0.35 * t;
		return c.formatHex();
	};

	// Helpers
	const computeSeries = (country, subType) => {
		const filtered = data.filter(
			d => d.country === country && d.subType === subType
		);
		const totals = d3.rollup(filtered, v => d3.sum(v, d => d.events), d => d.year);
		return d3.range(2014, 2025).map(y => ({ year: y, events: totals.get(y) || 0 }));
	};

	const showTooltip = (event, d, country, subType, eventType) => {
		const detail = data.find(x => x.country === country && x.subType === subType && x.year === d.year);
		tooltip
			.style('display', 'block')
			.style('opacity', 1)
			.html(`
				<strong>Year:</strong> ${d.year}<br>
				<strong>Event type:</strong> ${eventType || 'N/A'}<br>
				<strong>Subtype:</strong> ${subType}<br>
				<strong>Events:</strong> ${fmt(d.events)}<br>
				<strong>Fatalities:</strong> ${fmt(detail?.fatalities || 0)}
			`);
		const { pageX, pageY } = event;
		const rect = tooltip.node().getBoundingClientRect();
		const x = Math.min(pageX + 14, window.innerWidth - rect.width - 8);
		const y = Math.min(pageY + 16, window.innerHeight - rect.height - 8);
		tooltip.style('left', `${x}px`).style('top', `${y}px`);
	};

	// Update logic
	function update() {
		const country = countrySelect.property('value');
		const subType = typeSelect.property('value');
		const eventType = subTypeToEventType.get(subType);
		const color = shadeBySubtype(getBaseColor(eventType), eventType, subType);

		titleEl.text(`${subType} events in ${country}`);

		const series = computeSeries(country, subType);
		xScale.domain(series.map(d => d.year));
		yScale.domain([0, d3.max(series, d => d.events) || 1]).nice();

		const bars = g.selectAll('.hist-bar').data(series, d => d.year);

		bars.enter()
			.append('rect')
			.attr('class', 'hist-bar')
			.attr('x', d => xScale(d.year))
			.attr('width', xScale.bandwidth())
			.attr('y', height)
			.attr('height', 0)
			.attr('fill', color)
			.on('mousemove', (e, d) => showTooltip(e, d, country, subType, eventType))
			.on('mouseout', () => tooltip.style('opacity', 0).style('display', 'none'))
			.transition()
			.duration(700)
			.attr('y', d => yScale(d.events))
			.attr('height', d => height - yScale(d.events));

		bars.transition()
			.duration(600)
			.attr('x', d => xScale(d.year))
			.attr('width', xScale.bandwidth())
			.attr('y', d => yScale(d.events))
			.attr('height', d => height - yScale(d.events))
			.attr('fill', color);

		bars.exit()
			.transition()
			.duration(400)
			.attr('y', height)
			.attr('height', 0)
			.remove();

		xAxisG.transition().duration(600).call(d3.axisBottom(xScale).tickFormat(d3.format('d')));
		yAxisG.transition().duration(600).call(d3.axisLeft(yScale).ticks(6).tickFormat(fmt));
	}

	update();
	countrySelect.on('change.histogram', update);
	typeSelect.on('change.histogram', update);
}

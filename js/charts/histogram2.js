function renderHistogramChart(container, datasets) {
	const root = d3.select(container);
	const svg = root.select('#histogram-svg');
	let countrySelect = root.select('#histogram-country-select');
	let typeSelect = root.select('#histogram-type-select');
	const titleEl = root.select('#histogram-title');

	// === Tooltip ===
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
	const legendRoot = root.select('#histogram-legend');

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

	// === Pulizia e parsing dataset ===
	const raw = datasets.meaAggregatedData || [];

	// Usa lo stesso dataset anche come "countries" se non è fornito
	const countriesSet = new Set(
		(datasets.countries || raw).map(d => (d.Country || d.COUNTRY || '').trim())
	);

	// Pulizia e normalizzazione come in Python
	const data = raw
		.map(d => ({
			country: ((d.COUNTRY || d.Country || '').trim()),
			eventType: ((d.EVENT_TYPE || d.EventType || '').trim()),
			subType: ((d.SUB_EVENT_TYPE || d.SubEventType || '').trim()),
			events: +((d.EVENTS != null && d.EVENTS !== '') ? d.EVENTS : 0),
			fatalities: +((d.FATALITIES != null && d.FATALITIES !== '') ? d.FATALITIES : 0),
			year: +((d.YEAR || d.Year || '').toString().trim() || 0)
		}))
		.filter(d => d.year >= 2014 && d.year <= 2024 && countriesSet.has(d.country));

	// === Popola select dinamiche ===
	const countries = Array.from(new Set(data.map(d => d.country))).sort((a, b) => a.localeCompare(b));
	const subTypes = Array.from(new Set(data.map(d => d.subType))).sort((a, b) => a.localeCompare(b));

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

	// === Scale e assi ===
	const xScale = d3.scaleBand().range([0, width]).padding(0.25);
	const yScale = d3.scaleLinear().range([height, 0]);
	const xAxisG = g.append('g').attr('transform', `translate(0,${height})`);
	const yAxisG = g.append('g');
	const formatNum = d3.format(',');

	// === Calcolo EventType per SubType ===
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

	// Helpers colori: colore base per tipo principale e sfumature per sottotipi
	function baseColorForEventType(eventType) {
		// Usa mappa dedicata se disponibile
		if (typeof getEventTypeColor === 'function') {
			return getEventTypeColor(eventType);
		}
		const key = eventTypeToDatasetKey(eventType);
		return typeof getDatasetColor === 'function' ? getDatasetColor(key) : '#666666';
	}

	function shadeHexBySubtype(baseHex, eventType, subType) {
		try {
			const allSubTypesForEvent = Array.from(new Set(
				Array.from(subTypeToEventType.keys()).filter(st => subTypeToEventType.get(st) === eventType)
			)).sort((a, b) => a.localeCompare(b));
			if (!allSubTypesForEvent.length) return baseHex;
			const idx = Math.max(0, allSubTypesForEvent.indexOf(subType));
			const n = Math.max(1, allSubTypesForEvent.length - 1);
			const t = n === 0 ? 0.5 : idx / n; // 0..1
			const c = d3.color(baseHex);
			if (!c) return baseHex;
			const hsl = d3.hsl(c);
			// Distribuisci le sfumature variando la luminosità in un range leggibile
			const minL = 0.35, maxL = 0.70;
			hsl.l = minL + (maxL - minL) * t;
			return hsl.formatHex();
		} catch (_) {
			return baseHex;
		}
	}

	function eventTypeToDatasetKey(eventType) {
		switch ((eventType || '').toLowerCase()) {
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
	}

	// === Calcolo serie annuale (come in Python) ===
	function computeSeries(country, subType) {
		const filtered = data.filter(d =>
			d.country.toLowerCase().includes(country.toLowerCase()) &&
			d.subType.toLowerCase().includes(subType.toLowerCase())
		);
		const byYear = new Map();
		filtered.forEach(d => {
			byYear.set(d.year, (byYear.get(d.year) || 0) + d.events);
		});
		return d3.range(2014, 2025).map(y => ({ year: y, events: byYear.get(y) || 0 }));
	}

	// === Funzione di aggiornamento grafico ===
	function update() {
		const country = countrySelect.property('value');
		const subType = typeSelect.property('value');
		const eventType = subTypeToEventType.get(subType) || '';
		// Colore: base per tipo principale, sfumatura per sottotipo
		const baseColor = baseColorForEventType(eventType);
		const barColor = shadeHexBySubtype(baseColor, eventType, subType);
		titleEl.text(`${subType} events in ${country}`);
		const series = computeSeries(country, subType);

		xScale.domain(series.map(d => d.year));
		yScale.domain([0, d3.max(series, d => d.events) || 1]).nice();

		const bars = g.selectAll('.hist-bar').data(series, d => d.year);

		// Enter
		const barsEnter = bars.enter()
			.append('rect')
			.attr('class', 'hist-bar')
			.attr('x', d => xScale(d.year))
			.attr('y', height)
			.attr('width', xScale.bandwidth())
			.attr('height', 0)
			.attr('fill', barColor)
			.on('mousemove', (event, d) => {
				const detail = data.find(x =>
					x.country.toLowerCase().includes(country.toLowerCase()) &&
					x.subType.toLowerCase().includes(subType.toLowerCase()) &&
					x.year === d.year
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

		// Enter transition
		barsEnter.transition()
			.duration(800)
			.attr('y', d => yScale(d.events))
			.attr('height', d => height - yScale(d.events));

		// Update transition
		bars.transition()
			.duration(600)
			.attr('x', d => xScale(d.year))
			.attr('width', xScale.bandwidth())
			.attr('y', d => yScale(d.events))
			.attr('height', d => height - yScale(d.events))
			.attr('fill', barColor);

		// Exit transition
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

		// === Legenda dinamica ===
		if (!legendRoot.empty()) {
			const eventTypes = Array.from(new Set(data.map(d => d.eventType))).sort((a,b)=>a.localeCompare(b));
			// Raggruppa sottotipi per eventType
			const grouped = d3.group(data, d => d.eventType, d => d.subType);
			const legendData = eventTypes.map(et => {
				const subs = Array.from(new Set(Array.from(grouped.get(et)?.keys() || []))).sort((a,b)=>a.localeCompare(b));
				const base = baseColorForEventType(et);
				return { eventType: et, baseColor: base, subTypes: subs };
			});

			legendRoot.selectAll('.legend-block').remove();
			const blocks = legendRoot.selectAll('.legend-block')
				.data(legendData)
				.enter()
				.append('div')
				.attr('class','legend-block')
				.style('display','flex')
				.style('flex-direction','column')
				.style('gap','4px')
				.style('min-width','120px');

			blocks.append('div')
				.style('display','flex')
				.style('align-items','center')
				.html(d => `<span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${d.baseColor};margin-right:6px;border:1px solid #00000033;box-shadow:0 0 0 1px #ffffff80 inset"></span><strong style="font-size:12px">${d.eventType||'N/A'}</strong>`);

			blocks.append('div')
				.style('display','flex')
				.style('flex-wrap','wrap')
				.style('gap','4px')
				.selectAll('.legend-sub')
				.data(d => d.subTypes.map(st => ({ parent: d.eventType, subType: st, baseColor: d.baseColor })))
				.enter()
				.append('div')
				.attr('class','legend-sub')
				.style('display','flex')
				.style('align-items','center')
				.style('font-size','11px')
				.style('padding','2px 4px')
				.style('border-radius','3px')
				.style('background', d => shadeHexBySubtype(d.baseColor, d.parent, d.subType))
				.style('color', d => {
					const c = d3.color(shadeHexBySubtype(d.baseColor, d.parent, d.subType));
					return c && c.l < 0.5 ? '#fff' : '#000';
				})
				.style('opacity', d => d.subType === subType ? 1 : 0.65)
				.style('outline', d => d.subType === subType ? '2px solid #222' : 'none')
				.style('cursor','pointer')
				.text(d => d.subType)
				.on('click', (ev,d) => {
					typeSelect.property('value', d.subType);
					update();
				});
		}
	}

	update();
	countrySelect.on('change.histogram', update);
	typeSelect.on('change.histogram', update);
}

const DATA_CACHE_VERSION = '20251111';
const COMPONENT_CACHE_VERSION = '20251111';
const DATA_BASE_PATH = './datasets/';

function withCacheBust(path, version) {
  if (!version) return path;
  const joiner = path.includes('?') ? '&' : '?';
  return `${path}${joiner}v=${version}`;
}

function loadCSV(filename) {
  return d3.csv(withCacheBust(`${DATA_BASE_PATH}${filename}`, DATA_CACHE_VERSION), d3.autoType);
}

async function loadComponent(id, componentPath) {
  const target = document.getElementById(id);
  if (!target) return;
  const requestUrl = withCacheBust(componentPath, COMPONENT_CACHE_VERSION);
  const html = await fetch(requestUrl, { cache: 'no-store' }).then(r => r.text());
  target.innerHTML = html;
}

function renderChart(id, renderFunction, datasets) {
  const container = document.getElementById(id);
  if (!container) return;
  renderFunction(container, datasets);
}

function setupMobileNavAutoClose() {
  const navbarCollapse = document.getElementById('mainNavbar');
  const toggler = document.querySelector('.navbar-toggler');
  if (!navbarCollapse || !toggler) return;

  navbarCollapse.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      const isOpen = navbarCollapse.classList.contains('show');
      const togglerVisible = window.getComputedStyle(toggler).display !== 'none';
      if (isOpen && togglerVisible) {
        closeNavbar(navbarCollapse, toggler);
      }
    });
  });

  document.addEventListener('click', (e) => {
    const isOpen = navbarCollapse.classList.contains('show');
    if (!isOpen) return;
    const togglerVisible = window.getComputedStyle(toggler).display !== 'none';
    if (!togglerVisible) return;
    const clickInside = navbarCollapse.contains(e.target) || toggler.contains(e.target);
    if (!clickInside) {
      closeNavbar(navbarCollapse, toggler);
    }
  });
}

function closeNavbar(navbarCollapse, toggler) {
  if (window.bootstrap && window.bootstrap.Collapse) {
    const collapseInstance = window.bootstrap.Collapse.getInstance(navbarCollapse) ||
      new window.bootstrap.Collapse(navbarCollapse, { toggle: false });
    collapseInstance.hide();
  } else {
    navbarCollapse.classList.remove('show');
  }
  toggler.setAttribute('aria-expanded', 'false');
}

async function init() {

  let datasets = {
    countries: await loadCSV('mea_country.csv'),
    demostrationEvents: await loadCSV('mea_number_of_demonstration_events_by_country_year.csv'),
    targetingCiviliansEvents: await loadCSV('mea_number_of_events_targeting_civilians_by_country_year.csv'),
    politicalViolenceEvents: await loadCSV('mea_number_of_political_violence_events_by_country_year.csv'),
    civilianFatalities: await loadCSV('mea_number_of_reported_civilian_fatalities_by_country_year.csv'),
    meaAggregatedData: await loadCSV('mea_aggregated_data.csv')
  }

  await loadComponent('navbar-container', 'components/navbar.html');
  await loadComponent('intro-container', 'components/intro.html');
  await loadComponent('chapter-1-container', 'components/chapter_1.html');
  await loadComponent('chapter-2-container', 'components/chapter_2.html');
  await loadComponent('footer-container', 'components/footer.html');

  await loadComponent('grouped-bar-container', 'components/charts/grouped_bar.html');
  await loadComponent('stacked-100-container', 'components/charts/stacked_100.html');
  await loadComponent('heatmap-container', 'components/charts/heatmap.html');
  await loadComponent('waffle-container', 'components/charts/waffle.html');
  await loadComponent('circlepacking-container', 'components/charts/circlepacking.html');
  await loadComponent('bar-horizontal-container', 'components/charts/bar_horizontal.html');
  await loadComponent('histogram-container', 'components/charts/histogram.html');
  await loadComponent('ridgeline-plot-container', 'components/charts/ridgeline_plot.html');
  await loadComponent('boxplot-container', 'components/charts/box_plot.html');

  renderChart('grouped-bar-chart', renderGroupedBarChart, datasets);
  renderChart('stacked-100-chart', renderStacked100Chart, datasets);
  renderChart('heatmap-chart', renderHeatmapChart, datasets);
  renderChart('bar-horizontal-chart', renderBarHorizontalChart, datasets);
  renderChart('waffle-chart', renderWaffleChart, datasets);
  renderChart('circlepacking-chart', renderCirclePacking, datasets); 
  renderChart('histogram-chart', renderHistogramChart, datasets);
  renderChart('ridgeline-chart', renderRidgeLinePlot, datasets);
  renderChart('box-plot-chart', renderBoxPlotChart, datasets);

  setupMobileNavAutoClose();
}

addEventListener('DOMContentLoaded', init);


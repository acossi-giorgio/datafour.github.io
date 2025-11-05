async function init() {

  let datasets = {
    countries: await loadCSV('mea_country.csv'),
    demostrationEvents: await loadCSV('mea_number_of_demonstration_events_by_country_year.csv'),
    targetingCiviliansEvents: await loadCSV('mea_number_of_events_targeting_civilians_by_country_year.csv'),
    politicalViolenceEvents: await loadCSV('mea_number_of_political_violence_events_by_country_year.csv'),
    civilianFatalities: await loadCSV('mea_number_of_reported_civilian_fatalities_by_country_year.csv'),
  }

  await loadComponent('navbar-container', 'components/navbar.html');
  await loadComponent('intro-container', 'components/intro.html');
  await loadComponent('charts-container', 'components/charts.html');
  await loadComponent('footer-container', 'components/footer.html');
  
  await loadComponent('grouped-bar-container', 'components/charts/grouped_bar.html');
  await loadComponent('stacked-100-container', 'components/charts/stacked_100.html');
  await loadComponent('heatmap-container', 'components/charts/heatmap.html');
  await loadComponent('waffle-container', 'components/charts/waffle.html');
  await loadComponent('circlepacking-container', 'components/charts/circlepacking.html');
  await loadComponent('bar-horizontal-container', 'components/charts/bar_horizontal.html');

  renderChart('grouped-bar-chart', renderGroupedBarChart, datasets);
  renderChart('stacked-100-chart', renderStacked100Chart, datasets);
  renderChart('heatmap-chart', renderHeatmapChart, datasets);
  renderChart('bar-horizontal-chart', renderBarHorizontalChart, datasets);
  renderChart('waffle-chart', renderWaffleChart, datasets);
  renderChart('circlepacking-chart', renderCirclePacking, datasets);  


  setupMobileNavAutoClose();
}

addEventListener('DOMContentLoaded', init);


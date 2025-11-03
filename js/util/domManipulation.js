async function loadComponent(id, componentPath) {
  const html = await fetch(componentPath).then(r => r.text());
  document.getElementById(id).innerHTML = html;
}

function renderChart(id, renderFunction, datasets) {
  const container = document.getElementById(id);
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
    const collapseInstance = window.bootstrap.Collapse.getInstance(navbarCollapse) || new window.bootstrap.Collapse(navbarCollapse, { toggle: false });
    collapseInstance.hide();
  } else {
    navbarCollapse.classList.remove('show');
  }
  toggler.setAttribute('aria-expanded', 'false');
}
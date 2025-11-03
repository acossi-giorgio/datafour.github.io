const basePath = './datasets/';

function loadCSV(filename) {
  return d3.csv(basePath + filename, d3.autoType);
}
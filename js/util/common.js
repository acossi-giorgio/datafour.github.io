const DATASET_KEYS = {
  DEMONSTRATIONS: "demonstrations",
  TARGET_CIVIL_EVENT: "targetingCiviliansEvents",
  POLITICAL_VIOLENCE: "politicalViolenceEvents",
  CIVILIAN_FATALITIES: "civilianFatalities",
  OTHER_POLITICAL_VIOLENCE: "otherPoliticalViolence"
};

const DATASET_COLORS = Object.freeze({
  [DATASET_KEYS.DEMONSTRATIONS]: "#2a7700ff",
  [DATASET_KEYS.TARGET_CIVIL_EVENT]: "#1461a9ff",
  [DATASET_KEYS.POLITICAL_VIOLENCE]: "#d8a305ff",
  [DATASET_KEYS.CIVILIAN_FATALITIES]: "#bc0303ff",
  [DATASET_KEYS.OTHER_POLITICAL_VIOLENCE]: "#bcbcbc"
});

function getDatasetColor(key) {
  return DATASET_COLORS[key] || "#666666";
}

const COUNTRY_BASE_PALETTE = [
  "#1f77b4","#ff7f0e","#2ca02c","#d62728","#9467bd","#8c564b","#e377c2","#7f7f7f","#bcbd22","#17becf",
  "#393b79","#637939","#8c6d31","#843c39","#7b4173","#3182bd","#e6550d","#31a354","#756bb1","#636363",
  "#6baed6","#fd8d3c","#74c476","#9e9ac8","#969696","#9edae5","#fdd0a2","#a1d99b","#dadaeb","#bdbdbd"
];

function hashCountry(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function getCountryColor(country) {
  if (!country) return "#ccc";
  const idx = hashCountry(country.trim().toLowerCase()) % COUNTRY_BASE_PALETTE.length;
  return COUNTRY_BASE_PALETTE[idx];
}

const YEAR_START = 2015;
const YEAR_END = 2024;

function filterYearsRange(years) {
  return years.filter(y => +y >= YEAR_START && +y <= YEAR_END);
}

function isYearInRange(y) {
  const v = +y;
  return v >= YEAR_START && v <= YEAR_END;
}

if (typeof window !== "undefined") {
  window.YEAR_MIN = YEAR_START;
  window.YEAR_MAX = YEAR_END;
  window.filterYearsRange = filterYearsRange;
  window.isYearInRange = isYearInRange;
}

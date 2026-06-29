const DEFAULT_BOUNDS = [[97, 20.5], [123, 45]];
const HOME_PADDING = { top: 96, bottom: 96, left: 42, right: 42 };
const REGIONAL_RELIEF_TILE_BOUNDS = [56.25, 16.63619, 140.625, 55.77657];
const RELIEF_VERSION = "20260629-genghis";
const RELIEF_TILES = `tiles/relief/{z}/{x}/{y}.webp?v=${RELIEF_VERSION}`;
const DEM_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const DEM_BOUNDS = [73, 17, 135, 54];

let points = [];
let markers = [];
let journeys = {};
let peopleCatalog = [];
let poems = {};
let activeJourney = null;
let activeIndex = 0;
let loadingJourneyId = "";

const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    projection: { type: "globe" },
    sources: {},
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#c3d3cf" } }
    ]
  },
  center: [105, 34],
  zoom: 2.7,
  pitch: 0,
  bearing: 0,
  minZoom: 2.4,
  maxZoom: 12.5,
  maxPitch: 75,
  renderWorldCopies: false,
  attributionControl: false
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

function fitHome(duration = 700) {
  map.fitBounds(homeBounds(), {
    padding: HOME_PADDING,
    pitch: 0,
    bearing: 0,
    duration
  });
}

function homeBounds() {
  if (activeJourney?.bounds) return activeJourney.bounds;
  const routePoints = activeJourney?.points || points;
  if (!routePoints.length) return DEFAULT_BOUNDS;

  const lngs = routePoints.map((point) => point.lnglat[0]);
  const lats = routePoints.map((point) => point.lnglat[1]);
  let west = Math.min(...lngs);
  let east = Math.max(...lngs);
  let south = Math.min(...lats);
  let north = Math.max(...lats);

  if (west === east) {
    west -= 1;
    east += 1;
  }
  if (south === north) {
    south -= 1;
    north += 1;
  }

  const lngPad = Math.max((east - west) * 0.14, 1.2);
  const latPad = Math.max((north - south) * 0.14, 1.2);
  return [
    [Math.max(-180, west - lngPad), Math.max(-85, south - latPad)],
    [Math.min(180, east + lngPad), Math.min(85, north + latPad)]
  ];
}

function setLoaderHidden() {
  const loader = document.getElementById("loader");
  loader.classList.add("hide");
  window.setTimeout(() => loader.remove(), 420);
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`无法载入 ${url}`);
  return response.json();
}

function addReliefTiles() {
  map.addSource("relief-global", {
    type: "raster",
    tiles: [RELIEF_TILES],
    tileSize: 256,
    minzoom: 0,
    maxzoom: 3
  });
  map.addSource("relief-cn", {
    type: "raster",
    tiles: [RELIEF_TILES],
    tileSize: 256,
    minzoom: 4,
    maxzoom: 6,
    bounds: REGIONAL_RELIEF_TILE_BOUNDS
  });
  map.addLayer({
    id: "relief-global-img",
    type: "raster",
    source: "relief-global",
    paint: {
      "raster-fade-duration": 0,
      "raster-opacity": ["interpolate", ["linear"], ["zoom"], 1.8, .95, 6.8, .46, 10, .28, 12, .2]
    }
  });
  map.addLayer({
    id: "relief-cn-img",
    type: "raster",
    source: "relief-cn",
    paint: {
      "raster-fade-duration": 0,
      "raster-opacity": ["interpolate", ["linear"], ["zoom"], 3.8, 0, 4.6, .92, 7.2, .58, 9.5, .36, 12, .24]
    }
  });
}

function addChinaLayers(china) {
  map.addSource("china", { type: "geojson", data: china });
  map.addLayer({
    id: "relief-base",
    type: "fill",
    source: "china",
    paint: { "fill-color": "#aebd8a", "fill-opacity": 1 }
  }, "relief-global-img");
  map.addLayer({
    id: "prov-fill",
    type: "fill",
    source: "china",
    paint: {
      "fill-color": "#e8d2a8",
      "fill-opacity": 0.14
    }
  });
  map.addLayer({
    id: "prov-line",
    type: "line",
    source: "china",
    paint: { "line-color": "#a98e5f", "line-width": 0.75, "line-opacity": 0.72 }
  });
  map.addLayer({
    id: "country-line",
    type: "line",
    source: "china",
    paint: { "line-color": "#7c5b31", "line-width": 1.9, "line-opacity": 0.66 }
  });

  china.features.forEach((feature) => {
    const center = feature.properties && (feature.properties.center || feature.properties.centroid);
    if (!center) return;
    const el = document.createElement("div");
    el.className = "province-label";
    el.textContent = feature.properties.name.replace(/(维吾尔|壮族|回族)?自治区|特别行政区|省|市/g, "");
    Object.assign(el.style, {
      color: "#7d6536",
      font: "600 12px Kaiti SC, STKaiti, KaiTi, serif",
      letterSpacing: "2px",
      pointerEvents: "none",
      opacity: ".72"
    });
    new maplibregl.Marker({ element: el }).setLngLat(center).addTo(map);
  });
}

function addMask(outline) {
  const holes = [];
  outline.features.forEach((feature) => {
    const geometry = feature.geometry;
    if (!geometry) return;
    const polygons = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
    polygons.forEach((polygon) => {
      if (polygon && polygon[0]) holes.push(polygon[0]);
    });
  });
  map.addSource("mask", {
    type: "geojson",
    data: {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], ...holes]
      }
    }
  });
  map.addLayer({
    id: "mask",
    type: "fill",
    source: "mask",
    paint: {
      "fill-color": "#ece1c6",
      "fill-opacity": ["interpolate", ["linear"], ["zoom"], 2.4, .42, 4, .22, 5.2, .06, 6, 0]
    }
  }, "prov-line");
}

function addWater(rivers, lakes) {
  map.addSource("rivers", { type: "geojson", data: rivers });
  map.addSource("lakes", { type: "geojson", data: lakes });
  const before = map.getLayer("mask") ? "mask" : "prov-line";
  map.addLayer({
    id: "lakes",
    type: "fill",
    source: "lakes",
    paint: { "fill-color": "#8cb8bf", "fill-opacity": 0.78 }
  }, before);
  map.addLayer({
    id: "rivers-under",
    type: "line",
    source: "rivers",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#4f7d8c",
      "line-opacity": 0.42,
      "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.6, 7, 4.4]
    }
  }, before);
  map.addLayer({
    id: "rivers",
    type: "line",
    source: "rivers",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#8fc0c6",
      "line-opacity": 0.95,
      "line-width": ["interpolate", ["linear"], ["zoom"], 3, .75, 7, 2.1]
    }
  }, before);
}

function addTerrainSources() {
  const dem = {
    type: "raster-dem",
    encoding: "terrarium",
    tiles: [DEM_TILES],
    tileSize: 256,
    maxzoom: 8,
    bounds: DEM_BOUNDS
  };
  map.addSource("dem", dem);
  map.addSource("dem-hs", { ...dem });
  map.addLayer({
    id: "hillshade",
    type: "hillshade",
    source: "dem-hs",
    minzoom: 4.8,
    paint: {
      "hillshade-shadow-color": "#6e4f2c",
      "hillshade-highlight-color": "#fff6dd",
      "hillshade-accent-color": "#8a6a3f",
      "hillshade-exaggeration": 0.18
    }
  }, "prov-line");
}

function makeRoute() {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: points.map((point) => point.lnglat)
    }
  };
}

function typeLabel(type) {
  return activeJourney.types[type]?.label || type;
}

function typeColor(type) {
  return activeJourney.types[type]?.color || "#9c2f1b";
}

function clearMarkers() {
  markers.forEach(({ marker }) => marker.remove());
  markers = [];
}

function addRouteLayer() {
  map.addSource("journey-route", { type: "geojson", data: makeRoute() });
  map.addLayer({
    id: "journey-route",
    type: "line",
    source: "journey-route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#9c2f1b",
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 3, .38, 6, .18],
      "line-width": ["interpolate", ["linear"], ["zoom"], 3, .9, 7, 2],
      "line-dasharray": [2, 2]
    }
  });
}

function renderMarkers() {
  clearMarkers();
  points.forEach((point, index) => {
    const el = document.createElement("button");
    el.className = `journey-marker type-${point.type}`;
    el.type = "button";
    el.setAttribute("aria-label", `查看${point.name}`);
    el.dataset.type = point.type;
    el.innerHTML = `<span class="flag" style="background:${typeColor(point.type)}"><span class="seal">${activeJourney.seal}</span><span class="name">${point.short}</span></span><span class="pole" style="background:${typeColor(point.type)}"></span><span class="dot" style="background:${typeColor(point.type)}"></span>`;
    el.addEventListener("click", () => selectPoint(index, true));
    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(point.lnglat).addTo(map);
    markers.push({ point, marker, el });
  });
}

function renderTitle() {
  document.title = `${activeJourney.heading} | 山河叙事地图`;
  document.getElementById("titleKicker").textContent = activeJourney.kicker;
  document.getElementById("titleHeading").textContent = activeJourney.heading;
  document.getElementById("titleSubtitle").textContent = activeJourney.subtitle;
  document.getElementById("searchInput").placeholder = activeJourney.searchPlaceholder;
}

function renderTimeline() {
  const timeline = document.getElementById("timeline");
  timeline.innerHTML = points.map((point, index) => `
    <li data-index="${index}">
      <time>${point.years.split("-")[0]}</time>
      <div>
        <b>${point.name}</b>
        <span>${typeLabel(point.type)} · ${point.works[0] || "生平节点"}</span>
      </div>
    </li>
  `).join("");
  timeline.querySelectorAll("li").forEach((item) => {
    item.addEventListener("click", () => selectPoint(Number(item.dataset.index), true));
  });
}

function selectPoint(index, fly) {
  activeIndex = (index + points.length) % points.length;
  const point = points[activeIndex];
  const poem = poemForPoint(point);
  document.getElementById("storyYears").textContent = point.years;
  document.getElementById("storyTitle").textContent = `${point.name} · ${typeLabel(point.type)}`;
  document.getElementById("storyText").textContent = point.summary;
  document.getElementById("storyWorks").innerHTML = point.works.map((work) => `<span>${work}</span>`).join("");
  document.getElementById("storyQuote").textContent = point.quote;
  document.getElementById("poemOpen").hidden = !poem;
  document.getElementById("progressText").textContent = `第 ${activeIndex + 1} / ${points.length} 站`;
  document.getElementById("progressBar").style.transform = `scaleX(${(activeIndex + 1) / points.length})`;
  markers.forEach((marker, i) => marker.el.classList.toggle("active", i === activeIndex));
  document.querySelectorAll(".timeline li").forEach((item) => {
    item.classList.toggle("on", Number(item.dataset.index) === activeIndex);
  });
  if (fly) {
    map.flyTo({
      center: point.lnglat,
      zoom: Math.max(map.getZoom(), 5.7),
      pitch: 0,
      bearing: 0,
      duration: 1500,
      curve: 1.42,
      essential: true
    });
  }
}

function poemForPoint(point) {
  const title = point.poem || point.works.find((work) => poems[work]);
  if (!title || !poems[title]) return null;
  return { title, ...poems[title] };
}

function openPoemModal() {
  const point = points[activeIndex];
  const poem = poemForPoint(point);
  if (!poem) return;
  const modal = document.getElementById("poemModal");
  const body = document.getElementById("poemBody");
  document.getElementById("poemAuthor").textContent = `${poem.author} · ${point.name}`;
  document.getElementById("poemTitle").textContent = poem.title;
  body.replaceChildren();
  poem.body.forEach((line) => {
    const p = document.createElement("p");
    p.textContent = line;
    body.appendChild(p);
  });
  modal.hidden = false;
  document.body.classList.add("modal-open");
  document.getElementById("poemClose").focus();
}

function closePoemModal() {
  document.getElementById("poemModal").hidden = true;
  document.body.classList.remove("modal-open");
  document.getElementById("poemOpen").focus();
}

function selectAdjacent(direction) {
  const next = (activeIndex + direction + points.length) % points.length;
  selectPoint(next, true);
}

function searchableText(point) {
  const poem = poemForPoint(point);
  const poemText = poem ? [poem.title, poem.author, ...poem.body] : [];
  return [point.name, point.short, point.years, typeLabel(point.type), point.summary, point.quote, ...point.works, ...poemText]
    .join(" ")
    .toLowerCase();
}

function renderSearchResults(query) {
  const panel = document.getElementById("searchResults");
  const value = query.trim().toLowerCase();
  if (!value) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  const matches = points
    .map((point, index) => ({ point, index, text: searchableText(point) }))
    .filter((item) => item.text.includes(value))
    .slice(0, 8);
  if (!matches.length) {
    panel.hidden = false;
    panel.innerHTML = `<p>没有匹配的地点或作品</p>`;
    return;
  }
  panel.hidden = false;
  panel.innerHTML = matches.map(({ point, index }) => `
    <button type="button" data-index="${index}">
      <b>${point.name}</b>
      <span>${typeLabel(point.type)} · ${point.works.join(" / ")}</span>
    </button>
  `).join("");
  panel.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      selectPoint(index, true);
      panel.hidden = true;
    });
  });
}

async function loadJourney(journeyId) {
  if (journeys[journeyId]) return journeys[journeyId];
  const person = peopleCatalog.find((item) => item.id === journeyId);
  if (!person) throw new Error(`未知人物：${journeyId}`);
  const journey = await getJson(person.path);
  journeys[journey.id] = journey;
  return journey;
}

function renderPersonSelect() {
  const select = document.getElementById("personSelect");
  select.replaceChildren(...peopleCatalog.map((person) => {
    const option = document.createElement("option");
    option.value = person.id;
    option.textContent = `${person.name} · ${person.label}`;
    return option;
  }));
}

function updatePersonSelect(journeyId) {
  document.getElementById("personSelect").value = journeyId;
}

async function setJourney(journeyId, flyHome = true) {
  if (loadingJourneyId || activeJourney?.id === journeyId) return;
  const search = document.querySelector(".search");
  const select = document.getElementById("personSelect");
  loadingJourneyId = journeyId;
  search.classList.add("loading");
  select.disabled = true;
  try {
    const nextJourney = await loadJourney(journeyId);
    if (!nextJourney) return;
    applyJourney(nextJourney, flyHome);
  } catch (error) {
    console.error(error);
    updatePersonSelect(activeJourney?.id || "");
  } finally {
    loadingJourneyId = "";
    select.disabled = false;
    search.classList.remove("loading");
  }
}

function applyJourney(nextJourney, flyHome = true) {
  if (!document.getElementById("poemModal").hidden) closePoemModal();
  activeJourney = nextJourney;
  points = nextJourney.points;
  activeIndex = 0;
  document.getElementById("searchInput").value = "";
  renderSearchResults("");
  renderTitle();
  renderMarkers();
  map.getSource("journey-route").setData(makeRoute());
  renderTimeline();
  updatePersonSelect(nextJourney.id);
  selectPoint(0, false);
  if (flyHome) fitHome();
}

function wireControls() {
  document.getElementById("prevBtn").addEventListener("click", () => selectAdjacent(-1));
  document.getElementById("nextBtn").addEventListener("click", () => selectAdjacent(1));
  document.getElementById("poemOpen").addEventListener("click", openPoemModal);
  document.getElementById("poemClose").addEventListener("click", closePoemModal);
  document.getElementById("poemBackdrop").addEventListener("click", closePoemModal);
  document.getElementById("searchInput").addEventListener("input", (event) => {
    renderSearchResults(event.target.value);
  });
  document.getElementById("searchInput").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const first = document.querySelector("#searchResults button");
    if (first) first.click();
  });
  document.getElementById("searchClear").addEventListener("click", () => {
    document.getElementById("searchInput").value = "";
    renderSearchResults("");
    document.getElementById("searchInput").focus();
  });
  document.addEventListener("click", (event) => {
    const search = document.querySelector(".search");
    if (!search.contains(event.target)) document.getElementById("searchResults").hidden = true;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.getElementById("poemModal").hidden) closePoemModal();
  });
  document.getElementById("personSelect").addEventListener("change", (event) => {
    setJourney(event.target.value);
  });
  map.on("zoom", () => {
    const showFlags = map.getZoom() >= 4.4;
    markers.forEach(({ el, point }) => {
      const flag = el.querySelector(".flag");
      flag.style.opacity = showFlags || point.importance >= 5 ? "1" : "0";
    });
  });
}

function drawMist() {
  const canvas = document.getElementById("mist");
  const context = canvas.getContext("2d");
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const clouds = [
    { x: .18, y: .18, w: 260, h: 58, r: -.08, a: .095 },
    { x: .72, y: .25, w: 300, h: 64, r: .06, a: .075 },
    { x: .44, y: .72, w: 340, h: 70, r: -.04, a: .06 }
  ];
  const resize = () => {
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    render();
  };
  const render = () => {
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    clouds.forEach((cloud) => {
      const x = window.innerWidth * cloud.x;
      const y = window.innerHeight * cloud.y;
      const gradient = context.createRadialGradient(x, y, 18, x, y, cloud.w * .62);
      gradient.addColorStop(0, `rgba(255,250,235,${cloud.a})`);
      gradient.addColorStop(1, "rgba(255,250,235,0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.ellipse(x, y, cloud.w, cloud.h, cloud.r, 0, Math.PI * 2);
      context.fill();
    });
  };
  resize();
  window.addEventListener("resize", resize);
}

map.on("load", async () => {
  try {
    addReliefTiles();
    const [china, outline, rivers, lakes, peopleIndex, poemData] = await Promise.all([
      getJson("geo/100000_full.json"),
      getJson("geo/china-outline.json"),
      getJson("geo/ne_50m_rivers_cn.json"),
      getJson("geo/ne_50m_lakes_cn.json"),
      getJson("data/people/index.json"),
      getJson("data/poems.json")
    ]);
    poems = poemData;
    peopleCatalog = peopleIndex.people || [];
    const defaultJourneyId = peopleIndex.default || peopleCatalog[0]?.id;
    if (!defaultJourneyId) throw new Error("缺少默认人物数据");
    renderPersonSelect();
    activeJourney = await loadJourney(defaultJourneyId);
    points = activeJourney.points;
    addChinaLayers(china);
    addMask(outline);
    addWater(rivers, lakes);
    addTerrainSources();
    addRouteLayer();
    renderTitle();
    renderMarkers();
    renderTimeline();
    updatePersonSelect(activeJourney.id);
    wireControls();
    drawMist();
    fitHome(0);
    selectPoint(0, false);
    map.once("render", () => window.setTimeout(setLoaderHidden, 180));
  } catch (error) {
    document.querySelector("#loader strong").textContent = "载入失败";
    document.querySelector("#loader span").textContent = error.message;
  }
});

<template>
  <div class="map-container" ref="mapContainer">
    <canvas ref="mapCanvas"
            @mousedown="onMouseDown" @mousemove="onMouseMove"
            @mouseup="onMouseUp" @mouseleave="onMouseUp"
            @wheel.prevent="onWheel" @contextmenu.prevent></canvas>
    <div class="map-tooltip" v-if="hoveredCounty" :style="tooltipStyle">
      <strong>{{ hoveredCounty.name }}</strong>
      <div class="tooltip-detail" v-if="hoveredCounty.holderName">
        Ruler: {{ hoveredCounty.holderName }}
      </div>
      <div class="tooltip-detail">Terrain: {{ hoveredCounty.terrain }}</div>
      <div class="tooltip-detail" v-if="hoveredCounty.duchyName">{{ hoveredCounty.duchyName }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { Delaunay } from 'd3-delaunay';
import { useGameStore } from '../../stores/game';

const game = useGameStore();
const mapContainer = ref(null);
const mapCanvas = ref(null);
const hoveredCounty = ref(null);
const tooltipStyle = ref({});

let ctx = null;
let camera = { offsetX: 0, offsetY: 0, zoom: 1.0 };
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let animFrame = null;
let voronoi = null;
let delaunayObj = null;
let cellPolygons = [];
let filteredCounties = [];
let mapBounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
let canvasW = 800;
let canvasH = 600;

const TERRAIN_COLORS = {
  plains:    { fill: '#5e8a3c', accent: '#6b9e48' },
  hills:     { fill: '#8a7d52', accent: '#9c8f64' },
  mountains: { fill: '#6e6e72', accent: '#808084' },
  forest:    { fill: '#2f6b2a', accent: '#3d7d38' },
  desert:    { fill: '#c4a84c', accent: '#d6ba5e' },
  coast:     { fill: '#3e7e96', accent: '#509ab2' },
  marsh:     { fill: '#4a6648', accent: '#5c785a' },
};

const TERRAIN_ICONS = {
  mountains: '▲',
  forest: '♣',
  desert: '~',
  marsh: '≈',
  coast: '○',
};

function computeVoronoi() {
  filteredCounties = game.counties.filter((c) => c.mapX != null && c.mapY != null);
  if (filteredCounties.length < 3) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of filteredCounties) {
    minX = Math.min(minX, c.mapX);
    minY = Math.min(minY, c.mapY);
    maxX = Math.max(maxX, c.mapX);
    maxY = Math.max(maxY, c.mapY);
  }

  const padX = (maxX - minX) * 0.25 + 80;
  const padY = (maxY - minY) * 0.25 + 80;
  mapBounds = { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY };

  const points = filteredCounties.map((c) => [c.mapX, c.mapY]);
  delaunayObj = Delaunay.from(points);
  voronoi = delaunayObj.voronoi([mapBounds.minX, mapBounds.minY, mapBounds.maxX, mapBounds.maxY]);

  cellPolygons = [];
  for (let i = 0; i < points.length; i++) {
    cellPolygons.push(voronoi.cellPolygon(i));
  }
}

function initCanvas() {
  const canvas = mapCanvas.value;
  const container = mapContainer.value;
  if (!canvas || !container) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = container.getBoundingClientRect();
  canvasW = rect.width;
  canvasH = rect.height;
  canvas.width = canvasW * dpr;
  canvas.height = canvasH * dpr;
  canvas.style.width = canvasW + 'px';
  canvas.style.height = canvasH + 'px';
  ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  computeVoronoi();
  centerCamera();
  render();
}

function centerCamera() {
  if (filteredCounties.length === 0) return;
  const mapW = mapBounds.maxX - mapBounds.minX;
  const mapH = mapBounds.maxY - mapBounds.minY;
  const scaleX = canvasW / mapW;
  const scaleY = canvasH / mapH;
  camera.zoom = Math.min(scaleX, scaleY) * 0.85;
  const centerX = (mapBounds.minX + mapBounds.maxX) / 2;
  const centerY = (mapBounds.minY + mapBounds.maxY) / 2;
  camera.offsetX = canvasW / 2 - centerX * camera.zoom;
  camera.offsetY = canvasH / 2 - centerY * camera.zoom;
}

function wts(wx, wy) {
  return [wx * camera.zoom + camera.offsetX, wy * camera.zoom + camera.offsetY];
}

function stw(sx, sy) {
  return [(sx - camera.offsetX) / camera.zoom, (sy - camera.offsetY) / camera.zoom];
}

function getRealmColor(county) {
  const duchy = county.deJureParentId ? game.titles.find((t) => t.id === county.deJureParentId) : null;
  const kingdom = duchy?.deJureParentId ? game.titles.find((t) => t.id === duchy.deJureParentId) : null;
  return kingdom?.color || duchy?.color || county.color || '#666';
}

function drawPolygon(poly) {
  ctx.beginPath();
  for (let j = 0; j < poly.length; j++) {
    const [sx, sy] = wts(poly[j][0], poly[j][1]);
    if (j === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.closePath();
}

function render() {
  if (!ctx || filteredCounties.length === 0 || cellPolygons.length === 0) {
    if (ctx) {
      ctx.fillStyle = '#0e1a2b';
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.fillStyle = '#e8d5a3';
      ctx.font = '16px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for map data...', canvasW / 2, canvasH / 2);
    }
    return;
  }

  // Water background
  const grd = ctx.createLinearGradient(0, 0, canvasW, canvasH);
  grd.addColorStop(0, '#0c1a2e');
  grd.addColorStop(0.5, '#122740');
  grd.addColorStop(1, '#0a1525');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Water texture
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = '#3a5a7a';
  ctx.lineWidth = 0.5;
  for (let x = -200; x < canvasW + 200; x += 40) {
    ctx.beginPath();
    for (let y = 0; y < canvasH; y += 4) {
      const wx = x + Math.sin(y * 0.02 + x * 0.01) * 15;
      if (y === 0) ctx.moveTo(wx, y);
      else ctx.lineTo(wx, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1.0;

  // 1. Draw filled terrain cells
  for (let i = 0; i < filteredCounties.length; i++) {
    const county = filteredCounties[i];
    const poly = cellPolygons[i];
    if (!poly) continue;

    const terrain = TERRAIN_COLORS[county.terrain] || TERRAIN_COLORS.plains;
    const realmColor = getRealmColor(county);

    // Draw base terrain
    drawPolygon(poly);
    ctx.fillStyle = terrain.fill;
    ctx.fill();

    // Realm color overlay
    drawPolygon(poly);
    ctx.fillStyle = realmColor;
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Terrain accent pattern
    drawPolygon(poly);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = terrain.accent;
    ctx.globalAlpha = 0.15;
    const [cx, cy] = wts(county.mapX, county.mapY);
    const pSize = Math.max(4, 8 * camera.zoom);
    for (let dx = -60; dx < 60; dx += pSize * 2.5) {
      for (let dy = -60; dy < 60; dy += pSize * 2.5) {
        const px = cx + dx + (Math.sin(dy * 0.7) * pSize);
        const py = cy + dy;
        ctx.fillRect(px, py, pSize * 0.8, pSize * 0.8);
      }
    }
    ctx.globalAlpha = 1.0;
    ctx.restore();
  }

  // 2. Draw cell borders
  for (let i = 0; i < filteredCounties.length; i++) {
    const poly = cellPolygons[i];
    if (!poly) continue;
    drawPolygon(poly);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = 0.5 * camera.zoom;
    ctx.stroke();
  }

  // 3. Draw realm borders (thick borders between different holders)
  for (let i = 0; i < filteredCounties.length; i++) {
    if (!delaunayObj) break;
    const county = filteredCounties[i];
    for (const j of delaunayObj.neighbors(i)) {
      if (j <= i) continue;
      const other = filteredCounties[j];
      if (!other) continue;

      const sameHolder = county.holderId && county.holderId === other.holderId;
      const sameDuchy = county.deJureParentId && county.deJureParentId === other.deJureParentId;

      if (sameHolder && sameDuchy) continue;

      // Find shared vertices between adjacent polygons
      const polyA = cellPolygons[i];
      const polyB = cellPolygons[j];
      if (!polyA || !polyB) continue;

      const shared = [];
      for (const pa of polyA) {
        for (const pb of polyB) {
          if (Math.abs(pa[0] - pb[0]) < 0.1 && Math.abs(pa[1] - pb[1]) < 0.1) {
            shared.push(pa);
            break;
          }
        }
      }
      if (shared.length < 2) continue;

      const [x1, y1] = wts(shared[0][0], shared[0][1]);
      const [x2, y2] = wts(shared[1][0], shared[1][1]);

      if (!sameHolder) {
        ctx.strokeStyle = 'rgba(232, 213, 163, 0.85)';
        ctx.lineWidth = Math.max(1.5, 2.5 * camera.zoom);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(196, 163, 90, 0.4)';
        ctx.lineWidth = Math.max(0.5, 1 * camera.zoom);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
  }

  // 4. Draw terrain icons at county centers
  if (camera.zoom > 0.5) {
    ctx.globalAlpha = 0.2;
    const iconSize = Math.max(8, 12 * camera.zoom);
    ctx.font = `${iconSize}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < filteredCounties.length; i++) {
      const county = filteredCounties[i];
      const icon = TERRAIN_ICONS[county.terrain];
      if (!icon) continue;
      const [sx, sy] = wts(county.mapX, county.mapY);
      ctx.fillStyle = '#000';
      for (let dx = -20; dx <= 20; dx += 15) {
        for (let dy = -15; dy <= 15; dy += 12) {
          ctx.fillText(icon, sx + dx, sy + dy);
        }
      }
    }
    ctx.globalAlpha = 1.0;
  }

  // 5. Selected county highlight
  if (game.selectedTitleId) {
    const idx = filteredCounties.findIndex((c) => c.id === game.selectedTitleId);
    if (idx >= 0 && cellPolygons[idx]) {
      drawPolygon(cellPolygons[idx]);
      ctx.fillStyle = 'rgba(232, 213, 163, 0.25)';
      ctx.fill();
      ctx.strokeStyle = '#e8d5a3';
      ctx.lineWidth = Math.max(2, 3 * camera.zoom);
      ctx.stroke();
    }
  }

  // 6. County names
  if (camera.zoom > 0.55) {
    const fontSize = Math.max(8, 11 * camera.zoom);
    ctx.font = `600 ${fontSize}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const county of filteredCounties) {
      const [sx, sy] = wts(county.mapX, county.mapY);
      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillText(county.name, sx + 1, sy + 12 * camera.zoom + 1);
      // Text
      ctx.fillStyle = '#e8e4dc';
      ctx.fillText(county.name, sx, sy + 12 * camera.zoom);
    }
  }

  // 7. Kingdom names (when zoomed out)
  if (camera.zoom < 1.2) {
    const kingdoms = game.titles.filter((t) => t.tier === 'kingdom');
    ctx.font = `700 ${Math.max(12, 18 * camera.zoom)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.4;
    for (const kingdom of kingdoms) {
      const duchies = game.titles.filter((t) => t.deJureParentId === kingdom.id);
      const kCounties = [];
      for (const d of duchies) {
        kCounties.push(...filteredCounties.filter((c) => c.deJureParentId === d.id));
      }
      if (kCounties.length === 0) continue;
      const avgX = kCounties.reduce((s, c) => s + c.mapX, 0) / kCounties.length;
      const avgY = kCounties.reduce((s, c) => s + c.mapY, 0) / kCounties.length;
      const [sx, sy] = wts(avgX, avgY);
      ctx.fillStyle = kingdom.color || '#e8d5a3';
      ctx.fillText(kingdom.name.replace('Kingdom of ', '').toUpperCase(), sx, sy - 25 * camera.zoom);
    }
    ctx.globalAlpha = 1.0;
  }

  // 8. Draw armies
  for (const army of game.armies) {
    if (!army.isRaised) continue;
    const [ax, ay] = wts(army.posX, army.posY);
    const r = Math.max(5, 8 * camera.zoom);

    // Army circle
    ctx.beginPath();
    ctx.arc(ax, ay, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a2e';
    ctx.fill();
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Army icon
    ctx.fillStyle = '#ffd700';
    ctx.font = `${Math.max(8, 10 * camera.zoom)}px Inter`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚔', ax, ay);

    // Troop count
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(7, 9 * camera.zoom)}px Inter`;
    ctx.fillText(`${army.levies}`, ax, ay - r - 6);
  }
}

function findCountyAtScreen(sx, sy) {
  if (!delaunayObj || filteredCounties.length === 0) return null;
  const [wx, wy] = stw(sx, sy);
  const idx = delaunayObj.find(wx, wy);
  if (idx < 0 || idx >= filteredCounties.length) return null;

  // Check if within the actual Voronoi cell
  const poly = cellPolygons[idx];
  if (!poly) return null;

  // Quick distance check
  const county = filteredCounties[idx];
  const dist = Math.sqrt(Math.pow(wx - county.mapX, 2) + Math.pow(wy - county.mapY, 2));
  const maxDist = (mapBounds.maxX - mapBounds.minX) * 0.15;
  if (dist > maxDist) return null;

  return { county, index: idx };
}

function onMouseDown(e) {
  isDragging = true;
  dragStart = { x: e.clientX, y: e.clientY };
}

function onMouseMove(e) {
  const rect = mapCanvas.value?.getBoundingClientRect();
  if (!rect) return;
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  if (isDragging) {
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    camera.offsetX += dx;
    camera.offsetY += dy;
    dragStart = { x: e.clientX, y: e.clientY };
    render();
    hoveredCounty.value = null;
    return;
  }

  const result = findCountyAtScreen(sx, sy);
  if (result) {
    const c = result.county;
    const holder = c.holderId ? game.characters.find((ch) => ch.id === c.holderId) : null;
    const duchy = c.deJureParentId ? game.titles.find((t) => t.id === c.deJureParentId) : null;
    hoveredCounty.value = {
      ...c,
      holderName: holder ? `${holder.firstName} ${holder.lastName}` : 'None',
      duchyName: duchy?.name || '',
    };
    tooltipStyle.value = {
      left: (e.clientX + 15) + 'px',
      top: (e.clientY - 10) + 'px',
    };
  } else {
    hoveredCounty.value = null;
  }
}

function onMouseUp(e) {
  if (isDragging) {
    const dx = Math.abs(e.clientX - dragStart.x);
    const dy = Math.abs(e.clientY - dragStart.y);
    // Only register click if mouse didn't move much
    if (dx < 5 && dy < 5) {
      const rect = mapCanvas.value?.getBoundingClientRect();
      if (rect) {
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        handleClick(sx, sy);
      }
    }
  }
  isDragging = false;
}

function handleClick(sx, sy) {
  const result = findCountyAtScreen(sx, sy);
  if (result) {
    game.selectTitle(result.county.id);
    if (result.county.holderId) {
      game.selectCharacter(result.county.holderId);
    }
  }
}

function onWheel(e) {
  const rect = mapCanvas.value?.getBoundingClientRect();
  if (!rect) return;
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Zoom toward cursor
  const [wx, wy] = stw(mouseX, mouseY);
  const delta = e.deltaY > 0 ? 0.88 : 1.12;
  camera.zoom = Math.max(0.3, Math.min(5.0, camera.zoom * delta));
  camera.offsetX = mouseX - wx * camera.zoom;
  camera.offsetY = mouseY - wy * camera.zoom;
  render();
}

function onResize() {
  initCanvas();
}

watch(() => game.titles, () => { computeVoronoi(); render(); }, { deep: true });
watch(() => game.armies, render, { deep: true });
watch(() => game.selectedTitleId, render);

onMounted(() => {
  nextTick(initCanvas);
  window.addEventListener('resize', onResize);

  function loop() {
    render();
    animFrame = requestAnimationFrame(loop);
  }
  animFrame = requestAnimationFrame(loop);
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  if (animFrame) cancelAnimationFrame(animFrame);
});
</script>

<style scoped>
.map-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  cursor: grab;
}

.map-container:active { cursor: grabbing; }

canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.map-tooltip {
  position: fixed;
  background: rgba(10, 10, 15, 0.95);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 8px 12px;
  pointer-events: none;
  z-index: 50;
  font-size: 0.8rem;
}

.map-tooltip strong { color: var(--gold-light); }
.tooltip-detail { color: var(--text-secondary); font-size: 0.75rem; margin-top: 2px; }
</style>

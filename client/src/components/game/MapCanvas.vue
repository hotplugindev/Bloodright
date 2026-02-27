<template>
  <div class="map-container" ref="mapContainer">
    <canvas ref="mapCanvas" @click="handleClick" @mousemove="handleHover" @wheel="handleZoom"
            @mousedown="startDrag" @mouseup="endDrag" @mouseleave="endDrag"></canvas>
    <div class="map-tooltip" v-if="hoveredCounty" :style="tooltipStyle">
      <strong>{{ hoveredCounty.name }}</strong>
      <div class="tooltip-detail" v-if="hoveredCounty.holder">
        Ruler: {{ hoveredCounty.holder.firstName }} {{ hoveredCounty.holder.lastName }}
      </div>
      <div class="tooltip-detail">Terrain: {{ hoveredCounty.terrain }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useGameStore } from '../../stores/game';

const game = useGameStore();
const mapContainer = ref(null);
const mapCanvas = ref(null);
const hoveredCounty = ref(null);
const tooltipStyle = ref({});

let ctx = null;
let camera = { x: 400, y: 300, zoom: 1.0 };
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let animFrame = null;

const TERRAIN_COLORS = {
  plains: '#4a6741',
  hills: '#6b7e4f',
  mountains: '#8b8b7a',
  forest: '#2d5a27',
  desert: '#c4a35a',
  coast: '#4a7a8b',
  marsh: '#5a6b4a',
};

function initCanvas() {
  const canvas = mapCanvas.value;
  const container = mapContainer.value;
  if (!canvas || !container) return;

  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  ctx = canvas.getContext('2d');
  render();
}

function render() {
  if (!ctx) return;
  const canvas = mapCanvas.value;
  const w = canvas.width;
  const h = canvas.height;

  // Clear
  ctx.fillStyle = '#0a1628';
  ctx.fillRect(0, 0, w, h);

  // Draw water background pattern
  ctx.fillStyle = '#0c1a2e';
  for (let x = 0; x < w; x += 20) {
    for (let y = 0; y < h; y += 20) {
      if ((x + y) % 40 === 0) {
        ctx.fillRect(x, y, 10, 10);
      }
    }
  }

  const counties = game.counties;
  const z = camera.zoom;
  const ox = w / 2 - camera.x * z;
  const oy = h / 2 - camera.y * z;

  // Draw county connections (borders)
  ctx.strokeStyle = 'rgba(196, 163, 90, 0.15)';
  ctx.lineWidth = 1;
  for (let i = 0; i < counties.length; i++) {
    for (let j = i + 1; j < counties.length; j++) {
      const a = counties[i];
      const b = counties[j];
      if (!a.mapX || !b.mapX) continue;
      const dist = Math.sqrt(Math.pow(a.mapX - b.mapX, 2) + Math.pow(a.mapY - b.mapY, 2));
      if (dist < 80) {
        ctx.beginPath();
        ctx.moveTo(a.mapX * z + ox, a.mapY * z + oy);
        ctx.lineTo(b.mapX * z + ox, b.mapY * z + oy);
        ctx.stroke();
      }
    }
  }

  // Draw counties
  for (const county of counties) {
    if (!county.mapX || !county.mapY) continue;

    const sx = county.mapX * z + ox;
    const sy = county.mapY * z + oy;
    const radius = 18 * z;

    // Terrain hex
    const color = TERRAIN_COLORS[county.terrain] || '#555';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const x = sx + radius * Math.cos(angle);
      const y = sy + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    // Border color by owner's realm
    const duchy = county.deJureParentId
      ? game.titles.find((t) => t.id === county.deJureParentId)
      : null;
    ctx.strokeStyle = duchy?.color || county.color || 'rgba(196, 163, 90, 0.3)';
    ctx.lineWidth = 2 * z;
    ctx.stroke();

    // Highlight if selected
    if (game.selectedTitleId === county.id) {
      ctx.strokeStyle = '#e8d5a3';
      ctx.lineWidth = 3 * z;
      ctx.stroke();
    }

    // County name
    if (z > 0.6) {
      ctx.fillStyle = '#e8e4dc';
      ctx.font = `${Math.max(8, 10 * z)}px Inter`;
      ctx.textAlign = 'center';
      ctx.fillText(county.name, sx, sy + radius + 12 * z);
    }
  }

  // Draw armies
  for (const army of game.armies) {
    if (!army.isRaised) continue;
    const ax = army.posX * z + ox;
    const ay = army.posY * z + oy;

    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(ax, ay, 6 * z, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = `${9 * z}px Inter`;
    ctx.textAlign = 'center';
    ctx.fillText(`⚔${army.levies}`, ax, ay - 10 * z);
  }
}

function handleClick(e) {
  const rect = mapCanvas.value.getBoundingClientRect();
  const mouseX = (e.clientX - rect.left - rect.width / 2) / camera.zoom + camera.x;
  const mouseY = (e.clientY - rect.top - rect.height / 2) / camera.zoom + camera.y;

  // Find closest county
  let closest = null;
  let minDist = Infinity;
  for (const county of game.counties) {
    if (!county.mapX) continue;
    const dist = Math.sqrt(Math.pow(county.mapX - mouseX, 2) + Math.pow(county.mapY - mouseY, 2));
    if (dist < 25 && dist < minDist) {
      minDist = dist;
      closest = county;
    }
  }

  if (closest) {
    game.selectTitle(closest.id);
    if (closest.holderId) {
      game.selectCharacter(closest.holderId);
    }
  }
}

function handleHover(e) {
  const rect = mapCanvas.value.getBoundingClientRect();
  const mouseX = (e.clientX - rect.left - rect.width / 2) / camera.zoom + camera.x;
  const mouseY = (e.clientY - rect.top - rect.height / 2) / camera.zoom + camera.y;

  let closest = null;
  let minDist = Infinity;
  for (const county of game.counties) {
    if (!county.mapX) continue;
    const dist = Math.sqrt(Math.pow(county.mapX - mouseX, 2) + Math.pow(county.mapY - mouseY, 2));
    if (dist < 25 && dist < minDist) {
      minDist = dist;
      closest = county;
    }
  }

  if (closest) {
    hoveredCounty.value = {
      ...closest,
      holder: game.characters.find((c) => c.id === closest.holderId),
    };
    tooltipStyle.value = {
      left: e.clientX + 15 + 'px',
      top: e.clientY - 10 + 'px',
    };
  } else {
    hoveredCounty.value = null;
  }

  // Drag
  if (isDragging) {
    camera.x -= (e.clientX - dragStart.x) / camera.zoom;
    camera.y -= (e.clientY - dragStart.y) / camera.zoom;
    dragStart = { x: e.clientX, y: e.clientY };
    render();
  }
}

function handleZoom(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  camera.zoom = Math.max(0.3, Math.min(3.0, camera.zoom * delta));
  render();
}

function startDrag(e) {
  isDragging = true;
  dragStart = { x: e.clientX, y: e.clientY };
}

function endDrag() {
  isDragging = false;
}

function onResize() {
  initCanvas();
}

// Watch for game state changes to re-render
watch(() => game.titles, render, { deep: true });
watch(() => game.armies, render, { deep: true });

onMounted(() => {
  nextTick(initCanvas);
  window.addEventListener('resize', onResize);

  // Render loop for smooth updates
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

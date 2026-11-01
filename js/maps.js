// ============================================================================
// WILLOW'S TROOP - PROCEDURAL HD MAPS, SAVED MAPS DB (IndexedDB) & GRID ENGINE
// ============================================================================

window.SavedMapsDB = {
  dbName: 'WillowsTroopMapsDB',
  storeName: 'custom_maps',
  db: null,

  init() {
    return new Promise((resolve) => {
      if (this.db) return resolve(this.db);
      if (!window.indexedDB) return resolve(null);

      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      req.onerror = () => resolve(null);
    });
  },

  async getAllMaps() {
    const db = await this.init();
    if (!db) return [];
    return new Promise((resolve) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        resolve(list);
      };
      req.onerror = () => resolve([]);
    });
  },

  async saveMap(name, dataUrl, transform = null) {
    const db = await this.init();
    const item = {
      id: 'map_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      name: name || 'Mapa Personalizado',
      dataUrl,
      transform: transform || { zoom: 1, panX: 0, panY: 0, tableScale: 1, autoFitTable: true },
      createdAt: Date.now()
    };
    if (!db) return item;
    return new Promise((resolve) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put(item);
      tx.oncomplete = () => resolve(item);
      tx.onerror = () => resolve(item);
    });
  },

  async updateMap(id, updates) {
    const db = await this.init();
    if (!db) return false;
    return new Promise((resolve) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const data = getReq.result;
        if (data) {
          Object.assign(data, updates);
          store.put(data);
        }
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  },

  async renameMap(id, newName) {
    return this.updateMap(id, { name: newName });
  },

  async deleteMap(id) {
    const db = await this.init();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }
};

window.MapGenerator = {
  generatePresetMap(presetId, width = 2048, height = 2048) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.save();
    if (width !== 2048 || height !== 2048) {
      ctx.scale(width / 2048, height / 2048);
    }

    const baseW = 2048;
    const baseH = 2048;

    switch (presetId) {
      case 'dungeon':
        this.drawDungeonMap(ctx, baseW, baseH);
        break;
      case 'tavern':
        this.drawTavernMap(ctx, baseW, baseH);
        break;
      case 'forest':
        this.drawForestMap(ctx, baseW, baseH);
        break;
      case 'arcane':
        this.drawArcaneArenaMap(ctx, baseW, baseH);
        break;
      case 'city':
        this.drawCityMap(ctx, baseW, baseH);
        break;
      case 'parchment':
      default:
        this.drawParchmentMap(ctx, baseW, baseH);
        break;
    }

    ctx.restore();
    return canvas;
  },

  drawNoise(ctx, w, h, alpha = 0.04) {
    ctx.save();
    for (let i = 0; i < 3200; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const s = 3 + Math.random() * 6;
      ctx.fillStyle = Math.random() > 0.5
        ? `rgba(255,255,255,${alpha})`
        : `rgba(0,0,0,${alpha * 1.4})`;
      ctx.fillRect(x, y, s, s);
    }
    ctx.restore();
  },

  drawDungeonMap(ctx, w, h) {
    ctx.fillStyle = '#14171f';
    ctx.fillRect(0, 0, w, h);

    const tile = 64;
    for (let y = 0; y < h; y += tile) {
      for (let x = 0; x < w; x += tile) {
        const shade = 24 + Math.floor(Math.random() * 14);
        ctx.fillStyle = `rgb(${shade}, ${shade + 3}, ${shade + 8})`;
        ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
      }
    }

    const rooms = [
      { x: 192, y: 192, rw: 576, rh: 512 },
      { x: 1280, y: 192, rw: 576, rh: 512 },
      { x: 640, y: 640, rw: 768, rh: 768 },
      { x: 192, y: 1344, rw: 512, rh: 512 },
      { x: 1344, y: 1344, rw: 512, rh: 512 },
      { x: 768, y: 384, rw: 512, rh: 192 },
      { x: 384, y: 704, rw: 192, rh: 640 },
      { x: 1472, y: 704, rw: 192, rh: 640 },
      { x: 704, y: 1536, rw: 640, rh: 192 },
      { x: 928, y: 480, rw: 192, rh: 192 }
    ];

    ctx.fillStyle = '#3b4254';
    rooms.forEach(r => {
      ctx.fillRect(r.x - 20, r.y - 20, r.rw + 40, r.rh + 40);
    });

    rooms.forEach(r => {
      for (let y = r.y; y < r.y + r.rh; y += tile) {
        for (let x = r.x; x < r.x + r.rw; x += tile) {
          const v = 58 + Math.floor(Math.random() * 20);
          ctx.fillStyle = `rgb(${v}, ${v + 4}, ${v + 10})`;
          ctx.fillRect(x, y, tile, tile);
          ctx.strokeStyle = 'rgba(15, 18, 26, 0.65)';
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 2, y + 2, tile - 4, tile - 4);
        }
      }
    });

    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(896, 680, 256, 688);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 6;
    ctx.strokeRect(904, 688, 240, 672);

    const torches = [
      [660, 660], [1380, 660], [660, 1380], [1380, 1380],
      [220, 220], [740, 220], [1300, 220], [1820, 220]
    ];
    torches.forEach(([tx, ty]) => {
      const grad = ctx.createRadialGradient(tx, ty, 6, tx, ty, 210);
      grad.addColorStop(0, 'rgba(255, 180, 60, 0.55)');
      grad.addColorStop(0.5, 'rgba(245, 110, 20, 0.18)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(tx, ty, 210, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(tx, ty, 10, 0, Math.PI * 2);
      ctx.fill();
    });

    this.drawNoise(ctx, w, h, 0.03);
  },

  drawTavernMap(ctx, w, h) {
    ctx.fillStyle = '#1e2f23';
    ctx.fillRect(0, 0, w, h);

    const tx = 192, ty = 192, tw = 1664, th = 1664;
    ctx.fillStyle = '#4a2c18';
    ctx.fillRect(tx - 24, ty - 24, tw + 48, th + 48);

    const plankH = 48;
    const plankW = 256;
    for (let y = ty; y < ty + th; y += plankH) {
      const offset = (y / plankH) % 2 === 0 ? 0 : 128;
      for (let x = tx - offset; x < tx + tw; x += plankW) {
        const drawX = Math.max(tx, x);
        const drawW = Math.min(x + plankW, tx + tw) - drawX;
        if (drawW <= 0) continue;
        const tone = 82 + Math.floor(Math.random() * 25);
        ctx.fillStyle = `rgb(${tone + 25}, ${tone - 5}, ${Math.floor(tone * 0.48)})`;
        ctx.fillRect(drawX, y, drawW, plankH);
        ctx.strokeStyle = 'rgba(30, 15, 5, 0.6)';
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, y, drawW, plankH);
      }
    }

    ctx.fillStyle = '#4b5563';
    ctx.fillRect(832, 168, 384, 140);
    const fireGrad = ctx.createRadialGradient(1024, 240, 15, 1024, 300, 420);
    fireGrad.addColorStop(0, 'rgba(255, 200, 70, 0.85)');
    fireGrad.addColorStop(0.4, 'rgba(234, 88, 12, 0.35)');
    fireGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fireGrad;
    ctx.beginPath();
    ctx.arc(1024, 280, 420, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2e190d';
    ctx.fillRect(320, 384, 120, 680);
    ctx.fillRect(320, 960, 520, 110);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 6;
    ctx.strokeRect(320, 384, 120, 680);

    ctx.fillStyle = '#7c2d12';
    ctx.fillRect(880, 760, 620, 620);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 4;
    ctx.strokeRect(895, 775, 590, 590);

    const tables = [
      [1040, 920], [1340, 920], [1040, 1220], [1340, 1220],
      [600, 1450], [950, 1550], [1480, 520]
    ];
    tables.forEach(([cx, cy]) => {
      ctx.fillStyle = '#3e2212';
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * 95, cy + Math.sin(a) * 95, 28, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#6b381d';
      ctx.beginPath();
      ctx.arc(cx, cy, 78, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#291409';
      ctx.stroke();
    });

    this.drawNoise(ctx, w, h, 0.03);
  },

  drawForestMap(ctx, w, h) {
    const grad = ctx.createRadialGradient(w / 2, h / 2, 100, w / 2, h / 2, w * 0.75);
    grad.addColorStop(0, '#365314');
    grad.addColorStop(1, '#1a2e05');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(77, 124, 15, 0.25)' : 'rgba(20, 83, 45, 0.25)';
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, 30 + Math.random() * 90, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#5c4028';
    ctx.lineWidth = 220;
    ctx.beginPath();
    ctx.moveTo(0, 1100);
    ctx.bezierCurveTo(650, 950, 1200, 1300, w, 900);
    ctx.stroke();

    ctx.strokeStyle = '#785538';
    ctx.lineWidth = 160;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = '#0369a1';
    ctx.lineWidth = 170;
    ctx.beginPath();
    ctx.moveTo(1400, 0);
    ctx.bezierCurveTo(1200, 700, 1600, 1400, 1250, h);
    ctx.stroke();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 90;
    ctx.globalAlpha = 0.45;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(1410, 1030);
    ctx.rotate(-0.12);
    ctx.fillStyle = '#5c3419';
    ctx.fillRect(-150, -120, 300, 240);
    ctx.strokeStyle = '#2b1608';
    ctx.lineWidth = 5;
    for (let bx = -140; bx <= 140; bx += 28) {
      ctx.strokeRect(bx, -115, 24, 230);
    }
    ctx.restore();

    const trees = [
      [260, 300, 140], [580, 240, 110], [920, 320, 130],
      [250, 1650, 150], [650, 1700, 130], [1800, 380, 145],
      [1780, 1580, 155], [420, 680, 95]
    ];
    trees.forEach(([x, y, r]) => {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(x + 25, y + 25, r, 0, Math.PI * 2);
      ctx.fill();

      const tGrad = ctx.createRadialGradient(x - 20, y - 20, r * 0.1, x, y, r);
      tGrad.addColorStop(0, '#4d7c0f');
      tGrad.addColorStop(0.7, '#15803d');
      tGrad.addColorStop(1, '#14532d');
      ctx.fillStyle = tGrad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });

    this.drawNoise(ctx, w, h, 0.03);
  },

  drawArcaneArenaMap(ctx, w, h) {
    const bg = ctx.createRadialGradient(w / 2, h / 2, 100, w / 2, h / 2, w * 0.7);
    bg.addColorStop(0, '#1e1b4b');
    bg.addColorStop(0.6, '#0f172a');
    bg.addColorStop(1, '#020617');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2;
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(cx, cy, 740, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(cx, cy, 690, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 8;
    [620, 480, 260].forEach(radius => {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    });

    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 6;
    for (let i = 0; i < 8; i++) {
      const a1 = (i * Math.PI) / 4;
      const a2 = ((i + 3) * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a1) * 620, cy + Math.sin(a1) * 620);
      ctx.lineTo(cx + Math.cos(a2) * 620, cy + Math.sin(a2) * 620);
      ctx.stroke();
    }

    ctx.fillStyle = '#334155';
    ctx.fillRect(cx - 120, 0, 240, 320);
    ctx.fillRect(cx - 120, h - 320, 240, 320);
    ctx.fillRect(0, cy - 120, 320, 240);
    ctx.fillRect(w - 320, cy - 120, 320, 240);

    this.drawNoise(ctx, w, h, 0.025);
  },

  drawCityMap(ctx, w, h) {
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, 0, w, h);

    const stone = 32;
    for (let y = 0; y < h; y += stone) {
      for (let x = 0; x < w; x += stone) {
        const v = 65 + Math.floor(Math.random() * 26);
        ctx.fillStyle = `rgb(${v}, ${v + 4}, ${v + 8})`;
        ctx.fillRect(x + 2, y + 2, stone - 4, stone - 4);
      }
    }

    const cx = w / 2, cy = h / 2;
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(cx, cy, 190, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.arc(cx, cy, 150, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(cx, cy, 45, 0, Math.PI * 2);
    ctx.fill();

    const roofs = [
      { x: 80, y: 80, w: 620, h: 420, c: '#991b1b' },
      { x: 1340, y: 80, w: 620, h: 420, c: '#9a3412' },
      { x: 80, y: 1540, w: 620, h: 420, c: '#1e3a8a' },
      { x: 1340, y: 1540, w: 620, h: 420, c: '#7c2d12' }
    ];
    roofs.forEach(r => {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(r.x + 20, r.y + 20, r.w, r.h);
      ctx.fillStyle = r.c;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 4;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.beginPath();
      ctx.moveTo(r.x, r.y + r.h / 2);
      ctx.lineTo(r.x + r.w, r.y + r.h / 2);
      ctx.stroke();
    });

    this.drawNoise(ctx, w, h, 0.03);
  },

  drawParchmentMap(ctx, w, h) {
    const grad = ctx.createRadialGradient(w / 2, h / 2, 100, w / 2, h / 2, w * 0.75);
    grad.addColorStop(0, '#e6d5b8');
    grad.addColorStop(0.7, '#d2b48c');
    grad.addColorStop(1, '#a68256');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w - 220, 220);
    ctx.strokeStyle = 'rgba(92, 64, 51, 0.45)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 110, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -135); ctx.lineTo(0, 135);
    ctx.moveTo(-135, 0); ctx.lineTo(135, 0);
    ctx.stroke();
    ctx.restore();

    this.drawNoise(ctx, w, h, 0.045);
  },

  drawGridOverlay(canvas, config, tableWidthUnits, tableDepthUnits) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (config.type === 'none' || config.opacity <= 0) return;

    ctx.save();
    ctx.strokeStyle = config.color || '#ffffff';
    ctx.globalAlpha = config.opacity;
    ctx.lineWidth = config.lineWidth || 2;

    const cellPxX = w / (tableWidthUnits / config.cellSize);
    const cellPxY = h / (tableDepthUnits / config.cellSize);
    const offsetX = ((config.offsetX || 0) % cellPxX);
    const offsetY = ((config.offsetY || 0) % cellPxY);

    if (config.type === 'square') {
      ctx.beginPath();
      for (let x = offsetX; x <= w; x += cellPxX) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = offsetY; y <= h; y += cellPxY) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      if (config.showCoords) {
        ctx.fillStyle = config.color || '#ffffff';
        ctx.font = 'bold 18px Segoe UI, sans-serif';
        let col = 1;
        for (let x = offsetX; x < w - 10; x += cellPxX) {
          ctx.fillText(String(col++), x + 8, 24);
        }
        let row = 0;
        for (let y = offsetY; y < h - 10; y += cellPxY) {
          const letter = String.fromCharCode(65 + (row % 26));
          ctx.fillText(letter, 8, y + 26);
          row++;
        }
      }
    } else if (config.type === 'hex') {
      const rX = cellPxX / Math.sqrt(3);
      const rY = cellPxY / Math.sqrt(3);
      const hexW = Math.sqrt(3) * rX;
      const vertDist = 1.5 * rY;

      ctx.beginPath();
      const rows = Math.ceil(h / vertDist) + 2;
      const cols = Math.ceil(w / hexW) + 2;

      for (let row = -1; row < rows; row++) {
        for (let col = -1; col < cols; col++) {
          const cx = offsetX + col * hexW + (row % 2 !== 0 ? hexW / 2 : 0);
          const cy = offsetY + row * vertDist;
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 180) * (60 * i - 30);
            const vx = cx + rX * Math.cos(angle);
            const vy = cy + rY * Math.sin(angle);
            if (i === 0) ctx.moveTo(vx, vy);
            else ctx.lineTo(vx, vy);
          }
          ctx.closePath();
        }
      }
      ctx.stroke();
    }

    ctx.restore();
  },

  snapWorldPosition(x, z, config, tableWidthUnits, tableDepthUnits) {
    if (!config.snap || config.type === 'none') {
      return { x, z };
    }
    const s = config.cellSize || 2;
    const halfW = tableWidthUnits / 2;
    const halfD = tableDepthUnits / 2;

    const offX = ((config.offsetX || 0) / 2048) * tableWidthUnits;
    const offZ = ((config.offsetY || 0) / 2048) * tableDepthUnits;

    const localX = x + halfW - offX;
    const localZ = z + halfD - offZ;

    if (config.type === 'square') {
      const snappedLocalX = (Math.floor(localX / s) + 0.5) * s;
      const snappedLocalZ = (Math.floor(localZ / s) + 0.5) * s;
      return {
        x: snappedLocalX - halfW + offX,
        z: snappedLocalZ - halfD + offZ
      };
    } else if (config.type === 'hex') {
      const hexW = s;
      const r = hexW / Math.sqrt(3);
      const vertDist = 1.5 * r;
      const row = Math.round(localZ / vertDist);
      const rowOffset = (Math.abs(row) % 2 === 1) ? hexW / 2 : 0;
      const col = Math.round((localX - rowOffset) / hexW);
      return {
        x: (col * hexW + rowOffset) - halfW + offX,
        z: (row * vertDist) - halfD + offZ
      };
    }
    return { x, z };
  }
};

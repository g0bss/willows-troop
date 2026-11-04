// ============================================================================
// WILLOW'S TROOP - TRUE 3D POLYHEDRAL RPG DICE ENGINE
// Features:
// - Authentic 3D geometries for d4, d6, d8, d10 (Pentagonal Trapezohedron), d12, d20, d100
// - Distinct numbers (1..N) planar-mapped onto EVERY individual polygon face
// - Automatic physical alignment so the rolled result face lands on top (+Y)
// - Interactive grab, drag, toss/re-roll (R), delete (Del), and custom player color
// ============================================================================

window.DiceRoller3D = {
  activeDice: [],
  scene: null,
  onRollComplete: null,
  myDiceColor: localStorage.getItem('willow_dice_color') || '#b91c1c',
  geometryCache: new Map(), // sides -> { geo, faceNormals, faceValues }
  atlasCache: new Map(),    // `${sides}_${color}` -> THREE.CanvasTexture

  init(scene, onRollComplete) {
    this.scene = scene;
    this.onRollComplete = onRollComplete;
  },

  setDiceColor(hexColor) {
    this.myDiceColor = hexColor;
    try {
      localStorage.setItem('willow_dice_color', hexColor);
    } catch (e) {}
    if (window.Effects3D && window.Effects3D.setLaserColor) {
      window.Effects3D.setLaserColor(hexColor);
    }
  },

  // Creates an authentic 10-sided Pentagonal Trapezohedron geometry (for d10 and d100)
  createD10Geometry(radius = 1.0) {
    const H = radius * 1.05;
    const cos36 = Math.cos(Math.PI / 5);
    // Exact coplanarity height for kite faces
    const h = H * ((1 - cos36) / (1 + cos36));
    const R = radius * 1.02;

    const topPole = [0, H, 0];
    const botPole = [0, -H, 0];
    const upper = [];
    const lower = [];

    for (let k = 0; k < 5; k++) {
      const aU = (k * 2 * Math.PI) / 5;
      upper.push([R * Math.cos(aU), h, R * Math.sin(aU)]);

      const aL = ((k + 0.5) * 2 * Math.PI) / 5;
      lower.push([R * Math.cos(aL), -h, R * Math.sin(aL)]);
    }

    const positions = [];
    const pushTri = (a, b, c) => {
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    };

    // 5 Upper Kites + 5 Lower Kites (each kite = 2 coplanar triangles with outward CCW winding)
    for (let k = 0; k < 5; k++) {
      const next = (k + 1) % 5;
      const prev = (k + 4) % 5;

      // Upper kite k: topPole -> upper[next] -> lower[k] -> upper[k]
      pushTri(topPole, upper[next], lower[k]);
      pushTri(topPole, lower[k], upper[k]);

      // Lower kite k: botPole -> lower[prev] -> upper[k] -> lower[k]
      pushTri(botPole, lower[prev], upper[k]);
      pushTri(botPole, upper[k], lower[k]);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  },

  // Builds or retrieves cached UV-mapped polyhedron geometry with per-face normals & labels
  getPolyhedronData(sides) {
    const numSides = Number(sides) || 20;
    if (this.geometryCache.has(numSides)) {
      return this.geometryCache.get(numSides);
    }

    const size = 0.88;
    let rawGeo;
    switch (numSides) {
      case 4:
        rawGeo = new THREE.TetrahedronGeometry(size * 1.24, 0);
        break;
      case 6:
        rawGeo = new THREE.BoxGeometry(size * 1.14, size * 1.14, size * 1.14);
        break;
      case 8:
        rawGeo = new THREE.OctahedronGeometry(size * 1.16, 0);
        break;
      case 10:
      case 100:
        rawGeo = this.createD10Geometry(size * 1.06);
        break;
      case 12:
        rawGeo = new THREE.DodecahedronGeometry(size * 1.12, 0);
        break;
      case 20:
      default:
        rawGeo = new THREE.IcosahedronGeometry(size * 1.16, 0);
        break;
    }

    const geo = rawGeo.index ? rawGeo.toNonIndexed() : rawGeo.clone();
    geo.computeVertexNormals();

    const posAttr = geo.attributes.position;
    const triCount = posAttr.count / 3;

    // Group coplanar triangles into polygon faces by outward unit normal
    const faceGroups = [];
    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    const triNormal = new THREE.Vector3();

    for (let t = 0; t < triCount; t++) {
      const i0 = t * 3;
      vA.fromBufferAttribute(posAttr, i0);
      vB.fromBufferAttribute(posAttr, i0 + 1);
      vC.fromBufferAttribute(posAttr, i0 + 2);

      e1.subVectors(vB, vA);
      e2.subVectors(vC, vA);
      triNormal.crossVectors(e1, e2).normalize();

      // Ensure normal points outward from origin
      const mid = new THREE.Vector3().add(vA).add(vB).add(vC).multiplyScalar(1 / 3);
      if (triNormal.dot(mid) < 0) {
        triNormal.negate();
      }

      // Find existing face group with matching normal (dot > 0.96)
      let group = faceGroups.find(g => g.normal.dot(triNormal) > 0.96);
      if (!group) {
        group = {
          normal: triNormal.clone(),
          triIndices: [],
          vertices: []
        };
        faceGroups.push(group);
      }
      group.triIndices.push(t);
      group.vertices.push(vA.clone(), vB.clone(), vC.clone());
    }

    const numFaces = faceGroups.length;
    const cols = 5;
    const rows = Math.ceil(numFaces / cols);

    const uvs = new Float32Array(posAttr.count * 2);
    const faceNormals = new Map(); // faceValue -> THREE.Vector3
    const facePolygons = [];       // normalized 2D polygon outlines for each cell

    // Standard face values (1..N, or 10..100 for d100)
    const faceValues = [];
    for (let f = 0; f < numFaces; f++) {
      if (numSides === 100) {
        faceValues.push((f + 1) * 10);
      } else {
        faceValues.push(f + 1);
      }
    }

    faceGroups.forEach((group, fIdx) => {
      const n = group.normal.clone().normalize();
      const val = faceValues[fIdx];
      faceNormals.set(val, n);

      // Deduplicate boundary vertices of this face to compute exact centroid
      const uniquePts = [];
      group.vertices.forEach(pt => {
        if (!uniquePts.some(u => u.distanceToSquared(pt) < 0.0001)) {
          uniquePts.push(pt);
        }
      });

      const center = new THREE.Vector3();
      uniquePts.forEach(pt => center.add(pt));
      center.multiplyScalar(1 / uniquePts.length);

      // Build tangent basis (uAxis, vAxis) on the face plane
      const firstVec = new THREE.Vector3().subVectors(uniquePts[0], center);
      const vAxis = firstVec.addScaledVector(n, -firstVec.dot(n)).normalize();
      const uAxis = new THREE.Vector3().crossVectors(vAxis, n).normalize();

      let maxR = 0.001;
      const projPts = uniquePts.map(pt => {
        const rel = new THREE.Vector3().subVectors(pt, center);
        const px = rel.dot(uAxis);
        const py = rel.dot(vAxis);
        const r = Math.hypot(px, py);
        if (r > maxR) maxR = r;
        return { x: px, y: py, angle: Math.atan2(py, px) };
      });
      projPts.sort((a, b) => a.angle - b.angle);
      facePolygons.push(projPts.map(p => ({ x: p.x / maxR, y: p.y / maxR })));

      const col = fIdx % cols;
      const row = Math.floor(fIdx / cols);

      // Assign planar UVs for every triangle vertex in this face
      group.triIndices.forEach(t => {
        for (let k = 0; k < 3; k++) {
          const vIdx = t * 3 + k;
          const pt = new THREE.Vector3().fromBufferAttribute(posAttr, vIdx);
          const rel = pt.sub(center);
          const nx = rel.dot(uAxis) / maxR; // in [-1, 1]
          const ny = rel.dot(vAxis) / maxR; // in [-1, 1]

          const u = (col + 0.5 + nx * 0.42) / cols;
          const v = 1.0 - (row + 0.5 - ny * 0.42) / rows;

          uvs[vIdx * 2] = u;
          uvs[vIdx * 2 + 1] = v;
        }
      });
    });

    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    const data = {
      geo,
      numFaces,
      cols,
      rows,
      faceValues,
      faceNormals,
      facePolygons
    };
    this.geometryCache.set(numSides, data);
    return data;
  },

  // Helper to lighten/darken a hex color for faceted 3D shading
  shadeHexColor(hex, percent) {
    let c = String(hex || '#b91c1c').replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    const num = parseInt(c, 16) || 0xb91c1c;
    const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + percent));
    const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + percent));
    const b = Math.max(0, Math.min(255, (num & 0xff) + percent));
    return `rgb(${r},${g},${b})`;
  },

  // Creates a multi-face Texture Atlas where every face cell (1..N) has its own number & engraved bevel
  getOrCreateAtlasTexture(sides, diceColor) {
    const numSides = Number(sides) || 20;
    const baseColor = diceColor || this.myDiceColor || '#b91c1c';
    const key = `${numSides}_${baseColor}`;
    if (this.atlasCache.has(key)) {
      return this.atlasCache.get(key);
    }

    const polyData = this.getPolyhedronData(numSides);
    const { numFaces, cols, rows, faceValues, facePolygons } = polyData;
    const cellPx = 256;

    const canvas = document.createElement('canvas');
    canvas.width = cols * cellPx;
    canvas.height = rows * cellPx;
    const ctx = canvas.getContext('2d');

    const lightColor = this.shadeHexColor(baseColor, 38);
    const midColor = this.shadeHexColor(baseColor, 0);
    const darkColor = this.shadeHexColor(baseColor, -55);

    // Fill background with base color so seams never show black
    ctx.fillStyle = darkColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let f = 0; f < numFaces; f++) {
      const col = f % cols;
      const row = Math.floor(f / cols);
      const cx = (col + 0.5) * cellPx;
      const cy = (row + 0.5) * cellPx;
      const rPx = cellPx * 0.42;

      // 1. Radial gem/resin gradient inside each face cell
      const grad = ctx.createRadialGradient(cx - rPx * 0.18, cy - rPx * 0.18, rPx * 0.05, cx, cy, rPx * 1.15);
      grad.addColorStop(0, lightColor);
      grad.addColorStop(0.55, midColor);
      grad.addColorStop(1, darkColor);
      ctx.fillStyle = grad;
      ctx.fillRect(col * cellPx, row * cellPx, cellPx, cellPx);

      // 2. Engraved polygon bevel border matching the exact face shape
      const poly = facePolygons[f];
      if (poly && poly.length >= 3) {
        ctx.save();
        ctx.beginPath();
        poly.forEach((pt, idx) => {
          const px = cx + pt.x * rPx * 0.86;
          const py = cy - pt.y * rPx * 0.86;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255, 248, 220, 0.32)';
        ctx.lineWidth = 4.5;
        ctx.stroke();
        ctx.restore();
      }

      // 3. Crisp engraved number for this specific face
      const val = faceValues[f];
      let label = String(val);
      if (numSides === 100 && val === 100) label = '00';

      ctx.save();
      const fontSize = numSides === 20 ? 74 : (numSides === 12 || numSides === 10 || numSides === 100 ? 80 : 92);
      ctx.font = `800 ${fontSize}px "Cinzel", "Segoe UI", Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Deep shadow for readability on any color
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 7;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;

      // Gold rimmed white numerals
      ctx.strokeStyle = 'rgba(15, 20, 28, 0.85)';
      ctx.lineWidth = 6;
      ctx.strokeText(label, cx, cy + 2);

      ctx.fillStyle = '#fffbeb';
      ctx.fillText(label, cx, cy + 2);

      // Underline dot for 6 and 9 on multi-sided dice
      if ((val === 6 || val === 9) && numSides >= 8) {
        ctx.beginPath();
        ctx.arc(cx + fontSize * 0.34, cy + fontSize * 0.28, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fde68a';
        ctx.fill();
      }
      ctx.restore();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    this.atlasCache.set(key, tex);
    return tex;
  },

  // Computes the target quaternion that rotates the face with `resultValue` to point straight up (+Y)
  getTargetQuaternionForValue(sides, resultValue) {
    const numSides = Number(sides) || 20;
    const polyData = this.getPolyhedronData(numSides);
    let targetVal = Number(resultValue) || 1;
    if (numSides === 100) {
      targetVal = Math.max(10, Math.min(100, Math.ceil(targetVal / 10) * 10));
    }

    const faceNormal = polyData.faceNormals.get(targetVal) || polyData.faceNormals.values().next().value || new THREE.Vector3(0, 1, 0);
    const upVec = new THREE.Vector3(0, 1, 0);

    const alignQuat = new THREE.Quaternion().setFromUnitVectors(faceNormal.clone().normalize(), upVec);
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(upVec, Math.random() * Math.PI * 2);
    return yawQuat.multiply(alignQuat);
  },

  buildDieMesh(dieId, sides, resultValue, diceColor) {
    const numSides = Number(sides) || 20;
    const color = diceColor || this.myDiceColor || '#b91c1c';
    const polyData = this.getPolyhedronData(numSides);
    const tex = this.getOrCreateAtlasTexture(numSides, color);

    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.24,
      metalness: 0.16
    });

    const mesh = new THREE.Mesh(polyData.geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.dieId = dieId;

    // Subtle metallic chamfered edge lines (threshold 18 deg so coplanar kite triangles have no seam!)
    const edges = new THREE.EdgesGeometry(polyData.geo, 18);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xfde68a,
      transparent: true,
      opacity: 0.42
    });
    const wire = new THREE.LineSegments(edges, lineMat);
    mesh.add(wire);

    return mesh;
  },

  updateDieResultVisual(dieObj, newValue) {
    dieObj.value = newValue;
    dieObj.targetQuat = this.getTargetQuaternionForValue(dieObj.sides, newValue);
    if (dieObj.badgeEl) {
      dieObj.badgeEl.innerHTML = `<span style="opacity:0.75;font-size:9px;">d${dieObj.sides}</span> <strong>${newValue}</strong>`;
    }
  },

  throwDice(rollData, broadcastCallback) {
    const sides = Number(rollData.sides) || 20;
    const count = Number(rollData.count) || 1;
    const results = rollData.results || Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    const playerName = rollData.playerName || 'Jogador';
    const diceColor = rollData.diceColor || this.myDiceColor || '#b91c1c';
    const rollMode = rollData.mode || 'normal';
    const rollMod = Number(rollData.mod) || 0;

    const packet = {
      sides,
      count,
      results,
      playerName,
      diceColor,
      mode: rollMode,
      mod: rollMod,
      originX: rollData.originX !== undefined ? rollData.originX : (Math.random() - 0.5) * 6,
      originZ: rollData.originZ !== undefined ? rollData.originZ : 8
    };

    if (broadcastCallback) {
      broadcastCallback(packet);
    }

    if (window.SoundEngine) {
      window.SoundEngine.playDiceShake();
    }

    while (this.activeDice.length > 18) {
      const oldest = this.activeDice.shift();
      this.destroyDieObject(oldest);
    }

    let settledCount = 0;

    results.forEach((val, idx) => {
      const dieId = 'die_' + Date.now() + '_' + idx + '_' + Math.floor(Math.random() * 999);
      const mesh = this.buildDieMesh(dieId, sides, val, diceColor);
      const startX = packet.originX + (idx - (count - 1) / 2) * 1.85;
      const startZ = packet.originZ + (Math.random() - 0.5) * 1.2;
      const startY = 5.2 + idx * 0.5;

      mesh.position.set(startX, startY, startZ);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.scene.add(mesh);

      const badgeEl = document.createElement('div');
      badgeEl.className = 'die-settled-badge';
      badgeEl.style.borderColor = diceColor;
      badgeEl.style.display = 'none';
      badgeEl.innerHTML = `<span style="opacity:0.75;font-size:9px;">d${sides}</span> <strong>${val}</strong>`;
      document.getElementById('labels-container').appendChild(badgeEl);

      const vx = (-startX * 0.06) + (Math.random() - 0.5) * 0.16;
      const vz = (-startZ * 0.08) + (Math.random() - 0.5) * 0.16;
      const vy = -0.05;
      const targetQuat = this.getTargetQuaternionForValue(sides, val);

      const dieObj = {
        id: dieId,
        mesh,
        badgeEl,
        sides,
        value: val,
        diceColor,
        playerName,
        targetQuat,
        vx,
        vy,
        vz,
        rx: (Math.random() - 0.5) * 0.45,
        ry: (Math.random() - 0.5) * 0.45,
        rz: (Math.random() - 0.5) * 0.45,
        settled: false,
        grabbed: false,
        age: 0,
        onSettled: () => {
          settledCount++;
          if (window.App && window.App.spawnDicePopup) {
            window.App.spawnDicePopup(mesh.position.clone(), dieObj.value, sides);
          }
          if (settledCount === results.length && this.onRollComplete) {
            this.onRollComplete({
              sides,
              count,
              results,
              total: results.reduce((a, b) => a + b, 0),
              playerName,
              diceColor,
              mode: rollMode,
              mod: rollMod
            });
          }
        }
      };

      this.activeDice.push(dieObj);
    });
  },

  tossSingleDie(dieId, targetX, targetZ, vx = 0, vz = 0) {
    const dieObj = this.activeDice.find(d => d.id === dieId);
    if (!dieObj) return;

    const newVal = Math.floor(Math.random() * dieObj.sides) + 1;
    this.updateDieResultVisual(dieObj, newVal);

    if (window.SoundEngine) {
      window.SoundEngine.playDiceImpact(0.7);
    }

    dieObj.mesh.position.set(targetX, 2.6, targetZ);
    dieObj.vx = Math.max(-0.35, Math.min(0.35, vx + (Math.random() - 0.5) * 0.12));
    dieObj.vz = Math.max(-0.35, Math.min(0.35, vz + (Math.random() - 0.5) * 0.12));
    dieObj.vy = 0.08;
    dieObj.rx = (Math.random() - 0.5) * 0.48;
    dieObj.ry = (Math.random() - 0.5) * 0.48;
    dieObj.rz = (Math.random() - 0.5) * 0.48;
    dieObj.settled = false;
    dieObj.grabbed = false;
    dieObj.age = 0;
    dieObj.onSettled = () => {
      if (window.App && window.App.spawnDicePopup) {
        window.App.spawnDicePopup(dieObj.mesh.position.clone(), dieObj.value, dieObj.sides);
      }
      if (this.onRollComplete) {
        this.onRollComplete({
          sides: dieObj.sides,
          count: 1,
          results: [dieObj.value],
          total: dieObj.value,
          playerName: window.Multiplayer?.myName || dieObj.playerName,
          diceColor: dieObj.diceColor
        });
      }
    };
  },

  removeDie(dieId, broadcast = true) {
    const idx = this.activeDice.findIndex(d => d.id === dieId);
    if (idx === -1) return;
    const dieObj = this.activeDice[idx];
    this.destroyDieObject(dieObj);
    this.activeDice.splice(idx, 1);

    if (broadcast && window.Multiplayer) {
      window.Multiplayer.broadcast({ type: 'dice_clear' });
    }
  },

  destroyDieObject(dieObj) {
    if (!dieObj) return;
    if (dieObj.mesh && this.scene) {
      this.scene.remove(dieObj.mesh);
    }
    if (dieObj.badgeEl) {
      dieObj.badgeEl.remove();
    }
  },

  clearDice(broadcast = true) {
    this.activeDice.forEach(d => this.destroyDieObject(d));
    this.activeDice = [];
    if (broadcast && window.Multiplayer) {
      window.Multiplayer.broadcast({ type: 'dice_clear' });
    }
  },

  update(dt, tableHalfW = 18, tableHalfD = 18) {
    const floorY = 0.65;
    this.activeDice.forEach(d => {
      if (d.grabbed) {
        if (d.badgeEl) d.badgeEl.style.display = 'none';
        return;
      }

      if (!d.settled) {
        d.age += dt;
        d.vy -= 0.018;
        d.mesh.position.x += d.vx;
        d.mesh.position.y += d.vy;
        d.mesh.position.z += d.vz;

        const rotSpeed = Math.abs(d.rx) + Math.abs(d.ry) + Math.abs(d.rz);
        if (rotSpeed > 0.08 && d.age < 1.2) {
          d.mesh.rotation.x += d.rx;
          d.mesh.rotation.y += d.ry;
          d.mesh.rotation.z += d.rz;
        } else if (d.targetQuat) {
          // Smoothly align the winning face toward the top (+Y) as the die settles on the table
          d.mesh.quaternion.slerp(d.targetQuat, 0.18);
        }

        if (d.mesh.position.y < floorY) {
          const impactSpeed = Math.abs(d.vy);
          if (impactSpeed > 0.05 && window.SoundEngine) {
            window.SoundEngine.playDiceImpact(impactSpeed * 3);
          }
          d.mesh.position.y = floorY;
          d.vy = -d.vy * 0.54;
          d.vx *= 0.78;
          d.vz *= 0.78;
          d.rx *= 0.72;
          d.ry *= 0.72;
          d.rz *= 0.72;
        }

        const margin = 1.2;
        if (Math.abs(d.mesh.position.x) > tableHalfW - margin) {
          d.mesh.position.x = Math.sign(d.mesh.position.x) * (tableHalfW - margin);
          d.vx = -d.vx * 0.7;
          if (Math.abs(d.vx) > 0.06 && window.SoundEngine) {
            window.SoundEngine.playDiceImpact(0.4);
          }
        }
        if (Math.abs(d.mesh.position.z) > tableHalfD - margin) {
          d.mesh.position.z = Math.sign(d.mesh.position.z) * (tableHalfD - margin);
          d.vz = -d.vz * 0.7;
          if (Math.abs(d.vz) > 0.06 && window.SoundEngine) {
            window.SoundEngine.playDiceImpact(0.4);
          }
        }

        const speed = Math.abs(d.vx) + Math.abs(d.vy) + Math.abs(d.vz);
        if ((d.mesh.position.y <= floorY + 0.04 && speed < 0.015) || d.age > 2.2) {
          d.mesh.position.y = floorY;
          if (d.targetQuat) {
            d.mesh.quaternion.copy(d.targetQuat);
          }
          d.settled = true;
          if (d.onSettled) {
            const fn = d.onSettled;
            d.onSettled = null;
            fn();
          }
        }
      }

      if (d.settled && d.badgeEl && window.App) {
        const topPos = d.mesh.position.clone().add(new THREE.Vector3(0, 1.08, 0));
        const screen = window.App.worldToScreen(topPos);
        if (screen.visible) {
          d.badgeEl.style.display = 'flex';
          d.badgeEl.style.left = `${screen.x}px`;
          d.badgeEl.style.top = `${screen.y}px`;
        } else {
          d.badgeEl.style.display = 'none';
        }
      }
    });
  }
};

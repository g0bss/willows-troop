// ============================================================================
// WILLOW'S TROOP - INTERACTIVE 3D POLYHEDRAL DICE (Move, Re-roll, Delete, Custom Color)
// ============================================================================

window.DiceRoller3D = {
  activeDice: [], // Array of die objects
  scene: null,
  onRollComplete: null,
  myDiceColor: localStorage.getItem('willow_dice_color') || '#b91c1c',

  init(scene, onRollComplete) {
    this.scene = scene;
    this.onRollComplete = onRollComplete;
  },

  setDiceColor(hexColor) {
    this.myDiceColor = hexColor;
    try {
      localStorage.setItem('willow_dice_color', hexColor);
    } catch (e) {}
  },

  createFaceTexture(text, bgColor, textColor = '#ffffff') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(128, 128, 16, 128, 128, 165);
    grad.addColorStop(0, bgColor || '#b91c1c');
    grad.addColorStop(1, '#11161d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, 240, 240);

    ctx.fillStyle = textColor;
    ctx.font = '800 108px Inter, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 8;
    ctx.fillText(String(text), 128, 132);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  },

  buildDieMesh(dieId, sides, resultValue, diceColor) {
    const size = 0.85;
    let geo;
    switch (Number(sides)) {
      case 4:
        geo = new THREE.TetrahedronGeometry(size * 1.18);
        break;
      case 6:
        geo = new THREE.BoxGeometry(size * 1.12, size * 1.12, size * 1.12);
        break;
      case 8:
        geo = new THREE.OctahedronGeometry(size * 1.08);
        break;
      case 10:
      case 100:
        geo = new THREE.DodecahedronGeometry(size * 1.0);
        break;
      case 12:
        geo = new THREE.DodecahedronGeometry(size * 1.08);
        break;
      case 20:
      default:
        geo = new THREE.IcosahedronGeometry(size * 1.1);
        break;
    }

    const color = diceColor || this.myDiceColor || '#b91c1c';
    const tex = this.createFaceTexture(resultValue, color, '#ffffff');
    const mat = new THREE.MeshStandardMaterial({
      color: color,
      map: tex,
      roughness: 0.25,
      metalness: 0.2
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.dieId = dieId;

    const edges = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.48 });
    const wire = new THREE.LineSegments(edges, lineMat);
    mesh.add(wire);

    return mesh;
  },

  // Update the texture on an existing die when re-rolled
  updateDieResultVisual(dieObj, newValue) {
    dieObj.value = newValue;
    const newTex = this.createFaceTexture(newValue, dieObj.diceColor, '#ffffff');
    if (dieObj.mesh && dieObj.mesh.material) {
      dieObj.mesh.material.map = newTex;
      dieObj.mesh.material.needsUpdate = true;
    }
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

    const packet = {
      sides,
      count,
      results,
      playerName,
      diceColor,
      originX: rollData.originX !== undefined ? rollData.originX : (Math.random() - 0.5) * 6,
      originZ: rollData.originZ !== undefined ? rollData.originZ : 8
    };

    if (broadcastCallback) {
      broadcastCallback(packet);
    }

    while (this.activeDice.length > 18) {
      const oldest = this.activeDice.shift();
      this.destroyDieObject(oldest);
    }

    let settledCount = 0;

    results.forEach((val, idx) => {
      const dieId = 'die_' + Date.now() + '_' + idx + '_' + Math.floor(Math.random() * 999);
      const mesh = this.buildDieMesh(dieId, sides, val, diceColor);
      const startX = packet.originX + (idx - (count - 1) / 2) * 1.7;
      const startZ = packet.originZ + (Math.random() - 0.5) * 1.2;
      const startY = 5.2 + idx * 0.5;

      mesh.position.set(startX, startY, startZ);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.scene.add(mesh);

      // Create persistent floating badge for settled die so player can always read value & delete/reroll
      const badgeEl = document.createElement('div');
      badgeEl.className = 'die-settled-badge';
      badgeEl.style.borderColor = diceColor;
      badgeEl.style.display = 'none';
      badgeEl.innerHTML = `<span style="opacity:0.75;font-size:9px;">d${sides}</span> <strong>${val}</strong>`;
      document.getElementById('labels-container').appendChild(badgeEl);

      const vx = (-startX * 0.06) + (Math.random() - 0.5) * 0.16;
      const vz = (-startZ * 0.08) + (Math.random() - 0.5) * 0.16;
      const vy = -0.05;

      const dieObj = {
        id: dieId,
        mesh,
        badgeEl,
        sides,
        value: val,
        diceColor,
        playerName,
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
              diceColor
            });
          }
        }
      };

      this.activeDice.push(dieObj);
    });
  },

  // Re-rolls a single die that was dragged/tossed or had 'R' pressed on it
  tossSingleDie(dieId, targetX, targetZ, vx = 0, vz = 0) {
    const dieObj = this.activeDice.find(d => d.id === dieId);
    if (!dieObj) return;

    const newVal = Math.floor(Math.random() * dieObj.sides) + 1;
    this.updateDieResultVisual(dieObj, newVal);

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
    const floorY = 0.62;
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

        d.mesh.rotation.x += d.rx;
        d.mesh.rotation.y += d.ry;
        d.mesh.rotation.z += d.rz;

        if (d.mesh.position.y < floorY) {
          d.mesh.position.y = floorY;
          d.vy = -d.vy * 0.56;
          d.vx *= 0.80;
          d.vz *= 0.80;
          d.rx *= 0.76;
          d.ry *= 0.76;
          d.rz *= 0.76;
        }

        const margin = 1.2;
        if (Math.abs(d.mesh.position.x) > tableHalfW - margin) {
          d.mesh.position.x = Math.sign(d.mesh.position.x) * (tableHalfW - margin);
          d.vx = -d.vx * 0.7;
        }
        if (Math.abs(d.mesh.position.z) > tableHalfD - margin) {
          d.mesh.position.z = Math.sign(d.mesh.position.z) * (tableHalfD - margin);
          d.vz = -d.vz * 0.7;
        }

        const speed = Math.abs(d.vx) + Math.abs(d.vy) + Math.abs(d.vz);
        if ((d.mesh.position.y <= floorY + 0.04 && speed < 0.015) || d.age > 2.4) {
          d.mesh.position.y = floorY;
          d.settled = true;
          if (d.onSettled) {
            const fn = d.onSettled;
            d.onSettled = null;
            fn();
          }
        }
      }

      // Project floating value badge above settled die
      if (d.settled && d.badgeEl && window.App) {
        const topPos = d.mesh.position.clone().add(new THREE.Vector3(0, 1.05, 0));
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

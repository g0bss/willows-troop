// ============================================================================
// WILLOW'S TROOP - 3D LASER POINTER, AOE TEMPLATES & ATMOSPHERIC PARTICLES
// Authentic Tabletop Simulator style laser trail and immersive RPG spell templates
// ============================================================================

window.Effects3D = {
  scene: null,
  activeLaserTrails: new Map(), // playerId -> { points: [], lineMesh, dotMesh, color }
  aoeTemplate: {
    active: false,
    type: 'circle', // 'circle', 'cone', 'line'
    radiusMeters: 6, // 6m = 20ft
    coneAngleDeg: 60,
    color: '#ea580c', // fire orange
    mesh: null,
    borderMesh: null,
    position: new THREE.Vector3(0, 0.035, 0),
    rotationY: 0
  },
  weather: 'none', // 'embers', 'rain', 'snow', 'none'
  weatherParticles: null,
  weatherData: [],

  init(scene) {
    this.scene = scene;
    this.initWeatherParticles();
  },

  // ==========================================================================
  // 3D LASER POINTER (Tabletop Simulator Style)
  // ==========================================================================
  addLaserPoint(playerId, x, z, color = '#ef4444', isLocal = true) {
    if (!this.scene) return;
    const now = performance.now();

    let trail = this.activeLaserTrails.get(playerId);
    if (!trail) {
      const lineGeo = new THREE.BufferGeometry();
      const lineMat = new THREE.LineBasicMaterial({
        color: color || '#ef4444',
        linewidth: 3,
        transparent: true,
        opacity: 0.95
      });
      const lineMesh = new THREE.Line(lineGeo, lineMat);
      this.scene.add(lineMesh);

      const dotGeo = new THREE.SphereGeometry(0.22, 16, 16);
      const dotMat = new THREE.MeshBasicMaterial({
        color: color || '#ef4444',
        transparent: true,
        opacity: 0.95
      });
      const dotMesh = new THREE.Mesh(dotGeo, dotMat);
      this.scene.add(dotMesh);

      trail = { points: [], lineMesh, dotMesh, color };
      this.activeLaserTrails.set(playerId, trail);
    }

    trail.points.push({ x, z, time: now });
    trail.dotMesh.position.set(x, 0.12, z);
    trail.dotMesh.visible = true;

    if (isLocal && window.Multiplayer) {
      window.Multiplayer.broadcast({
        type: 'laser_point',
        x: Math.round(x * 100) / 100,
        z: Math.round(z * 100) / 100,
        color: window.Multiplayer.myColor
      });
    }
  },

  updateLaserTrails(now) {
    this.activeLaserTrails.forEach((trail, id) => {
      // Remove points older than 1.4 seconds
      while (trail.points.length > 0 && (now - trail.points[0].time > 1400)) {
        trail.points.shift();
      }

      if (trail.points.length < 2) {
        trail.lineMesh.visible = false;
        if (trail.points.length === 0) {
          trail.dotMesh.visible = false;
        }
        return;
      }

      trail.lineMesh.visible = true;
      const pts3D = trail.points.map(p => new THREE.Vector3(p.x, 0.08, p.z));
      trail.lineMesh.geometry.setFromPoints(pts3D);
    });
  },

  // ==========================================================================
  // AOE SPELL TEMPLATES (Circle, Cone, Line)
  // ==========================================================================
  setAoETemplate(type, radiusMeters = 6, color = '#ea580c', broadcast = true) {
    this.aoeTemplate.active = true;
    this.aoeTemplate.type = type || this.aoeTemplate.type;
    this.aoeTemplate.radiusMeters = Number(radiusMeters) || 6;
    this.aoeTemplate.color = color || this.aoeTemplate.color;
    this.rebuildAoEMesh();

    if (broadcast && window.Multiplayer) {
      window.Multiplayer.broadcast({
        type: 'aoe_template_update',
        state: {
          active: this.aoeTemplate.active,
          type: this.aoeTemplate.type,
          radiusMeters: this.aoeTemplate.radiusMeters,
          color: this.aoeTemplate.color,
          x: this.aoeTemplate.position.x,
          z: this.aoeTemplate.position.z,
          rotationY: this.aoeTemplate.rotationY
        }
      });
    }
  },

  rebuildAoEMesh() {
    if (!this.scene) return;
    if (this.aoeTemplate.mesh) {
      this.scene.remove(this.aoeTemplate.mesh);
      this.aoeTemplate.mesh = null;
    }
    if (this.aoeTemplate.borderMesh) {
      this.scene.remove(this.aoeTemplate.borderMesh);
      this.aoeTemplate.borderMesh = null;
    }
    if (!this.aoeTemplate.active) return;

    // 1 grid cell = 1.5 meters = cellSize in 3D units (default ~2.0 units)
    const cellSize = window.App?.mapConfig?.grid?.cellSize || 2.0;
    const radiusUnits = (this.aoeTemplate.radiusMeters / 1.5) * (cellSize / 2);

    const group = new THREE.Group();
    const borderGroup = new THREE.Group();
    const hexColor = new THREE.Color(this.aoeTemplate.color || '#ea580c');

    const fillMat = new THREE.MeshBasicMaterial({
      color: hexColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    });

    const borderMat = new THREE.LineBasicMaterial({
      color: hexColor,
      linewidth: 3,
      transparent: true,
      opacity: 0.95
    });

    if (this.aoeTemplate.type === 'circle') {
      const geo = new THREE.CircleGeometry(radiusUnits, 48);
      geo.rotateX(-Math.PI / 2);
      const fillMesh = new THREE.Mesh(geo, fillMat);
      group.add(fillMesh);

      const edgeGeo = new THREE.RingGeometry(radiusUnits - 0.12, radiusUnits + 0.05, 48);
      edgeGeo.rotateX(-Math.PI / 2);
      const edgeMesh = new THREE.Mesh(edgeGeo, new THREE.MeshBasicMaterial({ color: hexColor, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
      group.add(edgeMesh);
    } else if (this.aoeTemplate.type === 'cone') {
      const angle = (this.aoeTemplate.coneAngleDeg || 60) * (Math.PI / 180);
      const geo = new THREE.RingGeometry(0, radiusUnits * 1.5, 32, 1, -angle / 2, angle);
      geo.rotateX(-Math.PI / 2);
      const fillMesh = new THREE.Mesh(geo, fillMat);
      group.add(fillMesh);
    } else if (this.aoeTemplate.type === 'line') {
      const length = radiusUnits * 2.5;
      const width = cellSize;
      const geo = new THREE.PlaneGeometry(width, length);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0, length / 2);
      const fillMesh = new THREE.Mesh(geo, fillMat);
      group.add(fillMesh);
    }

    group.position.copy(this.aoeTemplate.position);
    group.rotation.y = this.aoeTemplate.rotationY;
    this.scene.add(group);
    this.aoeTemplate.mesh = group;
  },

  updateAoEPosition(x, z, broadcast = false) {
    if (!this.aoeTemplate.active || !this.aoeTemplate.mesh) return;
    this.aoeTemplate.position.set(x, 0.035, z);
    this.aoeTemplate.mesh.position.set(x, 0.035, z);

    if (broadcast && window.Multiplayer) {
      window.Multiplayer.broadcast({
        type: 'aoe_template_move',
        x: Math.round(x * 100) / 100,
        z: Math.round(z * 100) / 100,
        rotationY: this.aoeTemplate.rotationY
      });
    }
  },

  clearAoETemplate(broadcast = true) {
    this.aoeTemplate.active = false;
    if (this.aoeTemplate.mesh) {
      this.scene.remove(this.aoeTemplate.mesh);
      this.aoeTemplate.mesh = null;
    }
    if (broadcast && window.Multiplayer) {
      window.Multiplayer.broadcast({ type: 'aoe_template_clear' });
    }
  },

  // ==========================================================================
  // ATMOSPHERIC PARTICLES (Embers, Rain, Snow)
  // ==========================================================================
  initWeatherParticles() {
    if (!this.scene) return;
    const count = 180;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    this.weatherData = [];
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 44;
      const y = Math.random() * 20;
      const z = (Math.random() - 0.5) * 44;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 0.6;
      colors[i * 3 + 2] = 0.2;

      this.weatherData.push({
        vx: (Math.random() - 0.5) * 0.02,
        vy: -0.05,
        vz: (Math.random() - 0.5) * 0.02,
        seed: Math.random() * 100
      });
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.35,
      vertexColors: true,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });

    this.weatherParticles = new THREE.Points(geo, mat);
    this.scene.add(this.weatherParticles);
  },

  setWeather(type, broadcast = true) {
    this.weather = type || 'none';
    if (!this.weatherParticles) return;

    const mat = this.weatherParticles.material;
    const colors = this.weatherParticles.geometry.attributes.color.array;

    if (this.weather === 'none') {
      mat.opacity = 0.0;
    } else if (this.weather === 'embers') {
      mat.size = 0.42;
      mat.opacity = 0.85;
      for (let i = 0; i < colors.length / 3; i++) {
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.45 + Math.random() * 0.35;
        colors[i * 3 + 2] = 0.1;
      }
    } else if (this.weather === 'rain') {
      mat.size = 0.28;
      mat.opacity = 0.75;
      for (let i = 0; i < colors.length / 3; i++) {
        colors[i * 3] = 0.65;
        colors[i * 3 + 1] = 0.82;
        colors[i * 3 + 2] = 1.0;
      }
    } else if (this.weather === 'snow') {
      mat.size = 0.48;
      mat.opacity = 0.88;
      for (let i = 0; i < colors.length / 3; i++) {
        colors[i * 3] = 0.95;
        colors[i * 3 + 1] = 0.98;
        colors[i * 3 + 2] = 1.0;
      }
    }

    this.weatherParticles.geometry.attributes.color.needsUpdate = true;
    if (broadcast && window.Multiplayer?.isHost) {
      window.Multiplayer.broadcast({
        type: 'weather_sync',
        weather: this.weather
      });
    }
  },

  update(dt) {
    const now = performance.now();
    this.updateLaserTrails(now);

    // Animate Weather Particles
    if (this.weather !== 'none' && this.weatherParticles && this.weatherParticles.material.opacity > 0) {
      const pos = this.weatherParticles.geometry.attributes.position.array;
      const count = pos.length / 3;
      const t = now * 0.001;

      for (let i = 0; i < count; i++) {
        const d = this.weatherData[i];
        if (this.weather === 'embers') {
          // Embers float up from the tabletop
          pos[i * 3 + 1] += 0.06;
          pos[i * 3] += Math.sin(t * 2 + d.seed) * 0.02;
          pos[i * 3 + 2] += Math.cos(t * 1.5 + d.seed) * 0.02;
          if (pos[i * 3 + 1] > 18) {
            pos[i * 3 + 1] = 0.2;
            pos[i * 3] = (Math.random() - 0.5) * 36;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 36;
          }
        } else if (this.weather === 'rain') {
          // Rain falls fast diagonally
          pos[i * 3 + 1] -= 0.65;
          pos[i * 3] -= 0.08;
          if (pos[i * 3 + 1] < 0.1) {
            pos[i * 3 + 1] = 18;
          }
        } else if (this.weather === 'snow') {
          // Snow drifts gently downwards
          pos[i * 3 + 1] -= 0.045;
          pos[i * 3] += Math.sin(t + d.seed) * 0.03;
          pos[i * 3 + 2] += Math.cos(t * 0.8 + d.seed) * 0.03;
          if (pos[i * 3 + 1] < 0.1) {
            pos[i * 3 + 1] = 18;
          }
        }
      }
      this.weatherParticles.geometry.attributes.position.needsUpdate = true;
    }
  }
};

// ============================================================================
// WILLOW'S TROOP - 3D LASER POINTER, PINNABLE AOE TEMPLATES, 360° SKYBOX & FX
// Authentic Tabletop Simulator style laser trail, interactive pinnable/resizable
// spell AoE templates, real 360° panorama skybox environments, and particles
// ============================================================================

window.Effects3D = {
  scene: null,
  activeLaserTrails: new Map(), // playerId -> { points: [], lineMesh, dotMesh, glowMesh, color }
  myLaserColor: localStorage.getItem('willow_laser_color') || localStorage.getItem('willow_dice_color') || '#ef4444',

  // Live cursor preview AoE + Pinned AoEs on the map
  aoeTemplate: {
    active: false,
    type: 'circle', // 'circle', 'cone', 'line', 'cube'
    radiusMeters: 6, // 1.5m to 30m
    coneAngleDeg: 60,
    color: '#ea580c',
    mesh: null,
    position: new THREE.Vector3(0, 0.038, 0),
    rotationY: 0
  },
  placedAoEs: new Map(), // aoeId -> { id, type, radiusMeters, rotationY, color, x, z, mesh, labelEl }
  selectedAoEId: null,
  draggingAoEId: null,

  // 360° Panorama Skybox Environment (Tabletop Simulator style)
  skyboxMesh: null,
  currentSkybox: 'tavern',
  customSkyboxUrl: '',
  skyboxTextureCache: new Map(),

  // Real CC0 High-Res Equirectangular 360° Photography Panoramas (Poly Haven CDN with CORS)
  SKYBOX_PRESETS: {
    tavern: {
      name: 'Salão Medieval & Taverna (360°)',
      url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/medieval_cafe.jpg',
      fogColor: 0x1a120b,
      ambientTint: 0xffeedd
    },
    fireplace: {
      name: 'Cabana Aconchegante & Lareira (360°)',
      url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/fireplace.jpg',
      fogColor: 0x1c110a,
      ambientTint: 0xffe4c4
    },
    forest: {
      name: 'Floresta de Pinheiros & Neblina (360°)',
      url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/misty_pines.jpg',
      fogColor: 0x16201c,
      ambientTint: 0xe2f1e8
    },
    gothic: {
      name: 'Salão Gótico Antigo (360°)',
      url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/old_hall.jpg',
      fogColor: 0x17161a,
      ambientTint: 0xeae6df
    },
    sunset: {
      name: 'Montanhas ao Pôr do Sol (360°)',
      url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/kloppenheim_06.jpg',
      fogColor: 0x1f1619,
      ambientTint: 0xffdfc8
    },
    night: {
      name: 'Colinas sob o Luar (360°)',
      url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/moonless_golf.jpg',
      fogColor: 0x0b101b,
      ambientTint: 0xc7d8ff
    },
    custom: {
      name: 'Imagem Personalizada (URL / PC)',
      url: null,
      fogColor: 0x11151c,
      ambientTint: 0xffeedd
    },
    void: {
      name: 'Estúdio Escuro (Sem Cenário)',
      url: null,
      fogColor: 0x0b0e11,
      ambientTint: 0xffeedd
    }
  },

  weather: 'none', // 'embers', 'rain', 'snow', 'none'
  weatherParticles: null,
  weatherData: [],

  init(scene) {
    this.scene = scene;
    this.initSkyboxSphere();
    this.initWeatherParticles();

    // Sync initial laser color picker UI if present
    const laserPicker = document.getElementById('laser-color-picker');
    if (laserPicker && this.myLaserColor) {
      laserPicker.value = this.myLaserColor;
    }

    // Load default 360° panorama skybox so the table isn't floating in a black void
    const savedSky = localStorage.getItem('willow_skybox_env') || 'tavern';
    const savedCustomUrl = localStorage.getItem('willow_skybox_custom_url')
      || localStorage.getItem('willow_skybox_custom_data')
      || '';
    this.setSkybox(savedSky, savedCustomUrl, false);
  },

  // Redimensiona/comprime uma imagem 360° (equiretangular 2:1) para caber na rede e rodar leve.
  compressPanoramaDataUrl(dataUrl, maxBytesChars = 170000) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const srcW = img.naturalWidth || img.width;
        const srcH = img.naturalHeight || img.height;
        const ratio = srcW / Math.max(1, srcH);
        const attempts = [
          [2048, 0.72], [2048, 0.58], [1792, 0.55], [1536, 0.5], [1280, 0.45], [1024, 0.42]
        ];
        let best = null;
        for (const [w, q] of attempts) {
          const h = Math.round(w / 2);
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const ctx = c.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          best = c.toDataURL('image/jpeg', q);
          if (best.length <= maxBytesChars) break;
        }
        resolve({ url: best, ratio, fits: best.length <= maxBytesChars });
      };
      img.onerror = () => reject(new Error('Imagem inválida'));
      img.src = dataUrl;
    });
  },

  // Importa um arquivo de imagem 360° do computador e aplica como fundo (sincroniza com os jogadores)
  importPanoramaFile(file) {
    if (!file) return;
    if (window.Multiplayer && !window.Multiplayer.isHost && window.Multiplayer.roomCode) {
      window.App?.showToast('Só o Mestre pode trocar o cenário de fundo.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const result = await this.compressPanoramaDataUrl(e.target.result);
        this.setSkybox('custom', result.url, true);
        const note = Math.abs(result.ratio - 2) > 0.25
          ? ' Dica: imagens 360° ideais têm proporção 2:1; a sua foi ajustada.'
          : '';
        const sync = result.fits ? '' : ' (grande demais para sincronizar; só você verá)';
        window.App?.showToast(`Cenário 360° aplicado${sync}.${note}`);
      } catch (err) {
        window.App?.showToast('Não foi possível ler essa imagem.');
      }
    };
    reader.readAsDataURL(file);
  },

  // ==========================================================================
  // 360° SKYBOX PANORAMA ENVIRONMENT (Tabletop Simulator Style)
  // ==========================================================================
  initSkyboxSphere() {
    if (!this.scene) return;
    const geo = new THREE.SphereGeometry(195, 64, 32);
    // Flip X scale so equirectangular panorama texture wraps properly on inside of sphere
    geo.scale(-1, 1, 1);

    const fallbackTex = this.createFallbackPanoramaTexture();
    const mat = new THREE.MeshBasicMaterial({
      map: fallbackTex,
      side: THREE.FrontSide,
      fog: false,
      depthWrite: false
    });

    this.skyboxMesh = new THREE.Mesh(geo, mat);
    this.skyboxMesh.renderOrder = -10;
    this.skyboxMesh.name = 'skyboxPanoramaSphere';
    this.scene.add(this.skyboxMesh);
  },

  createFallbackPanoramaTexture() {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#090d16');
    grad.addColorStop(0.42, '#162032');
    grad.addColorStop(0.52, '#2a2122');
    grad.addColorStop(0.65, '#120e0c');
    grad.addColorStop(1.0, '#07080a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 512);

    const tex = new THREE.CanvasTexture(c);
    return tex;
  },

  setSkybox(envId = 'tavern', customUrl = '', broadcast = true) {
    if (!this.scene || !this.skyboxMesh) return;
    this.currentSkybox = envId || 'tavern';
    if (customUrl) {
      this.customSkyboxUrl = customUrl;
    }

    try {
      localStorage.setItem('willow_skybox_env', this.currentSkybox);
      if (this.customSkyboxUrl && !this.customSkyboxUrl.startsWith('data:')) {
        localStorage.setItem('willow_skybox_custom_url', this.customSkyboxUrl);
        localStorage.removeItem('willow_skybox_custom_data');
      } else if (this.customSkyboxUrl && this.customSkyboxUrl.length < 1500000) {
        localStorage.setItem('willow_skybox_custom_data', this.customSkyboxUrl);
      }
    } catch (e) {}

    // Update UI dropdowns if present
    const drawerSel = document.getElementById('skybox-select');
    if (drawerSel && drawerSel.value !== this.currentSkybox) drawerSel.value = this.currentSkybox;
    const lobbySel = document.getElementById('lobby-skybox-select');
    if (lobbySel && lobbySel.value !== this.currentSkybox) lobbySel.value = this.currentSkybox;
    const customRow = document.getElementById('skybox-custom-row');
    if (customRow) {
      customRow.style.display = this.currentSkybox === 'custom' ? 'flex' : 'none';
    }

    if (this.currentSkybox === 'void') {
      this.skyboxMesh.visible = false;
      this.scene.background = new THREE.Color(0x0b0e11);
      this.scene.fog = new THREE.FogExp2(0x0b0e11, 0.0065);
    } else {
      this.skyboxMesh.visible = true;
      const preset = this.SKYBOX_PRESETS[this.currentSkybox] || this.SKYBOX_PRESETS.tavern;
      this.scene.fog = new THREE.FogExp2(preset.fogColor || 0x141210, 0.0014);

      const targetUrl = this.currentSkybox === 'custom'
        ? (this.customSkyboxUrl || this.SKYBOX_PRESETS.tavern.url)
        : preset.url;

      if (targetUrl) {
        this.applySkyboxTextureFromUrl(targetUrl);
      }
    }

    if (broadcast && window.Multiplayer?.isHost) {
      window.Multiplayer.broadcast({
        type: 'skybox_sync',
        skybox: this.currentSkybox,
        customUrl: (this.currentSkybox === 'custom' && this.customSkyboxUrl && this.customSkyboxUrl.length < 180000)
          ? this.customSkyboxUrl
          : ''
      });
      if (window.Multiplayer.scheduleRetainedRoomPublish) {
        window.Multiplayer.scheduleRetainedRoomPublish();
      }
    }
  },

  applySkyboxTextureFromUrl(url) {
    if (!url || !this.skyboxMesh) return;
    if (this.skyboxTextureCache.has(url)) {
      const cached = this.skyboxTextureCache.get(url);
      this.skyboxMesh.material.map = cached;
      this.skyboxMesh.material.needsUpdate = true;
      return;
    }

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      url,
      (tex) => {
        if (window.App?.renderer) {
          tex.anisotropy = Math.min(8, window.App.renderer.capabilities.getMaxAnisotropy());
        }
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        this.skyboxTextureCache.set(url, tex);
        if (this.skyboxMesh) {
          this.skyboxMesh.material.map = tex;
          this.skyboxMesh.material.needsUpdate = true;
        }
      },
      undefined,
      () => {
        if (window.App?.showToast && this.currentSkybox === 'custom') {
          window.App.showToast('Não foi possível carregar essa URL de fundo (bloqueio CORS ou link inválido).');
        }
      }
    );
  },

  // ==========================================================================
  // 3D LASER POINTER (Editable Color + Synced with Dice Color)
  // ==========================================================================
  setLaserColor(hexColor) {
    if (!hexColor) return;
    this.myLaserColor = hexColor;
    try {
      localStorage.setItem('willow_laser_color', hexColor);
    } catch (e) {}
    const picker = document.getElementById('laser-color-picker');
    if (picker && picker.value !== hexColor) {
      picker.value = hexColor;
    }
    // Immediately update local player's active trail color if it exists
    if (window.Multiplayer?.myId && this.activeLaserTrails.has(window.Multiplayer.myId)) {
      const myTrail = this.activeLaserTrails.get(window.Multiplayer.myId);
      myTrail.color = hexColor;
      myTrail.lineMesh.material.color.set(hexColor);
      myTrail.dotMesh.material.color.set(hexColor);
      if (myTrail.glowMesh) myTrail.glowMesh.material.color.set(hexColor);
    }
  },

  addLaserPoint(playerId, x, z, color = null, isLocal = true) {
    if (!this.scene) return;
    const now = performance.now();
    const useColor = isLocal
      ? (this.myLaserColor || window.DiceRoller3D?.myDiceColor || color || '#ef4444')
      : (color || '#ef4444');

    let trail = this.activeLaserTrails.get(playerId);
    if (!trail) {
      const lineGeo = new THREE.BufferGeometry();
      const lineMat = new THREE.LineBasicMaterial({
        color: useColor,
        linewidth: 3,
        transparent: true,
        opacity: 0.95
      });
      const lineMesh = new THREE.Line(lineGeo, lineMat);
      this.scene.add(lineMesh);

      const dotGeo = new THREE.SphereGeometry(0.22, 16, 16);
      const dotMat = new THREE.MeshBasicMaterial({
        color: useColor,
        transparent: true,
        opacity: 0.98
      });
      const dotMesh = new THREE.Mesh(dotGeo, dotMat);
      this.scene.add(dotMesh);

      const glowGeo = new THREE.RingGeometry(0.24, 0.52, 24);
      glowGeo.rotateX(-Math.PI / 2);
      const glowMat = new THREE.MeshBasicMaterial({
        color: useColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
        depthWrite: false
      });
      const glowMesh = new THREE.Mesh(glowGeo, glowMat);
      this.scene.add(glowMesh);

      trail = { points: [], lineMesh, dotMesh, glowMesh, color: useColor };
      this.activeLaserTrails.set(playerId, trail);
    } else if (trail.color !== useColor) {
      // Dynamic color update whenever player changes Laser or Dice color!
      trail.color = useColor;
      trail.lineMesh.material.color.set(useColor);
      trail.dotMesh.material.color.set(useColor);
      if (trail.glowMesh) trail.glowMesh.material.color.set(useColor);
    }

    trail.points.push({ x, z, time: now });
    trail.dotMesh.position.set(x, 0.14, z);
    trail.dotMesh.visible = true;
    if (trail.glowMesh) {
      trail.glowMesh.position.set(x, 0.045, z);
      trail.glowMesh.visible = true;
    }

    if (isLocal && window.Multiplayer) {
      window.Multiplayer.broadcast({
        type: 'laser_point',
        x: Math.round(x * 100) / 100,
        z: Math.round(z * 100) / 100,
        color: useColor
      });
    }
  },

  updateLaserTrails(now) {
    this.activeLaserTrails.forEach((trail) => {
      while (trail.points.length > 0 && (now - trail.points[0].time > 1400)) {
        trail.points.shift();
      }

      if (trail.points.length < 2) {
        trail.lineMesh.visible = false;
        if (trail.points.length === 0) {
          trail.dotMesh.visible = false;
          if (trail.glowMesh) trail.glowMesh.visible = false;
        }
        return;
      }

      trail.lineMesh.visible = true;
      const pts3D = trail.points.map(p => new THREE.Vector3(p.x, 0.09, p.z));
      trail.lineMesh.geometry.setFromPoints(pts3D);
    });
  },

  // ==========================================================================
  // AOE SPELL TEMPLATES (Resizable, Rotatable, and Click-to-Pin on the Map!)
  // ==========================================================================
  buildAoEMeshGeometry(type, radiusMeters, color, rotationY = 0, isPinned = false, isSelected = false) {
    const cellSize = window.App?.mapConfig?.grid?.cellSize || 2.0;
    // 1 square = 1.5m = cellSize units in 3D space
    const unitsPerMeter = cellSize / 1.5;
    const radiusUnits = Math.max(0.5, Number(radiusMeters) || 6) * unitsPerMeter;

    const group = new THREE.Group();
    const hexColor = new THREE.Color(color || '#ea580c');

    const fillMat = new THREE.MeshBasicMaterial({
      color: hexColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: isPinned ? 0.34 : 0.24,
      depthWrite: false
    });

    const borderMat = new THREE.MeshBasicMaterial({
      color: isSelected ? new THREE.Color('#ffffff') : hexColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: isPinned ? 0.95 : 0.78,
      depthWrite: false
    });

    const borderThickness = isSelected ? 0.16 : 0.11;

    if (type === 'circle') {
      const geo = new THREE.CircleGeometry(radiusUnits, 64);
      geo.rotateX(-Math.PI / 2);
      group.add(new THREE.Mesh(geo, fillMat));

      const edgeGeo = new THREE.RingGeometry(Math.max(0.05, radiusUnits - borderThickness), radiusUnits + 0.04, 64);
      edgeGeo.rotateX(-Math.PI / 2);
      group.add(new THREE.Mesh(edgeGeo, borderMat));
    } else if (type === 'cone') {
      const angle = (this.aoeTemplate.coneAngleDeg || 60) * (Math.PI / 180);
      const geo = new THREE.RingGeometry(0.01, radiusUnits, 48, 1, -angle / 2, angle);
      geo.rotateX(-Math.PI / 2);
      group.add(new THREE.Mesh(geo, fillMat));

      const arcGeo = new THREE.RingGeometry(Math.max(0.05, radiusUnits - borderThickness), radiusUnits + 0.04, 48, 1, -angle / 2, angle);
      arcGeo.rotateX(-Math.PI / 2);
      group.add(new THREE.Mesh(arcGeo, borderMat));

      // Side lines of the cone
      const pts = [
        new THREE.Vector3(Math.cos(-angle / 2) * radiusUnits, 0.02, -Math.sin(-angle / 2) * radiusUnits),
        new THREE.Vector3(0, 0.02, 0),
        new THREE.Vector3(Math.cos(angle / 2) * radiusUnits, 0.02, -Math.sin(angle / 2) * radiusUnits)
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      group.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: hexColor, linewidth: 2 })));
    } else if (type === 'line') {
      const length = radiusUnits;
      const width = cellSize;
      const geo = new THREE.PlaneGeometry(width, length);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0, length / 2);
      group.add(new THREE.Mesh(geo, fillMat));

      const hw = width / 2;
      const pts = [
        new THREE.Vector3(-hw, 0.02, 0),
        new THREE.Vector3(hw, 0.02, 0),
        new THREE.Vector3(hw, 0.02, length),
        new THREE.Vector3(-hw, 0.02, length),
        new THREE.Vector3(-hw, 0.02, 0)
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      group.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: hexColor, linewidth: 2 })));
    } else if (type === 'cube') {
      const side = radiusUnits;
      const geo = new THREE.PlaneGeometry(side, side);
      geo.rotateX(-Math.PI / 2);
      group.add(new THREE.Mesh(geo, fillMat));

      const hs = side / 2;
      const pts = [
        new THREE.Vector3(-hs, 0.02, -hs),
        new THREE.Vector3(hs, 0.02, -hs),
        new THREE.Vector3(hs, 0.02, hs),
        new THREE.Vector3(-hs, 0.02, hs),
        new THREE.Vector3(-hs, 0.02, -hs)
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      group.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: hexColor, linewidth: 2 })));
    }

    // Center anchor pin ring so user can see origin & click to move/edit pinned AoE
    const centerGeo = new THREE.RingGeometry(0.14, 0.32, 24);
    centerGeo.rotateX(-Math.PI / 2);
    const centerMesh = new THREE.Mesh(centerGeo, borderMat);
    centerMesh.position.y = 0.015;
    group.add(centerMesh);

    group.rotation.y = rotationY || 0;
    return group;
  },

  setAoETemplate(type, radiusMeters = 6, color = '#ea580c', broadcast = true, rotationDeg = null) {
    this.aoeTemplate.active = (window.App?.activeTool === 'aoe');
    if (type) this.aoeTemplate.type = type;
    if (radiusMeters !== undefined && radiusMeters !== null) {
      this.aoeTemplate.radiusMeters = Math.max(1.5, Math.min(30, Number(radiusMeters) || 6));
    }
    if (color) this.aoeTemplate.color = color;
    if (rotationDeg !== null && rotationDeg !== undefined) {
      this.aoeTemplate.rotationY = (Number(rotationDeg) * Math.PI) / 180;
    }

    this.syncAoEToolbarUI();
    this.rebuildAoEMesh();

    // If a pinned AoE is currently selected, also live-update that pinned AoE!
    if (this.selectedAoEId && this.placedAoEs.has(this.selectedAoEId)) {
      const item = this.placedAoEs.get(this.selectedAoEId);
      item.type = this.aoeTemplate.type;
      item.radiusMeters = this.aoeTemplate.radiusMeters;
      item.color = this.aoeTemplate.color;
      item.rotationY = this.aoeTemplate.rotationY;
      this.addOrUpdatePinnedAoE(item, broadcast);
    }
  },

  adjustAoERadius(deltaMeters, broadcast = true) {
    const nextRadius = Math.max(1.5, Math.min(30, Math.round((this.aoeTemplate.radiusMeters + deltaMeters) * 2) / 2));
    this.setAoETemplate(this.aoeTemplate.type, nextRadius, this.aoeTemplate.color, broadcast);
  },

  adjustAoERotation(deltaDeg, broadcast = true) {
    const currDeg = Math.round((this.aoeTemplate.rotationY * 180) / Math.PI);
    const nextDeg = ((currDeg + deltaDeg) % 360 + 360) % 360;
    this.setAoETemplate(this.aoeTemplate.type, this.aoeTemplate.radiusMeters, this.aoeTemplate.color, broadcast, nextDeg);
  },

  syncAoEToolbarUI() {
    const typeSel = document.getElementById('aoe-type-select');
    const radRange = document.getElementById('aoe-radius-range');
    const radVal = document.getElementById('aoe-radius-val');
    const rotRange = document.getElementById('aoe-rot-range');
    const rotVal = document.getElementById('aoe-rot-val');
    const colPick = document.getElementById('aoe-color-picker');

    if (typeSel) typeSel.value = this.aoeTemplate.type;
    if (radRange) radRange.value = this.aoeTemplate.radiusMeters;
    if (radVal) radVal.textContent = `${this.aoeTemplate.radiusMeters}m`;
    const deg = Math.round(((this.aoeTemplate.rotationY * 180) / Math.PI % 360 + 360) % 360);
    if (rotRange) rotRange.value = deg;
    if (rotVal) rotVal.textContent = `${deg}°`;
    if (colPick) colPick.value = this.aoeTemplate.color;
  },

  rebuildAoEMesh() {
    if (!this.scene) return;
    if (this.aoeTemplate.mesh) {
      this.scene.remove(this.aoeTemplate.mesh);
      this.aoeTemplate.mesh = null;
    }
    if (!this.aoeTemplate.active) return;

    const group = this.buildAoEMeshGeometry(
      this.aoeTemplate.type,
      this.aoeTemplate.radiusMeters,
      this.aoeTemplate.color,
      this.aoeTemplate.rotationY,
      false,
      false
    );
    group.position.copy(this.aoeTemplate.position);
    this.scene.add(group);
    this.aoeTemplate.mesh = group;
  },

  updateAoEPosition(x, z, broadcast = false) {
    this.aoeTemplate.position.set(x, 0.038, z);
    if (this.aoeTemplate.active) {
      if (!this.aoeTemplate.mesh) this.rebuildAoEMesh();
      if (this.aoeTemplate.mesh) {
        this.aoeTemplate.mesh.position.set(x, 0.038, z);
      }
    }

    // If dragging an existing pinned AoE, move it in real time
    if (this.draggingAoEId && this.placedAoEs.has(this.draggingAoEId)) {
      const item = this.placedAoEs.get(this.draggingAoEId);
      item.x = x;
      item.z = z;
      if (item.mesh) item.mesh.position.set(x, 0.042, z);
      if (broadcast && window.Multiplayer) {
        window.Multiplayer.broadcast({
          type: 'aoe_pin_update',
          aoe: {
            id: item.id,
            type: item.type,
            radiusMeters: item.radiusMeters,
            rotationY: item.rotationY,
            color: item.color,
            x: Math.round(item.x * 100) / 100,
            z: Math.round(item.z * 100) / 100
          }
        });
      }
    }
  },

  // Finds if user clicked near the origin of an already-pinned AoE
  findPinnedAoEAt(x, z, threshold = 1.4) {
    let closestId = null;
    let bestDist = threshold;
    this.placedAoEs.forEach((item, id) => {
      const d = Math.hypot(item.x - x, item.z - z);
      if (d < bestDist) {
        bestDist = d;
        closestId = id;
      }
    });
    return closestId;
  },

  // Called when user clicks on the table in 'aoe' mode: pins a new AoE or selects/moves an existing one!
  handleTableClickInAoEMode(x, z) {
    const existingId = this.findPinnedAoEAt(x, z, 1.5);
    if (existingId) {
      this.selectPinnedAoE(existingId);
      this.draggingAoEId = existingId;
      return existingId;
    }

    const newItem = {
      id: 'aoe_' + Date.now() + '_' + Math.floor(Math.random() * 999),
      type: this.aoeTemplate.type,
      radiusMeters: this.aoeTemplate.radiusMeters,
      rotationY: this.aoeTemplate.rotationY,
      color: this.aoeTemplate.color,
      x: Math.round(x * 100) / 100,
      z: Math.round(z * 100) / 100
    };
    this.selectedAoEId = newItem.id;
    this.draggingAoEId = newItem.id;
    this.addOrUpdatePinnedAoE(newItem, true);
    if (window.App?.showToast) {
      window.App.showToast(`Área de Efeito (${newItem.radiusMeters}m) fixada no mapa! Use o Scroll para ajustar o tamanho.`);
    }
    return newItem.id;
  },

  selectPinnedAoE(aoeId) {
    this.selectedAoEId = aoeId;
    if (aoeId && this.placedAoEs.has(aoeId)) {
      const item = this.placedAoEs.get(aoeId);
      this.aoeTemplate.type = item.type;
      this.aoeTemplate.radiusMeters = item.radiusMeters;
      this.aoeTemplate.color = item.color;
      this.aoeTemplate.rotationY = item.rotationY || 0;
      this.syncAoEToolbarUI();
      this.rebuildAoEMesh();
    }
    this.placedAoEs.forEach((item) => {
      this.addOrUpdatePinnedAoE(item, false);
    });
  },

  addOrUpdatePinnedAoE(aoeData, broadcast = true) {
    if (!this.scene || !aoeData || !aoeData.id) return;
    const prev = this.placedAoEs.get(aoeData.id);
    if (prev && prev.mesh) {
      this.scene.remove(prev.mesh);
    }

    const isSelected = (this.selectedAoEId === aoeData.id);
    const mesh = this.buildAoEMeshGeometry(
      aoeData.type || 'circle',
      aoeData.radiusMeters || 6,
      aoeData.color || '#ea580c',
      aoeData.rotationY || 0,
      true,
      isSelected
    );
    mesh.position.set(aoeData.x || 0, 0.042, aoeData.z || 0);
    this.scene.add(mesh);

    let labelEl = prev?.labelEl;
    if (!labelEl) {
      labelEl = document.createElement('div');
      labelEl.className = 'aoe-map-badge';
      labelEl.style.cssText = 'position:absolute; transform:translate(-50%,-50%); pointer-events:none; font-size:10.5px; font-weight:700; padding:2px 6px; border-radius:99px; background:rgba(12,16,22,0.82); color:#f8fafc; border:1px solid rgba(255,255,255,0.22); white-space:nowrap; z-index:12;';
      document.getElementById('labels-container')?.appendChild(labelEl);
    }
    const squares = Math.round(((aoeData.radiusMeters || 6) / 1.5) * 10) / 10;
    const shapeLabel = aoeData.type === 'cone' ? 'Cone' : (aoeData.type === 'line' ? 'Linha' : (aoeData.type === 'cube' ? 'Cubo' : 'Raio'));
    labelEl.textContent = `${shapeLabel} ${aoeData.radiusMeters}m (${squares}q)`;
    labelEl.style.borderColor = aoeData.color || '#ea580c';

    const stored = {
      id: aoeData.id,
      type: aoeData.type || 'circle',
      radiusMeters: Number(aoeData.radiusMeters) || 6,
      rotationY: Number(aoeData.rotationY) || 0,
      color: aoeData.color || '#ea580c',
      x: Number(aoeData.x) || 0,
      z: Number(aoeData.z) || 0,
      mesh,
      labelEl
    };
    this.placedAoEs.set(aoeData.id, stored);

    if (broadcast && window.Multiplayer) {
      window.Multiplayer.broadcast({
        type: 'aoe_pin_update',
        aoe: {
          id: stored.id,
          type: stored.type,
          radiusMeters: stored.radiusMeters,
          rotationY: stored.rotationY,
          color: stored.color,
          x: stored.x,
          z: stored.z
        }
      });
    }
  },

  removePinnedAoE(aoeId, broadcast = true) {
    const targetId = aoeId || this.selectedAoEId || Array.from(this.placedAoEs.keys()).pop();
    if (!targetId || !this.placedAoEs.has(targetId)) return;
    const item = this.placedAoEs.get(targetId);
    if (item.mesh) this.scene.remove(item.mesh);
    if (item.labelEl) item.labelEl.remove();
    this.placedAoEs.delete(targetId);
    if (this.selectedAoEId === targetId) {
      this.selectedAoEId = Array.from(this.placedAoEs.keys()).pop() || null;
    }
    if (broadcast && window.Multiplayer) {
      window.Multiplayer.broadcast({ type: 'aoe_pin_delete', aoeId: targetId });
    }
  },

  clearAoETemplate(broadcast = true) {
    // Removes all pinned AoEs from the map
    this.placedAoEs.forEach((item) => {
      if (item.mesh) this.scene.remove(item.mesh);
      if (item.labelEl) item.labelEl.remove();
    });
    this.placedAoEs.clear();
    this.selectedAoEId = null;
    this.draggingAoEId = null;

    if (broadcast && window.Multiplayer) {
      window.Multiplayer.broadcast({ type: 'aoe_template_clear' });
    }
  },

  hideAoECursorPreview() {
    this.aoeTemplate.active = false;
    this.draggingAoEId = null;
    if (this.aoeTemplate.mesh) {
      this.scene.remove(this.aoeTemplate.mesh);
      this.aoeTemplate.mesh = null;
    }
  },

  getSerializedPlacedAoEs() {
    return Array.from(this.placedAoEs.values()).map(a => ({
      id: a.id,
      type: a.type,
      radiusMeters: a.radiusMeters,
      rotationY: a.rotationY,
      color: a.color,
      x: a.x,
      z: a.z
    }));
  },

  applySerializedPlacedAoEs(list = []) {
    this.clearAoETemplate(false);
    if (Array.isArray(list)) {
      list.forEach(item => this.addOrUpdatePinnedAoE(item, false));
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

    // Keep Skybox sphere centered on camera so user can never zoom outside of it
    if (this.skyboxMesh && window.App?.camera) {
      this.skyboxMesh.position.copy(window.App.camera.position);
    }

    // Update floating labels on pinned AoEs
    if (this.placedAoEs.size > 0 && window.App?.worldToScreen) {
      this.placedAoEs.forEach((item) => {
        if (!item.labelEl) return;
        const pos = new THREE.Vector3(item.x, 0.25, item.z);
        const scr = window.App.worldToScreen(pos);
        if (scr.visible) {
          item.labelEl.style.display = 'block';
          item.labelEl.style.left = `${scr.x}px`;
          item.labelEl.style.top = `${scr.y}px`;
        } else {
          item.labelEl.style.display = 'none';
        }
      });
    }

    // Animate Weather Particles
    if (this.weather !== 'none' && this.weatherParticles && this.weatherParticles.material.opacity > 0) {
      const pos = this.weatherParticles.geometry.attributes.position.array;
      const count = pos.length / 3;
      const t = now * 0.001;

      for (let i = 0; i < count; i++) {
        const d = this.weatherData[i];
        if (this.weather === 'embers') {
          pos[i * 3 + 1] += 0.06;
          pos[i * 3] += Math.sin(t * 2 + d.seed) * 0.02;
          pos[i * 3 + 2] += Math.cos(t * 1.5 + d.seed) * 0.02;
          if (pos[i * 3 + 1] > 18) {
            pos[i * 3 + 1] = 0.2;
            pos[i * 3] = (Math.random() - 0.5) * 36;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 36;
          }
        } else if (this.weather === 'rain') {
          pos[i * 3 + 1] -= 0.65;
          pos[i * 3] -= 0.08;
          if (pos[i * 3 + 1] < 0.1) {
            pos[i * 3 + 1] = 18;
          }
        } else if (this.weather === 'snow') {
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

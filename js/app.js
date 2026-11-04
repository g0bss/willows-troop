// ============================================================================
// WILLOW'S TROOP - CORE TABLETOP SIMULATOR 3D ENGINE
// ============================================================================

window.App = {
  scene: null,
  camera: null,
  renderer: null,
  raycaster: new THREE.Raycaster(),
  mouseNDC: new THREE.Vector2(),
  groundPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),

  tableWidth: 40,
  tableDepth: 40,

  activeTool: 'grab',
  showAllLabels: false,
  hoveredPieceId: null,
  hoveredDieId: null,
  selectedDieId: null,

  lobbyState: {
    selectedPreset: 'forest',
    selectedCustomMapId: null,
    customMapDataUrl: null
  },

  camState: {
    target: new THREE.Vector3(0, 0, 0),
    spherical: { radius: 32, phi: 0.80, theta: 0 },
    isTopDown: false,
    isOrbiting: false,
    isPanning: false,
    lastMouseX: 0,
    lastMouseY: 0,
    keys: {},
    followGmCamera: false,
    lastGmCamSend: 0
  },

  hostCamState: {
    targetX: 0,
    targetZ: 0,
    radius: 32,
    phi: 0.80,
    theta: 0,
    isTopDown: false
  },

  mapConfig: {
    preset: 'forest',
    customImageUrl: null,
    lighting: 'tavern',
    transform: {
      zoom: 1.0,
      panX: 0.0,
      panY: 0.0,
      tableScale: 1.0,
      autoFitTable: true
    },
    grid: {
      type: 'square',
      cellSize: 2.0,
      offsetX: 0,
      offsetY: 0,
      color: '#ffffff',
      opacity: 0.26,
      lineWidth: 2,
      snap: true,
      showCoords: false
    },
    fogEnabled: false,
    playersLocked: false
  },

  sourceMapElement: null,
  sourceMapWidth: 2048,
  sourceMapHeight: 2048,

  mapEditorState: {
    isOpen: false,
    savedMapId: null,
    presetId: null,
    dataUrl: null,
    sourceImg: null,
    zoom: 1.0,
    panX: 0.0,
    panY: 0.0,
    tableScale: 1.0,
    autoFitTable: true,
    isDragging: false,
    lastX: 0,
    lastY: 0
  },

  drawConfig: {
    mode: 'pen',
    color: '#c94a4a',
    size: 8,
    isDrawing: false,
    startUV: null,
    lastUV: null
  },

  fogConfig: {
    mode: 'reveal',
    brushSize: 90,
    isPainting: false
  },

  rulerState: {
    active: false,
    startPt: null,
    endPt: null,
    lineMesh: null,
    startRing: null,
    endRing: null,
    labelEl: null
  },

  pieces: new Map(),
  pieceMeshes: new Map(),
  pieceLabels: new Map(),
  selectedPieceId: null,

  grabState: {
    pieceId: null,
    dieId: null,
    liftHeight: 1.85,
    currentPos: new THREE.Vector3(),
    targetPos: new THREE.Vector3(),
    prevPos: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    ghostRing: null,
    dragStartPos: null
  },

  fallingPieces: [],
  floatingTexts: [],
  remoteCursors: new Map(),
  activePings: [],
  lastCursorSend: 0,

  pendingCustomImageUrl: null,
  pendingDroppedImageUrl: null,

  init() {
    this.initThreeScene();
    this.initTableAndLayers();
    this.initRulerVisuals();
    this.initGrabGhostVisual();
    this.initEventListeners();
    this.initMapEditorEvents();
    this.populateLobbyMapPreviews();
    this.populateCatalogThumbnails();
    this.renderSavedCustomMaps();

    if (window.SoundEngine) {
      window.SoundEngine.init();
      window.SoundEngine.updateMuteButtonUI();
    }
    if (window.CombatTracker) {
      window.CombatTracker.init();
    }
    if (window.Effects3D) {
      window.Effects3D.init(this.scene);
    }

    window.DiceRoller3D.init(this.scene, (rollResult) => {
      this.onDiceRollFinished(rollResult);
    });

    const savedDiceColor = window.DiceRoller3D.myDiceColor;
    const diceColorPicker = document.getElementById('dice-color-picker');
    if (diceColorPicker && savedDiceColor) {
      diceColorPicker.value = savedDiceColor;
    }

    window.Multiplayer.init(
      (msg) => this.onNetworkMessage(msg),
      () => this.updateMultiplayerUI()
    );

    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      const lobbyInput = document.getElementById('lobby-join-code');
      const mpInput = document.getElementById('mp-join-code');
      if (lobbyInput) lobbyInput.value = roomParam.toUpperCase();
      if (mpInput) mpInput.value = roomParam.toUpperCase();
    }
    if (urlParams.get('demo') === 'table') {
      document.getElementById('lobby-screen')?.classList.add('hidden');
      this.loadWillowsTroopParty();
    }

    this.updateUI();
    this.animate();
  },

  populateLobbyMapPreviews() {
    const presets = ['forest', 'dungeon', 'tavern', 'arcane', 'city', 'parchment'];
    presets.forEach(id => {
      const thumbCanvas = window.MapGenerator.generatePresetMap(id, 384, 240);
      const dataUrl = thumbCanvas.toDataURL('image/jpeg', 0.85);
      document.querySelectorAll(`img[data-map-thumb="${id}"]`).forEach(img => {
        img.src = dataUrl;
      });
    });
  },

  populateCatalogThumbnails() {
    document.querySelectorAll('img[data-cat-thumb]').forEach(img => {
      const preset = img.dataset.catThumb;
      const color = img.dataset.catColor || '#334155';
      if (preset === 'druid') {
        img.src = 'assets/frog-druid-logo.jpg';
      } else {
        img.src = window.Models3D.getCatalogPreviewDataUrl(preset, color);
      }
    });
  },

  // Renders persistent uploaded custom maps in both Lobby and in-game Map drawer
  async renderSavedCustomMaps() {
    const savedMaps = await window.SavedMapsDB.getAllMaps();

    // 1. Render inside Lobby Map Grid
    const lobbyGrid = document.getElementById('lobby-map-grid');
    if (lobbyGrid) {
      lobbyGrid.querySelectorAll('.saved-custom-map-card').forEach(el => el.remove());
      const uploadCard = document.getElementById('lobby-custom-map-card');

      savedMaps.forEach(m => {
        const card = document.createElement('div');
        card.className = 'map-card saved-custom-map-card';
        if (this.lobbyState.selectedCustomMapId === m.id) {
          card.classList.add('selected');
        }
        card.onclick = () => this.selectSavedCustomMap(m, card);
        card.innerHTML = `
          <div class="map-card-thumb">
            <img src="${m.dataUrl}" alt="${this.escapeHtml(m.name)}" />
          </div>
          <div class="map-card-body">
            <span class="map-card-title">${this.escapeHtml(m.name)}</span>
            <span class="map-card-desc">Mapa salvo na biblioteca</span>
            <div class="map-card-actions">
              <button class="map-action-btn" onclick="App.openMapEditorForSavedMap('${m.id}', event)" title="Ajustar Zoom, Posição e Tamanho da Mesa">Ajustar / Zoom</button>
              <button class="map-action-btn" onclick="App.renameSavedMap('${m.id}', event)">Renomear</button>
              <button class="map-action-btn delete" onclick="App.deleteSavedMap('${m.id}', event)">Excluir</button>
            </div>
          </div>
        `;
        if (uploadCard) {
          lobbyGrid.insertBefore(card, uploadCard);
        } else {
          lobbyGrid.appendChild(card);
        }
      });
    }

    // 2. Render inside In-Game Map Drawer
    const drawerList = document.getElementById('drawer-saved-maps-list');
    if (drawerList) {
      if (savedMaps.length === 0) {
        drawerList.innerHTML = `<span style="font-size:11px; color:var(--text-secondary);">Nenhum mapa salvo ainda.</span>`;
      } else {
        drawerList.innerHTML = savedMaps.map(m => `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; background:#10141a; border:1px solid var(--border-muted); padding:5px 7px; border-radius:6px;">
            <div style="display:flex; align-items:center; gap:8px; cursor:pointer; flex:1; overflow:hidden;" onclick="App.selectSavedCustomMapById('${m.id}', true)">
              <img src="${m.dataUrl}" style="width:38px; height:28px; object-fit:cover; border-radius:4px; flex-shrink:0;" />
              <span style="font-size:11.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${this.escapeHtml(m.name)}</span>
            </div>
            <div style="display:flex; gap:4px;">
              <button class="map-action-btn" onclick="App.openMapEditorForSavedMap('${m.id}', event)" title="Ajustar Zoom e Posição">Zoom</button>
              <button class="map-action-btn" onclick="App.renameSavedMap('${m.id}', event)" title="Renomear">Nome</button>
              <button class="map-action-btn delete" onclick="App.deleteSavedMap('${m.id}', event)" title="Excluir">✕</button>
            </div>
          </div>
        `).join('');
      }
    }
  },

  async selectSavedCustomMapById(mapId, broadcast = true) {
    const savedMaps = await window.SavedMapsDB.getAllMaps();
    const m = savedMaps.find(item => item.id === mapId);
    if (!m) return;
    this.lobbyState.selectedCustomMapId = m.id;
    this.lobbyState.customMapDataUrl = m.dataUrl;
    if (m.transform) {
      this.mapConfig.transform = Object.assign({ zoom: 1, panX: 0, panY: 0, tableScale: 1, autoFitTable: true }, m.transform);
    } else {
      this.mapConfig.transform = { zoom: 1, panX: 0, panY: 0, tableScale: 1, autoFitTable: true };
    }
    this.applyCustomMapImage(m.dataUrl, broadcast);
  },

  selectSavedCustomMap(mapItem, cardEl) {
    this.lobbyState.selectedCustomMapId = mapItem.id;
    this.lobbyState.customMapDataUrl = mapItem.dataUrl;
    document.querySelectorAll('#lobby-map-grid .map-card').forEach(c => c.classList.remove('selected'));
    if (cardEl) cardEl.classList.add('selected');
    if (mapItem.transform) {
      this.mapConfig.transform = Object.assign({ zoom: 1, panX: 0, panY: 0, tableScale: 1, autoFitTable: true }, mapItem.transform);
    } else {
      this.mapConfig.transform = { zoom: 1, panX: 0, panY: 0, tableScale: 1, autoFitTable: true };
    }
    this.applyCustomMapImage(mapItem.dataUrl, !!window.Multiplayer?.isHost);
  },

  async renameSavedMap(mapId, event) {
    if (event) event.stopPropagation();
    const saved = await window.SavedMapsDB.getAllMaps();
    const item = saved.find(m => m.id === mapId);
    const nextName = prompt('Novo nome para o mapa:', item ? item.name : 'Mapa');
    if (!nextName || !nextName.trim()) return;
    await window.SavedMapsDB.renameMap(mapId, nextName.trim());
    await this.renderSavedCustomMaps();
    this.showToast('Mapa renomeado.');
  },

  async deleteSavedMap(mapId, event) {
    if (event) event.stopPropagation();
    if (!confirm('Deseja excluir este mapa salvo?')) return;
    await window.SavedMapsDB.deleteMap(mapId);
    if (this.lobbyState.selectedCustomMapId === mapId) {
      this.lobbyState.selectedCustomMapId = null;
      this.lobbyState.customMapDataUrl = null;
    }
    await this.renderSavedCustomMaps();
    this.showToast('Mapa excluído.');
  },

  selectLobbyMap(presetId, cardEl) {
    this.lobbyState.selectedPreset = presetId;
    this.lobbyState.selectedCustomMapId = null;
    this.lobbyState.customMapDataUrl = null;
    document.querySelectorAll('#lobby-map-grid .map-card').forEach(c => c.classList.remove('selected'));
    if (cardEl) cardEl.classList.add('selected');
    this.mapConfig.transform = { zoom: 1.0, panX: 0.0, panY: 0.0, tableScale: 1.0, autoFitTable: true };
    this.applyMapPreset(presetId, !!window.Multiplayer?.isHost);
  },

  handleLobbyCustomMapUpload(input) {
    const file = input.files?.[0];
    if (!file) return;
    const defaultName = file.name.replace(/\.[^/.]+$/, '') || 'Mapa Personalizado';
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      const defaultTransform = { zoom: 1.0, panX: 0.0, panY: 0.0, tableScale: 1.0, autoFitTable: true };
      const savedItem = await window.SavedMapsDB.saveMap(defaultName, dataUrl, defaultTransform);
      this.lobbyState.selectedCustomMapId = savedItem.id;
      this.lobbyState.customMapDataUrl = dataUrl;
      this.mapConfig.transform = Object.assign({}, defaultTransform);
      this.applyCustomMapImage(dataUrl, true);
      await this.renderSavedCustomMaps();
      this.showToast(`Mapa "${defaultName}" salvo! Clique em "Ajustar / Zoom" se quiser enquadrar.`);
      input.value = '';
    };
    reader.readAsDataURL(file);
  },

  enterTableFromLobby() {
    const joinCodeVal = document.getElementById('lobby-join-code')?.value.trim();
    const playerName = document.getElementById('lobby-player-name').value.trim() || 'Mestre';

    // If user is a connected player or typed a room code to join, do NOT overwrite the GM's map!
    if (!window.Multiplayer.isHost) {
      window.Multiplayer.updateProfile(playerName, null, 'player');
      document.getElementById('lobby-screen').classList.add('hidden');
      window.Multiplayer.broadcast({ type: 'request_custom_map' });
      return;
    }
    if (joinCodeVal && (!window.Multiplayer.roomCode || window.Multiplayer.normalizeRoomCode(joinCodeVal) !== window.Multiplayer.roomCode)) {
      window.Multiplayer.updateProfile(playerName, null, 'player');
      window.Multiplayer.joinRoom(joinCodeVal);
      document.getElementById('lobby-screen').classList.add('hidden');
      return;
    }

    const gridType = document.getElementById('lobby-grid-type').value;
    const presetMode = document.getElementById('lobby-setup-mode').value;

    window.Multiplayer.updateProfile(playerName, null, null);
    document.getElementById('mp-player-name').value = playerName;

    this.mapConfig.grid.type = gridType;
    this.refreshGridLayer(false);

    if (this.lobbyState.customMapDataUrl) {
      this.applyCustomMapImage(this.lobbyState.customMapDataUrl, true);
    } else {
      this.applyMapPreset(this.lobbyState.selectedPreset || 'forest', true);
    }

    Array.from(this.pieces.keys()).forEach(id => this.deletePiece(id, false));

    if (presetMode === 'party') {
      this.loadWillowsTroopParty();
    }

    this.updateUI();
    document.getElementById('lobby-screen').classList.add('hidden');
  },

  openLobbyScreen() {
    this.renderSavedCustomMaps();
    document.getElementById('lobby-screen').classList.remove('hidden');
  },

  loadWillowsTroopParty() {
    const party = [
      {
        id: 'willow_druid',
        name: 'Willow (Druida)',
        style: 'standee',
        preset: 'druid',
        imageUrl: 'assets/frog-druid-logo.jpg',
        color: '#b91c1c',
        x: -3,
        z: 5,
        rotation: Math.PI,
        sizeScale: 1,
        hp: 38,
        maxHp: 38,
        ac: 15,
        elevation: 0,
        conditions: []
      },
      {
        id: 'hero_warrior',
        name: 'Vanguardia',
        style: 'standee',
        preset: 'warrior',
        color: '#3b82f6',
        x: 3,
        z: 5,
        rotation: Math.PI,
        sizeScale: 1,
        hp: 45,
        maxHp: 45,
        ac: 18,
        elevation: 0,
        conditions: []
      },
      {
        id: 'hero_rogue',
        name: 'Sombra',
        style: 'model3d',
        preset: 'rogue',
        color: '#64748b',
        x: 0,
        z: 7,
        rotation: Math.PI,
        sizeScale: 1,
        hp: 32,
        maxHp: 32,
        ac: 16,
        elevation: 0,
        conditions: []
      }
    ];

    party.forEach(p => {
      const snapped = window.MapGenerator.snapWorldPosition(p.x, p.z, this.mapConfig.grid, this.tableWidth, this.tableDepth);
      p.x = snapped.x;
      p.z = snapped.z;
      this.addOrUpdatePiece(p, false);
    });
  },

  initThreeScene() {
    const container = document.getElementById('canvas-container');
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0e11);
    this.scene.fog = new THREE.FogExp2(0x0b0e11, 0.0065);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 250);
    this.updateCameraTransform();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.ambientLight = new THREE.AmbientLight(0xffeedd, 0.68);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xfff4e0, 0.95);
    this.dirLight.position.set(18, 34, 22);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 5;
    this.dirLight.shadow.camera.far = 90;
    const d = 26;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);

    this.warmLight = new THREE.PointLight(0xff9d42, 0.42, 65);
    this.warmLight.position.set(-15, 16, -12);
    this.scene.add(this.warmLight);
  },

  initTableAndLayers() {
    this.tableGroup = new THREE.Group();
    this.scene.add(this.tableGroup);

    this.tableFrameGroup = new THREE.Group();
    this.tableGroup.add(this.tableFrameGroup);

    const w = this.tableWidth;
    const d = this.tableDepth;

    this.buildTableFrameMeshes(w, d);

    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = 2048;
    this.mapCanvas.height = 2048;
    this.sourceMapElement = window.MapGenerator.generatePresetMap(this.mapConfig.preset, 2048, 2048);
    this.sourceMapWidth = 2048;
    this.sourceMapHeight = 2048;

    const maxAniso = this.renderer?.capabilities?.getMaxAnisotropy ? this.renderer.capabilities.getMaxAnisotropy() : 8;
    this.mapTexture = new THREE.CanvasTexture(this.mapCanvas);
    this.mapTexture.anisotropy = Math.min(16, maxAniso);

    const mapGeo = new THREE.PlaneGeometry(w, d);
    mapGeo.rotateX(-Math.PI / 2);
    this.mapMat = new THREE.MeshStandardMaterial({
      map: this.mapTexture,
      roughness: 0.72,
      metalness: 0.04
    });
    this.mapMesh = new THREE.Mesh(mapGeo, this.mapMat);
    this.mapMesh.position.y = 0.008;
    this.mapMesh.receiveShadow = true;
    this.mapMesh.name = 'mapSurface';
    this.tableGroup.add(this.mapMesh);

    this.gridCanvas = document.createElement('canvas');
    this.gridCanvas.width = 2048;
    this.gridCanvas.height = 2048;
    this.gridTexture = new THREE.CanvasTexture(this.gridCanvas);
    this.gridTexture.anisotropy = Math.min(16, maxAniso);

    const gridGeo = new THREE.PlaneGeometry(w, d);
    gridGeo.rotateX(-Math.PI / 2);
    const gridMat = new THREE.MeshBasicMaterial({
      map: this.gridTexture,
      transparent: true,
      depthWrite: false
    });
    this.gridMesh = new THREE.Mesh(gridGeo, gridMat);
    this.gridMesh.position.y = 0.016;
    this.tableGroup.add(this.gridMesh);

    this.drawCanvas = document.createElement('canvas');
    this.drawCanvas.width = 1024;
    this.drawCanvas.height = 1024;
    this.drawCtx = this.drawCanvas.getContext('2d');
    this.drawTexture = new THREE.CanvasTexture(this.drawCanvas);

    const drawGeo = new THREE.PlaneGeometry(w, d);
    drawGeo.rotateX(-Math.PI / 2);
    const drawMat = new THREE.MeshBasicMaterial({
      map: this.drawTexture,
      transparent: true,
      depthWrite: false
    });
    this.drawMesh = new THREE.Mesh(drawGeo, drawMat);
    this.drawMesh.position.y = 0.024;
    this.tableGroup.add(this.drawMesh);

    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = 512;
    this.fogCanvas.height = 512;
    this.fogCtx = this.fogCanvas.getContext('2d');
    this.fillFogCanvas(true);
    this.fogTexture = new THREE.CanvasTexture(this.fogCanvas);

    const fogGeo = new THREE.PlaneGeometry(w, d);
    fogGeo.rotateX(-Math.PI / 2);
    this.fogMat = new THREE.MeshBasicMaterial({
      map: this.fogTexture,
      transparent: true,
      opacity: 0.6,
      depthWrite: false
    });
    this.fogMesh = new THREE.Mesh(fogGeo, this.fogMat);
    this.fogMesh.position.y = 0.12;
    this.fogMesh.visible = this.mapConfig.fogEnabled;
    this.tableGroup.add(this.fogMesh);

    this.renderMapCanvasWithTransform(false);
    this.refreshGridLayer(false);
  },

  getTableMaterials() {
    if (this._cachedTableMats) return this._cachedTableMats;

    // 1. Rich Polished Dark Walnut Wood-Grain Texture (512x512)
    const woodCanvas = document.createElement('canvas');
    woodCanvas.width = 512;
    woodCanvas.height = 512;
    const wCtx = woodCanvas.getContext('2d');
    const baseGrad = wCtx.createLinearGradient(0, 0, 512, 512);
    baseGrad.addColorStop(0, '#3a2212');
    baseGrad.addColorStop(0.5, '#2b180c');
    baseGrad.addColorStop(1, '#3d2414');
    wCtx.fillStyle = baseGrad;
    wCtx.fillRect(0, 0, 512, 512);

    // Fine wood fibers & plank grain lines
    for (let i = 0; i < 240; i++) {
      const y = (i * 2.2) % 512;
      wCtx.strokeStyle = i % 3 === 0 ? 'rgba(18, 9, 4, 0.32)' : 'rgba(110, 68, 36, 0.16)';
      wCtx.lineWidth = 1 + (i % 3);
      wCtx.beginPath();
      wCtx.moveTo(0, y);
      wCtx.bezierCurveTo(170, y + Math.sin(i) * 8, 340, y - Math.cos(i) * 8, 512, y);
      wCtx.stroke();
    }

    const woodTex = new THREE.CanvasTexture(woodCanvas);
    woodTex.wrapS = THREE.RepeatWrapping;
    woodTex.wrapT = THREE.RepeatWrapping;
    woodTex.repeat.set(3, 1);

    // 2. Brushed Antiqued Brass Texture
    const brassCanvas = document.createElement('canvas');
    brassCanvas.width = 256;
    brassCanvas.height = 256;
    const bCtx = brassCanvas.getContext('2d');
    const bGrad = bCtx.createLinearGradient(0, 0, 256, 256);
    bGrad.addColorStop(0, '#c8a96e');
    bGrad.addColorStop(0.5, '#9e7f47');
    bGrad.addColorStop(1, '#d4b87c');
    bCtx.fillStyle = bGrad;
    bCtx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 120; i++) {
      bCtx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(40,28,10,0.12)';
      bCtx.fillRect(0, (i * 2.1) % 256, 256, 1.5);
    }
    const brassTex = new THREE.CanvasTexture(brassCanvas);

    const woodMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      roughness: 0.46,
      metalness: 0.10
    });
    const brassMat = new THREE.MeshStandardMaterial({
      map: brassTex,
      roughness: 0.28,
      metalness: 0.82
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x16241b,
      roughness: 0.85,
      metalness: 0.05
    });

    this._cachedTableMats = { woodMat, brassMat, trimMat };
    return this._cachedTableMats;
  },

  buildTableFrameMeshes(w, d) {
    if (!this.tableFrameGroup) return;
    while (this.tableFrameGroup.children.length > 0) {
      const child = this.tableFrameGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      this.tableFrameGroup.remove(child);
    }

    const { woodMat, brassMat, trimMat } = this.getTableMaterials();

    const slabGeo = new THREE.BoxGeometry(w + 3.4, 1.2, d + 3.4);
    const slab = new THREE.Mesh(slabGeo, woodMat);
    slab.position.y = -0.62;
    slab.receiveShadow = true;
    this.tableFrameGroup.add(slab);

    // Subtle inner felt/leather border lip below the battlemap surface (top at -0.14, far below mapMesh at +0.008)
    const innerLip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.16, d + 0.4), trimMat);
    innerLip.position.y = -0.22;
    this.tableFrameGroup.add(innerLip);

    const rimThickness = 1.35;
    const rimHeight = 0.54;
    const rimN = new THREE.Mesh(new THREE.BoxGeometry(w + rimThickness * 2, rimHeight, rimThickness), woodMat);
    rimN.position.set(0, rimHeight / 2 - 0.1, -(d / 2 + rimThickness / 2));
    rimN.castShadow = true;
    rimN.receiveShadow = true;

    const rimS = rimN.clone();
    rimS.position.z = (d / 2 + rimThickness / 2);

    const rimE = new THREE.Mesh(new THREE.BoxGeometry(rimThickness, rimHeight, d), woodMat);
    rimE.position.set(w / 2 + rimThickness / 2, rimHeight / 2 - 0.1, 0);
    rimE.castShadow = true;
    rimE.receiveShadow = true;

    const rimW = rimE.clone();
    rimW.position.x = -(w / 2 + rimThickness / 2);

    // Golden brass inlay strips along top of wooden rails
    const stripN = new THREE.Mesh(new THREE.BoxGeometry(w - 1.2, 0.04, 0.14), brassMat);
    stripN.position.set(0, rimHeight - 0.09, -(d / 2 + rimThickness / 2));
    const stripS = stripN.clone();
    stripS.position.z = (d / 2 + rimThickness / 2);

    const stripE = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, d - 1.2), brassMat);
    stripE.position.set(w / 2 + rimThickness / 2, rimHeight - 0.09, 0);
    const stripW = stripE.clone();
    stripW.position.x = -(w / 2 + rimThickness / 2);

    this.tableFrameGroup.add(rimN, rimS, rimE, rimW, stripN, stripS, stripE, stripW);

    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([cx, cz]) => {
      const corner = new THREE.Mesh(new THREE.BoxGeometry(1.62, rimHeight + 0.06, 1.62), brassMat);
      corner.position.set(cx * (w / 2 + rimThickness / 2), rimHeight / 2 - 0.08, cz * (d / 2 + rimThickness / 2));
      this.tableFrameGroup.add(corner);

      const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.72, 16, 20), woodMat);
      leg.position.set(cx * (w / 2 - 1.5), -8.6, cz * (d / 2 - 1.5));
      this.tableFrameGroup.add(leg);

      const footCollar = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 0.6, 20), brassMat);
      footCollar.position.set(cx * (w / 2 - 1.5), -1.4, cz * (d / 2 - 1.5));
      this.tableFrameGroup.add(footCollar);
    });
  },

  computeTableDimensions(imgW, imgH, transform = {}) {
    const MIN_SHORT_SIDE = 36;
    const MAX_BASE_SIDE = 84;
    const scaleMult = Math.max(0.6, Math.min(3.0, Number(transform.tableScale) || 1.0));

    if (transform.autoFitTable === false) {
      const w = Math.max(MIN_SHORT_SIDE, Math.round((44 * scaleMult) / 2) * 2);
      const d = Math.max(MIN_SHORT_SIDE, Math.round((44 * scaleMult) / 2) * 2);
      return { width: w, depth: d };
    }

    const safeW = Math.max(100, imgW || 2048);
    const safeH = Math.max(100, imgH || 2048);
    const aspect = Math.max(0.4, Math.min(2.5, safeW / safeH));

    // Convert pixel resolution to base table units (approx 38px per unit),
    // while guaranteeing the smaller dimension is NEVER less than MIN_SHORT_SIDE (36 units)
    let w = safeW / 38;
    let d = safeH / 38;

    const minCurr = Math.min(w, d);
    if (minCurr < MIN_SHORT_SIDE) {
      const boost = MIN_SHORT_SIDE / minCurr;
      w *= boost;
      d *= boost;
    }

    const maxCurr = Math.max(w, d);
    if (maxCurr > MAX_BASE_SIDE) {
      const shrink = MAX_BASE_SIDE / maxCurr;
      w *= shrink;
      d *= shrink;
    }

    if (w < MIN_SHORT_SIDE) {
      w = MIN_SHORT_SIDE;
      d = Math.max(MIN_SHORT_SIDE, w / aspect);
    }
    if (d < MIN_SHORT_SIDE) {
      d = MIN_SHORT_SIDE;
      w = Math.max(MIN_SHORT_SIDE, d * aspect);
    }

    w = Math.max(MIN_SHORT_SIDE, Math.round((w * scaleMult) / 2) * 2);
    d = Math.max(MIN_SHORT_SIDE, Math.round((d * scaleMult) / 2) * 2);

    return { width: w, depth: d };
  },

  resizeTable(newW, newD) {
    const w = Math.max(36, Math.round(newW));
    const d = Math.max(36, Math.round(newD));
    if (w === this.tableWidth && d === this.tableDepth && this.tableFrameGroup?.children.length > 0) {
      return;
    }

    this.tableWidth = w;
    this.tableDepth = d;
    this.buildTableFrameMeshes(w, d);

    const replacePlaneGeo = (mesh) => {
      if (!mesh) return;
      if (mesh.geometry) mesh.geometry.dispose();
      const geo = new THREE.PlaneGeometry(w, d);
      geo.rotateX(-Math.PI / 2);
      mesh.geometry = geo;
    };

    replacePlaneGeo(this.mapMesh);
    replacePlaneGeo(this.gridMesh);
    replacePlaneGeo(this.drawMesh);
    replacePlaneGeo(this.fogMesh);

    if (this.dirLight) {
      const bound = Math.max(w, d) * 0.65;
      this.dirLight.shadow.camera.left = -bound;
      this.dirLight.shadow.camera.right = bound;
      this.dirLight.shadow.camera.top = bound;
      this.dirLight.shadow.camera.bottom = -bound;
      this.dirLight.shadow.camera.updateProjectionMatrix();
    }

    this.refreshGridLayer(false);
    this.updateUI();
  },

  renderMapCanvasWithTransform(broadcast = false) {
    if (!this.mapCanvas || !this.sourceMapElement) return;
    const t = this.mapConfig.transform || { zoom: 1, panX: 0, panY: 0, tableScale: 1, autoFitTable: true };

    const dims = this.computeTableDimensions(this.sourceMapWidth, this.sourceMapHeight, t);
    this.resizeTable(dims.width, dims.depth);

    const ctx = this.mapCanvas.getContext('2d');
    const dstW = this.mapCanvas.width;
    const dstH = this.mapCanvas.height;

    ctx.save();
    ctx.fillStyle = '#12161d';
    ctx.fillRect(0, 0, dstW, dstH);

    const imgAspect = Math.max(0.1, (this.sourceMapWidth || 2048) / (this.sourceMapHeight || 2048));
    const tableAspect = this.tableWidth / this.tableDepth;

    let baseWorldW, baseWorldH;
    if (imgAspect >= tableAspect) {
      baseWorldH = this.tableDepth;
      baseWorldW = this.tableDepth * imgAspect;
    } else {
      baseWorldW = this.tableWidth;
      baseWorldH = this.tableWidth / imgAspect;
    }

    const zoom = Math.max(0.3, Math.min(8.0, Number(t.zoom) || 1.0));
    const drawWorldW = baseWorldW * zoom;
    const drawWorldH = baseWorldH * zoom;

    const centerX = (Number(t.panX) || 0) * drawWorldW;
    const centerY = (Number(t.panY) || 0) * drawWorldH;

    const dstX = ((centerX - drawWorldW / 2) / this.tableWidth + 0.5) * dstW;
    const dstY = ((centerY - drawWorldH / 2) / this.tableDepth + 0.5) * dstH;
    const dstDrawW = (drawWorldW / this.tableWidth) * dstW;
    const dstDrawH = (drawWorldH / this.tableDepth) * dstH;

    ctx.drawImage(this.sourceMapElement, dstX, dstY, dstDrawW, dstDrawH);
    ctx.restore();

    this.mapTexture.needsUpdate = true;
    this.mapMat.map = this.mapTexture;
    this.mapMat.needsUpdate = true;

    this.updateUI();

    if (broadcast) {
      this.broadcastMapSettingsOnly();
    }
  },

  getFastNetworkCustomMapJpeg() {
    if (!this.sourceMapElement) return null;
    try {
      let w = this.sourceMapWidth || 1024;
      let h = this.sourceMapHeight || 1024;
      const maxDim = 840;
      if (Math.max(w, h) > maxDim) {
        const ratio = maxDim / Math.max(w, h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(this.sourceMapElement, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.64);
    } catch (e) {
      return this.mapConfig.customImageUrl;
    }
  },

  getSerializedCamState() {
    return {
      targetX: Math.round(this.camState.target.x * 100) / 100,
      targetZ: Math.round(this.camState.target.z * 100) / 100,
      radius: Math.round(this.camState.spherical.radius * 100) / 100,
      phi: Math.round(this.camState.spherical.phi * 1000) / 1000,
      theta: Math.round(this.camState.spherical.theta * 1000) / 1000,
      isTopDown: !!this.camState.isTopDown
    };
  },

  getLightweightMapSettings() {
    return {
      preset: this.mapConfig.preset,
      hasCustomImage: !!this.mapConfig.customImageUrl,
      customMapHash: this.mapConfig.customMapHash || null,
      lighting: this.mapConfig.lighting,
      transform: this.mapConfig.transform,
      grid: this.mapConfig.grid,
      fogEnabled: this.mapConfig.fogEnabled,
      weather: window.Effects3D ? window.Effects3D.weather : 'none',
      skybox: window.Effects3D ? window.Effects3D.currentSkybox : 'tavern',
      musicUri: (window.MusicPlayer && window.MusicPlayer.shareWithTable) ? (window.MusicPlayer.currentUri || '') : '',
      customSkyboxUrl: (window.Effects3D?.currentSkybox === 'custom' && window.Effects3D?.customSkyboxUrl && window.Effects3D.customSkyboxUrl.length < 180000)
        ? window.Effects3D.customSkyboxUrl
        : '',
      placedAoEs: window.Effects3D ? window.Effects3D.getSerializedPlacedAoEs() : [],
      playersLocked: !!this.mapConfig.playersLocked,
      gmCam: window.Multiplayer?.isHost ? this.getSerializedCamState() : this.hostCamState
    };
  },

  broadcastMapSettingsOnly() {
    window.Multiplayer.broadcast({
      type: 'map_settings_only',
      settings: this.getLightweightMapSettings()
    });
    if (window.Multiplayer.scheduleRetainedRoomPublish) {
      window.Multiplayer.scheduleRetainedRoomPublish();
    }
  },

  broadcastCustomMapWithImage(_targetPlayerId = null) {
    this.broadcastMapSettingsOnly();
    if (window.Multiplayer.streamCustomMapChunks) {
      window.Multiplayer.streamCustomMapChunks(null, null);
    }
  },

  initRulerVisuals() {
    const lineMat = new THREE.LineBasicMaterial({ color: 0xc2a36b, linewidth: 2 });
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.5, 0),
      new THREE.Vector3(0, 0.5, 0)
    ]);
    this.rulerState.lineMesh = new THREE.Line(lineGeo, lineMat);
    this.rulerState.lineMesh.visible = false;
    this.scene.add(this.rulerState.lineMesh);

    const ringGeo = new THREE.RingGeometry(0.32, 0.48, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xc2a36b, side: THREE.DoubleSide });
    this.rulerState.startRing = new THREE.Mesh(ringGeo, ringMat);
    this.rulerState.startRing.position.y = 0.06;
    this.rulerState.startRing.visible = false;
    this.scene.add(this.rulerState.startRing);

    this.rulerState.endRing = this.rulerState.startRing.clone();
    this.scene.add(this.rulerState.endRing);

    const label = document.createElement('div');
    label.className = 'ruler-label';
    label.style.display = 'none';
    document.getElementById('labels-container').appendChild(label);
    this.rulerState.labelEl = label;
  },

  initGrabGhostVisual() {
    const s = this.mapConfig.grid.cellSize || 2;
    const geo = new THREE.RingGeometry(s * 0.36, s * 0.45, 32);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x68a378,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75
    });
    this.grabState.ghostRing = new THREE.Mesh(geo, mat);
    this.grabState.ghostRing.position.y = 0.05;
    this.grabState.ghostRing.visible = false;
    this.scene.add(this.grabState.ghostRing);
  },

  addOrUpdatePiece(pieceData, broadcast = true) {
    const existingMesh = this.pieceMeshes.get(pieceData.id);
    if (existingMesh) {
      this.scene.remove(existingMesh);
    }

    this.pieces.set(pieceData.id, pieceData);

    const mesh = window.Models3D.createPieceMesh(pieceData, this.mapConfig.grid.cellSize);
    mesh.position.set(pieceData.x || 0, 0, pieceData.z || 0);
    mesh.rotation.y = pieceData.rotation || 0;
    mesh.visible = this.isPieceVisibleToCurrentUser(pieceData);

    this.scene.add(mesh);
    this.pieceMeshes.set(pieceData.id, mesh);

    if (this.selectedPieceId === pieceData.id) {
      const ring = mesh.getObjectByName('selectionRing');
      if (ring) ring.material.opacity = 0.95;
    }

    this.updatePieceDOMLabel(pieceData);

    if (broadcast) {
      window.Multiplayer.broadcast({
        type: 'piece_update',
        piece: pieceData
      });
      if (window.Multiplayer.scheduleRetainedRoomPublish) {
        window.Multiplayer.scheduleRetainedRoomPublish();
      }
    }
  },

  isPieceVisibleToCurrentUser(pieceData) {
    const isGM = window.Multiplayer.myRole === 'gm';
    const conds = pieceData.conditions || [];
    if (!isGM && conds.includes('invisible')) {
      return false;
    }
    if (!isGM && this.mapConfig.fogEnabled && this.fogCtx) {
      const uv = this.worldToUV(pieceData.x, pieceData.z);
      const fx = Math.floor(uv.x * this.fogCanvas.width);
      const fy = Math.floor(uv.y * this.fogCanvas.height);
      if (fx >= 0 && fx < this.fogCanvas.width && fy >= 0 && fy < this.fogCanvas.height) {
        const pixel = this.fogCtx.getImageData(fx, fy, 1, 1).data;
        if (pixel[3] > 180 && pieceData.style !== 'pin') {
          return false;
        }
      }
    }
    return true;
  },

  updatePieceDOMLabel(pieceData) {
    let label = this.pieceLabels.get(pieceData.id);
    if (!label) {
      label = document.createElement('div');
      label.className = 'piece-label';
      document.getElementById('labels-container').appendChild(label);
      this.pieceLabels.set(pieceData.id, label);
    }

    const isGM = window.Multiplayer.myRole === 'gm';
    const isInvisible = (pieceData.conditions || []).includes('invisible');
    const curHp = Number(pieceData.hp) || 0;
    const maxHp = Number(pieceData.maxHp) || 0;
    const hasTempHp = maxHp > 0 && curHp > maxHp;
    const showHp = maxHp > 0 && pieceData.style !== 'prop' && pieceData.style !== 'pin';
    const hpPercent = showHp ? Math.max(0, Math.min(100, (curHp / maxHp) * 100)) : 0;
    const hpColor = hasTempHp ? '#38bdf8' : (hpPercent > 50 ? '#4d9e6d' : (hpPercent > 25 ? '#d99b26' : '#c94a4a'));
    const acHtml = (isGM && pieceData.ac) ? `<span class="ac-badge">CA ${pieceData.ac}</span>` : '';
    const tempHpBadge = hasTempHp ? `<span class="ac-badge" style="background:rgba(56,189,248,0.22); color:#7dd3fc; border-color:rgba(56,189,248,0.45);" title="Vida Temporária / Extra">+${curHp - maxHp}</span>` : '';
    const invBadge = (isGM && isInvisible) ? `<span class="ac-badge" style="background:rgba(96,165,250,0.22); color:#93c5fd;">OCULTO</span>` : '';

    const condMap = {
      poisoned: ['Veneno', '#7fa650'],
      burning: ['Chamas', '#d9822b'],
      stunned: ['Atordoado', '#c9b037'],
      blessed: ['Abençoado', '#d4bb6a'],
      invisible: ['Oculto', '#6b7a99'],
      bleeding: ['Sangrando', '#c0504d'],
      prone: ['Caído', '#8a8f98'],
      shielded: ['Protegido', '#4f8fc4'],
      marked: ['Marcado', '#b05fa3']
    };
    const condBadges = (pieceData.conditions || [])
      .filter(c => condMap[c] && !(c === 'invisible' && !isGM))
      .map(c => `<span class="cond-tag" style="--cond:${condMap[c][1]}">${condMap[c][0]}</span>`)
      .join('');

    label.innerHTML = `
      <div class="name-tag" style="border-color: ${pieceData.color || 'rgba(255,255,255,0.2)'}">
        <span>${this.escapeHtml(pieceData.name || 'Peça')}</span>
        ${condBadges}
        ${acHtml}
        ${tempHpBadge}
        ${invBadge}
      </div>
      ${showHp ? `
        <div class="hp-bar-wrap">
          <div class="hp-bar-fill" style="width:${hpPercent}%; background:${hpColor}"></div>
        </div>
      ` : ''}
    `;
  },

  deletePiece(pieceId, broadcast = true) {
    const mesh = this.pieceMeshes.get(pieceId);
    if (mesh) {
      this.scene.remove(mesh);
      this.pieceMeshes.delete(pieceId);
    }
    const label = this.pieceLabels.get(pieceId);
    if (label) {
      label.remove();
      this.pieceLabels.delete(pieceId);
    }
    this.pieces.delete(pieceId);
    if (this.selectedPieceId === pieceId) {
      this.selectPiece(null);
    }

    if (broadcast) {
      window.Multiplayer.broadcast({
        type: 'piece_delete',
        pieceId
      });
      if (window.Multiplayer.scheduleRetainedRoomPublish) {
        window.Multiplayer.scheduleRetainedRoomPublish();
      }
    }
  },

  selectPiece(pieceId) {
    if (this.selectedPieceId) {
      const prevMesh = this.pieceMeshes.get(this.selectedPieceId);
      if (prevMesh) {
        const ring = prevMesh.getObjectByName('selectionRing');
        if (ring) ring.material.opacity = 0.0;
      }
    }

    this.selectedPieceId = pieceId;
    const mesh = this.pieceMeshes.get(pieceId);
    if (mesh) {
      const ring = mesh.getObjectByName('selectionRing');
      if (ring) ring.material.opacity = 0.95;
    }

    const inspectorDrawer = document.getElementById('inspector-drawer');
    if (pieceId && this.pieces.has(pieceId)) {
      this.populateInspectorUI();
      if (inspectorDrawer) inspectorDrawer.classList.remove('closed');
    } else {
      if (inspectorDrawer) inspectorDrawer.classList.add('closed');
    }
  },

  toggleDrawer(drawerId) {
    const ids = ['library-drawer', 'mapgrid-drawer'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === drawerId) {
        el.classList.toggle('closed');
      } else {
        el.classList.add('closed');
      }
    });
  },

  applyMapPreset(presetName, broadcast = true) {
    this.mapConfig.preset = presetName;
    this.mapConfig.customImageUrl = null;
    this.mapConfig.customMapHash = null;
    this.cachedNetMapJpeg = null;
    this.needsCustomMapFromHost = false;
    if (!this.mapConfig.transform) {
      this.mapConfig.transform = { zoom: 1.0, panX: 0.0, panY: 0.0, tableScale: 1.0, autoFitTable: true };
    }
    this.sourceMapElement = window.MapGenerator.generatePresetMap(presetName, 2048, 2048);
    this.sourceMapWidth = 2048;
    this.sourceMapHeight = 2048;
    this.renderMapCanvasWithTransform(false);
    if (broadcast) {
      this.broadcastMapSettingsOnly();
    }
  },

  applyCustomMapImage(dataUrl, broadcast = true, explicitHash = null) {
    if (!dataUrl) return;
    this.mapConfig.customImageUrl = dataUrl;
    this.lobbyState.customMapDataUrl = dataUrl;
    this.mapConfig.customMapHash = explicitHash || ('m_' + dataUrl.length + '_' + dataUrl.slice(-24).replace(/[^a-zA-Z0-9]/g, ''));
    this.needsCustomMapFromHost = false;
    if (!this.mapConfig.transform) {
      this.mapConfig.transform = { zoom: 1.0, panX: 0.0, panY: 0.0, tableScale: 1.0, autoFitTable: true };
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.sourceMapElement = img;
      this.sourceMapWidth = img.naturalWidth || img.width || 2048;
      this.sourceMapHeight = img.naturalHeight || img.height || 2048;
      this.cachedNetMapJpeg = this.getFastNetworkCustomMapJpeg();
      this.renderMapCanvasWithTransform(false);
      if (broadcast) {
        this.broadcastCustomMapWithImage(null);
      }
    };
    img.src = dataUrl;
  },

  // ==========================================================================
  // INTERACTIVE MAP FRAMING (ZOOM, PAN) & TABLE SIZE EDITOR
  // ==========================================================================
  initMapEditorEvents() {
    const canvas = document.getElementById('map-editor-canvas');
    if (!canvas) return;

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.mapEditorState.isDragging = true;
      this.mapEditorState.lastX = e.clientX;
      this.mapEditorState.lastY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.mapEditorState.isOpen || !this.mapEditorState.isDragging) return;
      const dx = e.clientX - this.mapEditorState.lastX;
      const dy = e.clientY - this.mapEditorState.lastY;
      this.mapEditorState.lastX = e.clientX;
      this.mapEditorState.lastY = e.clientY;

      const sensitivity = 1 / (320 * Math.max(0.5, this.mapEditorState.zoom));
      this.mapEditorState.panX = Math.max(-2.0, Math.min(2.0, this.mapEditorState.panX + dx * sensitivity));
      this.mapEditorState.panY = Math.max(-2.0, Math.min(2.0, this.mapEditorState.panY + dy * sensitivity));
      this.renderMapEditorPreview();
    });

    window.addEventListener('mouseup', () => {
      this.mapEditorState.isDragging = false;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      this.mapEditorState.zoom = Math.max(0.5, Math.min(6.0, Math.round(this.mapEditorState.zoom * factor * 100) / 100));
      const zoomSlider = document.getElementById('map-editor-zoom');
      const zoomVal = document.getElementById('map-editor-zoom-val');
      if (zoomSlider) zoomSlider.value = this.mapEditorState.zoom;
      if (zoomVal) zoomVal.textContent = this.mapEditorState.zoom.toFixed(2) + 'x';
      this.renderMapEditorPreview();
    }, { passive: false });
  },

  async openMapEditorForSavedMap(mapId, event) {
    if (event) event.stopPropagation();
    const saved = await window.SavedMapsDB.getAllMaps();
    const item = saved.find(m => m.id === mapId);
    if (!item) return;

    this.lobbyState.selectedCustomMapId = item.id;
    this.lobbyState.customMapDataUrl = item.dataUrl;

    this.openMapEditorModal({
      savedMapId: item.id,
      name: item.name,
      dataUrl: item.dataUrl,
      presetId: null,
      transform: item.transform || this.mapConfig.transform
    });
  },

  openMapEditorForPreset(presetId, event) {
    if (event) event.stopPropagation();
    this.selectLobbyMap(presetId, null);
    this.openMapEditorModal({
      savedMapId: null,
      name: presetId,
      dataUrl: null,
      presetId,
      transform: this.mapConfig.transform
    });
  },

  async openMapEditorForCurrentSelection() {
    if (this.lobbyState.selectedCustomMapId) {
      await this.openMapEditorForSavedMap(this.lobbyState.selectedCustomMapId, null);
    } else if (this.mapConfig.customImageUrl) {
      this.openMapEditorModal({
        savedMapId: null,
        name: 'Mapa Personalizado',
        dataUrl: this.mapConfig.customImageUrl,
        presetId: null,
        transform: this.mapConfig.transform
      });
    } else {
      const preset = this.mapConfig.preset || this.lobbyState.selectedPreset || 'forest';
      this.openMapEditorModal({
        savedMapId: null,
        name: preset,
        dataUrl: null,
        presetId: preset,
        transform: this.mapConfig.transform
      });
    }
  },

  openMapEditorModal(opts) {
    const t = Object.assign({ zoom: 1.0, panX: 0.0, panY: 0.0, tableScale: 1.0, autoFitTable: true }, opts.transform || {});
    this.mapEditorState.isOpen = true;
    this.mapEditorState.savedMapId = opts.savedMapId || null;
    this.mapEditorState.presetId = opts.presetId || null;
    this.mapEditorState.dataUrl = opts.dataUrl || null;
    this.mapEditorState.zoom = Number(t.zoom) || 1.0;
    this.mapEditorState.panX = Number(t.panX) || 0.0;
    this.mapEditorState.panY = Number(t.panY) || 0.0;
    this.mapEditorState.tableScale = Number(t.tableScale) || 1.0;
    this.mapEditorState.autoFitTable = t.autoFitTable !== false;

    const zoomSlider = document.getElementById('map-editor-zoom');
    const zoomVal = document.getElementById('map-editor-zoom-val');
    const scaleSlider = document.getElementById('map-editor-table-scale');
    const scaleVal = document.getElementById('map-editor-table-scale-val');
    const autoFitCheck = document.getElementById('map-editor-autofit');

    if (zoomSlider) zoomSlider.value = this.mapEditorState.zoom;
    if (zoomVal) zoomVal.textContent = this.mapEditorState.zoom.toFixed(2) + 'x';
    if (scaleSlider) scaleSlider.value = this.mapEditorState.tableScale;
    if (scaleVal) scaleVal.textContent = this.mapEditorState.tableScale.toFixed(2) + 'x';
    if (autoFitCheck) autoFitCheck.checked = this.mapEditorState.autoFitTable;

    const modal = document.getElementById('map-editor-modal');
    if (modal) modal.classList.add('open');

    if (opts.dataUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.mapEditorState.sourceImg = img;
        this.renderMapEditorPreview();
      };
      img.src = opts.dataUrl;
    } else {
      const presetCanvas = window.MapGenerator.generatePresetMap(opts.presetId || 'forest', 1024, 1024);
      this.mapEditorState.sourceImg = presetCanvas;
      this.renderMapEditorPreview();
    }
  },

  renderMapEditorPreview() {
    const canvas = document.getElementById('map-editor-canvas');
    if (!canvas || !this.mapEditorState.sourceImg) return;
    const ctx = canvas.getContext('2d');
    const cw = canvas.width;
    const ch = canvas.height;

    const src = this.mapEditorState.sourceImg;
    const srcW = src.naturalWidth || src.width || 1024;
    const srcH = src.naturalHeight || src.height || 1024;

    const dims = this.computeTableDimensions(srcW, srcH, {
      tableScale: this.mapEditorState.tableScale,
      autoFitTable: this.mapEditorState.autoFitTable
    });

    const cellSize = this.mapConfig.grid.cellSize || 2;
    const cols = Math.round(dims.width / cellSize);
    const rows = Math.round(dims.depth / cellSize);
    const infoEl = document.getElementById('map-editor-dims-info');
    if (infoEl) {
      infoEl.textContent = `Mesa: ${dims.width} × ${dims.depth} un (${cols} × ${rows} quadrados) · Imagem: ${srcW}×${srcH}px`;
    }

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#0b0e12';
    ctx.fillRect(0, 0, cw, ch);

    // Compute table rectangle inside preview canvas
    const pad = 42;
    const availW = cw - pad * 2;
    const availH = ch - pad * 2;
    const tableAspect = dims.width / dims.depth;

    let tablePxW, tablePxH;
    if (availW / availH > tableAspect) {
      tablePxH = availH;
      tablePxW = tablePxH * tableAspect;
    } else {
      tablePxW = availW;
      tablePxH = tablePxW / tableAspect;
    }

    const tableX = (cw - tablePxW) / 2;
    const tableY = (ch - tablePxH) / 2;

    // Compute image draw rectangle relative to table
    const imgAspect = srcW / srcH;
    let baseW, baseH;
    if (imgAspect >= tableAspect) {
      baseH = tablePxH;
      baseW = tablePxH * imgAspect;
    } else {
      baseW = tablePxW;
      baseH = tablePxW / imgAspect;
    }

    const drawW = baseW * this.mapEditorState.zoom;
    const drawH = baseH * this.mapEditorState.zoom;
    const centerX = cw / 2 + this.mapEditorState.panX * drawW;
    const centerY = ch / 2 + this.mapEditorState.panY * drawH;
    const imgX = centerX - drawW / 2;
    const imgY = centerY - drawH / 2;

    // 1. Draw full image dimmed in background so user can see outside bounds
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.drawImage(src, imgX, imgY, drawW, drawH);
    ctx.restore();

    // 2. Draw wooden table rim around table rect
    ctx.save();
    ctx.fillStyle = '#2e1c10';
    ctx.strokeStyle = '#a68956';
    ctx.lineWidth = 2;
    ctx.fillRect(tableX - 8, tableY - 8, tablePxW + 16, tablePxH + 16);
    ctx.strokeRect(tableX - 8, tableY - 8, tablePxW + 16, tablePxH + 16);
    ctx.restore();

    // 3. Clip to table interior and draw bright map + live grid preview
    ctx.save();
    ctx.beginPath();
    ctx.rect(tableX, tableY, tablePxW, tablePxH);
    ctx.clip();

    ctx.fillStyle = '#12161d';
    ctx.fillRect(tableX, tableY, tablePxW, tablePxH);
    ctx.drawImage(src, imgX, imgY, drawW, drawH);

    // Draw grid lines preview inside table
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    const stepX = tablePxW / cols;
    const stepY = tablePxH / rows;
    ctx.beginPath();
    for (let x = tableX; x <= tableX + tablePxW + 0.5; x += stepX) {
      ctx.moveTo(x, tableY);
      ctx.lineTo(x, tableY + tablePxH);
    }
    for (let y = tableY; y <= tableY + tablePxH + 0.5; y += stepY) {
      ctx.moveTo(tableX, y);
      ctx.lineTo(tableX + tablePxW, y);
    }
    ctx.stroke();
    ctx.restore();

    // 4. Inner highlight border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tableX, tableY, tablePxW, tablePxH);
  },

  resetMapEditorTransform() {
    this.mapEditorState.zoom = 1.0;
    this.mapEditorState.panX = 0.0;
    this.mapEditorState.panY = 0.0;
    this.mapEditorState.tableScale = 1.0;
    this.mapEditorState.autoFitTable = true;

    const zoomSlider = document.getElementById('map-editor-zoom');
    const zoomVal = document.getElementById('map-editor-zoom-val');
    const scaleSlider = document.getElementById('map-editor-table-scale');
    const scaleVal = document.getElementById('map-editor-table-scale-val');
    const autoFitCheck = document.getElementById('map-editor-autofit');

    if (zoomSlider) zoomSlider.value = 1.0;
    if (zoomVal) zoomVal.textContent = '1.00x';
    if (scaleSlider) scaleSlider.value = 1.0;
    if (scaleVal) scaleVal.textContent = '1.00x';
    if (autoFitCheck) autoFitCheck.checked = true;

    this.renderMapEditorPreview();
  },

  async applyMapEditorChanges() {
    const newTransform = {
      zoom: this.mapEditorState.zoom,
      panX: this.mapEditorState.panX,
      panY: this.mapEditorState.panY,
      tableScale: this.mapEditorState.tableScale,
      autoFitTable: this.mapEditorState.autoFitTable
    };

    this.mapConfig.transform = Object.assign({}, newTransform);

    if (this.mapEditorState.savedMapId && window.SavedMapsDB) {
      await window.SavedMapsDB.updateMap(this.mapEditorState.savedMapId, {
        transform: newTransform
      });
      await this.renderSavedCustomMaps();
    }

    if (this.mapEditorState.dataUrl) {
      this.lobbyState.customMapDataUrl = this.mapEditorState.dataUrl;
      this.applyCustomMapImage(this.mapEditorState.dataUrl, true);
    } else if (this.mapEditorState.presetId) {
      this.lobbyState.selectedPreset = this.mapEditorState.presetId;
      this.applyMapPreset(this.mapEditorState.presetId, true);
    } else {
      this.renderMapCanvasWithTransform(true);
    }

    this.mapEditorState.isOpen = false;
    document.getElementById('map-editor-modal')?.classList.remove('open');
    this.showToast('Enquadramento e tamanho da mesa aplicados!');
  },

  refreshGridLayer(broadcast = false) {
    window.MapGenerator.drawGridOverlay(
      this.gridCanvas,
      this.mapConfig.grid,
      this.tableWidth,
      this.tableDepth
    );
    this.gridTexture.needsUpdate = true;

    if (this.grabState.ghostRing) {
      const s = this.mapConfig.grid.cellSize || 2;
      this.grabState.ghostRing.geometry.dispose();
      const geo = new THREE.RingGeometry(s * 0.36, s * 0.45, 32);
      geo.rotateX(-Math.PI / 2);
      this.grabState.ghostRing.geometry = geo;
    }

    if (broadcast) {
      this.broadcastMapSettingsOnly();
    }
  },

  applyLightingMood(mood, broadcast = true) {
    this.mapConfig.lighting = mood;
    if (mood === 'day') {
      this.scene.background.setHex(0x161c24);
      this.ambientLight.color.setHex(0xffffff);
      this.ambientLight.intensity = 0.85;
      this.dirLight.color.setHex(0xfffbeb);
      this.dirLight.intensity = 1.05;
      this.warmLight.intensity = 0.2;
    } else if (mood === 'night') {
      this.scene.background.setHex(0x06090f);
      this.ambientLight.color.setHex(0x60a5fa);
      this.ambientLight.intensity = 0.42;
      this.dirLight.color.setHex(0x93c5fd);
      this.dirLight.intensity = 0.65;
      this.warmLight.intensity = 0.35;
    } else if (mood === 'dungeon') {
      this.scene.background.setHex(0x050608);
      this.ambientLight.color.setHex(0xd6d3d1);
      this.ambientLight.intensity = 0.35;
      this.dirLight.color.setHex(0xfdba74);
      this.dirLight.intensity = 0.65;
      this.warmLight.intensity = 0.85;
    } else {
      this.scene.background.setHex(0x0b0e11);
      this.ambientLight.color.setHex(0xffeedd);
      this.ambientLight.intensity = 0.68;
      this.dirLight.color.setHex(0xfff4e0);
      this.dirLight.intensity = 0.95;
      this.warmLight.intensity = 0.45;
    }
    if (broadcast) {
      this.broadcastMapSettingsOnly();
    }
  },

  fillFogCanvas(coverAll = true) {
    if (!this.fogCtx) return;
    const w = this.fogCanvas.width;
    const h = this.fogCanvas.height;
    this.fogCtx.clearRect(0, 0, w, h);
    if (coverAll) {
      this.fogCtx.fillStyle = '#07090d';
      this.fogCtx.fillRect(0, 0, w, h);
    }
    if (this.fogTexture) this.fogTexture.needsUpdate = true;
    this.refreshAllPieceVisibilities();
  },

  paintFogAtUV(u, v, radiusPx, mode, broadcast = true) {
    if (!this.fogCtx) return;
    const x = u * this.fogCanvas.width;
    const y = v * this.fogCanvas.height;

    this.fogCtx.save();
    if (mode === 'reveal') {
      this.fogCtx.globalCompositeOperation = 'destination-out';
      const grad = this.fogCtx.createRadialGradient(x, y, radiusPx * 0.2, x, y, radiusPx);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      this.fogCtx.fillStyle = grad;
    } else {
      this.fogCtx.globalCompositeOperation = 'source-over';
      this.fogCtx.fillStyle = '#07090d';
    }
    this.fogCtx.beginPath();
    this.fogCtx.arc(x, y, radiusPx, 0, Math.PI * 2);
    this.fogCtx.fill();
    this.fogCtx.restore();

    this.fogTexture.needsUpdate = true;
    this.refreshAllPieceVisibilities();

    if (broadcast) {
      window.Multiplayer.broadcast({
        type: 'fog_stroke',
        u,
        v,
        radiusPx,
        mode
      });
      if (window.Multiplayer.scheduleRetainedRoomPublish) {
        window.Multiplayer.scheduleRetainedRoomPublish();
      }
    }
  },

  setViewRole(role, showFeedback = true) {
    const cleanRole = role === 'player' ? 'player' : 'gm';
    const roleSelect = document.getElementById('role-select');
    if (roleSelect) roleSelect.value = cleanRole;

    window.Multiplayer.updateProfile(null, null, cleanRole);

    if (cleanRole === 'gm') {
      // If user is a joined guest switching to "Visão: Mestre", sync their camera to the GM's live camera!
      if (!window.Multiplayer.isHost) {
        this.camState.followGmCamera = true;
        this.applyHostCamState(this.hostCamState, true);
        if (showFeedback) {
          this.showToast('Visão: Mestre — Sincronizado com a câmera e visão completa do Mestre!');
        }
      } else if (showFeedback) {
        this.showToast('Visão: Mestre — Todas as ferramentas, névoa translúcida e peças ocultas ativadas.');
      }
    } else {
      this.camState.followGmCamera = false;
      if (showFeedback) {
        this.showToast('Visão: Jogador — Câmera livre individual e visão restrita de jogador.');
      }
    }

    this.refreshAllPieceVisibilities();
  },

  handleCameraSyncAction() {
    if (window.Multiplayer.isHost) {
      const cam = this.getSerializedCamState();
      window.Multiplayer.broadcast({
        type: 'force_gm_cam',
        cam
      });
      this.showToast('Visão de todos os jogadores focada na sua câmera atual!');
    } else {
      this.camState.followGmCamera = !this.camState.followGmCamera;
      if (this.camState.followGmCamera) {
        this.applyHostCamState(this.hostCamState, true);
        this.showToast('Seguindo a câmera do Mestre em tempo real.');
      } else {
        this.showToast('Câmera livre ativada.');
      }
      this.refreshAllPieceVisibilities();
    }
  },

  applyHostCamState(cam, immediate = false) {
    if (!cam) return;
    this.hostCamState = Object.assign(this.hostCamState, cam);
    if (immediate) {
      if (typeof cam.isTopDown === 'boolean' && this.camState.isTopDown !== cam.isTopDown) {
        this.camState.isTopDown = cam.isTopDown;
        document.getElementById('btn-cam-topdown')?.classList.toggle('active', this.camState.isTopDown);
      }
      this.camState.target.set(Number(cam.targetX) || 0, 0, Number(cam.targetZ) || 0);
      this.camState.spherical.radius = Number(cam.radius) || 32;
      this.camState.spherical.phi = Number(cam.phi) || 0.80;
      this.camState.spherical.theta = Number(cam.theta) || 0;
      this.updateCameraTransform(false);
    }
  },

  isPlayerActionBlocked(showWarning = true) {
    if (window.Multiplayer && !window.Multiplayer.isHost && this.mapConfig.playersLocked) {
      if (showWarning) {
        this.showToast('O Mestre bloqueou interações (criação de peças e dados) no momento.');
      }
      return true;
    }
    return false;
  },

  togglePlayersLock() {
    if (window.Multiplayer && !window.Multiplayer.isHost) {
      this.showToast('Apenas o Mestre da sala pode bloquear ou liberar ações dos jogadores.');
      return;
    }
    this.mapConfig.playersLocked = !this.mapConfig.playersLocked;
    this.refreshAllPieceVisibilities();
    this.broadcastMapSettingsOnly();
    window.Multiplayer.broadcast({
      type: 'player_lock_toggle',
      locked: this.mapConfig.playersLocked
    });
    this.showToast(
      this.mapConfig.playersLocked
        ? 'Ações dos jogadores BLOQUEADAS (não podem criar modelos, mover peças ou jogar dados).'
        : 'Ações dos jogadores LIBERADAS!'
    );
  },

  refreshAllPieceVisibilities() {
    const isGM = window.Multiplayer.myRole === 'gm';
    const isHost = !!window.Multiplayer.isHost;
    const isLockedForMe = !isHost && !!this.mapConfig.playersLocked;

    const roleSelect = document.getElementById('role-select');
    if (roleSelect && roleSelect.value !== window.Multiplayer.myRole) {
      roleSelect.value = window.Multiplayer.myRole;
    }

    // 1. Toggle GM-only HUD controls (Map selection, Fog tool, Map & Grid configuration)
    const btnLobby = document.getElementById('btn-open-lobby');
    const btnFogTool = document.getElementById('btn-tool-fog');
    const btnMapGrid = document.getElementById('btn-dock-mapgrid');
    const btnSyncCam = document.getElementById('btn-sync-gm-cam');
    const btnLockPlayers = document.getElementById('btn-lock-players');
    const lockedBadge = document.getElementById('player-locked-badge');
    const btnLibrary = document.getElementById('btn-dock-library');
    const diceDock = document.getElementById('dice-dock');

    if (btnLobby) btnLobby.style.display = (isGM && isHost) ? '' : 'none';
    if (btnFogTool) btnFogTool.style.display = (isGM && isHost) ? '' : 'none';
    if (btnMapGrid) btnMapGrid.style.display = (isGM && isHost) ? '' : 'none';

    if (btnLockPlayers) {
      btnLockPlayers.style.display = isHost ? '' : 'none';
      btnLockPlayers.classList.toggle('active', !!this.mapConfig.playersLocked);
      btnLockPlayers.style.color = this.mapConfig.playersLocked ? '#f87171' : '';
      btnLockPlayers.style.borderColor = this.mapConfig.playersLocked ? 'rgba(248,113,113,0.55)' : '';
    }

    if (lockedBadge) {
      lockedBadge.style.display = isLockedForMe ? 'inline-block' : 'none';
    }
    if (btnLibrary) {
      btnLibrary.style.display = isLockedForMe ? 'none' : '';
    }
    if (diceDock) {
      diceDock.style.display = isLockedForMe ? 'none' : '';
    }

    if (isLockedForMe) {
      document.getElementById('library-drawer')?.classList.add('closed');
      document.getElementById('inspector-drawer')?.classList.add('closed');
      if (this.activeTool === 'draw' || this.activeTool === 'pin') {
        this.setTool('grab');
      }
    }

    if (!isGM || !isHost) {
      document.getElementById('mapgrid-drawer')?.classList.add('closed');
      if (this.activeTool === 'fog') {
        this.setTool('grab');
      }
    }

    if (btnSyncCam) {
      if (window.Multiplayer.isHost) {
        btnSyncCam.title = 'Puxar Câmera dos Jogadores para Minha Visão Atual';
        btnSyncCam.classList.remove('active');
      } else {
        btnSyncCam.title = this.camState.followGmCamera
          ? 'Seguindo Câmera do Mestre (Clique para Câmera Livre)'
          : 'Sincronizar Câmera com a Visão do Mestre';
        btnSyncCam.classList.toggle('active', !!this.camState.followGmCamera);
      }
    }

    // 2. Fog of War opacity: Translucent (0.48) in GM View vs Solid Opaque (0.98) in Player View
    if (this.fogMat) {
      this.fogMat.opacity = isGM ? 0.48 : 0.98;
      this.fogMat.needsUpdate = true;
    }

    // 3. Piece Visibility & Ghost Transparency for Invisible Pieces in GM View
    this.pieces.forEach((p, id) => {
      const mesh = this.pieceMeshes.get(id);
      if (mesh) {
        mesh.visible = this.isPieceVisibleToCurrentUser(p);
        const isInvisible = (p.conditions || []).includes('invisible');
        const fig = mesh.getObjectByName('figureGroup');
        if (fig) {
          fig.traverse(child => {
            if (child.isMesh && child.material) {
              if (isInvisible && isGM) {
                child.material.transparent = true;
                child.material.opacity = 0.48;
              } else if (child.userData.origOpacity !== undefined) {
                child.material.opacity = child.userData.origOpacity;
              }
            }
          });
        }
      }
      this.updatePieceDOMLabel(p);
    });
  },

  setDrawMode(mode) {
    this.drawConfig.mode = mode || 'pen';
    document.querySelectorAll('#sub-draw-controls .draw-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === this.drawConfig.mode);
    });

    const penDock = document.querySelector('.icon-btn[data-tool="draw"]');
    const eraserDock = document.querySelector('.icon-btn[data-tool="eraser"]');
    if (penDock) penDock.classList.toggle('active', this.activeTool === 'draw' && this.drawConfig.mode !== 'eraser');
    if (eraserDock) eraserDock.classList.toggle('active', this.activeTool === 'draw' && this.drawConfig.mode === 'eraser');

    if (mode === 'text') {
      this.showToast('Caixa de Texto: Clique no mapa onde deseja escrever!');
    } else if (mode === 'eraser') {
      this.showToast('Borracha ativada: Clique e arraste sobre o mapa para apagar traços e textos.');
    }
  },

  drawStrokeOnTable(u1, v1, u2, v2, mode, color, size, broadcast = true) {
    const ctx = this.drawCtx;
    const w = this.drawCanvas.width;
    const h = this.drawCanvas.height;
    const x1 = u1 * w, y1 = v1 * h;
    const x2 = u2 * w, y2 = v2 * h;

    ctx.save();
    if (mode === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = Math.max(12, size * 3.5);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    } else if (mode === 'pen' || mode === 'line') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    } else if (mode === 'circle') {
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      const r = Math.hypot(x2 - x1, y2 - y1);
      ctx.beginPath();
      ctx.arc(x1, y1, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (mode === 'rect') {
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    }
    ctx.restore();

    this.drawTexture.needsUpdate = true;

    if (broadcast) {
      window.Multiplayer.broadcast({
        type: 'draw_stroke',
        u1, v1, u2, v2, mode, color, size
      });
    }
  },

  drawTextOnTable(u, v, text, color = '#ffffff', fontSize = 8, broadcast = true) {
    if (!text || !this.drawCtx) return;
    const ctx = this.drawCtx;
    const w = this.drawCanvas.width;
    const h = this.drawCanvas.height;
    const x = Math.max(16, Math.min(w - 20, u * w));
    const y = Math.max(16, Math.min(h - 20, v * h));

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    const baseSize = Math.max(16, Math.min(64, Math.round((Number(fontSize) || 8) * 2.5)));
    ctx.font = `700 ${baseSize}px 'Segoe UI', system-ui, -apple-system, sans-serif`;

    const lines = String(text).split('\n').filter(l => l.length > 0);
    if (lines.length === 0) {
      ctx.restore();
      return;
    }

    let maxWidth = 0;
    lines.forEach(line => {
      const metrics = ctx.measureText(line);
      if (metrics.width > maxWidth) maxWidth = metrics.width;
    });

    const lineHeight = baseSize * 1.25;
    const padX = 14;
    const padY = 9;
    const boxW = maxWidth + padX * 2;
    const boxH = lines.length * lineHeight + padY * 2;
    const boxX = Math.max(8, Math.min(w - boxW - 8, x - 10));
    const boxY = Math.max(8, Math.min(h - boxH - 8, y - 10));

    // Dark frosted translucent plaque background
    ctx.fillStyle = 'rgba(11, 14, 20, 0.88)';
    ctx.strokeStyle = color || '#c94a4a';
    ctx.lineWidth = 2.5;

    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 8);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeRect(boxX, boxY, boxW, boxH);
    }

    // Text rendering with subtle shadow for crispness
    ctx.fillStyle = color || '#ffffff';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    lines.forEach((line, idx) => {
      ctx.fillText(line, boxX + padX, boxY + padY + idx * lineHeight);
    });

    ctx.restore();
    this.drawTexture.needsUpdate = true;

    if (broadcast) {
      window.Multiplayer.broadcast({
        type: 'draw_text',
        u, v, text, color, fontSize: fontSize || this.drawConfig.size
      });
    }
  },

  clearTableDrawings(broadcast = true) {
    this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
    this.drawTexture.needsUpdate = true;
    if (broadcast) {
      window.Multiplayer.broadcast({ type: 'draw_clear' });
    }
  },

  worldToUV(x, z) {
    return {
      x: (x + this.tableWidth / 2) / this.tableWidth,
      y: (z + this.tableDepth / 2) / this.tableDepth
    };
  },

  spawnPing3D(x, z, color = '#c2a36b', senderName = 'Mestre', broadcast = true) {
    const group = new THREE.Group();
    group.position.set(x, 0.08, z);

    const ringGeo = new THREE.RingGeometry(0.2, 0.45, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    const beamGeo = new THREE.CylinderGeometry(0.06, 0.3, 14, 16);
    const beamMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 7;
    group.add(beam);

    this.scene.add(group);
    this.activePings.push({ group, ring, beam, age: 0 });

    if (window.SoundEngine) {
      window.SoundEngine.playPingSound();
    }

    if (broadcast) {
      window.Multiplayer.broadcast({
        type: 'ping_3d',
        x,
        z,
        color,
        senderName
      });
    }
  },

  spawnDicePopup(worldPos, value, sides) {
    const screen = this.worldToScreen(worldPos.clone().add(new THREE.Vector3(0, 1.5, 0)));
    if (!screen.visible) return;
    const el = document.createElement('div');
    el.className = 'dice-float-popup';
    el.style.left = `${screen.x}px`;
    el.style.top = `${screen.y}px`;
    if (Number(sides) === 20 && value === 20) {
      el.style.color = '#68a378';
      el.textContent = `20 CRÍTICO`;
    } else if (Number(sides) === 20 && value === 1) {
      el.style.color = '#c94a4a';
      el.textContent = `1 FALHA`;
    } else {
      el.textContent = `${value}`;
    }
    document.getElementById('labels-container').appendChild(el);
    setTimeout(() => el.remove(), 2000);
  },

  onDiceRollFinished(rollResult) {
    const { sides, count, results, total, playerName, mode, mod } = rollResult;
    const modifier = Number(mod) || 0;
    const modStr = modifier !== 0 ? (modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`) : '';
    const secretPrefix = mode === 'secret' ? '<em>[Secreta]</em> ' : '';
    const safeName = this.escapeHtml(playerName);

    let finalTotal;
    let chatHtml;
    let bannerFormula;
    let isCrit20 = false;
    let isCrit1 = false;

    if ((mode === 'adv' || mode === 'dis') && sides === 20 && results.length >= 2) {
      const isAdv = mode === 'adv';
      const chosen = isAdv ? Math.max(results[0], results[1]) : Math.min(results[0], results[1]);
      isCrit20 = chosen === 20;
      isCrit1 = chosen === 1;
      finalTotal = chosen + modifier;
      const modeText = isAdv ? 'com vantagem' : 'com desvantagem';
      bannerFormula = `d20 ${modeText} [${results.join(', ')}] → ${chosen}${modStr}`;
      chatHtml = `${secretPrefix}<strong>${safeName}</strong> rolou <strong>d20 ${modeText}</strong>: [${results.join(', ')}] → ${chosen}${modStr} = <strong>${finalTotal}</strong>`;
    } else {
      finalTotal = total + modifier;
      isCrit20 = sides === 20 && count === 1 && results[0] === 20;
      isCrit1 = sides === 20 && count === 1 && results[0] === 1;
      const formula = `${count}d${sides}`;
      const list = results.length > 1 ? `[${results.join(', ')}]` : `[${results[0]}]`;
      bannerFormula = `${formula} ${list}${modStr}`;
      chatHtml = `${secretPrefix}<strong>${safeName}</strong> rolou <strong>${formula}</strong>: ${list}${modStr} = <strong>${finalTotal}</strong>`;
    }

    if (isCrit20) chatHtml += ' — <strong>Sucesso crítico</strong>';
    if (isCrit1) chatHtml += ' — <strong>Falha crítica</strong>';

    this.addChatMessage(chatHtml, isCrit20 ? 'crit-success' : (isCrit1 ? 'crit-fail' : 'roll-msg'));
    this.showRollResultBanner(playerName, bannerFormula, finalTotal, isCrit20 ? 'crit' : (isCrit1 ? 'fail' : ''), mode === 'secret');

    if (window.SoundEngine) {
      window.SoundEngine.playChime(isCrit20, isCrit1);
    }
  },

  showRollResultBanner(playerName, formula, total, tone = '', isSecret = false) {
    let stack = document.getElementById('roll-banner-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'roll-banner-stack';
      document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = `roll-banner ${tone}`;
    el.innerHTML = `
      <div class="roll-banner-who">${this.escapeHtml(playerName)}${isSecret ? ' <span class="roll-banner-secret">secreta</span>' : ''}</div>
      <div class="roll-banner-main">
        <span class="roll-banner-formula">${this.escapeHtml(formula)}</span>
        <span class="roll-banner-total">${total}</span>
      </div>`;
    stack.appendChild(el);
    while (stack.children.length > 3) stack.firstElementChild.remove();
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 400);
    }, 5200);
  },

  getTableIntersection(clientX, clientY) {
    this.mouseNDC.x = (clientX / window.innerWidth) * 2 - 1;
    this.mouseNDC.y = -(clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouseNDC, this.camera);
    const pt = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, pt);
    if (!hit) return null;
    const halfW = this.tableWidth / 2;
    const halfD = this.tableDepth / 2;
    pt.x = Math.max(-halfW, Math.min(halfW, pt.x));
    pt.z = Math.max(-halfD, Math.min(halfD, pt.z));
    return pt;
  },

  pickPieceAtMouse(clientX, clientY) {
    this.mouseNDC.x = (clientX / window.innerWidth) * 2 - 1;
    this.mouseNDC.y = -(clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouseNDC, this.camera);

    const meshes = Array.from(this.pieceMeshes.values()).filter(m => m.visible);
    const hits = this.raycaster.intersectObjects(meshes, true);
    if (hits.length === 0) return null;

    let obj = hits[0].object;
    while (obj && !obj.userData.pieceId) {
      obj = obj.parent;
    }
    return obj ? obj.userData.pieceId : null;
  },

  pickDieAtMouse(clientX, clientY) {
    if (!window.DiceRoller3D || window.DiceRoller3D.activeDice.length === 0) return null;
    this.mouseNDC.x = (clientX / window.innerWidth) * 2 - 1;
    this.mouseNDC.y = -(clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouseNDC, this.camera);

    const dieMeshes = window.DiceRoller3D.activeDice.map(d => d.mesh).filter(Boolean);
    const hits = this.raycaster.intersectObjects(dieMeshes, true);
    if (hits.length === 0) return null;

    let obj = hits[0].object;
    while (obj && !obj.userData.dieId) {
      obj = obj.parent;
    }
    return obj ? obj.userData.dieId : null;
  },

  updateCameraTransform(broadcast = true) {
    if (this.camState.isTopDown) {
      this.camera.position.set(
        this.camState.target.x,
        this.camState.spherical.radius * 1.15,
        this.camState.target.z + 0.01
      );
      this.camera.lookAt(this.camState.target);
    } else {
      const { radius, phi, theta } = this.camState.spherical;
      const sinPhiRadius = Math.sin(phi) * radius;
      this.camera.position.x = this.camState.target.x + sinPhiRadius * Math.sin(theta);
      this.camera.position.y = this.camState.target.y + Math.cos(phi) * radius;
      this.camera.position.z = this.camState.target.z + sinPhiRadius * Math.cos(theta);
      this.camera.lookAt(this.camState.target);
    }

    if (broadcast && window.Multiplayer && window.Multiplayer.isHost && window.Multiplayer.roomCode) {
      const now = performance.now();
      if (now - this.camState.lastGmCamSend > 85) {
        this.camState.lastGmCamSend = now;
        window.Multiplayer.broadcast({
          type: 'gm_cam',
          cam: this.getSerializedCamState()
        });
      }
    }
  },

  worldToScreen(pos3D) {
    const v = pos3D.clone().project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-(v.y * 0.5) + 0.5) * window.innerHeight,
      visible: v.z < 1
    };
  },

  initEventListeners() {
    const dom = this.renderer.domElement;

    dom.addEventListener('contextmenu', e => e.preventDefault());

    dom.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        this.camState.isOrbiting = true;
        this.camState.lastMouseX = e.clientX;
        this.camState.lastMouseY = e.clientY;
        return;
      }

      if (e.button === 1 || (e.button === 0 && this.camState.keys['Space'])) {
        this.camState.isPanning = true;
        this.camState.lastMouseX = e.clientX;
        this.camState.lastMouseY = e.clientY;
        return;
      }

      if (e.button !== 0) return;

      const pt = this.getTableIntersection(e.clientX, e.clientY);
      if (!pt) return;

      if (this.activeTool === 'laser' || this.camState.keys['KeyX']) {
        if (window.Effects3D) {
          window.Effects3D.addLaserPoint(window.Multiplayer.myId, pt.x, pt.z, window.Effects3D.myLaserColor, true);
        }
        return;
      }

      if (this.activeTool === 'aoe') {
        if (this.isPlayerActionBlocked(true)) return;
        if (window.Effects3D) {
          window.Effects3D.handleTableClickInAoEMode(pt.x, pt.z);
        }
        return;
      }

      if (e.altKey || this.activeTool === 'ping') {
        this.spawnPing3D(pt.x, pt.z, window.Multiplayer.myColor, window.Multiplayer.myName, true);
        return;
      }

      if (this.activeTool === 'pin') {
        if (this.isPlayerActionBlocked(true)) return;
        const pinLabel = prompt('Nome do Marcador:', 'Ponto de Interesse');
        if (pinLabel) {
          const snapped = window.MapGenerator.snapWorldPosition(pt.x, pt.z, this.mapConfig.grid, this.tableWidth, this.tableDepth);
          const newPin = {
            id: 'pin_' + Date.now(),
            name: pinLabel,
            style: 'pin',
            preset: 'quest',
            color: '#c2a36b',
            x: snapped.x,
            z: snapped.z,
            rotation: 0,
            sizeScale: 1,
            hp: 0,
            maxHp: 0
          };
          this.addOrUpdatePiece(newPin, true);
          this.selectPiece(newPin.id);
        }
        return;
      }

      if (this.activeTool === 'ruler') {
        const snapped = this.mapConfig.grid.snap
          ? window.MapGenerator.snapWorldPosition(pt.x, pt.z, this.mapConfig.grid, this.tableWidth, this.tableDepth)
          : { x: pt.x, z: pt.z };
        this.startRuler(snapped.x, snapped.z);
        return;
      }

      if (this.activeTool === 'draw') {
        if (this.isPlayerActionBlocked(true)) return;
        const uv = this.worldToUV(pt.x, pt.z);
        if (this.drawConfig.mode === 'text') {
          const text = prompt('Digite o texto a ser escrito nesta posição da mesa:');
          if (text && text.trim()) {
            this.drawTextOnTable(uv.x, uv.y, text.trim(), this.drawConfig.color, this.drawConfig.size, true);
          }
          return;
        }
        this.drawConfig.isDrawing = true;
        this.drawConfig.startUV = uv;
        this.drawConfig.lastUV = uv;
        if (this.drawConfig.mode === 'pen' || this.drawConfig.mode === 'eraser') {
          this.drawStrokeOnTable(uv.x, uv.y, uv.x, uv.y, this.drawConfig.mode, this.drawConfig.color, this.drawConfig.size, true);
        }
        return;
      }

      if (this.activeTool === 'fog') {
        if (!window.Multiplayer.isHost) return;
        if (!this.mapConfig.fogEnabled) {
          this.toggleFogOfWar(true);
        }
        const uv = this.worldToUV(pt.x, pt.z);
        this.fogConfig.isPainting = true;
        this.paintFogAtUV(uv.x, uv.y, this.fogConfig.brushSize, this.fogConfig.mode, true);
        return;
      }

      // First check if user clicked on a 3D Die on the table!
      const hitDieId = this.pickDieAtMouse(e.clientX, e.clientY);
      if (hitDieId) {
        if (this.isPlayerActionBlocked(true)) return;
        this.selectedDieId = hitDieId;
        this.selectPiece(null);
        const dieObj = window.DiceRoller3D.activeDice.find(d => d.id === hitDieId);
        if (dieObj) {
          this.grabState.dieId = hitDieId;
          dieObj.grabbed = true;
          this.grabState.prevPos.copy(dieObj.mesh.position);
          this.grabState.targetPos.set(pt.x, 2.5, pt.z);
          this.grabState.velocity.set(0, 0, 0);
        }
        return;
      }

      this.selectedDieId = null;
      const hitPieceId = this.pickPieceAtMouse(e.clientX, e.clientY);
      if (hitPieceId) {
        if (this.isPlayerActionBlocked(true)) return;
        this.selectPiece(hitPieceId);
        const piece = this.pieces.get(hitPieceId);
        if (piece && !piece.locked) {
          this.grabState.pieceId = hitPieceId;
          this.grabState.dragStartPos = { x: piece.x, z: piece.z };
          this.grabState.currentPos.set(piece.x, this.grabState.liftHeight, piece.z);
          this.grabState.targetPos.set(piece.x, this.grabState.liftHeight, piece.z);
          this.grabState.ghostRing.visible = true;
          this.grabState.ghostRing.position.set(piece.x, 0.05, piece.z);
        }
      } else {
        this.selectPiece(null);
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.camState.isOrbiting) {
        const dx = e.clientX - this.camState.lastMouseX;
        const dy = e.clientY - this.camState.lastMouseY;
        this.camState.lastMouseX = e.clientX;
        this.camState.lastMouseY = e.clientY;

        if (!this.camState.isTopDown) {
          this.camState.spherical.theta -= dx * 0.0075;
          this.camState.spherical.phi = Math.max(0.18, Math.min(1.42, this.camState.spherical.phi - dy * 0.0065));
          this.updateCameraTransform();
        }
        return;
      }

      if (this.camState.isPanning) {
        const dx = e.clientX - this.camState.lastMouseX;
        const dy = e.clientY - this.camState.lastMouseY;
        this.camState.lastMouseX = e.clientX;
        this.camState.lastMouseY = e.clientY;

        const panFactor = this.camState.spherical.radius * 0.0016;
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        this.camState.target.addScaledVector(right, -dx * panFactor);
        this.camState.target.addScaledVector(forward, dy * panFactor);
        this.updateCameraTransform();
        return;
      }

      if (!this.grabState.pieceId && !this.grabState.dieId && this.activeTool === 'grab') {
        this.hoveredPieceId = this.pickPieceAtMouse(e.clientX, e.clientY);
        this.hoveredDieId = this.pickDieAtMouse(e.clientX, e.clientY);
      }

      const pt = this.getTableIntersection(e.clientX, e.clientY);
      if (!pt) return;

      if (this.activeTool === 'laser' || this.camState.keys['KeyX']) {
        if (window.Effects3D) {
          window.Effects3D.addLaserPoint(window.Multiplayer.myId, pt.x, pt.z, window.Effects3D.myLaserColor, true);
        }
      }

      if (this.activeTool === 'aoe') {
        if (window.Effects3D) {
          window.Effects3D.updateAoEPosition(pt.x, pt.z, !!window.Effects3D.draggingAoEId);
        }
      }

      const now = performance.now();
      if (now - this.lastCursorSend > 75) {
        this.lastCursorSend = now;
        window.Multiplayer.broadcast({
          type: 'cursor_3d',
          x: pt.x,
          z: pt.z
        });
      }

      // Dragging a 3D Die in the air
      if (this.grabState.dieId) {
        this.grabState.velocity.set(
          (pt.x - this.grabState.targetPos.x) * 0.35,
          0,
          (pt.z - this.grabState.targetPos.z) * 0.35
        );
        this.grabState.targetPos.set(pt.x, 2.5, pt.z);
        return;
      }

      if (this.rulerState.active) {
        const snapped = this.mapConfig.grid.snap
          ? window.MapGenerator.snapWorldPosition(pt.x, pt.z, this.mapConfig.grid, this.tableWidth, this.tableDepth)
          : { x: pt.x, z: pt.z };
        this.updateRuler(snapped.x, snapped.z);
        return;
      }

      if (this.drawConfig.isDrawing && this.activeTool === 'draw') {
        const uv = this.worldToUV(pt.x, pt.z);
        if (this.drawConfig.mode === 'pen' || this.drawConfig.mode === 'eraser') {
          this.drawStrokeOnTable(
            this.drawConfig.lastUV.x,
            this.drawConfig.lastUV.y,
            uv.x,
            uv.y,
            this.drawConfig.mode,
            this.drawConfig.color,
            this.drawConfig.size,
            true
          );
          this.drawConfig.lastUV = uv;
        }
        return;
      }

      if (this.fogConfig.isPainting && this.activeTool === 'fog') {
        const uv = this.worldToUV(pt.x, pt.z);
        this.paintFogAtUV(uv.x, uv.y, this.fogConfig.brushSize, this.fogConfig.mode, true);
        return;
      }

      if (this.grabState.pieceId) {
        this.grabState.targetPos.set(pt.x, this.grabState.liftHeight, pt.z);
        const snapped = window.MapGenerator.snapWorldPosition(
          pt.x,
          pt.z,
          this.mapConfig.grid,
          this.tableWidth,
          this.tableDepth
        );
        this.grabState.ghostRing.position.set(snapped.x, 0.05, snapped.z);

        if (this.camState.keys['Tab'] && this.grabState.dragStartPos) {
          if (!this.rulerState.active) {
            this.startRuler(this.grabState.dragStartPos.x, this.grabState.dragStartPos.z);
          }
          this.updateRuler(snapped.x, snapped.z);
        }

        if (now - this.lastCursorSend > 50) {
          window.Multiplayer.broadcast({
            type: 'piece_drag',
            pieceId: this.grabState.pieceId,
            x: pt.x,
            y: this.grabState.liftHeight,
            z: pt.z
          });
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.camState.isOrbiting = false;
      if (e.button === 1) this.camState.isPanning = false;

      if (e.button === 0) {
        if (window.Effects3D && window.Effects3D.draggingAoEId) {
          window.Effects3D.draggingAoEId = null;
        }
        // Release grabbed Die -> Toss & roll it!
        if (this.grabState.dieId) {
          window.DiceRoller3D.tossSingleDie(
            this.grabState.dieId,
            this.grabState.targetPos.x,
            this.grabState.targetPos.z,
            this.grabState.velocity.x,
            this.grabState.velocity.z
          );
          this.grabState.dieId = null;
        }

        if (this.rulerState.active && this.activeTool === 'ruler') {
          this.stopRuler();
        }

        if (this.drawConfig.isDrawing) {
          const pt = this.getTableIntersection(e.clientX, e.clientY);
          if (pt && ['line', 'circle', 'rect'].includes(this.drawConfig.mode)) {
            const uv = this.worldToUV(pt.x, pt.z);
            this.drawStrokeOnTable(
              this.drawConfig.startUV.x,
              this.drawConfig.startUV.y,
              uv.x,
              uv.y,
              this.drawConfig.mode,
              this.drawConfig.color,
              this.drawConfig.size,
              true
            );
          }
          this.drawConfig.isDrawing = false;
        }

        this.fogConfig.isPainting = false;

        if (this.grabState.pieceId) {
          const piece = this.pieces.get(this.grabState.pieceId);
          const mesh = this.pieceMeshes.get(this.grabState.pieceId);
          if (piece && mesh) {
            const snapped = window.MapGenerator.snapWorldPosition(
              this.grabState.targetPos.x,
              this.grabState.targetPos.z,
              this.mapConfig.grid,
              this.tableWidth,
              this.tableDepth
            );
            piece.x = snapped.x;
            piece.z = snapped.z;
            mesh.position.x = snapped.x;
            mesh.position.z = snapped.z;
            mesh.rotation.x = 0;
            mesh.rotation.z = 0;

            this.fallingPieces.push({
              mesh,
              vy: -0.08
            });

            window.Multiplayer.broadcast({
              type: 'piece_update',
              piece
            });
          }
          this.grabState.pieceId = null;
          this.grabState.ghostRing.visible = false;
          this.stopRuler();
        }
      }
    });

    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      const targetId = this.grabState.pieceId || (e.altKey ? this.selectedPieceId : null);

      if (targetId && e.altKey) {
        const p = this.pieces.get(targetId);
        if (p) {
          const delta = e.deltaY < 0 ? 1.5 : -1.5;
          p.elevation = Math.max(0, Math.round(((p.elevation || 0) + delta) * 10) / 10);
          this.addOrUpdatePiece(p, true);
          this.populateInspectorUI();
        }
        return;
      }

      if (this.activeTool === 'aoe' && window.Effects3D) {
        if (e.shiftKey) {
          window.Effects3D.adjustAoERotation(e.deltaY < 0 ? 15 : -15, true);
        } else {
          window.Effects3D.adjustAoERadius(e.deltaY < 0 ? 0.5 : -0.5, true);
        }
        return;
      }

      if (this.grabState.pieceId) {
        const p = this.pieces.get(this.grabState.pieceId);
        const mesh = this.pieceMeshes.get(this.grabState.pieceId);
        if (p && mesh) {
          p.rotation = (p.rotation || 0) + (e.deltaY < 0 ? Math.PI / 8 : -Math.PI / 8);
          mesh.rotation.y = p.rotation;
        }
        return;
      }

      this.camState.spherical.radius = Math.max(8, Math.min(72, this.camState.spherical.radius + e.deltaY * 0.025));
      this.updateCameraTransform();
    }, { passive: false });

    window.addEventListener('dblclick', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const hitPieceId = this.pickPieceAtMouse(e.clientX, e.clientY);
      if (hitPieceId) {
        this.selectPiece(hitPieceId);
        this.focusCameraOnPiece(hitPieceId);
      }
    });

    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

      this.camState.keys[e.code] = true;

      const activeId = this.grabState.pieceId || this.selectedPieceId;
      const activePiece = activeId ? this.pieces.get(activeId) : null;
      const activeDieId = this.grabState.dieId || this.hoveredDieId || this.selectedDieId;

      if (e.key === '1') this.setTool('grab');
      else if (e.key === '2') this.setTool('ruler');
      else if (e.key === '3') { this.setTool('draw'); this.setDrawMode('pen'); }
      else if (e.key === '4' || e.key.toLowerCase() === 'b') { this.setTool('draw'); this.setDrawMode('eraser'); }
      else if (e.key === '5') this.setTool('fog');
      else if (e.key === '6') this.setTool('ping');
      else if (e.key === '7') this.setTool('pin');
      else if (e.key === '8') this.setTool('laser');
      else if (e.key === '9') this.setTool('aoe');
      else if (e.key.toLowerCase() === 'x') {
        const pt = this.getTableIntersection(this.camState.lastMouseX, this.camState.lastMouseY);
        if (pt && window.Effects3D) {
          window.Effects3D.addLaserPoint(window.Multiplayer.myId, pt.x, pt.z, window.Effects3D.myLaserColor, true);
        }
      }
      else if (this.activeTool === 'aoe' && window.Effects3D && (e.key === 'Delete' || e.key === 'Backspace')) {
        window.Effects3D.removePinnedAoE(null, true);
      }
      else if (this.activeTool === 'aoe' && window.Effects3D && (e.key.toLowerCase() === 'q' || e.key.toLowerCase() === 'e')) {
        window.Effects3D.adjustAoERotation(e.key.toLowerCase() === 'e' ? 15 : -15, true);
      }
      else if (e.key.toLowerCase() === 't') this.toggleTopDownCamera();
      else if (e.key.toLowerCase() === 'g') {
        this.mapConfig.grid.snap = !this.mapConfig.grid.snap;
        this.showToast(`Alinhamento na grade: ${this.mapConfig.grid.snap ? 'Ativado' : 'Desativado'}`);
        this.updateUI();
      } else if (e.code === 'Space') {
        this.camState.target.set(0, 0, 0);
        this.updateCameraTransform();
      } else if (e.code === 'KeyF') {
        const targetId = this.selectedPieceId || this.hoveredPieceId;
        if (targetId) {
          this.focusCameraOnPiece(targetId);
        }
      } else if (activeDieId && (e.key === 'Delete' || e.key === 'Backspace')) {
        if (this.isPlayerActionBlocked(true)) return;
        window.DiceRoller3D.removeDie(activeDieId, true);
        this.selectedDieId = null;
        this.hoveredDieId = null;
      } else if (activeDieId && e.key.toLowerCase() === 'r') {
        if (this.isPlayerActionBlocked(true)) return;
        const dieObj = window.DiceRoller3D.activeDice.find(d => d.id === activeDieId);
        if (dieObj) {
          window.DiceRoller3D.tossSingleDie(activeDieId, dieObj.mesh.position.x, dieObj.mesh.position.z, 0, 0);
        }
      } else if (activePiece) {
        if (this.isPlayerActionBlocked(true)) return;
        if (e.key.toLowerCase() === 'q') {
          activePiece.rotation = (activePiece.rotation || 0) - Math.PI / 4;
          this.addOrUpdatePiece(activePiece, true);
        } else if (e.key.toLowerCase() === 'e') {
          activePiece.rotation = (activePiece.rotation || 0) + Math.PI / 4;
          this.addOrUpdatePiece(activePiece, true);
        } else if (e.key.toLowerCase() === 'f') {
          if (activePiece.preset === 'door') {
            activePiece.doorOpen = !activePiece.doorOpen;
          } else {
            activePiece.prone = !activePiece.prone;
          }
          this.addOrUpdatePiece(activePiece, true);
        } else if (e.key.toLowerCase() === 'l') {
          activePiece.locked = !activePiece.locked;
          this.showToast(`${activePiece.name}: ${activePiece.locked ? 'Travado' : 'Destravado'}`);
          this.addOrUpdatePiece(activePiece, true);
          this.populateInspectorUI();
        } else if (e.key === '+' || e.key === '=') {
          activePiece.sizeScale = Math.min(4, (activePiece.sizeScale || 1) + 0.5);
          this.addOrUpdatePiece(activePiece, true);
          this.populateInspectorUI();
        } else if (e.key === '-') {
          activePiece.sizeScale = Math.max(0.5, (activePiece.sizeScale || 1) - 0.5);
          this.addOrUpdatePiece(activePiece, true);
          this.populateInspectorUI();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          this.deletePiece(activePiece.id, true);
        } else if (e.ctrlKey && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          this.duplicateSelectedPiece();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.camState.keys[e.code] = false;
      if (e.code === 'Tab' && this.rulerState.active && this.activeTool !== 'ruler') {
        this.stopRuler();
      }
    });

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      this.handleDroppedFile(file);
    });
  },

  handleDroppedFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        this.pendingDroppedImageUrl = ev.target.result;
        this.pendingDroppedFileName = file.name.replace(/\.[^/.]+$/, '');
        document.getElementById('drop-image-modal').classList.add('open');
      };
      reader.readAsDataURL(file);
    } else if (ext === 'json') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const state = JSON.parse(ev.target.result);
          this.applyFullTableState(state, true);
          document.getElementById('lobby-screen').classList.add('hidden');
          this.showToast('Mesa carregada com sucesso.');
        } catch (err) {
          this.showToast('Erro ao ler arquivo JSON.');
        }
      };
      reader.readAsText(file);
    }
  },

  startRuler(x, z) {
    this.rulerState.active = true;
    this.rulerState.startPt = new THREE.Vector3(x, 0.35, z);
    this.rulerState.endPt = new THREE.Vector3(x, 0.35, z);
    this.rulerState.startRing.position.set(x, 0.06, z);
    this.rulerState.endRing.position.set(x, 0.06, z);
    this.rulerState.startRing.visible = true;
    this.rulerState.endRing.visible = true;
    this.rulerState.lineMesh.visible = true;
    this.updateRuler(x, z);
  },

  updateRuler(x, z) {
    if (!this.rulerState.active) return;
    this.rulerState.endPt.set(x, 0.35, z);
    this.rulerState.endRing.position.set(x, 0.06, z);
    this.rulerState.lineMesh.geometry.setFromPoints([
      this.rulerState.startPt,
      this.rulerState.endPt
    ]);

    const distUnits = Math.hypot(
      this.rulerState.endPt.x - this.rulerState.startPt.x,
      this.rulerState.endPt.z - this.rulerState.startPt.z
    );
    const cellSize = this.mapConfig.grid.cellSize || 2;
    const squares = distUnits / cellSize;
    const meters = squares * 1.5;
    const feet = squares * 5;

    const mid = this.rulerState.startPt.clone().lerp(this.rulerState.endPt, 0.5);
    const screen = this.worldToScreen(mid);
    const lbl = this.rulerState.labelEl;
    if (screen.visible) {
      lbl.style.display = 'block';
      lbl.style.left = `${screen.x}px`;
      lbl.style.top = `${screen.y}px`;
      lbl.innerHTML = `${squares.toFixed(1)} q &nbsp;·&nbsp; ${meters.toFixed(1)} m &nbsp;·&nbsp; ${Math.round(feet)} ft`;
    } else {
      lbl.style.display = 'none';
    }
  },

  stopRuler() {
    this.rulerState.active = false;
    this.rulerState.startRing.visible = false;
    this.rulerState.endRing.visible = false;
    this.rulerState.lineMesh.visible = false;
    this.rulerState.labelEl.style.display = 'none';
  },

  setTool(toolName) {
    if (toolName === 'eraser') {
      this.activeTool = 'draw';
      this.setDrawMode('eraser');
    } else {
      this.activeTool = toolName;
      if (toolName === 'draw') {
        this.setDrawMode(this.drawConfig.mode === 'eraser' ? 'pen' : (this.drawConfig.mode || 'pen'));
      }
    }

    if (this.activeTool !== 'ruler') this.stopRuler();
    if (this.activeTool !== 'aoe' && window.Effects3D) {
      window.Effects3D.hideAoECursorPreview();
    }

    document.querySelectorAll('.icon-btn[data-tool]').forEach(btn => {
      if (btn.dataset.tool === 'draw') {
        btn.classList.toggle('active', this.activeTool === 'draw' && this.drawConfig.mode !== 'eraser');
      } else if (btn.dataset.tool === 'eraser') {
        btn.classList.toggle('active', this.activeTool === 'draw' && this.drawConfig.mode === 'eraser');
      } else {
        btn.classList.toggle('active', btn.dataset.tool === this.activeTool);
      }
    });

    const subBar = document.getElementById('sub-toolbar');
    const drawControls = document.getElementById('sub-draw-controls');
    const fogControls = document.getElementById('sub-fog-controls');
    const aoeControls = document.getElementById('sub-aoe-controls');
    const laserControls = document.getElementById('sub-laser-controls');

    if (this.activeTool === 'draw' || this.activeTool === 'fog' || this.activeTool === 'aoe' || this.activeTool === 'laser') {
      subBar.classList.add('visible');
      if (drawControls) drawControls.style.display = this.activeTool === 'draw' ? 'flex' : 'none';
      if (fogControls) fogControls.style.display = this.activeTool === 'fog' ? 'flex' : 'none';
      if (aoeControls) aoeControls.style.display = this.activeTool === 'aoe' ? 'flex' : 'none';
      if (laserControls) laserControls.style.display = this.activeTool === 'laser' ? 'flex' : 'none';
      if (this.activeTool === 'aoe' && window.Effects3D) {
        window.Effects3D.setAoETemplate(
          window.Effects3D.aoeTemplate.type || 'circle',
          window.Effects3D.aoeTemplate.radiusMeters || 6,
          window.Effects3D.aoeTemplate.color || '#ea580c',
          false
        );
        this.showToast('Área de Efeito: Clique no mapa para FIXAR! Use o Scroll para aumentar/diminuir.');
      }
    } else {
      subBar.classList.remove('visible');
    }

    if (toolName === 'laser') {
      const picker = document.getElementById('laser-color-picker');
      if (picker && window.Effects3D?.myLaserColor) {
        picker.value = window.Effects3D.myLaserColor;
      }
      this.showToast('Ponteiro Laser ativado! Escolha a cor na barra ou segure a tecla X.');
    }
  },

  toggleTopDownCamera() {
    this.camState.isTopDown = !this.camState.isTopDown;
    const btn = document.getElementById('btn-cam-topdown');
    if (btn) btn.classList.toggle('active', this.camState.isTopDown);
    this.updateCameraTransform();
  },

  toggleFogOfWar(forceState, broadcast = true) {
    this.mapConfig.fogEnabled = forceState !== undefined ? forceState : !this.mapConfig.fogEnabled;
    this.fogMesh.visible = this.mapConfig.fogEnabled;
    this.refreshAllPieceVisibilities();
    this.updateUI();
    if (broadcast) {
      this.broadcastMapSettingsOnly();
    }
  },

  spawnPresetPiece(category, preset, name, defaultColor, sizeScale = 1) {
    if (this.isPlayerActionBlocked(true)) return;
    const style = category === 'prop' ? 'prop' : (category === 'pin' ? 'pin' : document.getElementById('spawn-style-select')?.value || 'standee');
    const rx = (Math.random() - 0.5) * 6;
    const rz = (Math.random() - 0.5) * 6;
    const snapped = window.MapGenerator.snapWorldPosition(rx, rz, this.mapConfig.grid, this.tableWidth, this.tableDepth);

    const newPiece = {
      id: 'p_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      name,
      style,
      preset,
      imageUrl: preset === 'druid' ? 'assets/frog-druid-logo.jpg' : null,
      color: defaultColor || '#4d7c5b',
      x: snapped.x,
      z: snapped.z,
      rotation: 0,
      sizeScale,
      hp: category === 'hero' || category === 'monster' ? 30 : 0,
      maxHp: category === 'hero' || category === 'monster' ? 30 : 0,
      ac: category === 'hero' || category === 'monster' ? 14 : 0,
      elevation: 0,
      conditions: []
    };

    this.addOrUpdatePiece(newPiece, true);
    this.selectPiece(newPiece.id);

    const mesh = this.pieceMeshes.get(newPiece.id);
    if (mesh) {
      mesh.position.y = 3.5;
      this.fallingPieces.push({ mesh, vy: -0.05 });
    }
    this.showToast(`${name} adicionado à mesa.`);
  },

  spawnCustomImagePiece() {
    if (this.isPlayerActionBlocked(true)) return;
    const name = document.getElementById('custom-piece-name').value.trim() || 'Personagem';
    const style = document.getElementById('custom-piece-style').value || 'standee';
    const color = document.getElementById('custom-piece-color').value || '#4d7c5b';
    const hp = Number(document.getElementById('custom-piece-hp').value) || 30;
    const ac = Number(document.getElementById('custom-piece-ac').value) || 15;
    const sizeScale = Number(document.getElementById('custom-piece-size').value) || 1;
    const urlInput = document.getElementById('custom-piece-url').value.trim();
    const imageUrl = this.pendingCustomImageUrl || urlInput || null;

    const snapped = window.MapGenerator.snapWorldPosition(0, 2, this.mapConfig.grid, this.tableWidth, this.tableDepth);
    const newPiece = {
      id: 'cust_' + Date.now(),
      name,
      style,
      preset: 'warrior',
      color,
      imageUrl,
      x: snapped.x,
      z: snapped.z,
      rotation: 0,
      sizeScale,
      hp,
      maxHp: hp,
      ac,
      elevation: 0,
      conditions: []
    };

    this.addOrUpdatePiece(newPiece, true);
    this.selectPiece(newPiece.id);
    const mesh = this.pieceMeshes.get(newPiece.id);
    if (mesh) {
      mesh.position.y = 3.5;
      this.fallingPieces.push({ mesh, vy: -0.05 });
    }
    this.showToast(`${name} adicionado à mesa.`);
  },

  duplicateSelectedPiece() {
    if (this.isPlayerActionBlocked(true)) return;
    if (!this.selectedPieceId) return;
    const orig = this.pieces.get(this.selectedPieceId);
    if (!orig) return;

    const copy = JSON.parse(JSON.stringify(orig));
    copy.id = 'p_' + Date.now() + '_' + Math.floor(Math.random() * 999);
    copy.name = orig.name + ' (2)';
    const s = this.mapConfig.grid.cellSize || 2;
    const snapped = window.MapGenerator.snapWorldPosition(orig.x + s, orig.z, this.mapConfig.grid, this.tableWidth, this.tableDepth);
    copy.x = snapped.x;
    copy.z = snapped.z;

    this.addOrUpdatePiece(copy, true);
    this.selectPiece(copy.id);
  },

  populateInspectorUI() {
    if (!this.selectedPieceId || !this.pieces.has(this.selectedPieceId)) return;
    const p = this.pieces.get(this.selectedPieceId);
    document.getElementById('insp-name').value = p.name || '';
    document.getElementById('insp-style').value = p.style || 'standee';
    document.getElementById('insp-color').value = p.color || '#4d7c5b';
    document.getElementById('insp-hp').value = p.hp ?? 0;
    document.getElementById('insp-maxhp').value = p.maxHp ?? 0;
    document.getElementById('insp-ac').value = p.ac ?? 10;
    document.getElementById('insp-size').value = String(p.sizeScale || 1);
    document.getElementById('insp-elevation').value = p.elevation || 0;
    document.getElementById('insp-aura').checked = !!p.showAura;
    document.getElementById('insp-locked').checked = !!p.locked;

    document.querySelectorAll('#insp-conditions .cond-pill').forEach(pill => {
      const cond = pill.dataset.cond;
      pill.classList.toggle('active', (p.conditions || []).includes(cond));
    });
    this.refreshInspectorHpReadout(p);
  },

  refreshInspectorHpReadout(p) {
    const piece = p || (this.selectedPieceId ? this.pieces.get(this.selectedPieceId) : null);
    if (!piece) return;
    const bar = document.getElementById('insp-hp-bar');
    const txt = document.getElementById('insp-hp-text');
    const max = Number(piece.maxHp) || 0;
    const cur = Number(piece.hp) || 0;
    const hasTemp = max > 0 && cur > max;
    const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
    if (bar) {
      bar.style.width = `${pct}%`;
      if (hasTemp) {
        bar.style.width = '100%';
        bar.style.background = 'linear-gradient(90deg, #4d9e6d, #38bdf8)';
      } else {
        bar.style.background = pct > 50 ? '#4d9e6d' : (pct > 25 ? '#d99b26' : '#c94a4a');
      }
    }
    if (txt) {
      if (hasTemp) {
        txt.innerHTML = `<strong>${cur}</strong> / ${max} <span style="color:#7dd3fc; font-size:11px; margin-left:3px;" title="Vida temporária / extra">(+${cur - max})</span>`;
      } else {
        txt.textContent = `${cur} / ${max}`;
      }
    }
  },

  applyHpDelta(sign) {
    const input = document.getElementById('insp-hp-delta');
    const raw = Number(input?.value);
    const amount = Number.isFinite(raw) && raw > 0 ? raw : 1;
    this.adjustSelectedHp(sign * amount);
    if (input) {
      input.value = '';
      input.focus();
    }
  },

  updateSelectedPieceFromInspector() {
    if (!this.selectedPieceId) return;
    const p = this.pieces.get(this.selectedPieceId);
    if (!p) return;

    p.name = document.getElementById('insp-name').value;
    p.style = document.getElementById('insp-style').value;
    p.color = document.getElementById('insp-color').value;
    p.hp = Number(document.getElementById('insp-hp').value) || 0;
    p.maxHp = Number(document.getElementById('insp-maxhp').value) || 0;
    p.ac = Number(document.getElementById('insp-ac').value) || 0;
    p.sizeScale = Number(document.getElementById('insp-size').value) || 1;
    p.elevation = Number(document.getElementById('insp-elevation').value) || 0;
    p.showAura = document.getElementById('insp-aura').checked;
    p.auraColor = p.color;
    p.locked = document.getElementById('insp-locked').checked;

    this.addOrUpdatePiece(p, true);
    this.refreshInspectorHpReadout(p);
  },

  adjustSelectedHp(delta) {
    if (!this.selectedPieceId) return;
    const p = this.pieces.get(this.selectedPieceId);
    if (!p) return;
    const oldHp = p.hp || 0;
    // Permite ultrapassar maxHp para acomodar vida temporária/extra (ex: 35/30)
    p.hp = Math.max(0, (p.hp || 0) + delta);
    const actualDelta = p.hp - oldHp;
    const hpInput = document.getElementById('insp-hp');
    if (hpInput) hpInput.value = p.hp;
    this.addOrUpdatePiece(p, true);

    const txt = actualDelta > 0 ? `+${actualDelta}` : `${actualDelta}`;
    const col = actualDelta > 0 ? (p.hp > p.maxHp ? '#38bdf8' : '#4ade80') : '#ef4444';
    const mesh = this.pieceMeshes.get(p.id);
    const posY = mesh ? mesh.position.y + 2.5 : 2.5;
    this.spawnFloatingText(p.x, posY, p.z, txt, col);

    if (window.SoundEngine) {
      if (actualDelta < 0) window.SoundEngine.playHit?.();
      else window.SoundEngine.playHeal?.();
    }

    if (window.Multiplayer) {
      window.Multiplayer.broadcast({
        type: 'floating_dmg',
        x: p.x,
        y: posY,
        z: p.z,
        text: txt,
        color: col
      });
    }

    if (actualDelta < 0) {
      this.addChatMessage(`<strong>${this.escapeHtml(p.name)}</strong> sofreu <strong>${Math.abs(actualDelta)}</strong> de dano (PV ${p.hp}/${p.maxHp})`, 'crit-fail');
    } else if (actualDelta > 0) {
      const tempNote = (p.hp > p.maxHp && p.maxHp > 0) ? ` [inclui +${p.hp - p.maxHp} extra/temporário]` : '';
      this.addChatMessage(`<strong>${this.escapeHtml(p.name)}</strong> recuperou <strong>${actualDelta}</strong> PV (PV ${p.hp}/${p.maxHp}${tempNote})`, 'crit-success');
    }
    this.refreshInspectorHpReadout(p);
  },

  spawnFloatingText(worldX, worldY, worldZ, text, color = '#ef4444') {
    const container = document.getElementById('labels-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'floating-dmg-pop';
    el.style.color = color;
    el.textContent = text;
    container.appendChild(el);

    if (!this.floatingTexts) this.floatingTexts = [];
    this.floatingTexts.push({
      el,
      pos: new THREE.Vector3(worldX, worldY, worldZ),
      startTime: performance.now(),
      duration: 1350
    });
  },

  focusCameraOnPiece(pieceId) {
    if (!pieceId) return;
    const p = this.pieces.get(pieceId);
    if (!p) return;
    this.camState.target.set(p.x, 0, p.z);
    this.camState.spherical.radius = Math.max(12, Math.min(22, this.camState.spherical.radius));
    this.camState.spherical.phi = 0.85;
    this.camState.isTopDown = false;
    document.getElementById('btn-cam-topdown')?.classList.remove('active');
    this.updateCameraTransform();
    this.showToast(`Câmera focada em: ${p.name || 'Miniatura'}`);
  },

  togglePiecePOV() {
    if (!this.selectedPieceId) return;
    const p = this.pieces.get(this.selectedPieceId);
    const mesh = this.pieceMeshes.get(this.selectedPieceId);
    if (!p || !mesh) return;

    if (this.camState.isPOV) {
      this.camState.isPOV = false;
      this.camState.spherical.radius = 24;
      this.camState.spherical.phi = 0.85;
      this.camState.spherical.theta = 0;
      this.camState.target.set(p.x, 0, p.z);
      this.updateCameraTransform();
      this.showToast('Visão de Mesa restaurada.');
      return;
    }

    this.camState.isPOV = true;
    this.camState.isTopDown = false;
    document.getElementById('btn-cam-topdown')?.classList.remove('active');

    const rot = p.rotation || 0;
    const eyeHeight = 1.6 * (p.sizeScale || 1) + (p.elevation || 0);
    this.camera.position.set(p.x, eyeHeight, p.z);

    const lookDist = 12;
    const targetX = p.x + Math.sin(rot) * lookDist;
    const targetZ = p.z + Math.cos(rot) * lookDist;
    this.camState.target.set(targetX, eyeHeight - 0.4, targetZ);
    this.camera.lookAt(this.camState.target);

    this.showToast(`Visão em 1ª Pessoa: ${p.name || 'Personagem'} (Arraste ou clique novamente para sair)`);
  },

  generateRandomName(category = 'any') {
    const names = {
      hero: ['Valeros', 'Elowen', 'Morgran', 'Sylas', 'Lyra', 'Theron', 'Kaelen', 'Branwen', 'Aurelia', 'Durn', 'Althea', 'Gareth'],
      npc: ['Alden', 'Cedric', 'Miranda', 'Rowan', 'Dario', 'Helena', 'Bartholomew', 'Tobias', 'Greta', 'Livia', 'Milo', 'Kael'],
      monster: ['Goblin Ladino', 'Goblin Xamã', 'Orc Guerreiro', 'Lobo Sombrio', 'Urso-Coruja', 'Esqueleto Lanceiro', 'Zumbi Fétido', 'Aranha Gigante', 'Carniçal', 'Bandido Armado', 'Cultista Sinistro'],
      boss: ['Dragão Carmesim', 'Lorde Vampiro', 'Nigromante Malakar', 'Golem Rúnico', 'Demônio do Abismo', 'Quimera Real']
    };
    const pool = category !== 'any' && names[category] ? names[category] : [...names.hero, ...names.npc, ...names.monster];
    return pool[Math.floor(Math.random() * pool.length)];
  },

  toggleConditionOnSelected(cond) {
    if (!this.selectedPieceId) return;
    const p = this.pieces.get(this.selectedPieceId);
    if (!p) return;
    p.conditions = p.conditions || [];
    const idx = p.conditions.indexOf(cond);
    if (idx >= 0) p.conditions.splice(idx, 1);
    else p.conditions.push(cond);
    this.addOrUpdatePiece(p, true);
    this.populateInspectorUI();
  },

  compressImageForNetwork(dataUrl, maxDim = 1350, quality = 0.76) {
    return new Promise((resolve) => {
      if (!dataUrl || !dataUrl.startsWith('data:image') || dataUrl.length < 180000) {
        return resolve(dataUrl);
      }
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth || img.width || 1024;
        let h = img.naturalHeight || img.height || 1024;
        if (Math.max(w, h) > maxDim) {
          const ratio = maxDim / Math.max(w, h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  },

  async getNetworkSafeTableState() {
    // Keep full_sync lightweight (< 4KB) so it arrives in 1 single packet in < 50ms!
    // If the GM has a custom map image, we also trigger broadcastCustomMapWithImage() right alongside it.
    const lightSettings = this.getLightweightMapSettings();
    const piecesArr = await Promise.all(
      Array.from(this.pieces.values()).map(async (p) => {
        const cp = Object.assign({}, p);
        if (cp.imageUrl && cp.imageUrl.startsWith('data:image')) {
          cp.imageUrl = await this.compressImageForNetwork(cp.imageUrl, 384, 0.72);
        }
        return cp;
      })
    );
    return {
      mapSettings: lightSettings,
      pieces: piecesArr,
      fogDataUrl: this.fogCanvas ? this.fogCanvas.toDataURL('image/png') : null,
      drawDataUrl: this.drawCanvas ? this.drawCanvas.toDataURL('image/webp', 0.6) : null
    };
  },

  getFullTableState() {
    return {
      mapConfig: this.mapConfig,
      pieces: Array.from(this.pieces.values()),
      drawDataUrl: this.drawCanvas.toDataURL(),
      fogDataUrl: this.fogCanvas.toDataURL()
    };
  },

  applyRemoteMapSettings(s) {
    if (!s) return;
    const prevPreset = this.mapConfig.preset;
    const prevHash = this.mapConfig.customMapHash;

    this.mapConfig.preset = s.preset || 'forest';
    this.mapConfig.lighting = s.lighting || 'tavern';
    this.mapConfig.transform = s.transform || { zoom: 1, panX: 0, panY: 0, tableScale: 1, autoFitTable: true };
    this.mapConfig.grid = Object.assign(this.mapConfig.grid, s.grid || {});
    this.mapConfig.fogEnabled = !!s.fogEnabled;
    if (s.weather && window.Effects3D) {
      window.Effects3D.setWeather(s.weather, false);
      const sel = document.getElementById('weather-select');
      if (sel) sel.value = s.weather;
    }
    if (s.skybox && window.Effects3D) {
      window.Effects3D.setSkybox(s.skybox, s.customSkyboxUrl || '', false);
    }
    if (s.musicUri && window.MusicPlayer && !window.Multiplayer?.isHost && window.MusicPlayer.currentUri !== s.musicUri) {
      window.MusicPlayer.loadUri(s.musicUri, false);
    }
    if (Array.isArray(s.placedAoEs) && window.Effects3D) {
      window.Effects3D.applySerializedPlacedAoEs(s.placedAoEs);
    }
    if (typeof s.playersLocked === 'boolean') {
      this.mapConfig.playersLocked = s.playersLocked;
    }

    if (s.gmCam && !window.Multiplayer.isHost) {
      this.applyHostCamState(s.gmCam, !!this.camState.followGmCamera);
    }

    if (s.hasCustomImage) {
      if (!this.mapConfig.customImageUrl || (s.customMapHash && s.customMapHash !== prevHash)) {
        // We don't have this custom map image yet — ask Host for it immediately!
        this.needsCustomMapFromHost = true;
        this.expectedCustomMapHash = s.customMapHash;
        window.Multiplayer.broadcast({ type: 'request_custom_map' });
      } else {
        this.renderMapCanvasWithTransform(false);
      }
    } else {
      this.needsCustomMapFromHost = false;
      if (this.mapConfig.customImageUrl || this.mapConfig.preset !== prevPreset) {
        this.applyMapPreset(this.mapConfig.preset, false);
      } else {
        this.renderMapCanvasWithTransform(false);
      }
    }

    this.applyLightingMood(this.mapConfig.lighting, false);
    this.fogMesh.visible = !!this.mapConfig.fogEnabled;
    this.refreshGridLayer(false);
    this.refreshAllPieceVisibilities();
    this.updateUI();
  },

  applyFullTableState(state, broadcast = false) {
    if (!state) return;
    if (state.mapSettings) {
      this.applyRemoteMapSettings(state.mapSettings);
    } else if (state.mapConfig) {
      this.mapConfig = state.mapConfig;
      if (this.mapConfig.customImageUrl) {
        this.applyCustomMapImage(this.mapConfig.customImageUrl, false, this.mapConfig.customMapHash);
      } else {
        this.applyMapPreset(this.mapConfig.preset || 'forest', false);
      }
      this.applyLightingMood(this.mapConfig.lighting || 'tavern', false);
      this.fogMesh.visible = !!this.mapConfig.fogEnabled;
      this.refreshGridLayer(false);
    }

    if (Array.isArray(state.pieces)) {
      Array.from(this.pieces.keys()).forEach(id => this.deletePiece(id, false));
      state.pieces.forEach(p => this.addOrUpdatePiece(p, false));
    }

    if (state.drawDataUrl) {
      const img = new Image();
      img.onload = () => {
        this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
        this.drawCtx.drawImage(img, 0, 0);
        this.drawTexture.needsUpdate = true;
      };
      img.src = state.drawDataUrl;
    }

    if (state.fogDataUrl) {
      const img = new Image();
      img.onload = () => {
        this.fogCtx.clearRect(0, 0, this.fogCanvas.width, this.fogCanvas.height);
        this.fogCtx.drawImage(img, 0, 0);
        this.fogTexture.needsUpdate = true;
        this.refreshAllPieceVisibilities();
      };
      img.src = state.fogDataUrl;
    }

    this.updateUI();
    if (broadcast) {
      window.Multiplayer.sendFullSyncToPlayer(null, null);
    }
  },

  onNetworkMessage(msg) {
    // Enforce GM player lock on Host side as well
    if (window.Multiplayer.isHost && this.mapConfig.playersLocked && msg.senderId && msg.senderId !== window.Multiplayer.myId) {
      const blockedTypes = ['piece_drag', 'piece_update', 'piece_delete', 'draw_stroke', 'draw_text', 'draw_clear', 'dice_throw', 'dice_clear'];
      if (blockedTypes.includes(msg.type)) {
        return;
      }
    }

    switch (msg.type) {
      case 'player_lock_toggle':
        this.mapConfig.playersLocked = !!msg.locked;
        this.refreshAllPieceVisibilities();
        if (!window.Multiplayer.isHost) {
          this.showToast(
            msg.locked
              ? 'O Mestre bloqueou a criação de modelos e rolagens de dados.'
              : 'O Mestre liberou as ações na mesa!'
          );
        }
        break;
      case 'full_sync':
        this.applyFullTableState(msg.state, false);
        document.getElementById('lobby-screen').classList.add('hidden');
        break;
      case 'map_settings_only':
        if (msg.settings) {
          this.applyRemoteMapSettings(msg.settings);
        }
        break;
      case 'custom_map_sync':
        if (msg.customImageUrl) {
          if (msg.settings) {
            this.mapConfig.lighting = msg.settings.lighting || 'tavern';
            this.mapConfig.transform = msg.settings.transform || { zoom: 1, panX: 0, panY: 0, tableScale: 1, autoFitTable: true };
            this.mapConfig.grid = Object.assign(this.mapConfig.grid, msg.settings.grid || {});
            this.mapConfig.fogEnabled = !!msg.settings.fogEnabled;
          }
          this.needsCustomMapFromHost = false;
          this.applyCustomMapImage(msg.customImageUrl, false, msg.customMapHash);
          this.applyLightingMood(this.mapConfig.lighting, false);
          this.fogMesh.visible = !!this.mapConfig.fogEnabled;
          this.refreshGridLayer(false);
          this.updateUI();
          document.getElementById('lobby-screen').classList.add('hidden');
          this.showToast('Mapa do Mestre sincronizado!');
        }
        break;
      case 'request_custom_map':
        if (window.Multiplayer.isHost) {
          if (this.mapConfig.customImageUrl) {
            this.broadcastCustomMapWithImage(msg.senderId);
          } else {
            this.broadcastMapSettingsOnly();
          }
        }
        break;
      case 'piece_drag': {
        const mesh = this.pieceMeshes.get(msg.pieceId);
        if (mesh) {
          mesh.position.set(msg.x, msg.y || 1.6, msg.z);
        }
        break;
      }
      case 'piece_update':
        if (msg.piece) {
          this.addOrUpdatePiece(msg.piece, false);
          if (this.selectedPieceId === msg.piece.id) {
            this.populateInspectorUI();
          }
        }
        break;
      case 'floating_dmg':
        this.spawnFloatingText(msg.x, msg.y, msg.z, msg.text, msg.color);
        if (window.SoundEngine) {
          if (String(msg.text).startsWith('-')) window.SoundEngine.playHit?.();
          else window.SoundEngine.playHeal?.();
        }
        break;
      case 'piece_delete':
        if (msg.pieceId) this.deletePiece(msg.pieceId, false);
        break;
      case 'map_config':
        if (msg.mapConfig) {
          this.applyRemoteMapSettings({
            preset: msg.mapConfig.preset,
            hasCustomImage: !!msg.mapConfig.customImageUrl,
            customMapHash: msg.mapConfig.customMapHash,
            lighting: msg.mapConfig.lighting,
            transform: msg.mapConfig.transform,
            grid: msg.mapConfig.grid,
            fogEnabled: msg.mapConfig.fogEnabled
          });
          if (msg.mapConfig.customImageUrl) {
            this.applyCustomMapImage(msg.mapConfig.customImageUrl, false, msg.mapConfig.customMapHash);
          }
        }
        break;
      case 'draw_stroke':
        this.drawStrokeOnTable(msg.u1, msg.v1, msg.u2, msg.v2, msg.mode, msg.color, msg.size, false);
        break;
      case 'draw_text':
        this.drawTextOnTable(msg.u, msg.v, msg.text, msg.color, msg.fontSize || msg.size, false);
        break;
      case 'draw_clear':
        this.clearTableDrawings(false);
        break;
      case 'fog_stroke':
        this.paintFogAtUV(msg.u, msg.v, msg.radiusPx, msg.mode, false);
        break;
      case 'fog_reset':
        this.fillFogCanvas(msg.coverAll);
        break;
      case 'gm_cam':
        if (msg.cam && !window.Multiplayer.isHost) {
          this.applyHostCamState(msg.cam, false);
        }
        break;
      case 'force_gm_cam':
        if (msg.cam && !window.Multiplayer.isHost) {
          this.applyHostCamState(msg.cam, true);
          this.showToast('O Mestre focou a visão da mesa aqui!');
        }
        break;
      case 'dice_throw':
        window.DiceRoller3D.throwDice(msg.rollData, null);
        break;
      case 'dice_clear':
        window.DiceRoller3D.clearDice(false);
        break;
      case 'ping_3d':
        this.spawnPing3D(msg.x, msg.z, msg.color, msg.senderName, false);
        break;
      case 'laser_point':
        if (window.Effects3D) {
          window.Effects3D.addLaserPoint(msg.senderId, msg.x, msg.z, msg.color, false);
        }
        break;
      case 'aoe_pin_update':
        if (window.Effects3D && msg.aoe) {
          window.Effects3D.addOrUpdatePinnedAoE(msg.aoe, false);
        }
        break;
      case 'aoe_pin_delete':
        if (window.Effects3D && msg.aoeId) {
          window.Effects3D.removePinnedAoE(msg.aoeId, false);
        }
        break;
      case 'aoe_template_update':
        if (window.Effects3D && msg.state) {
          window.Effects3D.setAoETemplate(msg.state.type, msg.state.radiusMeters, msg.state.color, false);
          window.Effects3D.updateAoEPosition(msg.state.x, msg.state.z, false);
        }
        break;
      case 'aoe_template_move':
        if (window.Effects3D) {
          window.Effects3D.updateAoEPosition(msg.x, msg.z, false);
        }
        break;
      case 'aoe_template_clear':
        if (window.Effects3D) {
          window.Effects3D.clearAoETemplate(false);
        }
        break;
      case 'music_sync':
        if (!window.Multiplayer.isHost && window.MusicPlayer) {
          window.MusicPlayer.applyRemote(msg);
        }
        break;
      case 'skybox_sync':
        if (window.Effects3D && msg.skybox) {
          window.Effects3D.setSkybox(msg.skybox, msg.customUrl || '', false);
        }
        break;
      case 'handout_show':
        if (msg.imageUrl) {
          this.displayHandoutOverlay(msg.imageUrl, msg.title || 'Ilustração da Sessão');
        }
        break;
      case 'handout_close':
        document.getElementById('handout-viewer-modal')?.classList.remove('open');
        break;
      case 'weather_sync':
        if (window.Effects3D && msg.weather) {
          window.Effects3D.setWeather(msg.weather, false);
          const sel = document.getElementById('weather-select');
          if (sel) sel.value = msg.weather;
        }
        break;
      case 'combat_tracker_sync':
        if (window.CombatTracker && msg.state) {
          window.CombatTracker.applyRemoteState(msg.state);
        }
        break;
      case 'cursor_3d':
        this.updateRemoteCursor(msg.senderId, msg.senderName, msg.senderColor, msg.x, msg.z);
        break;
      case 'chat_msg':
        this.addChatMessage(`<strong>${this.escapeHtml(msg.senderName)}:</strong> ${this.escapeHtml(msg.text)}`, '');
        break;
    }
  },

  updateRemoteCursor(id, name, color, x, z) {
    let cursor = this.remoteCursors.get(id);
    if (!cursor) {
      const geo = new THREE.SphereGeometry(0.24, 12, 12);
      const mat = new THREE.MeshBasicMaterial({ color: color || '#4d7c5b' });
      const mesh = new THREE.Mesh(geo, mat);
      this.scene.add(mesh);

      const label = document.createElement('div');
      label.className = 'remote-cursor-label';
      label.style.background = color || '#4d7c5b';
      label.textContent = name || 'Jogador';
      document.getElementById('labels-container').appendChild(label);

      cursor = { mesh, label, lastSeen: performance.now() };
      this.remoteCursors.set(id, cursor);
    }
    cursor.mesh.position.set(x, 0.32, z);
    cursor.label.textContent = name || 'Jogador';
    cursor.label.style.background = color || '#4d7c5b';
    cursor.lastSeen = performance.now();
  },

  animate() {
    requestAnimationFrame(() => this.animate());

    const dt = 0.016;
    const time = performance.now() * 0.001;

    const panSpeed = 0.38;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    if (this.camState.keys['KeyW'] || this.camState.keys['ArrowUp']) {
      this.camState.target.addScaledVector(forward, panSpeed);
      this.updateCameraTransform();
    }
    if (this.camState.keys['KeyS'] || this.camState.keys['ArrowDown']) {
      this.camState.target.addScaledVector(forward, -panSpeed);
      this.updateCameraTransform();
    }
    if (this.camState.keys['KeyA'] || this.camState.keys['ArrowLeft']) {
      this.camState.target.addScaledVector(right, -panSpeed);
      this.updateCameraTransform();
    }
    if (this.camState.keys['KeyD'] || this.camState.keys['ArrowRight']) {
      this.camState.target.addScaledVector(right, panSpeed);
      this.updateCameraTransform();
    }

    // Smoothly follow Host's camera when guest is in "Visão: Mestre" (or followGmCamera is enabled)
    if (!window.Multiplayer.isHost && this.camState.followGmCamera && !this.camState.isOrbiting && !this.camState.isPanning) {
      const hc = this.hostCamState;
      if (hc) {
        if (typeof hc.isTopDown === 'boolean' && this.camState.isTopDown !== hc.isTopDown) {
          this.camState.isTopDown = hc.isTopDown;
          document.getElementById('btn-cam-topdown')?.classList.toggle('active', this.camState.isTopDown);
        }
        this.camState.target.x = THREE.MathUtils.lerp(this.camState.target.x, Number(hc.targetX) || 0, 0.16);
        this.camState.target.z = THREE.MathUtils.lerp(this.camState.target.z, Number(hc.targetZ) || 0, 0.16);
        this.camState.spherical.radius = THREE.MathUtils.lerp(this.camState.spherical.radius, Number(hc.radius) || 32, 0.16);
        this.camState.spherical.phi = THREE.MathUtils.lerp(this.camState.spherical.phi, Number(hc.phi) || 0.8, 0.16);
        this.camState.spherical.theta = THREE.MathUtils.lerp(this.camState.spherical.theta, Number(hc.theta) || 0, 0.16);
        this.updateCameraTransform(false);
      }
    }

    // Grabbed Piece Follow
    if (this.grabState.pieceId) {
      const mesh = this.pieceMeshes.get(this.grabState.pieceId);
      if (mesh) {
        const prevX = mesh.position.x;
        const prevZ = mesh.position.z;
        mesh.position.lerp(this.grabState.targetPos, 0.28);
        const vx = mesh.position.x - prevX;
        const vz = mesh.position.z - prevZ;
        mesh.rotation.z = THREE.MathUtils.lerp(mesh.rotation.z, -vx * 1.4, 0.25);
        mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, vz * 1.4, 0.25);
      }
    }

    // Grabbed Die Follow & Spin in Air
    if (this.grabState.dieId) {
      const dieObj = window.DiceRoller3D.activeDice.find(d => d.id === this.grabState.dieId);
      if (dieObj && dieObj.mesh) {
        dieObj.mesh.position.lerp(this.grabState.targetPos, 0.35);
        dieObj.mesh.rotation.x += 0.12;
        dieObj.mesh.rotation.y += 0.15;
      }
    }

    for (let i = this.fallingPieces.length - 1; i >= 0; i--) {
      const fp = this.fallingPieces[i];
      fp.vy -= 0.022;
      fp.mesh.position.y += fp.vy;
      if (fp.mesh.position.y <= 0) {
        fp.mesh.position.y = 0;
        if (Math.abs(fp.vy) > 0.06) {
          if (window.SoundEngine) window.SoundEngine.playPieceDrop();
          fp.vy = -fp.vy * 0.38;
        } else {
          this.fallingPieces.splice(i, 1);
        }
      }
    }

    if (window.Effects3D) {
      window.Effects3D.update(dt);
    }

    window.DiceRoller3D.update(dt, this.tableWidth / 2, this.tableDepth / 2);

    this.pieceMeshes.forEach((mesh, id) => {
      const piece = this.pieces.get(id);
      if (!piece || !mesh.visible) return;
      if (piece.style === 'pin') {
        const fig = mesh.getObjectByName('figureGroup');
        if (fig) {
          fig.position.y = Math.sin(time * 3 + piece.x) * 0.12;
          fig.rotation.y += 0.015;
        }
      } else if (piece.preset === 'campfire') {
        const flame = mesh.getObjectByName('animatedFlame');
        if (flame) {
          flame.scale.y = 0.9 + Math.sin(time * 14) * 0.18;
          flame.rotation.y += 0.08;
        }
      }
    });

    for (let i = this.activePings.length - 1; i >= 0; i--) {
      const p = this.activePings[i];
      p.age += dt;
      const s = 1 + p.age * 4.5;
      p.ring.scale.set(s, s, 1);
      p.ring.material.opacity = Math.max(0, 1 - p.age * 0.7);
      p.beam.material.opacity = Math.max(0, 0.6 - p.age * 0.45);
      if (p.age > 1.5) {
        this.scene.remove(p.group);
        this.activePings.splice(i, 1);
      }
    }

    this.pieceMeshes.forEach((mesh, id) => {
      const label = this.pieceLabels.get(id);
      const piece = this.pieces.get(id);
      if (!label || !piece) return;

      const shouldShow =
        mesh.visible &&
        piece.style !== 'prop' &&
        (this.showAllLabels || id === this.selectedPieceId || id === this.hoveredPieceId);

      if (!shouldShow) {
        label.style.display = 'none';
        return;
      }

      const scaleMult = piece.sizeScale || 1;
      const elevUnits = (piece.elevation || 0) * (this.mapConfig.grid.cellSize / 1.5);
      const topOffset = 2.35 * scaleMult + elevUnits;
      const headPos = mesh.position.clone().add(new THREE.Vector3(0, topOffset, 0));
      const screen = this.worldToScreen(headPos);

      if (screen.visible) {
        label.style.display = 'flex';
        label.style.left = `${screen.x}px`;
        label.style.top = `${screen.y}px`;
      } else {
        label.style.display = 'none';
      }
    });

    this.remoteCursors.forEach((c) => {
      const screen = this.worldToScreen(c.mesh.position);
      if (screen.visible) {
        c.label.style.display = 'block';
        c.label.style.left = `${screen.x}px`;
        c.label.style.top = `${screen.y}px`;
      } else {
        c.label.style.display = 'none';
      }
    });

    // 3D Floating Damage & Healing Numbers animation
    if (this.floatingTexts && this.floatingTexts.length > 0) {
      const now = performance.now();
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const ft = this.floatingTexts[i];
        const elapsed = now - ft.startTime;
        if (elapsed > ft.duration) {
          ft.el.remove();
          this.floatingTexts.splice(i, 1);
          continue;
        }
        const progress = elapsed / ft.duration;
        const currentPos = ft.pos.clone().add(new THREE.Vector3(0, progress * 1.6, 0));
        const screen = this.worldToScreen(currentPos);
        if (screen.visible) {
          ft.el.style.display = 'block';
          ft.el.style.left = `${screen.x}px`;
          ft.el.style.top = `${screen.y}px`;
          ft.el.style.opacity = `${Math.max(0, 1 - Math.pow(progress, 1.8))}`;
          ft.el.style.transform = `translate(-50%, -100%) scale(${1 + progress * 0.15})`;
        } else {
          ft.el.style.display = 'none';
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
  },

  updateUI() {
    document.getElementById('grid-type-select').value = this.mapConfig.grid.type;
    document.getElementById('grid-size-range').value = this.mapConfig.grid.cellSize;
    document.getElementById('grid-size-val').textContent = this.mapConfig.grid.cellSize + ' un';
    document.getElementById('grid-offset-x').value = this.mapConfig.grid.offsetX || 0;
    document.getElementById('grid-offset-y').value = this.mapConfig.grid.offsetY || 0;
    document.getElementById('grid-opacity-range').value = Math.round(this.mapConfig.grid.opacity * 100);
    document.getElementById('grid-color-input').value = this.mapConfig.grid.color || '#ffffff';
    document.getElementById('grid-snap-check').checked = !!this.mapConfig.grid.snap;
    document.getElementById('fog-enable-check').checked = !!this.mapConfig.fogEnabled;
    document.getElementById('lighting-select').value = this.mapConfig.lighting || 'tavern';

    const t = this.mapConfig.transform || { zoom: 1, panX: 0, panY: 0, tableScale: 1, autoFitTable: true };
    const drawerZoom = document.getElementById('drawer-map-zoom');
    const drawerZoomVal = document.getElementById('drawer-map-zoom-val');
    const drawerScale = document.getElementById('drawer-table-scale');
    const drawerScaleVal = document.getElementById('drawer-table-scale-val');
    const drawerDims = document.getElementById('drawer-table-dims-badge');

    if (drawerZoom) drawerZoom.value = t.zoom || 1;
    if (drawerZoomVal) drawerZoomVal.textContent = (Number(t.zoom) || 1).toFixed(2) + 'x';
    if (drawerScale) drawerScale.value = t.tableScale || 1;
    if (drawerScaleVal) drawerScaleVal.textContent = (Number(t.tableScale) || 1).toFixed(2) + 'x';
    if (drawerDims) {
      const cellSize = this.mapConfig.grid.cellSize || 2;
      drawerDims.textContent = `Mesa atual: ${this.tableWidth} × ${this.tableDepth} un (${Math.round(this.tableWidth / cellSize)} × ${Math.round(this.tableDepth / cellSize)} q)`;
    }
  },

  displayHandoutOverlay(imageUrl, title = 'Ilustração da Sessão') {
    const modal = document.getElementById('handout-viewer-modal');
    const img = document.getElementById('handout-viewer-img');
    const titleEl = document.getElementById('handout-viewer-title');
    if (!modal || !img) return;
    img.src = imageUrl;
    if (titleEl) titleEl.textContent = title || 'Ilustração da Sessão';
    modal.classList.add('open');
    if (window.SoundEngine) {
      window.SoundEngine.playPingSound();
    }
  },

  async sendHandoutToAll(imageUrl, title = 'Ilustração da Sessão') {
    if (!imageUrl) {
      this.showToast('Selecione uma imagem ou cole um link primeiro.');
      return;
    }
    let safeUrl = imageUrl;
    if (safeUrl.startsWith('data:image')) {
      safeUrl = await this.compressImageForNetwork(safeUrl, 960, 0.72);
    }
    this.displayHandoutOverlay(safeUrl, title);
    if (window.Multiplayer) {
      window.Multiplayer.broadcast({
        type: 'handout_show',
        imageUrl: safeUrl,
        title: title || 'Ilustração da Sessão'
      });
    }
    this.showToast('Ilustração exibida na tela de todos os jogadores!');
  },

  closeHandoutForAll() {
    document.getElementById('handout-viewer-modal')?.classList.remove('open');
    if (window.Multiplayer?.isHost) {
      window.Multiplayer.broadcast({ type: 'handout_close' });
    }
  },

  updateMultiplayerUI() {
    const codeBadge = document.getElementById('top-room-badge');
    const modalCode = document.getElementById('modal-room-code');
    if (window.Multiplayer.roomCode) {
      codeBadge.textContent = `Sala: ${window.Multiplayer.roomCode} (${window.Multiplayer.players.size})`;
      if (modalCode) modalCode.textContent = window.Multiplayer.roomCode;
    } else {
      codeBadge.textContent = `Sessão Local`;
    }
    this.refreshAllPieceVisibilities();
  },

  addChatMessage(html, extraClass = '') {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    const div = document.createElement('div');
    div.className = `chat-msg ${extraClass}`;
    div.innerHTML = html;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  },

  showToast(text) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    container.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  },

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
};

window.addEventListener('DOMContentLoaded', () => {
  window.App.init();
});

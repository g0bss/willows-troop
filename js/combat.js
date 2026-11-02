// ============================================================================
// WILLOW'S TROOP - COMBAT & INITIATIVE TRACKER ENGINE
// Minimal, elegant top HUD bar for tabletop RPG rounds, turn orders and highlights
// ============================================================================

window.CombatTracker = {
  isOpen: false,
  round: 1,
  currentTurn: 0,
  combatants: [], // Array of { id, pieceId, name, hp, maxHp, ac, initiative, color, imageUrl }

  init() {
    this.renderUI();
  },

  toggleOpen() {
    this.isOpen = !this.isOpen;
    const bar = document.getElementById('turn-tracker-container');
    const btn = document.getElementById('btn-toggle-combat');
    if (bar) bar.classList.toggle('visible', this.isOpen);
    if (btn) btn.classList.toggle('active', this.isOpen);
    if (this.isOpen && this.combatants.length === 0 && window.App) {
      this.pullPiecesFromTable(false);
    }
    this.renderUI();
    if (window.Multiplayer?.isHost) {
      this.broadcastState();
    }
  },

  pullPiecesFromTable(broadcast = true) {
    if (!window.App) return;
    const pieces = Array.from(window.App.pieces.values()).filter(p => p.style !== 'prop' && p.style !== 'pin');
    
    // Add missing pieces
    pieces.forEach(p => {
      const exists = this.combatants.find(c => c.pieceId === p.id);
      if (!exists) {
        this.combatants.push({
          id: 'c_' + p.id,
          pieceId: p.id,
          name: p.name || 'Personagem',
          hp: p.hp ?? 30,
          maxHp: p.maxHp ?? 30,
          ac: p.ac ?? 14,
          initiative: Math.floor(Math.random() * 20) + 1,
          color: p.color || '#4d7c5b',
          imageUrl: p.imageUrl || null
        });
      }
    });

    this.sortCombatants();
    this.renderUI();
    if (broadcast && window.Multiplayer?.isHost) {
      this.broadcastState();
      window.App.showToast('Combatentes importados da mesa!');
    }
  },

  sortCombatants() {
    this.combatants.sort((a, b) => (b.initiative || 0) - (a.initiative || 0));
    if (this.currentTurn >= this.combatants.length) {
      this.currentTurn = 0;
    }
    this.highlightActiveCombatantPiece();
  },

  rollAllInitiative() {
    if (window.App?.isPlayerActionBlocked && window.App.isPlayerActionBlocked(true)) return;
    this.combatants.forEach(c => {
      c.initiative = Math.floor(Math.random() * 20) + 1;
    });
    this.sortCombatants();
    this.currentTurn = 0;
    this.renderUI();
    if (window.SoundEngine) window.SoundEngine.playDiceShake();
    if (window.App) window.App.showToast('Iniciativa rolada para todos os combatentes!');
    if (window.Multiplayer?.isHost) {
      this.broadcastState();
    }
  },

  nextTurn() {
    if (this.combatants.length === 0) return;
    if (window.App?.isPlayerActionBlocked && window.App.isPlayerActionBlocked(true)) return;

    this.currentTurn++;
    if (this.currentTurn >= this.combatants.length) {
      this.currentTurn = 0;
      this.round++;
      if (window.App) window.App.showToast(`Início da Rodada ${this.round}!`);
    }

    const active = this.combatants[this.currentTurn];
    if (window.SoundEngine) window.SoundEngine.playChime(false);
    if (active && window.App) {
      window.App.showToast(`Turno de: ${active.name}`);
    }

    this.highlightActiveCombatantPiece();
    this.renderUI();
    if (window.Multiplayer?.isHost) {
      this.broadcastState();
    }
  },

  prevTurn() {
    if (this.combatants.length === 0) return;
    if (window.App?.isPlayerActionBlocked && window.App.isPlayerActionBlocked(true)) return;

    this.currentTurn--;
    if (this.currentTurn < 0) {
      this.currentTurn = Math.max(0, this.combatants.length - 1);
      if (this.round > 1) this.round--;
    }

    this.highlightActiveCombatantPiece();
    this.renderUI();
    if (window.Multiplayer?.isHost) {
      this.broadcastState();
    }
  },

  setCombatantInitiative(id, value) {
    const c = this.combatants.find(item => item.id === id);
    if (c) {
      c.initiative = Number(value) || 0;
      this.sortCombatants();
      this.renderUI();
      if (window.Multiplayer?.isHost) this.broadcastState();
    }
  },

  removeCombatant(id) {
    this.combatants = this.combatants.filter(c => c.id !== id);
    if (this.currentTurn >= this.combatants.length) {
      this.currentTurn = Math.max(0, this.combatants.length - 1);
    }
    this.renderUI();
    this.highlightActiveCombatantPiece();
    if (window.Multiplayer?.isHost) this.broadcastState();
  },

  clearCombat() {
    this.combatants = [];
    this.round = 1;
    this.currentTurn = 0;
    this.highlightActiveCombatantPiece();
    this.renderUI();
    if (window.Multiplayer?.isHost) this.broadcastState();
  },

  highlightActiveCombatantPiece() {
    if (!window.App) return;
    const active = this.combatants[this.currentTurn];
    if (active && active.pieceId) {
      const mesh = window.App.pieceMeshes?.get(active.pieceId);
      if (mesh) {
        // Create or update active turn pulse ring in 3D scene
        if (!this.turnRingMesh) {
          const ringGeo = new THREE.RingGeometry(1.0, 1.4, 32);
          ringGeo.rotateX(-Math.PI / 2);
          const ringMat = new THREE.MeshBasicMaterial({
            color: 0xf59e0b,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85
          });
          this.turnRingMesh = new THREE.Mesh(ringGeo, ringMat);
          window.App.scene.add(this.turnRingMesh);
        }
        this.turnRingMesh.position.set(mesh.position.x, 0.04, mesh.position.z);
        this.turnRingMesh.visible = true;
        return;
      }
    }
    if (this.turnRingMesh) {
      this.turnRingMesh.visible = false;
    }
  },

  focusCameraOnActive() {
    const active = this.combatants[this.currentTurn];
    if (active && active.pieceId && window.App) {
      const p = window.App.pieces.get(active.pieceId);
      if (p) {
        window.App.camState.target.set(p.x, 0, p.z);
        window.App.updateCameraTransform();
      }
    }
  },

  broadcastState() {
    if (!window.Multiplayer) return;
    window.Multiplayer.broadcast({
      type: 'combat_tracker_sync',
      state: {
        isOpen: this.isOpen,
        round: this.round,
        currentTurn: this.currentTurn,
        combatants: this.combatants
      }
    });
  },

  applyRemoteState(state) {
    if (!state) return;
    this.isOpen = !!state.isOpen;
    this.round = state.round || 1;
    this.currentTurn = state.currentTurn || 0;
    this.combatants = state.combatants || [];

    const bar = document.getElementById('turn-tracker-container');
    const btn = document.getElementById('btn-toggle-combat');
    if (bar) bar.classList.toggle('visible', this.isOpen);
    if (btn) btn.classList.toggle('active', this.isOpen);

    this.highlightActiveCombatantPiece();
    this.renderUI();
  },

  renderUI() {
    const listEl = document.getElementById('turn-tracker-list');
    const roundEl = document.getElementById('turn-tracker-round');
    if (!listEl) return;

    if (roundEl) roundEl.textContent = `Rodada ${this.round}`;

    if (this.combatants.length === 0) {
      listEl.innerHTML = `<span style="font-size:11.5px; color:var(--text-secondary); padding:4px 8px;">Nenhum combatente na lista. Clique em "Puxar da Mesa".</span>`;
      return;
    }

    listEl.innerHTML = this.combatants.map((c, idx) => {
      const isActive = idx === this.currentTurn;
      const hpPercent = c.maxHp > 0 ? Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100)) : 100;
      const hpColor = hpPercent > 50 ? '#4d9e6d' : (hpPercent > 25 ? '#d99b26' : '#c94a4a');
      const avatarHtml = c.imageUrl
        ? `<img src="${c.imageUrl}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;" />`
        : `<div style="width:24px; height:24px; border-radius:50%; background:${c.color}; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold; color:#fff;">${c.name.slice(0, 2).toUpperCase()}</div>`;

      return `
        <div class="turn-card ${isActive ? 'active' : ''}" onclick="CombatTracker.focusCameraOnActive()">
          ${avatarHtml}
          <div class="turn-card-info">
            <span class="turn-card-name" title="${c.name}">${c.name}</span>
            <div class="turn-card-hp-bar">
              <div style="width:${hpPercent}%; background:${hpColor}; height:100%;"></div>
            </div>
          </div>
          <div class="turn-card-init">
            <input type="number" value="${c.initiative}" style="width:34px; text-align:center; font-size:11px; padding:1px; background:#12171d; border:1px solid var(--border-muted); border-radius:3px; color:#fde68a;"
              onchange="CombatTracker.setCombatantInitiative('${c.id}', this.value)" onclick="event.stopPropagation()" />
          </div>
          <button class="turn-card-del" onclick="event.stopPropagation(); CombatTracker.removeCombatant('${c.id}')" title="Remover da ordem">✕</button>
        </div>
      `;
    }).join('');
  }
};

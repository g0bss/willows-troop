// ============================================================================
// WILLOW'S TROOP - COMBAT & INITIATIVE TRACKER ENGINE
// Direct manual entry: GM types Character/Enemy Name + Initiative Number
// Automatically sorts descending, tracks rounds & turns, and syncs to all players
// ============================================================================

window.CombatTracker = {
  isOpen: false,
  round: 1,
  currentTurn: 0,
  combatants: [], // Array of { id, name, initiative, color, pieceId }

  palette: ['#68a378', '#3b82f6', '#c94a4a', '#d99b26', '#a855f7', '#06b6d4', '#ec4899', '#f97316'],

  init() {
    this.renderUI();
  },

  toggleOpen() {
    this.isOpen = !this.isOpen;
    const bar = document.getElementById('turn-tracker-container');
    const btn = document.getElementById('btn-toggle-combat');
    if (bar) bar.classList.toggle('visible', this.isOpen);
    if (btn) btn.classList.toggle('active', this.isOpen);
    this.renderUI();
    if (window.Multiplayer?.isHost) {
      this.broadcastState();
    }
    if (this.isOpen) {
      setTimeout(() => {
        document.getElementById('combat-add-name')?.focus();
      }, 100);
    }
  },

  addManualCombatant() {
    if (window.App?.isPlayerActionBlocked && window.App.isPlayerActionBlocked(true)) return;
    const nameInput = document.getElementById('combat-add-name');
    const initInput = document.getElementById('combat-add-init');
    if (!nameInput || !initInput) return;

    const name = nameInput.value.trim();
    const initVal = Number(initInput.value);

    if (!name) {
      if (window.App) window.App.showToast('Digite o nome do personagem ou inimigo.');
      nameInput.focus();
      return;
    }

    const initiative = Number.isFinite(initVal) && initInput.value !== '' ? initVal : 10;

    // Optional: link to a piece on the table if a piece has a matching name
    let matchedPiece = null;
    if (window.App && window.App.pieces) {
      const lower = name.toLowerCase();
      matchedPiece = Array.from(window.App.pieces.values()).find(
        p => (p.name || '').toLowerCase() === lower || (p.name || '').toLowerCase().includes(lower)
      );
    }

    const color = matchedPiece?.color || this.palette[this.combatants.length % this.palette.length];

    this.combatants.push({
      id: 'c_' + Date.now() + '_' + Math.floor(Math.random() * 999),
      name,
      initiative,
      color,
      pieceId: matchedPiece ? matchedPiece.id : null
    });

    nameInput.value = '';
    initInput.value = '';
    nameInput.focus();

    this.sortCombatants();
    this.renderUI();
    if (window.SoundEngine) window.SoundEngine.playPieceLift();
    if (window.Multiplayer) {
      this.broadcastState();
    }
  },

  sortCombatants() {
    const currentActiveId = this.combatants[this.currentTurn]?.id;
    this.combatants.sort((a, b) => (Number(b.initiative) || 0) - (Number(a.initiative) || 0));
    if (currentActiveId) {
      const newIdx = this.combatants.findIndex(c => c.id === currentActiveId);
      this.currentTurn = newIdx >= 0 ? newIdx : 0;
    }
    if (this.currentTurn >= this.combatants.length) {
      this.currentTurn = 0;
    }
    this.highlightActiveCombatantPiece();
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
      window.App.showToast(`Vez de: ${active.name} (Iniciativa ${active.initiative})`);
    }

    this.highlightActiveCombatantPiece();
    this.renderUI();
    this.broadcastState();
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
    this.broadcastState();
  },

  setCombatantInitiative(id, value) {
    if (window.App?.isPlayerActionBlocked && window.App.isPlayerActionBlocked(true)) return;
    const c = this.combatants.find(item => item.id === id);
    if (c) {
      c.initiative = Number(value) || 0;
      this.sortCombatants();
      this.renderUI();
      this.broadcastState();
    }
  },

  removeCombatant(id) {
    if (window.App?.isPlayerActionBlocked && window.App.isPlayerActionBlocked(true)) return;
    this.combatants = this.combatants.filter(c => c.id !== id);
    if (this.currentTurn >= this.combatants.length) {
      this.currentTurn = Math.max(0, this.combatants.length - 1);
    }
    this.renderUI();
    this.highlightActiveCombatantPiece();
    this.broadcastState();
  },

  clearCombat() {
    if (window.App?.isPlayerActionBlocked && window.App.isPlayerActionBlocked(true)) return;
    this.combatants = [];
    this.round = 1;
    this.currentTurn = 0;
    this.highlightActiveCombatantPiece();
    this.renderUI();
    this.broadcastState();
  },

  highlightActiveCombatantPiece() {
    if (!window.App) return;
    const active = this.combatants[this.currentTurn];
    let targetMesh = null;

    if (active) {
      if (active.pieceId && window.App.pieceMeshes?.has(active.pieceId)) {
        targetMesh = window.App.pieceMeshes.get(active.pieceId);
      } else if (window.App.pieces) {
        const lower = (active.name || '').toLowerCase();
        const found = Array.from(window.App.pieces.values()).find(
          p => (p.name || '').toLowerCase() === lower
        );
        if (found) {
          active.pieceId = found.id;
          targetMesh = window.App.pieceMeshes.get(found.id);
        }
      }
    }

    if (targetMesh) {
      if (!this.turnRingMesh) {
        const ringGeo = new THREE.RingGeometry(1.05, 1.45, 36);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.88
        });
        this.turnRingMesh = new THREE.Mesh(ringGeo, ringMat);
        window.App.scene.add(this.turnRingMesh);
      }
      this.turnRingMesh.position.set(targetMesh.position.x, 0.04, targetMesh.position.z);
      this.turnRingMesh.visible = true;
    } else if (this.turnRingMesh) {
      this.turnRingMesh.visible = false;
    }
  },

  selectCombatantTurn(idx) {
    if (window.App?.isPlayerActionBlocked && window.App.isPlayerActionBlocked(true)) return;
    if (idx < 0 || idx >= this.combatants.length) return;
    this.currentTurn = idx;
    const active = this.combatants[this.currentTurn];
    this.highlightActiveCombatantPiece();
    if (active && active.pieceId && window.App?.pieces.has(active.pieceId)) {
      const p = window.App.pieces.get(active.pieceId);
      window.App.camState.target.set(p.x, 0, p.z);
      window.App.updateCameraTransform();
    }
    this.renderUI();
    this.broadcastState();
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

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  renderUI() {
    const listEl = document.getElementById('turn-tracker-list');
    const roundEl = document.getElementById('turn-tracker-round');
    const formEl = document.getElementById('turn-tracker-add-form');
    if (!listEl) return;

    if (roundEl) roundEl.textContent = `Rodada ${this.round}`;
    if (formEl) {
      const isGM = !window.Multiplayer || window.Multiplayer.isHost || window.Multiplayer.myRole === 'gm';
      formEl.style.display = isGM ? 'flex' : 'none';
    }

    if (this.combatants.length === 0) {
      listEl.innerHTML = `<span style="font-size:11.5px; color:var(--text-secondary); padding:4px 8px; white-space:nowrap;">Digite o nome e a iniciativa ao lado para adicionar à fila.</span>`;
      return;
    }

    listEl.innerHTML = this.combatants.map((c, idx) => {
      const isActive = idx === this.currentTurn;
      const initials = (c.name || '?').slice(0, 2).toUpperCase();

      return `
        <div class="turn-card ${isActive ? 'active' : ''}" onclick="CombatTracker.selectCombatantTurn(${idx})" title="Clique para definir turno / focar">
          <div style="width:22px; height:22px; border-radius:50%; background:${c.color || '#4d7c5b'}; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#fff; flex-shrink:0;">
            ${this.escapeHtml(initials)}
          </div>
          <div class="turn-card-info">
            <span class="turn-card-name">${this.escapeHtml(c.name)}</span>
          </div>
          <div class="turn-card-init" title="Valor da Iniciativa">
            <input type="number" value="${c.initiative}" style="width:38px; text-align:center; font-size:11.5px; font-weight:700; padding:2px; background:#12171d; border:1px solid var(--border-muted); border-radius:4px; color:#fde68a;"
              onchange="CombatTracker.setCombatantInitiative('${c.id}', this.value)" onclick="event.stopPropagation()" />
          </div>
          <button class="turn-card-del" onclick="event.stopPropagation(); CombatTracker.removeCombatant('${c.id}')" title="Remover da iniciativa">✕</button>
        </div>
      `;
    }).join('');
  }
};

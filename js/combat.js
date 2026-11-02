// ============================================================================
// WILLOW'S TROOP - RIGHT-SIDE VERTICAL INITIATIVE TABLE ENGINE
// Compact toggle button on the right + expandable vertical striped table
// Direct manual entry: GM types Character/Enemy Name + Initiative Number
// ============================================================================

window.CombatTracker = {
  isOpen: false,
  round: 1,
  currentTurn: 0,
  combatants: [], // Array of { id, name, initiative, color, pieceId }

  palette: ['#68a378', '#3b82f6', '#c94a4a', '#d99b26', '#a855f7', '#06b6d4', '#ec4899', '#f97316'],

  init() {
    this.syncOpenVisibility();
    this.renderUI();
  },

  syncOpenVisibility() {
    const panel = document.getElementById('turn-tracker-container');
    const compactBtn = document.getElementById('initiative-compact-tab');
    if (panel) panel.classList.toggle('visible', this.isOpen);
    if (compactBtn) compactBtn.classList.toggle('panel-open', this.isOpen);
  },

  toggleOpen(forceState) {
    this.isOpen = typeof forceState === 'boolean' ? forceState : !this.isOpen;
    this.syncOpenVisibility();
    this.renderUI();
    if (window.Multiplayer?.isHost) {
      this.broadcastState();
    }
    if (this.isOpen) {
      setTimeout(() => {
        document.getElementById('combat-add-name')?.focus();
      }, 80);
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
    nameInput.focus();

    this.sortCombatants();
    this.renderUI();
    if (window.SoundEngine) window.SoundEngine.playPieceLift();
    if (window.Multiplayer) {
      this.broadcastState();
    }
  },

  // Optional helper if GM wants to import existing tokens on the table
  pullPiecesFromTable(clearExisting = false) {
    if (!window.App) return;
    if (window.App.isPlayerActionBlocked && window.App.isPlayerActionBlocked(true)) return;
    if (clearExisting) {
      this.combatants = [];
      this.round = 1;
      this.currentTurn = 0;
    }

    let added = 0;
    window.App.pieces.forEach((p) => {
      if (p.style === 'prop' || p.style === 'pin') return;
      const exists = this.combatants.find(c => c.pieceId === p.id || c.name.toLowerCase() === (p.name || '').toLowerCase());
      if (!exists) {
        const roll = Math.floor(Math.random() * 20) + 1;
        this.combatants.push({
          id: 'c_' + p.id,
          pieceId: p.id,
          name: p.name || ' Combatente',
          color: p.color || '#4d7c5b',
          initiative: roll
        });
        added++;
      }
    });

    this.sortCombatants();
    this.renderUI();
    this.broadcastState();
    if (added > 0 && window.App) {
      window.App.showToast(`${added} peça(s) importada(s) da mesa.`);
    }
  },

  clearCombatants() {
    this.clearCombat();
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

    this.syncOpenVisibility();
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
    const compactBadgeEl = document.getElementById('combat-compact-badge');
    if (!listEl) return;

    if (roundEl) roundEl.textContent = `Rodada ${this.round}`;

    // Update the compact button badge on the right side
    if (compactBadgeEl) {
      if (this.combatants.length > 0) {
        const active = this.combatants[this.currentTurn] || this.combatants[0];
        compactBadgeEl.textContent = `R${this.round} · ${active.name}`;
        compactBadgeEl.style.display = 'inline-block';
      } else {
        compactBadgeEl.style.display = 'none';
      }
    }

    if (this.combatants.length === 0) {
      listEl.innerHTML = `
        <tr class="init-empty-row">
          <td colspan="4">Nenhum combatente na lista.<br/>Digite o <strong>Nome</strong> e a <strong>Iniciativa</strong> acima ou clique em <strong>Puxar Peças da Mesa</strong>.</td>
        </tr>
      `;
      return;
    }

    listEl.innerHTML = this.combatants.map((c, idx) => {
      const isActive = idx === this.currentTurn;
      const posLabel = isActive ? '▶' : `${idx + 1}º`;

      return `
        <tr class="init-table-row ${isActive ? 'active' : ''}" onclick="CombatTracker.selectCombatantTurn(${idx})" title="Clique para marcar a vez deste combatente">
          <td class="init-col-pos">${posLabel}</td>
          <td class="init-col-name">
            <span class="init-color-dot" style="background:${c.color || '#68a378'}"></span>
            <span class="init-name-text">${this.escapeHtml(c.name)}</span>
          </td>
          <td class="init-col-val" onclick="event.stopPropagation()">
            <input type="number" class="init-val-input" value="${c.initiative}"
              onchange="CombatTracker.setCombatantInitiative('${c.id}', this.value)" />
          </td>
          <td class="init-col-del" onclick="event.stopPropagation()">
            <button class="turn-card-del" onclick="CombatTracker.removeCombatant('${c.id}')" title="Remover">✕</button>
          </td>
        </tr>
      `;
    }).join('');
  }
};

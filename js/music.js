// ============================================================================
// WILLOW'S TROOP - TRILHA SONORA (Spotify)
// Usa o player incorporado oficial do Spotify (iFrame API). Não pede senha nem
// chave de API: cada pessoa ouve pela própria conta Spotify (logada no navegador).
// O Mestre escolhe a playlist e ela é carregada no painel de todos os jogadores.
// ============================================================================

window.MusicPlayer = {
  api: null,
  apiLoading: false,
  ctrl: null,
  pendingUri: null,
  currentUri: '',
  expanded: false,
  followGm: true,
  shareWithTable: true,
  SAVED_KEY: 'willow_music_saved',

  // --------------------------------------------------------------------------
  // Interpretação de links
  // --------------------------------------------------------------------------
  parseSpotifyInput(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    const uriMatch = text.match(/^spotify:(playlist|album|track|episode|show|artist):([A-Za-z0-9]+)$/);
    if (uriMatch) return `spotify:${uriMatch[1]}:${uriMatch[2]}`;
    const urlMatch = text.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album|track|episode|show|artist)\/([A-Za-z0-9]+)/);
    if (urlMatch) return `spotify:${urlMatch[1]}:${urlMatch[2]}`;
    return null;
  },

  // --------------------------------------------------------------------------
  // Painel
  // --------------------------------------------------------------------------
  toggleDrawer(forceOpen) {
    const el = document.getElementById('music-drawer');
    if (!el) return;
    const open = forceOpen !== undefined ? forceOpen : el.classList.contains('closed');
    el.classList.toggle('closed', !open);
    document.getElementById('btn-music-toggle')?.classList.toggle('active', open);
    if (open) {
      this.ensureApi();
      this.renderSavedList();
      const isHost = !window.Multiplayer || window.Multiplayer.isHost;
      const shareRow = document.getElementById('music-share-row');
      const followRow = document.getElementById('music-follow-row');
      if (shareRow) shareRow.style.display = isHost ? 'flex' : 'none';
      if (followRow) followRow.style.display = isHost ? 'none' : 'flex';
    }
  },

  ensureApi() {
    if (this.api || this.apiLoading) return;
    this.apiLoading = true;
    window.onSpotifyIframeApiReady = (IFrameAPI) => {
      this.api = IFrameAPI;
      this.apiLoading = false;
      if (this.pendingUri) {
        const uri = this.pendingUri;
        this.pendingUri = null;
        this.mountPlayer(uri);
      }
    };
    const s = document.createElement('script');
    s.src = 'https://open.spotify.com/embed/iframe-api/v1';
    s.async = true;
    s.onerror = () => {
      this.apiLoading = false;
      this.setStatus('Não foi possível carregar o Spotify. Verifique a conexão ou bloqueadores de anúncio.');
    };
    document.head.appendChild(s);
  },

  setStatus(text) {
    const el = document.getElementById('music-status');
    if (el) el.textContent = text || '';
  },

  // --------------------------------------------------------------------------
  // Carregar / tocar
  // --------------------------------------------------------------------------
  submitInput() {
    const input = document.getElementById('music-link-input');
    const uri = this.parseSpotifyInput(input?.value);
    if (!uri) {
      this.setStatus('Link inválido. Cole o link de uma playlist, álbum ou música do Spotify.');
      return;
    }
    this.loadUri(uri, true);
    if (input) input.value = '';
  },

  loadUri(uri, broadcast = true) {
    if (!uri) return;
    this.currentUri = uri;
    this.setStatus('');
    const host = document.getElementById('music-embed-host');
    if (host) host.style.display = 'block';
    document.getElementById('music-empty')?.style.setProperty('display', 'none');

    if (this.ctrl) {
      try { this.ctrl.loadUri(uri); } catch (e) { this.mountPlayer(uri); }
    } else if (this.api) {
      this.mountPlayer(uri);
    } else {
      this.pendingUri = uri;
      this.ensureApi();
    }

    if (broadcast && window.Multiplayer?.isHost && this.shareWithTable) {
      window.Multiplayer.broadcast({ type: 'music_sync', action: 'load', uri });
      window.Multiplayer.scheduleRetainedRoomPublish?.();
    }
  },

  mountPlayer(uri) {
    const host = document.getElementById('music-embed-host');
    if (!host || !this.api) return;
    host.innerHTML = '<div id="music-embed-target"></div>';
    const target = document.getElementById('music-embed-target');
    this.api.createController(target, { uri, width: '100%', height: this.expanded ? 352 : 152 }, (ctrl) => {
      this.ctrl = ctrl;
      ctrl.addListener('playback_update', (e) => {
        const paused = !!e?.data?.isPaused;
        if (this._lastPaused === paused) return;
        this._lastPaused = paused;
        if (this._applyingRemote) return;
        if (window.Multiplayer?.isHost && this.shareWithTable) {
          window.Multiplayer.broadcast({ type: 'music_sync', action: paused ? 'pause' : 'play', uri: this.currentUri });
        }
      });
    });
  },

  toggleExpanded() {
    this.expanded = !this.expanded;
    const frame = document.querySelector('#music-embed-host iframe');
    if (frame) frame.style.height = this.expanded ? '352px' : '152px';
    const btn = document.getElementById('music-expand-btn');
    if (btn) btn.textContent = this.expanded ? 'Recolher lista' : 'Ver lista de faixas';
  },

  // --------------------------------------------------------------------------
  // Sincronia com a mesa (o Mestre manda, os jogadores acompanham)
  // --------------------------------------------------------------------------
  applyRemote(msg) {
    if (!msg) return;
    if (msg.action === 'load' && msg.uri) {
      this.loadUri(msg.uri, false);
      window.App?.showToast('O Mestre colocou uma trilha sonora. Abra o painel de música para ouvir.');
      return;
    }
    if (!this.followGm || !this.ctrl) return;
    this._applyingRemote = true;
    try {
      if (msg.action === 'play') this.ctrl.play();
      else if (msg.action === 'pause') this.ctrl.pause();
    } catch (e) {}
    setTimeout(() => { this._applyingRemote = false; }, 800);
  },

  // --------------------------------------------------------------------------
  // Favoritos (guardados só neste navegador)
  // --------------------------------------------------------------------------
  getSaved() {
    try { return JSON.parse(localStorage.getItem(this.SAVED_KEY) || '[]'); } catch (e) { return []; }
  },

  saveCurrent() {
    if (!this.currentUri) {
      this.setStatus('Carregue uma playlist antes de salvar.');
      return;
    }
    const name = prompt('Nome para esta trilha (ex: Taverna, Combate, Floresta):');
    if (!name || !name.trim()) return;
    const list = this.getSaved().filter(i => i.uri !== this.currentUri);
    list.push({ name: name.trim().slice(0, 40), uri: this.currentUri });
    try { localStorage.setItem(this.SAVED_KEY, JSON.stringify(list)); } catch (e) {}
    this.renderSavedList();
  },

  removeSaved(uri) {
    const list = this.getSaved().filter(i => i.uri !== uri);
    try { localStorage.setItem(this.SAVED_KEY, JSON.stringify(list)); } catch (e) {}
    this.renderSavedList();
  },

  renderSavedList() {
    const box = document.getElementById('music-saved-list');
    if (!box) return;
    const list = this.getSaved();
    if (list.length === 0) {
      box.innerHTML = '<div class="music-saved-empty">Nenhuma trilha salva ainda.</div>';
      return;
    }
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    box.innerHTML = list.map(i => `
      <div class="music-saved-item">
        <button class="music-saved-play" data-uri="${esc(i.uri)}">${esc(i.name)}</button>
        <button class="music-saved-del" data-uri="${esc(i.uri)}" title="Remover">&times;</button>
      </div>`).join('');
    box.querySelectorAll('.music-saved-play').forEach(b => b.addEventListener('click', () => this.loadUri(b.dataset.uri, true)));
    box.querySelectorAll('.music-saved-del').forEach(b => b.addEventListener('click', () => this.removeSaved(b.dataset.uri)));
  }
};

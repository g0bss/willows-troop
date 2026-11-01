// ============================================================================
// TAVERNA 3D - MULTIPLAYER P2P (WebRTC PeerJS + Local BroadcastChannel Sync)
// ============================================================================

window.Multiplayer = {
  peer: null,
  isHost: true,
  roomCode: null,
  myId: 'p_' + Math.random().toString(36).substring(2, 9),
  myName: 'Mestre',
  myColor: '#f0b942',
  myRole: 'gm', // 'gm' or 'player'
  connections: new Map(), // peerId -> DataConnection
  hostConn: null,
  players: new Map(), // playerId -> { id, name, color, role }
  localChannel: null,
  onEventCallback: null,
  onStatusChange: null,

  init(onEventCallback, onStatusChange) {
    this.onEventCallback = onEventCallback;
    this.onStatusChange = onStatusChange;

    this.players.set(this.myId, {
      id: this.myId,
      name: this.myName,
      color: this.myColor,
      role: this.myRole
    });

    // Local multi-tab sync via BroadcastChannel (works instantly even offline!)
    if ('BroadcastChannel' in window) {
      this.localChannel = new BroadcastChannel('taverna_3d_rpg_channel');
      this.localChannel.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg || msg.senderId === this.myId) return;
        this.handleIncomingMessage(msg);
      };
    }

    // Check URL hash or query param for room code (e.g. ?room=TAVERNA-1234)
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');
    if (urlRoom) {
      setTimeout(() => this.joinRoom(urlRoom), 700);
    }
  },

  updateProfile(name, color, role) {
    this.myName = name || this.myName;
    this.myColor = color || this.myColor;
    this.myRole = role || this.myRole;
    this.players.set(this.myId, {
      id: this.myId,
      name: this.myName,
      color: this.myColor,
      role: this.myRole
    });
    this.broadcast({
      type: 'player_info',
      player: this.players.get(this.myId)
    });
    if (this.onStatusChange) this.onStatusChange();
  },

  // Host a P2P WebRTC room with a clean readable code
  createRoom(customCode) {
    if (typeof Peer === 'undefined') {
      if (window.App) window.App.showToast('Biblioteca PeerJS indisponível offline. Sincronização entre abas locais ativa!');
      return;
    }

    if (this.peer) {
      this.peer.destroy();
    }

    const num = Math.floor(1000 + Math.random() * 9000);
    const cleanCode = (customCode || `RPG-${num}`).toUpperCase().replace(/[^A-Z0-9-]/g, '');
    const peerId = `taverna3d-room-${cleanCode}`;

    this.isHost = true;
    this.roomCode = cleanCode;
    this.peer = new Peer(peerId);

    this.peer.on('open', () => {
      if (window.App) {
        window.App.showToast(`Sala Online Criada! Código: ${this.roomCode}`);
      }
      if (this.onStatusChange) this.onStatusChange();
    });

    this.peer.on('connection', (conn) => {
      conn.on('open', () => {
        this.connections.set(conn.peer, conn);
        // Send full table state to the newly connected player
        if (window.App && window.App.getFullTableState) {
          conn.send({
            type: 'full_sync',
            senderId: this.myId,
            state: window.App.getFullTableState(),
            players: Array.from(this.players.values())
          });
        }
      });

      conn.on('data', (data) => {
        this.handleIncomingMessage(data, conn.peer);
      });

      conn.on('close', () => {
        this.connections.delete(conn.peer);
        if (this.onStatusChange) this.onStatusChange();
      });
    });

    this.peer.on('error', (err) => {
      console.warn('PeerJS Error:', err);
      if (err.type === 'unavailable-id') {
        this.createRoom(`RPG-${Math.floor(1000 + Math.random() * 9000)}`);
      } else if (window.App) {
        window.App.showToast('Aviso de rede P2P: ' + err.type);
      }
    });
  },

  // Join an existing P2P WebRTC room by code
  joinRoom(codeInput) {
    if (!codeInput) return;
    const cleanCode = codeInput.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!cleanCode) return;

    if (typeof Peer === 'undefined') {
      if (window.App) window.App.showToast('PeerJS não carregado.');
      return;
    }

    if (this.peer) {
      this.peer.destroy();
    }

    this.isHost = false;
    this.roomCode = cleanCode;
    this.myRole = 'player';
    if (this.myName === 'Mestre') {
      this.myName = 'Jogador ' + Math.floor(1 + Math.random() * 99);
    }

    this.peer = new Peer();
    this.peer.on('open', () => {
      const targetPeerId = `taverna3d-room-${cleanCode}`;
      const conn = this.peer.connect(targetPeerId, { reliable: true });
      this.hostConn = conn;

      conn.on('open', () => {
        if (window.App) {
          window.App.showToast(`Conectado à sala ${cleanCode}!`);
        }
        conn.send({
          type: 'player_info',
          senderId: this.myId,
          player: {
            id: this.myId,
            name: this.myName,
            color: this.myColor,
            role: this.myRole
          }
        });
        if (this.onStatusChange) this.onStatusChange();
      });

      conn.on('data', (data) => {
        this.handleIncomingMessage(data);
      });

      conn.on('close', () => {
        if (window.App) window.App.showToast('Conexão com o Host encerrada.');
        this.hostConn = null;
        if (this.onStatusChange) this.onStatusChange();
      });
    });

    this.peer.on('error', (err) => {
      console.warn('Join error:', err);
      if (window.App) {
        window.App.showToast('Não foi possível encontrar a sala ' + cleanCode);
      }
    });
  },

  handleIncomingMessage(msg, fromPeerId) {
    if (!msg || msg.senderId === this.myId) return;

    // If we are the Host, relay message to all other connected peers
    if (this.isHost && fromPeerId) {
      this.connections.forEach((conn, peerKey) => {
        if (peerKey !== fromPeerId && conn.open) {
          conn.send(msg);
        }
      });
    }

    if (msg.type === 'player_info' && msg.player) {
      this.players.set(msg.player.id, msg.player);
      if (this.onStatusChange) this.onStatusChange();
      if (window.App) {
        window.App.showToast(`${msg.player.name} entrou na mesa!`);
      }
      return;
    }

    if (msg.type === 'full_sync' && msg.players) {
      msg.players.forEach(p => this.players.set(p.id, p));
      if (this.onStatusChange) this.onStatusChange();
    }

    if (this.onEventCallback) {
      this.onEventCallback(msg);
    }
  },

  broadcast(payload) {
    const packet = {
      ...payload,
      senderId: this.myId,
      senderName: this.myName,
      senderColor: this.myColor
    };

    // Send via Local BroadcastChannel (for multi-tab testing on same PC)
    if (this.localChannel) {
      try {
        this.localChannel.postMessage(packet);
      } catch (e) {}
    }

    // Send via WebRTC PeerJS
    if (this.isHost) {
      this.connections.forEach(conn => {
        if (conn.open) conn.send(packet);
      });
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send(packet);
    }
  }
};

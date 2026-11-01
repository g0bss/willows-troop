// ============================================================================
// WILLOW'S TROOP - MULTIPLAYER ENGINE (Dual Transport: WebRTC P2P + WSS Relay)
// ============================================================================

window.Multiplayer = {
  peer: null,
  mqttClient: null,
  isHost: true,
  roomCode: null,
  myId: 'p_' + Math.random().toString(36).substring(2, 9),
  myName: 'Mestre',
  myColor: '#c2a36b',
  myRole: 'gm', // 'gm' or 'player'
  connections: new Map(), // peerId -> DataConnection
  hostConn: null,
  players: new Map(), // playerId -> { id, name, color, role }
  localChannel: null,
  onEventCallback: null,
  onStatusChange: null,
  seenPacketIds: new Set(),
  incomingChunks: new Map(), // msgId -> { parts: [], received: 0, total: 0 }
  joinRetryTimer: null,
  connectedToHost: false,

  // ICE servers including public STUN + free OpenRelay TURN for CGNAT traversal
  iceConfig: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  },

  init(onEventCallback, onStatusChange) {
    this.onEventCallback = onEventCallback;
    this.onStatusChange = onStatusChange;

    this.players.set(this.myId, {
      id: this.myId,
      name: this.myName,
      color: this.myColor,
      role: this.myRole
    });

    // 1. Local multi-tab sync via BroadcastChannel
    if ('BroadcastChannel' in window) {
      this.localChannel = new BroadcastChannel('taverna_3d_rpg_channel');
      this.localChannel.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg || msg.senderId === this.myId) return;
        this.processRawPacket(msg);
      };
    }

    // 2. Auto-join if URL has ?room=RPG-XXXX
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');
    if (urlRoom) {
      const normalized = this.normalizeRoomCode(urlRoom);
      if (normalized) {
        setTimeout(() => this.joinRoom(normalized), 600);
      }
    }
  },

  // Normalizes any user input ("9797", "rpg 9797", "rpg9797", full URL, or "RPG-9797") -> "RPG-9797"
  normalizeRoomCode(rawInput) {
    if (!rawInput) return '';
    let str = String(rawInput).trim();

    // If user pasted a full URL with ?room=...
    const roomMatch = str.match(/[?&]room=([A-Za-z0-9-_]+)/i);
    if (roomMatch) {
      str = roomMatch[1];
    }

    str = str.toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '');

    // If user typed only 4 digits e.g. "9797", prefix with "RPG-"
    if (/^\d{3,6}$/.test(str)) {
      return `RPG-${str}`;
    }
    // If user typed "RPG9797" without hyphen, insert hyphen
    const prefixMatch = str.match(/^RPG(\d{3,6})$/);
    if (prefixMatch) {
      return `RPG-${prefixMatch[1]}`;
    }
    return str;
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

  // Connects to public WSS MQTT broker so rooms work across any CGNAT/firewall
  connectMqttRelay(roomCode, onConnected) {
    if (this.mqttClient) {
      try { this.mqttClient.end(true); } catch (e) {}
      this.mqttClient = null;
    }
    if (typeof mqtt === 'undefined') {
      if (onConnected) onConnected(false);
      return;
    }

    const topic = `willowstroop/v2/room/${roomCode}`;
    const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
      clientId: 'wt_' + this.myId + '_' + Math.floor(Math.random() * 10000),
      clean: true,
      connectTimeout: 6000,
      reconnectPeriod: 2000
    });

    this.mqttClient = client;

    client.on('connect', () => {
      client.subscribe(topic, { qos: 0 }, (err) => {
        if (!err && onConnected) onConnected(true);
      });
    });

    client.on('message', (_t, payloadBuf) => {
      try {
        const text = payloadBuf.toString();
        const data = JSON.parse(text);
        if (!data || data.senderId === this.myId) return;
        if (data.targetId && data.targetId !== this.myId) return;
        this.processRawPacket(data, data.senderId);
      } catch (e) {}
    });
  },

  // Host a room with both WebRTC PeerJS and WSS Relay
  createRoom(customCode) {
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
      this.peer = null;
    }
    if (this.joinRetryTimer) {
      clearInterval(this.joinRetryTimer);
      this.joinRetryTimer = null;
    }

    const num = Math.floor(1000 + Math.random() * 9000);
    const cleanCode = this.normalizeRoomCode(customCode || `RPG-${num}`);
    const peerId = `taverna3d-room-${cleanCode}`;

    this.isHost = true;
    this.roomCode = cleanCode;
    this.connectedToHost = true;

    // Update UI immediately so code is visible right away
    if (this.onStatusChange) this.onStatusChange();

    // 1. Start WSS Cloud Relay immediately (works through 100% of routers/CGNAT)
    this.connectMqttRelay(cleanCode, (ok) => {
      if (ok && window.App) {
        window.App.showToast(`Sala Online Criada! Código: ${this.roomCode}`);
      }
      if (this.onStatusChange) this.onStatusChange();
    });

    // 2. Also start PeerJS WebRTC P2P
    if (typeof Peer !== 'undefined') {
      try {
        this.peer = new Peer(peerId, { config: this.iceConfig });

        this.peer.on('open', () => {
          if (window.App) {
            window.App.showToast(`Sala Online Criada! Código: ${this.roomCode}`);
          }
          if (this.onStatusChange) this.onStatusChange();
        });

        this.peer.on('connection', (conn) => {
          conn.on('open', () => {
            this.connections.set(conn.peer, conn);
            this.sendFullSyncToPlayer(null, conn);
          });

          conn.on('data', (data) => {
            this.processRawPacket(data, conn.peer);
          });

          conn.on('close', () => {
            this.connections.delete(conn.peer);
            if (this.onStatusChange) this.onStatusChange();
          });
        });

        this.peer.on('error', (err) => {
          console.warn('PeerJS Host Notice:', err);
          if (err.type === 'unavailable-id') {
            this.createRoom(`RPG-${Math.floor(1000 + Math.random() * 9000)}`);
          }
        });
      } catch (e) {
        console.warn('PeerJS init fallback to WSS Relay:', e);
      }
    }
  },

  // Join an existing room by code
  joinRoom(codeInput) {
    const cleanCode = this.normalizeRoomCode(codeInput);
    if (!cleanCode) {
      if (window.App) window.App.showToast('Digite um código de sala válido (ex: RPG-4821).');
      return;
    }

    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
      this.peer = null;
    }
    if (this.joinRetryTimer) {
      clearInterval(this.joinRetryTimer);
      this.joinRetryTimer = null;
    }

    this.isHost = false;
    this.roomCode = cleanCode;
    this.connectedToHost = false;
    this.myRole = 'player';
    if (this.myName === 'Mestre') {
      this.myName = 'Jogador ' + Math.floor(1 + Math.random() * 99);
    }

    if (window.App) {
      window.App.showToast(`Conectando à sala ${cleanCode}...`);
      const lobbyInput = document.getElementById('lobby-join-code');
      const mpInput = document.getElementById('mp-join-code');
      if (lobbyInput) lobbyInput.value = cleanCode;
      if (mpInput) mpInput.value = cleanCode;
    }
    if (this.onStatusChange) this.onStatusChange();

    const announceJoin = () => {
      this.broadcast({
        type: 'join_request',
        player: {
          id: this.myId,
          name: this.myName,
          color: this.myColor,
          role: this.myRole
        }
      });
    };

    // 1. Connect via WSS Relay (guaranteed to bypass CGNAT)
    this.connectMqttRelay(cleanCode, (ok) => {
      if (ok) {
        announceJoin();
      }
    });

    // Retry join_request a few times until host responds with full_sync
    let attempts = 0;
    this.joinRetryTimer = setInterval(() => {
      attempts++;
      if (this.connectedToHost || attempts > 8) {
        clearInterval(this.joinRetryTimer);
        this.joinRetryTimer = null;
        if (!this.connectedToHost && window.App) {
          window.App.showToast(`Não foi possível encontrar a sala ${cleanCode}. Verifique se o Mestre gerou o código.`);
        }
        return;
      }
      announceJoin();
    }, 1600);

    // 2. Also attempt direct WebRTC PeerJS connection in parallel
    if (typeof Peer !== 'undefined') {
      try {
        this.peer = new Peer({ config: this.iceConfig });
        this.peer.on('open', () => {
          const targetPeerId = `taverna3d-room-${cleanCode}`;
          const conn = this.peer.connect(targetPeerId, { reliable: true });
          this.hostConn = conn;

          conn.on('open', () => {
            this.onSuccessfullyJoinedHost();
            announceJoin();
          });

          conn.on('data', (data) => {
            this.processRawPacket(data);
          });

          conn.on('close', () => {
            this.hostConn = null;
          });
        });

        this.peer.on('error', (err) => {
          console.warn('PeerJS direct join fallback to WSS relay:', err.type);
        });
      } catch (e) {}
    }
  },

  onSuccessfullyJoinedHost() {
    if (this.connectedToHost) return;
    this.connectedToHost = true;
    if (this.joinRetryTimer) {
      clearInterval(this.joinRetryTimer);
      this.joinRetryTimer = null;
    }
    if (window.App) {
      window.App.showToast(`Conectado à sala ${this.roomCode}!`);
      document.getElementById('lobby-screen')?.classList.add('hidden');
      document.getElementById('multiplayer-modal')?.classList.remove('open');
    }
    if (this.onStatusChange) this.onStatusChange();
  },

  async sendFullSyncToPlayer(targetPlayerId = null, directConn = null) {
    if (!window.App) return;
    const state = window.App.getNetworkSafeTableState
      ? await window.App.getNetworkSafeTableState()
      : window.App.getFullTableState();

    const packet = {
      type: 'full_sync',
      targetId: targetPlayerId || null,
      state,
      players: Array.from(this.players.values())
    };

    if (directConn && directConn.open) {
      this.sendPacketWithChunking(packet, directConn);
    } else {
      this.broadcast(packet);
    }
  },

  // Handles packet deduplication and automatic chunk reassembly
  processRawPacket(data, fromPeerId) {
    if (!data || data.senderId === this.myId) return;

    if (data.type === '_chunk') {
      const { chunkMsgId, idx, total, chunkData, senderId } = data;
      if (!this.incomingChunks.has(chunkMsgId)) {
        this.incomingChunks.set(chunkMsgId, {
          parts: new Array(total),
          received: 0,
          total
        });
      }
      const entry = this.incomingChunks.get(chunkMsgId);
      if (entry.parts[idx] === undefined) {
        entry.parts[idx] = chunkData;
        entry.received++;
      }
      if (entry.received === entry.total) {
        this.incomingChunks.delete(chunkMsgId);
        try {
          const fullJson = entry.parts.join('');
          const fullPacket = JSON.parse(fullJson);
          this.handleIncomingMessage(fullPacket, fromPeerId || senderId);
        } catch (e) {
          console.warn('Chunk reassembly error:', e);
        }
      }
      return;
    }

    if (data.packetId) {
      if (this.seenPacketIds.has(data.packetId)) return;
      this.seenPacketIds.add(data.packetId);
      if (this.seenPacketIds.size > 600) {
        const first = this.seenPacketIds.values().next().value;
        this.seenPacketIds.delete(first);
      }
    }

    this.handleIncomingMessage(data, fromPeerId);
  },

  handleIncomingMessage(msg, fromPeerId) {
    if (!msg || msg.senderId === this.myId) return;

    // Relay to other WebRTC peers if Host
    if (this.isHost && fromPeerId) {
      this.connections.forEach((conn, peerKey) => {
        if (peerKey !== fromPeerId && conn.open) {
          this.sendPacketWithChunking(msg, conn);
        }
      });
    }

    if (msg.type === 'join_request' && msg.player) {
      const isNew = !this.players.has(msg.player.id);
      this.players.set(msg.player.id, msg.player);
      if (this.onStatusChange) this.onStatusChange();
      if (this.isHost) {
        if (isNew && window.App) {
          window.App.showToast(`${msg.player.name} entrou na mesa!`);
        }
        this.sendFullSyncToPlayer(msg.player.id, null);
      }
      return;
    }

    if (msg.type === 'player_info' && msg.player) {
      const isNew = !this.players.has(msg.player.id);
      this.players.set(msg.player.id, msg.player);
      if (this.onStatusChange) this.onStatusChange();
      if (isNew && window.App) {
        window.App.showToast(`${msg.player.name} conectou!`);
      }
      return;
    }

    if (msg.type === 'full_sync') {
      if (!this.isHost) {
        this.onSuccessfullyJoinedHost();
      }
      if (msg.players) {
        msg.players.forEach(p => this.players.set(p.id, p));
        if (this.onStatusChange) this.onStatusChange();
      }
    }

    if (this.onEventCallback) {
      this.onEventCallback(msg);
    }
  },

  sendPacketWithChunking(packet, targetConn = null) {
    const jsonStr = JSON.stringify(packet);
    const MAX_CHUNK = 24000; // 24KB safe limit for WebRTC & MQTT frames

    if (jsonStr.length <= MAX_CHUNK) {
      if (targetConn) {
        try { targetConn.send(packet); } catch (e) {}
      } else {
        this.rawTransportSend(packet, jsonStr);
      }
      return;
    }

    const total = Math.ceil(jsonStr.length / MAX_CHUNK);
    const chunkMsgId = 'chk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    for (let i = 0; i < total; i++) {
      const chunkPacket = {
        type: '_chunk',
        senderId: this.myId,
        targetId: packet.targetId || null,
        chunkMsgId,
        idx: i,
        total,
        chunkData: jsonStr.slice(i * MAX_CHUNK, (i + 1) * MAX_CHUNK)
      };
      if (targetConn) {
        try { targetConn.send(chunkPacket); } catch (e) {}
      } else {
        this.rawTransportSend(chunkPacket, JSON.stringify(chunkPacket));
      }
    }
  },

  rawTransportSend(packetObj, jsonStr) {
    // 1. Local BroadcastChannel
    if (this.localChannel) {
      try { this.localChannel.postMessage(packetObj); } catch (e) {}
    }

    // 2. MQTT over WSS Relay
    if (this.mqttClient && this.mqttClient.connected && this.roomCode) {
      const topic = `willowstroop/v2/room/${this.roomCode}`;
      try {
        this.mqttClient.publish(topic, jsonStr, { qos: 0 });
      } catch (e) {}
    }

    // 3. WebRTC PeerJS
    if (this.isHost) {
      this.connections.forEach(conn => {
        if (conn.open) {
          try { conn.send(packetObj); } catch (e) {}
        }
      });
    } else if (this.hostConn && this.hostConn.open) {
      try { this.hostConn.send(packetObj); } catch (e) {}
    }
  },

  broadcast(payload) {
    const packet = {
      ...payload,
      packetId: 'pk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      senderId: this.myId,
      senderName: this.myName,
      senderColor: this.myColor
    };
    this.sendPacketWithChunking(packet, null);
  }
};

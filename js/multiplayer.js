// ============================================================================
// WILLOW'S TROOP - MULTIPLAYER ENGINE
// Cross-Region Architecture (Brazil <-> USA):
// 1. Multi-Broker Global WSS Relay Pool (HiveMQ + EMQX)
// 2. MQTT Retained Room State & Retained Map Chunks (instant delivery on join)
// 3. Deterministic Map Chunk Reassembly by mapHash + Missing-Chunk Repair
// 4. WebRTC PeerJS P2P DataChannel with OpenRelay TURN
// ============================================================================

window.Multiplayer = {
  peer: null,
  mqttClients: [],
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
  incomingChunks: new Map(), // chunkMsgId -> { parts: [], received: 0, total: 0 }
  incomingMapTransfer: null, // { mapHash, total, parts: [], received: 0, settings }
  joinRetryTimer: null,
  mapSyncWatchdog: null,
  connectedToHost: false,
  lastFullSyncTime: 0,
  lastMapStreamTime: 0,
  retainedPublishTimer: null,

  // Global WSS MQTT Brokers (both Brazil and USA clients connect to the same global clusters)
  mqttBrokers: [
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://broker.emqx.io:8084/mqtt'
  ],

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
        setTimeout(() => this.joinRoom(normalized), 500);
      }
    }
  },

  // Normalizes any user input ("9797", "rpg 9797", "rpg9797", full URL, or "RPG-9797") -> "RPG-9797"
  normalizeRoomCode(rawInput) {
    if (!rawInput) return '';
    let str = String(rawInput).trim();

    const roomMatch = str.match(/[?&]room=([A-Za-z0-9-_]+)/i);
    if (roomMatch) {
      str = roomMatch[1];
    }

    str = str.toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '');

    if (/^\d{3,6}$/.test(str)) {
      return `RPG-${str}`;
    }
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

  decodeMqttPayload(payloadBuf) {
    if (!payloadBuf) return '';
    if (typeof payloadBuf === 'string') return payloadBuf;
    try {
      if (typeof TextDecoder !== 'undefined') {
        return new TextDecoder('utf-8').decode(payloadBuf);
      }
    } catch (e) {}
    return payloadBuf.toString();
  },

  disconnectMqttRelays() {
    if (this.mqttClients && this.mqttClients.length > 0) {
      this.mqttClients.forEach(c => {
        try { c.end(true); } catch (e) {}
      });
    }
    this.mqttClients = [];
  },

  // Connects simultaneously to global WSS MQTT brokers and subscribes to room wildcard
  connectMqttRelay(roomCode, onFirstConnected) {
    this.disconnectMqttRelays();

    if (typeof mqtt === 'undefined') {
      if (onFirstConnected) onFirstConnected(false);
      return;
    }

    const baseTopic = `willowstroop/v3/room/${roomCode}`;
    let notified = false;

    this.mqttBrokers.forEach((brokerUrl, idx) => {
      try {
        const client = mqtt.connect(brokerUrl, {
          clientId: `wt_${this.myId}_${idx}_${Math.floor(Math.random() * 99999)}`,
          clean: true,
          connectTimeout: 7000,
          reconnectPeriod: 2500
        });

        this.mqttClients.push(client);

        client.on('connect', () => {
          // Subscribe to all subtopics for this room (events, retained state, retained map chunks)
          client.subscribe(`${baseTopic}/#`, { qos: 0 }, (err) => {
            if (!err) {
              if (!notified) {
                notified = true;
                if (onFirstConnected) onFirstConnected(true);
              }
              // If we are the Host, immediately publish our retained room state + map to this broker!
              if (this.isHost && this.roomCode === roomCode) {
                this.publishRetainedRoomState(client);
              }
            }
          });
        });

        client.on('message', (topic, payloadBuf) => {
          try {
            const text = this.decodeMqttPayload(payloadBuf);
            if (!text) return;
            const data = JSON.parse(text);
            if (!data || data.senderId === this.myId) return;
            if (data.targetId && data.targetId !== this.myId) return;
            this.processRawPacket(data, data.senderId);
          } catch (e) {}
        });
      } catch (err) {
        console.warn('MQTT broker connect error:', brokerUrl, err);
      }
    });
  },

  // Schedules a debounced update of the retained room state & map chunks on all connected brokers
  scheduleRetainedRoomPublish() {
    if (!this.isHost || !this.roomCode) return;
    if (this.retainedPublishTimer) clearTimeout(this.retainedPublishTimer);
    this.retainedPublishTimer = setTimeout(() => {
      this.publishRetainedRoomState(null);
    }, 120);
  },

  // Publishes the GM's table state and custom map chunks with retain:true so any joining player
  // in any country immediately downloads the exact map from the broker!
  async publishRetainedRoomState(specificClient = null) {
    if (!this.isHost || !this.roomCode || !window.App) return;

    const baseTopic = `willowstroop/v3/room/${this.roomCode}`;
    const state = window.App.getNetworkSafeTableState
      ? await window.App.getNetworkSafeTableState()
      : window.App.getFullTableState();

    const hasCustom = !!(window.App.mapConfig && window.App.mapConfig.customImageUrl);
    let jpegUrl = null;
    let mapHash = null;
    let chunks = [];
    const CHUNK_SIZE = 4800; // 4.8KB per chunk: never throttled by any broker or WebRTC DataChannel

    if (hasCustom) {
      jpegUrl = window.App.cachedNetMapJpeg || window.App.getFastNetworkCustomMapJpeg() || window.App.mapConfig.customImageUrl;
      mapHash = window.App.mapConfig.customMapHash || ('m_' + jpegUrl.length);
      const total = Math.ceil(jpegUrl.length / CHUNK_SIZE);
      for (let i = 0; i < total; i++) {
        chunks.push(jpegUrl.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
    }

    const retainedStatePacket = {
      type: 'retained_room_state',
      senderId: this.myId,
      state,
      players: Array.from(this.players.values()),
      mapMeta: {
        hasCustomImage: hasCustom,
        customMapHash: mapHash,
        totalChunks: chunks.length,
        settings: window.App.getLightweightMapSettings ? window.App.getLightweightMapSettings() : null
      }
    };

    const stateJson = JSON.stringify(retainedStatePacket);
    const targets = specificClient ? [specificClient] : this.mqttClients;

    targets.forEach(client => {
      if (!client || !client.connected) return;
      try {
        client.publish(`${baseTopic}/state`, stateJson, { qos: 0, retain: true });
      } catch (e) {}

      if (hasCustom && chunks.length > 0) {
        const lightSettings = window.App.getLightweightMapSettings ? window.App.getLightweightMapSettings() : null;
        chunks.forEach((sliceStr, idx) => {
          setTimeout(() => {
            if (!client.connected || this.roomCode === null) return;
            const chunkObj = {
              type: 'map_chunk',
              senderId: this.myId,
              mapHash,
              idx,
              total: chunks.length,
              chunkData: sliceStr,
              settings: idx === 0 ? lightSettings : null
            };
            try {
              client.publish(`${baseTopic}/map/${idx}`, JSON.stringify(chunkObj), { qos: 0, retain: true });
            } catch (e) {}
          }, idx * 45);
        });
      }
    });
  },

  // Streams the custom map chunks (or specific missing chunk indices) over both MQTT and WebRTC
  streamCustomMapChunks(missingIndices = null, targetConn = null) {
    if (!this.isHost || !window.App || !window.App.mapConfig?.customImageUrl) return;

    const now = performance.now();
    // Prevent overlapping duplicate full streams if triggered multiple times within 1.2s
    if (!missingIndices && !targetConn && (now - this.lastMapStreamTime < 1200)) {
      return;
    }
    if (!missingIndices && !targetConn) {
      this.lastMapStreamTime = now;
    }

    const jpegUrl = window.App.cachedNetMapJpeg || window.App.getFastNetworkCustomMapJpeg() || window.App.mapConfig.customImageUrl;
    if (!jpegUrl) return;

    const mapHash = window.App.mapConfig.customMapHash || ('m_' + jpegUrl.length);
    const CHUNK_SIZE = 4800;
    const total = Math.ceil(jpegUrl.length / CHUNK_SIZE);
    const lightSettings = window.App.getLightweightMapSettings ? window.App.getLightweightMapSettings() : null;

    const indicesToSend = Array.isArray(missingIndices) && missingIndices.length > 0
      ? missingIndices.filter(i => i >= 0 && i < total)
      : Array.from({ length: total }, (_, i) => i);

    indicesToSend.forEach((chunkIdx, seqIdx) => {
      const sliceStr = jpegUrl.slice(chunkIdx * CHUNK_SIZE, (chunkIdx + 1) * CHUNK_SIZE);
      setTimeout(() => {
        const chunkObj = {
          type: 'map_chunk',
          senderId: this.myId,
          mapHash,
          idx: chunkIdx,
          total,
          chunkData: sliceStr,
          settings: chunkIdx === 0 || seqIdx === 0 ? lightSettings : null
        };

        if (targetConn && targetConn.open) {
          try { targetConn.send(chunkObj); } catch (e) {}
        } else {
          const jsonStr = JSON.stringify(chunkObj);
          // Send over BroadcastChannel
          if (this.localChannel) {
            try { this.localChannel.postMessage(chunkObj); } catch (e) {}
          }
          // Send over all connected MQTT brokers as retained chunk on /map/{idx}
          if (this.roomCode) {
            const topic = `willowstroop/v3/room/${this.roomCode}/map/${chunkIdx}`;
            this.mqttClients.forEach(c => {
              if (c && c.connected) {
                try { c.publish(topic, jsonStr, { qos: 0, retain: true }); } catch (e) {}
              }
            });
          }
          // Send over WebRTC connections
          this.connections.forEach(conn => {
            if (conn.open) {
              try { conn.send(chunkObj); } catch (e) {}
            }
          });
        }
      }, seqIdx * 45);
    });
  },

  // Host a room with both Multi-Broker WSS Relay and WebRTC PeerJS
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
    this.myRole = 'gm';

    if (this.onStatusChange) this.onStatusChange();

    let toastShown = false;
    const notifyCreated = () => {
      if (!toastShown && window.App) {
        toastShown = true;
        window.App.showToast(`Sala Online Criada! Código: ${this.roomCode}`);
      }
      if (this.onStatusChange) this.onStatusChange();
    };

    // 1. Start Multi-Broker WSS Cloud Relay immediately
    this.connectMqttRelay(cleanCode, (ok) => {
      if (ok) notifyCreated();
    });

    // 2. Also start PeerJS WebRTC P2P
    if (typeof Peer !== 'undefined') {
      try {
        this.peer = new Peer(peerId, { config: this.iceConfig });

        this.peer.on('open', () => {
          notifyCreated();
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
    this.incomingMapTransfer = null;
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

    // 1. Connect via Multi-Broker WSS Relay (immediately receives retained room state & map chunks!)
    this.connectMqttRelay(cleanCode, (ok) => {
      if (ok) {
        announceJoin();
      }
    });

    // Retry join_request until host or retained room state responds
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
    }, 1700);

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
    if (!this.connectedToHost) {
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
    }

    // Watchdog: checks every 1.8s if a custom map transfer is incomplete and requests ONLY the missing chunks!
    if (this.mapSyncWatchdog) clearInterval(this.mapSyncWatchdog);
    this.mapSyncWatchdog = setInterval(() => {
      if (this.isHost) {
        clearInterval(this.mapSyncWatchdog);
        return;
      }
      if (this.incomingMapTransfer && this.incomingMapTransfer.received < this.incomingMapTransfer.total) {
        const missing = [];
        for (let i = 0; i < this.incomingMapTransfer.total; i++) {
          if (this.incomingMapTransfer.parts[i] === undefined) {
            missing.push(i);
          }
        }
        if (missing.length > 0) {
          this.broadcast({
            type: 'req_missing_map_chunks',
            mapHash: this.incomingMapTransfer.mapHash,
            missing
          });
        }
      } else if (window.App && window.App.needsCustomMapFromHost) {
        this.broadcast({ type: 'request_custom_map' });
      }
    }, 1800);
  },

  async sendFullSyncToPlayer(targetPlayerId = null, directConn = null) {
    if (!window.App) return;

    const now = performance.now();
    // Avoid sending duplicate broadcast full_sync within 600ms
    if (!directConn && (now - this.lastFullSyncTime < 600)) {
      return;
    }
    if (!directConn) {
      this.lastFullSyncTime = now;
    }

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

    // Update retained state and stream custom map chunks if GM has a custom map
    this.scheduleRetainedRoomPublish();
    if (window.App.mapConfig && window.App.mapConfig.customImageUrl) {
      setTimeout(() => {
        this.streamCustomMapChunks(null, directConn);
      }, 100);
    }
  },

  // Handles deterministic map chunk reassembly (works across HiveMQ + EMQX + PeerJS simultaneously!)
  handleIncomingMapChunk(data) {
    if (this.isHost) return;
    const { mapHash, idx, total, chunkData, settings } = data;
    if (!mapHash || typeof idx !== 'number' || !total || !chunkData) return;

    // If we already applied this exact custom map hash, ignore duplicate chunks
    if (window.App && window.App.mapConfig.customMapHash === mapHash && window.App.mapConfig.customImageUrl && !window.App.needsCustomMapFromHost) {
      return;
    }

    if (!this.incomingMapTransfer || this.incomingMapTransfer.mapHash !== mapHash || this.incomingMapTransfer.total !== total) {
      this.incomingMapTransfer = {
        mapHash,
        total,
        parts: new Array(total),
        received: 0,
        settings: settings || null
      };
    }

    if (settings && !this.incomingMapTransfer.settings) {
      this.incomingMapTransfer.settings = settings;
    }

    if (this.incomingMapTransfer.parts[idx] === undefined) {
      this.incomingMapTransfer.parts[idx] = chunkData;
      this.incomingMapTransfer.received++;
    }

    if (this.incomingMapTransfer.received === this.incomingMapTransfer.total) {
      const fullDataUrl = this.incomingMapTransfer.parts.join('');
      const finalSettings = this.incomingMapTransfer.settings;
      this.incomingMapTransfer = null;

      if (window.App) {
        window.App.onNetworkMessage({
          type: 'custom_map_sync',
          customMapHash: mapHash,
          customImageUrl: fullDataUrl,
          settings: finalSettings
        });
      }
    }
  },

  // Handles packet deduplication and automatic chunk reassembly
  processRawPacket(data, fromPeerId) {
    if (!data || data.senderId === this.myId) return;

    // 1. Deterministic Map Chunk (from retained MQTT topic or live stream)
    if (data.type === 'map_chunk') {
      this.handleIncomingMapChunk(data);
      return;
    }

    // 2. Retained Room State (delivered immediately by broker when player joins!)
    if (data.type === 'retained_room_state') {
      if (!this.isHost) {
        this.onSuccessfullyJoinedHost();
        if (data.players) {
          data.players.forEach(p => this.players.set(p.id, p));
          if (this.onStatusChange) this.onStatusChange();
        }
        if (data.mapMeta && data.mapMeta.hasCustomImage && data.mapMeta.totalChunks > 0) {
          const hash = data.mapMeta.customMapHash;
          if (!window.App?.mapConfig?.customImageUrl || window.App.mapConfig.customMapHash !== hash) {
            if (!this.incomingMapTransfer || this.incomingMapTransfer.mapHash !== hash) {
              this.incomingMapTransfer = {
                mapHash: hash,
                total: data.mapMeta.totalChunks,
                parts: new Array(data.mapMeta.totalChunks),
                received: 0,
                settings: data.mapMeta.settings || null
              };
            }
          }
        }
        if (window.App && data.state) {
          window.App.applyFullTableState(data.state, false);
          document.getElementById('lobby-screen')?.classList.add('hidden');
        }
      }
      return;
    }

    // 3. Generic chunked packets
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
      if (this.seenPacketIds.size > 800) {
        const first = this.seenPacketIds.values().next().value;
        this.seenPacketIds.delete(first);
      }
    }

    this.handleIncomingMessage(data, fromPeerId);
  },

  handleIncomingMessage(msg, fromPeerId) {
    if (!msg || msg.senderId === this.myId) return;

    // Relay to other WebRTC peers if Host
    if (this.isHost && fromPeerId && msg.type !== 'join_request' && msg.type !== 'request_custom_map' && msg.type !== 'req_missing_map_chunks') {
      this.connections.forEach((conn, peerKey) => {
        if (peerKey !== fromPeerId && conn.open) {
          this.sendPacketWithChunking(msg, conn);
        }
      });
    }

    if (msg.type === 'req_missing_map_chunks') {
      if (this.isHost && Array.isArray(msg.missing)) {
        this.streamCustomMapChunks(msg.missing, null);
      }
      return;
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
    const MAX_CHUNK = 6000;

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
      const sliceStr = jsonStr.slice(i * MAX_CHUNK, (i + 1) * MAX_CHUNK);
      setTimeout(() => {
        const chunkPacket = {
          type: '_chunk',
          senderId: this.myId,
          targetId: packet.targetId || null,
          chunkMsgId,
          idx: i,
          total,
          chunkData: sliceStr
        };
        if (targetConn && targetConn.open) {
          try { targetConn.send(chunkPacket); } catch (e) {}
        } else {
          this.rawTransportSend(chunkPacket, JSON.stringify(chunkPacket));
        }
      }, i * 35);
    }
  },

  rawTransportSend(packetObj, jsonStr) {
    // 1. Local BroadcastChannel
    if (this.localChannel) {
      try { this.localChannel.postMessage(packetObj); } catch (e) {}
    }

    // 2. Multi-Broker MQTT over WSS Relay
    if (this.roomCode && this.mqttClients.length > 0) {
      const topic = `willowstroop/v3/room/${this.roomCode}/events`;
      this.mqttClients.forEach(client => {
        if (client && client.connected) {
          try {
            client.publish(topic, jsonStr, { qos: 0 });
          } catch (e) {}
        }
      });
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

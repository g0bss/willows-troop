// ============================================================================
// WILLOW'S TROOP - 3D MINIATURES, STANDEES, TOKENS, PINS & SCENERY BUILDER
// (Zero emojis — pure vector silhouettes, custom illustrations & uploaded art)
// ============================================================================

window.Models3D = {
  textureCache: {},

  // Draws custom painted fantasy silhouettes/emblems on canvas for each class/monster
  drawVectorEmblem(ctx, preset, cx, cy, scale = 1) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (preset) {
      case 'druid':
      case 'frog': {
        // Cute Frog with a Red Cape (No hood - Over the Garden Wall style)
        ctx.fillStyle = '#b91c1c';
        ctx.beginPath();
        ctx.moveTo(-45, -10);
        ctx.bezierCurveTo(-85, 25, -90, 75, -75, 95);
        ctx.lineTo(75, 95);
        ctx.bezierCurveTo(90, 75, 85, 25, 45, -10);
        ctx.closePath();
        ctx.fill();

        // Frog head (no hood)
        ctx.fillStyle = '#84cc16';
        ctx.beginPath();
        ctx.ellipse(0, -25, 52, 38, 0, 0, Math.PI * 2);
        ctx.fill();

        // Big round Over the Garden Wall frog eyes
        ctx.fillStyle = '#84cc16';
        ctx.beginPath();
        ctx.arc(-26, -55, 20, 0, Math.PI * 2);
        ctx.arc(26, -55, 20, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fefce8';
        ctx.beginPath();
        ctx.arc(-26, -55, 14, 0, Math.PI * 2);
        ctx.arc(26, -55, 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-26, -55, 8, 0, Math.PI * 2);
        ctx.arc(26, -55, 8, 0, Math.PI * 2);
        ctx.fill();

        // Golden leaf clasp at neck
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.ellipse(0, 12, 16, 8, -0.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'warrior':
      case 'paladin': {
        // Heater Shield + Broadsword
        ctx.beginPath();
        ctx.moveTo(0, -95);
        ctx.lineTo(0, 95);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-65, -70);
        ctx.lineTo(65, -70);
        ctx.lineTo(65, 5);
        ctx.bezierCurveTo(65, 60, 0, 90, 0, 95);
        ctx.bezierCurveTo(0, 90, -65, 60, -65, 5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(0, -55);
        ctx.lineTo(0, 70);
        ctx.moveTo(-40, -10);
        ctx.lineTo(40, -10);
        ctx.stroke();
        break;
      }
      case 'mage': {
        // Arcane Staff & Crystal Orb
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(0, 95);
        ctx.lineTo(0, -35);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -55, 38, 0.25 * Math.PI, 0.75 * Math.PI, true);
        ctx.stroke();
        ctx.fillStyle = '#7dd3fc';
        ctx.beginPath();
        ctx.moveTo(0, -90);
        ctx.lineTo(24, -55);
        ctx.lineTo(0, -20);
        ctx.lineTo(-24, -55);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'rogue': {
        // Crossed Daggers & Cowl
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(-65, 75); ctx.lineTo(65, -75);
        ctx.moveTo(-50, 25); ctx.lineTo(-15, 60);
        ctx.moveTo(65, 75); ctx.lineTo(-65, -75);
        ctx.moveTo(50, 25); ctx.lineTo(15, 60);
        ctx.stroke();
        break;
      }
      case 'archer': {
        // Recurve Bow & Arrow
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.arc(-20, 0, 78, -Math.PI * 0.42, Math.PI * 0.42);
        ctx.stroke();
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-2, -75);
        ctx.lineTo(-2, 75);
        ctx.stroke();
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(-55, 0);
        ctx.lineTo(75, 0);
        ctx.lineTo(52, -16);
        ctx.moveTo(75, 0);
        ctx.lineTo(52, 16);
        ctx.stroke();
        break;
      }
      case 'cleric': {
        // Sunburst Holy Symbol
        ctx.beginPath();
        ctx.arc(0, 0, 36, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 9;
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 48, Math.sin(a) * 48);
          ctx.lineTo(Math.cos(a) * 85, Math.sin(a) * 85);
          ctx.stroke();
        }
        break;
      }
      case 'dragon': {
        // Dragon Winged Crest
        ctx.beginPath();
        ctx.moveTo(0, -85);
        ctx.lineTo(28, -35);
        ctx.lineTo(90, -65);
        ctx.lineTo(65, 15);
        ctx.lineTo(95, 55);
        ctx.lineTo(25, 45);
        ctx.lineTo(0, 90);
        ctx.lineTo(-25, 45);
        ctx.lineTo(-95, 55);
        ctx.lineTo(-65, 15);
        ctx.lineTo(-90, -65);
        ctx.lineTo(-28, -35);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'skeleton':
      case 'goblin':
      case 'orc': {
        // Stylized Skull / Monster Crest
        ctx.beginPath();
        ctx.arc(0, -18, 58, Math.PI, 0, false);
        ctx.lineTo(50, 35);
        ctx.lineTo(28, 35);
        ctx.lineTo(28, 72);
        ctx.lineTo(-28, 72);
        ctx.lineTo(-28, 35);
        ctx.lineTo(-50, 35);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-22, -12, 14, 0, Math.PI * 2);
        ctx.arc(22, -12, 14, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      default: {
        // Heraldic Diamond Emblem
        ctx.beginPath();
        ctx.moveTo(0, -80);
        ctx.lineTo(65, 0);
        ctx.lineTo(0, 80);
        ctx.lineTo(-65, 0);
        ctx.closePath();
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  },

  // Generates a clean illustrated portrait texture when no custom image is provided
  getPortraitTexture(presetType, name, primaryColor) {
    const key = `${presetType}_${name}_${primaryColor}`;
    if (this.textureCache[key]) return this.textureCache[key];

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 640);
    grad.addColorStop(0, primaryColor || '#334155');
    grad.addColorStop(1, '#0f172a');

    // Standee card shape
    ctx.beginPath();
    ctx.roundRect(28, 20, 456, 600, [210, 210, 28, 28]);
    ctx.fillStyle = grad;
    ctx.fill();

    // Subtle metallic border
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#c8a96e';
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.roundRect(44, 36, 424, 568, [195, 195, 20, 20]);
    ctx.stroke();

    // Soft vignette glow
    const glow = ctx.createRadialGradient(256, 265, 10, 256, 265, 180);
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(256, 265, 180, 0, Math.PI * 2);
    ctx.fill();

    // Draw vector class/monster illustration
    this.drawVectorEmblem(ctx, presetType, 256, 265, 1.35);

    // Clean engraved nameplate at bottom of standee
    ctx.fillStyle = 'rgba(9, 13, 20, 0.92)';
    ctx.fillRect(48, 505, 416, 72);
    ctx.strokeStyle = '#c8a96e';
    ctx.lineWidth = 3;
    ctx.strokeRect(48, 505, 416, 72);

    ctx.fillStyle = '#f1f5f9';
    ctx.font = '600 36px Inter, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const shortName = (name || 'Personagem').slice(0, 18);
    ctx.fillText(shortName, 256, 542);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    this.textureCache[key] = tex;
    return tex;
  },

  // Generates a small dataURL preview icon for the UI catalog (no emojis!)
  getCatalogPreviewDataUrl(presetType, bgColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(48, 48, 8, 48, 48, 46);
    grad.addColorStop(0, bgColor || '#334155');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(48, 48, 42, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(200, 169, 110, 0.65)';
    ctx.lineWidth = 3;
    ctx.stroke();

    this.drawVectorEmblem(ctx, presetType, 48, 48, 0.34);
    return canvas.toDataURL();
  },

  loadCustomTexture(url, callback) {
    if (this.textureCache[url]) {
      if (callback) callback(this.textureCache[url]);
      return this.textureCache[url];
    }
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const tex = loader.load(url, (loaded) => {
      loaded.needsUpdate = true;
      if (callback) callback(loaded);
    });
    this.textureCache[url] = tex;
    return tex;
  },

  createPieceMesh(pieceData, gridCellSize = 2) {
    const root = new THREE.Group();
    root.userData.pieceId = pieceData.id;

    const scaleMult = pieceData.sizeScale || 1;
    const baseRadius = (gridCellSize * 0.44) * scaleMult;
    const elevationUnits = (pieceData.elevation || 0) * (gridCellSize / 1.5);

    const figureGroup = new THREE.Group();
    figureGroup.name = 'figureGroup';
    figureGroup.position.y = elevationUnits;
    root.add(figureGroup);

    // Ground Aura Ring
    const auraRadius = baseRadius * (pieceData.auraRadius || 1.15);
    const auraGeo = new THREE.RingGeometry(baseRadius * 0.96, auraRadius, 48);
    auraGeo.rotateX(-Math.PI / 2);
    const auraMat = new THREE.MeshBasicMaterial({
      color: pieceData.auraColor || pieceData.color || '#3b82f6',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: pieceData.showAura ? 0.55 : 0.0
    });
    const auraMesh = new THREE.Mesh(auraGeo, auraMat);
    auraMesh.position.y = 0.03;
    auraMesh.name = 'auraRing';
    root.add(auraMesh);

    // Selection Ring
    const selGeo = new THREE.RingGeometry(baseRadius * 1.02, baseRadius * 1.15, 48);
    selGeo.rotateX(-Math.PI / 2);
    const selMat = new THREE.MeshBasicMaterial({
      color: 0xc8a96e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0
    });
    const selRing = new THREE.Mesh(selGeo, selMat);
    selRing.position.y = 0.04;
    selRing.name = 'selectionRing';
    root.add(selRing);

    // Flight stand if elevated
    if (elevationUnits > 0.05) {
      const standBaseGeo = new THREE.CylinderGeometry(baseRadius * 0.65, baseRadius * 0.72, 0.08, 24);
      const standMat = new THREE.MeshPhysicalMaterial({
        color: 0x93c5fd,
        transparent: true,
        opacity: 0.42,
        roughness: 0.15
      });
      const standBase = new THREE.Mesh(standBaseGeo, standMat);
      standBase.position.y = 0.04;
      root.add(standBase);

      const rodGeo = new THREE.CylinderGeometry(0.08, 0.08, elevationUnits, 12);
      const rodMesh = new THREE.Mesh(rodGeo, standMat);
      rodMesh.position.y = elevationUnits / 2;
      root.add(rodMesh);
    }

    const style = pieceData.style || 'standee';

    if (style === 'pin') {
      this.buildPinMesh(figureGroup, pieceData, baseRadius);
    } else if (style === 'prop') {
      this.buildPropMesh(figureGroup, pieceData, gridCellSize * scaleMult);
    } else if (style === 'token') {
      this.buildTokenCoinMesh(figureGroup, pieceData, baseRadius);
    } else if (style === 'standee') {
      this.buildStandeeMesh(figureGroup, pieceData, baseRadius);
    } else {
      this.buildMiniatureBase(figureGroup, pieceData, baseRadius);
      this.buildProceduralCharacterOrMonster(figureGroup, pieceData, baseRadius);
    }

    if (pieceData.prone) {
      figureGroup.rotation.x = -Math.PI / 2;
      figureGroup.position.y = elevationUnits + baseRadius * 0.45;
    }

    root.traverse(obj => {
      if (obj.isMesh && obj.name !== 'auraRing' && obj.name !== 'selectionRing') {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    return root;
  },

  buildMiniatureBase(parent, pieceData, baseRadius) {
    const baseHeight = 0.22;
    const rimGeo = new THREE.CylinderGeometry(baseRadius * 0.92, baseRadius, baseHeight, 32);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x181c24,
      roughness: 0.4,
      metalness: 0.55
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.y = baseHeight / 2;
    parent.add(rim);

    const topGeo = new THREE.CylinderGeometry(baseRadius * 0.84, baseRadius * 0.90, 0.08, 32);
    const topMat = new THREE.MeshStandardMaterial({
      color: pieceData.color || '#3b82f6',
      roughness: 0.35,
      metalness: 0.25
    });
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.y = baseHeight + 0.02;
    parent.add(top);

    const arrowShape = new THREE.ConeGeometry(baseRadius * 0.14, baseRadius * 0.26, 4);
    arrowShape.rotateX(Math.PI / 2);
    const arrowMat = new THREE.MeshStandardMaterial({ color: 0xc8a96e, metalness: 0.5, roughness: 0.3 });
    const arrow = new THREE.Mesh(arrowShape, arrowMat);
    arrow.position.set(0, baseHeight * 0.65, baseRadius * 0.96);
    parent.add(arrow);
  },

  buildStandeeMesh(parent, pieceData, baseRadius) {
    this.buildMiniatureBase(parent, pieceData, baseRadius);

    const standeeW = baseRadius * 1.65;
    const standeeH = baseRadius * 2.35;
    const thickness = 0.09;

    const tex = pieceData.imageUrl
      ? this.loadCustomTexture(pieceData.imageUrl)
      : this.getPortraitTexture(pieceData.preset || 'warrior', pieceData.name, pieceData.color);

    const sideMat = new THREE.MeshStandardMaterial({
      color: 0x181c24,
      roughness: 0.35,
      metalness: 0.35
    });
    const faceMat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.08,
      roughness: 0.35,
      metalness: 0.05
    });

    const boxGeo = new THREE.BoxGeometry(standeeW, standeeH, thickness);
    const materials = [sideMat, sideMat, sideMat, sideMat, faceMat, faceMat];
    const standeeCard = new THREE.Mesh(boxGeo, materials);
    standeeCard.position.y = 0.24 + standeeH / 2;
    parent.add(standeeCard);

    const clipGeo = new THREE.BoxGeometry(standeeW * 0.52, 0.15, thickness * 2.3);
    const clipMesh = new THREE.Mesh(clipGeo, sideMat);
    clipMesh.position.y = 0.28;
    parent.add(clipMesh);
  },

  buildTokenCoinMesh(parent, pieceData, baseRadius) {
    const height = 0.30;
    const tex = pieceData.imageUrl
      ? this.loadCustomTexture(pieceData.imageUrl)
      : this.getPortraitTexture(pieceData.preset || 'warrior', pieceData.name, pieceData.color);

    const rimMat = new THREE.MeshStandardMaterial({
      color: pieceData.color || '#3b82f6',
      roughness: 0.3,
      metalness: 0.55
    });
    const faceMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.35
    });

    const cylGeo = new THREE.CylinderGeometry(baseRadius, baseRadius * 1.04, height, 36);
    const coin = new THREE.Mesh(cylGeo, [rimMat, faceMat, rimMat]);
    coin.position.y = height / 2;
    parent.add(coin);

    const torusGeo = new THREE.TorusGeometry(baseRadius * 0.96, 0.045, 12, 36);
    torusGeo.rotateX(Math.PI / 2);
    const bezelMat = new THREE.MeshStandardMaterial({ color: 0xc8a96e, metalness: 0.75, roughness: 0.25 });
    const bezel = new THREE.Mesh(torusGeo, bezelMat);
    bezel.position.y = height;
    parent.add(bezel);
  },

  buildProceduralCharacterOrMonster(parent, pieceData, baseRadius) {
    const preset = pieceData.preset || 'warrior';
    const mainColor = pieceData.color || '#3b82f6';
    const fig = new THREE.Group();
    fig.position.y = 0.24;
    const s = baseRadius * 0.95;
    fig.scale.set(s, s, s);

    const bodyMat = new THREE.MeshStandardMaterial({ color: mainColor, roughness: 0.45, metalness: 0.2 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xe2c799, roughness: 0.6 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.25, metalness: 0.85 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xc8a96e, roughness: 0.3, metalness: 0.75 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b3e26, roughness: 0.75 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6 });

    if (preset === 'druid' || preset === 'frog') {
      // Cute Frog Druid 3D Miniature with Red Cape (No hood - Over the Garden Wall style)
      const capeMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6 });
      const frogMat = new THREE.MeshStandardMaterial({ color: 0x84cc16, roughness: 0.45 });
      const cape = new THREE.Mesh(new THREE.ConeGeometry(0.50, 0.98, 16), capeMat);
      cape.position.y = 0.50;
      fig.add(cape);

      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.06, 10, 20), capeMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.94;
      fig.add(collar);

      const clasp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), goldMat);
      clasp.position.set(0, 0.92, 0.25);
      fig.add(clasp);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 14), frogMat);
      head.scale.set(1.18, 0.85, 1.05);
      head.position.y = 1.15;
      fig.add(head);

      // Frog eyes on top of head (no hood!)
      [-0.16, 0.16].forEach(ex => {
        const eyeBump = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), frogMat);
        eyeBump.position.set(ex, 1.38, 0.12);
        fig.add(eyeBump);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), darkMat);
        pupil.position.set(ex, 1.38, 0.19);
        fig.add(pupil);
      });

      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.55, 8), woodMat);
      staff.position.set(0.45, 0.78, 0.2);
      fig.add(staff);
    } else if (preset === 'dragon') {
      const dragMat = new THREE.MeshStandardMaterial({ color: mainColor || 0xb91c1c, roughness: 0.4, metalness: 0.25 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.65, 18, 16), dragMat);
      body.scale.set(0.9, 1.15, 1.35);
      body.position.y = 0.85;
      fig.add(body);

      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 0.9, 12), dragMat);
      neck.position.set(0, 1.55, 0.55);
      neck.rotation.x = 0.45;
      fig.add(neck);

      const head = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.75, 8), dragMat);
      head.rotation.x = Math.PI / 2 + 0.15;
      head.position.set(0, 1.95, 0.95);
      fig.add(head);

      [-0.16, 0.16].forEach(hx => {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.45, 8), goldMat);
        horn.position.set(hx, 2.15, 0.65);
        horn.rotation.x = -0.5;
        fig.add(horn);
      });

      [-1, 1].forEach(dir => {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.95, 0.06), dragMat);
        wing.position.set(dir * 0.85, 1.45, 0);
        wing.rotation.z = dir * 0.38;
        wing.rotation.y = -dir * 0.25;
        fig.add(wing);
      });

      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.3, 10), dragMat);
      tail.rotation.x = -Math.PI / 2 + 0.3;
      tail.position.set(0, 0.45, -1.05);
      fig.add(tail);
    } else if (preset === 'slime') {
      const slimeMat = new THREE.MeshPhysicalMaterial({
        color: mainColor || 0x10b981,
        transparent: true,
        opacity: 0.78,
        roughness: 0.15
      });
      const blob = new THREE.Mesh(new THREE.SphereGeometry(0.82, 24, 18), slimeMat);
      blob.scale.set(1.05, 0.85, 1.05);
      blob.position.y = 0.62;
      fig.add(blob);
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.26), goldMat);
      core.position.y = 0.65;
      fig.add(core);
    } else if (preset === 'wolf') {
      const furMat = new THREE.MeshStandardMaterial({ color: mainColor || 0x64748b, roughness: 0.8 });
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 1.25), furMat);
      torso.position.y = 0.65;
      fig.add(torso);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.55), furMat);
      head.position.set(0, 0.98, 0.65);
      fig.add(head);
      [[-0.2, 0.4], [0.2, 0.4], [-0.2, -0.4], [0.2, -0.4]].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.5, 8), furMat);
        leg.position.set(lx, 0.25, lz);
        fig.add(leg);
      });
    } else {
      const isSmall = preset === 'goblin';
      const hScale = isSmall ? 0.75 : 1.0;

      const torsoGeo = new THREE.CylinderGeometry(0.28 * hScale, 0.38 * hScale, 0.95 * hScale, 14);
      const torso = new THREE.Mesh(torsoGeo, preset === 'skeleton' ? metalMat : bodyMat);
      torso.position.y = 0.65 * hScale;
      fig.add(torso);

      const shGeo = new THREE.SphereGeometry(0.36 * hScale, 12, 10);
      shGeo.scale(1.3, 0.55, 0.8);
      const shoulders = new THREE.Mesh(shGeo, (preset === 'warrior' || preset === 'paladin') ? metalMat : bodyMat);
      shoulders.position.y = 1.08 * hScale;
      fig.add(shoulders);

      const headMat = preset === 'goblin' || preset === 'orc'
        ? new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.6 })
        : (preset === 'skeleton' ? new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.4 }) : skinMat);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.27 * hScale, 16, 16), headMat);
      head.position.y = 1.42 * hScale;
      fig.add(head);

      if (preset === 'mage') {
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 16), bodyMat);
        brim.position.y = 1.62;
        fig.add(brim);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.72, 16), bodyMat);
        cone.position.y = 1.98;
        fig.add(cone);

        const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.9, 8), woodMat);
        staff.position.set(0.48, 0.95, 0.25);
        fig.add(staff);
        const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
        orb.position.set(0.48, 1.98, 0.25);
        fig.add(orb);
      } else if (preset === 'archer') {
        const bowGeo = new THREE.TorusGeometry(0.48, 0.04, 8, 18, Math.PI);
        const bow = new THREE.Mesh(bowGeo, woodMat);
        bow.rotation.y = Math.PI / 2;
        bow.position.set(0.42, 1.05, 0.35);
        fig.add(bow);
      } else if (preset === 'rogue') {
        const hood = new THREE.Mesh(new THREE.SphereGeometry(0.31, 14, 14), darkMat);
        hood.position.set(0, 1.45, -0.03);
        fig.add(hood);
        [-0.45, 0.45].forEach(dx => {
          const dagger = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 6), metalMat);
          dagger.rotation.x = Math.PI / 2;
          dagger.position.set(dx, 0.95, 0.42);
          fig.add(dagger);
        });
      } else if (preset === 'cleric') {
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 24), goldMat);
        halo.rotation.x = Math.PI / 2;
        halo.position.y = 1.82;
        fig.add(halo);
        const mace = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8), goldMat);
        mace.position.set(0.45, 1.05, 0.25);
        fig.add(mace);
      } else {
        const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * hScale, 0.29 * hScale, 0.26 * hScale, 14), metalMat);
        helm.position.y = 1.54 * hScale;
        fig.add(helm);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95 * hScale, 0.16), metalMat);
        blade.position.set(0.48 * hScale, 1.25 * hScale, 0.32);
        blade.rotation.x = 0.35;
        fig.add(blade);
        const shield = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.68 * hScale, 0.52 * hScale), goldMat);
        shield.position.set(-0.46 * hScale, 0.92 * hScale, 0.25);
        shield.rotation.y = 0.35;
        fig.add(shield);
      }
    }

    parent.add(fig);
  },

  buildPinMesh(parent, pieceData, baseRadius) {
    const color = pieceData.color || '#c8a96e';
    const pinMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.25,
      metalness: 0.5,
      emissive: color,
      emissiveIntensity: 0.2
    });

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(baseRadius * 0.42, baseRadius * 0.52, 0.1, 24), pinMat);
    pad.position.y = 0.05;
    parent.add(pad);

    const cone = new THREE.Mesh(new THREE.ConeGeometry(baseRadius * 0.42, baseRadius * 1.05, 16), pinMat);
    cone.rotation.x = Math.PI;
    cone.position.y = baseRadius * 0.8;
    parent.add(cone);

    const head = new THREE.Mesh(new THREE.OctahedronGeometry(baseRadius * 0.42, 1), pinMat);
    head.position.y = baseRadius * 1.45;
    parent.add(head);
  },

  buildPropMesh(parent, pieceData, size) {
    const preset = pieceData.preset || 'chest';
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b3e26, roughness: 0.75 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xc8a96e, roughness: 0.3, metalness: 0.8 });

    if (preset === 'wall') {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(size * 0.98, size * 1.15, size * 0.32), stoneMat);
      wall.position.y = (size * 1.15) / 2;
      parent.add(wall);
    } else if (preset === 'door') {
      const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.22, size * 1.25, 0.35), stoneMat);
      frameL.position.set(-size * 0.42, size * 0.625, 0);
      const frameR = frameL.clone();
      frameR.position.x = size * 0.42;
      parent.add(frameL, frameR);

      const panel = new THREE.Mesh(new THREE.BoxGeometry(size * 0.76, size * 1.18, 0.16), woodMat);
      panel.position.y = size * 0.59;
      if (pieceData.doorOpen) {
        panel.rotation.y = Math.PI * 0.45;
        panel.position.x = -size * 0.32;
        panel.position.z = size * 0.32;
      }
      parent.add(panel);
    } else if (preset === 'pillar') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(size * 0.65, 0.25, size * 0.65), stoneMat);
      base.position.y = 0.125;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.25, size * 0.28, size * 1.6, 16), stoneMat);
      col.position.y = size * 0.8;
      const top = base.clone();
      top.position.y = size * 1.6;
      parent.add(base, col, top);
    } else if (preset === 'campfire') {
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size * 0.12), stoneMat);
        rock.position.set(Math.cos(a) * size * 0.32, 0.08, Math.sin(a) * size * 0.32);
        parent.add(rock);
      }
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(size * 0.24, size * 0.65, 8), flameMat);
      flame.position.y = size * 0.35;
      flame.name = 'animatedFlame';
      parent.add(flame);

      const light = new THREE.PointLight(0xff8c24, 1.6, size * 6.5);
      light.position.y = size * 0.7;
      parent.add(light);
    } else if (preset === 'tree') {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.12, size * 0.18, size * 0.9, 10), woodMat);
      trunk.position.y = size * 0.45;
      parent.add(trunk);
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
      const c1 = new THREE.Mesh(new THREE.ConeGeometry(size * 0.65, size * 0.95, 10), leafMat);
      c1.position.y = size * 1.05;
      const c2 = new THREE.Mesh(new THREE.ConeGeometry(size * 0.48, size * 0.85, 10), leafMat);
      c2.position.y = size * 1.55;
      parent.add(c1, c2);
    } else if (preset === 'portal') {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(size * 0.58, 0.12, 12, 32), stoneMat);
      arch.position.y = size * 0.65;
      const vortexMat = new THREE.MeshBasicMaterial({
        color: 0xa855f7,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.72
      });
      const vortex = new THREE.Mesh(new THREE.CircleGeometry(size * 0.52, 28), vortexMat);
      vortex.position.y = size * 0.65;
      parent.add(arch, vortex);
    } else if (preset === 'barrel') {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.28, size * 0.28, size * 0.68, 16), woodMat);
      barrel.position.y = size * 0.34;
      parent.add(barrel);
    } else {
      const box = new THREE.Mesh(new THREE.BoxGeometry(size * 0.68, size * 0.42, size * 0.46), woodMat);
      box.position.y = size * 0.21;
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.23, size * 0.23, size * 0.68, 12, 1, false, 0, Math.PI), woodMat);
      lid.rotation.z = Math.PI / 2;
      lid.position.y = size * 0.42;
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.08), goldMat);
      lock.position.set(0, size * 0.38, size * 0.24);
      parent.add(box, lid, lock);
    }
  }
};

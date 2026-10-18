// Builds the player's start.ng character as a low-poly three.js model.
// Everything about how the character looks comes from `style`; nothing else in
// the game hardcodes character colours or parts.
import * as THREE from 'three';

export const DEFAULT_STYLE = Object.freeze({
  body: 'male',
  primaryColor: '#4b7bec',
  secondaryColor: '#2b2f4a',
  skinColor: '#c68642',
  hairColor: '#17120f',
  hair: 'short',
  hat: 'none',
  accessory: 'none',
});

// A dressed-up look used only when rendering the cover picture.
export const COVER_STYLE = Object.freeze({
  body: 'female',
  primaryColor: '#ff7a59',
  secondaryColor: '#2d3a8c',
  skinColor: '#8d5524',
  hairColor: '#1b1210',
  hair: 'braids',
  hat: 'crown',
  accessory: 'earrings',
});

const OPTIONS = {
  body: ['female', 'male'],
  hair: ['short', 'afro', 'braids', 'bun', 'ponytail', 'dreads', 'bald'],
  hat: ['none', 'cap', 'beanie', 'tophat', 'crown'],
  accessory: ['none', 'glasses', 'earrings', 'beard', 'scarf', 'backpack'],
};

function pickColor(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const v = value.trim().toLowerCase();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v) ? v : fallback;
}

function pickOption(value, list, fallback) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return list.includes(v) ? v : fallback;
}

// Turns whatever start.ng sent (or nothing) into a complete, known style.
export function normalizeStyle(style) {
  const s = style && typeof style === 'object' ? style : {};
  const d = DEFAULT_STYLE;
  return {
    body: pickOption(s.body, OPTIONS.body, d.body),
    primaryColor: pickColor(s.primaryColor, d.primaryColor),
    secondaryColor: pickColor(s.secondaryColor, d.secondaryColor),
    skinColor: pickColor(s.skinColor, d.skinColor),
    hairColor: pickColor(s.hairColor, d.hairColor),
    hair: pickOption(s.hair, OPTIONS.hair, d.hair),
    hat: pickOption(s.hat, OPTIONS.hat, d.hat),
    accessory: pickOption(s.accessory, OPTIONS.accessory, d.accessory),
  };
}

// Lighter (amount > 0) or darker (amount < 0) version of a colour.
function shade(hex, amount) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  hsl.l = THREE.MathUtils.clamp(hsl.l + amount, 0.04, 0.92);
  return c.setHSL(hsl.h, hsl.s, hsl.l);
}

// The colour opposite on the colour wheel, for accessories that should stand out.
function contrast(hex) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  return c.setHSL((hsl.h + 0.5) % 1, Math.max(hsl.s, 0.45), THREE.MathUtils.clamp(hsl.l, 0.35, 0.6));
}

const GOLD = '#f5c542';
const DARK = '#1d1d24';

/**
 * Builds the character from a start.ng style.
 * Feet stand at y = 0 and the character faces +z.
 * userData.parts exposes the pieces the game animates.
 */
export function buildCharacter(rawStyle) {
  const style = normalizeStyle(rawStyle);
  const female = style.body === 'female';

  const materials = new Map();
  const mat = (color, extra = {}) => {
    const c = new THREE.Color(color);
    const key = c.getHexString() + JSON.stringify(extra);
    if (!materials.has(key)) {
      materials.set(key, new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, flatShading: true, ...extra }));
    }
    return materials.get(key);
  };
  const add = (parent, geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const skin = mat(style.skinColor);
  const top = mat(style.primaryColor);
  const bottom = mat(style.secondaryColor);
  const hair = mat(style.hairColor);
  const shoes = mat(shade(style.secondaryColor, -0.25));
  const gold = mat(GOLD, { metalness: 0.7, roughness: 0.3 });
  const dark = mat(DARK);

  const root = new THREE.Group();
  root.name = 'character';
  const rig = new THREE.Group(); // moved by the game for bobbing and jumping
  root.add(rig);

  // --- Body: silhouette depends on `body` ---
  const dims = female
    ? { torsoW: 0.46, torsoH: 0.48, torsoD: 0.28, torsoY: 1.19, headY: 1.69, headR: 0.25, legX: 0.11, legW: 0.15 }
    : { torsoW: 0.6, torsoH: 0.62, torsoD: 0.34, torsoY: 1.13, headY: 1.73, headR: 0.26, legX: 0.14, legW: 0.2 };
  const torsoTop = dims.torsoY + dims.torsoH / 2;

  for (const side of [-1, 1]) {
    add(rig, new THREE.BoxGeometry(dims.legW + 0.03, 0.1, 0.3), shoes, side * dims.legX, 0.05, 0.03);
  }

  if (female) {
    // Skirt over shorter, slimmer legs.
    for (const side of [-1, 1]) {
      add(rig, new THREE.BoxGeometry(dims.legW, 0.5, dims.legW + 0.02), skin, side * dims.legX, 0.35, 0);
    }
    add(rig, new THREE.CylinderGeometry(0.22, 0.4, 0.5, 8), bottom, 0, 0.78, 0);
    // Narrow waist that widens to the shoulders.
    add(rig, new THREE.CylinderGeometry(0.3, 0.22, dims.torsoH, 6), top, 0, dims.torsoY, 0).scale.z = 0.62;
  } else {
    // Trousers and a boxy torso.
    for (const side of [-1, 1]) {
      add(rig, new THREE.BoxGeometry(dims.legW, 0.72, dims.legW + 0.02), bottom, side * dims.legX, 0.46, 0);
    }
    add(rig, new THREE.BoxGeometry(0.54, 0.16, 0.32), bottom, 0, 0.82, 0);
    add(rig, new THREE.BoxGeometry(dims.torsoW, dims.torsoH, dims.torsoD), top, 0, dims.torsoY, 0);
  }

  add(rig, new THREE.CylinderGeometry(0.08, 0.09, 0.14, 6), skin, 0, torsoTop + 0.05, 0);

  // --- Arms: pivot at the shoulder so the game can swing them ---
  const shoulderX = (female ? 0.27 : dims.torsoW / 2) + 0.07;
  const makeArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * shoulderX, torsoTop - 0.07, 0);
    pivot.rotation.z = side * 0.08;
    const w = female ? 0.12 : 0.15;
    add(pivot, new THREE.BoxGeometry(w + 0.02, 0.3, w + 0.03), top, 0, -0.13, 0); // sleeve
    add(pivot, new THREE.BoxGeometry(w, 0.26, w), skin, 0, -0.4, 0); // forearm
    add(pivot, new THREE.IcosahedronGeometry(0.08, 0), skin, 0, -0.56, 0); // hand
    const hand = new THREE.Object3D();
    hand.position.set(0, -0.56, 0);
    pivot.add(hand);
    rig.add(pivot);
    return { pivot, hand };
  };
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  // --- Head ---
  const R = dims.headR;
  const head = new THREE.Group();
  head.position.set(0, dims.headY, 0);
  rig.add(head);
  add(head, new THREE.IcosahedronGeometry(R, 1), skin);
  for (const side of [-1, 1]) {
    add(head, new THREE.SphereGeometry(0.032, 6, 4), dark, side * 0.09, 0.03, R * 0.9);
  }
  add(head, new THREE.BoxGeometry(0.08, 0.02, 0.02), mat(shade(style.skinColor, -0.2)), 0, -0.09, R * 0.9);

  // --- Hair ---
  const hairCap = () => {
    const cap = add(head, new THREE.SphereGeometry(R * 1.08, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, 0, 0.02, -0.02);
    cap.rotation.x = -0.3;
    return cap;
  };
  const strands = (count, spread, radius, length, thickness) => {
    for (let i = 0; i < count; i++) {
      const a = -spread + (2 * spread * i) / (count - 1);
      const strand = add(head, new THREE.CylinderGeometry(thickness, thickness * 1.15, length, 5), hair,
        Math.sin(a) * R * radius, 0.02 - length / 2, -Math.cos(a) * R * radius);
      strand.rotation.z = -Math.sin(a) * 0.12;
      strand.rotation.x = Math.cos(a) * 0.12;
    }
  };
  switch (style.hair) {
    case 'short':
      hairCap();
      break;
    case 'afro':
      add(head, new THREE.IcosahedronGeometry(R * 1.42, 1), hair, 0, 0.16, -0.13);
      break;
    case 'braids':
      hairCap();
      strands(9, 1.45, 0.95, 0.55, 0.028);
      break;
    case 'bun':
      hairCap();
      add(head, new THREE.IcosahedronGeometry(0.12, 1), hair, 0, R * 0.9, -R * 0.5);
      break;
    case 'ponytail': {
      hairCap();
      add(head, new THREE.SphereGeometry(0.05, 6, 4), mat(style.primaryColor), 0, 0.06, -R * 1.02);
      const tail = add(head, new THREE.CylinderGeometry(0.07, 0.025, 0.46, 6), hair, 0, -0.16, -R * 1.25);
      tail.rotation.x = 0.35;
      break;
    }
    case 'dreads':
      hairCap();
      strands(10, 1.6, 1.0, 0.65, 0.045);
      break;
    case 'bald':
    default:
      break;
  }

  // --- Hat (sits higher on an afro) ---
  const hatBase = new THREE.Group();
  hatBase.position.y = style.hair === 'afro' ? 0.2 : 0;
  if (style.hair === 'afro') hatBase.scale.setScalar(1.25);
  head.add(hatBase);
  const hatColor = mat(style.secondaryColor);
  switch (style.hat) {
    case 'cap':
      add(hatBase, new THREE.SphereGeometry(R * 1.1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), hatColor, 0, 0.05, 0);
      add(hatBase, new THREE.BoxGeometry(0.34, 0.025, 0.22), hatColor, 0, 0.07, R + 0.05);
      break;
    case 'beanie': {
      const dome = add(hatBase, new THREE.SphereGeometry(R * 1.12, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), hatColor, 0, 0.04, 0);
      dome.scale.y = 1.15;
      const cuff = add(hatBase, new THREE.TorusGeometry(R * 1.08, 0.045, 6, 14), mat(shade(style.secondaryColor, 0.12)), 0, 0.06, 0);
      cuff.rotation.x = Math.PI / 2;
      add(hatBase, new THREE.IcosahedronGeometry(0.065, 0), mat(shade(style.secondaryColor, 0.25)), 0, R * 1.32, 0);
      break;
    }
    case 'tophat': {
      const black = mat('#18181d');
      add(hatBase, new THREE.CylinderGeometry(0.36, 0.36, 0.03, 14), black, 0, R * 0.72, 0);
      add(hatBase, new THREE.CylinderGeometry(0.2, 0.22, 0.4, 14), black, 0, R * 0.72 + 0.2, 0);
      add(hatBase, new THREE.CylinderGeometry(0.225, 0.225, 0.06, 14), mat(style.primaryColor), 0, R * 0.72 + 0.05, 0);
      break;
    }
    case 'crown': {
      const ringMat = mat(GOLD, { metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide });
      add(hatBase, new THREE.CylinderGeometry(0.21, 0.19, 0.1, 10, 1, true), ringMat, 0, R * 0.82, 0);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(hatBase, new THREE.ConeGeometry(0.045, 0.13, 4), gold, Math.sin(a) * 0.2, R * 0.82 + 0.11, Math.cos(a) * 0.2);
      }
      add(hatBase, new THREE.OctahedronGeometry(0.035), mat('#e8344e', { emissive: '#5a0010' }), 0, R * 0.82, 0.215);
      break;
    }
    case 'none':
    default:
      break;
  }

  // --- Accessory ---
  switch (style.accessory) {
    case 'glasses':
      for (const side of [-1, 1]) {
        add(head, new THREE.TorusGeometry(0.065, 0.014, 6, 12), dark, side * 0.095, 0.03, R * 0.95);
        const arm = add(head, new THREE.BoxGeometry(0.012, 0.012, R * 0.9), dark, side * R * 0.88, 0.04, R * 0.45);
        arm.rotation.y = side * 0.15;
      }
      add(head, new THREE.BoxGeometry(0.06, 0.014, 0.014), dark, 0, 0.035, R * 0.97);
      break;
    case 'earrings':
      for (const side of [-1, 1]) {
        const hoop = add(head, new THREE.TorusGeometry(0.04, 0.011, 6, 10), gold, side * R * 0.98, -0.1, 0);
        hoop.rotation.y = Math.PI / 2;
      }
      break;
    case 'beard': {
      const beard = add(head, new THREE.SphereGeometry(R * 0.98, 10, 6, 0, Math.PI * 2, Math.PI * 0.64, Math.PI * 0.36), hair, 0, -0.01, 0.03);
      beard.scale.set(1, 1.15, 1);
      add(head, new THREE.BoxGeometry(0.16, 0.04, 0.05), hair, 0, -0.065, R * 0.9);
      break;
    }
    case 'scarf': {
      const scarfMat = mat(contrast(style.primaryColor));
      const ring = add(rig, new THREE.TorusGeometry(0.15, 0.06, 6, 12), scarfMat, 0, torsoTop + 0.03, 0.01);
      ring.rotation.x = Math.PI / 2;
      const tail = add(rig, new THREE.BoxGeometry(0.1, 0.34, 0.05), scarfMat, 0.1, torsoTop - 0.15, dims.torsoD / 2 + 0.05);
      tail.rotation.z = 0.1;
      break;
    }
    case 'backpack': {
      const packMat = mat(shade(contrast(style.primaryColor), -0.1));
      const strapMat = mat(shade(contrast(style.primaryColor), -0.25));
      const back = -(dims.torsoD / 2 + 0.1);
      add(rig, new THREE.BoxGeometry(0.42, 0.5, 0.2), packMat, 0, dims.torsoY, back);
      add(rig, new THREE.BoxGeometry(0.3, 0.18, 0.06), strapMat, 0, dims.torsoY - 0.1, back - 0.12);
      for (const side of [-1, 1]) {
        add(rig, new THREE.BoxGeometry(0.06, dims.torsoH, 0.02), strapMat, side * 0.14, dims.torsoY + 0.02, dims.torsoD / 2 + 0.01);
      }
      break;
    }
    case 'none':
    default:
      break;
  }

  root.userData.style = style;
  root.userData.parts = { rig, head, leftArm: leftArm.pivot, rightArm: rightArm.pivot, rightHand: rightArm.hand };
  root.userData.restArmZ = 0.08;
  return root;
}

// Frees the GPU memory used by a character built with buildCharacter.
export function disposeCharacter(root) {
  if (!root) return;
  const materials = new Set();
  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.geometry.dispose();
      materials.add(obj.material);
    }
  });
  materials.forEach((m) => m.dispose());
  root.removeFromParent();
}

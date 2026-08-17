/* eslint-disable react-hooks/immutability */
'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export type VoiceAgentState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'retrieving'
  | 'answering'
  | 'error';

// ══════════════════════════════════════════════════════════════════════════════
//  3-D Perlin Noise  (compact, zero-dependency implementation)
// ══════════════════════════════════════════════════════════════════════════════

const P = new Uint8Array(512);
const G3: [number, number, number][] = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

// Initialise the permutation table once at module load.
(() => {
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
})();

const _fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const _mix = (a: number, b: number, t: number) => a + t * (b - a);

/** Classic Perlin noise in 3-D. Returns values roughly in [-1, 1]. */
const noise3 = (x: number, y: number, z: number): number => {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const zi = Math.floor(z) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const zf = z - Math.floor(z);
  const u = _fade(xf), v = _fade(yf), w = _fade(zf);
  const A = P[xi] + yi, AA = P[A] + zi, AB = P[A + 1] + zi;
  const B = P[xi + 1] + yi, BA = P[B] + zi, BB = P[B + 1] + zi;
  const d = (h: number, a: number, b: number, c: number) => {
    const g = G3[P[h] % 12];
    return g[0] * a + g[1] * b + g[2] * c;
  };
  return _mix(
    _mix(
      _mix(d(AA, xf, yf, zf), d(BA, xf - 1, yf, zf), u),
      _mix(d(AB, xf, yf - 1, zf), d(BB, xf - 1, yf - 1, zf), u),
      v,
    ),
    _mix(
      _mix(d(AA + 1, xf, yf, zf - 1), d(BA + 1, xf - 1, yf, zf - 1), u),
      _mix(d(AB + 1, xf, yf - 1, zf - 1), d(BB + 1, xf - 1, yf - 1, zf - 1), u),
      v,
    ),
    w,
  );
};

/** Fractal Brownian Motion — layered noise for multi-scale fluid detail. */
const fbm = (x: number, y: number, z: number, oct = 3): number => {
  let val = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < oct; i++) {
    val += noise3(x * freq, y * freq, z * freq) * amp;
    amp *= 0.5;
    freq *= 2;
  }
  return val;
};

// ══════════════════════════════════════════════════════════════════════════════
//  Particle data  (generated once at module level — dense volumetric cloud)
// ══════════════════════════════════════════════════════════════════════════════

const COUNT = 20000;

interface SeedData {
  /** Original base positions */
  base: Float32Array;
  /** Per-particle base size */
  sizes: Float32Array;
  /** Per-particle base opacity */
  opacities: Float32Array;
  /** Color mix (0 = warm amber, 0.5 = rich gold, 1 = radiant bright gold) */
  colorMix: Float32Array;
}

const buildSeedData = (): SeedData => {
  const base = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);
  const opacities = new Float32Array(COUNT);
  const colorMix = new Float32Array(COUNT);

  for (let idx = 0; idx < COUNT; idx++) {
    // Uniform random direction on the unit sphere
    const u = Math.random();
    const v = Math.random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const sp = Math.sin(phi);
    const dx = sp * Math.cos(theta);
    const dy = sp * Math.sin(theta);
    const dz = Math.cos(phi);

    // Adjusted radius: compact scale so it never exceeds container bounds.
    // 65% in a dense outer shell band (0.95 - 1.25), 35% in inner core volume (0.1 - 0.95).
    const isShell = Math.random() < 0.65;
    const r = isShell
      ? 0.95 + Math.random() * 0.32
      : 0.10 + Math.random() * 0.85;

    const i3 = idx * 3;
    base[i3] = dx * r;
    base[i3 + 1] = dy * r;
    base[i3 + 2] = dz * r;

    // Per-particle size variation: slightly larger for visible presence and depth
    const coreFactor = 1.0 - (r / 1.35); // inner core slightly brighter
    sizes[idx] = 0.014 + Math.random() * 0.026 + (isShell ? 0.004 : 0.0);
    opacities[idx] = 0.35 + Math.random() * 0.55 + coreFactor * 0.2;
    colorMix[idx] = Math.random() * 0.75 + (coreFactor * 0.25);
  }

  return { base, sizes, opacities, colorMix };
};

const seed = buildSeedData();

/** Module-level position buffer passed as initial buffer attribute array */
const positionBuffer = new Float32Array(seed.base);

// ══════════════════════════════════════════════════════════════════════════════
//  GLSL shaders  (luminous gold/amber palette, soft round points, depth scaling)
// ══════════════════════════════════════════════════════════════════════════════

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uRippleTime;
  uniform float uHover;
  uniform float uHold;
  uniform vec2 uMouse;

  attribute float aSize;
  attribute float aOpacity;
  attribute float aColor;

  varying float vOp;
  varying float vCol;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float depth = -mv.z;
    float df = smoothstep(7.0, 3.0, depth);

    vec4 proj = projectionMatrix * mv;
    vec2 ndc = proj.xy / proj.w;
    
    // Mouse glow trail
    float mDist = length(ndc - uMouse);
    float mouseGlow = smoothstep(0.25, 0.0, mDist) * uHover;

    // Ripple wave
    float r = length(position);
    float rAge = uTime - uRippleTime;
    float rPos = rAge * 3.5;
    float rDist = abs(r - rPos);
    float ripple = smoothstep(0.3, 0.0, rDist) * smoothstep(1.5, 0.0, rAge);

    float fx = (ripple * 0.8) + (mouseGlow * 0.4) + (uHold * 0.2);

    vOp  = aOpacity * (0.45 + df * 0.55) + fx;
    vCol = aColor + fx * 1.2;

    float sizeMult = 1.0 + fx;
    gl_PointSize = aSize * (360.0 / depth) * (0.60 + df * 0.40) * sizeMult;
    gl_Position  = proj;
  }
`;

const FRAG = /* glsl */ `
  varying float vOp;
  varying float vCol;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;

    float core = smoothstep(0.5, 0.0, d);
    float alpha = pow(core, 1.35) * vOp;

    vec3 deepAmber   = vec3(0.92, 0.56, 0.20);
    vec3 warmGold    = vec3(1.0, 0.82, 0.44);
    vec3 radiantGold = vec3(1.0, 0.94, 0.72);

    vec3 col = mix(deepAmber, warmGold, clamp(vCol * 1.3, 0.0, 1.0));
    col = mix(col, radiantGold, smoothstep(0.65, 1.0, vCol));

    gl_FragColor = vec4(col, alpha);
  }
`;

// ══════════════════════════════════════════════════════════════════════════════
//  Cursor tracker  (captures pointer in NDC inside Canvas)
// ══════════════════════════════════════════════════════════════════════════════

export type PointerState = {
  pos: THREE.Vector2;
  down: boolean;
  hover: boolean;
  rippleTrigger: boolean;
};

const Cursor = ({
  target,
}: {
  target: React.MutableRefObject<PointerState>;
}) => {
  const { gl } = useThree();

  useEffect(() => {
    const el = gl.domElement;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      target.current.pos.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      target.current.pos.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      target.current.hover = true;
    };
    const leave = () => {
      target.current.hover = false;
      target.current.down = false;
    };
    const down = () => { target.current.down = true; };
    const up = () => { target.current.down = false; };
    const click = () => { target.current.rippleTrigger = true; };

    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('click', click);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('click', click);
    };
  }, [gl, target]);

  return null;
};

// ══════════════════════════════════════════════════════════════════════════════
//  State-driven animation parameters (scaled to match compact orb radius)
// ══════════════════════════════════════════════════════════════════════════════

interface AnimParams {
  noiseAmp: number;
  noiseSpeed: number;
  noiseScale: number;
  radialAmp: number;
  breathAmp: number;
  breathSpeed: number;
  rotSpeed: number;
  mouseStr: number;
}

const PARAMS: Record<VoiceAgentState, AnimParams> = {
  idle: {
    noiseAmp: 0.12, noiseSpeed: 0.24, noiseScale: 1.1,
    radialAmp: 0.09, breathAmp: 0.035, breathSpeed: 0.6,
    rotSpeed: 0.03, mouseStr: 0.25,
  },
  listening: {
    noiseAmp: 0.18, noiseSpeed: 0.35, noiseScale: 1.2,
    radialAmp: 0.13, breathAmp: 0.055, breathSpeed: 1.1,
    rotSpeed: 0.04, mouseStr: 0.35,
  },
  processing: {
    noiseAmp: 0.15, noiseSpeed: 0.60, noiseScale: 1.4,
    radialAmp: 0.11, breathAmp: 0.028, breathSpeed: 2.2,
    rotSpeed: 0.08, mouseStr: 0.10,
  },
  retrieving: {
    noiseAmp: 0.17, noiseSpeed: 0.50, noiseScale: 1.1,
    radialAmp: 0.14, breathAmp: 0.045, breathSpeed: 1.6,
    rotSpeed: 0.06, mouseStr: 0.15,
  },
  answering: {
    noiseAmp: 0.14, noiseSpeed: 0.30, noiseScale: 1.15,
    radialAmp: 0.11, breathAmp: 0.075, breathSpeed: 0.9,
    rotSpeed: 0.04, mouseStr: 0.18,
  },
  error: {
    noiseAmp: 0.03, noiseSpeed: 0.08, noiseScale: 0.8,
    radialAmp: 0.02, breathAmp: 0.008, breathSpeed: 0.25,
    rotSpeed: 0.008, mouseStr: 0.0,
  },
};

// ══════════════════════════════════════════════════════════════════════════════
//  Particle cloud component
// ══════════════════════════════════════════════════════════════════════════════

const Cloud = ({ state }: { state: VoiceAgentState }) => {
  const ptsRef = useRef<THREE.Points>(null);
  
  const pState = useRef<PointerState>({
    pos: new THREE.Vector2(),
    down: false,
    hover: false,
    rippleTrigger: false
  });
  const smoothMouse = useRef(new THREE.Vector2(0, 0));

  // Live animation parameters lerped smoothly
  const cur = useRef<AnimParams>({ ...PARAMS.idle });

  const [uniforms] = useState(() => ({
    uTime: { value: 0 },
    uRippleTime: { value: -9999 },
    uHover: { value: 0 },
    uHold: { value: 0 },
    uMouse: { value: new THREE.Vector2() }
  }));

  useFrame(({ clock }) => {
    const pts = ptsRef.current;
    if (!pts) return;

    const t = clock.elapsedTime;
    const tgt = PARAMS[state];
    const c = cur.current;
    const lr = 0.04;

    const u = uniforms;

    // Trigger ripple
    if (pState.current.rippleTrigger) {
      u.uRippleTime.value = t;
      pState.current.rippleTrigger = false;
    }

    // Update uniforms
    u.uTime.value = t;
    u.uMouse.value.copy(smoothMouse.current);
    u.uHover.value = THREE.MathUtils.lerp(u.uHover.value, pState.current.hover ? 1.0 : 0.0, 0.1);
    u.uHold.value = THREE.MathUtils.lerp(u.uHold.value, pState.current.down ? 1.0 : 0.0, 0.1);

    // ── Smooth parameter transitions ─────────────────────────────────
    c.noiseAmp = THREE.MathUtils.lerp(c.noiseAmp, tgt.noiseAmp, lr);
    c.noiseSpeed = THREE.MathUtils.lerp(c.noiseSpeed, tgt.noiseSpeed, lr);
    c.noiseScale = THREE.MathUtils.lerp(c.noiseScale, tgt.noiseScale, lr);
    c.radialAmp = THREE.MathUtils.lerp(c.radialAmp, tgt.radialAmp, lr);
    c.breathAmp = THREE.MathUtils.lerp(c.breathAmp, tgt.breathAmp, lr);
    c.breathSpeed = THREE.MathUtils.lerp(c.breathSpeed, tgt.breathSpeed, lr);
    c.rotSpeed = THREE.MathUtils.lerp(c.rotSpeed, tgt.rotSpeed, lr);
    c.mouseStr = THREE.MathUtils.lerp(c.mouseStr, tgt.mouseStr, lr);

    // ── Smooth mouse ─────────────────────────────────────────────────
    const sm = smoothMouse.current;
    sm.x = THREE.MathUtils.lerp(sm.x, pState.current.pos.x, 0.08);
    sm.y = THREE.MathUtils.lerp(sm.y, pState.current.pos.y, 0.08);
    const mx = sm.x * 2.0;
    const my = sm.y * 2.0;

    // ── Mouse-driven Tilt and Global Rotation ────────────────────────
    // Orb gently tilts toward the cursor
    const tiltX = -sm.y * 0.35;
    const tiltY = sm.x * 0.35;
    pts.rotation.x = THREE.MathUtils.lerp(pts.rotation.x, tiltX + t * c.rotSpeed * 0.25, 0.1);
    pts.rotation.y = THREE.MathUtils.lerp(pts.rotation.y, tiltY + t * c.rotSpeed, 0.1);

    // ── Hold Energy Multiplier ───────────────────────────────────────
    const holdScale = 1.0 + u.uHold.value * 1.5;
    const nAmp = c.noiseAmp * holdScale;
    const nSpeed = c.noiseSpeed * holdScale;

    // ── Layered breathing ────────────────────────────────────────────
    const bs = c.breathSpeed;
    const ba = c.breathAmp;
    const breath =
      1.0 +
      Math.sin(t * bs) * ba +
      Math.sin(t * bs * 2.3 + 0.7) * ba * 0.35 +
      Math.sin(t * bs * 0.61 + 2.1) * ba * 0.18;

    // ── Per-particle update ──────────────────────────────────────────
    const posAttr = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const bp = seed.base;
    const ns = c.noiseScale;
    const tOff = t * nSpeed;

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      const bx = bp[i3], by = bp[i3 + 1], bz = bp[i3 + 2];

      // Surface deformation: radial noise ripple
      const len = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
      const nx = bx / len, ny = by / len, nz = bz / len;
      const rn = fbm(
        nx * 2.2 + tOff * 0.6,
        ny * 2.2 + 5.3,
        nz * 2.2 + tOff * 0.35,
        2,
      ) * c.radialAmp;

      const rx = bx + nx * rn;
      const ry = by + ny * rn;
      const rz = bz + nz * rn;

      // Tangential noise displacement (spatially coherent 3D fluid flow)
      const dx = fbm(rx * ns + tOff, ry * ns + 13.7, rz * ns + 7.3, 2) * nAmp;
      const dy = fbm(rx * ns + 31.1, ry * ns + tOff, rz * ns + 23.9, 2) * nAmp;
      const dz = fbm(rx * ns + 47.3, ry * ns + 5.1, rz * ns + tOff, 2) * nAmp;

      // Apply breathing scale
      let px = (rx + dx) * breath;
      let py = (ry + dy) * breath;
      const pz = (rz + dz) * breath;

      // Interaction: Pull & Tangential Swirl
      const mdx = px - mx;
      const mdy = py - my;
      const mDist = Math.sqrt(mdx * mdx + mdy * mdy) + 0.001;
      
      const fall = Math.max(0, 1 - mDist / 2.0);
      const ease = fall * fall;
      
      // Pull slightly if in mid-range, push away if very close
      const pushPull = (mDist < 0.6 ? 1.2 : -0.4) * ease * c.mouseStr;
      px += (mdx / mDist) * pushPull;
      py += (mdy / mDist) * pushPull;
      
      // Tangential swirl (flowing distortion)
      const swirl = ease * c.mouseStr * 1.2;
      px -= (mdy / mDist) * swirl;
      py += (mdx / mDist) * swirl;

      arr[i3] = px;
      arr[i3 + 1] = py;
      arr[i3 + 2] = pz;
    }

    posAttr.needsUpdate = true;
  });

  return (
    <>
      <Cursor target={pState} />
      <points ref={ptsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positionBuffer, 3]}
          />
          <bufferAttribute
            attach="attributes-aSize"
            args={[seed.sizes, 1]}
          />
          <bufferAttribute
            attach="attributes-aOpacity"
            args={[seed.opacities, 1]}
          />
          <bufferAttribute
            attach="attributes-aColor"
            args={[seed.colorMix, 1]}
          />
        </bufferGeometry>
        <shaderMaterial
          vertexShader={VERT}
          fragmentShader={FRAG}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
//  Public component
// ══════════════════════════════════════════════════════════════════════════════

interface ParticleOrbProps {
  state?: VoiceAgentState;
}

export const ParticleOrb: React.FC<ParticleOrbProps> = ({ state = 'idle' }) => (
  <div className="w-full h-full absolute inset-0">
    <Canvas
      camera={{ position: [0, 0, 5], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
    >
      <Cloud state={state} />
    </Canvas>
  </div>
);

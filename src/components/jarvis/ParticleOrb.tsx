'use client';

import React, { useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export type VoiceAgentState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'retrieving'
  | 'answering'
  | 'error';

const COUNT = 10000;

// ─────────────────────────────────────────────────────────────────────────────
// Particle seed data
// ─────────────────────────────────────────────────────────────────────────────

interface SeedData {
  base: Float32Array;
  sizes: Float32Array;
  opacities: Float32Array;
  colors: Float32Array;
}

const buildSeedData = (): SeedData => {
  const base = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);
  const opacities = new Float32Array(COUNT);
  const colors = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    const u = Math.random();
    const v = Math.random();

    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);

    const sinPhi = Math.sin(phi);

    const x = sinPhi * Math.cos(theta);
    const y = sinPhi * Math.sin(theta);
    const z = Math.cos(phi);

    const shell = Math.random() < 0.68;

    const radius = shell
      ? 0.98 + Math.random() * 0.30
      : 0.12 + Math.random() * 0.82;

    const i3 = i * 3;

    base[i3] = x * radius;
    base[i3 + 1] = y * radius;
    base[i3 + 2] = z * radius;

    const core = 1 - radius / 1.3;

    sizes[i] =
      0.014 +
      Math.random() * 0.024 +
      (shell ? 0.003 : 0.006);

    opacities[i] =
      0.35 +
      Math.random() * 0.55 +
      Math.max(0, core) * 0.15;

    // Keep the original warm gold / amber appearance.
    colors[i] = Math.random();
  }

  return {
    base,
    sizes,
    opacities,
    colors,
  };
};

const seed = buildSeedData();

// ─────────────────────────────────────────────────────────────────────────────
// GPU vertex shader
//
// The important difference:
//
// BEFORE:
// CPU → 20k particles → FBM → Perlin → update buffer every frame
//
// NOW:
// CPU → time/state/mouse
// GPU → particle deformation
// ─────────────────────────────────────────────────────────────────────────────

const VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute float aOpacity;
  attribute float aColor;

  uniform float uTime;
  uniform float uNoiseStrength;
  uniform float uBreathStrength;
  uniform float uBreathSpeed;
  uniform float uMouseStrength;
  uniform vec2 uMouse;

  varying float vOpacity;
  varying float vColor;

  // Lightweight procedural noise.
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);

    f = f * f * (3.0 - 2.0 * f);

    float n000 = hash(i + vec3(0,0,0));
    float n100 = hash(i + vec3(1,0,0));
    float n010 = hash(i + vec3(0,1,0));
    float n110 = hash(i + vec3(1,1,0));

    float n001 = hash(i + vec3(0,0,1));
    float n101 = hash(i + vec3(1,0,1));
    float n011 = hash(i + vec3(0,1,1));
    float n111 = hash(i + vec3(1,1,1));

    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);

    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);

    return mix(nxy0, nxy1, f.z);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for(int i = 0; i < 3; i++) {
      value += noise(p) * amplitude;
      p *= 2.0;
      amplitude *= 0.5;
    }

    return value;
  }

  void main() {

    vec3 p = position;

    // ─────────────────────────────────────────────────────────────────
    // Organic surface deformation
    // ─────────────────────────────────────────────────────────────────

    vec3 normal = normalize(p);

    float n = fbm(
      normal * 2.2 +
      vec3(
        uTime * 0.16,
        uTime * 0.11,
        uTime * 0.13
      )
    );

    float radial = (n - 0.5) * uNoiseStrength;

    p += normal * radial;

    // ─────────────────────────────────────────────────────────────────
    // Fluid displacement
    // ─────────────────────────────────────────────────────────────────

    vec3 flowPosition = p * 1.7;

    flowPosition.x += uTime * 0.08;
    flowPosition.y += uTime * 0.06;
    flowPosition.z += uTime * 0.05;

    float nx = fbm(flowPosition);
    float ny = fbm(flowPosition + vec3(13.7, 31.1, 7.3));
    float nz = fbm(flowPosition + vec3(47.3, 5.1, 23.9));

    vec3 displacement =
      vec3(nx, ny, nz) - 0.5;

    p += displacement * uNoiseStrength * 0.65;

    // ─────────────────────────────────────────────────────────────────
    // Breathing
    // ─────────────────────────────────────────────────────────────────

    float breath =
      sin(uTime * uBreathSpeed) * uBreathStrength;

    breath +=
      sin(uTime * uBreathSpeed * 2.3 + 0.7)
      * uBreathStrength
      * 0.35;

    p *= 1.0 + breath;

    // ─────────────────────────────────────────────────────────────────
    // Mouse interaction
    // ─────────────────────────────────────────────────────────────────

    vec2 mouseDelta =
      p.xy - uMouse * 2.0;

    float distanceToMouse =
      length(mouseDelta);

    float influence =
      smoothstep(
        2.5,
        0.0,
        distanceToMouse
      );

    vec2 pushDirection =
      normalize(mouseDelta + vec2(0.0001));

    p.xy +=
      pushDirection *
      influence *
      influence *
      uMouseStrength;

    // ─────────────────────────────────────────────────────────────────
    // Transform
    // ─────────────────────────────────────────────────────────────────

    vec4 mvPosition =
      modelViewMatrix *
      vec4(p, 1.0);

    float depth = -mvPosition.z;

    float depthFactor =
      smoothstep(7.0, 3.0, depth);

    vOpacity =
      aOpacity *
      (0.45 + depthFactor * 0.55);

    vColor = aColor;

    gl_PointSize =
      aSize *
      (360.0 / depth) *
      (0.60 + depthFactor * 0.40);

    gl_Position =
      projectionMatrix *
      mvPosition;
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Fragment shader
// ─────────────────────────────────────────────────────────────────────────────

const FRAGMENT_SHADER = /* glsl */ `
  varying float vOpacity;
  varying float vColor;

  void main() {

    float distanceFromCenter =
      length(
        gl_PointCoord -
        vec2(0.5)
      );

    if(distanceFromCenter > 0.5)
      discard;

    float glow =
      smoothstep(
        0.5,
        0.0,
        distanceFromCenter
      );

    float alpha =
      pow(glow, 1.35) *
      vOpacity;

    // Restrained JARVIS palette.
    // Mostly warm white/gold rather than everything being yellow.

    vec3 softAmber =
      vec3(0.82, 0.55, 0.22);

    vec3 warmGold =
      vec3(1.0, 0.82, 0.44);

    vec3 paleGold =
      vec3(1.0, 0.94, 0.74);

    vec3 color =
      mix(
        softAmber,
        warmGold,
        clamp(vColor * 1.25, 0.0, 1.0)
      );

    color =
      mix(
        color,
        paleGold,
        smoothstep(
          0.72,
          1.0,
          vColor
        )
      );

    gl_FragColor =
      vec4(color, alpha);
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Cursor
// ─────────────────────────────────────────────────────────────────────────────

const Cursor = ({
  target,
}: {
  target: React.MutableRefObject<THREE.Vector2>;
}) => {

  const { gl } = useThree();

  useEffect(() => {

    const element = gl.domElement;

    const handleMove = (event: PointerEvent) => {

      const rect =
        element.getBoundingClientRect();

      target.current.x =
        ((event.clientX - rect.left) /
          rect.width) *
          2 -
        1;

      target.current.y =
        -(
          ((event.clientY - rect.top) /
            rect.height) *
            2 -
          1
        );
    };

    const handleLeave = () => {
      target.current.set(0, 0);
    };

    element.addEventListener(
      'pointermove',
      handleMove
    );

    element.addEventListener(
      'pointerleave',
      handleLeave
    );

    return () => {

      element.removeEventListener(
        'pointermove',
        handleMove
      );

      element.removeEventListener(
        'pointerleave',
        handleLeave
      );
    };

  }, [gl, target]);

  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// State parameters
// ─────────────────────────────────────────────────────────────────────────────

interface StateParams {
  noise: number;
  breath: number;
  breathSpeed: number;
  mouse: number;
  rotation: number;
}

const PARAMS: Record<
  VoiceAgentState,
  StateParams
> = {

  idle: {
    noise: 0.13,
    breath: 0.035,
    breathSpeed: 0.6,
    mouse: 0.20,
    rotation: 0.025,
  },

  listening: {
    noise: 0.20,
    breath: 0.065,
    breathSpeed: 1.15,
    mouse: 0.40,
    rotation: 0.045,
  },

  processing: {
    noise: 0.16,
    breath: 0.03,
    breathSpeed: 2.0,
    mouse: 0.12,
    rotation: 0.075,
  },

  retrieving: {
    noise: 0.18,
    breath: 0.05,
    breathSpeed: 1.5,
    mouse: 0.16,
    rotation: 0.06,
  },

  answering: {
    noise: 0.15,
    breath: 0.075,
    breathSpeed: 0.9,
    mouse: 0.20,
    rotation: 0.04,
  },

  error: {
    noise: 0.035,
    breath: 0.008,
    breathSpeed: 0.25,
    mouse: 0.0,
    rotation: 0.008,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// GPU particle cloud
// ─────────────────────────────────────────────────────────────────────────────

const Cloud = ({
  state,
}: {
  state: VoiceAgentState;
}) => {

  const pointsRef =
    useRef<THREE.Points>(null);

  const materialRef =
    useRef<THREE.ShaderMaterial>(null);

  const mouse =
    useRef(new THREE.Vector2());

  const smoothMouse =
    useRef(new THREE.Vector2());

  const current =
    useRef<StateParams>({
      ...PARAMS.idle,
    });

  useFrame(
    ({ clock }, delta) => {

      const material =
        materialRef.current;

      const points =
        pointsRef.current;

      if (!material || !points)
        return;

      const target =
        PARAMS[state];

      const currentParams =
        current.current;

      // Smooth state transitions.

      const lerpAmount =
        1 -
        Math.pow(
          0.001,
          delta
        );

      currentParams.noise =
        THREE.MathUtils.lerp(
          currentParams.noise,
          target.noise,
          lerpAmount
        );

      currentParams.breath =
        THREE.MathUtils.lerp(
          currentParams.breath,
          target.breath,
          lerpAmount
        );

      currentParams.breathSpeed =
        THREE.MathUtils.lerp(
          currentParams.breathSpeed,
          target.breathSpeed,
          lerpAmount
        );

      currentParams.mouse =
        THREE.MathUtils.lerp(
          currentParams.mouse,
          target.mouse,
          lerpAmount
        );

      currentParams.rotation =
        THREE.MathUtils.lerp(
          currentParams.rotation,
          target.rotation,
          lerpAmount
        );

      // Smooth cursor.

      smoothMouse.current.x =
        THREE.MathUtils.lerp(
          smoothMouse.current.x,
          mouse.current.x,
          0.08
        );

      smoothMouse.current.y =
        THREE.MathUtils.lerp(
          smoothMouse.current.y,
          mouse.current.y,
          0.08
        );

      // Very cheap CPU work.
      // Particle deformation happens entirely on GPU.

      points.rotation.y +=
        delta *
        currentParams.rotation;

      points.rotation.x +=
        delta *
        currentParams.rotation *
        0.25;

      material.uniforms.uTime.value =
        clock.elapsedTime;

      material.uniforms.uNoiseStrength.value =
        currentParams.noise;

      material.uniforms.uBreathStrength.value =
        currentParams.breath;

      material.uniforms.uBreathSpeed.value =
        currentParams.breathSpeed;

      material.uniforms.uMouseStrength.value =
        currentParams.mouse;

      material.uniforms.uMouse.value.lerp(
        smoothMouse.current,
        0.15
      );
    }
  );

  return (
    <>
      <Cursor target={mouse} />

      <points ref={pointsRef}>

        <bufferGeometry>

          <bufferAttribute
            attach="attributes-position"
            args={[
              seed.base,
              3,
            ]}
          />

          <bufferAttribute
            attach="attributes-aSize"
            args={[
              seed.sizes,
              1,
            ]}
          />

          <bufferAttribute
            attach="attributes-aOpacity"
            args={[
              seed.opacities,
              1,
            ]}
          />

          <bufferAttribute
            attach="attributes-aColor"
            args={[
              seed.colors,
              1,
            ]}
          />

        </bufferGeometry>

        <shaderMaterial
          ref={materialRef}
          vertexShader={VERTEX_SHADER}
          fragmentShader={FRAGMENT_SHADER}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={{
            uTime: {
              value: 0,
            },

            uNoiseStrength: {
              value: PARAMS.idle.noise,
            },

            uBreathStrength: {
              value: PARAMS.idle.breath,
            },

            uBreathSpeed: {
              value: PARAMS.idle.breathSpeed,
            },

            uMouseStrength: {
              value: PARAMS.idle.mouse,
            },

            uMouse: {
              value: new THREE.Vector2(),
            },
          }}
        />

      </points>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Public component
// ─────────────────────────────────────────────────────────────────────────────

interface ParticleOrbProps {
  state?: VoiceAgentState;
}

export const ParticleOrb: React.FC<
  ParticleOrbProps
> = ({
  state = 'idle',
}) => {

  return (
    <div className="absolute inset-0 h-full w-full">

      <Canvas
        camera={{
          position: [0, 0, 5],
          fov: 45,
        }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
      >

        <Cloud state={state} />

      </Canvas>

    </div>
  );
};
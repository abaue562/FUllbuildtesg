/**
 * UNICORN STUDIO CLONE — WebGL Effects Library
 * Built with React Three Fiber + Drei + @react-three/postprocessing + GSAP
 *
 * Usage in Next.js:
 *   import { FluidHero, ParticleField, GlowOrb, ShaderBackground } from '@/lib/webgl'
 *   <FluidHero scrollProgress={scrollY} />
 *
 * Install:
 *   npm install three @react-three/fiber @react-three/drei @react-three/postprocessing
 *   npm install gsap @studio-freight/lenis maath glsl-noise
 */

'use client';

import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  MeshDistortMaterial,
  MeshWobbleMaterial,
  Sparkles,
  Float,
  GradientTexture,
  shaderMaterial,
  Environment,
  Caustics
} from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration, Noise, Vignette, DepthOfField } from '@react-three/postprocessing';
import { extend } from '@react-three/fiber';
import * as THREE from 'three';
import { BlendFunction } from 'postprocessing';

// ═══════════════════════════════════════════════════════════
// GLSL SHADERS — Claude can write custom ones on demand
// ═══════════════════════════════════════════════════════════

/**
 * Fluid gradient shader — matches Unicorn Studio's most popular effect
 * SHADER: animated fluid gradient with mouse reactivity
 */
const FluidShaderMaterial = shaderMaterial(
  {
    u_time: 0,
    u_mouse: new THREE.Vector2(0.5, 0.5),
    u_resolution: new THREE.Vector2(1, 1),
    u_scroll: 0,
    u_color1: new THREE.Color('#0a0a1a'),
    u_color2: new THREE.Color('#1a0a3a'),
    u_color3: new THREE.Color('#0a1a3a'),
    u_color4: new THREE.Color('#3a0a1a'),
  },
  // Vertex
  `
    varying vec2 vUv;
    varying vec3 vPosition;
    void main() {
      vUv = uv;
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  // Fragment — fluid noise-based gradient
  `
    uniform float u_time;
    uniform vec2 u_mouse;
    uniform vec2 u_resolution;
    uniform float u_scroll;
    uniform vec3 u_color1;
    uniform vec3 u_color2;
    uniform vec3 u_color3;
    uniform vec3 u_color4;
    varying vec2 vUv;

    // Simplex-like noise
    vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
      vec2 i = floor(v + dot(v, C.yy));
      vec2 x0 = v - i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod(i, 289.0);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m; m = m*m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
      vec3 g;
      g.x = a0.x * x0.x + h.x * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    void main() {
      vec2 uv = vUv;

      // Mouse influence
      vec2 mouse_offset = (u_mouse - 0.5) * 0.15;
      uv += mouse_offset * (1.0 - length(uv - 0.5));

      // Scroll influence
      uv.y += u_scroll * 0.05;

      float t = u_time * 0.3;

      // Layered noise for organic movement
      float n1 = snoise(uv * 2.0 + vec2(t * 0.5, t * 0.3));
      float n2 = snoise(uv * 3.5 - vec2(t * 0.4, t * 0.6)) * 0.5;
      float n3 = snoise(uv * 6.0 + vec2(t * 0.7, -t * 0.4)) * 0.25;

      float noise = n1 + n2 + n3;
      noise = (noise + 1.0) * 0.5; // normalize to 0-1

      // 4-color gradient mixing based on noise
      vec3 color;
      float threshold1 = 0.3;
      float threshold2 = 0.55;
      float threshold3 = 0.75;

      if (noise < threshold1) {
        color = mix(u_color1, u_color2, noise / threshold1);
      } else if (noise < threshold2) {
        color = mix(u_color2, u_color3, (noise - threshold1) / (threshold2 - threshold1));
      } else if (noise < threshold3) {
        color = mix(u_color3, u_color4, (noise - threshold2) / (threshold3 - threshold2));
      } else {
        color = mix(u_color4, u_color1, (noise - threshold3) / (1.0 - threshold3));
      }

      // Subtle vignette
      float dist = length(vUv - 0.5) * 1.5;
      color *= 1.0 - dist * 0.3;

      gl_FragColor = vec4(color, 1.0);
    }
  `
);

/**
 * Particle displacement shader for floating particles effect
 * SHADER: noise-displaced particle system matching Unicorn Studio sparkles
 */
const ParticleShaderMaterial = shaderMaterial(
  {
    u_time: 0,
    u_scroll: 0,
    u_mouse: new THREE.Vector2(0.5, 0.5),
    u_color: new THREE.Color('#ffffff'),
    u_size: 2.0,
  },
  `
    uniform float u_time;
    uniform float u_scroll;
    uniform vec2 u_mouse;
    uniform float u_size;
    attribute float aRandom;
    attribute float aSpeed;
    varying float vRandom;
    varying float vAlpha;

    vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
      vec2 i = floor(v + dot(v, C.yy));
      vec2 x0 = v - i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod(i, 289.0);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m; m = m*m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
      vec3 g;
      g.x = a0.x * x0.x + h.x * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    void main() {
      vRandom = aRandom;
      float t = u_time * aSpeed;

      // Noise-based displacement
      float nx = snoise(vec2(position.x * 0.5, position.y * 0.5 + t * 0.3));
      float ny = snoise(vec2(position.x * 0.5 + 100.0, position.y * 0.5 + t * 0.2));

      // Mouse repulsion
      vec2 mouseWorld = (u_mouse - 0.5) * 4.0;
      vec2 toMouse = vec2(position.x, position.y) - mouseWorld;
      float mouseDist = length(toMouse);
      vec2 mouseForce = normalize(toMouse) * (1.0 / max(mouseDist * mouseDist, 0.1)) * 0.3;

      vec3 displaced = position + vec3(nx * 0.3 + mouseForce.x, ny * 0.3 + u_scroll * 0.2 + mouseForce.y, 0.0);

      vAlpha = 0.4 + aRandom * 0.6;
      gl_PointSize = u_size * (1.0 + aRandom * 2.0) * (1.0 / -displaced.z + 1.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
    }
  `,
  `
    uniform vec3 u_color;
    varying float vRandom;
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      float alpha = smoothstep(0.5, 0.1, d) * vAlpha;
      gl_FragColor = vec4(u_color + vec3(vRandom * 0.3), alpha);
    }
  `
);

extend({ FluidShaderMaterial, ParticleShaderMaterial });

// ═══════════════════════════════════════════════════════════
// COMPONENT: FluidHero — main hero background effect
// Matches Unicorn Studio's "fluid" and "blob" effects
// ═══════════════════════════════════════════════════════════
function FluidScene({ scrollProgress = 0, mousePos = { x: 0.5, y: 0.5 }, colors }) {
  const matRef = useRef();
  const { size } = useThree();

  useFrame((state) => {
    if (!matRef.current) return;
    matRef.current.u_time = state.clock.elapsedTime;
    matRef.current.u_mouse.set(mousePos.x, mousePos.y);
    matRef.current.u_scroll = scrollProgress;
    matRef.current.u_resolution.set(size.width, size.height);
  });

  useEffect(() => {
    if (!matRef.current || !colors) return;
    if (colors[0]) matRef.current.u_color1 = new THREE.Color(colors[0]);
    if (colors[1]) matRef.current.u_color2 = new THREE.Color(colors[1]);
    if (colors[2]) matRef.current.u_color3 = new THREE.Color(colors[2]);
    if (colors[3]) matRef.current.u_color4 = new THREE.Color(colors[3]);
  }, [colors]);

  return (
    <mesh position={[0, 0, -1]}>
      <planeGeometry args={[4, 3, 1, 1]} />
      {/* @ts-ignore */}
      <fluidShaderMaterial ref={matRef} />
    </mesh>
  );
}

export function FluidHero({
  scrollProgress = 0,
  colors = ['#0a0a1a', '#1a0a3a', '#0a1a3a', '#3a0a1a'],
  bloom = true,
  chromatic = true,
  noise = true,
  className = '',
}) {
  const mouseRef = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const handler = (e) => {
      mouseRef.current = {
        x: e.clientX / window.innerWidth,
        y: 1 - e.clientY / window.innerHeight,
      };
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  return (
    <div className={`absolute inset-0 ${className}`} style={{ zIndex: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 1], fov: 75 }}
        gl={{ antialias: false, alpha: false }}
        dpr={[1, 1.5]}
      >
        <FluidScene scrollProgress={scrollProgress} mousePos={mouseRef.current} colors={colors} />
        {(bloom || chromatic || noise) && (
          <EffectComposer>
            {bloom && <Bloom intensity={0.4} luminanceThreshold={0.3} luminanceSmoothing={0.9} />}
            {chromatic && <ChromaticAberration offset={[0.001, 0.0005]} blendFunction={BlendFunction.NORMAL} />}
            {noise && <Noise opacity={0.03} blendFunction={BlendFunction.ADD} />}
            <Vignette eskil={false} offset={0.1} darkness={0.4} />
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPONENT: ParticleField — floating particles with mouse repulsion
// Matches Unicorn Studio's particle effects
// ═══════════════════════════════════════════════════════════
function ParticleSystem({ count = 2000, color = '#ffffff', scrollProgress = 0 }) {
  const pointsRef = useRef();
  const mouseRef = useRef(new THREE.Vector2(0.5, 0.5));

  const [positions, randoms, speeds] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const rnd = new Float32Array(count);
    const spd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 6;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2;
      rnd[i] = Math.random();
      spd[i] = 0.3 + Math.random() * 0.7;
    }
    return [pos, rnd, spd];
  }, [count]);

  useEffect(() => {
    const handler = (e) => {
      mouseRef.current.set(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight);
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  useFrame((state) => {
    if (!pointsRef.current?.material) return;
    pointsRef.current.material.u_time = state.clock.elapsedTime;
    pointsRef.current.material.u_mouse.copy(mouseRef.current);
    pointsRef.current.material.u_scroll = scrollProgress;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-aRandom" count={count} array={randoms} itemSize={1} />
        <bufferAttribute attach="attributes-aSpeed" count={count} array={speeds} itemSize={1} />
      </bufferGeometry>
      {/* @ts-ignore */}
      <particleShaderMaterial
        u_color={new THREE.Color(color)}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export function ParticleField({
  count = 2000,
  color = '#6366f1',
  scrollProgress = 0,
  className = ''
}) {
  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      <Canvas camera={{ position: [0, 0, 2], fov: 60 }} gl={{ alpha: true }} dpr={[1, 1.5]}>
        <ParticleSystem count={count} color={color} scrollProgress={scrollProgress} />
        <EffectComposer>
          <Bloom intensity={0.6} luminanceThreshold={0.1} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPONENT: GlowOrb — animated 3D sphere with distortion
// Matches Unicorn Studio's blob/orb effects
// ═══════════════════════════════════════════════════════════
function OrbMesh({ color = '#6366f1', secondary = '#a855f7', scroll = 0 }) {
  const meshRef = useRef();
  const lightRef = useRef();

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    meshRef.current.rotation.x = Math.sin(t * 0.3) * 0.2;
    meshRef.current.rotation.y = t * 0.15;
    meshRef.current.position.y = Math.sin(t * 0.4) * 0.1 - scroll * 0.3;
    if (lightRef.current) {
      lightRef.current.position.x = Math.sin(t * 0.6) * 2;
      lightRef.current.position.y = Math.cos(t * 0.4) * 2;
    }
  });

  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight ref={lightRef} color={color} intensity={3} distance={8} />
      <pointLight position={[-3, -2, 2]} color={secondary} intensity={2} distance={6} />
      <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.5}>
        <mesh ref={meshRef}>
          <icosahedronGeometry args={[1, 8]} />
          <MeshDistortMaterial
            color={color}
            distort={0.4}
            speed={2}
            roughness={0}
            metalness={0.8}
            envMapIntensity={1}
          />
        </mesh>
      </Float>
    </>
  );
}

export function GlowOrb({
  color = '#6366f1',
  secondary = '#a855f7',
  scrollProgress = 0,
  className = '',
  width = 400,
  height = 400,
}) {
  return (
    <div className={className} style={{ width, height }}>
      <Canvas camera={{ position: [0, 0, 3], fov: 50 }} gl={{ alpha: true }} dpr={[1, 2]}>
        <Environment preset="city" />
        <OrbMesh color={color} secondary={secondary} scroll={scrollProgress} />
        <EffectComposer>
          <Bloom intensity={1.2} luminanceThreshold={0.2} luminanceSmoothing={0.9} radius={0.8} />
          <ChromaticAberration offset={[0.002, 0.001]} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPONENT: AuroraBackground — northern lights effect
// ═══════════════════════════════════════════════════════════
const AuroraShaderMaterial = shaderMaterial(
  { u_time: 0, u_scroll: 0 },
  `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  `
    uniform float u_time;
    uniform float u_scroll;
    varying vec2 vUv;

    float hash(float n) { return fract(sin(n) * 43758.5453); }
    float noise(vec2 x) {
      vec2 p = floor(x);
      vec2 f = fract(x);
      f = f*f*(3.0-2.0*f);
      float n = p.x + p.y*57.0;
      return mix(mix(hash(n+0.0), hash(n+1.0), f.x), mix(hash(n+57.0), hash(n+58.0), f.x), f.y);
    }

    void main() {
      vec2 uv = vUv;
      uv.y -= u_scroll * 0.1;
      float t = u_time * 0.1;

      float aurora = 0.0;
      for(int i = 0; i < 3; i++) {
        float fi = float(i);
        float wave = sin(uv.x * 3.0 + noise(vec2(uv.x * 1.5, t + fi)) * 2.0 + t * (1.0 + fi * 0.3)) * 0.5 + 0.5;
        float curtain = smoothstep(0.3, 0.7, uv.y) * smoothstep(0.9 + fi * 0.03, 0.5, uv.y);
        aurora += wave * curtain * (0.4 + fi * 0.15);
      }

      vec3 deep = vec3(0.02, 0.05, 0.15);
      vec3 teal = vec3(0.0, 0.8, 0.7);
      vec3 violet = vec3(0.5, 0.0, 0.9);
      vec3 green = vec3(0.1, 0.9, 0.4);

      float n = noise(uv * 3.0 + t * 0.5);
      vec3 auroraColor = mix(mix(teal, green, n), violet, noise(uv * 5.0 + t * 0.3) * 0.5);
      vec3 color = mix(deep, auroraColor, aurora * 0.8);

      float stars = step(0.995, noise(uv * 200.0 + t * 0.01)) * (1.0 - aurora * 2.0);
      color += vec3(stars) * 0.6;

      gl_FragColor = vec4(color, 1.0);
    }
  `
);
extend({ AuroraShaderMaterial });

function AuroraScene({ scroll }) {
  const matRef = useRef();
  useFrame((state) => {
    if (matRef.current) {
      matRef.current.u_time = state.clock.elapsedTime;
      matRef.current.u_scroll = scroll;
    }
  });
  return (
    <mesh>
      <planeGeometry args={[4, 3]} />
      {/* @ts-ignore */}
      <auroraShaderMaterial ref={matRef} />
    </mesh>
  );
}

export function AuroraBackground({ scrollProgress = 0, className = '' }) {
  return (
    <div className={`absolute inset-0 ${className}`}>
      <Canvas camera={{ position: [0, 0, 1], fov: 75 }} gl={{ antialias: false }} dpr={[1, 1.5]}>
        <AuroraScene scroll={scrollProgress} />
        <EffectComposer>
          <Bloom intensity={0.3} luminanceThreshold={0.4} />
          <Noise opacity={0.02} blendFunction={BlendFunction.ADD} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// UTILITY: useScrollProgress hook for scroll-driven effects
// ═══════════════════════════════════════════════════════════
export function useScrollProgress(ref) {
  const progress = useRef(0);

  useEffect(() => {
    const handler = () => {
      if (ref?.current) {
        const rect = ref.current.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        progress.current = Math.max(0, Math.min(1, (windowHeight - rect.top) / (windowHeight + rect.height)));
      } else {
        progress.current = window.scrollY / (document.body.scrollHeight - window.innerHeight);
      }
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, [ref]);

  return progress;
}

// ═══════════════════════════════════════════════════════════
// COMMAND INTERFACE — matches CLAUDE.md SHADER: syntax
// Example: SHADER: morphing crystal with rainbow light refraction
// ═══════════════════════════════════════════════════════════
export const SHADER_CATALOG = {
  'fluid-gradient': FluidHero,
  'particle-field': ParticleField,
  'glow-orb': GlowOrb,
  'aurora': AuroraBackground,
  // Add more via SHADER: command in CLAUDE.md
};

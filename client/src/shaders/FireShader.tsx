import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Fire shader material with animated flames
const fireVertexShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vNormal;
  
  void main() {
    vUv = uv;
    vPosition = position;
    vNormal = normal;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fireFragmentShader = `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  
  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vNormal;
  
  // Noise function for flame animation
  float noise(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
  }
  
  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p * frequency);
      amplitude *= 0.5;
      frequency *= 2.0;
    }
    
    return value;
  }
  
  void main() {
    vec2 uv = vUv;
    
    // Create animated noise for flame effect
    vec3 noisePos = vPosition * 2.0 + vec3(0.0, uTime * 2.0, 0.0);
    float noiseValue = fbm(noisePos);
    
    // Create flame shape - stronger at bottom, weaker at top
    float flameShape = 1.0 - smoothstep(0.0, 1.0, uv.y);
    flameShape *= (0.5 + 0.5 * noiseValue);
    
    // Create flickering effect
    float flicker = 0.8 + 0.2 * sin(uTime * 10.0 + noiseValue * 5.0);
    flameShape *= flicker;
    
    // Create color gradient from hot core to cooler edges
    float distanceFromCenter = length(uv - 0.5) * 2.0;
    float coreIntensity = 1.0 - smoothstep(0.0, 0.8, distanceFromCenter);
    
    // Mix colors based on flame intensity and position
    vec3 color;
    if (flameShape > 0.7) {
      // Hot core - white/yellow
      color = mix(uColor3, vec3(1.0, 1.0, 0.8), coreIntensity);
    } else if (flameShape > 0.4) {
      // Medium flame - orange/yellow
      color = mix(uColor2, uColor3, (flameShape - 0.4) / 0.3);
    } else {
      // Outer flame - red/orange
      color = mix(uColor1, uColor2, flameShape / 0.4);
    }
    
    // Add some blue tint at the very base for realism
    if (uv.y < 0.2) {
      color = mix(color, vec3(0.2, 0.4, 1.0), (0.2 - uv.y) * 2.0);
    }
    
    // Calculate final alpha with flame shape
    float alpha = flameShape * uIntensity;
    alpha = smoothstep(0.0, 1.0, alpha);
    
    gl_FragColor = vec4(color, alpha);
  }
`;

interface FireShaderMaterialProps {
  intensity?: number;
  color1?: THREE.Color;
  color2?: THREE.Color;
  color3?: THREE.Color;
}

export const FireShaderMaterial: React.FC<FireShaderMaterialProps> = ({
  intensity = 1.0,
  color1 = new THREE.Color('#ff0000'), // Red base
  color2 = new THREE.Color('#ff4500'), // Orange middle
  color3 = new THREE.Color('#ffff00'), // Yellow core
}) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null!);
  
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uIntensity: { value: intensity },
    uColor1: { value: color1 },
    uColor2: { value: color2 },
    uColor3: { value: color3 },
  }), [intensity, color1, color2, color3]);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <shaderMaterial
      ref={materialRef}
      vertexShader={fireVertexShader}
      fragmentShader={fireFragmentShader}
      uniforms={uniforms}
      transparent
      blending={THREE.AdditiveBlending}
      side={THREE.DoubleSide}
      depthWrite={false}
    />
  );
};

// Fire ball component that uses the fire shader
interface FireBallProps {
  position?: [number, number, number];
  scale?: number;
  intensity?: number;
}

export const FireBall: React.FC<FireBallProps> = ({
  position = [0, 0, 0],
  scale = 1,
  intensity = 1.0
}) => {
  const meshRef = useRef<THREE.Mesh>(null!);
  
  useFrame((state) => {
    if (meshRef.current) {
      // Add subtle floating animation
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2) * 0.1;
      // Add gentle rotation
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.5;
    }
  });

  return (
    <group position={position}>
      {/* Main fire sphere */}
      <mesh ref={meshRef} scale={scale}>
        <sphereGeometry args={[0.3, 32, 32]} />
        <FireShaderMaterial intensity={intensity} />
      </mesh>
      
      {/* Inner core for extra glow */}
      <mesh scale={scale * 0.6}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshBasicMaterial 
          color="#ffff88"
          transparent
          opacity={0.8}
        />
      </mesh>
      
      {/* Outer glow effect */}
      <mesh scale={scale * 1.5}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshBasicMaterial 
          color="#ff4400"
          transparent
          opacity={0.2}
        />
      </mesh>
    </group>
  );
};

/**
 * GameScene.tsx
 * 
 * Core component that manages the 3D multiplayer game environment:
 * 
 * Key functionality:
 * - Acts as the primary container for all 3D game elements
 * - Manages the game world environment (terrain, lighting, physics)
 * - Instantiates and coordinates player entities
 * - Handles multiplayer synchronization across clients
 * - Manages game state and lifecycle (start, join, disconnect)
 * - Maintains socket connections for real-time gameplay
 * 
 * Props:
 * - username: The local player's display name
 * - playerClass: The selected character class for the local player
 * - roomId: Unique identifier for the multiplayer game session
 * - onDisconnect: Callback function when player disconnects from game
 * 
 * Technical implementation:
 * - Uses React Three Fiber (R3F) for 3D rendering within React
 * - Implements physics system with Rapier for realistic interactions
 * - Manages socket.io connections for multiplayer state synchronization
 * - Handles dynamic loading and instantiation of 3D assets
 * 
 * Related files:
 * - Player.tsx: Individual player entity component
 * - JoinGameDialog.tsx: UI for joining a game session
 * - PlayerUI.tsx: In-game user interface elements
 * - Socket handlers for network communication
 */

import React, { useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Box, Plane, Grid, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { DirectionalLightHelper, CameraHelper } from 'three'; // Import the helper
// Import generated types
import { PlayerData, ProjectileData, InputState } from '../generated';
import { Identity } from '@clockworklabs/spacetimedb-sdk';
import { Player } from './Player';
import { FireBall } from '../shaders/FireShader';

interface GameSceneProps {
  players: ReadonlyMap<string, PlayerData>; // Receive the map
  projectiles: ReadonlyMap<number, ProjectileData>; // Receive projectiles map
  localPlayerIdentity: Identity | null;
  onPlayerRotation?: (rotation: THREE.Euler) => void; // Optional callback for player rotation
  currentInputRef?: React.MutableRefObject<InputState>; // Add input state ref prop
  isDebugPanelVisible?: boolean; // Prop to indicate if the debug panel is visible
}

export const GameScene: React.FC<GameSceneProps> = ({ 
  players, 
  projectiles,
  localPlayerIdentity,
  onPlayerRotation,
  currentInputRef, // Receive input state ref
  isDebugPanelVisible = false // Destructure the new prop
}) => {
  // Ref for the main directional light
  const directionalLightRef = useRef<THREE.DirectionalLight>(null!);
  
  // Debug logging for projectiles
  // console.log("🎯 GameScene render - projectiles count:", projectiles.size, Array.from(projectiles.values())); 

  return (
    <Canvas 
      camera={{ position: [0, 10, 20], fov: 60 }} 
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }} 
      shadows // Enable shadows
    >
      {/* Remove solid color background */}
      {/* <color attach="background" args={['#add8e6']} /> */}
      
      {/* Add Sky component */}
      <Sky distance={450000} sunPosition={[5, 1, 8]} inclination={0} azimuth={0.25} />

      {/* Ambient light for general scene illumination */}
      <ambientLight intensity={0.5} />
      
      {/* Main directional light with improved shadow settings */}
      <directionalLight 
        ref={directionalLightRef} // Assign ref
        position={[15, 20, 10]} 
        intensity={2.5} 
        castShadow 
        shadow-mapSize-width={2048} // Increased resolution
        shadow-mapSize-height={2048} // Increased resolution
        shadow-bias={-0.0001} // Made bias less negative (closer to 0)
        shadow-camera-left={-30} // Wider frustum
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={0.1} // Closer near plane
        shadow-camera-far={100} // Further far plane
      />

      {/* Conditionally render Light and Shadow Camera Helpers */}
      {isDebugPanelVisible && directionalLightRef.current && (
        <>
          <primitive object={new DirectionalLightHelper(directionalLightRef.current, 5)} />
          {/* Add CameraHelper for the shadow camera */}
          <primitive object={new CameraHelper(directionalLightRef.current.shadow.camera)} /> 
        </>
      )}
      
      {/* Visible Background Plane (darker, receives shadows) */}
      <Plane 
        args={[200, 200]} 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, -0.001, 0]} 
        receiveShadow={true} 
      >
        <meshStandardMaterial color="#606060" /> { /* Changed to darker gray */ }
      </Plane>

      {/* Simplified Grid Helper (mid-gray lines) */}
      <Grid 
        position={[0, 0, 0]} 
        args={[200, 200]} 
        cellSize={2} 
        cellThickness={1}
        cellColor={new THREE.Color('#888888')} // Mid-gray grid lines
      />

      {/* Render Players */}
      {Array.from(players.values()).map((player) => {
        const isLocal = localPlayerIdentity?.toHexString() === player.identity.toHexString();
        return (
          <Player 
            key={player.identity.toHexString()} 
            playerData={player}
            isLocalPlayer={isLocal}
            onRotationChange={isLocal ? onPlayerRotation : undefined}
            currentInput={isLocal ? currentInputRef?.current : undefined}
            isDebugArrowVisible={isLocal ? isDebugPanelVisible : false} // Pass down arrow visibility
            isDebugPanelVisible={isDebugPanelVisible} // Pass down general debug visibility
          />
        );
      })}

      {/* Render Projectiles */}
      {Array.from(projectiles.values()).map((projectile) => (
        <SmoothProjectile 
          key={projectile.id}
          projectile={projectile}
          players={players}
        />
      ))}

      {/* Remove OrbitControls as we're using our own camera controls */}
    </Canvas>
  );
};

// Smooth projectile component with homing but dodgable behavior
function SmoothProjectile({ projectile, players }: { projectile: ProjectileData, players: ReadonlyMap<string, PlayerData> }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const currentPosition = useRef(new THREE.Vector3(projectile.position.x, projectile.position.y, projectile.position.z));
  const velocity = useRef(new THREE.Vector3(0, 0, 0));
  const lastUpdateTime = useRef(Date.now());

  // Initialize position
  useEffect(() => {
    currentPosition.current.set(projectile.position.x, projectile.position.y, projectile.position.z);
  }, []);

  // Find target player for homing (use correct camelCase field names)
  const targetIdentity = (projectile as any).targetIdentity || projectile.target_identity;
  let targetPlayer = targetIdentity ? players.get(targetIdentity.toString()) : null;
  
  // Fallback: if no targetIdentity, find nearest player (excluding caster)
  if (!targetPlayer && players.size > 1) {
    let nearestPlayer = null;
    let nearestDistance = Infinity;
    
    for (const [playerId, player] of players) {
      // Skip if this is the caster (use correct camelCase field names)
      const casterIdentity = (projectile as any).casterIdentity || projectile.caster_identity;
      if (casterIdentity && playerId === casterIdentity.toString()) {
        continue;
      }
      
      // Calculate distance from projectile to this player
      const dx = player.position.x - projectile.position.x;
      const dy = player.position.y - projectile.position.y;
      const dz = player.position.z - projectile.position.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPlayer = player;
      }
    }
    
    targetPlayer = nearestPlayer;
    if (targetPlayer) {
      console.log('🎯 Fallback targeting: Found nearest player at distance', nearestDistance.toFixed(2));
    }
  }
  
  // Debug logging for targeting (reduced to avoid spam)
  if (Math.random() < 0.1) { // Only log 10% of the time to reduce spam
    console.log('🎯 Projectile targeting debug:');
    console.log('  - Projectile ID:', projectile.id);
    console.log('  - Target identity (camelCase):', (projectile as any).targetIdentity);
    console.log('  - Target identity (snake_case):', projectile.target_identity);
    console.log('  - Final targetIdentity used:', targetIdentity);
    console.log('  - Target player found:', !!targetPlayer);
    console.log('  - Players count:', players.size);
  }

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const speed = projectile.speed || 15.0;
    const homingStrength = 0.3; // Lower = more dodgable, higher = more aggressive homing
    const maxTurnRate = 2.0; // Maximum turn rate per second (radians)

    if (targetPlayer) {
      // Homing behavior - gradually turn toward target
      const targetPos = new THREE.Vector3(targetPlayer.position.x, targetPlayer.position.y, targetPlayer.position.z);
      const toTarget = targetPos.clone().sub(currentPosition.current).normalize();
      
      // If velocity is zero, initialize it toward target
      if (velocity.current.length() === 0) {
        velocity.current.copy(toTarget).multiplyScalar(speed);
      } else {
        // Gradually turn velocity toward target (makes it dodgable)
        const currentDir = velocity.current.clone().normalize();
        const angle = currentDir.angleTo(toTarget);
        const maxAngleThisFrame = maxTurnRate * delta;
        
        if (angle > maxAngleThisFrame) {
          // Limit turning rate - this makes projectiles dodgable
          const axis = new THREE.Vector3().crossVectors(currentDir, toTarget).normalize();
          const quaternion = new THREE.Quaternion().setFromAxisAngle(axis, maxAngleThisFrame);
          currentDir.applyQuaternion(quaternion);
          velocity.current.copy(currentDir).multiplyScalar(speed);
        } else {
          // Can turn directly toward target
          velocity.current.copy(toTarget).multiplyScalar(speed);
        }
      }
    } else {
      // No target - move in straight line
      if (velocity.current.length() === 0) {
        velocity.current.set(0, 0, speed); // Default forward direction
      }
    }

    // Update position based on velocity
    const movement = velocity.current.clone().multiplyScalar(delta);
    currentPosition.current.add(movement);
    
    // Apply position to mesh
    meshRef.current.position.copy(currentPosition.current);
  });

  // Check if this is a fireball projectile
  const isFireball = projectile.projectile_type === 'homing_sphere';
  
  if (isFireball) {
    return (
      <group ref={meshRef}>
        <FireBall 
          position={[0, 0, 0]} 
          scale={1.2} 
          intensity={1.0} 
        />
      </group>
    );
  }

  // Default projectile rendering for non-fireball types
  return (
    <mesh ref={meshRef} castShadow>
      <sphereGeometry args={[0.3, 16, 16]} />
      <meshStandardMaterial 
        color={'#ffffff'}
        emissive={'#000000'}
        emissiveIntensity={0.5}
      />
    </mesh>
  );
}

/**
 * Vibe Coding Starter Pack: 3D Multiplayer - lib.rs
 * 
 * Main entry point for the SpacetimeDB module. This file contains:
 * 
 * 1. Database Schema:
 *    - PlayerData: Active player information
 *    - LoggedOutPlayerData: Persistent data for disconnected players
 *    - GameTickSchedule: Periodic update scheduling
 * 
 * 2. Reducer Functions (Server Endpoints):
 *    - init: Module initialization and game tick scheduling
 *    - identity_connected/disconnected: Connection lifecycle management
 *    - register_player: Player registration with username and character class
 *    - update_player_input: Processes player movement and state updates
 *    - game_tick: Periodic update for game state (scheduled)
 * 
 * 3. Table Structure:
 *    - All tables use Identity as primary keys where appropriate
 *    - Connection between tables maintained through identity references
 * 
 * When modifying:
 *    - Table changes require regenerating TypeScript bindings
 *    - Add `public` tag to tables that need client access
 *    - New reducers should follow naming convention and error handling patterns
 *    - Game logic should be placed in separate modules (like player_logic.rs)
 *    - Extend game_tick for gameplay systems that need periodic updates
 * 
 * Related files:
 *    - common.rs: Shared data structures used in table definitions
 *    - player_logic.rs: Player movement and state update calculations
 */

// Declare modules
mod common;
mod player_logic;

use spacetimedb::{ReducerContext, Identity, Table, Timestamp, ScheduleAt};
use std::time::Duration; // Import standard Duration

// Use items from common module (structs are needed for table definitions)
use crate::common::{Vector3, InputState};

// --- Schema Definitions ---

#[spacetimedb::table(name = player, public)]
#[derive(Clone)]
pub struct PlayerData {
    #[primary_key]
    identity: Identity,
    username: String,
    character_class: String,
    position: Vector3,
    rotation: Vector3,
    health: i32,
    max_health: i32,
    mana: i32,
    max_mana: i32,
    current_animation: String,
    is_moving: bool,
    is_running: bool,
    is_attacking: bool,
    is_casting: bool,
    last_input_seq: u32,
    input: InputState,
    color: String,
    vertical_velocity: f32,
    is_grounded: bool,
}

#[spacetimedb::table(name = logged_out_player)]
#[derive(Clone)]
pub struct LoggedOutPlayerData {
    #[primary_key]
    identity: Identity,
    username: String,
    character_class: String,
    position: Vector3,
    rotation: Vector3,
    health: i32,
    max_health: i32,
    mana: i32,
    max_mana: i32,
    last_seen: Timestamp,
}

#[spacetimedb::table(name = game_tick_schedule, public, scheduled(game_tick))]
pub struct GameTickSchedule {
    #[primary_key]
    #[auto_inc]
    scheduled_id: u64,
    scheduled_at: ScheduleAt,
}

#[spacetimedb::table(name = projectile, public)]
#[derive(Clone)]
pub struct ProjectileData {
    #[primary_key]
    #[auto_inc]
    id: u64,
    caster_identity: Identity,
    position: Vector3,
    target_identity: Identity,
    speed: f32,
    created_at: Timestamp,
    expires_at: Timestamp,
    projectile_type: String, // "homing_sphere", etc.
}

// --- Lifecycle Reducers ---

#[spacetimedb::reducer(init)]
pub fn init(ctx: &ReducerContext) -> Result<(), String> {
    spacetimedb::log::info!("[INIT] Initializing Vibe Multiplayer module...");
    if ctx.db.game_tick_schedule().count() == 0 {
        spacetimedb::log::info!("[INIT] Scheduling initial game tick (every 1 second)...");
        let loop_duration = Duration::from_secs(1);
        let schedule = GameTickSchedule {
            scheduled_id: 0,
            scheduled_at: ScheduleAt::Interval(loop_duration.into()),
        };
        match ctx.db.game_tick_schedule().try_insert(schedule) {
            Ok(row) => spacetimedb::log::info!("[INIT] Game tick schedule inserted successfully. ID: {}", row.scheduled_id),
            Err(e) => spacetimedb::log::error!("[INIT] FAILED to insert game tick schedule: {}", e),
        }
    } else {
        spacetimedb::log::info!("[INIT] Game tick already scheduled.");
    }
    Ok(())
}

#[spacetimedb::reducer(client_connected)]
pub fn identity_connected(ctx: &ReducerContext) {
    spacetimedb::log::info!("Client connected: {}", ctx.sender);
    // Player registration/re-joining happens in register_player reducer called by client
}

#[spacetimedb::reducer(client_disconnected)]
pub fn identity_disconnected(ctx: &ReducerContext) {
    let player_identity: Identity = ctx.sender;
    spacetimedb::log::info!("Client disconnected: {}", player_identity);
    let logout_time: Timestamp = ctx.timestamp;

    if let Some(player) = ctx.db.player().identity().find(player_identity) {
        spacetimedb::log::info!("Moving player {} to logged_out_player table.", player_identity);
        let logged_out_player = LoggedOutPlayerData {
            identity: player.identity,
            username: player.username.clone(),
            character_class: player.character_class.clone(),
            position: player.position.clone(),
            rotation: player.rotation.clone(),
            health: player.health,
            max_health: player.max_health,
            mana: player.mana,
            max_mana: player.max_mana,
            last_seen: logout_time,
        };
        ctx.db.logged_out_player().insert(logged_out_player);
        ctx.db.player().identity().delete(player_identity);
    } else {
        spacetimedb::log::warn!("Disconnect by player {} not found in active player table.", player_identity);
        if let Some(mut logged_out_player) = ctx.db.logged_out_player().identity().find(player_identity) {
            logged_out_player.last_seen = logout_time;
            ctx.db.logged_out_player().identity().update(logged_out_player);
            spacetimedb::log::warn!("Updated last_seen for already logged out player {}.", player_identity);
        }
    }
}

// --- Game Specific Reducers ---

#[spacetimedb::reducer]
pub fn register_player(ctx: &ReducerContext, username: String, character_class: String) {
    let player_identity: Identity = ctx.sender;
    spacetimedb::log::info!(
        "Registering player {} ({}) with class {}",
        username,
        player_identity,
        character_class
    );

    if ctx.db.player().identity().find(player_identity).is_some() {
        spacetimedb::log::warn!("Player {} is already active.", player_identity);
        return;
    }

    // Assign color and position based on current player count
    let player_count = ctx.db.player().iter().count();
    let colors = ["cyan", "magenta", "yellow", "lightgreen", "white", "orange"];
    let assigned_color = colors[player_count % colors.len()].to_string();
    // Simple horizontal offset for spawning, start Y at 1.0
    let spawn_position = Vector3 { x: (player_count as f32 * 5.0) - 2.5, y: 1.0, z: 0.0 };

    if let Some(logged_out_player) = ctx.db.logged_out_player().identity().find(player_identity) {
        spacetimedb::log::info!("Player {} is rejoining.", player_identity);
        let default_input = InputState {
            forward: false, backward: false, left: false, right: false,
            sprint: false, jump: false, attack: false, cast_spell: false,
            dash: false,
            sequence: 0
        };
        let rejoining_player = PlayerData {
            identity: logged_out_player.identity,
            username: logged_out_player.username.clone(),
            character_class: logged_out_player.character_class.clone(),
            position: spawn_position,
            rotation: logged_out_player.rotation.clone(),
            health: logged_out_player.health,
            max_health: logged_out_player.max_health,
            mana: logged_out_player.mana,
            max_mana: logged_out_player.max_mana,
            current_animation: "idle".to_string(),
            is_moving: false,
            is_running: false,
            is_attacking: false,
            is_casting: false,
            last_input_seq: 0,
            input: default_input,
            color: assigned_color,
            vertical_velocity: 0.0,
            is_grounded: true,
        };
        ctx.db.player().insert(rejoining_player);
        ctx.db.logged_out_player().identity().delete(player_identity);
    } else {
        spacetimedb::log::info!("Registering new player {}.", player_identity);
        let default_input = InputState {
            forward: false, backward: false, left: false, right: false,
            sprint: false, jump: false, attack: false, cast_spell: false,
            dash: false,
            sequence: 0
        };
        ctx.db.player().insert(PlayerData {
            identity: player_identity,
            username,
            character_class,
            position: spawn_position,
            rotation: Vector3 { x: 0.0, y: 0.0, z: 0.0 },
            health: 100,
            max_health: 100,
            mana: 100,
            max_mana: 100,
            current_animation: "idle".to_string(),
            is_moving: false,
            is_running: false,
            is_attacking: false,
            is_casting: false,
            last_input_seq: 0,
            input: default_input,
            color: assigned_color,
            vertical_velocity: 0.0,
            is_grounded: true,
        });
    }
}

#[spacetimedb::reducer]
pub fn update_player_input(
    ctx: &ReducerContext,
    input: InputState,
    _client_pos: Vector3,
    client_rot: Vector3,
    client_animation: String,
) {
    if let Some(mut player) = ctx.db.player().identity().find(ctx.sender) {
        player_logic::update_input_state(&mut player, input, client_rot, client_animation);
        ctx.db.player().identity().update(player);
    } else {
        spacetimedb::log::warn!("Player {} tried to update input but is not active.", ctx.sender);
    }
}

#[spacetimedb::reducer]
pub fn cast_spell(
    ctx: &ReducerContext,
    spell_name: String,
) {
    let caster_identity = ctx.sender;
    spacetimedb::log::info!("🔥 CAST_SPELL CALLED: {} casting {}", caster_identity, spell_name);
    
    // Find the caster
    spacetimedb::log::info!("🔍 Looking for caster: {}", caster_identity);
    if let Some(caster) = ctx.db.player().identity().find(caster_identity) {
        spacetimedb::log::info!("✅ Found caster: {}", caster_identity);
        
        spacetimedb::log::info!("Player {} cast {}", caster_identity, spell_name);
        
        // Find nearest player (excluding caster)
        let mut nearest_player: Option<PlayerData> = None;
        let mut nearest_distance = f32::MAX;
        
        for player in ctx.db.player().iter() {
            if player.identity != caster_identity {
                let distance = calculate_distance(&caster.position, &player.position);
                if distance < nearest_distance {
                    nearest_distance = distance;
                    nearest_player = Some(player.clone());
                }
            }
        }
        
        let current_time = ctx.timestamp;
        let expires_at = Timestamp::from_micros_since_unix_epoch(
            current_time.to_micros_since_unix_epoch() + 60_000_000 // 60 seconds
        );
        
        // Create homing sphere - if target found, target them; otherwise create a projectile that moves forward
        if let Some(target) = nearest_player {
            let projectile = ProjectileData {
                id: 0, // auto_inc will set this
                caster_identity,
                position: caster.position.clone(),
                target_identity: target.identity,
                speed: 15.0, // units per second
                created_at: current_time,
                expires_at,
                projectile_type: "homing_sphere".to_string(),
            };
            
            ctx.db.projectile().insert(projectile);
            spacetimedb::log::info!("Created homing sphere targeting player {}", target.identity);
        } else {
            // No other players found - create a projectile that targets a position in front of the caster
            // For single-player testing, we'll target the caster themselves so the projectile is visible
            let projectile = ProjectileData {
                id: 0, // auto_inc will set this
                caster_identity,
                position: caster.position.clone(),
                target_identity: caster_identity, // Target self for single-player testing
                speed: 15.0, // units per second
                created_at: current_time,
                expires_at,
                projectile_type: "homing_sphere".to_string(),
            };
            
            ctx.db.projectile().insert(projectile);
            spacetimedb::log::info!("Created homing sphere targeting self (single-player mode)");
        }
    } else {
        spacetimedb::log::warn!("Player {} tried to cast spell but is not active.", caster_identity);
    }
}

// Helper function to calculate distance between two points
fn calculate_distance(pos1: &Vector3, pos2: &Vector3) -> f32 {
    let dx = pos1.x - pos2.x;
    let dy = pos1.y - pos2.y;
    let dz = pos1.z - pos2.z;
    (dx * dx + dy * dy + dz * dz).sqrt()
}

#[spacetimedb::reducer(update)]
pub fn game_tick(ctx: &ReducerContext, _tick_info: GameTickSchedule) {
    // Just use a simple log message without timestamp conversion
    let delta_time = 1.0; // Fixed 1-second tick for simplicity
    
    player_logic::update_players_logic(ctx, delta_time);
    
    // Update projectiles
    update_projectiles(ctx, delta_time);
    
    spacetimedb::log::debug!("Game tick completed");
}

// Update all projectiles - move them toward targets and handle expiration
fn update_projectiles(ctx: &ReducerContext, delta_time: f64) {
    let current_time = ctx.timestamp;
    let mut projectiles_to_delete = Vec::new();
    
    for projectile in ctx.db.projectile().iter() {
        // Debug: Log projectile lifetime info
        let time_alive = (current_time.to_micros_since_unix_epoch() - projectile.created_at.to_micros_since_unix_epoch()) as f64 / 1_000_000.0;
        let time_remaining = (projectile.expires_at.to_micros_since_unix_epoch() - current_time.to_micros_since_unix_epoch()) as f64 / 1_000_000.0;
        
        spacetimedb::log::info!(
            "🚀 Projectile {} - Alive: {:.1}s, Remaining: {:.1}s", 
            projectile.id, 
            time_alive, 
            time_remaining
        );
        
        // Check if projectile has expired
        if current_time.to_micros_since_unix_epoch() >= projectile.expires_at.to_micros_since_unix_epoch() {
            projectiles_to_delete.push(projectile.id);
            spacetimedb::log::info!("⏰ Projectile {} EXPIRED after {:.1}s", projectile.id, time_alive);
            continue;
        }
        
        // Find the target player
        if let Some(target) = ctx.db.player().identity().find(projectile.target_identity) {
            // Calculate direction to target
            let direction = Vector3 {
                x: target.position.x - projectile.position.x,
                y: target.position.y - projectile.position.y,
                z: target.position.z - projectile.position.z,
            };
            
            // Calculate distance to target
            let distance = calculate_distance(&projectile.position, &target.position);
            
            // Check if projectile reached target (within 1 unit)
            if distance <= 1.0 {
                projectiles_to_delete.push(projectile.id);
                spacetimedb::log::info!("🎯 Projectile {} HIT target {} at distance {:.2}", projectile.id, target.identity, distance);
                
                // Apply 10hp damage to target (prevent self-damage)
                if target.identity != projectile.caster_identity {
                    let new_health = (target.health - 10).max(0);
                    let mut updated_target = target.clone();
                    updated_target.health = new_health;
                    ctx.db.player().identity().update(updated_target);
                    
                    spacetimedb::log::info!(
                        "Projectile {} dealt 10 damage to player {} (health: {} -> {})", 
                        projectile.id, 
                        target.identity, 
                        target.health, 
                        new_health
                    );
                } else {
                    spacetimedb::log::info!("Projectile {} hit caster {} - no self-damage", projectile.id, target.identity);
                }
                
                continue;
            }
            
            // Normalize direction vector
            let magnitude = (direction.x * direction.x + direction.y * direction.y + direction.z * direction.z).sqrt();
            if magnitude > 0.01 {
                let normalized_direction = Vector3 {
                    x: direction.x / magnitude,
                    y: direction.y / magnitude,
                    z: direction.z / magnitude,
                };
                
                // Move projectile toward target
                let movement_distance = projectile.speed * delta_time as f32;
                let new_position = Vector3 {
                    x: projectile.position.x + normalized_direction.x * movement_distance,
                    y: projectile.position.y + normalized_direction.y * movement_distance,
                    z: projectile.position.z + normalized_direction.z * movement_distance,
                };
                
                // Update projectile position
                let mut updated_projectile = projectile.clone();
                updated_projectile.position = new_position;
                ctx.db.projectile().id().update(updated_projectile);
            }
        } else {
            // Target player no longer exists, remove projectile
            projectiles_to_delete.push(projectile.id);
            spacetimedb::log::info!("👻 Projectile {} TARGET NO LONGER EXISTS (target_identity: {})", projectile.id, projectile.target_identity);
        }
    }
    
    // Clean up expired/hit projectiles
    for projectile_id in projectiles_to_delete {
        ctx.db.projectile().id().delete(projectile_id);
    }
}

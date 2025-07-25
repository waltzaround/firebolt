/**
 * PlayerUI.tsx
 * 
 * This component renders the player's heads-up display (HUD) interface:
 * 
 * Key functionality:
 * - Displays player health and mana bars with visual indicators
 * - Implements damage feedback effects (screen flash when damaged)
 * - Shows player status information (name, health/mana values)
 * - Tracks health changes to trigger visual feedback
 * 
 * Props:
 * - playerData: Contains player state information including health, mana, and username
 * 
 * Technical implementation:
 * - Uses React state to track health changes and trigger animations
 * - Implements CSS-based visual effects for damage feedback
 * - Calculates health/mana percentages for bar visualization
 * - Conditionally renders elements based on player state
 * 
 * Related files:
 * - App.tsx: Parent component that provides player data
 * - Player.tsx: Character component that relates to this UI
 * - common.css: Contains animation definitions for damage flash
 */

import React, { useState, useEffect, useCallback } from 'react';
import { PlayerData } from '../generated';
import * as moduleBindings from '../generated';

interface PlayerUIProps {
  playerData: PlayerData | null;
  connection: moduleBindings.DbConnection | null;
}

interface Spell {
  id: number;
  name: string;
  manaCost: number;
  cooldown: number;
  description: string;
}

// Spell data - you can customize these spells
const spells: Spell[] = [
  { id: 1, name: 'Fireball', manaCost: 25, cooldown: 3, description: 'Launch a fiery projectile' },
  { id: 2, name: 'Ice Shard', manaCost: 20, cooldown: 2, description: 'Freeze and damage enemies' },
  { id: 3, name: 'Lightning Bolt', manaCost: 30, cooldown: 4, description: 'Strike with electric energy' },
  { id: 4, name: 'Heal', manaCost: 35, cooldown: 5, description: 'Restore health points' },
  { id: 5, name: 'Shield', manaCost: 40, cooldown: 8, description: 'Temporary damage protection' },
  { id: 6, name: 'Teleport', manaCost: 50, cooldown: 10, description: 'Instantly move to target location' }
];

// Random incantation words for spell casting
const incantationWords = [
  'Ignis', 'Aqua', 'Terra', 'Ventus', 'Lux', 'Umbra', 'Glacies', 'Fulmen',
  'Vita', 'Mors', 'Tempus', 'Spatium', 'Vis', 'Pax', 'Bellum', 'Sapientia',
  'Fortuna', 'Virtus', 'Honor', 'Gloria', 'Magia', 'Arcanum', 'Mysterium', 'Potentia'
];



export const PlayerUI: React.FC<PlayerUIProps> = ({ playerData, connection }) => {
  const [showDamageFlash, setShowDamageFlash] = useState(false);
  const [lastHealth, setLastHealth] = useState(playerData?.health || 0);
  const [selectedSpell, setSelectedSpell] = useState<number | null>(null);
  const [showSpellCasting, setShowSpellCasting] = useState(false);
  const [currentIncantation, setCurrentIncantation] = useState('');
  const [userInput, setUserInput] = useState('');
  const [castingSpell, setCastingSpell] = useState<Spell | null>(null);
  
  // Debug logging
  // console.log('PlayerUI rendering with playerData:', playerData);
  
  // Check for damage taken and trigger damage flash effect
  useEffect(() => {
    if (!playerData) return;
    
    const currentHealth = playerData.health;
    
    // If health decreased, show damage flash
    if (currentHealth < lastHealth) {
      setShowDamageFlash(true);
      
      // Remove flash after animation completes
      const timer = setTimeout(() => {
        setShowDamageFlash(false);
      }, 300); // Match CSS animation duration
      
      return () => clearTimeout(timer);
    }
    
    // Update last health value
    setLastHealth(currentHealth);
  }, [playerData?.health, lastHealth]);

  // Function to start spell casting
  const startSpellCasting = useCallback((spell: Spell) => {
    console.log('🔮 Starting spell casting for:', spell.name);
    if (!spell) return;
    
    setCastingSpell(spell);
    setCurrentIncantation(incantationWords[Math.floor(Math.random() * incantationWords.length)]);
    setShowSpellCasting(true);
    console.log('🔮 Spell casting UI shown, incantation set');
    setSelectedSpell(spell.id);
  }, []);

  // Function to handle spell casting completion
  const completeSpellCasting = () => {
    console.log('🎯 completeSpellCasting called');
    console.log('🎯 userInput:', `"${userInput}"`, 'length:', userInput.length);
    console.log('🎯 currentIncantation:', `"${currentIncantation}"`, 'length:', currentIncantation.length);
    console.log('🎯 userInput.toLowerCase():', `"${userInput.toLowerCase()}"`);
    console.log('🎯 currentIncantation.toLowerCase():', `"${currentIncantation.toLowerCase()}"`);
    console.log('🎯 castingSpell:', castingSpell);
    console.log('🎯 connection:', !!connection);
    
    const userInputTrimmed = userInput.trim().toLowerCase();
    const incantationTrimmed = currentIncantation.trim().toLowerCase();
    console.log('🎯 After trim - userInput:', `"${userInputTrimmed}"`, 'incantation:', `"${incantationTrimmed}"`);
    console.log('🎯 Match result:', userInputTrimmed === incantationTrimmed);
    
    if (userInputTrimmed === incantationTrimmed) {
      console.log(`✅ Successfully cast ${castingSpell?.name}!`);
      
      // Call server-side spell casting reducer
      if (connection && castingSpell) {
        try {
          console.log('🚀 About to call cast_spell reducer...');
          
          // Use the correct SpacetimeDB API to call the reducer
          connection.reducers.castSpell(castingSpell.name);
          
          console.log(`✅ Called server cast_spell reducer for ${castingSpell.name}`);
        } catch (error) {
          console.error('❌ Failed to call cast_spell reducer:', error);
        }
      } else {
        console.warn('⚠️ Cannot cast spell - no connection or spell data');
      }
    } else {
      console.log('❌ Spell casting failed - incorrect incantation');
    }
    
    // Reset casting state
    setShowSpellCasting(false);
    setCurrentIncantation('');
    setUserInput('');
    setCastingSpell(null);
    setSelectedSpell(null);
  };

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUserInput(value);
    console.log('📝 Input changed to:', `"${value}"`);
  };

  // Handle input key events
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      completeSpellCasting();
    } else if (e.key === 'Escape') {
      // Cancel spell casting
      setShowSpellCasting(false);
      setCurrentIncantation('');
      setUserInput('');
      setCastingSpell(null);
      setSelectedSpell(null);
    }
  };

  // Handle keyboard events for spell selection
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't handle spell casting if user is typing in an input field or already casting
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true' || showSpellCasting) {
        return;
      }
      
      const key = event.key;
      
      // Check if number keys 1-6 are pressed
      if (['1', '2', '3', '4', '5', '6'].includes(key)) {
        const spellNumber = parseInt(key);
        const spell = spells.find(s => s.id === spellNumber);
        
        if (spell) {
          startSpellCasting(spell);
          // Prevent the number from being typed elsewhere
          event.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [startSpellCasting, showSpellCasting]);
  
  // Don't render if no player data
  if (!playerData) {
    console.log('PlayerUI: No playerData, not rendering');
    return null;
  }
  
  // console.log('PlayerUI: Rendering with player:', playerData.username, 'HP:', playerData.health, 'MP:', playerData.mana);
  
  // Calculate health and mana percentages
  const healthPercent = (playerData.health / playerData.maxHealth) * 100;
  const manaPercent = (playerData.mana / playerData.maxMana) * 100;
  
  return (
    <>
      {/* Health and mana bars */}
      <div className="health-bar-container">
        <div 
          className="health-bar"
          style={{ width: `${healthPercent}%` }}
        />
      </div>
      
      <div className="mana-bar-container">
        <div 
          className="mana-bar"
          style={{ width: `${manaPercent}%` }}
        />
      </div>
      
      {/* Damage flash overlay */}
      {showDamageFlash && (
        <div className="damage-overlay damage-flash" />
      )}
      
      {/* Player status text */}
      <div className="player-status">
        <div className="player-name">{playerData.username}</div>
        <div className="player-health">HP: {playerData.health}/{playerData.maxHealth}</div>
        <div className="player-mana">MP: {playerData.mana}/{playerData.maxMana}</div>
      </div>
      {/* Permanent Spellsheet Toolbar */}
      <div className="spellsheet-toolbar">
        {spells.map((spell) => (
          <div 
            key={spell.id}
            className={`spell-slot-toolbar ${
              selectedSpell === spell.id ? 'selected' : ''
            } ${
              playerData.mana < spell.manaCost ? 'insufficient-mana' : ''
            }`}
            title={`${spell.name} - ${spell.description} (MP: ${spell.manaCost}, CD: ${spell.cooldown}s)`}
            onClick={() => startSpellCasting(spell)}
          >
            <div className="spell-number-toolbar">{spell.id}</div>
            <div className="spell-icon">🔥</div>
          </div>
        ))}
      </div>

      {/* Compact Spell Casting Input */}
      {showSpellCasting && (
        <div className="spell-casting-compact">
          <div className="spell-casting-info">
            <div className="casting-spell-name">Casting: {castingSpell?.name}</div>
            <div className="incantation-display">"{currentIncantation}"</div>
          </div>
          <div className="spell-input-container">
            <input
              type="text"
              value={userInput}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              placeholder="Type the incantation..."
              className="spell-input"
              autoFocus
            />
          </div>
          <div className="spell-hints">
            <span>Type the word above • <kbd>Enter</kbd> to cast • <kbd>Esc</kbd> to cancel</span>
          </div>
        </div>
      )}

    </>
  );
}; 
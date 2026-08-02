// ─────────────────────────────────────────────────────────────
// Ability labels — the six classic D&D abilities renamed for the
// tavern-wake setting (see CharacterCreationPanel). Shared by the
// creation builder and the detailed stats panel so they agree.
// ─────────────────────────────────────────────────────────────
import type { Ability } from './types';

export const ABILITY_LABELS: Record<Ability, string> = {
  str: 'Beef',
  dex: 'Slippery',
  con: 'Iron Liver',
  int: 'Book Smarts',
  wis: 'Horse Sense',
  cha: 'Bravado',
};

export const ABILITY_HINTS: Record<Ability, string> = {
  str: 'Melee power, carry, shove',
  dex: 'Accuracy, dodge, initiative',
  con: 'Hit points, can hold his ale',
  int: 'Arcane skill, actually knowing things',
  wis: 'Perception, willpower, do not pet the rat',
  cha: 'Persuasion, intimidation, bluffing the bouncer',
};

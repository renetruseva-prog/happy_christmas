// tweakable numbers and names, in one place

// Blender's glTF exporter multiplies light watts by 683 (lm/W); undo that so the
// lights match the Blender render.
export const LIGHT_SCALE = 0.4 / 683;

// the baked lighting texture is saved at half brightness (see the bake step in Blender)
export const BAKE_BOOST = 2;

// camera: farthest it may orbit, and the room's inside (walls at x ±2.5, z ±2,
// floor 0, ceiling 2.7) minus a margin, so it never reaches a wall, the window,
// the ceiling beams or the floor
export const MAX_DISTANCE = 4;
export const ROOM_MIN = [ - 2.35, 0.15, - 1.85 ];
export const ROOM_MAX = [ 2.35, 2.45, 1.85 ];

// only these can be picked up and put in the bowl (node names from the Blender file)
export const INGREDIENTS = {
	Butter_Block: 'Butter',
	Egg_0: 'Egg',
	Egg_1: 'Egg',
	Egg_2: 'Egg',
	Flour_Bag: 'Flour',
	Sugar_Jar: 'Sugar',
};

// a held ingredient floats this high above the floor and stays within these limits
export const HOLD_HEIGHT = 1.15;
export const HOLD_X = [ - 1.2, 1.2 ];
export const HOLD_Z = [ - 0.9, 0.6 ];

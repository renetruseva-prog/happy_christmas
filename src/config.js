// tweakable numbers and names, in one place

// Blender's glTF exporter multiplies light watts by 683 (lm/W); undo that so the
// lights match the Blender render.
export const LIGHT_SCALE = 0.4 / 683;

// the hanging lamp over the table: its light and its glowing bulb, on top of LIGHT_SCALE
// (full strength washes out the bowl, so you can't see the ingredients)
export const PENDANT_LIGHT = 0.35;
export const PENDANT_BULB_GLOW = 0.3;

// the baked lighting texture is saved at half brightness (see the bake step in Blender)
export const BAKE_BOOST = 2;

// camera: farthest it may orbit, and the room's inside (walls at x ±2.5, z ±2,
// floor 0, ceiling 2.7) minus a margin, so it never reaches a wall, the window,
// the ceiling beams or the floor
export const MAX_DISTANCE = 4;
export const ROOM_MIN = [ - 2.35, 0.15, - 1.85 ];
export const ROOM_MAX = [ 2.35, 2.45, 1.85 ];

// only these can be picked up and put in the bowl (node names from the Blender file).
// action: 'pour' tips the container over the bowl, 'crack' breaks the egg into it,
// 'drop' lets the whole item fall in
export const INGREDIENTS = {
	Butter_Block: { label: 'Butter', action: 'drop' },
	Egg_0: { label: 'Egg', action: 'crack' },
	Egg_1: { label: 'Egg', action: 'crack' },
	Egg_2: { label: 'Egg', action: 'crack' },
	Flour_Bag: { label: 'Flour', action: 'pour' },
	Sugar_Jar: { label: 'Sugar', action: 'pour' },
};

// mixing: how far (in metres) the mixer has to go round the bowl while it's on to make the dough,
// and how fast it has to keep going round (radians per second) before it counts at all
export const MIX_DISTANCE = 1.6;
export const MIN_SWIRL = 1.5;

// rolling: how far (in metres) the rolling pin has to roll back and forth over the dough to make it thin
export const ROLL_DISTANCE = 1.4;

// cutting: how many cookies to cut out of the dough. The star cutters shrink to this size when
// picked up (they're big in the kitchen model), and a drawn shape can reach this far from its
// middle, so all of them fit on the rolled-out sheet
export const COOKIE_COUNT = 6;
export const CUTTER_SCALE = 0.5;
export const MAX_SHAPE_RADIUS = 0.036;

// baking: seconds in the oven. Around 20 they're underbaked, 40 is perfect and by 60 they're burnt;
// taken out before UNDERBAKED_UNTIL they count as underbaked, from BURNT_FROM as burnt
export const BAKE_PERFECT = 40;
export const UNDERBAKED_UNTIL = 30;
export const BURNT_FROM = 50;

// a held ingredient floats this high above the floor and stays within these limits
export const HOLD_HEIGHT = 1.15;
export const HOLD_X = [ - 1.2, 1.2 ];
export const HOLD_Z = [ - 0.9, 0.6 ];

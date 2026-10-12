// more christmas for the kitchen, all made in code and added on top of the model:
// - snow falling outside the window (animated)
// - frost round the edges of the window glass, and paper snowflakes hanging in it
// - a pile of presents under the tree
// - a snowman and a jar of candy canes on the counter
import * as THREE from 'three/webgpu';
import { uv, fract, step, mix, color, mx_noise_float, positionLocal, smoothstep, float } from 'three/tsl';

const RED = 0xb3202a;
const GREEN = 0x2f6b3c;
const GOLD = 0xe0a43a;
const BLUE = 0x4a74b5;
const WHITE = 0xf6f1e6;

// (a little glow of its own colour: the room is dim, and the shaded sides of small things go muddy)
const standard = ( hex, roughness = 0.7, extra = {} ) => new THREE.MeshStandardNodeMaterial( { color: hex, roughness, emissive: hex, emissiveIntensity: 0.16, ...extra } );

// A soft dark patch under something, where it touches a surface. The kitchen's surfaces are
// pre-lit (baked) so they don't take shadows from things added on top; without this they float
let shadowTexture = null;

function contactShadow( room, x, y, z, rx, rz, opacity = 0.5 ) {

	if ( ! shadowTexture ) {

		const canvas = document.createElement( 'canvas' );
		canvas.width = canvas.height = 64;
		const g = canvas.getContext( '2d' );
		const gradient = g.createRadialGradient( 32, 32, 0, 32, 32, 32 );
		gradient.addColorStop( 0, 'rgba(0,0,0,1)' );
		gradient.addColorStop( 0.5, 'rgba(0,0,0,0.55)' );
		gradient.addColorStop( 1, 'rgba(0,0,0,0)' );
		g.fillStyle = gradient;
		g.fillRect( 0, 0, 64, 64 );
		shadowTexture = new THREE.CanvasTexture( canvas );

	}

	const material = new THREE.MeshBasicNodeMaterial( { map: shadowTexture, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: - 2 } );
	const patch = new THREE.Mesh( new THREE.PlaneGeometry( rx * 2, rz * 2 ).rotateX( - Math.PI / 2 ), material );
	patch.position.set( x, y + 0.0015, z );
	patch.name = 'Contact_Shadow';
	room.add( patch );

}

let snow = null; // { mesh, flakes: [...] } (see addSnow)
const camera = { current: null };

export function addChristmas( room, scene, viewCamera ) {

	camera.current = viewCamera;
	addSnow( scene );
	addFrost( room );
	addPaperSnowflakes( room );
	addPresents( room );
	addSnowman( room );
	addCandyCaneJar( room );

}

// ---------- snow outside the window ----------
// Flakes drift down in the space between the wall and the painted sky behind the window. The
// walls hide them from inside the room, so only the window shows them. They're drawn as little
// soft dots that always face the player
const FLAKES = 650;
const SNOW_AREA = { x: [ - 2.3, 0.3 ], y: [ 1.0, 2.8 ], z: [ - 3.05, - 2.22 ] };

function softDot() {

	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = 64;
	const g = canvas.getContext( '2d' );
	const gradient = g.createRadialGradient( 32, 32, 0, 32, 32, 32 );
	gradient.addColorStop( 0, 'rgba(255,255,255,1)' );
	gradient.addColorStop( 0.45, 'rgba(255,255,255,0.8)' );
	gradient.addColorStop( 1, 'rgba(255,255,255,0)' );
	g.fillStyle = gradient;
	g.fillRect( 0, 0, 64, 64 );
	const texture = new THREE.CanvasTexture( canvas );
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;

}

function addSnow( scene ) {

	const material = new THREE.MeshBasicNodeMaterial( { map: softDot(), transparent: true, depthWrite: false } );
	const mesh = new THREE.InstancedMesh( new THREE.PlaneGeometry( 1, 1 ), material, FLAKES );
	mesh.frustumCulled = false;
	mesh.name = 'Snow';

	const flakes = Array.from( { length: FLAKES }, () => ( {
		x: THREE.MathUtils.lerp( SNOW_AREA.x[ 0 ], SNOW_AREA.x[ 1 ], Math.random() ),
		y: THREE.MathUtils.lerp( SNOW_AREA.y[ 0 ], SNOW_AREA.y[ 1 ], Math.random() ),
		z: THREE.MathUtils.lerp( SNOW_AREA.z[ 0 ], SNOW_AREA.z[ 1 ], Math.random() ),
		fall: 0.12 + Math.random() * 0.2, // metres a second
		sway: 0.03 + Math.random() * 0.07, // how far it drifts from side to side
		rate: 0.6 + Math.random() * 1.4,
		phase: Math.random() * 6.3,
		size: 0.012 + Math.random() * 0.02,
	} ) );

	scene.add( mesh );
	snow = { mesh, flakes, matrix: new THREE.Matrix4(), position: new THREE.Vector3(), scale: new THREE.Vector3() };

}

// every frame
export function updateChristmas( dt, t ) {

	if ( ! snow ) return;

	const { mesh, flakes, matrix, position, scale } = snow;
	const wind = Math.sin( t * 0.23 ) * 0.04; // the whole snowfall leans one way, then the other
	const quaternion = camera.current.quaternion;

	for ( let i = 0; i < FLAKES; i ++ ) {

		const f = flakes[ i ];
		f.y -= f.fall * dt;
		f.x += wind * dt;
		if ( f.y < SNOW_AREA.y[ 0 ] ) {

			// back to the top, somewhere new
			f.y = SNOW_AREA.y[ 1 ];
			f.x = THREE.MathUtils.lerp( SNOW_AREA.x[ 0 ], SNOW_AREA.x[ 1 ], Math.random() );

		}

		if ( f.x > SNOW_AREA.x[ 1 ] ) f.x = SNOW_AREA.x[ 0 ];
		if ( f.x < SNOW_AREA.x[ 0 ] ) f.x = SNOW_AREA.x[ 1 ];

		position.set( f.x + Math.sin( t * f.rate + f.phase ) * f.sway, f.y, f.z );
		scale.setScalar( f.size );
		mesh.setMatrixAt( i, matrix.compose( position, quaternion, scale ) );

	}

	mesh.instanceMatrix.needsUpdate = true;

}

// ---------- the window ----------
const WINDOW = { x: - 1.0, y: 1.65, width: 1.4, height: 1.0, z: - 2.0 }; // the glass

// frost creeping in from the edges of the glass: white, crystalline, thickest in the corners
function addFrost( room ) {

	const edge = uv().sub( 0.5 ).abs().max( 0 ); // 0 in the middle .. 0.5 at the edge
	const nearEdge = smoothstep( 0.2, 0.5, edge.x.max( edge.y ) ); // 1 at the very edge
	const crystals = mx_noise_float( positionLocal.mul( 38 ) ).mul( 0.5 ).add( 0.5 );
	const bigger = mx_noise_float( positionLocal.mul( 9 ) ).mul( 0.5 ).add( 0.5 );

	const material = new THREE.MeshBasicNodeMaterial( { transparent: true, depthWrite: false } );
	material.colorNode = mix( color( 0xdfeaff ), color( 0xffffff ), crystals );
	material.opacityNode = nearEdge.mul( float( 0.35 ).add( crystals.mul( 0.4 ) ) ).mul( float( 0.5 ).add( bigger ) ).clamp( 0, 0.85 );

	const frost = new THREE.Mesh( new THREE.PlaneGeometry( WINDOW.width, WINDOW.height ), material );
	frost.position.set( WINDOW.x, WINDOW.y, WINDOW.z + 0.004 );
	frost.name = 'Window_Frost';
	frost.renderOrder = 1;
	room.add( frost );

}

// a flat paper snowflake: six arms, each with two little side branches
function snowflake( size ) {

	const group = new THREE.Group();
	const paper = new THREE.MeshStandardNodeMaterial( { color: 0xf4f7ff, roughness: 0.9, side: THREE.DoubleSide, emissive: 0x7f9bd0, emissiveIntensity: 0.18 } );
	const bar = ( length, width, x, y, angle ) => {

		const mesh = new THREE.Mesh( new THREE.PlaneGeometry( length, width ), paper );
		mesh.position.set( x, y, 0 );
		mesh.rotation.z = angle;
		group.add( mesh );

	};

	for ( let arm = 0; arm < 6; arm ++ ) {

		const a = arm * Math.PI / 3;
		const dx = Math.cos( a );
		const dy = Math.sin( a );
		bar( size * 0.5, size * 0.045, dx * size * 0.25, dy * size * 0.25, a ); // the arm

		// two little branches on it, pointing outwards
		for ( const along of [ 0.28, 0.42 ] ) {

			const bx = dx * size * along;
			const by = dy * size * along;
			const branch = size * 0.14 * ( 1.2 - along );
			bar( branch, size * 0.035, bx + Math.cos( a + 0.8 ) * branch * 0.5, by + Math.sin( a + 0.8 ) * branch * 0.5, a + 0.8 );
			bar( branch, size * 0.035, bx + Math.cos( a - 0.8 ) * branch * 0.5, by + Math.sin( a - 0.8 ) * branch * 0.5, a - 0.8 );

		}

	}

	return group;

}

// snowflakes hanging on threads in the window
function addPaperSnowflakes( room ) {

	const thread = new THREE.MeshBasicNodeMaterial( { color: 0xe8e2d0 } );
	const hang = [
		{ x: - 1.36, y: 1.72, size: 0.2, tilt: 0.2 },
		{ x: - 0.62, y: 1.52, size: 0.17, tilt: - 0.3 },
		{ x: - 0.7, y: 1.9, size: 0.12, tilt: 0.5 },
		{ x: - 1.38, y: 1.4, size: 0.12, tilt: - 0.1 },
	];

	for ( const { x, y, size, tilt } of hang ) {

		const flake = snowflake( size );
		flake.position.set( x, y, WINDOW.z + 0.012 );
		flake.rotation.z = tilt;
		flake.name = 'Paper_Snowflake';
		room.add( flake );

		// the thread it hangs from, up to the top of the window
		const top = 2.09;
		const length = top - ( y + size * 0.5 );
		const line = new THREE.Mesh( new THREE.CylinderGeometry( 0.0012, 0.0012, length, 4 ), thread );
		line.position.set( x, y + size * 0.5 + length / 2, WINDOW.z + 0.012 );
		room.add( line );

	}

}

// ---------- presents under the tree ----------
function gift( w, h, d, boxColor, ribbonColor ) {

	const group = new THREE.Group();
	const box = standard( boxColor, 0.55 );
	const ribbon = standard( ribbonColor, 0.45 );

	group.add( new THREE.Mesh( new THREE.BoxGeometry( w, h, d ), box ) );
	group.add( new THREE.Mesh( new THREE.BoxGeometry( w * 0.2, h * 1.01, d * 1.01 ), ribbon ) ); // the ribbon across
	group.add( new THREE.Mesh( new THREE.BoxGeometry( w * 1.01, h * 1.01, d * 0.2 ), ribbon ) ); // and the other way

	// the bow on top: two loops and a knot
	for ( const side of [ - 1, 1 ] ) {

		const loop = new THREE.Mesh( new THREE.TorusGeometry( w * 0.12, w * 0.035, 8, 16 ), ribbon );
		loop.position.set( side * w * 0.11, h / 2 + w * 0.08, 0 );
		loop.rotation.set( 0, 0, side * 0.5 );
		loop.scale.set( 1, 1.25, 1 );
		group.add( loop );

	}

	const knot = new THREE.Mesh( new THREE.SphereGeometry( w * 0.06, 10, 8 ), ribbon );
	knot.position.y = h / 2 + w * 0.04;
	group.add( knot );

	group.traverse( ( o ) => { if ( o.isMesh ) o.castShadow = o.receiveShadow = true; } );
	return group;

}

function addPresents( room ) {

	// around the foot of the tree (its pot is at about 1.8, 0.35), mostly on the side facing the room
	const presents = [
		{ x: 1.38, z: 0.72, w: 0.17, h: 0.13, d: 0.17, yaw: 0.3, box: RED, ribbon: GOLD },
		{ x: 1.58, z: 0.98, w: 0.21, h: 0.17, d: 0.15, yaw: - 0.35, box: GREEN, ribbon: RED },
		{ x: 1.86, z: 1.0, w: 0.15, h: 0.12, d: 0.15, yaw: 0.2, box: BLUE, ribbon: WHITE },
		{ x: 2.12, z: 0.9, w: 0.2, h: 0.15, d: 0.18, yaw: - 0.5, box: GOLD, ribbon: RED },
		{ x: 1.3, z: 0.42, w: 0.14, h: 0.11, d: 0.14, yaw: 0.9, box: WHITE, ribbon: GREEN },
		{ x: 1.7, z: 0.8, w: 0.11, h: 0.1, d: 0.11, yaw: 0.6, box: RED, ribbon: WHITE },
	];

	for ( const p of presents ) {

		const g = gift( p.w, p.h, p.d, p.box, p.ribbon );
		g.position.set( p.x, p.h / 2, p.z );
		g.rotation.y = p.yaw;
		g.name = 'Present';
		room.add( g );
		contactShadow( room, p.x, 0, p.z, Math.max( p.w, p.d ) * 0.85, Math.max( p.w, p.d ) * 0.85, 0.55 );

	}

}

// ---------- the counter ----------
const COUNTER_TOP = 0.91;

function addSnowman( room ) {

	const snowWhite = standard( WHITE, 0.95 );
	const coal = standard( 0x1c1814, 0.6 );
	const group = new THREE.Group();
	const ball = ( r, y ) => {

		const m = new THREE.Mesh( new THREE.SphereGeometry( r, 20, 14 ), snowWhite );
		m.position.y = y;
		group.add( m );

	};

	ball( 0.05, 0.045 );
	ball( 0.038, 0.115 );
	ball( 0.027, 0.17 );

	// face, buttons, scarf, hat
	for ( const x of [ - 0.009, 0.009 ] ) {

		const eye = new THREE.Mesh( new THREE.SphereGeometry( 0.0036, 8, 6 ), coal );
		eye.position.set( x, 0.178, 0.024 );
		group.add( eye );

	}

	for ( const y of [ 0.105, 0.13, 0.08 ] ) {

		const button = new THREE.Mesh( new THREE.SphereGeometry( 0.004, 8, 6 ), coal );
		button.position.set( 0, y, y > 0.1 ? 0.037 : 0.049 );
		group.add( button );

	}

	const nose = new THREE.Mesh( new THREE.ConeGeometry( 0.0045, 0.028, 10 ).rotateX( Math.PI / 2 ), standard( 0xe8731a, 0.6 ) );
	nose.position.set( 0, 0.17, 0.037 );
	group.add( nose );

	const scarf = new THREE.Mesh( new THREE.TorusGeometry( 0.03, 0.009, 8, 20 ), standard( RED, 0.8 ) );
	scarf.position.y = 0.143;
	scarf.rotation.x = Math.PI / 2;
	group.add( scarf );
	const tail = new THREE.Mesh( new THREE.BoxGeometry( 0.014, 0.04, 0.008 ), standard( RED, 0.8 ) );
	tail.position.set( 0.02, 0.12, 0.028 );
	tail.rotation.z = 0.15;
	group.add( tail );

	const hat = new THREE.Group();
	hat.position.y = 0.195;
	hat.add( new THREE.Mesh( new THREE.CylinderGeometry( 0.032, 0.032, 0.004, 20 ), coal ) ); // (the brim)
	const crown = new THREE.Mesh( new THREE.CylinderGeometry( 0.02, 0.02, 0.04, 20 ), coal );
	crown.position.y = 0.022;
	hat.add( crown );
	const band = new THREE.Mesh( new THREE.CylinderGeometry( 0.0205, 0.0205, 0.009, 20 ), standard( RED, 0.7 ) );
	band.position.y = 0.01;
	hat.add( band );
	group.add( hat );

	group.traverse( ( o ) => { if ( o.isMesh ) o.castShadow = true; } );
	group.position.set( - 1.7, COUNTER_TOP, - 1.62 );
	group.rotation.y = 0.35;
	group.name = 'Snowman';
	room.add( group );
	contactShadow( room, - 1.7, COUNTER_TOP, - 1.62, 0.07, 0.07, 0.6 );

}

// a candy cane: a curved tube with red and white stripes
function candyCane() {

	const points = [];
	for ( let i = 0; i <= 8; i ++ ) points.push( new THREE.Vector3( 0, - 0.15 + 0.15 * ( i / 8 ), 0 ) ); // the straight part
	for ( let i = 1; i <= 12; i ++ ) {

		const a = Math.PI * ( i / 12 );
		points.push( new THREE.Vector3( 0.03 - Math.cos( a ) * 0.03, Math.sin( a ) * 0.03, 0 ) ); // the hook

	}

	const material = new THREE.MeshStandardNodeMaterial( { roughness: 0.35 } );
	material.colorNode = mix( color( 0xf8f3ea ), color( 0xc4222c ), step( 0.5, fract( uv().x.mul( 22 ).add( uv().y ) ) ) );
	const mesh = new THREE.Mesh( new THREE.TubeGeometry( new THREE.CatmullRomCurve3( points ), 60, 0.0065, 10 ), material );
	mesh.castShadow = true;
	return mesh;

}

// candy canes in a glass jar
function addCandyCaneJar( room ) {

	const group = new THREE.Group();

	const glass = new THREE.MeshStandardNodeMaterial( { color: 0xdfeff2, roughness: 0.08, transparent: true, opacity: 0.32 } );
	const jar = new THREE.Mesh( new THREE.CylinderGeometry( 0.045, 0.04, 0.095, 24, 1, true ), glass );
	jar.position.y = 0.0475;
	group.add( jar );
	const bottom = new THREE.Mesh( new THREE.CircleGeometry( 0.04, 24 ).rotateX( - Math.PI / 2 ), glass );
	bottom.position.y = 0.002;
	group.add( bottom );

	// the canes lean out of it at different angles
	const spread = [
		{ lean: 0.0, turn: 0.4, rise: 0.255 },
		{ lean: 0.2, turn: 2.2, rise: 0.235 },
		{ lean: - 0.22, turn: 3.7, rise: 0.245 },
		{ lean: 0.15, turn: 5.2, rise: 0.225 },
		{ lean: - 0.12, turn: 1.3, rise: 0.215 },
	];

	for ( const { lean, turn, rise } of spread ) {

		const holder = new THREE.Group();
		holder.position.set( Math.sin( turn ) * 0.012, 0.01, Math.cos( turn ) * 0.012 );
		holder.rotation.set( lean, turn, lean * 0.6, 'YXZ' );
		const cane = candyCane();
		cane.position.y = rise - 0.01; // the hook's top is at this height
		holder.add( cane );
		group.add( holder );

	}

	group.position.set( - 1.38, COUNTER_TOP, - 1.64 );
	group.name = 'Candy_Cane_Jar';
	room.add( group );
	contactShadow( room, - 1.38, COUNTER_TOP, - 1.64, 0.075, 0.075, 0.5 );

}

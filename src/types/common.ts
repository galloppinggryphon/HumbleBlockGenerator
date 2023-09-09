type Coordinates = [x: number, y: number, z: number];

/**
 * e: east, w: west, n: north, s: south, t: top, bottom: bottom
 */
type UnitCubeTransformAnchors =
	| "wbs"
	| "wbn"
	| "wts"
	| "wtn"
	| "ebs"
	| "ebn"
	| "etn"
	| "ets";

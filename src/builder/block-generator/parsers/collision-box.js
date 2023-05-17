/* eslint-disable camelcase */
'use strict'
import {
	reducer,
} from '../../../lib/utils.js'
import { logger } from '../../generator-config.js'
import {
	hasPrefix,
	unPrefix,
} from '../../builder-utils.js'

/**
 * Transform math expressions in block_collision/selection_box coordinates.
 *
 * param {{origin: Coordinates, size: Coordinates, anchor?: UnitCubeTransformAnchors}} collisionBox
 * @param {string} propertyKey
 */
export function parseCollisionBox( source, props, propertyKey ) {
	const collisionBox = { ...source[ propertyKey ] }

	reducer( collisionBox, ( result, [ key, coordinates ] ) => {
		if ( ! [ 'origin', 'size' ].includes( key ) ) {
			return result
		}

		if ( ! Array.isArray( coordinates ) ) {
			const errType = hasPrefix.variable( coordinates )
				? `Found an unevaluated variable: '${ coordinates }'.`
				: `Expected [x,y,z].`

			logger.error( `Cannot parse data for the '${ key }' key of the '${ propertyKey }' property. ${ errType }`, { [ key ]: coordinates } )

			result[ key ] = `INVALID VALUE: '${ coordinates }'`
			return result
		}

		// Parse math expressions and string numbers
		result[ key ] = coordinates.map( ( value ) => {
			if ( typeof value !== 'string' ) {
				return value
			}

			const int = parseInt( value )

			if ( ! isNaN( int ) ) {
				return int
			}

			const expr = unPrefix.expression( value )

			if ( ! expr ) {
				logger.error( `Invalid value: not a number or math expression, in '${ propertyKey }' coordinates.`, { collisionBox } )
				return
			}

			let calcVal
			try {
				calcVal = evalMathExpression( expr )
			}
			catch ( err ) {
				logger.error( `Could not evaluate math expression in '${ propertyKey }' coordinates. Did you omit the expression prefix?`, { collisionBox } )
				calcVal = `INVALID EXPRESSION: '${ expr }'`
			}
			return calcVal
		} )

		return result
	}, collisionBox )

	const { origin, size, anchor } = collisionBox

	if ( ! anchor ) {
		return collisionBox
	}

	if ( [ origin, size ].find( ( x ) => ! Array.isArray( x ) ) ) {
		return
	}

	try {
		collisionBox.origin = getUnitCubeCoordinates( origin, size, anchor )
	}
	catch ( err ) {
		logger.error( err.message, { [ propertyKey ]: collisionBox } )
		return
	}

	delete collisionBox.anchor

	return collisionBox
}

/**
 * Translate 0-based coordinates to unit cube coordinates.
 *
 * @param {Coordinates} origin
 * @param {Coordinates} [size]
 * @param {UnitCubeTransformAnchors} anchor
 * @return {Coordinates}
 */
export function getUnitCubeCoordinates( origin, size = undefined, anchor = 'wbs' ) {
	if ( origin.find( ( x ) => typeof x !== 'number' ) ) {
		throw new Error( `Cannot process block size values - one or more 'origin' value is not a number. { origin: [ ${ origin } ]}` )
	}

	if ( size && origin.find( ( x ) => typeof x !== 'number' ) ) {
		throw new Error( `Cannot process block size values - one or more 'origin' value is not a number. { origin: [${ origin } ]}` )
	}

	const err = ( dim, prop, problem ) => `Invalid block size: the '${ dim }' property of the '${ prop }' variable cannot be ${ problem }.`

	origin.find( ( v, i ) => {
		const dim = [ 'x', 'y', 'z' ][ i ]
		if ( v < 0 ) {
			throw new Error( err( dim, 'origin', '< 0' ) )
		}
		if ( v > 15 ) {
			throw new Error( err( dim, 'origin', '> 15' ) )
		}
		if ( size[ i ] < 0 ) {
			throw new Error( err( dim, 'size', '< 0' ) )
		}
		if ( size[ i ] > 16 ) {
			throw new Error( err( dim, 'size', '> 16' ) )
		}
	} )

	// origin.find( ( v, i ) => {

	// 	if ( ( v + size[ i ] ) > 16 ) {
	// 		const dim = [ 'x', 'y', 'z' ][ i ]
	// 		throw new Error( `Invalid block size: origin + size for the '${ dim }' dimension is outside the unit cube!` )
	// 	}
	// } )

	const [ x, y, z ] = origin
	const [ sX, sY, sZ ] = size
	const [ aX, aY, aZ ] = [ ...anchor ]

	const coordinates = [
		calculateOrigin( 'x', x, sX, aX ), // === 'w' ),
		calculateOrigin( 'y', y, sY, aY ), // === 'b' ),
		calculateOrigin( 'z', z, sZ, aZ ), // === 's' ),
	]

	coordinates.forEach( ( v, i ) => {
		const s = size[ i ]
		const d = [ 'x', 'y', 'z' ][ i ]
		const max = i === 1 ? 16 : 8

		if ( ( v + s ) > max ) {
			throw new Error( `Invalid unit coordinates - the '${ d }' dimension is out bounds. Origin (${ v }) + size (${ s }) cannot exceed ${ max }!` )
		}
	} )

	return /** @type {any} */ ( coordinates )
}

/**
 * Calculate origin point.
 *
 * @param {string} dimension
 * @param {number} v
 * @param {number} s
 * @param {string} a
 */
function calculateOrigin( dimension, v, s, a ) {
	if ( dimension === 'y' ) {
		return a === 'b' ? v : 16 - v - s
	}

	const invert = dimension === 'x'
		? a === 'w'
		: a === 's'

	return invert
		? ( v + s - 8 ) * -1
		: ( v - 8 )
}

/**
 * Evaluate simple math expression in string. Supports `+ | - | * | /`.
 *
 * @param {string} string
 */
export function evalMathExpression( string ) {
	const stringShapeRegex = /^[+-]?((([0-9]+([.][0-9]+)?[*/]?[+-]?)+[0-9]+([.][0-9]+)?)|([0-9]+([.][0-9]+)?)+)$/g

	const x = stringShapeRegex.test( string )

	if ( ! x ) {
		throw new Error( `Not a valid math expression: '${ string }'.` )
	}

	if ( x ) {
		// eslint-disable-next-line no-eval
		const e = eval( string )
		// console.log( string, '==>', e )
		return e
	}
}

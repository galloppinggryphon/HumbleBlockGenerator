'use strict'
import _ from 'lodash'
import {
	directivePrefix,
	directives,
	logger,
	minecraftProps,
	staticPropPrefix,
	variantPrefix,
	variablePrefix,
	calculatedPropPrefix,
	expressionPrefix,
} from './generator-config.js'

import { isObj, stringHasPrefix } from '../lib/utils.js'

/**
 * Sort block props into valid root categories. Mutates source.
 */
export function sortProps( source, filterInvalid = false ) {
	const { skip, root, description, props } = minecraftProps

	const output = _.cloneDeep( props )

	return Object.entries( source ).reduce( ( result, [ key, value ] ) => {
		if ( filterInvalid && key in skip ) {
			return result
		}

		if ( root.includes( key ) ) {
			result[ key ] = value
		}
		else if ( description.includes( key ) ) {
			result.description[ key ] = value
		}
		else {
			result.components[ key ] = value
		}
		return result
	}, output )
}

/**
 * Filter object, remove keys. Alternatively, include only specified keys.
 *
 * @param {*} data
 * @param {string[]} keys
 * @param {*} include
 */
export function filterObjByKeys( data, keys, include = false ) {
	if ( ! keys.length ) {
		return data
	}

	return Object.keys( data ).reduce( ( result, key ) => {
		if ( include && ! keys.includes( key ) ) {
			delete result[ key ]
		}
		else if ( ! include && keys.includes( key ) ) {
			delete result[ key ]
		}
		return result
	}, data )
}

/**
 * Filter object by key prefix.
 *
 * @template {JSO} Source
 * @param {Source} source
 * @param {string | string[]} prefix
 * @param {boolean} [returnPrefixedProps]
 * @return {Source}
 */
export function filterPropsByKeyPrefix( source, prefix, returnPrefixedProps = true ) {
	const prefixes = [ prefix ].flat()
	const prefixedProps = Object.create( {} )
	Object.entries( source ).reduce( ( result, [ key, value ] ) => {
		for ( const p of prefixes ) {
			if ( key.slice( 0, p.length ) === p ) {
				if ( returnPrefixedProps ) {
					prefixedProps[ key ] = value
				}
				delete result[ key ]
				break
			}
		}
		return result
	}, source )
	return returnPrefixedProps ? prefixedProps : source
}

export function filterObjKeys( source, regex, { mutateSource = true } = {} ) {
	const target = mutateSource ? source : {}
	Object.entries( source ).reduce( ( result, [ key, value ] ) => {
		const match = regex.test( key )
		if ( mutateSource && match ) {
			delete result[ key ]
		}
		else if ( ! match ) {
			result[ key ] = value
		}

		return result
	}, target )
	return target
}

/**
 * Remove values from object recursively. Supports both arrays and object literals.
 *
 * Mutates source.
 *
 * @param {JSO|any[]} source
 * @param {any|any[]} removeValue
 */
export function removeObjValues( source, removeValue ) {
	const valueArr = [ removeValue ].flat()
	const parseObj = ( target, currentKey ) => {
		const currentVal = target[ currentKey ]
		if ( Object( currentVal ) === currentVal ) {
			return Object.entries( currentVal ).reduce( ( result, [ key, value ] ) => {
				parseObj( result, key )
				return result
			}, currentVal )
		}

		if ( valueArr.indexOf( currentVal ) >= 0 ) {
			delete target[ currentKey ]
		}

		return target
	}

	const result = parseObj( { __root__: source }, '__root__' )
	return result
}

export function filterObjValuesX( source, compareValue, { mutateSource = true, recursive = true } = {} ) {
	const parseEl = ( result, key, value ) => {
		if ( Array.isArray( value ) ) {
			result[ key ] = value.map( ( x, i ) => {
				if ( Object( x ) === x ) {
					value[ i ] = parseEl( value, i, x )
				}
				else {
					const match = compareValue === x
					if ( ! match ) {
						value.slice( i, i + 1 )
					}
				}
			} )
		}
		else {
			filterObjValues( result[ key ], compareValue, { recursive } )
		}
		return result
	}

	const compareVal = ( result, key, value ) => {
		const match = compareValue === value
		if ( mutateSource ) {
			if ( match ) {
				delete result[ key ]
			}
		}
		else if ( ! match ) {
			result[ key ] = value
		}
		return result
	}

	const target = mutateSource ? source : {}
	Object.entries( source ).reduce( ( result, [ key, value ] ) => {
		if ( recursive && Object( value ) === value ) {
			parseEl( result, key, value )
			return result
		}

		const newResult = compareVal( result, key, value )
		return newResult
	}, target )
	return target
}

/**
 * Merge objects. Mutates target.
 *
 * @param {*} target
 * @param {JSO|JSO[]} source
 */
export function mergeProps( target, source, { multipleSources = false, overwriteArrays = false, overwriteTarget = false, mergeKeys = [] } = {} ) {
	try {
		if ( Array.isArray( source ) ) {
			if ( multipleSources ) {
				return source.reverse().reduce( ( result, src ) => {
					return mergeProps( result, src, { multipleSources: false, overwriteArrays, overwriteTarget } )
				}, target )
			}

			return target.push( ...source )
		}

		return Object.entries( source ).reduce( ( result, [ key, value ] ) => {
			if ( overwriteTarget ) {
				result[ key ] = value
				return result
			}

			if ( Array.isArray( value ) ) {
				if ( result[ key ] === undefined ) {
					result[ key ] = []
				}

				else if ( result[ key ] === null ) {
					result[ key ] = value
				}

				else if ( ! Array.isArray( result[ key ] ) ) {
					throw new Error( 'Type mismatch: expected target property to be an array.' )
				}

				if ( overwriteArrays && ! ( mergeKeys.length && mergeKeys.includes( key ) ) ) {
					result[ key ] = value
				}
				else {
					mergeProps( result[ key ], value, { overwriteArrays } )
				}

				// result[ key ] = overwriteArrays
				// 	? value
				// 	: [ ...( result[ key ] ?? [] ), ...value ]
			}
			else if ( Object( value ) === value ) {
				if ( key in result && ! [ null, undefined ].includes( result[ key ] ) ) {
					mergeProps( result[ key ], value, { overwriteArrays, mergeKeys } )
				}
				else {
					result[ key ] = value
				}
			}
			else {
				result[ key ] = value
			}
			return result
		}, target )
	}
	catch ( err ) {
		throw new Error( err.stack )
	}
}

export function mergeObjProps( parentKey, target, source ) {
	return _.mergeWith( target, source, ( targetValue, srcValue, key ) => {
		if ( Array.isArray( srcValue ) ) {
			targetValue = targetValue === undefined ? [] : targetValue

			if ( ! Array.isArray( targetValue ) ) {
				logger.error(
					`Type mismatch - cannot add data to blockData. Expected existing data to be array, not ${ typeof targetValue }. Path: ${ parentKey }.${ key }.`,
				)
				return targetValue
			}

			return [ ...targetValue, ...srcValue ]

			// Concatenate events sequence
			if ( key === 'sequence' ) {
				return targetValue.concat( srcValue )
			}
			// Merge and deduplicate everything else

			return [ ...targetValue, ...srcValue ] // arrayDeduplicate( objValue, srcValue )
		}

		return undefined
	} )
}

export function addStringPrefix( prefix, string ) {
	return `${ prefix }:${ string }`
}

/**
 * Apply functions in order from left to right to supplied data. Each function must receive and return data in the same format.
 *
 * Utilizes Lodash flow() to apply functions.
 *
 * @template {JSO} InputObj
 * @param {InputObj} obj
 * @param  {...(input: InputObj) => InputObj} actions
 * @return {InputObj}
 */
export function applyActions( obj, ...actions ) {
	// return _.flow( ...actions )( obj )

	try {
		return _.flow( ...actions )( obj )
	}
	catch ( err ) {
		throw new Error( `\n\n${ err.stack }\n\n` )
	}
}

export function stringContainsUnresolvedRef( str, prefix = '$' ) {
	return typeof str === 'string'
		? str.slice( 0, prefix.length ) === prefix
		: undefined
}

export const prefixer = {
	computedProp: ( str ) => calculatedPropPrefix + str,
	variable: ( str ) => variablePrefix + str,
	variant: ( str ) => variantPrefix + str,
}

export const hasPrefix = {
	computedProp: ( str ) => str.slice( 0, calculatedPropPrefix.length ) === calculatedPropPrefix, //
	variable: ( str ) => str.slice( 0, variablePrefix.length ) === variablePrefix,
	variant: ( str ) => str.slice( 0, variantPrefix.length ) === variantPrefix,
	expression: ( str ) => str.slice( 0, variantPrefix.length ) === expressionPrefix,
}

export const unPrefix = {
	computedProp: ( str ) => str.slice( 0, calculatedPropPrefix.length ) === calculatedPropPrefix && str.slice( calculatedPropPrefix.length - 1 ), //
	variable: ( str ) => str.slice( 0, variablePrefix.length ) === variablePrefix && str.slice( variablePrefix.length - 1 ),
	variant: ( str ) => str.slice( 0, variantPrefix.length ) === variantPrefix && str.slice( variantPrefix.length - 1 ),
	expression: ( str ) => str.slice( 0, expressionPrefix.length ) === expressionPrefix && str.slice( expressionPrefix.length ),
}

'use strict'
import _ from 'lodash'
import { stringStartsWith } from '../../../lib/utils.js'
import { mergeKeySuffix, stringFilters } from '../../generator-config.js'

export function parseMagicKeyword( magicKeyword ) {
	const rx = stringFilters.magicKeywords
	const data = [ ...magicKeyword.matchAll( rx ) ]
	const [ __, property, divider, metaKey ] = data[ 0 ]

	let propertyName = property, variable
	if ( stringStartsWith( property, '$' ) ) {
		propertyName = property.slice( 1 )
		variable = property
	}

	const operation =
	( divider === '::' && 'meta' )
	|| ( divider === '.' && 'get' )

	const meta = {
		path: [ property ],
		magicProperty: undefined,
		operation,
		magicKeyword,
		property: propertyName,
		metaKey,
		variable,
	}

	if ( operation === 'get' ) {
		// const rx = /[[]%([\w\d_]+)[\\]]/i
		// todo: use better rx
		const rxg = /\[(.*)\]/
		const varInKey = metaKey.match( rxg )

		if ( varInKey ) {
			const varInfo = parseMagicKeyword( varInKey[ 1 ] )
			meta.magicProperty = varInfo

			return meta
		}

		meta.path = [ property, metaKey ]
	}

	return meta
}

/**
 * Parse preset keys.
 *
 * *Returns*:
 * ```
 * 'key': {string} Key excl. mergeSymbol
 * 'isVariable': {boolean} Whether key is a variable
 * 'mergeKey': {string} Key with mergeSymbol
 * 'shouldMerge': {boolean} Whether key includes the merge symbol
 * ```
 *
 * @param {string} presetKey
 */
export function parsePresetKey( presetKey ) {
	if ( ! presetKey ) {
		return
	}

	const res = presetKey.match( regexFilters.presetKeyMatch )
	const { key, prefix, suffix } = res.groups

	return {
		key,
		isVariable: !! prefix,
		mergeKey: key + mergeKeySuffix,
		shouldMerge: !! suffix,
	}
}

/**
 * Merge source and target data. Custom control of merge/overwrite operations.
 *
 * @template {JSO} Source
 * @param {Source} source
 * @param {JSO} target
 * @param {object} options
 */
export function mergePresetData( source, target, { mutate, merge } = { mutate: false, merge: false } ) {
	const _target = mutate ? target : _.cloneDeep( target )

	const srcKeys = Object.keys( source )

	// Merge arrays?
	if ( Array.isArray( source ) ) {
		if ( Array.isArray( target ) && merge ) {
			_target.push( ...source )
			return _target
		}

		return source
	}

	// Iterate over source keys and target object
	return [ ...srcKeys ].reduce( ( result, currentKey ) => {
		// Get merge instructions from source
		const { key, mergeKey, shouldMerge } = parsePresetKey( currentKey )
		srcKeys.push( key )

		if ( mergeKey in result ) {
			const tmpData = mergePresetData( { [ key ]: result[ mergeKey ] }, {} )
			result[ key ] = tmpData[ key ]
			delete result[ mergeKey ]
		}

		const srcVal = source[ mergeKey ] ?? source[ key ]
		const trgVal = result[ key ] ?? {}

		// If no srcVal, continue
		if ( srcVal === undefined ) {
			return result
		}

		// If no target value or target is not an object, use srcVal
		if ( trgVal === null || ! Object( trgVal ) === trgVal ) {
			result[ key ] = srcVal
			return result
		}

		// Recurse if source is an object/array
		if ( shouldMerge && Object( srcVal ) === srcVal ) {
			result[ key ] = mergePresetData( srcVal, trgVal, { merge: true } )
		}
		else {
			result[ key ] = srcVal
			return result
		}

		return result
	}, _target )
}

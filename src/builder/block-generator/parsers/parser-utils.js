'use strict'
// import _ from 'lodash'
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
 * Returns:
 * ```
 * 'key': (string) Key excl. mergeSymbol
 * 'isVariable': (boolean) Whether key is a variable
 * 'mergeKey': (string) Key with mergeSymbol
 * 'shouldMerge': (boolean) Whether key includes the merge symbol
 * ```
 *
 * @param {string} presetKey
 */
export function parsePresetKey( presetKey ) {
	if ( ! presetKey ) {
		return
	}

	const res = presetKey.match( stringFilters.presetKeyRx )
	const [ __, key, isVariable, shouldMerge ] = res

	return {
		key,
		isVariable: !! isVariable,
		mergeKey: key + mergeKeySuffix,
		shouldMerge: !! shouldMerge,
	}
}

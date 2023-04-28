'use strict'
import _ from 'lodash'
import { stringStartsWith } from '../../../lib/utils.js'
import { magicExpressionMetaDivider, magicExpressionPathDivider, mergeKeySuffix, regexFilters } from '../../generator-config.js'
import { prefixer } from '../../builder-utils.js'

const { computedProp } = prefixer

/**
 * Find all magic template strings in a string (within {{ }})
 *
 * Return groups: expression, property_name, divider, sub_key, dynamic_key
 *
 * @param {string} input
 * @param {boolean} matchWholeString
 * return {{ groups: MagicExpressionMatch}[]}
 */
export function findMagicKeywordsInString( input = '', matchWholeString = false ) {
	const rx = matchWholeString
		? regexFilters.magicExpressionMatch
		: new RegExp( `{{${ regexFilters.magicExpressionMatch.source }}}`, 'ig' )

	const matches = [ ...input.matchAll( rx ) ]

	if ( matches.length ) {
		return matches.map( ( keyword ) => {
			return keyword.groups.expression
		} )
	}

	return []

	// return /** @type {any} */ ( [ ...input.matchAll( rx ) ] )
}

/**
 * Returns array of magic keyword expressions (unique values).
 *
 * @param {JSO} _action
 * @return {string[]}
 */
export function findMagicExpressionsInObj( _action ) {
	const inputArr = Array.isArray( _action ) ? _action : Object.values( _action )
	const arr = inputArr
		.reduce( ( result, value ) => {
			if ( Object( value ) === value ) {
				const _data = findMagicExpressionsInObj( value )
				result.push( ..._data )
			}
			else if ( typeof value === 'string' ) {
				const keywords = [
					...findMagicKeywordsInString( value ),
					...findMagicKeywordsInString( value, true ),
				]
				result.push( ...keywords )

				// const keywordsx = [
				// 	...findMagicKeywordsInStringRaw( value ),
				// 	...findMagicKeywordsInStringRaw( value, true ),
				// ]

				// if ( keywords && keywords.length ) {
				// 	result.push( ...keywords.map( ( keyword ) => {
				// 		return keyword.groups.expression
				// 	} ) )
				// }
			}
			return result
		}, [] )
		.flat()

	return Array.from( new Set( arr ) )
}

/**
 * Get properties of magic keyword.
 *
 * If magicKeyword is *not* a magic keyword, a truncated object is returned:
 * ```
 * { isMagicKeyword: false, property: magicKeyword }
 * ```
 * @param {string} magicKeyword
 * @return {MagicExpressionMeta<true> | Partial<MagicExpressionMeta<false>>}
 */
export function parseMagicExpression( magicKeyword ) {
	const rx = regexFilters.magicExpressionMatch

	/** @type {{ groups: MagicExpressionMatch}[]}  */
	const data =
		/** @type {any} */ ( [ ...magicKeyword.matchAll( rx ) ] )

	if ( ! data.length ) {
		return { isMagicExpression: false, property: magicKeyword }
	}

	return getMagicKeyExpressionMeta( magicKeyword, data[ 0 ].groups )
}

/**
 * Parse magic keyword data.
 *
 * @param {string} magicKeyword
 * @param {MagicExpressionMatch} magicKeywordInfo
 */
export function getMagicKeyExpressionMeta( magicKeyword, magicKeywordInfo ) {
	const { preset_property, divider, sub_key, dynamic_key } = magicKeywordInfo

	const metaKey = sub_key ?? dynamic_key

	let variable
	let propertyName = preset_property

	if ( stringStartsWith( propertyName, '$' ) ) {
		propertyName = propertyName.slice( 1 )
		variable = propertyName
	}

	const operation =
	( divider === magicExpressionMetaDivider && 'meta' )
	|| ( divider === magicExpressionPathDivider && 'path' )

	/** @type {MagicExpressionMeta} */
	const meta = {
		isMagicExpression: true,
		path: [ propertyName ],
		property: propertyName,
		dynamicProperty: undefined,
		magicExpression: magicKeyword,
		operation,
		metaKey,
		variable,
	}

	if ( operation === 'path' ) {
		if ( dynamic_key ) {
			const varInfo = parseMagicExpression( dynamic_key )
			meta.dynamicProperty = varInfo
			return meta
		}

		meta.path = [ propertyName, metaKey ]
	}

	return meta
}

/**
 * Get information about a property key.
 *
 * @param {string} propertyName
 */
export function getPropertyKeyMeta( propertyName ) {
	const _prefixed = `{{prefix}}:${ propertyName }`

	/** @type {MagicExpressionKeyData} */
	const data = {
		key: propertyName,
		name: _prefixed,
		magic_key: computedProp( propertyName ),
		current_block_state: `query.block_property('{{prefix}}:${ propertyName }')`,
	}

	return data
}

/**
 * Get information about a property's value.
 *
 * @param {string} propertyName
 * @param {string|string[]|number|number[]} propertyValue
 * @param {number|string} currentValue
 * @return {MagicExpressionData}
 */
export function getPropertyData( propertyName, propertyValue = undefined, currentValue = undefined ) {
	const meta = getPropertyKeyMeta( propertyName )
	if ( ! propertyValue ) {
		return meta
	}

	/** @type {MagicExpressionData} */
	const data = {
		...meta,
		[ propertyName ]: propertyValue,
		is_main_hand: undefined,
		keys: undefined,
		key_list: undefined,
		length: undefined,
		max: undefined,
		min: undefined,
		value: propertyValue,
		value_list: undefined,
	}

	if ( currentValue !== undefined ) {
		const num = Number( currentValue )
		data.current_value = isNaN( num ) ? currentValue : num
	}

	let arrValues
	let isObject = false

	if ( Array.isArray( propertyValue ) ) {
		arrValues = propertyValue
	}
	else if ( Object( propertyValue ) === propertyValue ) {
		isObject = true
		arrValues = Object.values( propertyValue )
	}
	else {
		arrValues = [ propertyValue ]
		data.is_main_hand = `query.is_item_name_any('slot.weapon.mainhand', 0, '${ propertyValue }')`
	}

	const arr = arrValues.map( ( v ) => {
		const num = Number( v )
		return isNaN( num ) ? v : num
	} )

	if ( arr && arr.length ) {
		Object.assign( data, {
			[ propertyName ]: arr,
			get length() {
				return arr.length
			},
			get max() {
				return Math.max( ...arr )
			},
			get min() {
				return Math.min( ...arr )
			},
			value: arr,
			get value_list() {
				return data.value_list = arrValues
					.map( ( val ) => `'${ val }'` )
					.join( ',' )
			},
		} )
	}

	if ( isObject ) {
		const objKeys = Object.keys( propertyValue )
		Object.assign( data, {
			get keys() {
				return objKeys
			},
			get key_list() {
				return objKeys
					.map( ( val ) => `'${ val }'` )
					.join( ',' )
			},
		} )

		// if ( propertyName === 'combine' ) {
		// 	// combine
		// 	data.combine = objKeys
		// 		.map( ( i ) => `${ propertyValues[ i ] }` )
		// 		.join( ' && ' )
		// }
	}

	return data
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

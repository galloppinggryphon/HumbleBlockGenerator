'use strict'
import _ from 'lodash'
import { reducer, stringStartsWith } from '../../../lib/utils.js'
import { logger, magicExpressionMetaDivider, magicExpressionPathDivider, mergeKeySuffix, regexFilters } from '../../generator-config.js'
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
 * A magic expression is a prefixed variable name coupled with two colons to an attribute of that variable.
 *
 * E.g. `%trigger_items::value_list`
 *
 * Attributes are generated by @see getPropertyData
 *
 * Attributes can include (depending on the tyoe of variable): `key`, `name`, `magic_key`, `current_block_state`, `is_main_hand`, `keys`, `key_list`, `length`, `max`, `min`, `value`, `value_list`.
 *
 * @param {JSO} obj
 * @param {boolean} parseKeys
 * @return {string[]}
 */
export function findMagicExpressionsInObj( obj, parseKeys = false ) {
	let inputArr = Array.isArray( obj ) && obj

	if ( ! inputArr ) {
		inputArr = Object.values( obj )

		if ( parseKeys ) {
			inputArr.push( ...Object.keys( obj ) )
		}
	}

	const arr = inputArr
		.reduce( ( result, value ) => {
			if ( Object( value ) === value ) {
				const _data = findMagicExpressionsInObj( value, parseKeys )
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
 *  return {ExpressionMeta<true> | Partial<ExpressionMeta<false>>}
 */
export function parseMagicExpression( magicKeyword ) {
	const rx = regexFilters.magicExpressionMatch

	/** @type {{ groups: MagicExpressionMatch}[]}  */
	const data =
		/** @type {any} */ ( [ ...magicKeyword.matchAll( rx ) ] )

	if ( ! data.length ) {
		if ( stringStartsWith( magicKeyword, '%' ) ) {
			magicKeyword = magicKeyword.slice( 1 )
		}

		return { isMagicExpression: false, property: magicKeyword, notFound: true }
	}

	return getMagicKeyExpressionMeta( magicKeyword, data[ 0 ].groups )
}

/**
 * Get magic keyword meta data.
 *
 * Meta data includes:
 *
 * ```
 * isMagicExpression: boolean
 * path: string[]
 * property: string
 * dynamicProperty: string
 * magicExpression: string
 * operation: string
 * operation: string
 * variable: string
 * ```
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

	/** @type {ExpressionMeta} */
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
 * @return {MagicExpressionData}
 */
export function getPropertyData( propertyName, propertyData, currentValue = undefined ) {
	const meta = getPropertyKeyMeta( propertyName )

	/** @type {MagicExpressionData} */
	const data = {
		...meta,
		is_main_hand: undefined,
		keys: undefined,
		key_list: undefined,
		length: undefined,
		max: undefined,
		min: undefined,
		data: propertyData,
		value: propertyData,
		value_list: undefined,
		first_value: undefined,
		last_value: undefined,
		next_value: undefined,
		next_block_state: undefined, // `query.block_property('{{prefix}}:${ propertyName }') + 1`,
	}

	if ( currentValue !== undefined ) {
		const num = parseInt( currentValue )
		data.current_value = isNaN( num ) ? currentValue : num
		// data.value = isNaN( num ) ? currentValue : num
	}

	let arrValues
	let isObject = false

	if ( Array.isArray( propertyData ) ) {
		arrValues = propertyData.filter( ( v ) => v !== undefined )
	}
	else if ( Object( propertyData ) === propertyData ) {
		isObject = true
		arrValues = Object.values( propertyData )
	}
	else {
		// arrValues = [ propertyValue ]
		data.is_main_hand = `query.is_item_name_any('slot.weapon.mainhand', 0, '${ propertyData }')`
	}

	if ( arrValues ) {
		/* *
		 * @type {{values: Array<number>, keys: number[]}}
		 */
		// const arr = arrValues.reduce( ( result, v ) => {
		// 	const num = Number( v )
		// 	if ( isNaN( num ) ) {
		// 		result.values.push( v )
		// 		result.keys.push( result.keys.length )
		// 	}
		// 	else {
		// 		result.values[ num ] = v
		// 		result.keys.push( num )
		// 	}

		// 	return result
		// }, { values: [], keys: [] } )

		// const arrKeys = Object.keys( arr )

		const arr = arrValues
			.map( ( v ) => {
				const num = Number( v )
				return isNaN( num ) ? v : num
			} )

		// const keys = arrValues.map( ( v ) => {
		// 	const num = Number( v )
		// 	if ( isNaN( num ) ) {
		// 		return v
		// 	}
		// 	return num
		// } )

		// const keys = Object.keys( values )
		// const next_index = index >= values.length ? 0 : index + 1 // keys[ index + 1 ]
		// // next_index = ! next_index ? keys[ 0 ] : next_index

		// const key = keys[ index ]
		// const next_key = keys[ next_index ]

		// // const value = values[ index ]
		// const next_value = values[ key ]
		// const first_value = values[ keys[ 0 ] ]
		// const last_value = values[ keys.at( -1 ) ]

		const arrKeys = [ ...arr.keys() ]

		Object.assign( data, {
			// [ propertyName ]: arr,
			get length() {
				return arr.length
			},
			get first_value() {
				return arr[ arrKeys[ 0 ] ]
			},
			get last_value() {
				return arr[ arrKeys.at( -1 ) ]
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
			get next_block_state() {
				return `(query.block_property('{{prefix}}:${ propertyName }') + 1)`
			},
		} )
	}

	if ( isObject ) {
		const objKeys = Object.keys( propertyData )
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

	if ( res === null ) {
		return
	}

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
		const parseData = parsePresetKey( currentKey )
		if ( ! parseData ) {
			logger.error( `Invalid key in preset object: '${ currentKey }'.`, source )
			return result
		}

		const { key, mergeKey, shouldMerge } = parseData
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

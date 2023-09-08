'use strict'
import _ from 'lodash'
import {
	logger, magicExpressionMetaDivider,
} from '../../generator-config.js'
import {
	resolveTemplateStringsRecursively,
	reducer,
	isObj,
	resolveTemplateStrings,
	objWalk,
	objMap,
} from '../../../lib/utils.js'
import { prefixer } from '../../builder-utils.js'
import { findMagicExpressionsInObj, findMagicKeywordsInString, getPropertyData, parseMagicExpression } from './parser-utils.js'

const { computedProp } = prefixer

/**
 * Automatically generate block components from properties and rules.
 *
 * Useful for events definitions, event handlers and bone visibility.
 *
 * Todo: handle permutations
 *
 * @param {Presets.PresetHandler} presetHandler
 */
export default function ComponentGenerator( presetHandler ) {
	/** @type {Presets.ComponentGenerator.GeneratorData} */
	let data

	function generateSingle( templateObj ) {
		const { magicExpressions, magicVars } = resolveMagicVars( templateObj )
		const { template } = templateObj
		return resolveTemplateData( template, magicExpressions, magicVars )
	}

	/**
	 * @param {JSO} templateObj
	 */
	function generateArray( templateObj ) {
		// Generate actions for multiple trigger items, if defined
		const resolvedObjCopy = _.cloneDeep( templateObj )

		// If forEach, generate actions from template from values of forEach array
		data = ComponentData( presetHandler, resolvedObjCopy )

		if ( ! data.paramsComplete ) {
			return
		}

		return generateComponentElements( data )
	}

	/**
	 * @param {JSO} templateObj
	 */
	function generateObject( templateObj ) {
		const forEachItems = generateArray( templateObj )

		if ( ! forEachItems ) {
			return
		}

		/** @type {JSO} */
		const obj = {}
		forEachItems.forEach( ( item ) => Object.assign( obj, item ) )
		return obj
	}

	function resolveMagicVars( templateObj ) {
		const magicExpressions = findMagicExpressionsInObj( templateObj, true )

		const { magicVars } = reducer( magicExpressions, ( result, [ __, key ] ) => {
			const exprMeta = parseMagicExpression( key )
			let value = presetHandler.getParamByPath( ...exprMeta.path )

			/** @type {MagicExpressionData} */
			let propData

			if ( ! value ) {
				if ( exprMeta.property in result.magicData ) {
					value = result.magicData[ exprMeta.property ]
				}
				else {
					value = _.get( templateObj.params, exprMeta.path )
				}
			}

			if ( ! propData ) {
				propData = getPropertyData( exprMeta.property, value )
				result.magicData[ exprMeta.metaKey ] = propData.value
			}

			result.magicVars[ key ] = propData[ exprMeta.metaKey ]

			presetHandler.setCustomVar( key, propData[ exprMeta.metaKey ] )
			return result
		}, { magicVars: {}, magicData: {} } )

		return { magicExpressions, magicVars }
	}

	function resolveTemplateData( templateObj, magicExpressions, magicVars ) {
		const obj = {}

		for ( const [ propKey, value ] of Object.entries( templateObj ) ) {
			// const item = {}

			if ( isObj( value ) ) {
				const resolved = resolveTemplateData( value, magicExpressions, magicVars )
				Object.assign( obj, { [ propKey ]: resolved } )
			}
			else {
				const resolvedKey = resolveTemplateStrings( propKey, magicVars, { restrictChars: false } )

				// Normalize JSON key names
				// !! BUG: Can't do that to minecraft props
				const key = resolvedKey // kebabToCamelCase( resolvedKey )

				if ( magicExpressions.includes( value ) ) {
					obj[ key ] = magicVars[ value ]
				}
				else if ( typeof value === 'string' ) {
					const magicStrings = findMagicKeywordsInString( value )

					if ( magicStrings.length ) {
						obj[ key ] = resolveTemplateStrings( value, magicVars, { restrictChars: false } )
					}
					else {
						obj[ key ] = value
					}
				}
				else {
					obj[ key ] = value
				}
			}
		}

		return obj
	}

	return { generateArray, generateObject, generateSingle }
}

/**
 * @param {Presets.PresetHandler} presetHandler
 * @param {Presets.ComponentData} componentData
 * @return {Presets.ComponentGenerator.GeneratorData}
 */
function ComponentData( presetHandler, componentData ) {
	const { for_each: forEach, template } = componentData

	let paramsComplete = true
	/** @type {Partial<Presets.ComponentData>} */
	const data = { for_each: undefined, params: {}, template: undefined }
	/** @type {string[]} */
	let magicExpressions = []
	/** @type {ExpressionMeta} */
	let forEachMeta
	/** @type {any[]} */
	let forEachValues = []
	/** @type {JSO} */
	let forEachData = []
	/** @type {number[]} */
	let forEachKeys = []

	/** @type {string[]} */
	const accumulateKeys = []

	parseTemplate()
	resolveParams()
	resolveForEach()

	function parseTemplate() {
		// Find all the magic expressions used in the action object (condition + all actions)
		magicExpressions = findMagicExpressionsInObj( template, true )

		objWalk( template, ( __, [ propKey, propValue ] ) => {
			if ( Array.isArray( propValue ) ) {
				accumulateKeys.push( propKey )
			}
		} )
	}

	function resolveParams() {
		if ( componentData.params === undefined ) {
			return
		}

		objWalk( componentData.params, ( __, [ propKey, propValue ] ) => {
			// "dimension": "%properties.rotate_x"
			// dimension::name -> properties.rotate_x::name

			// %dimension::value -> properties.rotate_x::value

			// ~ dimension: ["%properties.rotate_x"]
			// %dimension::name -> {{prefix}}:rotate_x
			// %dimension::current_block_state -> query.block_property({{prefix}}:rotate_x)
			// %dimension::min -> 0

			// const paramMeta = getPropertyData( propKey, propValue )
			// const forEachValue = meta.property
			// const propData = getPropertyData( meta.metaKey, forEachValue )
			// result.push( [ propKey, propData ] )
			// paramsMeta[ propKey ] = paramMeta

			if ( ! propValue ) {
				if ( propValue !== false ) {
					logger.notice( `A parameter was missing in a dynamically generated object. Set the parameter value to 'false' to suppress this message.`, { parameter: propKey, template } )
				}
				// Skip processing of this component template
				paramsComplete = false
				return
			}

			if ( Array.isArray( propValue ) ) {
				data.params[ propKey ] = propValue
				return
			}

			if ( isObj( propValue ) ) {
				let resolvedParams

				reducer( propValue, ( result, [ key, value ] ) => {
					if ( typeof value === 'string' ) {
						resolvedParams ??= {}
						resolvedParams[ key ] = parseMagicParam( key, value )
					}
					else if ( Array.isArray( value ) ) {
						resolvedParams ??= {}
						resolvedParams[ key ] = value
					}
					else {
						const p = parseMagicParam( key, propValue ) ?? propValue
						resolvedParams ??= {}
						resolvedParams[ key ] = p
					}

					return result
				}, resolvedParams )

				data.params[ propKey ] = resolvedParams
			}
			else {
				data.params[ propKey ] = parseMagicParam( undefined, propValue )
			}
		} )
	}

	/**
	 * @param {*} key
	 * @param {*} value
	 */
	function parseMagicParam( key, value ) {
		const expressionMeta = parseMagicExpression( value )

		if ( ! expressionMeta.isMagicExpression ) {
			return value
		}

		const paramValue = presetHandler.getParamByPath( ...expressionMeta.path )
		const paramValueObj = paramValue.reduce( ( paramRes, val, index ) => {
			if ( typeof val === 'number' ) {
				paramRes[ val ] = val
			}
			else {
				paramRes[ index ] = val
			}
			return paramRes
		}, {} )

		return paramValueObj
	}

	function resolveForEach() {
		if ( ! forEach ) {
			return
			// throw new Error('Missing required ')
		}

		const { params } = data

		// Resolve the for_each parameter - get expression from params
		// Parse magic expressions if necessary
		const paramsArr = params && Object.entries( params )

		if ( ! params || ! paramsArr.length ) {
			logger.error( 'Missing or empty required `params` property.', { componentData } )
			return
		}

		const resolvedData = resolveForEachExpression()

		if ( ! resolvedData ) {
			logger.error( `Value of 'for_each' does not correspond to a valid 'params' key!`, { componentData } )
			return
		}

		resolveForEachData( resolvedData )
	}

	function resolveForEachExpression() {
		forEachMeta = parseMagicExpression( forEach )

		if ( forEachMeta.isMagicExpression ) {
			const propertyData = data.params[ forEachMeta.property ]

			if ( ! propertyData ) {
				throw new Error( `Invalid reference in 'for_each': the key '${ forEachMeta.property }' was not found in 'params'.` )
			}

			const propertyMeta = getPropertyData( forEachMeta.property, propertyData )

			return propertyMeta[ forEachMeta.metaKey ].reduce( ( result, item, index ) => {
				result[ index ] = item
				return result
			}, {} )
		}

		return data.params[ forEach ]
	}

	/**
	 * @param {JSO|any[]} resolvedData
	 */
	function resolveForEachData( resolvedData ) {
		if ( Array.isArray( resolvedData ) ) {
			forEachValues = forEachKeys = resolvedData.flat().map( ( val ) => val )
			forEachData = forEachValues.reduce( ( r, v, i ) => ( r[ i ] = v, r ), {} )
		}
		else {
			forEachValues = Object.values( resolvedData )
			forEachData = resolvedData
			forEachKeys = objMap( forEachData, ( [ key ] ) => {
				const keyNum = Number( key )
				return Number.isNaN( keyNum ) ? key : keyNum
			} )
		}
	}

	return {
		get forEachValues() {
			return forEachValues
		},
		set forEachValues( newIteratorData ) {
			forEachValues = newIteratorData
		},
		accumulateKeys,
		paramsComplete,
		forEachMeta,
		forEachData,
		forEachKeys,
		magicExpressions,
		template,
		params: data.params,
	}
}

/**
 * @param {Presets.ComponentGenerator.GeneratorData} data
 */
function generateComponentElements( data ) {
	const { accumulateKeys, forEachMeta, forEachData, forEachKeys, forEachValues, magicExpressions, template, params } = data

	/** @type {JSO[]} */
	const elements = []

	/** @type {JSO} */
	const sharedVars = {}

	/**
	 * @type {Presets.ComponentGenerator.CurrentElement}
	 */
	const currentElement = {
		forEachCurrent: undefined,
		forEachData: undefined,
		dynamicVars: undefined,
		meta: undefined,
	}

	/**
	 * @param {number} index
	 * @param {string} propKey
	 * @param {any} currentValue
	 */
	function createForEachData( index, propKey, currentValue ) {
		currentElement.meta = getPropertyData( forEachMeta.property, forEachKeys, propKey )
		const props = currentElement.meta
		const count = forEachKeys.length

		const next_index = ( index + 1 ) >= count ? 0 : index + 1

		const counter = index + 1
		const next_counter = next_index + 1

		const key = forEachKeys[ index ]
		const next_key = forEachKeys[ next_index ]
		const first_key = forEachKeys[ 0 ]
		const last_key = forEachKeys.at( -1 )

		const first_value = forEachValues[ 0 ]
		const last_value = forEachValues.at( -1 )
		const next_value = forEachValues[ next_index ]

		/**
		 * @type {Presets.ComponentGenerator.ForEachMeta}
		 */
		const forEachCurrent = {
			count,
			counter,
			next_counter,
			property: forEachMeta.property,
			prop_key: propKey,
			key,
			next_key,
			first_key,
			last_key,
			value: currentValue,
			index,
			next_index,
			max: props.max,
			min: props.min,
			next_value,
			first_value,
			last_value,
		}

		// Resolve and add %forEach variables
		const vars = reducer( forEachCurrent, ( result, [ forEachKey, forEachVal ] ) => {
			const magicExpr = computedProp( `for_each${ magicExpressionMetaDivider }${ forEachKey }` )
			result[ magicExpr ] = forEachVal
			return result
		}, {} )

		currentElement.dynamicVars = vars
		currentElement.forEachCurrent = forEachCurrent

		return currentElement
	}

	/**
	 * @param {string} key
	 */
	function resolveObjParamsByKey( key ) {
		return reducer( params, ( result, [ paramKey, paramValue ] ) => {
			if ( isObj( paramValue ) && key in paramValue ) {
				result[ paramKey ] = paramValue[ key ]
			}
			else {
				result[ paramKey ] = paramValue
			}
			return result
		}, {} )
	}

	/**
	 * @param {JSO} meta
	 * @param {Presets.ComponentGenerator.ForEachMeta} forEachCurrent
	 */
	function computeDynamicProperty( meta, forEachCurrent ) {
		const { dynamicProperty } = meta
		const paramValue = params[ meta.property ]

		if ( paramValue === undefined ) {
			return
		}

		if ( paramValue ) {
			const paramKeys = Object.keys( paramValue )
			let paramKeysResolved = []

			let dynamicKey = forEachCurrent[ dynamicProperty.metaKey ]
			let outOfBounds = false

			const keyNum = parseInt( dynamicKey )

			if ( Number.isNaN( keyNum ) ) {
				const index = paramKeys.indexOf( dynamicKey )

				if ( index === -1 ) {
					throw new Error( `Uh, this isn't good - dynamicKey not found in paramKeys: ${ JSON.stringify( { paramValue, dynamicKey, paramKeys } ) }` )
				}
			}
			else {
				paramKeysResolved = paramKeys.map( Number )
				const propData = getPropertyData( dynamicProperty.property, paramKeysResolved, keyNum )
				dynamicKey = keyNum > propData.max ? 0 : keyNum
				outOfBounds = dynamicKey < propData.min
			}

			// Check that the reference parameter has enough values!
			if ( outOfBounds ) {
				throw new Error( `The requested index does not exist on this parameter!\n\nIndex: ${ dynamicKey }\nParameter values: ${ JSON.stringify( paramValue ) }` )
			}

			const currentVal = paramValue[ dynamicKey ]
			if ( Array.isArray( currentVal ) ) {
				return forEachCurrent.value
			}
			return currentVal
		}

		return ''
	}

	/**
	 * @param {ExpressionMeta} magicExpressionData
	 * @param {Presets.ComponentGenerator.ForEachMeta} forEachCurrent
	 * @param {JSO} currentParams
	 */
	function computeVariableData( magicExpressionData, forEachCurrent, currentParams ) {
		const paramItem = params[ magicExpressionData.property ]
		let { property } = magicExpressionData

		// If accessing a parameter key
		if ( magicExpressionData.property === forEachCurrent.property ) {
			// If the parameter value is an array, e.g. list of states
			if ( Array.isArray( paramItem ) ) {
				property = forEachCurrent.property
			}
			// else the parameter is an object
			else {
				property = forEachCurrent.value.toString() // !!
			}
		}

		const currentValue = currentParams[ magicExpressionData.property ]

		if ( currentValue === undefined ) {
			return
		}

		return getPropertyData( property, currentValue )
	}

	/**
	 * @param {JSO} existingVars
	 * @param {JSO} currentParams
	 * @param {Presets.ComponentGenerator.ForEachMeta} forEachCurrent
	 */
	function computeMagicVars( existingVars, currentParams, forEachCurrent ) {
		const vars = { ...existingVars }

		magicExpressions.forEach( ( keyword ) => {
			const expressionMeta = parseMagicExpression( keyword )

			if ( ! expressionMeta.isMagicExpression ) {
				return
			}

			// %for_each variables have already been parsed
			if ( expressionMeta.magicExpression in vars || ( expressionMeta.property === 'for_each' && expressionMeta.metaKey in forEachCurrent ) ) {
				return
			}

			// If the keyword references a dynamic property
			if ( expressionMeta.dynamicProperty ) {
				vars[ keyword ] = computeDynamicProperty( expressionMeta, forEachCurrent )
			}
			else {
				const propData = computeVariableData( expressionMeta, forEachCurrent, currentParams )
				currentElement.meta = propData

				if ( ! propData ) {
					return
				}

				Object.entries( propData ).forEach( ( [ _key, _val ] ) => {
					const varName = `${ computedProp( expressionMeta.property ) }${ magicExpressionMetaDivider }${ _key }`

					if ( ! ( varName in vars ) || vars[ varName ] === undefined ) {
						vars[ varName ] = _val
					}
				} )
			}
		} )

		return vars
	}

	/**
	 * @param {JSO} target
	 * @param {JSO} source
	 */
	function prepareTemplateVars( target, source ) {
		// Filter and check presence of required variables
		magicExpressions.reduce( ( result, m ) => {
			if ( m in result && result[ m ] !== undefined ) {
				return result
			}

			if ( m in source && source[ m ] !== undefined ) {
				result[ m ] = source[ m ]
				return result
			}

			throw new Error( `Failed to calculate substitution data for template string '${ m }'.` )
		}, target )
	}

	/**
	 * @param {string|number} propKey
	 * @param {string} value
	 * @param {number} index
	 */
	function resolveForEach( propKey, value, index ) {
		const currentParams = resolveObjParamsByKey( value ) // !!( propKey )

		// !! toString
		const { forEachCurrent, dynamicVars } = createForEachData( index, propKey.toString(), value )

		// Parse magic expressions in template and generate variables
		// Mutates vars
		const vars = computeMagicVars( { ...sharedVars, ...dynamicVars }, currentParams, forEachCurrent )

		if ( dynamicVars[ '%for_each::value' ] === null ) {
			return
		}

		prepareTemplateVars( vars, dynamicVars )

		const templateCopy = _.cloneDeep( template )
		const resolvedTemplate = resolveTemplateStringsRecursively( templateCopy, vars, { restrictChars: false } )

		elements.push( resolvedTemplate )
	}

	function generate() {
		forEachKeys.forEach( ( key, index ) => {
			// const propKey = forEachKeys[ index ]
			const resolvedValue = [ forEachData[ key ] ].flat()

			resolvedValue.forEach(
				( value ) => resolveForEach( key, value, index ),
			)
		} )

		return elements
	}

	function accumulateKeyValues() {
		if ( ! accumulateKeys.length ) {
			return elements
		}

		const preparedElements = elements.reduce( ( newElements, el ) => {
			objWalk( el, ( __, [ lhs, rhs ] ) => {
				if ( ! ( lhs in newElements ) ) {
					newElements[ lhs ] ??= []
				}

				newElements[ lhs ].push( rhs )
			} )
			return newElements
		}, {} )

		return reducer( preparedElements, ( result, [ lhs, rhs ] ) => {
			let rhsVal = rhs
			if ( Array.isArray( rhs ) ) {
				rhsVal = rhs.join( ' || ' )
			}
			result.push( { [ lhs ]: rhsVal } )
			return result
		}, [] )
	}

	generate()

	return accumulateKeyValues()
}

// ~~~ example (dimension) ~~~
// ForEach data: { rotate_x: [] }
// propName = 'rotate_x'
// valueSet = [0,1,2,3]
// value = {0} ([0,1,2,3])
//
// for_each
// ::propName = {'rotate_x'}
// ::index = [0,1,2,3] = {0}
// ::next_index = (index < length ? index + 1 : 0) = {1}
// ::key = value[index] = {0}
// ::next_key = keys(value)[next_index] = {1}
// ::value = value[key]
// ::next_value = value[next_key]

// Need to extract trigger_items.rotate_x[for_each::key]

// ~~~ example (bone_visibility) ~~~
// ForEach data: subvariant = [0,1,2,3]
// valueSet = {
// 		"0": ["nb", "c"],
// 		"1": ["nm", "c"],
// 		"2": ["nt", "c"]
// }

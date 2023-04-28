'use strict'
import _ from 'lodash'
import {
	logger, magicExpressionMetaDivider,
} from '../../generator-config.js'
import {
	resolveTemplateStringsRecursively,
	resolveRefsRecursively,
	reducer,
	isObj,
} from '../../../lib/utils.js'

import { prefixer } from '../../builder-utils.js'
import { findMagicExpressionsInObj, getPropertyData, parseMagicExpression } from './parser-utils.js'

const { computedProp } = prefixer

/**
 * @param {Presets.PresetHandler} presetHandler
 */
export default function EventActionParser( presetHandler ) {
	/**
	 * ### Action generator ###
	 *
	 * `::` => Request for meta value
	 *
	 * `.` => Request for subvalue
	 *
	 * Magic keys:
	 * - %`preset_property`								= Get value of `preset_property` in the preset, e.g. properties.
	 * - %`preset_property`.`key_name`					= Get child property of `preset_property`, if object or array. E.g. `%subvariant::1` or `%properties::subvariant`
	 * - %`preset_property`.[`key_name`]				= Get child property dynamically, e.g. %`preset_property`.[%other_prop::value]
	 * - %`preset_property`::*							= Meta data for `preset_property`
	 * - %`preset_property`::key 						= Property key name
	 * - %`preset_property`::name 						= Fully qualified name incl prefix, e.g. `bcastl::subvariant`
	 * - %`preset_property`::keys						= Object keys as array
	 * - %`preset_property`::key_list					= Object keys as comma-separated and quoted string list
	 * - %`preset_property`::current_block_state		= Molang query to get current block property value (if `preset_property` is a block property)
	 * - %`preset_property`::length 					= Length of array or object
	 * - %`preset_property`::max 						= Max value in array
	 * - %`preset_property`::min 						= Min value in array
	 *
	 * Todo
	 * - %query.block_property()
	 *
	 * FIXME magic_key??
	 *
	 * ~ Obsolete
	 * - %properties.*
	 * - %properties::*
	 * - %trigger_items
	 *
	 * @param {{action: Events.ActionItem[], params?: JSO}} param0
	 */
	function eventActionParser( { action, params } ) {
		const resolvedAction = resolveRefsRecursively( action, presetHandler.vars )

		// Generate actions for multiple trigger items, if defined
		const actionCopy = _.cloneDeep( resolvedAction )
		const resolvedActions = actionCopy.reduce( ( actionArray, actionItem ) => {
			// Merge events.params with event action params
			actionItem.params = {
				...actionItem.params ? actionItem.params : {},
				...params ? params : {},
			}

			// If forEach, generate actions from template from values of forEach array
			if ( 'for_each' in actionItem ) {
				const eventActions = resolveForEach( actionItem )

				if ( eventActions ) {
					actionArray.push(
						...eventActions,
					)
				}
			}
			else {
				const eventAction = resolveAction( actionItem )
				actionArray.push( eventAction )
			}

			return actionArray
		}, [] )
		return resolvedActions
	}

	/**
	 * Resolve magic expressions in event action item and generate valid Minecraft event data.
	 *
	 * @param {Events.ActionItem} action
	 */
	function resolveAction( action ) {
		const { params, ...actionData } = action

		const magicVars = reducer( params, ( result, [ key, value ] ) => {
			if ( typeof value !== 'string' ) {
				// logger.error( 'resolveAction can only accept string parameters!', { value } )
				return result
			}

			const valueInfo = parseMagicExpression( value )
			let data = value
			let meta

			if ( valueInfo.isMagicExpression ) {
				// If not a magic keyword (path is missing), use value as is
				data = presetHandler.getParamByPath( ...valueInfo.path )

				// If value is another magic keyword, resolve value and substitute magic keyword references
				// e.g. if params['property'] = '%properties.subvariant', use the magic keyword's meta properties (NOT 'property') to generate variables
				meta = getPropertyData( valueInfo.metaKey, data )
			}
			else {
				meta = getPropertyData( key, data )
			}

			reducer( meta, ( newVars, [ magicKey, magicValue ] ) => {
				newVars[ computedProp( `${ key }${ magicExpressionMetaDivider }${ magicKey }` ) ] = magicValue
				return newVars
			}, result )

			return result
		}, {} )

		const mcEventData = resolveTemplateStringsRecursively( actionData, magicVars, { restrictChars: false } )
		return mcEventData
	}

	/**
	 * Generate valid Minecraft event items based on forEach array values.
	 *
	 * @param {Events.ActionItem} action
	 */
	function resolveForEach( action ) {
		const { for_each: forEach, params, ...actionData } = action
		const paramsArr = params && Object.entries( params )

		if ( ! params || ! paramsArr.length ) {
			logger.error( 'Missing or empty required `params` property.', { action } )
			return
		}

		// Resolve the for_each parameter - get expression from params
		const forEachParam = params[ forEach ]

		if ( ! forEachParam ) {
			logger.error( 'for_each value does not correspond to a valid params key!', { action } )
			return
		}

		// Find all the magic expressions used in the action object (condition + all actions)
		const magicExpressions = findMagicExpressionsInObj( actionData )

		// const forEachArr = forEachParam// [ forEachParam ].flat()

		// dimension -> dimension::name -> properties.rotate_x::name
		// dimension -> properties.rotate_x -> current_block_state
		// dimension -> properties.rotate_x -> max/min

		/*
			{
			key: "rotate_x",
			name: "{{prefix}}:rotate_x",
			magic_key: "%rotate_x",
			current_block_state: "query.block_property('{{prefix}}:rotate_x')",
			rotate_x: [
				0,
				1,
				2,
				3,
			],
			value: [
				0,
				1,
				2,
				3,
			],
			length: 4,
			max: 3,
			min: 0,
			}
		*/

		const forEachVars = {}
		const mcActions = []

		const parseForEachObj = ( obj, target ) => {
			reducer( obj, ( result, [ propKey, propValue ] ) => {
				// "dimension": "%properties.rotate_x"
				// dimension::name -> properties.rotate_x::name

				// %dimension::value -> properties.rotate_x::value

				// ~ dimension: ["%properties.rotate_x"]
				// %dimension::name -> {{prefix}}:rotate_x
				// %dimension::current_block_state -> query.block_property({{prefix}}:rotate_x)
				// %dimension::min -> 0

				const expressionMeta = parseMagicExpression( propValue )
				const forEachValue = presetHandler.getParamByPath( ...expressionMeta.path )
				const forEachData = getPropertyData( expressionMeta.metaKey, forEachValue )

				Object.entries( forEachData ).forEach( ( [ _key, _val ] ) => {
					const magicExpr = `${ computedProp( forEach ) }${ magicExpressionMetaDivider }${ _key }`
					forEachVars[ magicExpr ] = _val

					const index = magicExpressions.indexOf( magicExpr )
					if ( index >= 0 ) {
						magicExpressions.splice( index, 1 )
					}
				} )

				delete params.dimension

				const actions = generateForEachAction( [ propKey ], actionData, params, magicExpressions, forEachVars )

				result.push( ...actions )
				return result
			}, target )
		}

		if ( isObj( forEachParam ) ) {
			parseForEachObj( forEachParam, mcActions )
			// reducer( forEachParam, ( result, [ propKey, propValue ] ) => {
			// 	// "dimension": "%properties.rotate_x"
			// 	// dimension::name -> properties.rotate_x::name

			// 	// %dimension::value -> properties.rotate_x::value

			// 	// ~ dimension: ["%properties.rotate_x"]
			// 	// %dimension::name -> {{prefix}}:rotate_x
			// 	// %dimension::current_block_state -> query.block_property({{prefix}}:rotate_x)
			// 	// %dimension::min -> 0

			// 	const expressionMeta = parseMagicExpression( propValue )
			// 	const forEachValue = presetHandler.getParamByPath( ...expressionMeta.path )
			// 	const forEachData = getPropertyData( expressionMeta.metaKey, forEachValue )

			// 	Object.entries( forEachData ).forEach( ( [ _key, _val ] ) => {
			// 		const magicExpr = `${ computedProp( forEach ) }${ magicExpressionMetaDivider }${ _key }`
			// 		forEachVars[ magicExpr ] = _val

			// 		const index = magicExpressions.indexOf( magicExpr )
			// 		if ( index >= 0 ) {
			// 			magicExpressions.splice( index, 1 )
			// 		}
			// 	} )

			// 	delete params.dimension

			// 	const actions = generateForEachAction( [ propKey ], actionData, params, magicExpressions, forEachVars )

			// 	result.push( ...actions )
			// 	return result
			// }, mcActions )
		}
		else if ( typeof forEachParam === 'string' ) {
			const forEachInfo = parseMagicExpression( forEachParam )

			if ( ! forEachInfo.isMagicExpression ) {
				logger.error( 'for_each value is not a magic keyword!', { forEachParam, forEachInfo, action } )
				return
			}

			// const data = {...presetHandler}
			let forEachValue
			try {
				forEachValue = presetHandler.getParamByPath( ...forEachInfo.path )
			}
			catch ( e ) {
				//
				const i = 0
			}

			const forEachData = getPropertyData( forEachInfo.metaKey, forEachValue )

			if ( ! forEachData.value || ! Array.isArray( forEachData.value ) ) {
				logger.error( 'forEachValue is missing/not an array!', { forEachParam, forEachValue: forEachData.value, action } )
				return
			}

			return generateForEachAction( forEachData.value, actionData, params, magicExpressions )
		}
		else {
			logger.error( 'Invalid for_each value, string expected.', forEachParam )
			return
		}

		return mcActions
	}

	function generateForEachAction( forEachValues, action, params, keywordArr, forEachVars = {} ) {
		// ~ Generate Minecraft event items - one action per forEach value ~
		const mcEventItems = []

		for ( let index = 0; index < forEachValues.length; index++ ) {
			// %for_each values update for each iteration
			const nextIndex = index + 1 === forEachValues.length ? 0 : index + 1
			const nextCountValue = nextIndex === forEachValues.length ? 1 : nextIndex + 1
			const forEachCurrentValue = forEachValues && nextIndex < forEachValues.length ? forEachValues[ nextIndex ] : ''

			const forEachCurrent = {
				current: forEachCurrentValue,
				index: index,
				next_index: nextCountValue,
				count: forEachValues.length,
			}

			// Resolve and add %forEach variables
			const dynamicVars = reducer( forEachCurrent, ( result, [ key, currentVal ] ) => {
				const magicExpr = computedProp( `for_each${ magicExpressionMetaDivider }${ key }` )
				result[ magicExpr ] = currentVal
				return result
			}, {} )

			Object.assign( dynamicVars, forEachVars, dynamicVars )

			keywordArr.forEach( ( keyword ) => {
				const meta = parseMagicExpression( keyword )

				// %for_each is a special case and has already been parsed
				if ( meta.property === 'for_each' ) {
					return
				}

				const paramValue = params[ meta.property ]

				if ( paramValue === undefined ) {
					return
				}

				const { dynamicProperty } = meta

				// If the keyword references a dynamic property
				if ( dynamicProperty ) {
					if ( paramValue ) {
						const dynamicKey = forEachCurrent[ dynamicProperty.metaKey ]
						const key = typeof dynamicKey === 'number' ? dynamicKey - 1 : dynamicKey
						const dynamicValue = Array.isArray( paramValue ) ? paramValue[ key ] : paramValue[ key ]
						dynamicVars[ keyword ] = dynamicValue
					}
					else {
						dynamicVars[ keyword ] = ''
					}
				}
				// else if ( isObj( paramValue ) ) {
				// 	//
				// 	const _paramValue = paramValue[ forEachCurrentValue ]
				// 	const valueInfo = parseMagicKeyword( _paramValue )
				// 	const valueData = presetHandler.getParamByPath( ...valueInfo.path )

				// 	const data = getPropertyData( forEachCurrentValue, valueData )

				// 	// forEachVars[ `${ computedProp( meta.property ) }` ] = paramValue

				// 	Object.entries( data ).forEach( ( [ _key, _val ] ) => {
				// 		forEachVars[ `${ computedProp( meta.property ) }${ magicKeywordMetaDivider }${ _key }` ] = _val
				// 	} )
				// }
				else {
					// x
					const data = getPropertyData( meta.property, paramValue )

					// forEachVars[ `${ computedProp( meta.property ) }` ] = paramValue

					Object.entries( data ).forEach( ( [ _key, _val ] ) => {
						dynamicVars[ `${ computedProp( meta.property ) }${ magicExpressionMetaDivider }${ _key }` ] = _val
					} )
				}
				// const data = getPropertyData( meta.property, _paramValue )

				// const keys = data.keys ?? meta.property

				// if ( data.keys ) {
				// 	data.keys.forEach( ( k ) => {
				// 		const kd = getPropertyData( k )
				// 		currentVars[ `${ computedProp( kd.magic_key ) }` ] = paramValue
				// 	} )
				// }
			} )

			// ~ Now resolve all the variables in the action object ~
			const actionCopy = _.cloneDeep( action )
			const mcEventData = resolveTemplateStringsRecursively( actionCopy, dynamicVars, { restrictChars: false } )
			mcEventItems.push( mcEventData )
		}

		return mcEventItems
	}

	return eventActionParser
}

function findDynamicExpressionsInObj( propertyName, obj, expressions ) {
	return reducer( obj, ( result, [ _key, _val ] ) => {
		const currentExpr = `${ computedProp( propertyName ) }${ magicExpressionMetaDivider }${ _key }`

		result.vars[ currentExpr ] = _val

		const index = expressions.indexOf( currentExpr )
		if ( index >= 0 ) {
			expressions.splice( index, 1 )
		}
		return result
	}, { vars: {}, expressions } )
}

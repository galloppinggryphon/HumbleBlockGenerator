'use strict'
import _ from 'lodash'

import {
	resolveTemplateStrings,
	resolveTemplateStringsRecursively,
	resolveRefsRecursively,
	resolveNestedVariables,
	reducer,
	isObj,
	kebabToCamelCase,
} from '../../../lib/utils.js'
import {
	logger, variablePrefix,
} from '../../generator-config.js'
import appData from '../../../app-data.js'
import { filterPropsByKeyPrefix, mergeProps, stringContainsUnresolvedRef, prefixer, filterObjKeys, hasPrefix } from '../../builder-utils.js'
import { BlockTemplateData, Props } from '../data-factories.js'
import { findMagicExpressionsInObj, getPropertyData, mergePresetData, parseMagicExpression } from './parser-utils.js'
import EventActionParser from './event-action-parser.js'

const { computedProp } = prefixer

/**
 * Preset builder.
 *
 * @param {CreateBlock.Block} block - Block data
 * @param {Object} props
 * @param {string} [props.presetName]
 * @param {Partial<PresetTemplate.TemplateData>} props.presetConfig Configuration data from block template
 * @param {Partial<PresetTemplate.TemplateData>} props.presetTemplate Preset template
 * @param {JSO} [props.customVars]
 * @param {any} [props.actionHooks]
 */
export default function PresetDataHandler( block, { presetName = undefined, presetConfig, presetTemplate, customVars = undefined, actionHooks = undefined } ) {
	const { source } = block.data

	/**
	 * @type {ReturnType<typeof EventActionParser>}
	 */
	// eslint-disable-next-line prefer-const
	let eventActionParser

	const defaultCustomVars = {
		// '%variant%': block.data.permutations.path.slice( -1 ),
	}

	const defaultActionHooks = {
		bone_visibility() {

		},
		permutations() {

		},
	}

	/**
	 * @type {Presets.PresetHandlerData}
	 */
	const presetHandlerData = {
		params: undefined,
		presetName,
		presetConfig,
		presetVars: undefined,
		customVars: customVars ?? defaultCustomVars,
		actionHooks: actionHooks ?? defaultActionHooks,
		presetTemplate,
	}

	/**
	 * @type {Presets.PresetHandler}
	 */
	const presetHandler = {
		data: presetHandlerData,

		get name() {
			return presetName
		},

		/**
		 * Get preset data (combined from block preset configuration and template)
		 */
		get params() {
			if ( ! this.data.params ) {
				// Merging of event templates is a special case
				this.data.params = mergePresetData( this.data.presetConfig, this.data.presetTemplate )
			}

			return this.data.params
		},

		/**
		 * Extract template variables from permutation data.
		 *
		 * Includes vars in preset params and presetTemplate.
		 */
		get presetVars() {
			if ( ! this.data.presetVars ) {
				// Extract template variables
				this.data.presetVars = filterPropsByKeyPrefix( this.params, variablePrefix )
			}

			return this.data.presetVars
		},

		get vars() {
			return { ...this.presetVars, ...source.vars, ...this.customVars, ...this.presetPropertyVars }
		},

		get customVars() {
			return this.data.customVars
		},

		get presetPropertyVars() {
			return Object.keys( this.params.properties ).reduce( ( result, key ) => {
				const _key = computedProp( key )
				const value = `{{prefix}}:${ key }`
				result[ _key ] = value
				result[ `${ _key }::query` ] = `query.block_property('${ value }')`
				// result[ `${ _key }::value` ] = value
				return result
			}, {} )
		},

		getParamByPath( ...path ) {
			const data = _.get( this.params, path )

			// if ( ! data ) {
			// 	throw new Error( `Invalid path '${ path.join( '.' ) }'.` )
			// }

			return data
		},

		clone() {
			const data = _.cloneDeep( this.data )
			return PresetDataHandler( block, data )
		},

		applyActionHook( hook, params ) {
			this.data.actionHooks[ hook ]( params )
		},

		setCustomVar( key, value ) {
			this.data.customVars[ key ] = value
		},

		setActionHook( hookName, func ) {
			this.data.actionHooks[ hookName ] = func
		},

		createPermutation( { block_props, key = undefined, condition = undefined } ) {
			const permutationHandler = presetHandler.clone()
			const permutationProps = BlockTemplateData( block_props )

			const permutation = {
				condition,
				props: Props( { ...permutationProps.props, ...permutationProps.dir } ),
			}

			permutationHandler.applyActionHook( 'permutations', { preset: permutationHandler, key, permutation } )

			const vars = { ...source.vars, ...permutationHandler.presetVars, ...permutationHandler.customVars, ...permutationProps.vars }

			permutation.condition = resolveTemplateStrings( permutation.condition, vars, { restrictChars: false } )
			resolveTemplateStringsRecursively( permutation.props, vars, { mutateSource: true, restrictChars: false } ) // todo: not proxy safe
			resolveRefsRecursively( permutation.props, vars, { variablePrefix, removeMissing: false, mutateSource: true } )

			block.addMinecraftPermutation( permutation.condition, permutation.props.export() )
		},

		createBoneVisibilityRules( boneVisibility ) {
			if ( ! boneVisibility ) {
				return
			}

			if ( stringContainsUnresolvedRef( boneVisibility ) ) {
				logger.error( `Unresolved variable in 'bone_visibility' in preset '${ this.name }'!`, { boneVisibility } )
				return
			}

			if ( ! this.params.bone_visibility_conditions ) {
				logger.error( `Missing property 'bone_visibility_conditions' in preset '${ this.name }'!` )
				return
			}

			Object.entries( boneVisibility ).forEach( ( [ property, values ] ) => {
				if ( stringContainsUnresolvedRef( values ) ) {
					logger.error( `Unresolved variable in 'bone_visibility' in preset '${ this.name }'!`, { boneVisibility } )
					return
				}

				if ( ! isObj( values ) ) {
					logger.error( `Invalid data in 'bone_visibility' in preset '${ this.name }'!`, { property, values } )
					return
				}

				// ~ Syntax alternatives
				// [1] bone: values[]
				// [2] value: bones[]
				const i = Object.keys( values )[ 0 ]
				const valueBonesSyntax = Number.isInteger( i && +i[ 0 ] )

				if ( ! valueBonesSyntax ) {
					Object.entries( values || {} ).forEach(
						( [ key, value ] ) => this.createBoneVisibilityRule( key, [ value ].flat(), property ),
					)
				}
				else {
					const entryArr = Array.from( new Set( [ ...Object.values( values ).flat() ] ) )
					const entries = entryArr.reduce( ( result, bone ) => (
						result[ bone ] = [],
						result
					), {} )

					reducer( values, ( result, [ key, bones ] ) => {
						bones.forEach( ( bone ) => {
							result[ bone ].push( +key )
						} )
						return result
					}, entries )

					Object.entries( entries || {} ).forEach(
						( [ key, value ] ) => this.createBoneVisibilityRule( key, value, property ),
					)
				}
			} )
		},

		createBoneVisibilityRule( bone, values, property ) {
			const boneVisibility = { bone, values, conditions: [] }
			const { bone_visibility_conditions } = this.params

			const vars = {
				[ computedProp( `property` ) ]: property,
			}

			const template = bone_visibility_conditions[ property ] ?? bone_visibility_conditions[ '*' ]

			// Generate conditions
			boneVisibility.values.reduce( ( result, value ) => {
				vars[ computedProp( `property.value` ) ] = value
				const condition = resolveTemplateStrings( template, vars, { restrictChars: false } )
				boneVisibility.conditions.push( condition )
				return result
			}, boneVisibility )

			this.applyActionHook( 'bone_visibility', { preset: presetHandler, boneVisibility } )

			boneVisibility.bone = resolveTemplateStrings( boneVisibility.bone, presetHandler.customVars )
			// resolveTemplateStringsRecursively( boneVisibility.conditions, vars, { mutateSource: true, restrictChars: false } )

			block.addBoneVisibility( boneVisibility.bone, boneVisibility.conditions )
		},

		createEvent( { action, eventName, handler, triggerCondition = undefined, triggerItems = undefined, params = undefined } ) {
			/**
			 * @type {Events.EventData}
			 */
			const eventData = {
				action: [],
				eventName,
				handler,
			}

			// Process variables
			if ( triggerCondition ) {
				// if ( ! triggerItems ) {
				// 	logger.error( `Error parsing event data: missing 'trigger_items'.`, { presetName, triggerCondition } )
				// }
				if ( stringContainsUnresolvedRef( triggerItems ) ) {
					logger.error( `Error parsing event data: unresolved variable in 'trigger_items'.`, { presetName, triggerItems, triggerCondition } )
				}
				else {
					eventData.condition = resolveTemplateStrings( triggerCondition, this.customVars, { restrictChars: false } )
				}
			}

			/**
			 * ~ Create event actions in one of three ways
			 * [1] Generate from event 'trigger_items'
			 * [2] Generate from event 'propertyList' list
			 * [3] Add actions without processing
			 */
			eventData.action = eventActionParser( { action, params } )

			// if ( propertyNames ) {
			// 	const { resolvedPropertyNames } = resolveRefsRecursively( { resolvedPropertyNames: propertyNames }, this.customVars, { mutateSource: true } )

			// 	// TODO: This code is possibly/probably non-functional
			// 	// throw new Error( 'MISSING IMPLEMENTATION: eventActionParser + propertyNames' )

			// 	const actions = [ resolvedPropertyNames ].flat().map(
			// 		( property ) => eventActionParser( { action, property } ),
			// 	)

			// 	eventData.action.push( ...actions[ 0 ] )
			// }
			// else {
			// 	eventData.action = eventActionParser( { action, params } )

			// 	// eventData.action = action
			// }

			block.addEvent( eventData )
		},

		checkRequiredParams() {
			// const argKeys = this.data.presetTemplate.required

			// // Merge defaults with params
			// Object.assign( this.data.presetData, this.data.presetTemplate.params )
			// const paramKeys = Object.keys( this.data.presetData )

			// // Do some checks
			// const missingKeys = argKeys.filter( ( key ) => ! paramKeys.includes( key ) )

			// if ( missingKeys.length ) {
			// 	logger.error( `Requested preset '${ presetName }' is missing required arguments: ${ missingKeys.join( ', ' ) }.` )
			// }
		},
	}

	eventActionParser = EventActionParser( presetHandler )
	resolvePresetVars()

	return presetHandler

	/**
	 * Replace all template strings and variables in preset data.
	 */
	function resolvePresetVars() {
		const { customVars: cVars, presetVars } = presetHandler
		const vars = { ...cVars, ...presetVars, ...source.vars }

		resolveNestedVariables( vars )

		resolveRefsRecursively( presetHandler.params, vars, { removeMissing: false, mutateSource: true } )
		resolveTemplateStringsRecursively( presetHandler.params, vars, { mutateSource: true } )

		// Filter null values
		const filterNullInObj = ( obj ) => {
			reducer( obj, ( result, [ key, value ] ) => {
				if ( value === null ) {
					delete result[ key ]
				}
				return result
			}, obj )
		}

		reducer( presetHandler.params, ( result, [ key, value ] ) => {
			if ( ! hasPrefix.variable( key ) && isObj( value ) ) {
				// logger.error( `The preset object '${ key }' contains a null or illegal value.`, value )
				filterNullInObj( value )
			}
			return result
		}, presetHandler.params )

		// objReduce( this.params, ( result, [ key, value ] ) => {
		// 	if ( ! hasPrefix.variable( key ) ) {
		// 		filterObjValues( result[ key ], null )
		// 	}
		// 	return result
		// }, this.params )

		// resolveRefsRecursively( this.data.presetTemplate, vars, { removeMissing: false, mutateSource: true } )
		// resolveTemplateStringsRecursively( this.data.presetTemplate, vars, { mutateSource: true } )
	}
// }
//
}

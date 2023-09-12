'use strict'
import _ from 'lodash'

import {
	resolveTemplateStrings,
	resolveTemplateStringsRecursively,
	resolveRefsRecursively,
	resolveNestedVariables,
	reducer,
	isObj,
	objForEach,
	objWalk,
} from '../../../lib/utils.js'
import {
	logger, variablePrefix,
} from '../../generator-config.js'
import appData from '../../../app-data.js'
import { filterPropsByKeyPrefix, mergeProps, stringContainsUnresolvedRef, prefixer, filterObjKeys, hasPrefix } from '../../builder-utils.js'
import { BlockTemplateData, Props } from '../data-factories.js'
import { mergePresetData } from './parser-utils.js'
import ComponentGenerator from './component-generator.js'

const log = console.log.bind( console )
const { computedProp } = prefixer

/**
 * Preset builder.
 *
 * @param {CreateBlock.Block} block - Block data
 * @param {Object} initData
 * @param {string} [initData.presetName]
 * @param {Partial<PresetTemplate.TemplateData>} initData.presetConfig Configuration data from block template
 * @param {Partial<PresetTemplate.TemplateData>} initData.presetTemplate Preset template
 * @param {JSO} [initData.customVars]
 * @param {any} [initData.actionHooks]
 * @param {boolean} [initData.skipInit]
 */
export default function PresetDataHandler( block, initData ) {
	const { presetName = undefined, presetConfig, presetTemplate, customVars = undefined, actionHooks = undefined, skipInit = false } = initData
	const { source } = block.data
	const { alias } = presetTemplate

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
		alias,
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
			// if ( ! this.data.presetVars ) {
			// 	// Extract template variables
			// 	this.data.presetVars = filterPropsByKeyPrefix( this.params, variablePrefix )
			// }

			return this.data.presetVars
		},

		get vars() {
			return { ...this.presetVars, ...source.vars, ...this.customVars, ...this.presetPropertyVars }
		},

		get customVars() {
			return this.data.customVars
		},

		get presetPropertyVars() {
			if ( ! this.params.states ) {
				return {}
			}

			return Object.keys( this.params.states ).reduce( ( result, key ) => {
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
			return PresetDataHandler( block, { ...data, skipInit: true } )
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

			try {
				permutation.condition = resolveTemplateStrings( permutation.condition, vars, { restrictChars: false } )
				resolveTemplateStringsRecursively( permutation.props, vars, { mutateSource: true, restrictChars: false, accumulateErrors: true } ) // todo: not proxy safe
				resolveRefsRecursively( permutation.props, vars, { variablePrefix, removeMissing: false, mutateSource: true } )
			}
			catch ( err ) {
				logger.error( err )
			}

			block.addMinecraftPermutation( permutation.condition, permutation.props.export() )
		},

		// ~~~ example (bone_visibility) ~~~
		// ForEach data: subvariant = [0,1,2,3]
		// valueSet = {
		// 		"0": ["nb", "c"],
		// 		"1": ["nm", "c"],
		// 		"2": ["nt", "c"]
		// }
		prepareBoneVisibilityRules() {
			const { vars } = this
			const bvVars = [ `$${ alias }:bone_visibility`, `$${ presetName }:bone_visibility` ]

			const bvVarKey =
				( bvVars[ 0 ] in vars && bvVars[ 0 ] )
				|| ( bvVars[ 1 ] in vars && bvVars[ 1 ] )

			const boneVisibility = vars[ bvVarKey ]

			block.data.boneVisibility ??= {}

			// let  boneVisibility = {}
			if ( boneVisibility ) {
				const staticRules = reducer( boneVisibility, ( result, [ key, value ] ) => {
					const valueArr = [ value ].flat()

					if ( ! key ) {
						result.push( ...valueArr )
						delete boneVisibility[ key ]
					}

					return result
				}, [] )

				const bvVarValues = parseBoneVisisibilityRules( boneVisibility )

				if ( staticRules.length ) {
					staticRules.forEach( ( key ) => {
						block.data.boneVisibility[ key ] = false
					} )
				}

				if ( bvVarValues ) {
					vars[ bvVarKey ] = bvVarValues
				}
			}

			if ( boneVisibility && Object.keys( boneVisibility ).length ) {
				const parser = ComponentGenerator( this )

				/** @type {JSO} */
				const items = parser.generateObject( presetHandler.params.bone_visibility )

				Object.assign( block.data.boneVisibility, items )
			}
		},

		createEvent( eventName, eventProps, action ) {
			// Process event
			const eventParser = ComponentGenerator( this )
			const event = eventParser.generateSingle( eventProps )

			const { handler, condition = undefined } = event

			/**
			 * @type {Events.EventData}
			 */
			const eventData = {
				action: [],
				eventName,
				handler,
			}

			// Process event trigger
			if ( condition ) {
				if ( stringContainsUnresolvedRef( condition ) ) {
					logger.error( `Error parsing event data: unresolved variable in 'condition'.`, { presetName, handler, condition } )
				}
				else {
					eventData.condition = resolveTemplateStrings( condition, this.customVars, { restrictChars: false } )
				}
			}

			const { event_handlers: eventHandlers } = presetHandler.params
			if ( ! ( handler in eventHandlers ) ) {
				logger.error( `Invalid handler '${ handler }' supplied in preset '${ presetName }'.` )
				return
			}

			const { generateArray, generateSingle } = ComponentGenerator( this )

			const resolvedAction = resolveRefsRecursively( action, presetHandler.vars )

			// Process event handler
			// Generate actions for multiple trigger items, if defined
			const actionCopy = _.cloneDeep( resolvedAction )
			const resolvedActions = actionCopy.reduce( ( actionArray, actionItem ) => {
				try {
					if ( 'for_each' in actionItem ) {
						const elements = generateArray( actionItem )
						if ( elements ) {
							actionArray.push( ...elements )
						}
					}
					else {
						const generatedAction = generateSingle( actionItem )
						actionArray.push( generatedAction )
					}
				}
				catch ( err ) {
					logger.error( `An error occurred while creating events from the preset '${ presetName }':\n\n${ err }\n`, { block: block.permutationInfo.path.join( '.' ), eventName, data: actionItem }, err )
				}

				return actionArray
			}, [] )

			eventData.action = resolvedActions

			block.addEvent( eventData )
		},

		prepareEvents() {
			// return
			const { events, event_handlers: eventHandlers } = presetHandler.params
			// return

			if ( ! events || ! Object.keys( events ).length ) {
				return
			}

			// Create events from prepared data
			Object.entries( events ).forEach( ( [ eventName, event ] ) => {
				if ( ! event ) {
					return
				}

				const { handler } = event

				if ( ! handler ) {
					return
				}

				if ( ! eventHandlers || ! eventHandlers[ handler ] ) {
					logger.error( `Could not find handler '${ handler }' in eventHandlers.`, { eventHandlers } )
					return
				}

				const { action } = eventHandlers[ handler ] ?? {}

				if ( ! action ) {
					logger.warn( `Problems were found in preset '${ presetName }'. Missing required key in event template: 'action'.` )
					return
				}

				presetHandler.createEvent( eventName, event, action )
			} )
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

	if ( ! skipInit ) {
		resolvePresetVars()
	}

	return presetHandler

	/**
	 * Replace all template strings and variables in preset data.
	 */
	function resolvePresetVars() {
		// Add block variables to presetHandler
		presetHandlerData.params = mergePresetData( presetHandlerData.presetConfig, presetHandlerData.presetTemplate )
		presetHandlerData.presetVars = filterPropsByKeyPrefix( presetHandlerData.params, variablePrefix )
		presetHandlerData.presetVars = mergePresetData( block.data.source.vars, presetHandlerData.presetVars )

		const { customVars: cVars, presetVars } = presetHandler
		const vars = { ...cVars, ...presetVars, ...source.vars }

		try {
			resolveNestedVariables( vars )
			resolveRefsRecursively( presetHandler.params, vars, { removeMissing: false, mutateSource: true } )
			resolveTemplateStringsRecursively( presetHandler.params, vars, { mutateSource: true, accumulateErrors: true } )
		}
		catch ( err ) {
			logger.error( err )
		}

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
	}
}

export function parseBoneVisisibilityRules( values ) {
	// return Object.entries( boneVisibility ).map( ( [ property, values ] ) => {
	if ( stringContainsUnresolvedRef( values ) ) {
		// logger.error( `Unresolved variable in 'bone_visibility' in preset '${ presetName }'!`, { boneVisibility } )
		return
	}

	// ~ Syntax alternatives
	// [1] bone: values[]
	// [2] value: bones[]
	const entryArr = Array.from( new Set( [ ...Object.values( values ).flat() ] ) )
	const entries = entryArr.reduce( ( result, bone ) => (
		result[ bone ] = [],
		result
	), {} )

	reducer( values, ( result, [ key, bones ] ) => {
		const boneArr = [ bones ].flat()
		boneArr.forEach( ( bone ) => {
			result[ bone ].push( key === '' ? false : key )
		} )
		return result
	}, entries )

	return entries
}

'use strict'
import _ from 'lodash'

import {
	resolveTemplateStrings,
	resolveTemplateStringsRecursively,
	resolveRefsRecursively,
	resolveNestedVariables,
	reducer,
	isObj,
} from '../../../lib/utils.js'
import {
	logger, variablePrefix,
} from '../../generator-config.js'
import appData from '../../../app-data.js'
import { filterPropsByKeyPrefix, mergeProps, stringContainsUnresolvedRef, prefixer, filterObjKeys, hasPrefix } from '../../builder-utils.js'
import { BlockTemplateData, Props } from '../data-factories.js'

const { computedProp } = prefixer

/**
 * Process blockData data and inject template snippets.
 *
 * @param {CreateBlock.Block} block
 */
export function parsePresets( block ) {
	const { presets, presetScripts } = appData.generatorData
	const { dir } = block.data.source

	if ( ! dir.apply ) {
		return
	}

	// Walk through presets collection
	dir.apply.forEach( ( presetTemplateData ) => {
		if ( ! presetTemplateData ) {
			return
		}

		const presetName = presetTemplateData.preset

		// Template is disabled
		if ( presetTemplateData === false || presetTemplateData?.disabled ) {
			logger.error( `Skipping disabled preset '${ presetName }'.` )
			return
		}

		if ( ! presets ) {
			logger.error(
				`Cannot apply preset '${ presetName }': no preset file is loaded.`,
			)
			return
		}

		if ( ! ( presetName in presets ) ) {
			logger.error( `Preset not found: '${ presetName }'.` )
			return
		}

		// Check if the preset should be disabled
		if ( presetTemplateData.config.disabled === true ) {
			return
		}

		const template = {
			data: _.cloneDeep( presets[ presetName ] ) ?? {},
		}

		// Check if the preset is based on another
		// Then merge child and parent configs
		// Templates can be nested
		if ( 'parent' in template.data ) {
			// eslint-disable-next-line no-constant-condition
			while ( true ) {
				const { parent } = template.data
				if ( ! parent ) {
					break
				}

				delete template.data.parent
				const parentTemplate = _.cloneDeep( presets[ parent ] )
				template.data = mergePresetData( parentTemplate, template.data )
			}

			// template.value = mergeProps( parent, template.value, { overwriteArrays: true, mergeKeys: [ 'action', s'permutation_tempslates' ] } )
			// template.value = [ 'params', 'templates' ].reduce( ( result, key ) => {
			// 	result[ key ] = {
			// 		...parent[ key ] ?? {},
			// 		...template.value[ key ] ?? {},
			// 	}
			// 	return result
			// }, { handler: parent.handler, '__parent__': template.value[ 'parent' ] } )
		}

		else if ( typeof presetTemplateData.config === 'string' ) {
			// Check if a feature variation is requested - and if it exists
			const { config } = presetTemplateData
			if ( config ) {
				if ( ! ( config in template.data ) ) {
					logger.error(
						`Preset subtype '${ config }' not found in preset '${ presetName }'.`,
					)
					return
				}

				template.data = template.data[ config ]
			}
		}

		// Check if a handler is specified
		const { handler } = template.data

		if ( handler ) {
			if ( ! ( handler in presetScripts ) ) {
				logger.error(
					`Invalid (missing) preset handler '${ handler }' is specified in preset '${ presetName }.'`,
				)
				return
			}

			const presetTemplate = _.cloneDeep( template.data )
			const presetData = PresetDataHandler( block, { presetName, presetTemplate, presetConfig: presetTemplateData.config } )

			presetScripts[ handler ]( {
				block,
				presetData,
				presetTemplate,
			} )

			// applyPresetHandler( { handler, data: presetConfig.config, presetName: preset, template: template.value } )
		}
		else {
			const presetData = BlockTemplateData( template.data )
			mergeProps( block.data.source, presetData )
		}
	} )
}

/**
 * Preset builder.
 *
 * @param {CreateBlock.Block} block - Block data
 * @param {Object} props
 * @param {string} [props.presetName]
 * @param {Partial<PresetTemplate>} props.presetConfig Configuration data from block template
 * @param {Partial<PresetTemplate>} props.presetTemplate Preset template
 * @param {JSO} [props.customVars]
 * @param {any} [props.actionHooks]
 */
export function PresetDataHandler( block, { presetName = undefined, presetConfig, presetTemplate, customVars = undefined, actionHooks = undefined } ) {
	const { source } = block.data

	const defaultCustomVars = {
		// '%variant%': block.data.permutations.path.slice( -1 ),
	}

	const defaultActionHooks = {
		part_visibility() {

		},
		permutations() {

		},
	}

	/**
	 * @type {PresetHandlerData}
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
	 * @type {PresetHandler}
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

				const { event_templates: eventTemplateConfig, ...presetConfigData } = this.data.presetConfig

				const { event_templates: eventTemplates, ...presetTemplateData } = this.data.presetTemplate

				this.data.params = mergePresetData( presetTemplateData, presetConfigData )
				this.data.params.event_templates = mergeEventTemplates( eventTemplates, eventTemplateConfig )
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

		get customVars() {
			return this.data.customVars
		},

		get presetPropertyVars() {
			return Object.keys( this.params.properties ).reduce( ( result, key ) => {
				const _key = computedProp( key )
				const value = `{{prefix}}:${ key }`
				result[ _key ] = value
				result[ `${ _key }.query` ] = `query.block_property('${ value }')`
				return result
			}, {} )
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

		createPermutations( permutations ) {
			// If necessary, transform key-value permutations data to array
			const permutationsArr = Array.isArray( permutations )
				? permutations
				: Object.entries( permutations ).map( ( [ key, block_props ] ) => /** @type {McPermutationTemplate} */ ( { key, block_props } ) )

			permutationsArr.forEach(
				( { condition, key, block_props } ) => this.createPermutation( { condition, block_props, key } )
				, this,
			)
		},

		createPermutation( { block_props, key = undefined, condition = undefined } ) {
			const permutationHandler = presetHandler.clone()
			const permutationProps = BlockTemplateData( block_props )

			const permutation = {
				condition,
				props: Props( { ...permutationProps.props, ...permutationProps.dir } ),
			}

			permutationHandler.applyActionHook( 'permutations', { preset: permutationHandler, key, permutation } )

			const vars = { ...source.vars, ...permutationHandler.presetVars, ...permutationHandler.customVars, ...permutationProps.vars, ...permutationHandler.presetPropertyVars }

			permutation.condition = resolveTemplateStrings( permutation.condition, vars, { restrictChars: false } )
			resolveTemplateStringsRecursively( permutation.props, vars, { mutateSource: true, restrictChars: false } ) // todo: not proxy safe
			resolveRefsRecursively( permutation.props, vars, { variablePrefix, removeMissing: false, mutateSource: true } )

			block.addMinecraftPermutation( permutation.condition, permutation.props.export() )
		},

		createPartVisibilityRules( partVisibility ) {
			if ( ! partVisibility ) {
				return
			}

			if ( stringContainsUnresolvedRef( partVisibility ) ) {
				logger.error( `Unresolved variable in 'part_visibility' in preset '${ this.name }'!`, { partVisibility } )
				return
			}

			if ( ! this.params.part_visibility_conditions ) {
				logger.error( `Missing property 'part_visibility_conditions' in preset '${ this.name }'!` )
				return
			}

			Object.entries( partVisibility ).forEach( ( [ property, values ] ) => {
				if ( stringContainsUnresolvedRef( values ) ) {
					logger.error( `Unresolved variable in 'part_visibility' in preset '${ this.name }'!`, { partVisibility } )
					return
				}

				if ( ! isObj( values ) ) {
					logger.error( `Invalid data in 'part_visibility' in preset '${ this.name }'!`, { property, values } )
					return
				}

				// ~ Syntax alternatives
				// [1] bone: values[]
				// [2] value: bones[]
				const i = Object.keys( values )[ 0 ]
				const valueBonesSyntax = Number.isInteger( i && +i[ 0 ] )

				if ( ! valueBonesSyntax ) {
					Object.entries( values || {} ).forEach(
						( [ key, value ] ) => this.createPartVisibilityRule( key, [ value ].flat(), property ),
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
						( [ key, value ] ) => this.createPartVisibilityRule( key, value, property ),
					)
				}
			} )
		},

		createPartVisibilityRule( bone, values, property ) {
			const partVisibility = { bone, values, conditions: [] }
			const { part_visibility_conditions } = this.params

			const vars = {
				[ computedProp( `property` ) ]: property,
			}

			const template = part_visibility_conditions[ property ] ?? part_visibility_conditions[ '*' ]

			// Generate conditions
			partVisibility.values.reduce( ( result, value ) => {
				vars[ computedProp( `property.value` ) ] = value
				const condition = resolveTemplateStrings( template, vars, { restrictChars: false } )
				partVisibility.conditions.push( condition )
				return result
			}, partVisibility )

			this.applyActionHook( 'part_visibility', { preset: presetHandler, partVisibility } )

			partVisibility.bone = resolveTemplateStrings( partVisibility.bone, presetHandler.customVars )
			// resolveTemplateStringsRecursively( partVisibility.conditions, vars, { mutateSource: true, restrictChars: false } )

			block.addPartVisibility( partVisibility.bone, partVisibility.conditions )
		},

		/**
		 * Create events. Receives preset directives `@events`, `@event_templates` and `@properties`.
		 */
		createEvents( { events, eventTemplates, properties } ) {
			/** @type {string[]} */
			const triggerItemList = []

			/** @type {JSO<Partial<PresetEventData>>} */
			const eventList = {}

			// Create array of trigger items
			// reducer( events, ( result, [ key, value ] ) => {
			// 	const [ event, property ] = key.split( '.' )
			// 	result.config[ event ] ??= {}
			// 	result.config[ event ][ property ] = value

			// 	if ( property === 'trigger_items' && isObj( value ) ) {
			// 		result.triggerItems.push( ...Object.values( value ) )
			// 	}

			// 	return result
			// }, eventList )

			for ( const [ key, value ] of Object.entries( events ) ) {
				const [ eventTrigger, property ] = key.split( '.' )

				eventList[ eventTrigger ] = eventList[ eventTrigger ] ?? { eventTrigger }
				const eventData = eventList[ eventTrigger ]

				// Normalize JSON key names (to camel-case)
				const normalizedProperty =
					( property === 'property_names' && 'propertyNames' )
					|| ( property === 'trigger_items' && 'triggerItems' )
					|| property

				if ( property === 'trigger_items' ) {
					if ( isObj( value ) ) {
						eventData[ normalizedProperty ] = value
						triggerItemList.push( ...Object.values( value ) )
					}
				}
				else if ( property ) {
					eventData[ normalizedProperty ] = value
				}
			}

			// Resolve computed properties %trigger_items.* (used in event_templates) with values from trigger items array
			if ( triggerItemList.length ) {
				const items = Array.from( new Set( triggerItemList ) )

				this.setCustomVar(
					computedProp( `trigger_items.list` ),
					items
						.map( ( val ) => `'${ val }'` )
						.join( ',' ),
				)

				this.setCustomVar(
					computedProp( `trigger_items.array` ),
					items,
				)
			}

			// Resolve computed property %properties.array = list of custom block properties
			if ( properties ) {
				this.setCustomVar(
					computedProp( `properties.array` ),
					[ Object.keys( properties ) ].flat(),
				)
			}

			// Create events from prepared data
			Object.values( eventList ).forEach( ( event ) => {
				const { eventTrigger, handler, propertyNames, triggerItems } = event
				if ( ! handler ) {
					return
				}

				const eventTemplate = eventTemplates[ handler ]
				this.createEvent( { eventTrigger, handler, eventTemplate, propertyNames, triggerItems } )
			} )
		},

		createEvent( { eventTrigger, handler, propertyNames = undefined, triggerItems = undefined, eventTemplate = undefined } ) {
			if ( eventTemplate && ! ( 'action' in eventTemplate ) ) {
				logger.error( `Problems were found in preset '${ presetName }'. Missing required key in event template: 'action'.` )
				return
			}

			/**
			 * @type {EventTemplate}
			 */
			const eventData = {
				action: [],
			}

			eventData.eventTrigger = eventTrigger
			eventData.handler = handler

			const vars = {
				// ...block.data.extraVars,
				...this.customVars,
				// ...this.presetVars,
			}

			// Process variables
			if ( eventTemplate.condition ) {
				if ( ! triggerItems ) {
					logger.error( `Error parsing event data: missing 'trigger_items'.`, { presetName, condition: eventTemplate.condition } )
				}
				else if ( stringContainsUnresolvedRef( triggerItems ) ) {
					logger.error( `Error parsing event data: unresolved variable in 'trigger_items'.`, { presetName, triggerItems, condition: eventTemplate.condition } )
				}
				else {
					eventData.condition = resolveTemplateStrings( eventTemplate.condition, vars, { restrictChars: false } )

					// const eVars = {
					// 	...vars,
					// 	[ calculatedProp( `trigger_items.list` ) ]: [ Object.keys( triggerItems ) ].flat(),

					// // [ calculatedProp( `trigger_item` ) ]: triggerItems[ params.property ],
					// // [ calculatedProp( `property` ) ]: params.property,
					// }
					// eventData.condition = eventTemplate.condition// resolveTemplateStrings( eventTemplate.condition, eVars, { restrictChars: false } )
				}
			}

			/**
			 * ~ Create event actions in one of three ways
			 * [1] Generate from event 'trigger_items'
			 * [2] Generate from event 'propertyList' list
			 * [3] Add actions without processing
			 */
			if ( triggerItems ) {
				reducer( this.params.properties, ( result, [ property ] ) => {
					const triggerItem = triggerItems[ property ]
					if ( ! triggerItem ) {
						return result
					}

					const actions = eventActionParser( { action, property, triggerItem } )
					result.push( ...actions )
					return result
				}, eventData.action )
			}
			else if ( propertyNames ) {
				const { resolvedPropertyNames } = resolveRefsRecursively( { resolvedPropertyNames: propertyNames }, this.customVars, { mutateSource: true } )

				const actions = [ resolvedPropertyNames ].flat().map(
					( property ) => eventActionParser( { action, property } ),
				)

				eventData.action.push( ...actions[ 0 ] )
			}
			else {
				eventData.action = eventTemplate?.action
			}

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

	/**
	 * Resolve variables in event action definitions.
	 *
	 * @param {{ action: JSO, triggerItem?: string, propData: JSO }} props
	 */
	function resolveEventActionVariables( { action, propData, triggerItem = undefined } ) {
		const eVars = {
			[ computedProp( `trigger_item` ) ]: triggerItem && resolveTemplateStrings( triggerItem, presetHandler.customVars ),

			...propData
				? {
					[ computedProp( `property` ) ]: propData.property,
					[ computedProp( `property.query` ) ]: propData.query,
					[ computedProp( `properties.max` ) ]: propData.max,
					[ computedProp( `properties.min` ) ]: propData.min,
				}
				: {},
		}

		return resolveTemplateStringsRecursively( action, eVars, { restrictChars: false } )
	}

	/**
	 * Action generator
	 * @param {{action: Events.ActionItem[], property: string, triggerItem?: string}} param0
	 */
	function eventActionParser( { action, property, triggerItem = undefined } ) {
		const propData = getPresetPropertyMeta( property )

		let actionArray = []

		// Generate actions for multiple trigger items, if defined
		actionArray = _.cloneDeep( action )
		const resolvedActions = actionArray.map( ( item ) => {
			return resolveEventActionVariables( { propData, action: item, triggerItem } )
		} )
		return resolvedActions
	}

	/**
	 * Parse meta data for a custom property.
	 *
	 * @param {string} property
	 */
	function getPresetPropertyMeta( property ) {
		const values = presetHandler.params.properties[ property ]
		if ( ! values ) {
			logger.error( `Invalid values for property '${ property }' in preset '${ presetName }'.` )
			return
		}

		const data = {
			key: property,
			property: `{{prefix}}:${ property }`,
			query: `query.block_property('{{prefix}}:${ property }')`,
			get max() {
				return Math.max( ...values )
			},
			get min() {
				return Math.min( ...values )
			},
		}

		return data
	}
}

/**
 * Overwrite source with values in target. Merge objects.
 *
 * @template {JSO} Source
 * template {JSO} Target
 * @param {Source} source
 * @param {JSO} target
 */
function mergePresetData( source, target ) {
	const _target = _.cloneDeep( target )

	const specialHandlers = {
		permutation_templates( srcVal, trgVal ) {
			return [ ...trgVal ?? [], ...srcVal ]
		},
	}

	const keys = new Set( [ ...Object.keys( target ), ...Object.keys( source ) ] )

	return [ ...keys ].reduce( ( result, key ) => {
		const srcVal = source[ key ]

		const trgVal = result[ key ]
		if ( trgVal === undefined ) {
			result[ key ] = srcVal
			return result
		}

		if ( ! ( key in source ) || _.isNil( srcVal ) ) {
			return result
		}

		if ( trgVal === null ) {
			return result
		}

		if ( ! isObj( trgVal ) ) {
			return result
		}

		if ( key in specialHandlers ) {
			result[ key ] = specialHandlers[ key ]( srcVal, trgVal )
		}
		else if ( isObj( srcVal ) ) {
			result[ key ] = mergePresetData( srcVal, trgVal ) // Object.assign( srcVal, trgVal )
		}

		return result
	}, _target )
}

/**
 * Merging of event templates is a special case
 * - If source == array: merge
 * - If source == object: overwrite
 *
 * @param {JSO<PresetEventTemplate>} target
 * @param {JSO<PresetEventTemplate>} source
 */
function mergeEventTemplates( target, source ) {
	if ( ! source ) {
		return target
	}
	if ( ! target || ! Array.isArray( source ) ) {
		return source
	}

	const eventTemplates = source.reduce( ( result, obj ) => {
		for ( const [ eventTrigger, props ] of Object.entries( obj ) ) {
			result[ eventTrigger ] = props
		}
		return result
	}, target )

	return eventTemplates
}

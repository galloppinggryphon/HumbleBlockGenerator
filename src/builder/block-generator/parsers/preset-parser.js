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
	calculatedPropPrefix,
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
			// if ( ! ( handler in presetScripts ) ) {
			// 	logger.error(
			// 		`Invalid (missing) preset handler '${ handler }' is specified in preset '${ presetName }.'`,
			// 	)
			// 	return
			// }

			const presetTemplate = _.cloneDeep( template.data )
			const presetData = PresetDataHandler( block, { presetName, presetTemplate, presetConfig: presetTemplateData.config } )

			// ! All presets now use the basePreset handler!
			resolvePreset( {
				block,
				presetData,
				// presetTemplate,
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
 * @param {Partial<PresetTemplate.TemplateData>} props.presetConfig Configuration data from block template
 * @param {Partial<PresetTemplate.TemplateData>} props.presetTemplate Preset template
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

				const { event_handler_templates: eventHandlerConfig, ...presetConfigData } = this.data.presetConfig

				const { event_handler_templates: eventHandlerTemplates, ...presetTemplateData } = this.data.presetTemplate

				this.data.params = mergePresetData( presetTemplateData, presetConfigData )
				this.data.params.event_handler_templates = mergeEventHandlerTemplates( eventHandlerTemplates, eventHandlerConfig )
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
		 * Create events. Receives preset directives `@events`, `@event_handler_templates` and `@properties`.
		 */
		createEvents( { events, eventHandlers, properties } ) {
			/** @type {string[]} */
			const triggerItemList = []

			/** @type {JSO<Partial<Events.EventData>>} */
			const eventData = {}

			// Parse @events
			for ( const [ eventTrigger, props ] of Object.entries( events ) ) {
				eventData[ eventTrigger ] = eventData[ eventTrigger ] ?? { eventTrigger }
				const eventItem = eventData[ eventTrigger ]

				for ( const [ rawProperty, value ] of Object.entries( props ) ) {
					// Normalize JSON key names
					const property = kebabToCamelCase( rawProperty )

					if ( property === 'triggerItems' ) {
						if ( isObj( value ) ) {
							eventItem[ property ] = value
							triggerItemList.push( ...Object.values( value ) )
						}
					}
					else {
						eventItem[ property ] = value
					}
				}
			}

			// Normalize eventHandlers
			Object.entries( eventHandlers ).reduce( ( result, [ key, value ] ) => {
				for ( const property of Object.keys( value ) ) {
					const _prop = kebabToCamelCase( property )
					if ( _prop !== property ) {
						result[ key ][ _prop ] = value[ property ]
						delete result[ key ][ property ]
					}
				}
				return result
			}, eventHandlers )

			// Resolve computed properties %trigger_items.* (used in event_handler_templates and events.condition) with values from trigger items array
			if ( triggerItemList.length ) {
				const items = Array.from( new Set( triggerItemList ) )
				this.setCustomVar(
					// Comma-separated string
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
			Object.values( eventData ).forEach( ( event ) => {
				const { eventTrigger, handler, propertyNames, triggerItems, condition } = event
				if ( ! handler ) {
					return
				}

				const { triggerCondition, action } = eventHandlers[ handler ] ?? {}

				if ( ! action ) {
					logger.error( `Problems were found in preset '${ presetName }'. Missing required key in event template: 'action'.` )
					return
				}

				this.createEvent( { triggerCondition: condition ?? triggerCondition, action, eventTrigger, handler, propertyNames, triggerItems } )
			} )
		},

		createEvent( { action, eventTrigger, handler, triggerCondition = undefined, propertyNames = undefined, triggerItems = undefined } ) {
			/**
			 * @type {Events.EventData}
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
			if ( triggerCondition ) {
				if ( ! triggerItems ) {
					logger.error( `Error parsing event data: missing 'trigger_items'.`, { presetName, triggerCondition } )
				}
				else if ( stringContainsUnresolvedRef( triggerItems ) ) {
					logger.error( `Error parsing event data: unresolved variable in 'trigger_items'.`, { presetName, triggerItems, triggerCondition } )
				}
				else {
					eventData.condition = resolveTemplateStrings( triggerCondition, vars, { restrictChars: false } )

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
				eventData.action = action
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
// }
//
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
	 *
 * @param {Object} props
 * @param {CreateBlock.Block} props.block
 * @param {Presets.PresetHandler} props.presetData
 *
	 */
export function resolvePreset( { block, presetData } ) {
	const { permutations, permutation_templates, events, event_handler_templates, properties, part_visibility } = presetData.params

	// ~ Generate custom state values
	Object.entries( properties ).forEach( ( [ property, values ] ) => {
		if ( values === false ) {
			return
		}
		if ( ! Array.isArray( values ) ) {
			logger.error( `Invalid values (expected an array) for custom property '${ property }' created by preset '${ presetData.name }'.`, { values } )
			return
		}

		block.addProperty( property, values )
	} )

	// ~ Add events based on @events, @event_handler_templates and @properties
	if ( events && Object.keys( events ) ) {
		presetData.createEvents( { events, eventHandlers: event_handler_templates, properties } )
}

	// ~ Parse permutation templates
	if ( permutations ) {
		// 	logger.error( `Missing 'permutations' property for preset '${ presetData.name }'.`, { permutations } )
		// 	return
		// }

		if ( ! isObj( permutations ) ) {
			logger.error( `Invalid 'permutations' property for preset '${ presetData.name }'.`, { permutations } )
			return
	}

		/** @type {McPermutationTemplate[]} */
		const compiledPermutations = []

		// Check validity and combine key-value permutations template with permutation values, transform to array of permutations
		const presetPermutations = permutation_templates.reduce( ( result, template ) => {
			const permutationValueArray = template.properties
				.map( ( key ) => {
					const data = permutations[ key ]

					if ( data === null ) {
						return
					}

					if ( ! data ) {
						logger.error( `Missing permutations data for custom property '${ key }' in preset '${ presetData.name }'.`, { permutations } )
					}
					else if ( ! isObj( data ) ) {
						logger.error( `Invalid permutations data supplied for custom property '${ key }' in preset '${ presetData.name }'.`, { data } )
		}

					return {
						property: key,
						data: permutations[ key ] ?? {},
		}
				} )
				.filter( ( x ) => x )

			const permutationTemplate = {
				condition: template.condition,
				block_props: template.block_props,
		}

			const newPermutations = generateMcPermutations( block, permutationTemplate, permutationValueArray )
			result.push( ...newPermutations )
			return result
		}, compiledPermutations )

		presetData.createPermutations( presetPermutations )
		}

	// ~ Add part visibility mapping
	if ( part_visibility ) {
		presetData.createPartVisibilityRules( part_visibility )
		}

	return block
}

/**
 * Generate permutations from array of permutation values
 *
 * @param {CreateBlock.Block} block
 * @param {CreateBlock.MCPermutationTemplate} permutionTemplate
 * @param {JSO[]} permutationValues
 * @param {CreateBlock.MCPermutationTemplate[]} result
 */
function generateMcPermutations( block, permutionTemplate, permutationValues, result = [] ) {
	const permutationTemplateCopy = _.cloneDeep( permutionTemplate )

	// Grab next set of permutation values in the pipeline
	const currentPermutationValues = permutationValues.pop()

	Object.entries( currentPermutationValues.data ).forEach( ( [ key, props ] ) => {
		const newPermutation = _.cloneDeep( permutationTemplateCopy )
		Object.assign( newPermutation.block_props, props )

		// Add temporary data
		newPermutation.block_props[ prefixer.computedProp( `${ currentPermutationValues.property }.value` ) ] = key

		if ( permutationValues.length ) {
			generateMcPermutations( block, newPermutation, _.cloneDeep( permutationValues ), result )
	}
		else {
			// Extract variables
			const permutationVars = filterPropsByKeyPrefix( newPermutation.block_props, [ variablePrefix, calculatedPropPrefix ] )
			const vars = {
				...block.data.source.vars,
				...block.data.extraVars,
				...permutationVars,
	}

			// Substitute variables
			resolveNestedVariables( vars )
			resolveTemplateStringsRecursively( newPermutation, vars, { mutateSource: true, restrictChars: false } )
			resolveRefsRecursively( newPermutation, vars, { mutateSource: true } )

			// Remove variables
			filterObjKeys( newPermutation.block_props, /^[^\w]/ )

			result.push( newPermutation )
		}
	} )
		return result
}

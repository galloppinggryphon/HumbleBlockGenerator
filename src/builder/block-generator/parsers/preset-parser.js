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
	dir.apply.forEach( ( presetConfig ) => {
		if ( ! presetConfig ) {
			return
		}

		const presetName = presetConfig.preset

		// Template is disabled
		if ( presetConfig === false || presetConfig?.disabled ) {
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
		if ( presetConfig.config.disabled === true ) {
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

		else if ( typeof presetConfig.config === 'string' ) {
			// Check if a feature variation is requested - and if it exists
			const { config } = presetConfig
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
			const presetData = PresetDataHandler( block, { presetName, presetTemplate, presetData: presetConfig.config } )

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
 *
 * @param {CreateBlock.Block} block
 * @param {Object} props
 * @param {string} [props.presetName]
 * @param {Partial<PresetTemplate>} props.presetData
 * @param {Partial<PresetTemplate>} props.presetTemplate
 * @param {JSO} [props.customVars]
 * @param {any} [props.actionHooks]
 */
export function PresetDataHandler( block, { presetName = undefined, presetData, presetTemplate, customVars = undefined, actionHooks = undefined } ) {
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
		presetData,
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
		 * Get preset params (combined from data and template)
		 */
		get params() {
			if ( ! this.data.params ) {
				// @ts-ignore
				this.data.params = mergePresetData( this.data.presetTemplate, this.data.presetData )
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

		/**
		 * Replace all template strings and variables in preset data.
		 */
		resolvePresetVars() {
			const { customVars: cVars, presetVars } = presetHandler
			const vars = { ...cVars, ...presetVars, ...source.vars }

			resolveNestedVariables( vars )

			resolveRefsRecursively( this.params, vars, { removeMissing: false, mutateSource: true } )
			resolveTemplateStringsRecursively( this.params, vars, { mutateSource: true } )

			// Filter null values
			const filterNullInObj = ( obj ) => {
				reducer( obj, ( result, [ key, value ] ) => {
					if ( value === null ) {
						delete result[ key ]
					}
					return result
				}, obj )
			}
			reducer( this.params, ( result, [ key, value ] ) => {
				if ( ! hasPrefix.variable( key ) && isObj( value ) ) {
					filterNullInObj( value )
				}
				return result
			}, this.params )

			// objReduce( this.params, ( result, [ key, value ] ) => {
			// 	if ( ! hasPrefix.variable( key ) ) {
			// 		filterObjValues( result[ key ], null )
			// 	}
			// 	return result
			// }, this.params )

			// resolveRefsRecursively( this.data.presetTemplate, vars, { removeMissing: false, mutateSource: true } )
			// resolveTemplateStringsRecursively( this.data.presetTemplate, vars, { mutateSource: true } )
		},

		/**
		 * Property meta data.
		 *
		 * @param {string} property
		 */
		getPresetPropertyData( property ) {
			const values = this.params.properties[ property ]

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

		createEvents( { events, eventTemplates, properties } ) {
			/** @type {{config: JSO<EventData>, triggerItems: string[], properties: string[] }} */
			const eventData = { config: {}, triggerItems: [], properties: [] }

			reducer( events, ( result, [ key, value ] ) => {
				const [ event, property ] = key.split( '.' )
				result.config[ event ] ??= {}
				result.config[ event ][ property ] = value

				if ( property === 'trigger_items' && isObj( value ) ) {
					result.triggerItems.push( ...Object.values( value ) )
				}

				return result
			}, eventData )

			if ( eventData.triggerItems.length ) {
				const items = Array.from( new Set( eventData.triggerItems ) )

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

			if ( properties ) {
				this.setCustomVar(
					computedProp( `properties.array` ),
					[ Object.keys( properties ) ].flat(),
				)
			}

			Object.entries( eventData.config ).forEach( ( [ event, config ] ) => {
				const { handler, properties: props, trigger_items } = config
				if ( ! handler ) {
					return
				}

				const eventTemplate = eventTemplates[ handler ]
				this.createEvent( { event, handler, eventTemplate, properties: props, triggerItems: trigger_items } )
			} )
		},

		createEvent( { event, handler, properties = undefined, triggerItems = undefined, eventTemplate = undefined } ) {
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

			eventData.event = event
			eventData.handler = handler

			const { params } = this

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

			// Create event actions for each event
			// trigger_items are mapped to properties
			const generateEventAction = ( { action, triggerItem = undefined, propData } ) => {
				const eVars = {
					[ computedProp( `trigger_item` ) ]: triggerItem && resolveTemplateStrings( triggerItem, vars ),

					...propData
						? {
							[ computedProp( `property` ) ]: propData.property,
							[ computedProp( `property.query` ) ]: propData.query,
							[ computedProp( `property.max` ) ]: propData.max,
							[ computedProp( `property.min` ) ]: propData.min,
						}
						: {},
				}

				return resolveTemplateStringsRecursively( action, eVars, { restrictChars: false } )
			}

			const generateAction = ( { property, triggerItem = undefined } ) => {
				const propData = this.getPresetPropertyData( property )

				// Generate actions for multiple trigger items, if defined
				const template = _.cloneDeep( eventTemplate )
				const actions = template?.action.map( ( action ) => {
					return generateEventAction( { propData, action, triggerItem } )
				} )
				return actions
			}

			// Create event actions in two ways
			// [1] Generate froms 'properties', OR
			// [2] Generate from 'trigger_items'
			if ( triggerItems ) {
				reducer( params.properties, ( result, [ property ] ) => {
					const triggerItem = triggerItems[ property ]
					if ( ! triggerItem ) {
						return result
					}
					const actions = generateAction( { property, triggerItem } )
					result.push( ...actions )
					return result
				}, eventData.action )
			}
			else if ( properties ) {
				const { properties: resolvedProps } = resolveRefsRecursively( { properties }, this.customVars, { mutateSource: true } )
				const propsArr = [ resolvedProps ].flat()
				const actions = propsArr.map( ( property ) => generateAction( { property } ) )
				eventData.action.push( ...actions[ 0 ] )
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

	presetHandler.resolvePresetVars()

	return presetHandler
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

	const keys = [ ...Object.keys( target ), ...Object.keys( source ) ]

	return keys.reduce( ( result, key ) => {
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
			// delete trg[ key ]
			// trg[ key ] = null
			return result
		}

		if ( ! isObj( trgVal ) ) {
			return result
		}
		if ( key === 'permutation_templates' ) {
			result[ key ] = [ ...trgVal ?? [], ...srcVal ]
		}
		else if ( isObj( srcVal ) ) {
			result[ key ] = Object.assign( srcVal, trgVal )
		}

		return result
	}, _target )
}

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

			// this.applyActionHook( 'part_visibility', { preset: presetHandler, boneVisibility } )

			partVisibility.bone = resolveTemplateStrings( partVisibility.bone, presetHandler.customVars )
			// resolveTemplateStringsRecursively( boneVisibility.conditions, vars, { mutateSource: true, restrictChars: false } )

			block.addPartVisibility( partVisibility.bone, partVisibility.conditions )
		},

		createEvent( { action, eventName, handler, condition = undefined, params = undefined } ) {
			/**
			 * @type {Events.EventData}
			 */
			const eventData = {
				action: [],
				eventName,
				handler,
			}

			// Process variables
			if ( condition ) {
				if ( stringContainsUnresolvedRef( condition ) ) {
					logger.error( `Error parsing event data: unresolved variable in 'condition'.`, { presetName, handler, condition } )
				}
				else {
					eventData.condition = resolveTemplateStrings( condition, this.customVars, { restrictChars: false } )
				}
			}

			eventData.action = eventActionParser( { action, params } )

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

	if ( ! skipInit ) {
		eventActionParser = EventActionParser( presetHandler )
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
function parseBoneVisisibilityRules( values ) {
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
		bones.forEach( ( bone ) => {
			result[ bone ].push( key === '' ? false : key )
		} )
		return result
	}, entries )

	return entries
}

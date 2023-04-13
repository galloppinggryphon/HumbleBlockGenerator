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
 * getTemplateData
 *
 * @param {*} presetNames
 */
function getTemplateData( presetNames ) {
	const { presets } = appData.generatorData
	const template = { data: _.cloneDeep( presets.base_preset ) }

	presetNames.reduce( ( target, key ) => {
		const source = _.cloneDeep( presets[ key ] )
		delete source.parent

		// Load the root as the base template
		target.data = mergePresetData( source, target.data )
		return target
	}, template )

	return template.data
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

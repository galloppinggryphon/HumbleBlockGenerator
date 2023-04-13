'use strict'

import { arrayMerge, isObj, log, reducer, resolveTemplateStrings, resolveTemplateStringsRecursively, resolveRefsRecursively, resolveNestedVariables } from '../../../lib/utils.js'
import { calculatedPropPrefix, logger, variablePrefix } from '../../generator-config.js'
import _ from 'lodash'
import { filterObjKeys, filterPropsByKeyPrefix, prefixer } from '../../builder-utils.js'
import display from '../../../lib/display.js'

/**
 *
 * @param {Object} props
 * @param {CreateBlock.Block} props.block
 * @param {Presets.PresetHandler} props.presetData
 *
 */
export function basePreset( { block, presetData } ) {
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

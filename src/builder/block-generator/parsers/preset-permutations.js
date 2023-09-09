'use strict'
import _ from 'lodash'
import {
	calculatedPropPrefix,
	logger, magicExpressionMetaDivider, variablePrefix,
} from '../../generator-config.js'
import {
	resolveTemplateStringsRecursively,
	resolveRefsRecursively,
	resolveNestedVariables,
	isObj,
	reducer,
} from '../../../lib/utils.js'
import { filterPropsByKeyPrefix, prefixer } from '../../builder-utils.js'
import { findMagicExpressionsInObj, getPropertyData, parseMagicExpression } from './parser-utils.js'

const { computedProp } = prefixer

export default function parsePresetPermutations( block, presetHandler, presetName ) {
	const { permutation_data, part_visibility } = presetHandler.params

	// Check validity and combine key-value permutations template with permutation values, transform to array of permutations
	Object.entries( permutation_data ).forEach( ( [ currentPreset, permutationConfig ] ) => {
		// This permutation_data key is disabled
		if ( permutationConfig === false ) {
			return
		}

		if ( ! permutationConfig ) {
			logger.error( `Missing permutation data for preset '${ currentPreset }'. To disable permutations for this key, set '${ `$property_name` }:permutations' to 'false'
			return false` )
		}

		const { permutations, template: permutationTemplate } = permutationConfig

		if ( ! permutations ) {
			logger.error( `Missing permutation data for preset '${ currentPreset }' (in 'permutation_data->${ currentPreset }->permutations').`, { permutationTemplate } )
			return
		}

		if ( ! permutationTemplate.block_props ) {
			logger.error( `Missing 'block_props' key in permutation template for preset '${ currentPreset }'.`, { permutationTemplate } )
			return
		}

		Object.entries( permutations ).some( ( [ key, value ] ) => {
			// if(value === false)
			// return false
			if ( value === undefined || value === null ) {
				logger.error( `Missing permutation data for key '${ key }' in 'permutation_data->${ currentPreset }->permutations'. To disable permutations for this key, set '${ `$${ key }` }:permutations' to 'false'.`, { permutationTemplate } )

				delete permutations[ key ]
				return true
			}
			if ( value === false ) {
				delete permutations[ key ]
				return true
			}
			return false
		} )

		// Resolve variables in the template object, but not in block_props yet
		const presetVars = _.cloneDeep( presetHandler.presetVars )
		let template = resolveRefsRecursively( permutationTemplate, presetVars )

		const { block_props: blockProps, ...templateData } = template

		// try {
		template = resolveTemplateStringsRecursively( templateData, { ...presetHandler.presetVars }, { restrictChars: false /* accumulateErrors: true*/ } )
		template.block_props = blockProps
		// }
		// catch ( err ) {
		// 	logger.error( err )
		// }

		const { for_each: forEach, params } = template

		// Resolve for_each if it is an expression
		if ( ! params ) {
			logger.error( `Missing 'params' in permutation template.`, { permutationTemplate } )
			return
		}

		let permutationSets = []
		const permutationVars = {}

		if ( forEach ) {
			if ( ! params[ forEach ] ) {
				logger.error( `Missing value for for_each parameter ('${ forEach }') in params.`, permutationTemplate )
				return
			}

			/** @type {JSO} */
			const forEachProps = isObj( params[ forEach ] )
				? params[ forEach ]
				: { [ forEach ]: params[ forEach ] }

			permutationSets = reducer( forEachProps, ( result, [ forEachKey, forEachItem ] ) => {
				if ( ! permutations[ forEachKey ] ) {
					// logger.error( `Missing permutations data for '${ forEachKey }'!`, { forEachItem } )
					return result
				}

				let paramsData
				if ( typeof forEachItem === 'string' ) {
					const forEachMeta = parseMagicExpression( forEachItem )
					paramsData = presetHandler.getParamByPath( ...forEachMeta.path )

					if ( ! paramsData || ! paramsData.length ) {
						const path = forEachMeta.path.join( '->' )
						logger.error( `The path '${ path }' is invalid.` )
						return result
					}

					params[ forEachKey ] = paramsData
				}

				const permutationData = permutations[ forEachKey ]

				if ( permutationData === false ) {
					return result
				}

				const forEachData = getPropertyData( forEachKey, permutationData )

				const magicExpressions = findMagicExpressionsInObj( template.block_props )

				if ( magicExpressions.length ) {
					for ( let index = 0; index < paramsData.length; index++ ) {
						// Resolve and add %forEach variables
						const forEachCurrent = {
							index,
						}

						permutationVars[ computedProp( `for_each${ magicExpressionMetaDivider }index` ) ] = index

						magicExpressions.forEach( ( expression ) => {
							const meta = parseMagicExpression( expression )

							const paramValue = params[ meta.property ]

							const { dynamicProperty } = meta

							if ( dynamicProperty ) {
								const dynamicKey = forEachCurrent[ dynamicProperty.metaKey ]
								permutationVars[ expression ] = paramValue[ dynamicKey ]
							}
						} )
					}
				}

				result.push( forEachData )

				return result
			}, [] )

			if ( ! permutationSets.length ) {
				return
			}

			const { conditionalConditions } = template

			if ( conditionalConditions ) {
				if ( typeof conditionalConditions === 'string' ) {
					const ccMeta = parseMagicExpression( conditionalConditions )

					if ( ccMeta.dynamicProperty ) {
						const dpData = params[ ccMeta.dynamicProperty.property ]
						const dpMeta = getPropertyData( ccMeta.dynamicProperty.property, dpData )
						const ccData = params[ ccMeta.property ]
						const conditionArr = dpMeta.keys.map( ( key ) => ccData[ key ] )
						template.condition = conditionArr.join( ' && ' )
					}
				}
			}
		}
		else {
			permutationSets = reducer( permutations, ( sets, [ setKey, setValue ] ) => {
				sets.push( {
					key: setKey,
					value: Object.values( setValue ),
				} )
				return sets
			}, [] )
		}

		const _template = { condition: template.condition, block_props: template.block_props }

		const data = {
			// permutationVars,
			source: block.data.source.vars,
			presetVars: presetHandler.presetVars,
			template: filterPropsByKeyPrefix( params, variablePrefix ),
			magicExpressionsInTemplate: findMagicExpressionsInObj( _template ),
		}

		if ( ! permutationSets.length ) {
			logger.error( `Failed to process permutation data, perhaps due to earlier errors.`, { [ currentPreset ]: permutationConfig } )
			return
		}

		const mcPermutations = generateMcPermutations( data, _template, permutationSets )

		if ( mcPermutations && mcPermutations.length ) {
			mcPermutations.forEach(
				( { condition, key, block_props } ) => {
					presetHandler.createPermutation( { condition, block_props, key } )
				}, this,
			)
		}
	} )
}

/**
 * Recursively generate permutations from custom properties.
 *
 * `permutationData` contains sets of permutation data:
 * key-value pairs of property names and an object consting of property values mapped to block properties.
 *
 * One permuation is generated per data item in each in permutation set.
 *
 * Each data item is combined with `permutionTemplate`.
 *
 * The function iterates recursively over `permutationSets` until it is empty.
 *
 * Generated permutations are stored in `permutations`.
 *
 * @param {{ presetVars: JSO<string>, source: JSO<string>, template: JSO<string>, magicExpressionsInTemplate: string[]}} data
 * @param {PresetTemplate.PermutationProps} permutionTemplate
 * @param {MagicExpressionData[]} permutationSets
 * @param {PresetTemplate.PermutationTemplate[]} permutations
 * @param {JSO<number>} indices Matrix of the permutation indices for the properties to iterate over
 */
function generateMcPermutations( data, permutionTemplate, permutationSets, permutations = [], indices = {} ) {
	const template = _.cloneDeep( permutionTemplate )

	// Grab next permutation set in the pipeline
	const currentPermutation = permutationSets.pop()
	const currentProperty = currentPermutation.key
	const permutationValues = currentPermutation.keys ?? currentPermutation.value

	if ( ! permutationValues || ! Array.isArray( permutationValues ) ) {
		logger.error( 'Invalid permutation data - expected an array of type MagicExpressionData.', { permutationValues } )
		return
	}

	// Iterate over permutation set data values
	permutationValues.forEach( ( permutationKeyString, permutationIndex ) => {
		const permutationKey = Number( permutationKeyString )
		const props = currentPermutation.value[ permutationIndex ]

		indices[ currentProperty ] = permutationKey

		const permutationData = _.cloneDeep( template )
		Object.assign( permutationData.block_props, props )

		if ( permutationSets.length ) {
			generateMcPermutations( data, permutationData, _.cloneDeep( permutationSets ), permutations, indices )
		}
		else {
			// Resolve magic vars
			const { magicExpressionsInTemplate } = data

			const magicVars = magicExpressionsInTemplate.reduce( ( result, magicKey ) => {
				const { metaKey, property, dynamicProperty } = parseMagicExpression( magicKey )

				if ( dynamicProperty ) {
					// const v = variables[ property ]
					// const ii = 0
					// !! ???
				}
				else {
					const propertyIndex = indices[ property ]
					const keyData = getPropertyData( property, [], propertyIndex ) // !! Hack
					result[ magicKey ] = keyData[ metaKey ]
				}

				return result
			}, {} )

			// Extract variables
			const permutationVars = filterPropsByKeyPrefix( permutationData.block_props, [ variablePrefix, calculatedPropPrefix ] )

			const vars = _.cloneDeep( {
				...data.presetVars,
				...data.template,
				...data.source,
				...permutationVars,
				...magicVars,
			} )

			// Substitute variables
			try {
				resolveNestedVariables( vars )
				resolveRefsRecursively( permutationData, vars, { mutateSource: true } )
				resolveTemplateStringsRecursively( permutationData, vars, { mutateSource: true, restrictChars: false, accumulateErrors: true } )
			}
			catch ( err ) {
				logger.error( err )
			}

			// Remove variables
			if ( Object( permutationData.block_props ) !== permutationData.block_props ) {
				logger.error( 'Invalid permutation data (block_props): likely an unresolved variable.', permutationData )
				return
			}

			permutations.push( permutationData )
		}
	} )
	return permutations
}

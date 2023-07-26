'use strict'
import _ from 'lodash'
import appData from '../../../app-data.js'
import {
	calculatedPropPrefix,
	logger, magicExpressionMetaDivider, variablePrefix,
} from '../../generator-config.js'
import {
	resolveTemplateStrings,
	resolveTemplateStringsRecursively,
	resolveRefsRecursively,
	resolveNestedVariables,
	reducer,
	isObj,
	kebabToCamelCase,
} from '../../../lib/utils.js'
import { filterPropsByKeyPrefix, mergeProps, stringContainsUnresolvedRef, prefixer, applyActions } from '../../builder-utils.js'
import { BlockTemplateData } from '../data-factories.js'
import { findMagicExpressionsInObj, findMagicKeywordsInString, getPropertyData, mergePresetData, parseMagicExpression } from './parser-utils.js'
import PresetDataHandler from './preset-handler.js'

const { computedProp } = prefixer

/**
 * Process blockData data and inject template snippets.
 *
 * @param {CreateBlock.Block} block
 */
export function parsePresets( block ) {
	const { presets, presetScripts } = appData.generatorData
	const { dir } = block.data.source

	if ( ! dir.apply || ! dir.apply.length ) {
		return
	}

	if ( ! presets ) {
		logger.error(
			`Cannot apply presets: no preset file is loaded.`,
		)
		return
	}

	/**
	 * @type {JSO<{ templates: string[], data: JSO }>}
	 */
	const applyPresets = {}

	// Collect presets to apply
	for ( const presetTemplateData of dir.apply ) {
		compilePresetNames( presetTemplateData, applyPresets )
	}

	// Walk through presets collection
	for ( const [ presetName, data ] of Object.entries( applyPresets ) ) {
		applyPreset( block, presetName, data )
	}
}

function compilePresetNames( presetTemplateData, applyPresets ) {
	const { presets } = appData.generatorData

	if ( ! presetTemplateData ) {
		return
	}

	const presetName = presetTemplateData.preset

	// Template is disabled
	if ( presetTemplateData === false || presetTemplateData?.disabled ) {
		logger.error( `Skipping disabled preset '${ presetName }'.` )
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

	const { parent, templates } = presets[ presetName ]

	if ( templates ) {
		if ( applyPresets[ presetName ] ) {
			const _templates = [ templates ].flat()
			applyPresets[ parent ].templates.push( ..._templates )
			Object.assign( applyPresets[ presetName ].data, presetTemplateData )
		}
		else {
			applyPresets[ presetName ] = {
				templates: [ ...templates, presetName ],
				data: presetTemplateData,
			}
		}
	}
	else if ( parent ) {
		if ( applyPresets[ parent ] ) {
			applyPresets[ parent ].templates.push( presetName )
			Object.assign( applyPresets[ parent ].data, presetTemplateData )
		}
		else {
			applyPresets[ parent ] = {
				templates: [ parent, presetName ],
				data: presetTemplateData,
			}
		}
	}
	else {
		applyPresets[ presetName ] = {
			templates: [ presetName ],
			data: presetTemplateData,
		}
	}
}

/**
 * @param {CreateBlock.Block} block
 * @param {string} presetName
 * @param {JSO} data
 */
function applyPreset( block, presetName, data ) {
	const templateData = { data: {} }

	if ( typeof data.data.config === 'string' ) {
		// !! Non-worky
		// TODO: this code is non-functional
		// Check if a feature variation is requested - and if it exists
		const presetTemplateData = {}
		const { config } = presetTemplateData
		if ( config ) {
			if ( ! ( config in templateData ) ) {
				logger.error(
					`Preset subtype '${ config }' not found in preset '${ presetName }'.`,
				)
				return
			}

			templateData.data = templateData.data[ config ]
		}
	}
	else {
		templateData.data = getTemplateData( data.templates )
	}

	// Check if a handler is specified
	const { handler } = templateData.data

	if ( handler ) {
		const presetTemplate = _.cloneDeep( templateData.data )
		const presetData = PresetDataHandler( block, { presetName, presetTemplate, presetConfig: data.data.config } )

		applyActions(
			{
				block,
				presetHandler: presetData,
				presetName: presetData.name,
			},
			...Object.values( presetPropertyResolvers ),
		)
	}
	else {
		const presetData = BlockTemplateData( templateData.data )
		mergeProps( block.data.source, presetData )
	}
}

/** @type {Presets.TemplateParsers} */
const presetPropertyResolvers = {
	states( { block, presetHandler, presetName } ) {
		const { states } = presetHandler.params

		if ( states ) {
			Object.entries( states ).forEach( ( [ property, values ] ) => {
				if ( values === false ) {
					return
				}
				if ( ! Array.isArray( values ) ) {
					logger.error( `Invalid values (expected an array) for custom state '${ property }' created by preset '${ presetHandler.name }'.`, { values } )
					return
				}

				block.addState( property, values )
			} )
		}

		return { block, presetHandler, presetName }
	},

	/**
	 * Create events. Receives preset directives `@events`, `@event_handlers` and `@properties`.
	 */
	events( { block, presetHandler, presetName } ) {
		const { events, event_handlers: eventHandlers } = presetHandler.params

		if ( ! events || ! Object.keys( events ).length ) {
			return { block, presetHandler, presetName }
		}

		/** @type {JSO<Partial<Events.EventParserData>>} */
		const eventData = {}

		// Parse events data
		reducer( events, ( result, [ eventName, props ] ) => {
			result[ eventName ] ??= { eventName }
			const eventItem = result[ eventName ]

			const magicExpressions = findMagicExpressionsInObj( props )

			const magicData = reducer( magicExpressions, ( vars, [ __, key ] ) => {
				const exprMeta = parseMagicExpression( key )
				let data = presetHandler.getParamByPath( ...exprMeta.path )

				if ( ! data ) {
					data = _.get( props.params, exprMeta.path )
				}

				const propData = getPropertyData( exprMeta.property, data )
				vars[ key ] = propData[ exprMeta.metaKey ]

				presetHandler.setCustomVar( key, propData[ exprMeta.metaKey ] )
				return vars
			}, {} )

			for ( const [ propKey, value ] of Object.entries( props ) ) {
				// Normalize JSON key names
				const property = kebabToCamelCase( propKey )

				if ( magicExpressions.includes( value ) ) {
					eventItem[ property ] = magicData[ value ]
				}
				else if ( typeof value === 'string' ) {
					const magicStrings = findMagicKeywordsInString( value )

					if ( magicStrings.length ) {
						eventItem[ property ] = resolveTemplateStrings( value, magicData, { restrictChars: false } )
					}
					else {
						eventItem[ property ] = value
					}
				}
				else {
					eventItem[ property ] = value
				}
			}

			return result
		}, eventData )

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

		// Create events from prepared data
		Object.values( eventData ).forEach( ( event ) => {
			const { condition, eventName, handler, params } = event

			if ( ! handler ) {
				return
			}

			if ( ! ( handler in eventHandlers ) ) {
				logger.error( `Invalid handler '${ handler }' supplied in preset '${ presetName }'.` )
				return
			}

			const { action } = eventHandlers[ handler ] ?? {}

			if ( ! action ) {
				logger.error( `Problems were found in preset '${ presetName }'. Missing required key in event template: 'action'.` )
				return
			}

			presetHandler.createEvent( { condition, action, eventName, handler, params } )
		} )

		return { block, presetHandler, presetName }
	},

	permutation_data( { block, presetHandler, presetName } ) {
		const { permutation_data, part_visibility } = presetHandler.params

		if ( ! isObj( permutation_data ) || ! Object.keys( permutation_data ).length ) {
			if ( ! part_visibility ) {
				logger.error( `Invalid 'permutations' property for preset '${ presetHandler.name }'.`, { permutation_data } )
			}
			return { block, presetHandler, presetName }
		}

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
							logger.error( `${ forEachMeta.path } not found.` )
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

		return { block, presetHandler, presetName }
	},

	boneVisibility( { block, presetHandler, presetName } ) {
		const { bone_visibility: boneVisibility } = presetHandler.params

		if ( boneVisibility ) {
			block.addBoneVisibility( boneVisibility )
		}

		return { block, presetHandler, presetName }

		if ( ! boneVisibility ) {
			return { block, presetHandler, presetName }
		}

		if ( stringContainsUnresolvedRef( boneVisibility ) ) {
			logger.error( `Unresolved variable in 'bone_visibility' in preset '${ presetName }'!`, { boneVisibility } )
			return
		}

		Object.entries( boneVisibility ).forEach( ( [ property, values ] ) => {
			if ( stringContainsUnresolvedRef( values ) ) {
				logger.error( `Unresolved variable in 'bone_visibility' in preset '${ presetName }'!`, { boneVisibility } )
				return
			}

			if ( ! isObj( values ) ) {
				logger.error( `Invalid data in 'bone_visibility' in preset '${ presetName }'!`, { property, values } )
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
					result[ bone ].push( +key )
				} )
				return result
			}, entries )

			block.data.source.dir.bone_visibility = entries

			// Object.keys( entries || {} ).forEach(
			// 	( bone ) =>
			// 		block.addBoneVisibility( bone, true ),
			// 	// presetHandler.createBoneVisibilityRule( key, value, property ),
			// )
		} )

		return { block, presetHandler, presetName }
	},

	partVisibility( { block, presetHandler, presetName } ) {
		// return { block, presetHandler, presetName }

		const { part_visibility: boneVisibility, part_visibility_conditions } = presetHandler.params

		if ( ! boneVisibility ) {
			return { block, presetHandler, presetName }
		}

		if ( stringContainsUnresolvedRef( boneVisibility ) ) {
			logger.error( `Unresolved variable in 'part_visibility' in preset '${ presetName }'!`, { boneVisibility } )
			return
		}

		if ( ! part_visibility_conditions ) {
			logger.error( `Missing property 'part_visibility_conditions' in preset '${ presetName }'!` )
			return
		}

		Object.entries( boneVisibility ).forEach( ( [ property, values ] ) => {
			if ( stringContainsUnresolvedRef( values ) ) {
				logger.error( `Unresolved variable in 'part_visibility' in preset '${ presetName }'!`, { boneVisibility } )
				return
			}

			if ( ! isObj( values ) ) {
				logger.error( `Invalid data in 'part_visibility' in preset '${ presetName }'!`, { property, values } )
				return
			}

			// ~ Syntax alternatives
			// [1] bone: values[]
			// [2] value: bones[]
			const i = Object.keys( values )[ 0 ]
			const valueBonesSyntax = Number.isInteger( i && +i[ 0 ] )

			if ( ! valueBonesSyntax ) {
				Object.entries( values || {} ).forEach(
					( [ key, value ] ) => presetHandler.createPartVisibilityRule( key, [ value ].flat(), property ),
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
					( [ key, value ] ) => presetHandler.createPartVisibilityRule( key, value, property ),
				)
			}
		} )

		return { block, presetHandler, presetName }
	},
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
		delete source.templates

		// Load the root as the base template
		try {
			target.data = mergePresetData( source, target.data )
		}
		catch ( e ) {
			console.error( e )
		}
		return target
	}, template )

	return template.data
}

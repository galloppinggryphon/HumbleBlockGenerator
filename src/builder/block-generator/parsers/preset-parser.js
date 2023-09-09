'use strict'
import _ from 'lodash'
import appData from '../../../app-data.js'
import {
	calculatedPropPrefix,
	logger, magicExpressionMetaDivider, variablePrefix,
} from '../../generator-config.js'
import {
	resolveTemplateStringsRecursively,
	resolveRefsRecursively,
	resolveNestedVariables,
	reducer,
	isObj,
	kebabToCamelCase,
} from '../../../lib/utils.js'
import { filterPropsByKeyPrefix, mergeProps, stringContainsUnresolvedRef, prefixer, applyActions } from '../../builder-utils.js'
import { findMagicExpressionsInObj, findMagicKeywordsInString, getPropertyData, parseMagicExpression } from './parser-utils.js'
import { prepareTemplateMeta, resolveTemplates } from './preset-utils.js'
import PresetDataHandler from './preset-handler.js'
import { BlockTemplateData } from '../data-factories.js'
import parsePresetPermutations from './preset-permutations.js'

/** @type {Presets.PresetParsers} */
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

	boneVisibility( { block, presetHandler, presetName } ) {
		const { bone_visibility: boneVisibility } = presetHandler.params
		presetHandler.prepareBoneVisibilityRules()
		return { block, presetHandler, presetName }
	},

	/**
	 * Create events. Receives preset directives `@events`, `@event_handlers` and `@properties`.
	 */
	events( { block, presetHandler, presetName } ) {
		presetHandler.prepareEvents()
		return { block, presetHandler, presetName }
	},

	permutations( { block, presetHandler, presetName } ) {
		const { permutation_data } = presetHandler.params

		if ( permutation_data === null ) {
			return { block, presetHandler, presetName }
		}

		if ( ! isObj( permutation_data ) || ! Object.keys( permutation_data ).length ) {
			// if ( ! part_visibility ) {
			// 	logger.error( `Invalid 'permutations' property for preset '${ presetHandler.name }'.`, { permutation_data } )
			// }
			return { block, presetHandler, presetName }
		}

		parsePresetPermutations( block, presetHandler, presetName )

		return { block, presetHandler, presetName }
	},
}

/**
 * Process blockData data and inject template snippets.
 *
 * @param {CreateBlock.Block} block
 */
export function parsePresets( block ) {
	const { presets, presetScripts } = appData.generatorData

	const templates = getBlockPresets( block )

	if ( ! templates ) {
		return
	}

	// Apply presets in order
	for ( const [ presetName, preset ] of Object.entries( templates ) ) {
		const templateData = resolveTemplates( presetName, preset )
		applyPreset( block, templateData, preset.data.config )
	}
}

export function getBlockPresets( block ) {
	const { presets, presetScripts } = appData.generatorData

	if ( ! presets ) {
		logger.error( `Cannot apply presets: no preset file is loaded.` )
		return
	}

	const { dir } = block.data.source

	if ( ! dir.apply || ! dir.apply.length ) {
		return
	}

	/**
	 * @type {JSO<{ templates: string[], data: JSO }>}
	 */
	const presetData = {}

	// Collect presets to apply
	for ( const presetTemplateData of dir.apply ) {
		if ( ! presetTemplateData ) {
			return
		}

		const presetName = presetTemplateData.preset

		// Template is disabled
		if ( presetTemplateData === false || presetTemplateData?.disabled ) {
			logger.error( `Skipping disabled preset '${ presetName }'.` )
			continue
		}

		if ( ! ( presetName in presets ) ) {
			logger.error( `Preset not found: '${ presetName }'.` )
			continue
		}

		// Check if the preset should be disabled
		if ( presetTemplateData.config.disabled === true ) {
			continue
		}

		prepareTemplateMeta( presetTemplateData, presetData )
	}

	return presetData
}

/**
 * @param {CreateBlock.Block} block
 * @param {JSO} templateData
 * @param {JSO} presetConfig
 */
function applyPreset( block, templateData, presetConfig ) {
	const { handler, presetName } = templateData

	// Check if a handler is specified
	if ( handler ) {
		const presetTemplate = _.cloneDeep( templateData )
		const presetData = PresetDataHandler( block, { presetName, presetTemplate, presetConfig } )

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
		const presetData = BlockTemplateData( templateData )
		mergeProps( block.data.source, presetData )
	}
}

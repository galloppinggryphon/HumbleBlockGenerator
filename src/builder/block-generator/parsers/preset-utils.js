'use strict'
import _ from 'lodash'
import appData from '../../../app-data.js'
import {
	logger,
} from '../../generator-config.js'
import { mergeProps, applyActions } from '../../builder-utils.js'
import { BlockTemplateData } from '../data-factories.js'
import { mergePresetData } from './parser-utils.js'
import PresetDataHandler from './preset-handler.js'

/**
 * @param {JSO} presetTemplateData
 * @param {JSO<{ templates: string[], data: JSO }>} applyPresets
 */
export function setupTemplateData( presetTemplateData, applyPresets ) {
	const presetName = presetTemplateData.preset
	const { presets } = appData.generatorData
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
 * @param {string} presetName
 * @param {JSO} templateData
 * @return {JSO}
 */
export function resolveTemplates( presetName, templateData ) {
	const resolvedTemplate = { data: {} }

	if ( typeof templateData.data.config === 'string' ) {
		// !! Non-worky
		// TODO: this code is non-functional
		// Check if a feature variation is requested - and if it exists
		const presetTemplateData = {}
		const { config } = presetTemplateData
		if ( config ) {
			if ( ! ( config in resolvedTemplate ) ) {
				logger.error(
					`Preset subtype '${ config }' not found in preset '${ presetName }'.`,
				)
				return
			}

			resolvedTemplate.data = resolvedTemplate.data[ config ]
		}
	}
	else {
		resolvedTemplate.data = getTemplateData( templateData.templates )
	}

	return resolvedTemplate.data
}

/**
 * @param {CreateBlock.Block} block
 * @param {JSO} templateData
 * @param {JSO} presetConfig
 * @param {JSO} presetPropertyResolvers
 */
export function applyPreset( block, templateData, presetConfig, presetPropertyResolvers ) {
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

/**
 * getTemplateData
 *
 * @param {string[]} presetNames
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

		target.data.presetName = key

		return target
	}, template )

	return template.data
}
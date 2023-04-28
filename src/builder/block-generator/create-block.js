'use strict'
import _ from 'lodash'
import { logger } from '../generator-config.js'
import appData from '../../app-data.js'
import { applyActions, mergeProps, prefixer } from '../builder-utils.js'
import {
	getPermutationName,
	getPermutationTitle,
} from './generator-utils.js'

import { parsePresets } from './parsers/preset-parser.js'
import parseProps from './parsers/props-parser.js'
import { CreateBlockData, Props } from './data-factories.js'

const blockActions = {
	/**
	 * Block title and ID.
	 *
	 * @param {GeneratedBlockData} blockData
	 */
	prepareIdentifiers( blockData ) {
		const { permutationData, block } = blockData
		blockData.identifier = getPermutationName( permutationData.data )
		blockData.title = getPermutationTitle( permutationData.data )
		block.description.identifier = `${ appData.settings.prefix }:${ blockData.identifier }`
		return blockData
	},

	/**
	 * @param {GeneratedBlockData} blockData
	 */
	addScaffolding( blockData ) {
		const { scaffolding } = appData.generatorData
		const template = _.cloneDeep( scaffolding )

		blockData.block = mergeProps( template, {
			'minecraft:block': blockData.block,
		} )

		return blockData
	},
}

/**
 * @param {BlockTemplateData} blockTemplateData
 * @param {CreateBlock.BlockInfo} [blockInfo]
 * @param {PermutationTreeData} [permutationTreeData]
 */
export function CreateBlock( blockTemplateData, blockInfo = undefined, permutationTreeData = undefined ) {
	// const { currentPermutation } = blockTemplateData

	/** @type {CreateBlock.Block} */
	const block = {
		data: CreateBlockData( blockTemplateData, blockInfo ),
		// 	{
		// 	key: currentPermutation.key,
		// 	name: currentPermutation.name,
		// 	fullName: currentPermutation.fullName,
		// 	finalPermutation: permutationMeta.getFinalPermution(),
		// }

		permutationInfo: permutationTreeData,

		/**
		 * Add event to events data store.
		 */
		addEvent( {
			eventName,
			handler,
			action = [],
			condition = undefined,
		} ) {
			this.data.eventTriggers[ eventName ].handler = handler

			if ( condition ) {
				// ! I don't see a need for this to be an array?
				// this.data.eventTriggers[ eventTrigger ].condition ??= []
				// this.data.eventTriggers[ eventTrigger ].condition.push( condition )
				this.data.eventTriggers[ eventName ].condition = condition
			}

			this.data.eventHandlers[ handler ] = {
				sequence: [
					...( this.data.eventHandlers[ eventName ]?.sequence ?? [] ),
					...action,
				],
			}
		},

		addMinecraftPermutation( condition, props ) {
			const { permutations } = this.data

			mergeProps( permutations, {
				[ condition ]: props,
			} )
		},

		addMaterialInstances( newInstances ) {
			const { props } = this.data.source
			Object.assign( props.material_instances, newInstances )
		},

		addPartVisibility( bone, conditions ) {
			const { dir } = this.data.source
			dir.part_visibility = dir.part_visibility ?? {}

			Object.assign(
				dir.part_visibility,
				{ [ bone ]: [] },
				dir.part_visibility,
			)

			const conditionsArr = [ conditions ].flat()
			dir.part_visibility[ bone ].push( ...conditionsArr )
		},

		addProperty( key, values, asInteger = true ) {
			const { props } = this.data.source
			props.properties = props.properties ?? {}

			const _values = asInteger ? values.map( _.toInteger ).sort() : values
			props.properties[ key ] = _values
		},

		/**
		 * Generate blockData JSON from generator data. Called for every final permutation.
		 *
		 * @return {GeneratedBlockData}
		 */
		make() {
			const parsedBlock = parseProps( this )
			const { source, props } = parsedBlock.data

			/** @type {GeneratedBlockData} */
			const blockData = {
				source,
				block: props.export(),
				identifier: undefined,
				title: undefined,
				permutationData: permutationTreeData,
			}

			applyActions(
				blockData,
				blockActions.prepareIdentifiers,
				blockActions.addScaffolding,
			)

			return blockData
		},
	}

	return block
}

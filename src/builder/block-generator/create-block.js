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
 * @param {PermutationBuilder} gData
 */
export function CreateBlock( gData ) {
	const { currentPermutation } = gData.data

	/** @type {CreateBlock.Block} */
	const block = {
		data: CreateBlockData( gData.data.block, {
			key: currentPermutation.key,
			name: currentPermutation.name,
			fullName: currentPermutation.fullName,
			finalPermutation: gData.permutations.getFinalPermution(),
		} ),

		permutationInfo: gData.permutations,

		/**
		 * Add event to events directive in source.
		 */
		addEvent( {
			eventTrigger,
			handler,
			action = [],
			condition = undefined,
		} ) {
			this.data.eventTriggers[ eventTrigger ].handler = handler

			if ( condition ) {
				this.data.eventTriggers[ eventTrigger ].condition ??= []
				this.data.eventTriggers[ eventTrigger ].condition.push( condition )
			}

			this.data.eventHandlers[ handler ] = {
				sequence: [
					...( this.data.eventHandlers[ eventTrigger ]?.sequence ?? [] ),
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
			const data = parseProps( this.data )
			const { source, props } = data

			/** @type {GeneratedBlockData} */
			const blockData = {
				source,
				block: props.export(),
				identifier: undefined,
				title: undefined,
				permutationData: gData.permutations,
			}

			applyActions(
				blockData,
				blockActions.prepareIdentifiers,
				blockActions.addScaffolding,
			)

			return blockData
		},
	}

	// ~ Parse @apply directive ~
	parsePresets( block )

	return block
}

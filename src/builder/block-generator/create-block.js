'use strict'
import _ from 'lodash'
import { logger } from '../generator-config.js'
import { mergeProps, stringContainsUnresolvedRef } from '../builder-utils.js'
import { CreateBlockData } from './data-factories.js'
import { isObj, reducer } from '../../lib/utils.js'

/**
 * @param {BlockTemplateData} blockTemplateData
 * @param {Partial<CreateBlock.BlockInfo>} [blockInfo]
 * @param {PermutationTreeData} [permutationTreeData]
 */
export function CreateBlock( blockTemplateData, blockInfo = {}, permutationTreeData = undefined ) {
	/** @type {CreateBlock.Block} */
	const block = {
		data: CreateBlockData( blockTemplateData, blockInfo ),
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
			const { eventHandlers, eventTriggers } = this.data

			eventTriggers[ eventName ].handler = handler

			if ( condition ) {
				// Add conditions to array, then compile
				const conditions = eventTriggers[ eventName ].condition ? [ eventTriggers[ eventName ].condition, condition ] : [ condition ]

				eventTriggers[ eventName ].condition = conditions.flat()
			}

			this.data.eventHandlers[ handler ] = {
				sequence: [
					...( eventHandlers[ eventName ]?.sequence ?? [] ),
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

		addState( key, values, asInteger = true ) {
			const { props } = this.data.source
			props.states = props.states ?? {}

			const _values = asInteger ? values.map( _.toInteger ).sort() : values
			props.states[ key ] = _values
		},
	}

	return block
}

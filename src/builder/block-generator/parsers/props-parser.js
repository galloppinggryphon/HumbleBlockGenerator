'use strict'
import _ from 'lodash'
import {
	stringHasPrefix,
	reducer,
	recursivePrefixer,
	resolveTemplateStringsRecursively,
	resolveRefsRecursively,
} from '../../../lib/utils.js'
import { logger } from '../../generator-config.js'
import appData from '../../../app-data.js'
import {
	applyActions,
	filterObjByKeys,
	mergeProps,
	removeObjValues,
	sortProps,
} from '../../builder-utils.js'
import { BlockTemplateData } from '../data-factories.js'
import { parseCollisionBox } from './collision-box.js'
import { CreateBlock } from '../create-block.js'

/**
 * @type {PropParsers}
 */
const directiveHandlers = {
	/**
	 * Parse '@events' directive.
	 */
	events( block ) {
		const { dir } = block.data.source

		/** @type {Events.EventDirectives} */
		const dirEvents = dir.events

		if ( ! dirEvents ) {
			return block
		}

		for ( const [ eventHandlerName, eventItem ] of Object.entries( dirEvents ) ) {
			// eventItem may be an action array, without conditions
			if ( Array.isArray( eventItem ) ) {
				block.addEvent( {
					eventName: eventHandlerName,
					handler: eventHandlerName,
					action: eventItem,
				} )
			}
			else {
				const { action, eventName, triggerCondition, target } = eventItem

				block.addEvent( {
					condition: triggerCondition,
					handler: eventHandlerName,
					eventName: eventName ?? eventHandlerName,
					action,
					target,
				} )
			}
		}
		return block
	},

	/**
	 * Parse '@part_visibility' directive.
	 */
	part_visibility( block ) {
		const { props } = block.data
		const { dir } = block.data.source

		if ( ! dir.part_visibility ) {
			return block
		}

		const partVisibility = Object.entries( dir.part_visibility ).reduce(
			( result, [ materialInstance, conditions ] ) => {
				const allConditions = _.uniq( [
					...[ result[ materialInstance ] ?? [] ].flat(),
					...[ conditions ].flat(),
				] )

				result[ materialInstance ] = allConditions.join( ' || ' )
				return result
			},
			props.part_visibility?.conditions ?? {},
		)

		props.part_visibility = { conditions: partVisibility }

		return block
	},

	/**
	 * Parse '@permutations' directive.
	 *
	 * Create indexed permutation objects by condition.
	 */
	permutations( block ) {
		const { source, permutations } = block.data

		if ( ! source.props.permutations ) {
			return block
		}

		source.props.permutations.reduce( ( result, permutationData ) => {
			// Split condition from components
			const { condition, ...rest } = permutationData
			// result[ condition ] = rest?.components ?? rest
			// const permutation = { [condition]: rest?.components ?? rest}
			mergeProps( result, { [ condition ]: rest?.components ?? rest } )

			return result
		}, permutations )

		return block
	},
}

/**
 * @type {PropParsers}
 */
const propHandlers = {
	block_collision( block ) {
		const { source, props } = block.data
		const { block_collision } = source.props

		if ( ! block_collision ) {
			return block
		}

		const BC = parseCollisionBox( source.props, props, 'block_collision' )
		if ( BC ) {
			delete source.props.block_collision
		}

		return block
	},

	selection_box( block ) {
		const { source, props } = block.data
		const { selection_box } = source.props

		if ( ! selection_box ) {
			return block
		}

		if ( parseCollisionBox( source.props, props, 'selection_box' ) ) {
			delete source.props.selection_box
		}

		return block
	},

	/**
	 * @see https://wiki.bedrock.dev/documentation/creative-categories.html#top
	 */
	creative_category( block ) {
		const { props, source } = block.data
		const { creative_category } = source.props
		if ( ! creative_category ) {
			return block
		}

		// const category = { creative_category: props.creative_category ?? {} }
		if ( Object( creative_category ) !== creative_category ) {
			logger.error( `Invalid value for 'creative_category'.`, {
				creative_category,
			} )
			return block
		}

		if ( 'group' in creative_category ) {
			if ( stringHasPrefix( 'itemGroup.name', creative_category.group ) ) {
				logger.notice(
					`Found 'itemGroup.name' prefix in 'creative_category' property. You can omit this prefix, it is added automatically.`,
				)
			}
			else {
				creative_category.group = `itemGroup.name.${ creative_category.group }`
			}

			if ( ! ( 'category' in creative_category ) ) {
				logger.warn(
					`Found 'group' in 'creative_category', but 'category' also required.`,
				)
			}
		}

		delete source.props.creative_category
		props.creative_category = creative_category
		return block
	},

	components( block ) {
		mergeProps(
			block.data.props.components,
			block.data.source.props.components,
			{ overwriteArrays: true },
		)
		return block
	},

	/**
	 * Process events data and add to block.data. Add event handlers to events and event triggers to components.
	 */
	events( block ) {
		const { props, source, extraVars, eventHandlers, eventTriggers } = block.data

		if ( source.props.events ) {
			mergeProps( props.events, source.props.events )
			delete source.props.events
		}

		// Add events from event data
		if ( Object.keys( eventHandlers ).length ) {
			// Resolve any remaining variables
			resolveTemplateStringsRecursively( eventHandlers, extraVars, { mutateSource: true } )
			mergeProps( props.events, eventHandlers )
		}

		// Add event triggers
		if ( Object.keys( eventTriggers ).length ) {
			const triggers = reducer( eventTriggers, ( result, [ event, trigger ] ) => {
				props[ event ] ??= {}

				result[ event ] ??= {}
				result[ event ].event = trigger.handler
				result[ event ].target = trigger.target
				result[ event ].condition = trigger.condition ?? props[ event ].condition

				// ! condition as array disabled
				// const condition = [
				// 	props[ event ].condition ?? [],
				// 	...trigger.condition ?? [],
				// ].flat()

				// if ( condition.length ) {
				// 	result[ event ].condition = condition.join( ' || ' )
				// }

				return result
			}, {} )

			// Resolve any remaining variables
			resolveTemplateStringsRecursively( triggers, extraVars, { mutateSource: true } )

			Object.assign( props, triggers )
		}

		return block
	},

	/**
	 * Process geometry data and add to block.data. Add geometry prefix.
	 */
	geometry( block ) {
		const { props, source } = block.data

		if ( ! source.props.geometry ) {
			return block
		}

		const { geometry } = source.props
		let newGeoVal = geometry

		if ( stringHasPrefix( 'geometry.', geometry ) ) {
			logger.notice(
				`The 'geometry.*' prefix is used in the 'geometry' property. You can omit this prefix, it is added automatically.`,
			)
			newGeoVal = geometry.slice( 9 )
		}

		const { geometryPrefix } = appData.settings
		const geoPrefix =
			typeof geometryPrefix === 'string' ? geometryPrefix : ''

		props.geometry = `geometry.${ geoPrefix + newGeoVal }`
		delete source.props.geometry

		return block
	},

	/**
	 * Add Minecraft block permutations to the 'permutations' section of the block.
	 *
	 * Parse permutations data and do some validity checks.
	 */
	permutations( block ) {
		const { props, source, permutations, extraVars } = block.data

		if ( ! source.props.permutations ) {
			return block
		}

		// Walk through indexed permutation objects, produce array
		props.permutations = Object.entries( permutations ).map(
			( [ condition, permutationProps ] ) => {
				// // Split condition from components
				// const { condition, ...rest } = 'condition' in permutationData.components ? permutationData.components : permutationData

				// const x = CreateBlock()

				const blockPermutation = CreateBlock( BlockTemplateData( permutationProps ), block.data.blockInfo ) // CreateBlockData( BlockTemplateData( permutationProps ), block.data.blockInfo )

				applyActions( blockPermutation, ...Object.values( directiveHandlers.events ) )

				// Permutations only support a subset of props
				const { block_collision, selection_box, components, geometry } = propHandlers

				applyActions(
					blockPermutation,
					block_collision, selection_box, geometry, components,
				)

				// todo: filter should be positive, not negative
				filterObjByKeys( blockPermutation.data.source.props, [
					'permutations',
					'description',
					'creative_category',
				] )

				applyActions( blockPermutation, ...Object.values( propActionHandlers ) )

				// const permutation = applyActions(
				// 	BlockTemplateData( permutationProps ),
				// 	parsePermutationProps,
				// )

				return { ...blockPermutation.data.props, condition }

				// const permutation = parseProps( BlockTemplateData( permutationProps ) )
				// return { ...getPermutationProps( permutation ), condition: condition }
			},
			[],
		)

		// Resolve remaining variables
		resolveTemplateStringsRecursively( props.permutations, extraVars, { mutateSource: true } )

		return block
	},

	properties( block ) {
		const { description } = block.data.props
		const { source } = block.data

		const properties =
			source.props.properties || source.props.description?.properties

		if ( ! properties ) {
			return block
		}

		description.properties = description.properties ?? {}

		const { prefix } = appData.settings

		Object.entries( properties ).reduce( ( result, [ key, values ] ) => {
			if ( typeof values === 'string' ) {
				logger.error( `Encountered an illegal value for the custom property '${ key }', possibly an unresolved variable.`, { [ key ]: values } )
				return result
			}

			// Max definitions = 16
			if ( values.length > 16 ) {
				logger.warn( `Too many values for custom property '${ key }'. Max values = 16.`, { [ key ]: values } )
			}

			// if already prefixed
			if ( /:/.test( key ) ) {
				result[ key ] = values
				return result
			}

			const _key = stringHasPrefix( `${ prefix }:`, key )
				? key
				: `${ prefix }:${ key }`

			if (
				_key in description.properties ||
				_key in description.properties
			) {
				// !!WARNING
			}

			result[ _key ] = values
			return result
		}, description.properties )

		delete source.props.properties
		return block
	},
}

/**
 * @type {PropParsers}
 */
const propActionHandlers = {
	/**
	 * Add static props - Add directly, no processing. Overwrite existing props.
	 */
	addStaticProps( block ) {
		const { props, static: staticProps } = block.data.source
		const staticDataArr = Object.entries( staticProps )

		if ( ! staticDataArr.length ) {
			return block
		}

		mergeProps( props, sortProps( staticProps ) )

		staticDataArr.forEach( ( [ key ] ) => delete staticProps[ key ] )

		return block
	},

	/**
	 */
	addTags( block ) {
		const { props } = block.data
		const { tags } = block.data.source
		props.components = Object.assign( props.components, tags )
		return block
	},

	/**
	 *
	 */
	prefixComponentProps( block ) {
		const { props } = block.data
		if ( props.components && Object.keys( props.components ).length ) {
			props.components = recursivePrefixer(
				props.components,
				'minecraft:',
			)
		}
		return block
	},

	filterNull( block ) {
		const { props } = block.data
		removeObjValues( props, [ null, undefined ] )
		return block
	},
}

/**
 * Compile valid Minecraft properties from template props and prepared data.
 *
 * Called from CreateBlock.make()
 *
 * @param {CreateBlock.Block} block
 */
export default function parseProps( block ) {
	const { extraVars, source } = block.data
	const data = { props: source.props, dir: source.dir }
	const vars = {
		...extraVars,
		...source.vars,
	}

	resolveRefsRecursively( data, vars, { mutateSource: true } )
	resolveTemplateStringsRecursively( data, vars, { mutateSource: true } )

	applyActions(
		block,
		...Object.values( directiveHandlers ),
		...Object.values( propHandlers ),
		...Object.values( propActionHandlers ),
	)

	return block
}

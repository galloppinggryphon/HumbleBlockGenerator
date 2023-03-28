'use strict'
import _ from 'lodash'
import {
	stringHasPrefix,
	log,
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
	hasPrefix,
	mergeProps,
	removeObjValues,
	sortProps,
	unPrefix,
} from '../../builder-utils.js'
import { BlockTemplateData, CreateBlockData } from '../data-factories.js'
import { parseCollisionBox } from './collision-box.js'

/**
 * @type {{
 * 		[directive: string]: (blockData: CreateBlock.Data) => CreateBlock.Data
 * }}
 */
const directiveHandlers = {
	/**
	 * Parse '@events' directive.
	 */
	events( blockData ) {
		const { props } = blockData
		const { dir } = blockData.source

		if ( ! dir.events ) {
			return blockData
		}

		for ( const [ event, eventData ] of Object.entries( dir.events ) ) {
			const { action, ...triggerConfig } = eventData

			// Add event trigger
			props.components[ event ] = {
				...triggerConfig,
				event,
			}

			const actionArr = [ action ].flat()

			// Add event handler & create/append actions array
			_.merge( props.events, {
				[ event ]: {
					sequence: actionArr,
				},
			} )
		}
		return blockData
	},

	/**
	 * Parse '@part_visibility' directive.
	 */
	part_visibility( blockData ) {
		const { props } = blockData
		const { dir } = blockData.source

		if ( ! dir.part_visibility ) {
			return blockData
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

		return blockData
	},

	/**
	 * Parse '@permutations' directive.
	 *
	 * Create indexed permutation objects by condition.
	 */
	permutations( blockData ) {
		const { source, permutations } = blockData

		if ( ! source.props.permutations ) {
			return blockData
		}

		source.props.permutations.reduce( ( result, permutationData ) => {
			// Split condition from components
			const { condition, ...rest } = permutationData
			// result[ condition ] = rest?.components ?? rest
			// const permutation = { [condition]: rest?.components ?? rest}
			mergeProps( result, { [ condition ]: rest?.components ?? rest } )

			return result
		}, permutations )

		return blockData
	},
}

/**
 * @type {{
 * 		[propKey: string]: (blockData: CreateBlock.Data) => CreateBlock.Data
 * }}
 */
const propHandlers = {
	block_collision( blockData ) {
		const { source, props } = blockData
		const { block_collision } = source.props

		if ( ! block_collision ) {
			return blockData
		}

		const BC = parseCollisionBox( source.props, props, 'block_collision' )
		if ( BC ) {
			delete source.props.block_collision
		}

		return blockData
	},

	selection_box( blockData ) {
		const { source, props } = blockData
		const { selection_box } = source.props

		if ( ! selection_box ) {
			return blockData
		}

		if ( parseCollisionBox( source.props, props, 'selection_box' ) ) {
			delete source.props.selection_box
		}

		// parseCollisionBox( selection_box, 'selection_box' )

		// const { origin, size, anchor } = selection_box
		// if ( ! anchor ) {
		// 	return blockData
		// }

		// if ( [ origin, size ].find( ( x ) => ! Array.isArray( x ) ) ) {
		// 	return blockData
		// }

		// try {
		// 	props.selection_box = {
		// 		origin: translateUnitCubeSize( origin, size, anchor ),
		// 		size,
		// 	}
		// }
		// catch ( err ) {
		// 	logger.error( err.message, { selection_box } )
		// }

		// delete source.props.selection_box

		return blockData
	},

	/**
	 * @see https://wiki.bedrock.dev/documentation/creative-categories.html#top
	 */
	creative_category( blockData ) {
		const { props, source } = blockData
		const { creative_category } = source.props
		if ( ! creative_category ) {
			return blockData
		}

		// const category = { creative_category: props.creative_category ?? {} }
		if ( Object( creative_category ) !== creative_category ) {
			logger.error( `Invalid value for 'creative_category'.`, {
				creative_category,
			} )
			return blockData
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
		return blockData
	},

	components( blockData ) {
		mergeProps(
			blockData.props.components,
			blockData.source.props.components,
			{ overwriteArrays: true },
		)
		return blockData
	},

	/**
	 * Process events data and add to blockData. Add events to event handlers and event triggers to components.
	 */
	events( blockData ) {
		const { props, source, extraVars, eventHandlers, eventTriggers } = blockData

		if ( source.props.events ) {
			mergeProps( props.events, source.props.events )
			delete source.props.events
		}

		// Add events from the event registry
		if ( Object.keys( eventHandlers ).length ) {
			// Resolve any remaining variables
			resolveTemplateStringsRecursively( eventHandlers, extraVars, { mutateSource: true } )

			mergeProps( props.events, eventHandlers )
		}

		// If events are defined, automatically add event triggers
		if ( Object.keys( eventTriggers ).length ) {
			const triggers = reducer( eventTriggers, ( result, [ event, trigger ] ) => {
				props[ event ] ??= {}

				result[ event ] ??= {}
				result[ event ].event = trigger.handler
				result[ event ].target = trigger.target

				const condition = [
					props[ event ].condition ?? [],
					...trigger.condition ?? [],
				].flat()

				if ( condition.length ) {
					result[ event ].condition = condition.join( ' || ' )
				}

				return result
			}, {} )

			// Resolve any remaining variables
			resolveTemplateStringsRecursively( triggers, extraVars, { mutateSource: true } )

			Object.assign( props, triggers )
		}

		return blockData
	},

	/**
	 * Process geometry data and add to blockData. Add geometry prefix.
	 *
	 * @param {CreateBlock.Data} blockData
	 */
	geometry( blockData ) {
		const { props, source } = blockData

		if ( ! source.props.geometry ) {
			return blockData
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

		return blockData
	},

	/**
	 * Add Minecraft block permutations to the 'permutations' section of the block.
	 *
	 * Parse permutations data and do some validity checks.
	 *
	 * @param {CreateBlock.Data} blockData
	 */
	permutations( blockData ) {
		const { props, source, permutations, extraVars } = blockData

		if ( ! source.props.permutations ) {
			return blockData
		}

		// Walk through indexed permutation objects, produce array
		props.permutations = Object.entries( permutations ).map(
			( [ condition, permutationProps ] ) => {
				// // Split condition from components
				// const { condition, ...rest } = 'condition' in permutationData.components ? permutationData.components : permutationData

				const permutationData = CreateBlockData( BlockTemplateData( permutationProps ), blockData.blockInfo )

				applyActions( permutationData, ...Object.values( directiveHandlers.events ) )

				// Permutations only support a subset of props
				const { block_collision, selection_box, components, geometry } = propHandlers

				applyActions(
					permutationData,
					block_collision, selection_box, geometry, components,
				)

				// todo: filter should be positive, not negative
				filterObjByKeys( permutationData.source.props, [
					'permutations',
					'description',
					'creative_category',
				] )

				applyActions( permutationData, ...Object.values( propActionHandlers ) )

				// const permutation = applyActions(
				// 	BlockTemplateData( permutationProps ),
				// 	parsePermutationProps,
				// )

				return { ...permutationData.props, condition }

				// const permutation = parseProps( BlockTemplateData( permutationProps ) )
				// return { ...getPermutationProps( permutation ), condition: condition }
			},
			[],
		)

		// Resolve remaining variables
		resolveTemplateStringsRecursively( props.permutations, extraVars, { mutateSource: true } )

		return blockData
	},

	/**
	 * @param {CreateBlock.Data} blockData
	 */
	properties( blockData ) {
		const { description } = blockData.props
		const { source } = blockData

		const properties =
			source.props.properties || source.props.description?.properties

		if ( ! properties ) {
			return blockData
		}

		description.properties = description.properties ?? {}

		const { prefix } = appData.settings

		Object.entries( properties ).reduce( ( result, [ key, values ] ) => {
			// Max definitions = 16
			if ( values.length > 16 ) {
				logger.warn( `Too many values for custom property '${ key }'. Max values = 16.` )
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
		return blockData
	},
}

/**
 * @type {{
 * 		[handler: string]: (blockData: CreateBlock.Data) => CreateBlock.Data
 * }}
 */
const propActionHandlers = {
	/**
	 * Add static props - Add directly, no processing. Overwrite existing props.
	 */
	addStaticProps( blockData ) {
		const { props, static: staticProps } = blockData.source
		const staticDataArr = Object.entries( staticProps )

		if ( ! staticDataArr.length ) {
			return blockData
		}

		mergeProps( props, sortProps( staticProps ) )

		staticDataArr.forEach( ( [ key ] ) => delete staticProps[ key ] )

		return blockData
	},

	/**
	 */
	addTags( blockData ) {
		const { props } = blockData
		const { tags } = blockData.source
		props.components = Object.assign( props.components, tags )
		return blockData
	},

	/**
	 *
	 */
	prefixComponentProps( blockData ) {
		const { props } = blockData
		if ( props.components && Object.keys( props.components ).length ) {
			props.components = recursivePrefixer(
				props.components,
				'minecraft:',
			)
		}
		return blockData
	},

	filterNull( blockData ) {
		const { props } = blockData
		removeObjValues( props, [ null, undefined ] )
		return blockData
	},
}

/**
 * @param {CreateBlock.Data} blockData
 */
export default function parseProps( blockData ) {
	const { extraVars, source } = blockData
	const data = { props: source.props, dir: source.dir }
	const vars = {
		...extraVars,
		...source.vars,
	}

	resolveRefsRecursively( data, vars, { mutateSource: true } )
	resolveTemplateStringsRecursively( data, vars, { mutateSource: true } )

	applyActions(
		blockData,
		...Object.values( directiveHandlers ),
		...Object.values( propHandlers ),
		...Object.values( propActionHandlers ),
	)

	return blockData
}

/**
 * @param {CreateBlock.Data} blockData
 */
function parsePermutationProps( blockData ) {
	applyActions( blockData, ...Object.values( directiveHandlers.events ) )

	// Permutations only support a subset of props
	applyActions(
		blockData,
		// dirHandlers.events,
		// propHandlers.events,
		propHandlers.components,
		propHandlers.geometry,
	)

	// todo: filter should be positive, not negative
	filterObjByKeys( blockData.source.props, [
		'permutations',
		'description',
		'creative_category',
	] )

	applyActions( blockData, ...Object.values( propActionHandlers ) )
	return blockData
}

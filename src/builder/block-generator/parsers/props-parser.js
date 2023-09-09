'use strict'
import _ from 'lodash'
import {
	stringHasPrefix,
	reducer,
	recursivePrefixer,
	resolveTemplateStringsRecursively,
	resolveRefsRecursively,
	isObj,
} from '../../../lib/utils.js'
import { formatVersionCompatibilityTable, logger } from '../../generator-config.js'
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
				const { action, eventName, condition, target } = eventItem

				block.addEvent( {
					condition,
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
	 * Parse '@bone_visibility' directive.
	 *
	 * ! Note !
	 * ~ With MC 1.19.80, `part__visibility` has moved to the `geometry` key and has been renamed `bone_visibility`
	 */
	bone_visibility( block ) {
		return block

		const { dir, props } = block.data.source

		if ( ! dir.bone_visibility ) {
			return block
		}

		// if ( typeof dir.bone_visibility === 'string' ) {
		// 	block.data.source.props.bone_visibility = dir.bone_visibility
		// 	return block
		// }

		// ! Currently unsupported: Conditional bone visibility
		// const boneVisibility = Object.entries( dir.bone_visibility ).reduce(
		// 	( result, [ materialInstance, conditions ] ) => {
		// 		const allConditions = _.uniq( [
		// 			...[ result[ materialInstance ] ?? [] ].flat(),
		// 			...[ conditions ].flat(),
		// 		] )

		// 		result[ materialInstance ] = allConditions.join( ' || ' )
		// 		return result
		// 	},
		// 	{},
		// )

		// Save to block.data. Added to the geometry key later.
		// ! Disabled: block.data.boneVisibility = boneVisibility

		const { bones, visible } = dir.bone_visibility

		const visibleBones = Object.values( visible )
		const boneVisibility = reducer( bones, ( result, [ __, bone ] ) => {
			if ( ! visibleBones.includes( bone ) ) {
				result[ bone ] = false
			}
			// result[ bone ] = visibleBones.includes( bone ) ?? false
			return result
		} )

		props.geometry ??= {}
		props.geometry.bone_visibility = boneVisibility

		return block
	},

	/**
	 * Parse '@part_visibility' directive.
	 *
	 * ! Note: Prior to 1.19.80 !
	 */
	part_visibility( block ) {
		// return block

		const { dir } = block.data.source

		if ( ! dir.part_visibility ) {
			return block
		}

		// ! Currently unsupported: Conditional bone visibility
		const boneVisibility = Object.entries( dir.part_visibility ).reduce(
			( result, [ materialInstance, conditions ] ) => {
				const allConditions = _.uniq( [
					...[ result[ materialInstance ] ?? [] ].flat(),
					...[ conditions ].flat(),
				] )

				result[ materialInstance ] = allConditions.join( ' || ' )
				return result
			},
			{},
		)

		block.data.source.props.part_visibility = {
			conditions: boneVisibility,
		}

		delete dir.part_visibility

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

	render( block ) {
		const { material_instances } = block.data.source.props
		const { render } = block.data.source.dir

		if ( ! render ) {
			return block
		}

		if ( ! material_instances ) {
			logger.notice( "Oops, you've specified render options (with @render), but you're not providing 'material_instances'." )
			return block
		}

		// Add to each instance
		reducer( material_instances, ( result, [ key, value ] ) => {
			if ( isObj( value ) ) {
				Object.assign( result[ key ], render )
			}
			return result
		}, material_instances )

		return block
	},
}

let propHandlerList = []

/**
 * @type {PropParsers}
 */
const propHandlers = {
	collision_box( block ) {
		const { source, props } = block.data
		const { collision_box } = source.props

		if ( ! collision_box ) {
			return block
		}

		if ( typeof collision_box === 'string' ) {
			logger.error( `Invalid value for 'collision_box', must be a number. Is it an unevaluated variable?`, { collision_box } )
			return block
		}

		const collisionBox = parseCollisionBox( source.props, props, 'collision_box' )
		if ( collisionBox ) {
			props.collision_box = collisionBox
			delete source.props.collision_box
		}

		return block
	},

	selection_box( block ) {
		const { source, props } = block.data
		const { selection_box } = source.props

		if ( ! selection_box ) {
			return block
		}

		if ( typeof selection_box === 'string' ) {
			logger.error( `Invalid value for 'selection_box', must be a number. Is it an unevaluated variable?`, { selection_box } )
			return block
		}

		const collisionBox = parseCollisionBox( source.props, props, 'selection_box' )
		if ( collisionBox ) {
			props.selection_box = collisionBox
			delete source.props.selection_box
		}

		return block
	},

	/**
	 * @see https://wiki.bedrock.dev/documentation/creative-categories.html#top
	 */
	menu_category( block ) {
		const { props, source } = block.data
		const { menu_category } = source.props
		if ( ! menu_category ) {
			return block
		}

		// const category = { creative_category: props.creative_category ?? {} }
		if ( Object( menu_category ) !== menu_category ) {
			logger.error( `Invalid value for 'menu_category'.`, {
				menu_category,
			} )
			return block
		}

		if ( 'group' in menu_category ) {
			if ( stringHasPrefix( 'itemGroup.name', menu_category.group ) ) {
				logger.notice(
					`Found 'itemGroup.name' prefix in the 'menu_category.group' property. You can omit this prefix, it is added automatically.`,
				)
			}
			else {
				menu_category.group = `itemGroup.name.${ menu_category.group }`
			}

			if ( ! ( 'category' in menu_category ) ) {
				logger.warn(
					`Found 'group' in 'menu_category', but 'category' also required.`,
				)
			}
		}

		props.description.menu_category = menu_category

		delete source.props.creative_category
		delete source.props.menu_category

		return block
	},

	/**
	 * Merge all remaining source props without processing.
	 *
	 * @param {*} block
	 */
	components( block ) {
		const { components } = block.data.source.props
		const _components = reducer( components, ( result, [ key, value ] ) => {
			if ( ! propHandlerList.includes( key ) ) {
				result[ key ] = value
			}
			return result
		} )

		mergeProps(
			block.data.props.components,
			_components,
			// block.data.source.props.components,
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
				// result[ event ].condition = trigger.condition ?? props[ event ].condition

				// ! condition as array disabled
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

		return block
	},

	/**
	 * Process geometry data and add to block.data. Add geometry prefix.
	 *
	 * ! Note !
	 * ~ With MC 1.19.80, `part__visibility` has moved to the `geometry` key and has been renamed `bone_visibility`
	 *
	 * TODO: Accept geometry object in templates.
	 * ! For now, geometry continues to accept a string.
	 * ~ This function adds `geometry` to the geometry object.
	 *
	 */
	geometry( block ) {
		const { props, source } = block.data

		if ( ! source.props.geometry ) {
			return block
		}

		// ~ Pre 1.19.80 update ~
		if ( typeof source.props.geometry === 'string' ) {
			let geoString = source.props.geometry

			if ( stringHasPrefix( 'geometry.', geoString ) ) {
				logger.notice(
					`The 'geometry.*' prefix was found in the 'geometry' property. You can omit this prefix, it is added automatically.`,
				)
				// geoString = geoString.slice( 9 )
				return block
			}

			const { geometryPrefix } = appData.settings
			const geoPrefix = typeof geometryPrefix === 'string' ? geometryPrefix : ''
			geoString = `geometry.${ geoPrefix + geoString }`

			block.data.props.geometry = geoString
			return block
		}

		const { identifier, bone_visibility } = source.props.geometry ?? {}

		if ( ! identifier ) {
			return block
		}

		let geoString = identifier

		if ( typeof geoString !== 'string' ) {
			return block
		}

		if ( stringHasPrefix( 'geometry.', geoString ) ) {
			logger.notice(
				`The 'geometry.*' prefix was found in the 'geometry' property. You can omit this prefix, it is added automatically.`,
			)
			// geoString = geoString.slice( 9 )
		}
		else {
			const { geometryPrefix } = appData.settings
			const geoPrefix = typeof geometryPrefix === 'string' ? geometryPrefix : ''
			geoString = `geometry.${ geoPrefix + geoString }`
		}

		// Convert from string to object
		props.geometry = {
			bone_visibility,
			identifier: geoString,
		}

		delete source.props.geometry
		delete block.data.boneVisibility

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

				const blockPermutation = CreateBlock( BlockTemplateData( permutationProps ), block.data.blockInfo )

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

				return { ...blockPermutation.data.props, condition }
			},
			[],
		)

		// Resolve remaining variables
		resolveTemplateStringsRecursively( props.permutations, extraVars, { mutateSource: true } )

		return block
	},

	states( block ) {
		const { description } = block.data.props
		const { source } = block.data

		const states =
			source.props.states || source.props.description?.states

		if ( ! states ) {
			return block
		}

		description.states = description.states ?? {}

		const { prefix } = appData.settings

		Object.entries( states ).reduce( ( result, [ key, values ] ) => {
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
				_key in description.states ||
				_key in description.states
			) {
				// !!WARNING
			}

			result[ _key ] = values
			return result
		}, description.states )

		delete source.props.states
		return block
	},
}

propHandlerList = Object.keys( propHandlers )

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
 * Check block template keys for compatibility with configured MC format version, update if possible.
 *
 * @param {CreateBlock.Block} block
 */
function versionCompatibilityCheck( block ) {
	const setDeepValue = ( obj, keys, value ) => {
		const key = keys.shift()
		if ( ! keys.length ) {
			obj[ key ] = value
		}
		else if ( ! obj[ key ] ) {
			obj[ key ] = {}
			setDeepValue( obj[ key ], keys, value )
		}
	}

	const props = block.data.source.props

	reducer( formatVersionCompatibilityTable, ( _block, [ oldKey, newKey ] ) => {
		if ( props[ oldKey ] !== undefined ) {
			if ( typeof newKey === 'string' ) {
				props[ newKey ] = props[ oldKey ]
			}
			else if ( Array.isArray( newKey ) ) {
				setDeepValue( _block, newKey, props[ oldKey ] )
			}

			delete props[ oldKey ]
		}

		return _block
	}, block )

	return block
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
		versionCompatibilityCheck,
		...Object.values( directiveHandlers ),
		...Object.values( propHandlers ),
		...Object.values( propActionHandlers ),
	)

	return block
}

'use strict'
import {
	stringHasPrefix,
	reducer,
	resolveTemplateStringsRecursively,
	objMap,
} from '../../../lib/utils.js'
import { logger } from '../../generator-config.js'
import appData from '../../../app-data.js'
import {
	applyActions,
	filterObjByKeys,
	mergeProps,
} from '../../builder-utils.js'
import { BlockTemplateData } from '../data-factories.js'

/**
 * @type {PropParsers}
 */
const propParsers = {
	collision_box( compiler ) {
		const { source, props } = compiler.block.data
		const { collision_box } = source.props

		if ( ! collision_box ) {
			return compiler
		}

		if ( typeof collision_box === 'string' ) {
			logger.error( `Invalid value for 'collision_box', must be a number. Is it an unevaluated variable?`, { collision_box } )
			return compiler
		}

		const collisionBox = compiler.parseCollisionBox( source.props, 'collision_box' )
		if ( collisionBox ) {
			props.collision_box = collisionBox
			delete source.props.collision_box
		}

		return compiler
	},

	selection_box( compiler ) {
		const { source, props } = compiler.block.data
		const { selection_box } = source.props

		if ( ! selection_box ) {
			return compiler
		}

		if ( typeof selection_box === 'string' ) {
			logger.error( `Invalid value for 'selection_box', must be a number. Is it an unevaluated variable?`, { selection_box } )
			return compiler
		}

		const collisionBox = compiler.parseCollisionBox( source.props, 'selection_box' )
		if ( collisionBox ) {
			props.selection_box = collisionBox
			delete source.props.selection_box
		}

		return compiler
	},

	/**
	 * @see https://wiki.bedrock.dev/documentation/creative-categories.html#top
	 */
	menu_category( compiler ) {
		const { props, source } = compiler.block.data
		const { menu_category } = source.props
		if ( ! menu_category ) {
			return compiler
		}

		// const category = { creative_category: props.creative_category ?? {} }
		if ( Object( menu_category ) !== menu_category ) {
			logger.error( `Invalid value for 'menu_category'.`, {
				menu_category,
			} )
			return compiler
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

		return compiler
	},

	/**
	 * Merge all remaining source props without processing.
	 */
	components( compiler ) {
		const { components } = compiler.block.data.source.props
		const _components = reducer( components, ( result, [ key, value ] ) => {
			// Exclude all props specifically handled by a parser
			if ( ! ( key in propParsers ) ) {
				result[ key ] = value
			}
			return result
		} )

		mergeProps(
			compiler.block.data.props.components,
			_components,
			// compiler.block.data.source.props.components,
			{ overwriteArrays: true },
		)
		return compiler
	},

	/**
	 * Process events data and add to compiler.block.data. Add event handlers to events and event triggers to components.
	 */
	events( compiler ) {
		const { props, source, extraVars, eventHandlers, eventTriggers } = compiler.block.data

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

		return compiler
	},

	/**
	 * Process geometry data and add to compiler.block.data. Add geometry prefix.
	 *
	 * ! Note !
	 * ~ With MC 1.19.80, `part__visibility` has moved to the `geometry` key and has been renamed `bone_visibility`
	 *
	 * TODO: Accept geometry object in templates.
	 * ! For now, geometry continues to accept a string.
	 * ~ This function adds `geometry` to the geometry object.
	 *
	 */
	geometry( compiler ) {
		const { props, source } = compiler.block.data

		if ( ! source.props.geometry ) {
			return compiler
		}

		let geoString

		// ~ Pre 1.19.80 update ~
		if ( typeof source.props.geometry === 'string' ) {
			geoString = source.props.geometry

			if ( stringHasPrefix( 'geometry.', geoString ) ) {
				logger.notice(
					`The 'geometry.*' prefix was found in the 'geometry' property. You can omit this prefix, it is added automatically.`,
				)
				// geoString = geoString.slice( 9 )
				return compiler
			}

			const { geometryPrefix } = appData.settings
			const geoPrefix = typeof geometryPrefix === 'string' ? geometryPrefix : ''
			geoString = `geometry.${ geoPrefix + geoString }`
		}
		else {
			const { identifier } = source.props.geometry ?? {}

			if ( ! identifier ) {
				return compiler
			}

			geoString = identifier

			if ( typeof geoString !== 'string' ) {
				return compiler
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
		}

		props.geometry = {
			identifier: geoString,
		}

		const { boneVisibility } = compiler.block.data
		if ( boneVisibility ) {
			resolveTemplateStringsRecursively( boneVisibility, compiler.block.data.extraVars, { mutateSource: true } )
			props.geometry.bone_visibility = compiler.block.data.boneVisibility
		}
		else {
			const { bone_visibility } = source.props.geometry ?? {}
			props.geometry.bone_visibility = bone_visibility
			// todo: props.bone_visibility
		}

		delete source.props.geometry
		delete compiler.block.data.boneVisibility

		return compiler
	},

	/**
	 * Add Minecraft compiler.block permutations to the 'permutations' section of the compiler.block.
	 *
	 * Parse permutations data and do some validity checks.
	 */
	permutations( compiler ) {
		const { props, permutations, extraVars } = compiler.block.data

		if ( ! permutations ) {
			return compiler
		}

		// Walk through indexed permutation objects, produce array
		props.permutations = objMap( permutations,
			( [ condition, permutationProps ] ) => {
				// // Split condition from components
				// const { condition, ...rest } = 'condition' in permutationData.components ? permutationData.components : permutationData

				// const x = CreateBlock()

				const blockPermutation = compiler.newCompiler( permutationProps )

				const { data } = blockPermutation.block

				// const blockPermutation = CreateBlock( BlockTemplateData( permutationProps ), compiler.block.data.blockInfo )

				blockPermutation.compatibilityCheck()

				data.props.permutations = data.source.props.permutations

				const { directiveParsers } = blockPermutation

				// Apply directive handlers and prop handlers
				// Permutations only support a subset of props
				applyActions(
					blockPermutation,
					directiveParsers.events,
					propParsers.collision_box,
					propParsers.selection_box,
					propParsers.geometry,
					propParsers.transformation,
					propParsers.components,
				)

				// todo: filter should be positive, not negative
				filterObjByKeys( data.source.props, [
					'permutations',
					'description',
					'creative_category',
				] )

				blockPermutation.addStaticProps()
				blockPermutation.addTags()
				blockPermutation.filterEmpty()
				blockPermutation.prefixComponentProps()

				return { ...data.props, condition }
			},
		)

		// Resolve remaining variables
		resolveTemplateStringsRecursively( props.permutations, extraVars, { mutateSource: true } )

		return compiler
	},

	states( compiler ) {
		const { description } = compiler.block.data.props
		const { source } = compiler.block.data

		const states =
			source.props.states || source.props.description?.states

		if ( ! states ) {
			return compiler
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
		return compiler
	},

	transformation( compiler ) {
		const { source, props } = compiler.block.data
		const { transformation } = source.props

		if ( ! transformation ) {
			return compiler
		}

		const defaultTransform = {
			rotation: [ 0, 0, 0 ],
			scale: [ 1, 1, 1 ],
			translation: [ 0, 0, 0 ],
		}

		props.transformation = Object.assign( defaultTransform, transformation )

		return compiler
	},
}

export default propParsers

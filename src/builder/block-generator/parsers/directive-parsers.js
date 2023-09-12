'use strict'
import {
	reducer,
	resolveTemplateStringsRecursively,
	isObj,
} from '../../../lib/utils.js'
import { logger } from '../../generator-config.js'
import {
	mergeProps,
} from '../../builder-utils.js'

/**
 * @type {{ [propName: string]: (compiler: CreateBlock.BlockCompiler) => CreateBlock.BlockCompiler; }}
 */
export default {
	/**
	 * Parse '@events' directive.
	 */
	events( compiler ) {
		const { dir } = compiler.block.data.source

		/** @type {Events.EventDirectives} */
		const dirEvents = dir.events

		if ( ! dirEvents ) {
			return compiler
		}

		for ( const [ eventHandlerName, eventItem ] of Object.entries( dirEvents ) ) {
			// eventItem may be an action array, without conditions
			if ( Array.isArray( eventItem ) ) {
				compiler.block.addEvent( {
					eventName: eventHandlerName,
					handler: eventHandlerName,
					action: eventItem,
				} )
			}
			else {
				const { action, eventName, condition, target } = eventItem

				compiler.block.addEvent( {
					condition,
					handler: eventHandlerName,
					eventName: eventName ?? eventHandlerName,
					action,
					target,
				} )
			}
		}
		return compiler
	},

	/**
	 * Parse '@bone_visibility' directive.
	 */
	bone_visibility( compiler ) {
		const { bone_visibility } = compiler.block.data.source.dir

		if ( ! bone_visibility ) {
			return compiler
		}

		const boneVisibility = reducer( bone_visibility, ( result, [ state, boneMap ] ) => {
			reducer( boneMap,
				( boneConditions, [ stateValue, bone ] ) => {
					const boneArr = [ bone ].flat()

					if ( stateValue === '' ) {
						return boneArr.reduce( ( boneData, value ) => {
							boneData[ value ] ??= []
							boneData[ value ].push( false )
							return boneConditions
						}, boneConditions )
					}

					return boneArr.reduce( ( boneData, value ) => {
						boneData[ value ] ??= []
						boneData[ value ].push( `query.block_property('{{prefix}}:${ state }') == ${ stateValue }` )
						return boneData
					}, boneConditions )
				},
				result,
			)

			return result
		}, {} )

		const boneVisibilityCompiled = reducer( boneVisibility, ( boneConditions, [ bone, conditions ] ) => {
			boneConditions[ bone ] = Array.isArray( conditions ) ? conditions.join( ' || ' ) : conditions
			return boneConditions
		}, {} )

		resolveTemplateStringsRecursively( boneVisibilityCompiled, compiler.block.data.extraVars, { mutateSource: true } )

		compiler.block.data.boneVisibility = boneVisibilityCompiled

		return compiler
	},

	/**
	 * Parse '@permutations' directive.
	 *
	 * Create indexed permutation objects by condition.
	 */
	permutations( compiler ) {
		const { source, permutations } = compiler.block.data

		if ( ! source.props.permutations ) {
			return compiler
		}

		source.props.permutations.reduce( ( result, permutationData ) => {
			// Split condition from components
			const { condition, ...rest } = permutationData
			// result[ condition ] = rest?.components ?? rest
			// const permutation = { [condition]: rest?.components ?? rest}
			mergeProps( result, { [ condition ]: rest?.components ?? rest } )

			return result
		}, permutations )

		return compiler
	},

	render( compiler ) {
		const { material_instances } = compiler.block.data.source.props
		const { render } = compiler.block.data.source.dir

		if ( ! render ) {
			return compiler
		}

		if ( ! material_instances ) {
			logger.notice( "Oops, you've specified render options (with @render), but you're not providing 'material_instances'." )
			return compiler
		}

		// Add to each instance
		reducer( material_instances, ( result, [ key, value ] ) => {
			if ( isObj( value ) ) {
				Object.assign( result[ key ], render )
			}
			return result
		}, material_instances )

		return compiler
	},

	rotation( compiler ) {
		const { rotation } = compiler.block.data.source.dir
		const { props } = compiler.block.data.source

		if ( ! rotation ) {
			return compiler
		}

		const transformation = {
			rotation,
		}

		props.transformation ??= {}

		Object.assign( props.transformation, transformation )

		return compiler
	},

	translation( compiler ) {
		const { translation } = compiler.block.data.source.dir
		const { props } = compiler.block.data.source

		if ( ! translation ) {
			return compiler
		}

		const transformation = {
			translation,
		}

		props.transformation ??= {}

		Object.assign( props.transformation, transformation )

		return compiler
	},

	scale( compiler ) {
		const { scale } = compiler.block.data.source.dir
		const { props } = compiler.block.data.source

		if ( ! scale ) {
			return compiler
		}

		const transformation = {
			scale,
		}

		props.transformation ??= {}

		Object.assign( props.transformation, transformation )

		return compiler
	},
}

'use strict'
import {
	directivePrefix,
	directives,
	logger,
	minecraftProps,
	staticPropPrefix,
	variantPrefix,
	variablePrefix,
} from './../generator-config.js'
import { ProxyObj, reducer } from '../../lib/utils.js'
import { sortProps } from '../builder-utils.js'
import {
	filterEmptyChildCollections,
	removeMcPrefix,
} from './generator-utils.js'
import appData from '../../app-data.js'

/**
 * Parse block data and block templates, divide into props, directives, variables and variants/permutations.
 *
 * @param {JSO} data
 * @return {BlockTemplateData}
 */
export function BlockTemplateData( data = {} ) {
	const blockData = {
		dir: {},
		props: {},
		vars: {},
		templateStrings: {},
		variants: {},
		tags: {},
		static: {},
	}

	reducer( data, ( result, [ key, value ] ) => {
		// Directives
		if ( key.substring( 0, 1 ) === directivePrefix ) {
			const _key = key.slice( 1 )
			if ( ! directives.includes( _key ) ) {
				logger.error( `Invalid directive: '${ key }'` )
				return result
			}
			result.dir[ _key ] = value
		}
		// Variables
		else if ( key.slice( 0, 1 ) === variablePrefix ) {
			result.vars[ key ] = value
		}
		// Variants
		else if ( key.slice( 0, variantPrefix.length ) === variantPrefix ) {
			result.variants[ key.slice( variantPrefix.length ).trim() ] = value
		}
		// Static props
		else if ( key.slice( 0, staticPropPrefix.length ) === staticPropPrefix ) {
			result.dir.static = Object.assign( {}, result.dir.static, {
				[ key.slice( staticPropPrefix.length ).trim() ]: value,
			} )
		}
		// Tags
		else if ( key.slice( 0, 4 ) === 'tag:' ) {
			result.tags[ key ] = value
		}
		// Props
		else {
			result.props[ key ] = value
		}

		return result
	}, blockData )

	const props = Props( removeMcPrefix( sortProps( { ...blockData.props } ) ) )

	if ( props.identifier ) {
		logger.notice(
			`Found the 'identifier' property, but this has no effect. Block identifiers are compiled automatically from object keys.`,
		)
		delete props.identifier
	}

	blockData.props = props

	// @ts-ignore
	return blockData
}

/**
 * Props proxy.
 *
 * @template {Props} Data
 * @param {Data} [data]
 * @return {PropsProxy<Data>}
 */
export function Props( data = undefined ) {
	data = data ?? /** @type {any} */ ( {} )
	const proxy = new Proxy( data, {
		/**
		 * @param {JSO} target
		 * @param {string} prop
		 */
		get( target, prop ) {
			const options = {
				filterEmpty() {
					const _data = filterEmptyChildCollections( target, false )
					return Props( _data )
				},
				export() {
					const _data = filterEmptyChildCollections( target, false )
					return Props( _data )
				},
			}

			if ( prop in options ) {
				return options[ prop ]
			}

			if ( prop === 'filterEmpty' ) {
				const _data = filterEmptyChildCollections( target, false )
				return () => Props( _data )
			}
			else if ( prop === 'export' ) {
				const _data = filterEmptyChildCollections( target, false )
				return () => _data
			}
			else if ( minecraftProps.root.includes( prop ) ) {
				if ( ! ( prop in target ) ) {
					target[ prop ] = prop === 'permutations' ? [] : {}
				}
				return target[ prop ]
			}
			else if ( minecraftProps.description.includes( prop ) ) {
				if ( ! target.description ) {
					target.description = {}
				}

				// if ( ! ( prop in target.description ) ) {
				// 	target.description[ prop ] = undefined
				// }
				return target.description[ prop ]
			}

			if ( ! ( 'components' in target ) ) {
				target.components = {}
			}

			return target.components[ prop ]
		},
		/**
		 * @param {JSO} target
		 * @param {string} prop
		 * @param {*} value
		 */
		set( target, prop, value ) {
			// if ( minecraftProps.root.includes( prop ) ) {
			// 	if ( ! ( prop in target ) ) {
			// 		target[ prop ] = prop === 'permutations' ? [] : {}
			// 	}
			// 	return target[ prop ]
			// }

			if ( minecraftProps.root.includes( prop ) ) {
				// const isEmptyObj = Object( value ) === value && ! Object.keys( value ).length
				// if ( ! value || isEmptyObj ) {
				// 	delete target[ prop ]
				// }
				// else {
				target[ prop ] = value
				// }
			}
			else if ( minecraftProps.description.includes( prop ) ) {
				// if(!(prop in target))
				target.description = Object.assign( {}, target.description )
				target.description[ prop ] = value
			}
			else {
				target.components = Object.assign( {}, target.components )
				target.components[ prop ] = value
			}

			return true
		},
		/**
		 * @param {JSO} target
		 * @param {string} prop
		 */
		deleteProperty( target, prop ) {
			if ( minecraftProps.root.includes( prop ) ) {
				delete target[ prop ]
			}
			else if (
				'description' in target &&
				minecraftProps.description.includes( prop )
			) {
				delete target.description[ prop ]
			}
			else if ( 'components' in target ) {
				delete target.components[ prop ]
			}
			return true
		},
	} )

	return /** @type {any} */ ( proxy )
}

/**
 * @param {BlockTemplateData} source
 * @param {Partial<CreateBlock.BlockInfo>} blockInfo
 * @return {CreateBlock.Data}
 */
export function CreateBlockData( source, blockInfo ) {
	/** @type {CreateBlock.ExtraVars} */
	const extraVars = {
		prefix: appData.settings.prefix,
		permutation: blockInfo.finalPermutation,
		variant: blockInfo.finalPermutation,
		material: blockInfo.key,
		blockName: blockInfo.fullName,
	}

	return {
		blockInfo,
		extraVars,
		source: {
			...source,
			props: Props( source.props ),
		},
		props: Props(),
		permutations: ProxyObj( {} ),
		eventTriggers: ProxyObj( {} ),
		eventHandlers: {},
	}
}

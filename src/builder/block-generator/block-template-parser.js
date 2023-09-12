'use strict'
import _ from 'lodash'
import appData from '../../app-data.js'

import {
	arrayMerge,
	isObj,
	log,
	resolveTemplateStringsRecursively,
	resolveRefsRecursively,
	reducer,
	objHasOwn,
} from '../../lib/utils.js'

import { mergeProps } from '../builder-utils.js'
import {
	getPermutationName,
	isAnonymousPermutationBranch,
	replaceValues,
	validatePermutationName,
} from './generator-utils.js'

import { logger } from '../generator-config.js'

import { CreateBlock } from './create-block.js'
import { MaterialBuilder } from './parsers/material-parser.js'
import { BlockPermutationData, BlockTemplateData } from './data-factories.js'
import { parsePresets } from './parsers/preset-parser.js'
import { BlockCompiler } from './block-compiler.js'

/**
 * Block template parser factory.
 *
 * @param {JSO} blockTemplate
 */
export default function BlockTemplateParser( blockTemplate ) {
	/**
	 * Block parser.
	 *
	 * @type {BlockParser.PermutationBuilder}
	 */
	// @ts-ignore
	const dataHandlers = {
		get permutations() {
			const { data } = this
			return {
				get data() {
					return data.permutationInfo
				},
				get path() {
					return data.permutationInfo.map( ( p ) => p.key )
				},
				getFinalPermution( includeMaterialPermutations = false ) {
					if ( ! data.permutationInfo || ! data.permutationInfo.length ) {
						logger.error( 'Missing material permutations!' )
						return
					}

					return includeMaterialPermutations
						? data.permutationInfo.at( -1 ).key
						: data.permutationInfo.filter( ( p ) => p.type !== 'material' ).at( -1 ).key
				},
			}
		},

		mergeTemplateData( templateData ) {
			const { block } = this.data

			// Pre-process presets and handle merge
			this.mergePresetSettings( templateData.dir )

			// Variables should overwrite
			if ( Object.keys( templateData.vars ).length ) {
				Object.assign( block.vars, templateData.vars )
			}

			// Resolve variables in new data
			resolveRefsRecursively( templateData.dir, block.vars, { mutateSource: true } )

			// Merge most template data categories now
			mergeProps( block.dir, templateData.dir )
			mergeProps( block.tags, templateData.tags )

			// Static props should not be processed
			mergeProps( block.static, templateData.static, {
				overwriteTarget: true,
			} )

			// Add data to material handler
			this.materials.extractMaterials( templateData )

			// Component arrays must overwrite arrays in target, NOT merge
			const { components, ...rest } = templateData.props
			mergeProps( block.props, rest )
			mergeProps( block.props.components, components, {
				overwriteArrays: true,
			} )
		},

		mergeProps( obj ) {
			mergeProps( this.data.block.props, obj )
		},

		exportdata() {
			const generatorData = this.export()
			const { currentPermutation } = generatorData.data

			/** @type {CreateBlock.BlockInfo} */
			const blockInfo = {
				key: currentPermutation.key,
				name: currentPermutation.name,
				fullName: currentPermutation.fullName,
				finalPermutation: generatorData.permutations.getFinalPermution(),
			}

			return [ generatorData.data.block, blockInfo, generatorData.permutations ]
		},

		createBlock() {
			const generatorData = this.export()
			const { currentPermutation } = generatorData.data

			/** @type {CreateBlock.BlockInfo} */
			const blockInfo = {
				key: currentPermutation.key,
				name: currentPermutation.name,
				fullName: currentPermutation.fullName,
				finalPermutation: generatorData.permutations.getFinalPermution(),
			}

			const block = CreateBlock( generatorData.data.block, blockInfo, generatorData.permutations )
			const compiler = BlockCompiler( block )
			const output = compiler.compile()
			return output
		},

		isValid() {
			return this.data.currentPermutation.isValid
		},

		hasPermutations() {
			return !! Object.keys( this.children ).length
		},

		getPermutations() {
			const permutations = Object.entries( this.children )
			return permutations
		},

		setPermutationData( { key, title = undefined, type = undefined } ) {
			const { data } = this

			type = type || 'default'

			if ( title === undefined ) {
				title = ! isAnonymousPermutationBranch( key ) ? key : title
			}

			title = ( resolveRefsRecursively( { title }, data.block.vars, { removeMissing: false, resolveNestedVars: true } ) ?? {} ).title

			title = ( resolveTemplateStringsRecursively(
				{ title },
				data.block.vars,
				{
					restrictChars: false,
				},
			) ?? {} ).title

			data.permutationInfo.push( { key, title, type } )
			data.currentPermutation.key = key
			data.currentPermutation.name = getPermutationName( data.permutationInfo, '.' )
			data.currentPermutation.fullName = `${ appData.settings.prefix }:${ getPermutationName( data.permutationInfo ) }`
		},

		newPermutation( permutationKey, blockTemplateData ) {
			const { variants, ...templateData } =
				BlockTemplateData( blockTemplateData )

			const permutation = this.copyPermutationData()
			permutation.children = variants

			const { title, type, export: enabled } = templateData.dir

			// ~ Skip this permutation if export is disabled
			if ( enabled === false ) {
				log( `${ permutationKey }: Skipped (@export = false)` )
				permutation.disablePermutation()
				return permutation
			}

			if (
				permutation.permutations.path.length === 0 &&
				! validatePermutationName( permutationKey )
			) {
				permutation.disablePermutation()
				logger.error(
					`Invalid root key: '${ permutationKey }'. Processing of this block is skipped.`,
				)
				return permutation
			}

			// ~ No invalid permutation name
			else if (
				permutationKey &&
				! validatePermutationName( permutationKey ) &&
				! isAnonymousPermutationBranch( permutationKey )
			) {
				permutation.disablePermutation()
				logger.error(
					`Invalid permutation key: '${ permutationKey }'. Processing of this branch is skipped.`,
				)
				return permutation
			}

			permutation.mergeTemplateData( templateData )

			permutation.setPermutationData( { key: permutationKey, title, type } )
			logger.setLabel( permutation.permutations.path.join( '.' ) )

			return permutation
		},

		disablePermutation() {
			this.data.currentPermutation.isValid = false
		},

		/**
		 * Process @apply. Can be either array or object
		 * Pre-process objects and convert to Array
		 *
		 * @param {JSO} dir
		 */
		mergePresetSettings( dir ) {
			if ( ! ( 'apply' in dir ) ) {
				return
			}

			const { block } = this.data

			block.dir.apply ??= []

			const presets = Array.isArray( dir.apply )
				? dir.apply.map( ( params ) => {
					const { preset, name, disable, ...rest } = params
					return {
						preset,
						config: Object.keys( rest ).length ? rest : {},
						name: name ?? disable,
						disable: disable ?? false,
					}
				} )
				: reducer( dir.apply, ( result, [ preset, params ] ) => (
					result.push( {
						preset,
						config: params,
						name: params?.name ?? ( preset ?? params?.disable ),
						disable: params?.disable ?? false,
					} ),
					result
				), [] )

			presets.reduce( ( blockPresets, presetData ) => {
				const { preset, disable, name = null } = presetData

				const foundPreset = blockPresets.findIndex( ( existingPreset ) => {
					if ( existingPreset.name === disable ) {
						existingPreset.config = null
						existingPreset.disable = true
						return true
					}

					if ( ( existingPreset.preset === preset || ! existingPreset.preset ) && existingPreset.name === name ) {
						if ( ! presetData.config ) {
							existingPreset.config = null
						}
						else {
							mergeProps( existingPreset.config, presetData.config )
						}

						return true
					}
				} )

				if ( foundPreset >= 0 ) {
					if ( blockPresets[ foundPreset ].disable ) {
						blockPresets.splice( foundPreset, 1 )
					}
				}
				else {
					blockPresets.push( presetData )
				}

				return blockPresets
			}, block.dir.apply )

			dir.apply = []
		},

		eachMaterialPermutation() {
			return this.data.materialPermutations
		},

		parseMaterials() {
			this.materials.generatePermutations()

			// // @ts-ignore
			// const permutations = parseMaterialDirectives( this )
			this.data.materialPermutations = this.data.materialPermutations.length ? this.data.materialPermutations : [ this ]
			// 	permutations || /** @type {any} */ ( [ this ] )
		},
	}

	const proxyHandlers = {
		get( target, prop, receiver ) {
			if ( [ 'children', 'copyPermutationData', 'export', 'data', 'materials' ].includes( prop ) ) {
				return Reflect.get( target, prop, receiver )
			}

			if ( objHasOwn( target.handlers, prop ) ) {
				return Reflect.get( target.handlers, prop, receiver )
			}

			// throw new Error( `Invalid proxy key: ${ prop }` )

			return Reflect.get( target, prop, receiver )
		},
		set( target, prop, value ) {
			// if ( target.data === null ) {
			// 	target[ prop ] = value
			// 	return true
			// }

			if ( [ 'children', 'materials' ].includes( prop ) ) {
				target[ prop ] = value
			}

			if ( objHasOwn( target.data, prop ) ) {
				target.data[ prop ] = value
			}
			return true
		},
		ownKeys( target ) {
			return [ 'data', ...Reflect.ownKeys( target.handlers ) ]
		},
	}

	/**
	 * Permutation proxy factory
	 *
	 * @param {Object} props
	 * @param {BlockParser.PermutationBuilder} [props.prevBuilder]
	 * @param {JSO} [props.children]
	 * @param {boolean} [props.exportData]
	 *
	 * TODO: initial lower case
	 */
	const createPermutationHandler = ( { prevBuilder, children = {}, exportData = false } ) => {
		/** @type {Partial<BlockParser.PermutationBuilderProxy>} */
		const proxyData = {}

		/** @type {BlockParser.PermutationBuilder} */
		const proxy = new Proxy( proxyData, proxyHandlers )
		const data = BlockPermutationData( prevBuilder?.data, exportData )
		const materials = MaterialBuilder( proxy, _.cloneDeep( prevBuilder?.materials.data ) )

		Object.assign( proxyData, {
			data,
			children,
			handlers: /** @type {BlockParser.PermutationBuilderHandlers} */ ( dataHandlers ),
			materials,
			copyPermutationData() {
				return createPermutationHandler( { prevBuilder: proxy } )
			},
			export() {
				return createPermutationHandler( { prevBuilder: proxy, exportData: true } )
			},
		} )

		return proxy
	}

	return createPermutationHandler( { children: blockTemplate } )
}
